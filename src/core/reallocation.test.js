import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeOMDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas et solde OM de test
import { creerTypeBudget } from "./types-budget.js"; // Types
import { creerBudget } from "./budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense, modifierOperation, supprimerOperation, soldeAllocation, resumeBudgets } from "./allocations.js"; // Allocation
import { lancerAllocationPeriode, transfererEntreBudgets } from "./reallocation.js"; // Fonctions à tester
import { listerTransactions } from "./transactions.js"; // Transactions
import { ErreurValidation, ErreurMetier } from "./erreurs.js"; // Erreurs

let base; // Base utilisée par les cas de test
let typeId; // Type de budget disponible
const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Date locale (indépendante du fuseau de la machine)
const SEPTEMBRE = local(2026, 9, 25); // Période du 20/09 au 19/10
const OCTOBRE = local(2026, 10, 25); // Période du 20/10 au 19/11

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  await ajouterSoldeOMDeTest(base); // Solde OM très grand : ces tests ne vérifient pas la limite du solde OM
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

// Crée un budget avec des valeurs par défaut modifiables.
const nouveauBudget = (surcharges = {}) => creerBudget(base, { name: "Loisirs", typeId, montantBudget: 100000, montantMax: 200000, montantMin: 0, soldeAlert: 10000, autogenFinMois: true, ...surcharges }); // Création
// Dépense à une date donnée.
const depenser = (budgetId, montant, quand) => enregistrerDepense(base, { budgetId, montant, dateOperation: quand.toISOString() }, quand); // Dépense
// Solde de la période en cours d'un budget.
const soldeEnCours = async (budgetId, quand = OCTOBRE) => (await resumeBudgets(base, quand)).find((r) => r.budget.id === budgetId)?.allocation?.solde ?? null; // Solde ou null

describe("lancerAllocationPeriode : report du reliquat", () => { // Report
  it("exemple du cahier des charges : 100 000 alloués, 60 000 dépensés -> 140 000 le mois suivant", async () => { // Cas de référence
    const id = await nouveauBudget(); // Budget 100 000 / mois
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Allocation de septembre
    await depenser(id, 60000, SEPTEMBRE); // 60 000 dépensés
    const { periode, resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Lance la période d'octobre
    expect(periode).toEqual({ dateFrom: "2026-10-20", dateTo: "2026-11-19" }); // Période d'octobre
    expect(resultats[0]).toMatchObject({ statut: "alloue", reliquatReporte: 40000, montantAlloue: 100000, soldeApres: 140000, depassePlafond: false }); // 40 000 reportés + 100 000
    expect(await soldeEnCours(id)).toBe(140000); // Solde d'octobre
  }); // Fin du cas

  it("écrit le report en deux lignes visibles et ramène l'ancienne période à zéro", async () => { // Deux lignes
    const id = await nouveauBudget(); // Budget
    const septembre = (await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE)).allocationId; // Allocation de septembre
    await depenser(id, 60000, SEPTEMBRE); // Dépense
    await lancerAllocationPeriode(base, OCTOBRE); // Lance octobre
    expect(await soldeAllocation(base, septembre)).toBe(0); // L'ancienne période retombe à 0
    const reports = await listerTransactions(base, { nature: "mouvements" }); // Lignes de report
    expect(reports).toHaveLength(2); // Deux lignes
    expect(reports.map((t) => [t.debitCredit, t.montant, t.nature]).sort()).toEqual([[-1, 40000, "report"], [1, 40000, "report"]]); // Une sortie et une entrée de 40 000
    expect(reports.find((t) => t.debitCredit === -1).note).toMatch(/Report vers la période du 20\/10\/2026/); // Note de la sortie
    expect(reports.find((t) => t.debitCredit === 1).note).toMatch(/Report de la période du 20\/09\/2026/); // Note de l'entrée
    expect(reports.every((t) => /^RPT-/.test(t.trxId))).toBe(true); // Identifiants de report
  }); // Fin du cas

  it("est idempotente : relancer ne duplique rien", async () => { // Idempotence
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(id, 60000, SEPTEMBRE); // Dépense
    await lancerAllocationPeriode(base, OCTOBRE); // Premier lancement
    const avant = await listerTransactions(base); // Transactions après le premier lancement
    const second = await lancerAllocationPeriode(base, OCTOBRE); // Second lancement
    expect(second.resultats[0]).toMatchObject({ statut: "deja", soldeApres: 140000 }); // Rien à faire
    expect(await listerTransactions(base)).toEqual(avant); // Aucune transaction ajoutée
    await lancerAllocationPeriode(base, OCTOBRE); // Troisième lancement
    expect(await listerTransactions(base)).toHaveLength(avant.length); // Toujours rien
  }); // Fin du cas

  it("tient à jour le total alloué (montant_alloue = reliquat + montant mensuel)", async () => { // montant_alloue
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(id, 60000, SEPTEMBRE); // Dépense
    await lancerAllocationPeriode(base, OCTOBRE); // Octobre
    const lignes = await base.requeter("SELECT date_from, montant_alloue FROM allocation_budget ORDER BY date_from"); // Relit les allocations
    expect(lignes.map((l) => l.montant_alloue)).toEqual([100000, 140000]); // Septembre inchangé, octobre = 140 000
  }); // Fin du cas

  it("signale un plafond dépassé sans tronquer le montant", async () => { // Plafond
    const id = await nouveauBudget({ montantBudget: 100000, montantMax: 120000 }); // Plafond 120 000
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(id, 60000, SEPTEMBRE); // Reste 40 000
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Octobre
    expect(resultats[0]).toMatchObject({ soldeApres: 140000, depassePlafond: true }); // 140 000 > 120 000, signalé
    expect(await soldeEnCours(id)).toBe(140000); // Montant non tronqué
    expect((await resumeBudgets(base, OCTOBRE))[0].depassePlafond).toBe(true); // Visible dans le résumé
  }); // Fin du cas

  it("alloue simplement le montant mensuel quand il n'y a pas de reliquat", async () => { // Sans reliquat
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(id, 100000, SEPTEMBRE); // Tout dépensé
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Octobre
    expect(resultats[0]).toMatchObject({ statut: "alloue", reliquatReporte: 0, soldeApres: 100000 }); // Seulement 100 000
    expect(await listerTransactions(base, { nature: "mouvements" })).toHaveLength(0); // Aucune ligne de report
  }); // Fin du cas

  it("alloue un budget qui n'a jamais été alloué", async () => { // Premier lancement
    const id = await nouveauBudget(); // Budget neuf
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Octobre
    expect(resultats[0]).toMatchObject({ statut: "alloue", soldeApres: 100000 }); // 100 000
    expect(await soldeEnCours(id)).toBe(100000); // Solde
  }); // Fin du cas

  it("reporte seulement quand le montant mensuel est nul", async () => { // Montant mensuel nul
    const id = await nouveauBudget({ montantBudget: 0 }); // Budget sans montant mensuel
    await allouerBudget(base, { budgetId: id, montant: 30000 }, SEPTEMBRE); // Allocation manuelle en septembre
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Octobre
    expect(resultats[0]).toMatchObject({ statut: "reporte", reliquatReporte: 30000, montantAlloue: 0, soldeApres: 30000 }); // Seulement le report
  }); // Fin du cas

  it("ignore un budget sans montant mensuel et sans reliquat", async () => { // Rien à faire
    await nouveauBudget({ montantBudget: 0 }); // Budget sans montant
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Octobre
    expect(resultats[0].statut).toBe("ignore"); // Ignoré
    expect((await base.requeter("SELECT COUNT(*) AS n FROM allocation_budget"))[0].n).toBe(0); // Aucune allocation créée
  }); // Fin du cas

  it("refuse (sans rien écrire) si le solde reste sous le minimum du budget", async () => { // Minimum
    const id = await nouveauBudget({ montantBudget: 10000, montantMin: 50000 }); // Minimum 50 000 > 10 000
    await allouerBudget(base, { budgetId: id, montant: 60000 }, SEPTEMBRE); // Septembre (60 000 >= minimum)
    await depenser(id, 60000, SEPTEMBRE); // Tout dépensé : reliquat 0
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Octobre : 0 + 10 000 < 50 000
    expect(resultats[0].statut).toBe("refuse"); // Refusé
    expect(resultats[0].raison).toMatch(/Minimum non atteint/); // Explication
    expect(await soldeEnCours(id)).toBeNull(); // Rien d'écrit pour octobre
  }); // Fin du cas

  it("compte le reliquat reporté pour le minimum", async () => { // Minimum et reliquat
    const id = await nouveauBudget({ montantBudget: 10000, montantMin: 50000 }); // Minimum 50 000
    await allouerBudget(base, { budgetId: id, montant: 60000 }, SEPTEMBRE); // Septembre
    await depenser(id, 20000, SEPTEMBRE); // Reste 40 000
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // 40 000 + 10 000 = 50 000 >= minimum
    expect(resultats[0]).toMatchObject({ statut: "alloue", soldeApres: 50000 }); // Accepté
  }); // Fin du cas

  it("respecte l'option « seulement les budgets automatiques »", async () => { // Option
    const auto = await nouveauBudget({ name: "Auto", autogenFinMois: true }); // Budget automatique
    await nouveauBudget({ name: "Manuel", autogenFinMois: false }); // Budget manuel
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE, { seulementAuto: true }); // Seulement les automatiques
    expect(resultats.map((r) => r.nom)).toEqual(["Auto"]); // Un seul traité
    expect(await soldeEnCours(auto)).toBe(100000); // Il est alloué
    expect((await resumeBudgets(base, OCTOBRE)).find((r) => r.budget.name === "Manuel").allocation).toBeNull(); // L'autre non
  }); // Fin du cas

  it("traite tous les budgets par défaut", async () => { // Option par défaut
    await nouveauBudget({ name: "Auto", autogenFinMois: true }); // Automatique
    await nouveauBudget({ name: "Manuel", autogenFinMois: false }); // Manuel
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Tous
    expect(resultats.map((r) => r.statut)).toEqual(["alloue", "alloue"]); // Les deux alloués
  }); // Fin du cas

  it("n'ajoute pas de montant mensuel si le budget est déjà alloué à la main, mais reporte quand même", async () => { // Allocation manuelle déjà faite
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(id, 60000, SEPTEMBRE); // Reste 40 000
    await allouerBudget(base, { budgetId: id, montant: 70000 }, OCTOBRE); // Allocation manuelle d'octobre
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Lance octobre
    expect(resultats[0]).toMatchObject({ statut: "reporte", reliquatReporte: 40000, montantAlloue: 0, soldeApres: 110000 }); // 70 000 + 40 000, pas de montant mensuel en plus
  }); // Fin du cas

  it("reporte aussi un reliquat de plusieurs périodes en arrière (mois sauté)", async () => { // Mois sauté
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 50000 }, local(2026, 8, 25)); // Allocation d'août
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Lance octobre (septembre sauté)
    expect(resultats[0]).toMatchObject({ reliquatReporte: 50000, soldeApres: 150000 }); // 50 000 + 100 000
    expect((await base.requeter("SELECT COUNT(*) AS n FROM allocation_budget"))[0].n).toBe(2); // Août et octobre
  }); // Fin du cas

  it("reporte de nouveau si une dépense d'une ancienne période est supprimée après coup", async () => { // Régularisation
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    const depense = (await depenser(id, 60000, SEPTEMBRE)).idTransaction; // Dépense de septembre
    await lancerAllocationPeriode(base, OCTOBRE); // Report de 40 000
    await supprimerOperation(base, depense); // On supprime la dépense de septembre : 60 000 réapparaissent
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Relance
    expect(resultats[0]).toMatchObject({ statut: "reporte", reliquatReporte: 60000, soldeApres: 200000 }); // 140 000 + 60 000
    expect((await lancerAllocationPeriode(base, OCTOBRE)).resultats[0].statut).toBe("deja"); // Puis plus rien à faire
  }); // Fin du cas

  it("ne permet plus de dépenser sur une ancienne période une fois le reliquat reporté", async () => { // Période figée
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(id, 60000, SEPTEMBRE); // Dépense
    await lancerAllocationPeriode(base, OCTOBRE); // Report : septembre à 0
    await expect(depenser(id, 1000, local(2026, 10, 1))).rejects.toThrow(/Solde insuffisant/); // Dépense datée de septembre refusée
  }); // Fin du cas

  it("les lignes de report ne sont ni modifiables ni supprimables", async () => { // Lecture seule
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(id, 60000, SEPTEMBRE); // Dépense
    await lancerAllocationPeriode(base, OCTOBRE); // Report
    for (const t of await listerTransactions(base, { nature: "mouvements" })) { // Pour chaque ligne de report
      await expect(supprimerOperation(base, t.id)).rejects.toThrow(/généré par l'application/); // Suppression refusée
      await expect(modifierOperation(base, t.id, { montant: 1, dateOperation: OCTOBRE.toISOString() }, OCTOBRE)).rejects.toThrow(ErreurMetier); // Modification refusée
    } // Fin de la boucle
  }); // Fin du cas

  it("le résumé ne compte pas le report comme une dépense", async () => { // Libellés du résumé
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(id, 60000, SEPTEMBRE); // Dépense
    await lancerAllocationPeriode(base, OCTOBRE); // Report
    expect((await resumeBudgets(base, OCTOBRE))[0].allocation).toMatchObject({ alimente: 140000, depense: 0, sorties: 0, solde: 140000 }); // Octobre : report compté en entrée
  }); // Fin du cas
}); // Fin du groupe

describe("transfererEntreBudgets (réallocation manuelle)", () => { // Transferts
  let a; // Budget source alloué de 100 000
  let b; // Budget destination alloué de 20 000
  beforeEach(async () => { // Avant chaque cas
    a = await nouveauBudget({ name: "A", montantMax: 150000 }); // Budget A
    b = await nouveauBudget({ name: "B", montantBudget: 20000, montantMax: 50000, montantMin: 0 }); // Budget B (plafond 50 000)
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // A : 100 000
    await allouerBudget(base, { budgetId: b, montant: 20000 }, OCTOBRE); // B : 20 000
  }); // Fin de la préparation

  it("déplace le montant d'un budget à l'autre en deux lignes visibles", async () => { // Cas nominal
    const r = await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 30000, note: "Urgence" }, OCTOBRE); // Transfert de 30 000
    expect(r).toMatchObject({ soldeSource: 70000, soldeDestination: 50000, depassePlafond: false }); // Soldes après transfert
    expect(await soldeEnCours(a)).toBe(70000); // Solde de A
    expect(await soldeEnCours(b)).toBe(50000); // Solde de B
    const lignes = await listerTransactions(base, { nature: "mouvements" }); // Lignes de transfert
    expect(lignes).toHaveLength(2); // Deux lignes
    expect(lignes.find((t) => t.debitCredit === -1)).toMatchObject({ budgetName: "A", montant: 30000, nature: "transfert" }); // Sortie sur A
    expect(lignes.find((t) => t.debitCredit === -1).note).toBe("Transfert vers « B » — Urgence"); // Note de la sortie
    expect(lignes.find((t) => t.debitCredit === 1)).toMatchObject({ budgetName: "B", montant: 30000, nature: "transfert" }); // Entrée sur B
    expect(lignes.find((t) => t.debitCredit === 1).note).toBe("Transfert depuis « A » — Urgence"); // Note de l'entrée
    expect(lignes.every((t) => /^TRF-/.test(t.trxId))).toBe(true); // Identifiants de transfert
  }); // Fin du cas

  it("compte le transfert comme une sortie, pas comme une dépense, et tient le total alloué à jour", async () => { // Résumé
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 30000 }, OCTOBRE); // Transfert
    const resume = await resumeBudgets(base, OCTOBRE); // Résumé
    expect(resume.find((r) => r.budget.id === a).allocation).toMatchObject({ alimente: 100000, depense: 0, sorties: 30000, solde: 70000 }); // Source : sortie de 30 000
    expect(resume.find((r) => r.budget.id === b).allocation).toMatchObject({ alimente: 50000, depense: 0, solde: 50000 }); // Destination : entrée
    expect((await base.requeter("SELECT montant_alloue FROM allocation_budget WHERE budget_id = ?", [b]))[0].montant_alloue).toBe(50000); // Total alloué de B
  }); // Fin du cas

  it("autorise de transférer tout le solde, et refuse au-delà", async () => { // Limites
    await expect(transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 100000 }, OCTOBRE)).resolves.toBeTruthy(); // Pile le solde
    const erreur = await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 1 }, OCTOBRE).catch((e) => e); // Source à 0
    expect(erreur).toBeInstanceOf(ErreurValidation); // Refusé
    expect(erreur.erreurs.montant).toMatch(/Solde insuffisant/); // Message
  }); // Fin du cas

  it("signale un plafond dépassé sur la destination sans bloquer", async () => { // Plafond
    const r = await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 40000 }, OCTOBRE); // B passe à 60 000 > 50 000
    expect(r).toMatchObject({ soldeDestination: 60000, depassePlafond: true }); // Signalé
  }); // Fin du cas

  it("refuse si la destination resterait sous son minimum", async () => { // Minimum
    const c = await nouveauBudget({ name: "C", montantMin: 30000 }); // Minimum 30 000
    const erreur = await transfererEntreBudgets(base, { sourceId: a, destinationId: c, montant: 10000 }, OCTOBRE).catch((e) => e); // C n'a pas d'allocation : 10 000 < 30 000
    expect(erreur.erreurs.montant).toMatch(/minimum/); // Message
    expect(await soldeEnCours(a)).toBe(100000); // Rien n'a bougé
    await expect(transfererEntreBudgets(base, { sourceId: a, destinationId: c, montant: 30000 }, OCTOBRE)).resolves.toBeTruthy(); // Pile le minimum : accepté
  }); // Fin du cas

  it("crée l'allocation de la destination si elle n'en a pas encore", async () => { // Destination non allouée
    const c = await nouveauBudget({ name: "C" }); // Budget non alloué
    await transfererEntreBudgets(base, { sourceId: a, destinationId: c, montant: 5000 }, OCTOBRE); // Transfert
    expect(await soldeEnCours(c)).toBe(5000); // C est alloué de 5 000
  }); // Fin du cas

  it("refuse si la source n'est pas allouée sur la période", async () => { // Source non allouée
    const c = await nouveauBudget({ name: "C" }); // Budget non alloué
    await expect(transfererEntreBudgets(base, { sourceId: c, destinationId: a, montant: 1000 }, OCTOBRE)).rejects.toThrow(/n'est pas alloué/); // Refusé
  }); // Fin du cas

  it("refuse même budget, budgets inexistants, montants et note invalides, sans rien écrire", async () => { // Validation
    const avant = (await listerTransactions(base)).length; // Nombre de transactions avant
    await expect(transfererEntreBudgets(base, { sourceId: a, destinationId: a, montant: 1000 }, OCTOBRE)).rejects.toThrow(ErreurValidation); // Même budget
    await expect(transfererEntreBudgets(base, { sourceId: 999, destinationId: b, montant: 1000 }, OCTOBRE)).rejects.toThrow(ErreurValidation); // Source inexistante
    await expect(transfererEntreBudgets(base, { sourceId: a, destinationId: 999, montant: 1000 }, OCTOBRE)).rejects.toThrow(ErreurValidation); // Destination inexistante
    for (const montant of [0, -5, 10.5, "100", NaN]) await expect(transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant }, OCTOBRE), String(montant)).rejects.toThrow(ErreurValidation); // Montants invalides
    await expect(transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 1000, note: "x".repeat(81) }, OCTOBRE)).rejects.toThrow(ErreurValidation); // Note trop longue
    expect((await listerTransactions(base)).length).toBe(avant); // Rien n'est écrit
  }); // Fin du cas

  it("accepte des noms de budget très longs sans dépasser la limite des notes", async () => { // Notes longues
    const longNom = await nouveauBudget({ name: "N".repeat(100) }); // Nom de 100 caractères
    await transfererEntreBudgets(base, { sourceId: a, destinationId: longNom, montant: 1000, note: "y".repeat(80) }, OCTOBRE); // Transfert avec la note maximale
    const notes = (await listerTransactions(base, { nature: "mouvements" })).map((t) => t.note.length); // Longueurs des notes
    expect(Math.max(...notes)).toBeLessThanOrEqual(200); // Aucune ne dépasse 200
  }); // Fin du cas

  it("les lignes de transfert sont en lecture seule ; un transfert inverse le défait", async () => { // Lecture seule
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 30000 }, OCTOBRE); // Transfert
    for (const t of await listerTransactions(base, { nature: "mouvements" })) await expect(supprimerOperation(base, t.id)).rejects.toThrow(ErreurMetier); // Suppression refusée
    await transfererEntreBudgets(base, { sourceId: b, destinationId: a, montant: 30000 }, OCTOBRE); // Transfert inverse
    expect(await soldeEnCours(a)).toBe(100000); // A retrouve son solde
    expect(await soldeEnCours(b)).toBe(20000); // B aussi
  }); // Fin du cas

  it("permet de débloquer une dépense refusée faute de solde", async () => { // Cas d'usage
    await expect(depenser(b, 25000, OCTOBRE)).rejects.toThrow(/Solde insuffisant/); // B n'a que 20 000
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 10000 }, OCTOBRE); // A donne 10 000 à B
    await expect(depenser(b, 25000, OCTOBRE)).resolves.toBeTruthy(); // La dépense passe
    expect(await soldeEnCours(b)).toBe(5000); // Il reste 5 000
  }); // Fin du cas

  it("filtre les opérations par nature", async () => { // Filtre
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 1000 }, OCTOBRE); // Transfert
    await depenser(a, 500, OCTOBRE); // Dépense
    expect((await listerTransactions(base, { nature: "normale" })).every((t) => t.nature === "normale")).toBe(true); // Seulement les saisies
    expect((await listerTransactions(base, { nature: "mouvements" })).every((t) => t.nature === "transfert")).toBe(true); // Seulement les mouvements
    expect(await listerTransactions(base)).toHaveLength(5); // 2 allocations + 1 dépense + 2 lignes de transfert
  }); // Fin du cas
}); // Fin du groupe
