// @vitest-environment jsdom
// Test d'intégration de l'écran de consultation du solde (faux accès USSD, vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve
import { lireDernierSolde } from "../../core/soldes.js"; // Dernier solde
import { afficherUssd } from "./ussd.js"; // Écran à tester

let base; // Base de chaque cas
let zone; // Zone d'écran
let pin = null; // PIN du faux accès
let actif = false; // Automatique du faux accès

const faux = () => ({ // Faux accès USSD
  etat: vi.fn(async () => ({ pinDefini: pin !== null, actif, permission: true, code: "#144*5*3*••••*#" })), // État
  definirPin: vi.fn(async (p) => { pin = p; }), // Enregistre
  effacerPin: vi.fn(async () => { pin = null; actif = false; }), // Efface
  demanderPermission: vi.fn(async () => true), // Permission accordée
  consulter: vi.fn(async () => "Le solde de votre compte est de 202316 AR."), // Réponse
  programmerAuto: vi.fn(async (a) => { actif = a; }), // Bascule
  recupererReponses: vi.fn(async () => ({ reponses: [], arret: null })), // Rien
}); // Fin du faux

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  pin = null; actif = false; // État initial
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
}); // Fin de la préparation

const toucher = (texte) => { [...zone.querySelectorAll("button")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton

describe("écran consultation du solde", () => { // Groupe
  it("refuse un PIN mal formé puis enregistre un PIN valide", async () => { // Saisie du PIN
    const ussd = faux(); // Faux
    await afficherUssd(zone, { base, ussd }); // Écran
    expect(zone.textContent).toContain("Aucun PIN enregistré"); // État initial
    zone.querySelector("#ussd-pin").value = "12"; // PIN trop court
    toucher("Enregistrer le PIN"); // Valide
    await vi.waitFor(() => expect(zone.textContent).toContain("de 4 à 8 chiffres")); // Message sous le champ
    expect(ussd.definirPin).not.toHaveBeenCalled(); // Rien enregistré
    zone.querySelector("#ussd-pin").value = "1234"; // PIN valide
    toucher("Enregistrer le PIN"); // Valide
    await vi.waitFor(() => expect(ussd.definirPin).toHaveBeenCalledWith("1234")); // Enregistré
    await vi.waitFor(() => expect(zone.textContent).toContain("PIN enregistré (chiffré)")); // État mis à jour
  }); // Fin du cas

  it("consulte le solde et l'enregistre", async () => { // Consultation immédiate
    pin = "1234"; // PIN déjà présent
    await afficherUssd(zone, { base, ussd: faux() }); // Écran
    toucher("Consulter le solde"); // Touche
    await vi.waitFor(async () => expect((await lireDernierSolde(base))?.balance).toBe(202316)); // Solde créé
  }); // Fin du cas

  it("active puis arrête la consultation automatique", async () => { // Bascule
    pin = "1234"; // PIN déjà présent
    const ussd = faux(); // Faux
    await afficherUssd(zone, { base, ussd }); // Écran
    toucher("Activer la consultation automatique"); // Active
    await vi.waitFor(() => expect(ussd.programmerAuto).toHaveBeenCalledWith(true)); // Activée
    await vi.waitFor(() => expect(zone.textContent).toContain("Arrêter la consultation automatique")); // Bouton inversé
  }); // Fin du cas
}); // Fin du groupe
