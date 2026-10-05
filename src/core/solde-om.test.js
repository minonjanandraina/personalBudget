import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeOMDeTest } from "./db/aide-tests.js"; // Base neuve et solde OM de test
import { creerTypeBudget } from "./types-budget.js"; // Types
import { creerBudget } from "./budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense, modifierOperation, supprimerOperation, MESSAGE_SANS_SOLDE } from "./allocations.js"; // Allocation et dépense
import { lancerAllocationPeriode, transfererEntreBudgets } from "./reallocation.js"; // Report et transferts
import { soldeOMDisponible, totalReserve, situationFinanciere, soldesParBudget, supprimerSolde, listerSoldes } from "./soldes.js"; // Fonctions à tester
import { creerTransaction, listerTransactions } from "./transactions.js"; // Transactions
import { ErreurValidation, ErreurMetier } from "./erreurs.js"; // Erreurs

let base; // Base utilisée par les cas de test
let typeId; // Type de budget disponible
const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Date locale (indépendante du fuseau de la machine)
const SEPTEMBRE = local(2026, 9, 25); // Période du 20/09 au 19/10
const OCTOBRE = local(2026, 10, 25); // Période du 20/10 au 19/11

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve (sans solde OM)
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

const nouveauBudget = (surcharges = {}) => creerBudget(base, { name: "Loisirs", typeId, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 10000, autogenFinMois: true, ...surcharges }); // Crée un budget
const depenser = (budgetId, montant, quand) => enregistrerDepense(base, { budgetId, montant, dateOperation: quand.toISOString() }, quand); // Dépense
const poserSolde = (balance, quand = "2020-01-01T00:00:00.000Z") => base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [quand, balance]); // Enregistre un solde OM à une date

describe("solde OM disponible", () => { // Dernier solde moins les dépenses suivantes
  it("est inconnu tant qu'aucun solde n'est saisi", async () => { // Sans solde
    expect(await soldeOMDisponible(base)).toBeNull(); // Aucune information
    expect((await situationFinanciere(base)).libre).toBeNull(); // Libre inconnu aussi
  }); // Fin du cas

  it("vaut le dernier solde tant qu'il n'y a pas de dépense", async () => { // Sans dépense
    await poserSolde(150000); // Solde de 150 000
    expect(await soldeOMDisponible(base)).toMatchObject({ dernierSolde: 150000, depensesDepuis: 0, disponible: 150000 }); // Inchangé
  }); // Fin du cas

  it("diminue à chaque dépense enregistrée après le solde", async () => { // Cas demandé
    await poserSolde(150000); // Solde de 150 000
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Allocation : ne diminue PAS le solde OM
    expect((await soldeOMDisponible(base)).disponible).toBe(150000); // Toujours 150 000
    await depenser(id, 30000, OCTOBRE); // Première dépense
    expect((await soldeOMDisponible(base)).disponible).toBe(120000); // 150 000 - 30 000
    await depenser(id, 20000, OCTOBRE); // Seconde dépense
    expect(await soldeOMDisponible(base)).toMatchObject({ dernierSolde: 150000, depensesDepuis: 50000, disponible: 100000 }); // 150 000 - 50 000
  }); // Fin du cas

  it("ignore les dépenses datées avant le solde (déjà comprises dedans)", async () => { // Dépense antérieure
    const id = await nouveauBudget(); // Budget
    await poserSolde(500000); // Solde de 500 000 en 2020 pour pouvoir allouer
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Allocation
    await depenser(id, 30000, local(2026, 10, 24)); // Dépense du 24 octobre
    await poserSolde(70000, local(2026, 10, 25, 18).toISOString()); // Nouveau solde réel du 25 octobre à 18 h
    expect((await soldeOMDisponible(base)).disponible).toBe(70000); // La dépense du 24 est déjà dans ce solde
    await depenser(id, 10000, local(2026, 10, 25, 20)); // Dépense du soir
    expect((await soldeOMDisponible(base)).disponible).toBe(60000); // Seule la dépense du soir est retirée
  }); // Fin du cas

  it("retire une dépense manuelle datée de la même seconde que le solde, mais pas celle issue d'un SMS", async () => { // Égalité de dates
    const quand = "2026-10-25T10:00:00.000Z"; // Date commune
    await poserSolde(100000, quand); // Solde
    await creerTransaction(base, { debitCredit: -1, montant: 1000, dateOperation: quand }); // Dépense manuelle à la même seconde
    await creerTransaction(base, { trxId: "OM1", insertType: "auto", debitCredit: -1, montant: 500, sms: "texte", dateOperation: quand }); // Dépense issue d'un SMS à la même seconde
    expect((await soldeOMDisponible(base)).disponible).toBe(99000); // Seule la manuelle est retirée
  }); // Fin du cas

  it("ne compte ni les reports ni les transferts, et suit les modifications et suppressions de dépenses", async () => { // Cohérence
    await poserSolde(300000); // Solde
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // A
    await allouerBudget(base, { budgetId: b, montant: 50000 }, OCTOBRE); // B
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 20000 }, OCTOBRE); // Transfert
    expect((await soldeOMDisponible(base)).disponible).toBe(300000); // Les transferts ne touchent pas le solde OM
    const id = (await depenser(a, 30000, OCTOBRE)).idTransaction; // Dépense
    expect((await soldeOMDisponible(base)).disponible).toBe(270000); // -30 000
    await modifierOperation(base, id, { montant: 45000, dateOperation: OCTOBRE.toISOString() }, OCTOBRE); // Modifie la dépense
    expect((await soldeOMDisponible(base)).disponible).toBe(255000); // -45 000
    await supprimerOperation(base, id); // Supprime la dépense
    expect((await soldeOMDisponible(base)).disponible).toBe(300000); // Retrouvé
  }); // Fin du cas
}); // Fin du groupe

describe("total réservé et détail par budget", () => { // Solde = allocations - dépenses
  it("total réservé = somme des allocations - somme des dépenses", async () => { // Formule demandée
    await ajouterSoldeOMDeTest(base); // Solde OM
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // A : 100 000
    await allouerBudget(base, { budgetId: b, montant: 50000 }, OCTOBRE); // B : 50 000
    await depenser(a, 30000, OCTOBRE); // Dépense de 30 000 sur A
    expect(await totalReserve(base)).toBe(120000); // 150 000 - 30 000
  }); // Fin du cas

  it("détaille le solde par budget : alloué - dépensé", async () => { // Détail
    await ajouterSoldeOMDeTest(base); // Solde OM
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // A : 100 000
    await allouerBudget(base, { budgetId: b, montant: 50000 }, OCTOBRE); // B : 50 000
    await depenser(a, 30000, OCTOBRE); // Dépense sur A
    const detail = await soldesParBudget(base); // Détail
    expect(detail.map((d) => [d.name, d.alloue, d.depense, d.solde])).toEqual([["A", 100000, 30000, 70000], ["B", 50000, 0, 50000]]); // Alloué - dépensé par budget
    expect(detail.reduce((s, d) => s + d.solde, 0)).toBe(await totalReserve(base)); // La somme du détail = le total
  }); // Fin du cas

  it("garde la formule exacte avec transferts et reports (le total ne change pas)", async () => { // Mouvements internes
    await ajouterSoldeOMDeTest(base); // Solde OM
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, SEPTEMBRE); // A en septembre
    await depenser(a, 60000, SEPTEMBRE); // Dépense : reste 40 000
    await allouerBudget(base, { budgetId: b, montant: 10000 }, SEPTEMBRE); // B en septembre
    const avant = await totalReserve(base); // Total avant report
    await lancerAllocationPeriode(base, OCTOBRE); // Report (A : 40 000, B : 10 000) + allocations mensuelles
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 5000 }, OCTOBRE); // Transfert
    expect(await totalReserve(base)).toBe(avant + 200000); // Seules les deux nouvelles allocations mensuelles (2 x 100 000) augmentent le total
    const detail = await soldesParBudget(base); // Détail par budget
    expect(detail.reduce((s, d) => s + d.solde, 0)).toBe(await totalReserve(base)); // Somme du détail = total
    expect(detail.find((d) => d.name === "A")).toMatchObject({ alloue: 195000, depense: 60000, solde: 135000 }); // A : alloué net = 100 000 + 100 000 - 5 000 transférés (les reports s'annulent) ; solde = 195 000 - 60 000
  }); // Fin du cas
}); // Fin du groupe

describe("limite : le total réservé ne dépasse pas le solde OM disponible", () => { // Contrôle des allocations
  it("bloque toute allocation tant qu'aucun solde OM n'est saisi", async () => { // Sans solde
    const id = await nouveauBudget(); // Budget
    const erreur = await allouerBudget(base, { budgetId: id, montant: 1000 }, OCTOBRE).catch((e) => e); // Tente d'allouer
    expect(erreur).toBeInstanceOf(ErreurMetier); // Règle de gestion
    expect(erreur.message).toBe(MESSAGE_SANS_SOLDE); // Message d'explication
    expect(await listerTransactions(base)).toHaveLength(0); // Rien n'est écrit
  }); // Fin du cas

  it("accepte pile le solde libre et refuse au-delà, avec les chiffres dans le message", async () => { // Limite exacte
    await poserSolde(150000); // Solde OM 150 000
    const id = await nouveauBudget(); // Budget
    const erreur = await allouerBudget(base, { budgetId: id, montant: 150001 }, OCTOBRE).catch((e) => e); // Un de trop
    expect(erreur).toBeInstanceOf(ErreurValidation); // Erreur de saisie
    expect(erreur.erreurs.montant).toMatch(/Solde libre insuffisant.*150\s000 Ar à allouer.*solde OM disponible 150\s000 Ar.*déjà réservé dans les budgets 0 Ar/); // Chiffres du message
    await expect(allouerBudget(base, { budgetId: id, montant: 150000 }, OCTOBRE)).resolves.toBeTruthy(); // Pile le libre : accepté
  }); // Fin du cas

  it("tient compte de ce qui est déjà réservé par les autres budgets", async () => { // Cumul
    await poserSolde(150000); // Solde OM 150 000
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // Réserve 100 000
    await expect(allouerBudget(base, { budgetId: b, montant: 50001 }, OCTOBRE)).rejects.toThrow(/Solde libre insuffisant.*50\s000 Ar à allouer/); // Il ne reste que 50 000
    await expect(allouerBudget(base, { budgetId: b, montant: 50000 }, OCTOBRE)).resolves.toBeTruthy(); // Pile le reste
  }); // Fin du cas

  it("une dépense ne libère pas d'argent à allouer (elle diminue à la fois le solde OM et le budget)", async () => { // Neutralité de la dépense
    await poserSolde(100000); // Solde OM 100 000
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // Tout est réservé
    await depenser(a, 40000, OCTOBRE); // Dépense : OM 60 000, réservé 60 000
    expect((await situationFinanciere(base)).libre).toBe(0); // Libre toujours nul
    await expect(allouerBudget(base, { budgetId: b, montant: 1 }, OCTOBRE)).rejects.toThrow(/Solde libre insuffisant/); // Rien à allouer
  }); // Fin du cas

  it("un nouveau solde saisi change le libre à allouer", async () => { // Nouveau solde réel
    await poserSolde(100000); // Solde OM 100 000
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // Tout est réservé
    await depenser(a, 40000, local(2026, 10, 25)); // Dépense de 40 000
    await poserSolde(260000, local(2026, 10, 26).toISOString()); // Nouveau solde réel : 260 000
    expect((await situationFinanciere(base)).libre).toBe(200000); // 260 000 - 60 000 réservés
    await expect(allouerBudget(base, { budgetId: b, montant: 200000 }, local(2026, 10, 26, 13))).resolves.toBeTruthy(); // Allocation possible
  }); // Fin du cas

  it("refuse tant que le solde OM saisi est inférieur à ce qui est déjà réservé", async () => { // Libre négatif
    await poserSolde(500000); // Solde OM 500 000
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 400000 }, OCTOBRE); // Réserve 400 000
    await poserSolde(300000, local(2026, 10, 26).toISOString()); // Le solde réel est tombé à 300 000 (dépense non enregistrée)
    expect((await situationFinanciere(base)).libre).toBe(-100000); // Libre négatif
    await expect(allouerBudget(base, { budgetId: b, montant: 1 }, local(2026, 10, 26, 13))).rejects.toThrow(/il reste 0 Ar à allouer/); // Message « 0 Ar »
  }); // Fin du cas

  it("limite aussi l'augmentation d'une allocation existante, pas sa diminution", async () => { // Modification d'allocation
    await poserSolde(150000); // Solde OM 150 000
    const id = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Réserve 100 000 (libre 50 000)
    const alimentation = (await listerTransactions(base, { sens: 1 }))[0].id; // Identifiant de l'allocation
    await expect(modifierOperation(base, alimentation, { montant: 150001 }, OCTOBRE)).rejects.toThrow(/Solde libre insuffisant/); // +50 001 : trop
    await expect(modifierOperation(base, alimentation, { montant: 150000 }, OCTOBRE)).resolves.toBeTruthy(); // +50 000 : pile
    await expect(modifierOperation(base, alimentation, { montant: 10000 }, OCTOBRE)).resolves.toBeTruthy(); // Diminuer est toujours possible
  }); // Fin du cas

  it("les transferts entre budgets ne changent pas le libre à allouer", async () => { // Neutralité du transfert
    await poserSolde(200000); // Solde OM 200 000
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // A
    await allouerBudget(base, { budgetId: b, montant: 50000 }, OCTOBRE); // B
    const avant = (await situationFinanciere(base)).libre; // Libre avant
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 30000 }, OCTOBRE); // Transfert
    expect((await situationFinanciere(base)).libre).toBe(avant); // Inchangé
  }); // Fin du cas
}); // Fin du groupe

describe("lancement de la période : tout ou rien selon le solde libre", () => { // Contrôle du lancement
  it("alloue tous les budgets quand le solde libre suffit", async () => { // Cas favorable
    await poserSolde(250000); // Solde OM 250 000
    await nouveauBudget({ name: "A" }); // 100 000
    await nouveauBudget({ name: "B", montantBudget: 150000 }); // 150 000
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Lance
    expect(resultats.map((r) => r.statut)).toEqual(["alloue", "alloue"]); // Les deux alloués
    expect((await situationFinanciere(base)).libre).toBe(0); // Tout est réservé
  }); // Fin du cas

  it("ne fait RIEN si le total demandé dépasse le solde libre, et explique ce qui manque", async () => { // Tout ou rien
    await poserSolde(200000); // Solde OM 200 000
    await nouveauBudget({ name: "A" }); // 100 000
    await nouveauBudget({ name: "B", montantBudget: 150000 }); // 150 000 : total 250 000 > 200 000
    const erreur = await lancerAllocationPeriode(base, OCTOBRE).catch((e) => e); // Lance
    expect(erreur).toBeInstanceOf(ErreurMetier); // Règle de gestion
    expect(erreur.message).toMatch(/demande 250\s000 Ar, il reste 200\s000 Ar.*Il manque 50\s000 Ar\. Rien n'a été alloué/); // Chiffres et conclusion
    expect(await listerTransactions(base)).toHaveLength(0); // Aucune transaction
    expect((await base.requeter("SELECT COUNT(*) AS n FROM allocation_budget"))[0].n).toBe(0); // Aucune allocation
  }); // Fin du cas

  it("bloque aussi le lancement sans solde OM, quand de l'argent frais est demandé", async () => { // Sans solde
    await nouveauBudget(); // Budget
    await expect(lancerAllocationPeriode(base, OCTOBRE)).rejects.toThrow(MESSAGE_SANS_SOLDE); // Refusé
  }); // Fin du cas

  it("ne compte pas les reports comme de l'argent frais : un report seul passe même sans solde libre", async () => { // Reports neutres
    await poserSolde(100000); // Solde OM 100 000
    const id = await nouveauBudget({ montantBudget: 0 }); // Budget sans montant mensuel (pour pouvoir allouer à la main)
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Réserve tout le solde en septembre
    expect((await situationFinanciere(base)).libre).toBe(0); // Libre nul
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Lance : report seul
    expect(resultats[0]).toMatchObject({ statut: "reporte", reliquatReporte: 100000 }); // Reporté malgré un libre nul
    expect((await situationFinanciere(base)).libre).toBe(0); // Le libre n'a pas bougé
  }); // Fin du cas

  it("peut être relancé sans erreur même quand le libre est épuisé (rien de neuf à allouer)", async () => { // Idempotence
    await poserSolde(100000); // Solde OM 100 000
    await nouveauBudget(); // 100 000 : épuise le libre
    await lancerAllocationPeriode(base, OCTOBRE); // Premier lancement
    const second = await lancerAllocationPeriode(base, OCTOBRE); // Second lancement : libre nul mais rien à allouer
    expect(second.resultats[0].statut).toBe("deja"); // Déjà à jour
  }); // Fin du cas

  it("autorise le lancement d'un report seul même si le solde OM a été supprimé", async () => { // Aucun argent frais
    await poserSolde(50000); // Solde OM
    const id = await nouveauBudget({ montantBudget: 0 }); // Budget sans montant mensuel
    await allouerBudget(base, { budgetId: id, montant: 30000 }, SEPTEMBRE); // Septembre
    for (const s of await listerSoldes(base)) await supprimerSolde(base, s.id); // Supprime tous les soldes OM
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE); // Lance
    expect(resultats[0].statut).toBe("reporte"); // Report effectué
  }); // Fin du cas

  it("l'option « seulement les automatiques » ne compte que ces budgets pour le solde libre", async () => { // Option automatique
    await poserSolde(100000); // Solde OM 100 000
    await nouveauBudget({ name: "Auto", autogenFinMois: true }); // 100 000 : suffit
    await nouveauBudget({ name: "Manuel", montantBudget: 400000, autogenFinMois: false }); // 400 000 : ne compte pas
    const { resultats } = await lancerAllocationPeriode(base, OCTOBRE, { seulementAuto: true }); // Lance seulement l'automatique
    expect(resultats.map((r) => r.nom)).toEqual(["Auto"]); // Un seul budget traité
  }); // Fin du cas
}); // Fin du groupe
