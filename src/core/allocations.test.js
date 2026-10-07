import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeOMDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas et solde OM de test
import { creerTypeBudget } from "./types-budget.js"; // Types
import { creerBudget, supprimerBudget } from "./budgets.js"; // Budgets
import { modifierJourJob } from "./parametres.js"; // Jour de lancement
import { allouerBudget, enregistrerDepense, soldeAllocation, allocationCouvrant, resumeBudgets, libellePeriode, supprimerAllocation, raisonRefusSuppressionAllocation } from "./allocations.js"; // Fonctions à tester
import { listerTransactions } from "./transactions.js"; // Liste des transactions
import { ErreurValidation, ErreurMetier } from "./erreurs.js"; // Erreurs

let base; // Base utilisée par les cas de test
let typeId; // Type de budget disponible
// Dates construites à l'heure LOCALE : les tests donnent le même résultat quel que soit le fuseau de la machine.
const local = (a, m, j, h = 12, min = 0) => new Date(a, m - 1, j, h, min); // Fabrique une date locale
const MAINTENANT = local(2026, 10, 25); // Le 25 octobre 2026 (jour de lancement par défaut : 20 -> période 20/10 au 19/11)

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  await ajouterSoldeOMDeTest(base); // Solde OM très grand : ces tests ne vérifient pas la limite du solde OM
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

// Crée un budget avec des valeurs par défaut modifiables.
const nouveauBudget = (surcharges = {}) => creerBudget(base, { name: "Sorties", typeId, montantBudget: 100000, montantMax: 150000, montantMin: 0, soldeAlert: 10000, autogenFinMois: false, ...surcharges }); // Création

describe("allouerBudget", () => { // Allocation d'un budget
  it("crée l'allocation de la période en cours et son alimentation", async () => { // Cas nominal
    const budgetId = await nouveauBudget(); // Budget
    const r = await allouerBudget(base, { budgetId, montant: 100000 }, MAINTENANT); // Alloue
    expect(r.soldeApres).toBe(100000); // Solde après allocation
    expect(await soldeAllocation(base, r.allocationId)).toBe(100000); // Solde relu en base
    const allocation = await allocationCouvrant(base, budgetId, "2026-10-25"); // Allocation couvrant le 25 octobre
    expect(allocation).toMatchObject({ dateFrom: "2026-10-20", dateTo: "2026-11-19", montantAlloue: 100000 }); // Période du 20/10 au 19/11
    const [t] = await listerTransactions(base); // Relit la transaction
    expect([t.debitCredit, t.montant, t.insertType, t.budgetName]).toEqual([1, 100000, "manuel", "Sorties"]); // Alimentation manuelle rattachée au budget
    expect(t.trxId).toMatch(/^MAN-/); // trx_id généré
  }); // Fin du cas

  it("respecte le jour de lancement réglé", async () => { // Jour réglé
    await modifierJourJob(base, 5); // Jour 5
    const budgetId = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId, montant: 1000 }, local(2026, 10, 3)); // Le 3 octobre : période du 5 septembre au 4 octobre
    expect(await allocationCouvrant(base, budgetId, "2026-09-05")).not.toBeNull(); // Début 5 septembre
    expect(await allocationCouvrant(base, budgetId, "2026-10-04")).not.toBeNull(); // Fin 4 octobre
    expect(await allocationCouvrant(base, budgetId, "2026-10-05")).toBeNull(); // Le 5 octobre est une autre période
  }); // Fin du cas

  it("une deuxième allocation dans la même période complète la première", async () => { // Complément
    const budgetId = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId, montant: 60000 }, MAINTENANT); // Première
    const r = await allouerBudget(base, { budgetId, montant: 30000 }, MAINTENANT); // Seconde
    expect(r.soldeApres).toBe(90000); // Les montants s'additionnent
    expect((await allocationCouvrant(base, budgetId, "2026-10-25")).montantAlloue).toBe(90000); // Total alloué tenu à jour
    expect((await base.requeter("SELECT COUNT(*) AS n FROM allocation_budget"))[0].n).toBe(1); // Une seule ligne d'allocation
  }); // Fin du cas

  it("refuse si le solde après allocation reste sous montant_min", async () => { // Contrôle du minimum
    const budgetId = await nouveauBudget({ montantMin: 20000 }); // Minimum 20 000
    const erreur = await allouerBudget(base, { budgetId, montant: 10000 }, MAINTENANT).catch((e) => e); // Allocation trop faible
    expect(erreur).toBeInstanceOf(ErreurValidation); // Erreur de saisie
    expect(erreur.erreurs.montant).toMatch(/minimum/); // Message sur le montant
    expect(await listerTransactions(base)).toHaveLength(0); // Rien n'est écrit
    expect((await base.requeter("SELECT COUNT(*) AS n FROM allocation_budget"))[0].n).toBe(0); // Pas d'allocation créée non plus
  }); // Fin du cas

  it("accepte pile le minimum", async () => { // Cas limite
    const budgetId = await nouveauBudget({ montantMin: 20000 }); // Minimum 20 000
    await expect(allouerBudget(base, { budgetId, montant: 20000 }, MAINTENANT)).resolves.toBeTruthy(); // Accepté
  }); // Fin du cas

  it("compte le solde déjà présent dans la période pour le minimum", async () => { // Minimum et solde existant
    const budgetId = await nouveauBudget({ montantMin: 20000 }); // Minimum 20 000
    await allouerBudget(base, { budgetId, montant: 25000 }, MAINTENANT); // Solde 25 000
    await expect(allouerBudget(base, { budgetId, montant: 1000 }, MAINTENANT)).resolves.toBeTruthy(); // 26 000 >= 20 000 : accepté
  }); // Fin du cas

  it("signale un plafond dépassé sans tronquer le montant", async () => { // Plafond
    const budgetId = await nouveauBudget({ montantBudget: 100000, montantMax: 120000 }); // Plafond 120 000
    await allouerBudget(base, { budgetId, montant: 100000 }, MAINTENANT); // 100 000
    const r = await allouerBudget(base, { budgetId, montant: 50000 }, MAINTENANT); // 150 000 > plafond
    expect(r.depassePlafond).toBe(true); // Signalé
    expect(r.soldeApres).toBe(150000); // Montant non tronqué
  }); // Fin du cas

  it("refuse un montant invalide ou un budget inexistant", async () => { // Validation
    const budgetId = await nouveauBudget(); // Budget
    for (const montant of [0, -5, 10.5, "100", NaN]) { // Montants invalides
      await expect(allouerBudget(base, { budgetId, montant }, MAINTENANT), String(montant)).rejects.toThrow(ErreurValidation); // Chacun est refusé
    } // Fin de la boucle
    await expect(allouerBudget(base, { budgetId: 999, montant: 1000 }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Budget absent
    expect(await listerTransactions(base)).toHaveLength(0); // Rien n'est écrit
  }); // Fin du cas

  it("refuse une note trop longue et nettoie la note", async () => { // Note
    const budgetId = await nouveauBudget(); // Budget
    await expect(allouerBudget(base, { budgetId, montant: 1000, note: "x".repeat(201) }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Trop longue
    await allouerBudget(base, { budgetId, montant: 1000, note: "  Octobre  " }, MAINTENANT); // Avec espaces
    expect((await listerTransactions(base))[0].note).toBe("Octobre"); // Espaces retirés
  }); // Fin du cas
}); // Fin du groupe

describe("enregistrerDepense", () => { // Dépenses manuelles
  let budgetId; // Budget alloué de 100 000
  beforeEach(async () => { // Avant chaque cas
    budgetId = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId, montant: 100000 }, MAINTENANT); // Allocation
  }); // Fin de la préparation

  it("enregistre une dépense et diminue le solde", async () => { // Cas nominal
    const r = await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: local(2026, 10, 25, 9).toISOString(), note: "Cinéma" }, MAINTENANT); // Dépense
    expect(r.soldeApres).toBe(40000); // Solde restant
    const [t] = await listerTransactions(base, { sens: -1 }); // Relit la dépense
    expect([t.debitCredit, t.montant, t.note, t.insertType]).toEqual([-1, 60000, "Cinéma", "manuel"]); // Champs corrects
    expect(await soldeAllocation(base, r.allocationId)).toBe(40000); // Solde relu en base
  }); // Fin du cas

  it("accepte de dépenser exactement le solde", async () => { // Cas limite
    const r = await enregistrerDepense(base, { budgetId, montant: 100000, dateOperation: MAINTENANT.toISOString() }, MAINTENANT); // Tout le solde
    expect(r.soldeApres).toBe(0); // Solde nul
  }); // Fin du cas

  it("bloque une dépense supérieure au solde, sans rien écrire", async () => { // Blocage
    const erreur = await enregistrerDepense(base, { budgetId, montant: 100001, dateOperation: MAINTENANT.toISOString() }, MAINTENANT).catch((e) => e); // Trop grande
    expect(erreur).toBeInstanceOf(ErreurValidation); // Erreur de saisie
    expect(erreur.erreurs.montant).toMatch(/Solde insuffisant.*100\s000 Ar.*réallocation/); // Message avec le solde restant
    expect(await listerTransactions(base, { sens: -1 })).toHaveLength(0); // Rien n'est écrit
  }); // Fin du cas

  it("tient compte des dépenses précédentes", async () => { // Cumul
    await enregistrerDepense(base, { budgetId, montant: 70000, dateOperation: MAINTENANT.toISOString() }, MAINTENANT); // Première dépense
    await expect(enregistrerDepense(base, { budgetId, montant: 40000, dateOperation: MAINTENANT.toISOString() }, MAINTENANT)).rejects.toThrow(/Solde insuffisant/); // Dépasse le reste
    await expect(enregistrerDepense(base, { budgetId, montant: 30000, dateOperation: MAINTENANT.toISOString() }, MAINTENANT)).resolves.toBeTruthy(); // Pile le reste
  }); // Fin du cas

  it("refuse une dépense dans une période sans allocation", async () => { // Pas d'allocation
    const erreur = await enregistrerDepense(base, { budgetId, montant: 1000, dateOperation: local(2026, 9, 10).toISOString() }, MAINTENANT).catch((e) => e); // Date antérieure à la période
    expect(erreur).toBeInstanceOf(ErreurMetier); // Règle de gestion
    expect(erreur.message).toMatch(/Aucune allocation/); // Message clair
  }); // Fin du cas

  it("range une dépense antidatée dans l'allocation de sa propre période", async () => { // Antidatage
    await modifierJourJob(base, 20); // Jour 20
    const autre = await nouveauBudget({ name: "Autre" }); // Second budget
    await allouerBudget(base, { budgetId: autre, montant: 5000 }, local(2026, 9, 25)); // Allocation de la période précédente (20/09 au 19/10)
    const r = await enregistrerDepense(base, { budgetId: autre, montant: 2000, dateOperation: local(2026, 10, 1).toISOString() }, MAINTENANT); // Dépense du 1er octobre
    expect(r.soldeApres).toBe(3000); // Prélevée sur l'allocation de septembre
    await expect(enregistrerDepense(base, { budgetId: autre, montant: 1000, dateOperation: MAINTENANT.toISOString() }, MAINTENANT)).rejects.toThrow(ErreurMetier); // La période en cours n'a pas d'allocation pour ce budget
  }); // Fin du cas

  it("refuse montant invalide, date invalide, date future et budget inexistant", async () => { // Validation
    const ok = { budgetId, montant: 1000, dateOperation: MAINTENANT.toISOString() }; // Saisie valide de référence
    await expect(enregistrerDepense(base, { ...ok, montant: 0 }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Montant nul
    await expect(enregistrerDepense(base, { ...ok, montant: 1.5 }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Montant à virgule
    await expect(enregistrerDepense(base, { ...ok, dateOperation: "n'importe quoi" }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Date illisible
    await expect(enregistrerDepense(base, { ...ok, dateOperation: local(2026, 12, 1).toISOString() }, MAINTENANT)).rejects.toThrow(/futur/); // Date future
    await expect(enregistrerDepense(base, { ...ok, budgetId: 999 }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Budget inexistant
    expect(await listerTransactions(base, { sens: -1 })).toHaveLength(0); // Rien n'est écrit
  }); // Fin du cas

  it("un budget avec des transactions ne peut plus être supprimé", async () => { // Intégrité
    await expect(supprimerBudget(base, budgetId)).rejects.toThrow(/allocation/); // Refusé
  }); // Fin du cas
}); // Fin du groupe

describe("resumeBudgets", () => { // Résumé par budget
  it("indique l'absence d'allocation en cours", async () => { // Sans allocation
    await nouveauBudget(); // Budget
    const [r] = await resumeBudgets(base, MAINTENANT); // Résumé
    expect(r.allocation).toBeNull(); // Pas d'allocation
    expect([r.depassePlafond, r.sousSeuil]).toEqual([false, false]); // Aucun indicateur
  }); // Fin du cas

  it("calcule alimenté, dépensé et solde de la période en cours", async () => { // Totaux
    const budgetId = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId, montant: 100000 }, MAINTENANT); // Allocation
    await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: MAINTENANT.toISOString() }, MAINTENANT); // Dépense
    const [r] = await resumeBudgets(base, MAINTENANT); // Résumé
    expect(r.allocation).toMatchObject({ dateFrom: "2026-10-20", dateTo: "2026-11-19", alimente: 100000, depense: 60000, solde: 40000 }); // Totaux
  }); // Fin du cas

  it("ignore les allocations d'une autre période", async () => { // Autre période
    const budgetId = await nouveauBudget(); // Budget
    await allouerBudget(base, { budgetId, montant: 100000 }, local(2026, 9, 25)); // Allocation de la période précédente
    expect((await resumeBudgets(base, MAINTENANT))[0].allocation).toBeNull(); // Rien pour la période en cours
  }); // Fin du cas

  it("signale le seuil d'alerte et le plafond dépassé", async () => { // Indicateurs
    const budgetId = await nouveauBudget({ montantMax: 120000, soldeAlert: 30000 }); // Plafond 120 000, seuil 30 000
    await allouerBudget(base, { budgetId, montant: 100000 }, MAINTENANT); // 100 000
    await enregistrerDepense(base, { budgetId, montant: 80000, dateOperation: MAINTENANT.toISOString() }, MAINTENANT); // Reste 20 000
    expect((await resumeBudgets(base, MAINTENANT))[0].sousSeuil).toBe(true); // Sous le seuil
    await allouerBudget(base, { budgetId, montant: 150000 }, MAINTENANT); // Reste 170 000 > plafond
    expect((await resumeBudgets(base, MAINTENANT))[0]).toMatchObject({ depassePlafond: true, sousSeuil: false }); // Plafond dépassé
  }); // Fin du cas

  it("garde des soldes séparés pour chaque budget", async () => { // Budgets indépendants
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 1000 }, MAINTENANT); // A : 1 000
    await allouerBudget(base, { budgetId: b, montant: 5000 }, MAINTENANT); // B : 5 000
    expect((await resumeBudgets(base, MAINTENANT)).map((r) => [r.budget.name, r.allocation.solde])).toEqual([["A", 1000], ["B", 5000]]); // Soldes distincts, triés par nom
  }); // Fin du cas

  it("formate le libellé de période", () => { // Affichage
    expect(libellePeriode({ dateFrom: "2026-10-20", dateTo: "2026-11-19" })).toBe("20/10/2026 → 19/11/2026"); // Format français
  }); // Fin du cas
}); // Fin du groupe

describe("listerTransactions", () => { // Liste filtrée
  it("filtre par budget et par sens, du plus récent au plus ancien", async () => { // Filtres
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 10000 }, local(2026, 10, 21)); // A, plus ancien
    await allouerBudget(base, { budgetId: b, montant: 20000 }, local(2026, 10, 22)); // B
    await enregistrerDepense(base, { budgetId: a, montant: 3000, dateOperation: local(2026, 10, 24).toISOString() }, MAINTENANT); // Dépense A, plus récente
    expect((await listerTransactions(base)).map((t) => t.montant)).toEqual([3000, 20000, 10000]); // Tout, plus récent d'abord
    expect((await listerTransactions(base, { budgetId: a })).map((t) => t.montant)).toEqual([3000, 10000]); // Budget A seulement
    expect((await listerTransactions(base, { sens: -1 })).map((t) => t.montant)).toEqual([3000]); // Dépenses seulement
    expect((await listerTransactions(base, { budgetId: b, sens: -1 }))).toHaveLength(0); // Aucune dépense pour B
    expect(await listerTransactions(base, { limite: 1 })).toHaveLength(1); // Limite respectée
  }); // Fin du cas
}); // Fin du groupe

describe("supprimerAllocation", () => { // Suppression de l'allocation d'une période
  it("supprime l'allocation (et ses alimentations) sans toucher au budget ni au type", async () => { // Cas nominal
    const budgetId = await nouveauBudget(); // Budget
    const { allocationId } = await allouerBudget(base, { budgetId, montant: 100000 }, MAINTENANT); // Alloue
    await allouerBudget(base, { budgetId, montant: 20000 }, MAINTENANT); // Complète l'allocation (deux alimentations)
    expect(await raisonRefusSuppressionAllocation(base, allocationId)).toBeNull(); // Suppression permise
    await supprimerAllocation(base, allocationId); // Supprime
    expect(await allocationCouvrant(base, budgetId, "2026-10-25")).toBeNull(); // Le budget redevient non alloué
    expect(await listerTransactions(base)).toHaveLength(0); // Plus aucune alimentation
    expect(await base.requeter("SELECT id FROM budget WHERE id = ?", [budgetId])).toHaveLength(1); // Budget conservé
    expect(await base.requeter("SELECT id FROM type_budget")).toHaveLength(1); // Type conservé
  }); // Fin du cas
  it("refuse s'il existe une dépense dans l'allocation", async () => { // Dépense présente
    const budgetId = await nouveauBudget(); // Budget
    const { allocationId } = await allouerBudget(base, { budgetId, montant: 100000 }, MAINTENANT); // Alloue
    await enregistrerDepense(base, { budgetId, montant: 5000, dateOperation: MAINTENANT.toISOString() }, MAINTENANT); // Dépense
    await expect(supprimerAllocation(base, allocationId)).rejects.toThrow(ErreurMetier); // Refusé
    expect(await soldeAllocation(base, allocationId)).toBe(95000); // Rien n'a changé
  }); // Fin du cas
  it("refuse une allocation inexistante", async () => { // Introuvable
    await expect(supprimerAllocation(base, 999)).rejects.toThrow("n'existe plus"); // Message clair
  }); // Fin du cas
}); // Fin du groupe
