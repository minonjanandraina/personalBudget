// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"; // Outils de test
import { creerRouteur, trouverRoute } from "./routeur.js"; // Routeur à tester
import { construireCoque, ongletActifPour } from "./coque.js"; // Coque (barre d onglets) à tester
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

describe("trouverRoute (paramètres dans l'adresse)", () => { // Groupe de tests des routes à paramètres
  const routes = { "/": () => {}, "/budgets": () => {}, "/budgets/nouveau": () => {}, "/budgets/:id": () => {} }; // Routes de test

  it("trouve une route exacte sans paramètre", () => { // Correspondance directe
    expect(trouverRoute(routes, "/budgets")).toEqual({ cle: "/budgets", params: {} }); // Route trouvée
  }); // Fin du cas

  it("préfère la route fixe à la route à paramètre", () => { // « nouveau » n'est pas un identifiant
    expect(trouverRoute(routes, "/budgets/nouveau").cle).toBe("/budgets/nouveau"); // La route fixe gagne
  }); // Fin du cas

  it("extrait le paramètre", () => { // Paramètre :id
    expect(trouverRoute(routes, "/budgets/12")).toEqual({ cle: "/budgets/:id", params: { id: "12" } }); // Identifiant extrait
  }); // Fin du cas

  it("renvoie null pour une adresse inconnue ou de mauvaise longueur", () => { // Refus
    expect(trouverRoute(routes, "/inconnu")).toBeNull(); // Route absente
    expect(trouverRoute(routes, "/budgets/1/2")).toBeNull(); // Trop de morceaux
    expect(trouverRoute(routes, "/budgets/")).toBeNull(); // Paramètre vide
  }); // Fin du cas

  it("transmet les paramètres à l'écran", async () => { // Intégration dans le routeur
    window.location.hash = "#/budgets/7"; // Adresse avec paramètre
    const ecran = vi.fn(); // Fonction espion
    routeur = creerRouteur({ conteneur, routes: { "/": () => {}, "/budgets/:id": ecran } }); // Routeur avec la route à paramètre
    await routeur.demarrer(); // Le démarre
    expect(ecran).toHaveBeenCalledWith(conteneur, { params: { id: "7" } }); // L'écran reçoit le paramètre
  }); // Fin du cas
}); // Fin du groupe

describe("onglet actif selon les préfixes", () => { // Groupe de tests
  const budgets = { libelle: "Budgets", nomIcone: "budgets", route: "/budgets", prefixes: ["/budgets", "/types-budget"] }; // Onglet avec préfixes

  it("reste actif sur les écrans qui en dépendent", () => { // Sous-écrans
    for (const chemin of ["/budgets", "/budgets/3", "/budgets/nouveau", "/types-budget", "/types-budget/2"]) expect(ongletActifPour(budgets, chemin), chemin).toBe(true); // Tous rattachés
  }); // Fin du cas

  it("n'est pas actif sur les autres écrans, ni s'il est grisé", () => { // Cas négatifs
    expect(ongletActifPour(budgets, "/")).toBe(false); // Accueil
    expect(ongletActifPour(budgets, "/budgetsfaux")).toBe(false); // Préfixe partiel refusé
    expect(ongletActifPour({ ...budgets, route: null }, "/budgets")).toBe(false); // Onglet grisé
  }); // Fin du cas
}); // Fin du groupe
