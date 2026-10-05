// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"; // Outils de test
import { creerRouteur } from "./routeur.js"; // Routeur à tester
import { construireCoque } from "./coque.js"; // Coque (barre d'onglets) à tester
import { h } from "./dom.js"; // Fabrication d'éléments

let routeur; // Routeur du cas en cours
let conteneur; // Zone d'affichage des écrans

beforeEach(() => { // Avant chaque cas
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page : on remplace par une fonction vide
  window.location.hash = ""; // Repart d'une adresse vide
  conteneur = h("main", {}); // Zone d'affichage neuve
  document.body.replaceChildren(conteneur); // La place dans la page
}); // Fin de la préparation

afterEach(() => { // Après chaque cas
  routeur?.arreter(); // Arrête l'écoute des changements d'adresse
}); // Fin du nettoyage

const nouveauRouteur = (surcharges = {}) => creerRouteur({ // Fabrique un routeur de test
  conteneur, // Zone d'affichage
  routes: { "/": (zone) => zone.append("accueil"), "/reglages": (zone) => zone.append("reglages") }, // Deux écrans simples
  ...surcharges, // Options propres au cas
}); // Fin de la fabrique

describe("routeur", () => { // Groupe de tests
  it("affiche l'écran par défaut quand l'adresse est vide", async () => { // Démarrage
    routeur = nouveauRouteur(); // Crée le routeur
    await routeur.demarrer(); // Le démarre
    expect(conteneur.textContent).toBe("accueil"); // L'accueil est affiché
  }); // Fin du cas

  it("affiche l'écran demandé par l'adresse", async () => { // Adresse connue
    window.location.hash = "#/reglages"; // Demande les réglages
    routeur = nouveauRouteur(); // Crée le routeur
    await routeur.demarrer(); // Le démarre
    expect(conteneur.textContent).toBe("reglages"); // Les réglages sont affichés
  }); // Fin du cas

  it("retombe sur l'écran par défaut si l'adresse est inconnue", async () => { // Adresse inconnue
    window.location.hash = "#/nexistepas"; // Demande un écran inexistant
    routeur = nouveauRouteur(); // Crée le routeur
    await routeur.demarrer(); // Le démarre
    expect(conteneur.textContent).toBe("accueil"); // Retombe sur l'accueil
  }); // Fin du cas

  it("change d'écran quand l'adresse change", async () => { // Navigation
    routeur = nouveauRouteur(); // Crée le routeur
    await routeur.demarrer(); // Le démarre
    window.location.hash = "#/reglages"; // Change l'adresse
    await vi.waitFor(() => expect(conteneur.textContent).toBe("reglages")); // Attend que l'écran change
  }); // Fin du cas

  it("affiche une erreur lisible si un écran plante, au lieu d'un écran blanc", async () => { // Robustesse
    routeur = nouveauRouteur({ routes: { "/": () => { throw new Error("boum"); } } }); // Écran qui plante
    await routeur.demarrer(); // Le démarre
    expect(conteneur.textContent).toContain("boum"); // L'erreur est affichée
    expect(conteneur.querySelector("[role=alert]")).not.toBeNull(); // Sous forme d'alerte
  }); // Fin du cas

  it("prévient quand l'écran change (pour la barre d'onglets)", async () => { // Rappel de changement
    const auChangement = vi.fn(); // Fonction espion
    routeur = nouveauRouteur({ auChangement }); // Crée le routeur
    await routeur.demarrer(); // Le démarre
    expect(auChangement).toHaveBeenCalledWith("/"); // Prévenu avec la route affichée
  }); // Fin du cas
}); // Fin du groupe

describe("coque (barre d'onglets)", () => { // Groupe de tests de la coque
  const onglets = [ // Onglets de test
    { libelle: "Accueil", nomIcone: "accueil", route: "/" }, // Actif possible
    { libelle: "Budgets", nomIcone: "budgets", route: null }, // Grisé
    { libelle: "Réglages", nomIcone: "reglages", route: "/reglages" }, // Actif possible
  ]; // Fin des onglets

  it("construit la barre avec un onglet grisé non cliquable", () => { // Structure
    const racine = h("div", {}); // Racine de test
    construireCoque(racine, onglets); // Construit la coque
    expect(racine.querySelectorAll("a.onglet")).toHaveLength(2); // Deux onglets cliquables
    const grise = racine.querySelector(".onglet.desactive"); // L'onglet grisé
    expect(grise.tagName).toBe("SPAN"); // Pas un lien
    expect(grise.getAttribute("aria-disabled")).toBe("true"); // Signalé inactif
  }); // Fin du cas

  it("met en évidence l'onglet de l'écran affiché", () => { // Onglet actif
    const racine = h("div", {}); // Racine de test
    const { marquerActif } = construireCoque(racine, onglets); // Construit la coque
    marquerActif("/reglages"); // Active les réglages
    expect(racine.querySelector("a[data-route='/reglages']").classList.contains("actif")).toBe(true); // Réglages actif
    expect(racine.querySelector("a[data-route='/']").classList.contains("actif")).toBe(false); // Accueil inactif
    expect(racine.querySelector("a[data-route='/reglages']").getAttribute("aria-current")).toBe("page"); // Page courante signalée
  }); // Fin du cas
}); // Fin du groupe
