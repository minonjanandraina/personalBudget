import { describe, it, expect } from "vitest"; // Outils de test : groupe, cas, vérification

describe("formaterMontant", () => { // Groupe de tests pour la fonction de formatage
  it("sépare les milliers par des espaces", async () => { // Cas : grands montants
    const { formaterMontant } = await import("./format.js"); // Charge la fonction à tester
    expect(formaterMontant(1234567)).toBe("1 234 567 Ar"); // Vérifie le résultat attendu
    expect(formaterMontant(100000)).toBe("100 000 Ar"); // Vérifie un montant rond
  }); // Fin du cas

  it("laisse les petits montants intacts", async () => { // Cas : moins de 1000
    const { formaterMontant } = await import("./format.js"); // Charge la fonction à tester
    expect(formaterMontant(0)).toBe("0 Ar"); // Zéro reste zéro
    expect(formaterMontant(999)).toBe("999 Ar"); // Pas de séparateur sous 1000
  }); // Fin du cas

  it("garde le signe des montants négatifs", async () => { // Cas : dépenses
    const { formaterMontant } = await import("./format.js"); // Charge la fonction à tester
    expect(formaterMontant(-40000)).toBe("-40 000 Ar"); // Le moins reste devant
  }); // Fin du cas

  it("refuse les montants à virgule", async () => { // Cas : règle « jamais de float »
    const { formaterMontant } = await import("./format.js"); // Charge la fonction à tester
    expect(() => formaterMontant(10.5)).toThrow(); // Doit lever une erreur
  }); // Fin du cas
}); // Fin du groupe
