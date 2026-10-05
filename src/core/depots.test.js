import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget, listerTypesBudget, formaterCodeType } from "./types-budget.js"; // Types de budget
import { creerTransaction, genererTrxIdManuel } from "./transactions.js"; // Transactions
import { lireJourJob, modifierJourJob } from "./parametres.js"; // Paramètres

let base; // Base utilisée par les cas de test
beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
}); // Fin de la préparation

describe("types de budget", () => { // Code automatique bdg-001
  it("formate le code sur 3 chiffres", () => { // Cas : mise en forme
    expect(formaterCodeType(1)).toBe("bdg-001"); // 1 devient bdg-001
    expect(formaterCodeType(42)).toBe("bdg-042"); // 42 devient bdg-042
    expect(formaterCodeType(1000)).toBe("bdg-1000"); // Au-delà de 999, on garde tous les chiffres
  }); // Fin du cas

  it("génère des codes qui se suivent", async () => { // Cas : numérotation
    await creerTypeBudget(base, { name: "A" }); // Premier type
    await creerTypeBudget(base, { name: "B" }); // Deuxième type
    expect((await listerTypesBudget(base)).map((t) => t.code)).toEqual(["bdg-001", "bdg-002"]); // Codes dans l'ordre
  }); // Fin du cas

  it("ne réutilise jamais un code après suppression", async () => { // Cas : codes jamais recyclés
    await creerTypeBudget(base, { name: "A" }); // bdg-001
    await creerTypeBudget(base, { name: "B" }); // bdg-002
    await base.executer("DELETE FROM type_budget WHERE code = 'bdg-002'"); // Supprime le dernier
    await creerTypeBudget(base, { name: "C" }); // Nouveau type
    expect((await listerTypesBudget(base)).map((t) => t.code)).toEqual(["bdg-001", "bdg-003"]); // bdg-002 n'est pas recyclé
  }); // Fin du cas

  it("refuse un nom vide", async () => { // Cas : nom obligatoire
    await expect(creerTypeBudget(base, { name: "   " })).rejects.toThrow(); // Refusé
  }); // Fin du cas

  it("annule tout en cas d'erreur (pas de numéro perdu ni de ligne à moitié créée)", async () => { // Cas : tout ou rien
    await expect(creerTypeBudget(base, { name: "" })).rejects.toThrow(); // Échec
    expect(await listerTypesBudget(base)).toHaveLength(0); // Aucune ligne créée
    await creerTypeBudget(base, { name: "A" }); // Création suivante
    expect((await listerTypesBudget(base))[0].code).toBe("bdg-001"); // Le premier code reste bdg-001
  }); // Fin du cas
}); // Fin du groupe

describe("transactions", () => { // Identifiant automatique
  it("génère un trx_id MAN-XXXXXXXXXXXX", () => { // Cas : format
    expect(genererTrxIdManuel()).toMatch(/^MAN-[0-9A-F]{12}$/); // Préfixe + 12 caractères hexadécimaux
  }); // Fin du cas

  it("génère des identifiants différents", () => { // Cas : unicité pratique
    expect(genererTrxIdManuel()).not.toBe(genererTrxIdManuel()); // Deux appels, deux valeurs
  }); // Fin du cas

  it("crée une transaction manuelle avec un trx_id généré", async () => { // Cas : saisie manuelle
    const id = await creerTransaction(base, { debitCredit: -1, montant: 500 }); // Crée sans trx_id
    const [ligne] = await base.requeter("SELECT * FROM transactions WHERE id = ?", [id]); // Relit la ligne
    expect(ligne.trx_id).toMatch(/^MAN-/); // ID généré
    expect(ligne.insert_type).toBe("manuel"); // Type manuel par défaut
    expect(ligne.sms).toBeNull(); // Pas de SMS
    expect(ligne.allocation_id).toBeNull(); // Non classée
  }); // Fin du cas

  it("garde le trx_id et le SMS d'une transaction automatique", async () => { // Cas : import SMS
    const id = await creerTransaction(base, { trxId: "OM123", insertType: "auto", debitCredit: 1, montant: 2000, sms: "texte du SMS" }); // Crée depuis un SMS
    const [ligne] = await base.requeter("SELECT trx_id, sms FROM transactions WHERE id = ?", [id]); // Relit
    expect(ligne).toEqual({ trx_id: "OM123", sms: "texte du SMS" }); // Valeurs conservées
  }); // Fin du cas
}); // Fin du groupe

describe("paramètres du job", () => { // Jour de lancement
  it("vaut 20 par défaut", async () => { // Cas : défaut
    expect(await lireJourJob(base)).toBe(20); // 20
  }); // Fin du cas

  it("peut être modifié entre 1 et 28 seulement", async () => { // Cas : bornes
    await modifierJourJob(base, 5); // Change le jour
    expect(await lireJourJob(base)).toBe(5); // Nouvelle valeur
    await expect(modifierJourJob(base, 31)).rejects.toThrow(); // 31 refusé
    expect(await lireJourJob(base)).toBe(5); // Valeur inchangée
  }); // Fin du cas
}); // Fin du groupe
