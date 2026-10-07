import { describe, it, expect } from "vitest"; // Outils de test
import { creerBaseDeTest, creerBudgetDeTest } from "./db/aide-tests.js"; // Base neuve et budget d'exemple
import { listerTypesBudget } from "./types-budget.js"; // Types
import { listerBudgets } from "./budgets.js"; // Budgets
import { installerValeursParDefaut, TYPES_PAR_DEFAUT, BUDGETS_PAR_DEFAUT } from "./valeurs-par-defaut.js"; // Fonction à tester

describe("valeurs par défaut", () => { // Installation à la première ouverture
  it("crée les types et les budgets sur une base vierge, avec allocation automatique", async () => { // Cas nominal
    const base = await creerBaseDeTest(); // Base vierge
    expect(await installerValeursParDefaut(base)).toBe(true); // Quelque chose créé
    const types = await listerTypesBudget(base); // Types créés
    expect(types.map((t) => t.name)).toEqual(TYPES_PAR_DEFAUT); // Tous les types, dans l'ordre
    expect(types[0].code).toBe("bdg-001"); // Codes générés
    const budgets = await listerBudgets(base); // Budgets créés
    expect(budgets).toHaveLength(BUDGETS_PAR_DEFAUT.length); // Tous les budgets
    expect(budgets.every((b) => b.autogenFinMois)).toBe(true); // Auto = oui partout
  }); // Fin du cas
  it("ne recrée rien au lancement suivant, même si tout a été supprimé", async () => { // Une seule fois
    const base = await creerBaseDeTest(); // Base vierge
    await installerValeursParDefaut(base); // Première fois
    await base.executer("DELETE FROM budget"); // L'utilisateur supprime les budgets
    await base.executer("DELETE FROM type_budget"); // et les types
    expect(await installerValeursParDefaut(base)).toBe(false); // Rien de recréé
    expect(await listerBudgets(base)).toEqual([]); // Toujours vide
  }); // Fin du cas
  it("ne touche pas une base déjà utilisée", async () => { // Mise à jour de l'application avec des données
    const base = await creerBaseDeTest(); // Base vierge
    await creerBudgetDeTest(base); // L'utilisateur avait déjà un type et un budget
    expect(await installerValeursParDefaut(base)).toBe(false); // Rien créé
    expect(await listerTypesBudget(base)).toHaveLength(1); // Toujours un seul type
  }); // Fin du cas
}); // Fin du groupe
