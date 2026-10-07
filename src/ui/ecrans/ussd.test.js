// @vitest-environment jsdom
// Test d'intégration de l'écran de consultation du solde (faux accès USSD, vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve
import { lireDernierSolde } from "../../core/soldes.js"; // Dernier solde
import { lireCodeSolde } from "../../core/ussd-solde.js"; // Code de consultation
import { afficherUssd } from "./ussd.js"; // Écran à tester

let base; // Base de chaque cas
let zone; // Zone d'écran

const faux = () => ({ // Faux accès USSD
  demanderPermission: vi.fn(async () => true), // Permission accordée
  envoyerCode: vi.fn(async () => "Le solde de votre compte est de 202316 AR."), // Réponse
}); // Fin du faux

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
}); // Fin de la préparation

const toucher = (texte) => { [...zone.querySelectorAll("button")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton

describe("écran consultation du solde", () => { // Groupe
  it("montre le code par défaut et ne propose aucun enregistrement de PIN ni consultation automatique", async () => { // Contenu
    await afficherUssd(zone, { base, ussd: faux() }); // Écran
    expect(zone.querySelector("#ussd-code-solde").value).toBe("#144*5*3*{pin}*#"); // Code par défaut
    expect(zone.textContent).not.toContain("Enregistrer le PIN"); // Pas de stockage du PIN
    expect(zone.textContent).not.toContain("Activer la consultation automatique"); // Pas d'automatique
  }); // Fin du cas

  it("refuse un code sans {pin} puis enregistre un code valide, et rétablit le code par défaut", async () => { // Code réglable
    await afficherUssd(zone, { base, ussd: faux() }); // Écran
    zone.querySelector("#ussd-code-solde").value = "#144*5*3#"; // Sans {pin}
    toucher("Enregistrer le code"); // Valide
    await vi.waitFor(() => expect(zone.textContent).toContain("doit contenir {pin}")); // Message sous le champ
    zone.querySelector("#ussd-code-solde").value = "#144*5*3*{pin}#"; // Valide
    toucher("Enregistrer le code"); // Valide
    await vi.waitFor(async () => expect(await lireCodeSolde(base)).toBe("#144*5*3*{pin}#")); // Enregistré
    toucher("Rétablir le code par défaut"); // Demande le retour au défaut
    await vi.waitFor(() => expect(document.body.textContent).toContain("Rétablir le code par défaut ?")); // Confirmation
    [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Rétablir").at(-1).click(); // Confirme
    await vi.waitFor(async () => expect(await lireCodeSolde(base)).toBe("#144*5*3*{pin}*#")); // Défaut rétabli
  }); // Fin du cas

  it("exige le PIN à chaque consultation, l'insère dans le code, enregistre le solde puis efface la saisie", async () => { // Consultation
    const ussd = faux(); // Faux
    await afficherUssd(zone, { base, ussd }); // Écran
    toucher("Consulter le solde"); // Sans PIN
    await vi.waitFor(() => expect(zone.textContent).toContain("de 4 à 8 chiffres")); // Refusé sous le champ
    expect(ussd.envoyerCode).not.toHaveBeenCalled(); // Rien envoyé
    zone.querySelector("#ussd-pin").value = "1234"; // PIN saisi
    toucher("Consulter le solde"); // Consulte
    await vi.waitFor(() => expect(ussd.envoyerCode).toHaveBeenCalledWith("#144*5*3*1234*#")); // Code complet
    await vi.waitFor(async () => expect((await lireDernierSolde(base))?.balance).toBe(202316)); // Solde créé
    expect(zone.querySelector("#ussd-pin").value).toBe(""); // PIN effacé de l'écran
  }); // Fin du cas
}); // Fin du groupe
