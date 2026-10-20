// @vitest-environment jsdom
// Tests d'intégration des écrans SMS Mobile Money (faux accès aux SMS, vraie logique et vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, creerBudgetDeTest } from "../../core/db/aide-tests.js"; // Base neuve et budget
import { allouerBudget } from "../../core/allocations.js"; // Allocation
import { listerNonClassees } from "../../core/import-sms.js"; // Liste des dépenses à classer
import { SMS_EXEMPLES } from "../../platform/sms-exemples.js"; // SMS réels
import { afficherSms, afficherFormulaireClasser, synchroniserAuDemarrage, decrireBilan, construireIconeSms } from "./sms.js"; // Écrans à tester

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

const faux = (autorise = true) => ({ lireSmsMM: vi.fn(async () => SMS_EXEMPLES(APRES)), autoriseSansDemander: vi.fn(async () => autorise) }); // Faux accès aux SMS
const toucher = (texte) => { [...zone.querySelectorAll("button")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton

describe("écran SMS Mobile Money", () => { // Groupe
  it("décrit le bilan d'une synchronisation", () => { // Phrase
    expect(decrireBilan({ importes: 0, illisibles: 0 })).toBe("Aucune nouvelle opération."); // Rien de neuf
    expect(decrireBilan({ importes: 1, illisibles: 2 })).toBe("1 nouvelle opération, 2 SMS non compris."); // Singulier et SMS non compris
    expect(decrireBilan({ importes: 5, illisibles: 0 })).toBe("5 nouvelles opérations."); // Pluriel
  }); // Fin du cas

  it("synchronise au toucher du bouton puis liste les dépenses à classer et le SMS non compris", async () => { // Cas nominal
    const sms = faux(); // Faux accès
    const icone = construireIconeSms(base); // Icône des SMS (contient les listes)
    document.body.append(...icone.elements); // La place dans la page
    await afficherSms(zone, { base, sms }); // Écran
    toucher("Synchroniser maintenant"); // Touche le bouton
    await vi.waitFor(() => expect(document.querySelector(".cloche-sms .cloche-badge").textContent).toBe("5")); // Synchronisé
    document.querySelector(".cloche-sms").click(); // Ouvre le panneau
    await vi.waitFor(() => expect(document.body.textContent).toContain("À classer (4)")); // Quatre dépenses listées
    expect(document.body.textContent).toContain("SMS non compris (1)"); // Un SMS non compris
    expect(sms.lireSmsMM).toHaveBeenCalledWith({ expediteur: "OrangeMoney", depuis: "2026-10-05T06:00:00.000Z" }); // Bons paramètres de lecture
  }); // Fin du cas

  it("explique l'erreur quand il n'y a pas de solde initial", async () => { // Message clair
    await base.executer("DELETE FROM solde_om"); // Plus de solde
    await afficherSms(zone, { base, sms: faux() }); // Écran
    toucher("Synchroniser maintenant"); // Touche le bouton
    await vi.waitFor(() => expect(document.querySelector(".toast-erreur").textContent).toContain("solde initial")); // Message
  }); // Fin du cas

  it("ignore un SMS non compris depuis le panneau", async () => { // Revue
    const icone = construireIconeSms(base); // Icône des SMS (contient les listes)
    document.body.append(...icone.elements); // La place dans la page
    await afficherSms(zone, { base, sms: faux() }); // Écran
    toucher("Synchroniser maintenant"); // Importe
    await vi.waitFor(() => expect(document.querySelector(".cloche-sms .cloche-badge").textContent).toBe("5")); // Synchronisé
    document.querySelector(".cloche-sms").click(); // Ouvre le panneau
    await vi.waitFor(() => expect(document.querySelector(".panneau-alertes").textContent).toContain("SMS non compris (1)")); // Affiché
    [...document.querySelectorAll(".panneau-alertes button")].find((b) => b.textContent.trim() === "Ignorer ce SMS").click(); // Ignore
    await vi.waitFor(() => expect(document.querySelector(".panneau-alertes").textContent).not.toContain("SMS non compris")); // Disparu
  }); // Fin du cas
}); // Fin du groupe

describe("icône des SMS à traiter", () => { // Regroupement des SMS à classer et non compris
  let icone; // Icône construite comme le fait la coque
  const pastille = () => document.querySelector(".cloche-sms .cloche-badge"); // Pastille de l'icône
  beforeEach(async () => { // Avant chaque cas
    icone = construireIconeSms(base); // Construit l'icône
    document.body.append(...icone.elements); // La place dans la page, comme la coque
    await icone.rafraichir(); // Premier comptage
  }); // Fin de la préparation

  it("cache la pastille quand tout est classé, puis affiche le total après synchronisation", async () => { // Pastille
    await afficherSms(zone, { base, sms: faux() }); // Écran
    expect(pastille().hidden).toBe(true); // Rien à traiter
    expect(zone.textContent).toContain("Rien à traiter"); // Phrase de résumé
    toucher("Synchroniser maintenant"); // Importe
    await vi.waitFor(() => expect(pastille().textContent).toBe("5")); // 4 à classer + 1 non compris
    expect(pastille().classList.contains("cloche-badge-danger")).toBe(true); // Rouge : un SMS non compris
    await vi.waitFor(() => expect(zone.textContent).toContain("4 dépenses à classer, 1 SMS non compris")); // Résumé
  }); // Fin du cas

  it("ouvre un panneau avec les deux listes, qui se ferme par le bouton, le fond ou Échap", async () => { // Panneau
    await afficherSms(zone, { base, sms: faux() }); // Écran
    toucher("Synchroniser maintenant"); // Importe
    await vi.waitFor(() => expect(pastille().textContent).toBe("5")); // Importé
    const panneau = document.querySelector(".panneau-alertes"); // Panneau
    expect(panneau.hidden).toBe(true); // Fermé au départ
    document.querySelector(".cloche-sms").click(); // Ouvre
    await vi.waitFor(() => expect(panneau.hidden).toBe(false)); // Ouvert
    expect(panneau.textContent).toContain("À classer (4)"); // Liste à classer dans le panneau
    expect(panneau.textContent).toContain("SMS non compris (1)"); // SMS non compris dans le panneau
    panneau.querySelector(".panneau-alertes-fermer").click(); // Bouton Fermer
    expect(panneau.hidden).toBe(true); // Fermé
    document.querySelector(".cloche-sms").click(); // Rouvre
    await vi.waitFor(() => expect(panneau.hidden).toBe(false)); // Ouvert
    document.querySelector(".voile-alertes").click(); // Fond
    expect(panneau.hidden).toBe(true); // Fermé
    document.querySelector(".cloche-sms").click(); // Rouvre
    await vi.waitFor(() => expect(panneau.hidden).toBe(false)); // Ouvert
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); // Échap
    expect(panneau.hidden).toBe(true); // Fermé
  }); // Fin du cas

  it("la pastille baisse quand on ignore le SMS non compris depuis le panneau", async () => { // Mise à jour
    await afficherSms(zone, { base, sms: faux() }); // Écran
    toucher("Synchroniser maintenant"); // Importe
    await vi.waitFor(() => expect(pastille().textContent).toBe("5")); // Importé
    document.querySelector(".cloche-sms").click(); // Ouvre le panneau
    await vi.waitFor(() => expect(document.querySelector(".panneau-alertes").hidden).toBe(false)); // Ouvert
    [...document.querySelectorAll(".panneau-alertes button")].find((b) => b.textContent.trim() === "Ignorer ce SMS").click(); // Ignore
    await vi.waitFor(() => expect(pastille().textContent).toBe("4")); // Un de moins
    await vi.waitFor(() => expect(zone.textContent).toContain("4 dépenses à classer")); // Le résumé de l'écran suit
  }); // Fin du cas
}); // Fin du groupe

describe("synchronisation à l'ouverture", () => { // Groupe
  it("ne fait rien tant que la permission n'est pas accordée", async () => { // Pas de demande surprise
    const sms = faux(false); // Permission non accordée
    expect(await synchroniserAuDemarrage(base, sms)).toBeNull(); // Rien
    expect(sms.lireSmsMM).not.toHaveBeenCalled(); // Aucune lecture
  }); // Fin du cas

  it("importe quand la permission est accordée, et ne plante jamais", async () => { // Cas nominal
    expect((await synchroniserAuDemarrage(base, faux())).importes).toBe(4); // Import
    const casse = { autoriseSansDemander: async () => true, lireSmsMM: async () => { throw new Error("boom"); } }; // Lecture en panne
    expect(await synchroniserAuDemarrage(base, casse)).toBeNull(); // Erreur avalée
  }); // Fin du cas
}); // Fin du groupe

describe("formulaire de classement", () => { // Groupe
  it("classe la dépense dans le budget choisi", async () => { // Cas nominal
    const { budgetId } = await creerBudgetDeTest(base); // Budget
    await allouerBudget(base, { budgetId, montant: 20000 }, APRES); // Alloué
    await afficherSms(zone, { base, sms: faux() }); // Écran
    toucher("Synchroniser maintenant"); // Importe
    await vi.waitFor(async () => expect(await listerNonClassees(base)).toHaveLength(4)); // Importé
    const id = (await listerNonClassees(base)).find((t) => t.montant === 500).id; // Une petite dépense
    zone.replaceChildren(); // Nouvel écran
    await afficherFormulaireClasser(zone, { base, params: { id: String(id) } }); // Formulaire
    zone.querySelector("select").value = String(budgetId); // Choisit le budget
    toucher("Classer dans ce budget"); // Valide
    await vi.waitFor(async () => expect(await listerNonClassees(base)).toHaveLength(3)); // Classée
  }); // Fin du cas

  it("refuse une opération qui ne vient pas d'un SMS", async () => { // Garde-fou
    await afficherFormulaireClasser(zone, { base, params: { id: "999" } }); // Identifiant inconnu
    expect(zone.textContent).toContain("ne vient pas d'un SMS"); // Message
  }); // Fin du cas
}); // Fin du groupe
