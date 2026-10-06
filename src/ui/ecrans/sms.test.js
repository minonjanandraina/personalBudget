// @vitest-environment jsdom
// Tests d'intégration des écrans SMS Orange Money (faux accès aux SMS, vraie logique et vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, creerBudgetDeTest } from "../../core/db/aide-tests.js"; // Base neuve et budget
import { allouerBudget } from "../../core/allocations.js"; // Allocation
import { listerNonClassees } from "../../core/import-sms.js"; // Liste des dépenses à classer
import { SMS_EXEMPLES } from "../../platform/sms-exemples.js"; // SMS réels
import { afficherSms, afficherFormulaireClasser, synchroniserAuDemarrage, decrireBilan } from "./sms.js"; // Écrans à tester

let base; // Base de chaque cas
let zone; // Zone où l'écran est dessiné
const APRES = new Date("2026-10-05T10:00:00.000Z"); // Heure des SMS d'exemple

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  await base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-05T06:00:00.000Z', 1000000)"); // Solde initial
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
}); // Fin de la préparation

const faux = (autorise = true) => ({ lireSmsOM: vi.fn(async () => SMS_EXEMPLES(APRES)), autoriseSansDemander: vi.fn(async () => autorise) }); // Faux accès aux SMS
const toucher = (texte) => { [...zone.querySelectorAll("button")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton

describe("écran SMS Orange Money", () => { // Groupe
  it("décrit le bilan d'une synchronisation", () => { // Phrase
    expect(decrireBilan({ importes: 0, illisibles: 0 })).toBe("Aucune nouvelle opération."); // Rien de neuf
    expect(decrireBilan({ importes: 1, illisibles: 2 })).toBe("1 nouvelle opération, 2 SMS non compris."); // Singulier et SMS non compris
    expect(decrireBilan({ importes: 5, illisibles: 0 })).toBe("5 nouvelles opérations."); // Pluriel
  }); // Fin du cas

  it("synchronise au toucher du bouton puis liste les dépenses à classer et le SMS non compris", async () => { // Cas nominal
    const sms = faux(); // Faux accès
    await afficherSms(zone, { base, sms }); // Écran
    expect(zone.textContent).toContain("Aucune dépense à classer"); // Vide au départ
    toucher("Synchroniser maintenant"); // Touche le bouton
    await vi.waitFor(() => expect(zone.textContent).toContain("À classer (4)")); // Cinq dépenses listées
    expect(zone.textContent).toContain("SMS non compris (1)"); // Un SMS non compris
    expect(sms.lireSmsOM).toHaveBeenCalledWith({ expediteur: "OrangeMoney", depuis: "2026-10-05T06:00:00.000Z" }); // Bons paramètres de lecture
  }); // Fin du cas

  it("explique l'erreur quand il n'y a pas de solde initial", async () => { // Message clair
    await base.executer("DELETE FROM solde_om"); // Plus de solde
    await afficherSms(zone, { base, sms: faux() }); // Écran
    toucher("Synchroniser maintenant"); // Touche le bouton
    await vi.waitFor(() => expect(document.querySelector(".toast-erreur").textContent).toContain("solde initial")); // Message
  }); // Fin du cas

  it("ignore un SMS non compris", async () => { // Revue
    await afficherSms(zone, { base, sms: faux() }); // Écran
    toucher("Synchroniser maintenant"); // Importe
    await vi.waitFor(() => expect(zone.textContent).toContain("SMS non compris (1)")); // Affiché
    toucher("Ignorer ce SMS"); // Ignore
    await vi.waitFor(() => expect(zone.textContent).not.toContain("SMS non compris")); // Disparu
  }); // Fin du cas
}); // Fin du groupe

describe("synchronisation à l'ouverture", () => { // Groupe
  it("ne fait rien tant que la permission n'est pas accordée", async () => { // Pas de demande surprise
    const sms = faux(false); // Permission non accordée
    expect(await synchroniserAuDemarrage(base, sms)).toBeNull(); // Rien
    expect(sms.lireSmsOM).not.toHaveBeenCalled(); // Aucune lecture
  }); // Fin du cas

  it("importe quand la permission est accordée, et ne plante jamais", async () => { // Cas nominal
    expect((await synchroniserAuDemarrage(base, faux())).importes).toBe(4); // Import
    const casse = { autoriseSansDemander: async () => true, lireSmsOM: async () => { throw new Error("boom"); } }; // Lecture en panne
    expect(await synchroniserAuDemarrage(base, casse)).toBeNull(); // Erreur avalée
  }); // Fin du cas
}); // Fin du groupe

describe("formulaire de classement", () => { // Groupe
  it("classe la dépense dans le budget choisi", async () => { // Cas nominal
    const { budgetId } = await creerBudgetDeTest(base); // Budget
    await allouerBudget(base, { budgetId, montant: 20000 }, APRES); // Alloué
    await afficherSms(zone, { base, sms: faux() }); // Écran
    toucher("Synchroniser maintenant"); // Importe
    await vi.waitFor(() => expect(zone.textContent).toContain("À classer (4)")); // Importé
    const id = (await listerNonClassees(base)).find((t) => t.montant === 500).id; // Une petite dépense
    zone.replaceChildren(); // Nouvel écran
    await afficherFormulaireClasser(zone, { base, params: { id: String(id) } }); // Formulaire
    zone.querySelector("select").value = String(budgetId); // Choisit le budget
    toucher("Classer dans ce budget"); // Valide
    await vi.waitFor(async () => expect(await listerNonClassees(base)).toHaveLength(4)); // Classée
  }); // Fin du cas

  it("refuse une opération qui ne vient pas d'un SMS", async () => { // Garde-fou
    await afficherFormulaireClasser(zone, { base, params: { id: "999" } }); // Identifiant inconnu
    expect(zone.textContent).toContain("ne vient pas d'un SMS"); // Message
  }); // Fin du cas
}); // Fin du groupe
