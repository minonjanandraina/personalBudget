import { describe, it, expect, beforeEach } from "vitest"; // Outils de test (beforeEach = avant chaque cas)
import { creerBaseDeTest, creerBudgetDeTest } from "./aide-tests.js"; // Fabrique de bases de test

let base; // Base utilisée par les cas de test
beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve et vide
}); // Fin de la préparation

describe("solde_om", () => { // Règles du solde Mobile Money
  it("accepte un solde entier positif", async () => { // Cas valide
    await base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-01T08:00:00.000Z', 250000)"); // Insère
    const lignes = await base.requeter("SELECT balance, insert_date FROM solde_om"); // Relit
    expect(lignes[0].balance).toBe(250000); // Montant conservé
    expect(lignes[0].insert_date).toMatch(/^\d{4}-\d{2}-\d{2}T/); // La date d'insertion est remplie automatiquement
  }); // Fin du cas

  it("refuse un solde négatif ou à virgule", async () => { // Cas invalides
    await expect(base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-01T08:00:00.000Z', -1)")).rejects.toThrow(); // Négatif refusé
    await expect(base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-01T08:00:00.000Z', 10.5)")).rejects.toThrow(); // Virgule refusée
  }); // Fin du cas
}); // Fin du groupe

describe("budget", () => { // Règles des budgets
  it("accepte un budget valide", async () => { // Cas valide
    const { budgetId } = await creerBudgetDeTest(base); // Crée type + budget
    expect(budgetId).toBeGreaterThan(0); // Un identifiant a été attribué
  }); // Fin du cas

  it("refuse montant_min > montant_max", async () => { // Règle du minimum
    await expect(creerBudgetDeTest(base, { montant_min: 200000 })).rejects.toThrow(); // Minimum au-dessus du plafond refusé
  }); // Fin du cas

  it("refuse montant_budget > montant_max", async () => { // Règle du montant mensuel
    await expect(creerBudgetDeTest(base, { montant_budget: 200000 })).rejects.toThrow(); // Montant mensuel au-dessus du plafond refusé
  }); // Fin du cas

  it("refuse les montants négatifs ou à virgule", async () => { // Montants entiers positifs
    await expect(creerBudgetDeTest(base, { solde_alert: -5 })).rejects.toThrow(); // Négatif refusé
    await expect(creerBudgetDeTest(base, { montant_budget: 99.5 })).rejects.toThrow(); // Virgule refusée
  }); // Fin du cas

  it("refuse un type inexistant (liens entre tables contrôlés)", async () => { // Clé étrangère
    await expect(base.executer("INSERT INTO budget (name, type_id, montant_budget, montant_max) VALUES ('X', 999, 1, 2)")).rejects.toThrow(); // Type 999 n'existe pas
  }); // Fin du cas

  it("refuse de supprimer un type utilisé par un budget", async () => { // ON DELETE RESTRICT
    const { typeId } = await creerBudgetDeTest(base); // Crée un type utilisé
    await expect(base.executer("DELETE FROM type_budget WHERE id = ?", [typeId])).rejects.toThrow(); // Suppression refusée
  }); // Fin du cas
}); // Fin du groupe

describe("allocation_budget", () => { // Règles des allocations
  const ajouter = (b, id, debut, fin, montant = 1000) => b.executer( // Petite aide pour insérer une allocation
    "INSERT INTO allocation_budget (budget_id, date_from, date_to, montant_alloue) VALUES (?, ?, ?, ?)", // Requête
    [id, debut, fin, montant], // Valeurs
  ); // Fin de l'aide

  it("accepte une allocation valide", async () => { // Cas valide
    const { budgetId } = await creerBudgetDeTest(base); // Crée un budget
    await expect(ajouter(base, budgetId, "2026-10-01", "2026-10-31")).resolves.toBeTruthy(); // Insertion acceptée
  }); // Fin du cas

  it("refuse une fin avant le début", async () => { // Dates incohérentes
    const { budgetId } = await creerBudgetDeTest(base); // Crée un budget
    await expect(ajouter(base, budgetId, "2026-10-20", "2026-10-01")).rejects.toThrow(); // Refusé
  }); // Fin du cas

  it("refuse deux allocations pour le même budget et la même période", async () => { // Unicité
    const { budgetId } = await creerBudgetDeTest(base); // Crée un budget
    await ajouter(base, budgetId, "2026-10-01", "2026-10-31"); // Première allocation
    await expect(ajouter(base, budgetId, "2026-10-01", "2026-10-31")).rejects.toThrow(); // Doublon refusé
  }); // Fin du cas

  it("refuse de supprimer un budget qui a des allocations", async () => { // ON DELETE RESTRICT
    const { budgetId } = await creerBudgetDeTest(base); // Crée un budget
    await ajouter(base, budgetId, "2026-10-01", "2026-10-31"); // Lui ajoute une allocation
    await expect(base.executer("DELETE FROM budget WHERE id = ?", [budgetId])).rejects.toThrow(); // Suppression refusée
  }); // Fin du cas

  it("refuse un budget inexistant", async () => { // Clé étrangère
    await expect(ajouter(base, 999, "2026-10-01", "2026-10-31")).rejects.toThrow(); // Budget 999 n'existe pas
  }); // Fin du cas
}); // Fin du groupe

describe("transactions", () => { // Règles des transactions
  const ajouter = (b, v) => b.executer( // Petite aide pour insérer une transaction
    "INSERT INTO transactions (trx_id, insert_type, debit_credit, montant, sms) VALUES (?, ?, ?, ?, ?)", // Requête
    [v.trx ?? "T1", v.type ?? "manuel", v.dc ?? -1, v.montant ?? 500, v.sms ?? null], // Valeurs avec défauts
  ); // Fin de l'aide

  it("accepte une transaction valide non classée", async () => { // Allocation vide = non classée
    await expect(ajouter(base, {})).resolves.toBeTruthy(); // Acceptée
  }); // Fin du cas

  it("refuse un trx_id en double", async () => { // Unicité du trx_id
    await ajouter(base, { trx: "X1" }); // Première
    await expect(ajouter(base, { trx: "X1" })).rejects.toThrow(); // Doublon refusé
  }); // Fin du cas

  it("refuse debit_credit autre que -1 ou 1", async () => { // Sens de l'opération
    await expect(ajouter(base, { dc: 0 })).rejects.toThrow(); // 0 refusé
    await expect(ajouter(base, { dc: 2, trx: "T2" })).rejects.toThrow(); // 2 refusé
  }); // Fin du cas

  it("refuse un montant nul, négatif ou à virgule", async () => { // Montant strictement positif entier
    await expect(ajouter(base, { montant: 0 })).rejects.toThrow(); // Zéro refusé
    await expect(ajouter(base, { montant: -5, trx: "T2" })).rejects.toThrow(); // Négatif refusé
    await expect(ajouter(base, { montant: 1.5, trx: "T3" })).rejects.toThrow(); // Virgule refusée
  }); // Fin du cas

  it("refuse un type d'insertion inconnu", async () => { // manuel ou auto seulement
    await expect(ajouter(base, { type: "robot" })).rejects.toThrow(); // Refusé
  }); // Fin du cas

  it("n'accepte un SMS que pour une transaction automatique", async () => { // Règle du champ sms
    await expect(ajouter(base, { type: "manuel", sms: "texte" })).rejects.toThrow(); // Manuel + SMS refusé
    await expect(ajouter(base, { type: "auto", sms: "texte", trx: "T2" })).resolves.toBeTruthy(); // Auto + SMS accepté
  }); // Fin du cas

  it("refuse une allocation inexistante", async () => { // Clé étrangère
    await expect(base.executer("INSERT INTO transactions (trx_id, allocation_id, insert_type, debit_credit, montant) VALUES ('Z', 999, 'manuel', 1, 10)")).rejects.toThrow(); // Allocation 999 n'existe pas
  }); // Fin du cas
}); // Fin du groupe

describe("parametre_job", () => { // Règles de la ligne unique de paramètres
  it("existe dès le départ avec le jour 20", async () => { // Valeur par défaut
    const lignes = await base.requeter("SELECT id, start_day_int FROM parametre_job"); // Lit la table
    expect(lignes).toEqual([{ id: 1, start_day_int: 20 }]); // Une seule ligne, jour 20
  }); // Fin du cas

  it("refuse une deuxième ligne", async () => { // Ligne unique
    await expect(base.executer("INSERT INTO parametre_job (id, start_day_int) VALUES (2, 10)")).rejects.toThrow(); // id 2 refusé
  }); // Fin du cas

  it("refuse la suppression de la ligne", async () => { // Non supprimable
    await expect(base.executer("DELETE FROM parametre_job")).rejects.toThrow(); // Refusée
  }); // Fin du cas

  it("refuse un jour hors de 1 à 28", async () => { // Bornes
    await expect(base.executer("UPDATE parametre_job SET start_day_int = 29")).rejects.toThrow(); // 29 refusé
    await expect(base.executer("UPDATE parametre_job SET start_day_int = 0")).rejects.toThrow(); // 0 refusé
  }); // Fin du cas
}); // Fin du groupe
