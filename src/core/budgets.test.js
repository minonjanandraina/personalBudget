import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget, modifierTypeBudget, supprimerTypeBudget, listerTypesAvecCompte, lireTypeBudget, validerNom } from "./types-budget.js"; // Types
import { creerBudget, modifierBudget, supprimerBudget, listerBudgets, lireBudget, validerBudget } from "./budgets.js"; // Budgets
import { ErreurValidation, ErreurMetier } from "./erreurs.js"; // Erreurs

let base; // Base utilisée par les cas de test
let typeId; // Identifiant d'un type de budget prêt à l'emploi
beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

// Données valides d'un budget, modifiables par « surcharges ».
const donnees = (surcharges = {}) => ({ name: "Sorties", typeId, montantBudget: 100000, montantMax: 150000, montantMin: 0, soldeAlert: 10000, autogenFinMois: false, ...surcharges }); // Valeurs par défaut

describe("types de budget (saisie)", () => { // Validation et modification des types
  it("nettoie le nom et refuse un nom vide ou trop long", () => { // Validation du nom
    expect(validerNom("  Loisir  ")).toBe("Loisir"); // Espaces retirés
    expect(() => validerNom("   ")).toThrow(ErreurValidation); // Vide refusé
    expect(() => validerNom("x".repeat(101))).toThrow(ErreurValidation); // Trop long refusé
  }); // Fin du cas

  it("modifie le nom sans changer le code", async () => { // Modification
    await modifierTypeBudget(base, typeId, { name: "Sorties & loisirs" }); // Change le nom
    expect(await lireTypeBudget(base, typeId)).toEqual({ id: typeId, code: "bdg-001", name: "Sorties & loisirs" }); // Nom changé, code intact
  }); // Fin du cas

  it("refuse de modifier un type qui n'existe plus", async () => { // Type disparu
    await expect(modifierTypeBudget(base, 999, { name: "X" })).rejects.toThrow(ErreurMetier); // Refusé
  }); // Fin du cas

  it("compte les budgets de chaque type", async () => { // Comptage
    await creerBudget(base, donnees()); // Un budget sur le type
    const autre = await creerTypeBudget(base, { name: "Scolarité" }); // Un deuxième type sans budget
    const liste = await listerTypesAvecCompte(base); // Liste avec comptage
    expect(liste.map((t) => [t.name, t.nbBudgets])).toEqual([["Loisir", 1], ["Scolarité", 0]]); // 1 budget et 0 budget
    expect(autre).toBeGreaterThan(typeId); // Le deuxième type a un identifiant plus grand
  }); // Fin du cas

  it("supprime un type inutilisé mais refuse un type utilisé", async () => { // Suppression
    await creerBudget(base, donnees()); // Rend le type utilisé
    await expect(supprimerTypeBudget(base, typeId)).rejects.toThrow(/1 budget/); // Refus avec message clair
    const libre = await creerTypeBudget(base, { name: "Libre" }); // Type sans budget
    await supprimerTypeBudget(base, libre); // Suppression acceptée
    expect(await lireTypeBudget(base, libre)).toBeNull(); // Le type n'existe plus
  }); // Fin du cas
}); // Fin du groupe

describe("validerBudget", () => { // Validation pure (sans base)
  it("ne trouve aucune erreur pour un budget valide", () => { // Cas valide
    expect(validerBudget(donnees())).toEqual({}); // Aucune erreur
  }); // Fin du cas

  it("exige un nom et un type", () => { // Champs obligatoires
    const e = validerBudget(donnees({ name: " ", typeId: null })); // Données incomplètes
    expect(e.name).toBeDefined(); // Erreur sur le nom
    expect(e.typeId).toBeDefined(); // Erreur sur le type
  }); // Fin du cas

  it("refuse montants négatifs, à virgule ou non numériques", () => { // Montants
    const e = validerBudget(donnees({ montantBudget: -1, montantMax: 10.5, montantMin: "5", soldeAlert: NaN })); // Valeurs invalides
    expect(Object.keys(e).sort()).toEqual(["montantBudget", "montantMax", "montantMin", "soldeAlert"]); // Une erreur par champ
  }); // Fin du cas

  it("refuse un minimum au-dessus du plafond", () => { // Règle montant_min <= montant_max
    expect(validerBudget(donnees({ montantMin: 200000 })).montantMin).toMatch(/plafond/); // Message sur le minimum
  }); // Fin du cas

  it("refuse un montant mensuel au-dessus du plafond", () => { // Règle montant_budget <= montant_max
    expect(validerBudget(donnees({ montantBudget: 200000 })).montantBudget).toMatch(/plafond/); // Message sur le montant mensuel
  }); // Fin du cas

  it("accepte un minimum ou un montant égal au plafond", () => { // Cas limites
    expect(validerBudget(donnees({ montantMin: 150000, montantBudget: 150000 }))).toEqual({}); // Égalité acceptée
  }); // Fin du cas
}); // Fin du groupe

describe("budgets (base)", () => { // Création, lecture, modification, suppression
  it("crée un budget et le relit avec le nom de son type", async () => { // Création
    const id = await creerBudget(base, donnees({ autogenFinMois: true })); // Crée
    expect(await lireBudget(base, id)).toEqual({ id, name: "Sorties", typeId, typeName: "Loisir", montantBudget: 100000, montantMax: 150000, montantMin: 0, soldeAlert: 10000, autogenFinMois: true }); // Relecture complète
  }); // Fin du cas

  it("refuse un budget invalide avec le détail des champs, sans rien écrire", async () => { // Refus
    const erreur = await creerBudget(base, donnees({ montantMin: 999999 })).catch((e) => e); // Capture l'erreur
    expect(erreur).toBeInstanceOf(ErreurValidation); // Erreur de saisie
    expect(erreur.erreurs.montantMin).toBeDefined(); // Détail sur le bon champ
    expect(await listerBudgets(base)).toHaveLength(0); // Rien n'a été créé
  }); // Fin du cas

  it("refuse un type qui n'existe pas", async () => { // Type inexistant
    const erreur = await creerBudget(base, donnees({ typeId: 999 })).catch((e) => e); // Capture l'erreur
    expect(erreur.erreurs.typeId).toMatch(/n'existe pas/); // Message sur le type
  }); // Fin du cas

  it("nettoie le nom à l'enregistrement", async () => { // Nom nettoyé
    const id = await creerBudget(base, donnees({ name: "  Écolage  " })); // Crée avec des espaces
    expect((await lireBudget(base, id)).name).toBe("Écolage"); // Espaces retirés
  }); // Fin du cas

  it("liste les budgets par nom", async () => { // Tri
    await creerBudget(base, donnees({ name: "Zèbre" })); // Budget Z
    await creerBudget(base, donnees({ name: "Alpha" })); // Budget A
    expect((await listerBudgets(base)).map((b) => b.name)).toEqual(["Alpha", "Zèbre"]); // Ordre alphabétique
  }); // Fin du cas

  it("modifie un budget", async () => { // Modification
    const id = await creerBudget(base, donnees()); // Crée
    await modifierBudget(base, id, donnees({ name: "Cinéma", montantBudget: 50000, autogenFinMois: true })); // Modifie
    const b = await lireBudget(base, id); // Relit
    expect([b.name, b.montantBudget, b.autogenFinMois]).toEqual(["Cinéma", 50000, true]); // Changements pris en compte
  }); // Fin du cas

  it("refuse de modifier un budget invalide ou disparu", async () => { // Refus
    const id = await creerBudget(base, donnees()); // Crée
    await expect(modifierBudget(base, id, donnees({ montantMax: 1 }))).rejects.toThrow(ErreurValidation); // Données invalides
    await expect(modifierBudget(base, 999, donnees())).rejects.toThrow(ErreurMetier); // Budget inexistant
    expect((await lireBudget(base, id)).montantMax).toBe(150000); // La valeur d'origine est conservée
  }); // Fin du cas

  it("supprime un budget sans allocation", async () => { // Suppression
    const id = await creerBudget(base, donnees()); // Crée
    await supprimerBudget(base, id); // Supprime
    expect(await lireBudget(base, id)).toBeNull(); // N'existe plus
  }); // Fin du cas

  it("refuse de supprimer un budget qui a des allocations", async () => { // Suppression refusée
    const id = await creerBudget(base, donnees()); // Crée
    await base.executer("INSERT INTO allocation_budget (budget_id, date_from, date_to, montant_alloue) VALUES (?, '2026-10-01', '2026-10-31', 1000)", [id]); // Lui ajoute une allocation
    await expect(supprimerBudget(base, id)).rejects.toThrow(/allocation/); // Refus avec message clair
    expect(await lireBudget(base, id)).not.toBeNull(); // Le budget existe toujours
  }); // Fin du cas
}); // Fin du groupe
