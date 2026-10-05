import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeOMDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas et solde OM de test
import { creerTypeBudget } from "./types-budget.js"; // Types
import { creerBudget, supprimerBudget } from "./budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense, modifierOperation, supprimerOperation, soldeAllocation, resumeBudgets, lireOperationDetaillee } from "./allocations.js"; // Fonctions à tester
import { creerTransaction, listerTransactions } from "./transactions.js"; // Transactions
import { ErreurValidation, ErreurMetier } from "./erreurs.js"; // Erreurs

let base; // Base utilisée par les cas de test
let budgetId; // Budget alloué de 100 000
let allocationId; // Son allocation
const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Date locale (indépendante du fuseau de la machine)
const MAINTENANT = local(2026, 10, 25); // Le 25 octobre 2026 : période du 20/10 au 19/11

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  await ajouterSoldeOMDeTest(base); // Solde OM très grand : ces tests ne vérifient pas la limite du solde OM
  const typeId = await creerTypeBudget(base, { name: "Loisir" }); // Type
  budgetId = await creerBudget(base, { name: "Sorties", typeId, montantBudget: 100000, montantMax: 150000, montantMin: 0, soldeAlert: 10000, autogenFinMois: false }); // Budget
  allocationId = (await allouerBudget(base, { budgetId, montant: 100000 }, MAINTENANT)).allocationId; // Allocation de 100 000
}); // Fin de la préparation

// Enregistre une dépense et renvoie son identifiant de transaction.
const depense = async (montant, jour = 25, note = null) => (await enregistrerDepense(base, { budgetId, montant, dateOperation: local(2026, 10, jour).toISOString(), note }, MAINTENANT)).idTransaction; // Dépense
// Identifiant de la transaction d'alimentation de l'allocation.
const idAlimentation = async () => (await listerTransactions(base, { sens: 1 }))[0].id; // Première alimentation

describe("modifierOperation (dépense)", () => { // Modification d'une dépense
  it("modifie montant, date et note", async () => { // Cas nominal
    const id = await depense(30000, 25, "Avant"); // Dépense de 30 000
    const r = await modifierOperation(base, id, { montant: 45000, dateOperation: local(2026, 10, 24, 9).toISOString(), note: "  Après  " }, MAINTENANT); // Modifie
    expect(r.soldeApres).toBe(55000); // Solde recalculé
    const [t] = await listerTransactions(base, { sens: -1 }); // Relit
    expect([t.montant, t.note]).toEqual([45000, "Après"]); // Valeurs modifiées, note nettoyée
    expect(await soldeAllocation(base, allocationId)).toBe(55000); // Solde relu en base
  }); // Fin du cas

  it("compte le montant d'origine dans le solde disponible (on peut augmenter jusqu'au solde total)", async () => { // Pas de double comptage
    const id = await depense(30000); // Dépense de 30 000 (reste 70 000)
    await expect(modifierOperation(base, id, { montant: 100000, dateOperation: local(2026, 10, 25).toISOString() }, MAINTENANT)).resolves.toBeTruthy(); // Pile le solde total : accepté
    const refus = await modifierOperation(base, id, { montant: 100001, dateOperation: local(2026, 10, 25).toISOString() }, MAINTENANT).catch((e) => e); // Au-dessus du solde total
    expect(refus).toBeInstanceOf(ErreurValidation); // Refusé
    expect(refus.erreurs.montant).toMatch(/Solde insuffisant/); // Message sur le montant
  }); // Fin du cas

  it("tient compte des autres dépenses", async () => { // Cumul
    await depense(60000); // Autre dépense
    const id = await depense(10000); // Dépense à modifier (reste 30 000)
    await expect(modifierOperation(base, id, { montant: 40001, dateOperation: local(2026, 10, 25).toISOString() }, MAINTENANT)).rejects.toThrow(/Solde insuffisant/); // 60 000 + 40 001 > 100 000
    await expect(modifierOperation(base, id, { montant: 40000, dateOperation: local(2026, 10, 25).toISOString() }, MAINTENANT)).resolves.toBeTruthy(); // 60 000 + 40 000 = 100 000
  }); // Fin du cas

  it("refuse de déplacer la dépense vers une date sans allocation", async () => { // Autre période
    const id = await depense(1000); // Dépense
    await expect(modifierOperation(base, id, { montant: 1000, dateOperation: local(2026, 9, 1).toISOString() }, MAINTENANT)).rejects.toThrow(ErreurMetier); // Septembre : pas d'allocation
    expect((await listerTransactions(base, { sens: -1 }))[0].dateOperation).toBe(local(2026, 10, 25).toISOString()); // La date d'origine est conservée
  }); // Fin du cas

  it("déplace la dépense dans l'allocation d'une autre période si elle existe", async () => { // Changement de période
    const septembre = (await allouerBudget(base, { budgetId, montant: 5000 }, local(2026, 9, 25))).allocationId; // Allocation de la période précédente
    const id = await depense(1000); // Dépense d'octobre
    const r = await modifierOperation(base, id, { montant: 2000, dateOperation: local(2026, 10, 1).toISOString() }, MAINTENANT); // Datée du 1er octobre (période de septembre)
    expect(r.allocationId).toBe(septembre); // Rattachée à l'allocation de septembre
    expect(await soldeAllocation(base, septembre)).toBe(3000); // 5 000 - 2 000
    expect(await soldeAllocation(base, allocationId)).toBe(100000); // Octobre retrouve tout son solde
  }); // Fin du cas

  it("refuse montant, date, note invalides ou date future, sans rien écrire", async () => { // Validation
    const id = await depense(1000); // Dépense
    const ok = { montant: 1000, dateOperation: local(2026, 10, 25).toISOString() }; // Valeurs valides de référence
    await expect(modifierOperation(base, id, { ...ok, montant: 0 }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Montant nul
    await expect(modifierOperation(base, id, { ...ok, montant: 1.5 }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Montant à virgule
    await expect(modifierOperation(base, id, { ...ok, dateOperation: "x" }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Date illisible
    await expect(modifierOperation(base, id, { ...ok, dateOperation: local(2026, 12, 1).toISOString() }, MAINTENANT)).rejects.toThrow(/futur/); // Date future
    await expect(modifierOperation(base, id, { ...ok, note: "x".repeat(201) }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Note trop longue
    expect((await listerTransactions(base, { sens: -1 }))[0].montant).toBe(1000); // Rien n'a changé
  }); // Fin du cas
}); // Fin du groupe

describe("modifierOperation (allocation)", () => { // Modification d'une alimentation
  it("modifie le montant et tient à jour le total alloué", async () => { // Cas nominal
    const id = await idAlimentation(); // Alimentation de 100 000
    const r = await modifierOperation(base, id, { montant: 120000, note: "Corrigé" }, MAINTENANT); // Passe à 120 000
    expect(r.soldeApres).toBe(120000); // Solde recalculé
    expect((await resumeBudgets(base, MAINTENANT))[0].allocation).toMatchObject({ alimente: 120000, solde: 120000 }); // Totaux
    expect((await base.requeter("SELECT montant_alloue FROM allocation_budget"))[0].montant_alloue).toBe(120000); // Total alloué tenu à jour
  }); // Fin du cas

  it("refuse de réduire sous les dépenses déjà faites", async () => { // Solde négatif interdit
    await depense(60000); // Dépense de 60 000
    const id = await idAlimentation(); // Alimentation de 100 000
    const erreur = await modifierOperation(base, id, { montant: 59999 }, MAINTENANT).catch((e) => e); // Réduit sous 60 000
    expect(erreur).toBeInstanceOf(ErreurValidation); // Refusé
    expect(erreur.erreurs.montant).toMatch(/dépasseraient/); // Message clair
    await expect(modifierOperation(base, id, { montant: 60000 }, MAINTENANT)).resolves.toBeTruthy(); // Pile les dépenses : accepté
  }); // Fin du cas
}); // Fin du groupe

describe("supprimerOperation", () => { // Suppression
  it("supprime une dépense et rend le solde", async () => { // Dépense
    const id = await depense(40000); // Dépense
    await supprimerOperation(base, id); // Supprime
    expect(await soldeAllocation(base, allocationId)).toBe(100000); // Solde rétabli
    expect(await listerTransactions(base, { sens: -1 })).toHaveLength(0); // Plus de dépense
  }); // Fin du cas

  it("supprime une allocation si les dépenses restent couvertes, avec total alloué à jour", async () => { // Allocation (cas 1)
    await allouerBudget(base, { budgetId, montant: 50000 }, MAINTENANT); // Complément : 150 000 au total
    await depense(60000); // Dépense
    const complement = (await listerTransactions(base, { sens: 1 })).find((t) => t.montant === 50000).id; // Complément de 50 000
    await supprimerOperation(base, complement); // Supprime le complément : reste 100 000 - 60 000 = 40 000
    expect(await soldeAllocation(base, allocationId)).toBe(40000); // Solde cohérent
    expect((await base.requeter("SELECT montant_alloue FROM allocation_budget"))[0].montant_alloue).toBe(100000); // Total alloué tenu à jour
  }); // Fin du cas

  it("refuse de supprimer une allocation si le solde deviendrait négatif", async () => { // Allocation (cas 2)
    await depense(60000); // Dépense
    const erreur = await supprimerOperation(base, await idAlimentation()).catch((e) => e); // Tente de supprimer l'unique allocation
    expect(erreur).toBeInstanceOf(ErreurMetier); // Refusé
    expect(erreur.message).toMatch(/Supprimez d'abord ces dépenses/); // Explication
    expect(await soldeAllocation(base, allocationId)).toBe(40000); // Rien n'a changé
  }); // Fin du cas

  it("supprime l'allocation vide quand sa dernière opération disparaît : le budget redevient non alloué et supprimable", async () => { // Allocation vide
    await supprimerOperation(base, await idAlimentation()); // Supprime l'unique opération
    expect((await resumeBudgets(base, MAINTENANT))[0].allocation).toBeNull(); // Budget non alloué
    await expect(supprimerBudget(base, budgetId)).resolves.not.toThrow(); // Le budget peut être supprimé
  }); // Fin du cas

  it("refuse une opération inexistante", async () => { // Introuvable
    await expect(supprimerOperation(base, 999)).rejects.toThrow(/n'existe plus/); // Message
    await expect(modifierOperation(base, 999, { montant: 1 }, MAINTENANT)).rejects.toThrow(/n'existe plus/); // Message
  }); // Fin du cas

  it("refuse de toucher une opération issue d'un SMS", async () => { // Opération automatique
    const id = await creerTransaction(base, { trxId: "OM1", allocationId, insertType: "auto", debitCredit: -1, montant: 500, sms: "texte du SMS" }); // Dépense venant d'un SMS
    await expect(supprimerOperation(base, id)).rejects.toThrow(/SMS/); // Suppression refusée
    await expect(modifierOperation(base, id, { montant: 1, dateOperation: MAINTENANT.toISOString() }, MAINTENANT)).rejects.toThrow(/SMS/); // Modification refusée
  }); // Fin du cas

  it("refuse de toucher une opération non classée", async () => { // Sans budget
    const id = await creerTransaction(base, { debitCredit: -1, montant: 500 }); // Non classée
    await expect(supprimerOperation(base, id)).rejects.toThrow(/aucun budget/); // Refusée
  }); // Fin du cas
}); // Fin du groupe

describe("lireOperationDetaillee", () => { // Lecture pour le formulaire
  it("renvoie l'opération avec le nom du budget, ou null", async () => { // Lecture
    const id = await depense(1000, 25, "Essence"); // Dépense
    expect(await lireOperationDetaillee(base, id)).toMatchObject({ id, montant: 1000, note: "Essence", budgetName: "Sorties", debitCredit: -1 }); // Détails
    expect(await lireOperationDetaillee(base, 999)).toBeNull(); // Introuvable
  }); // Fin du cas
}); // Fin du groupe
