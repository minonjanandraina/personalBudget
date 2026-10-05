// @vitest-environment jsdom
// Tests d'intégration : affichage des alertes (accueil, composant d'alerte, badge de la barre d'onglets).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget } from "../../core/types-budget.js"; // Types
import { creerBudget } from "../../core/budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense } from "../../core/allocations.js"; // Allocation et dépense
import { calculerAlertes } from "../../core/alertes.js"; // Alertes
import { afficherAccueil } from "./accueil.js"; // Accueil
import { alerte } from "../composants.js"; // Composant d'alerte
import { construireCoque } from "../coque.js"; // Coque (barre d'onglets)
import { h } from "../dom.js"; // Fabrication d'éléments

let base; // Base utilisée par les cas de test
let zone; // Zone où l'écran est dessiné
let typeId; // Type de budget disponible

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran neuve
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

const poserSolde = (balance, quand = new Date(Date.now() - 3 * 24 * 3600 * 1000)) => base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [quand.toISOString(), balance]); // Enregistre un solde OM
const budget = (surcharges = {}) => creerBudget(base, { name: "Loisirs", typeId, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 30000, autogenFinMois: false, ...surcharges }); // Crée un budget
const monter = async (ecran) => { zone.replaceChildren(); await ecran(zone, { base }); }; // Dessine un écran

describe("composant d'alerte avec action", () => { // Lien d'action
  it("affiche un lien d'action quand il est fourni, et aucun sinon", () => { // Présence du lien
    const avec = alerte({ niveau: "danger", message: "Problème", action: { libelle: "Corriger", route: "/budgets" } }); // Avec action
    expect(avec.querySelector("a.alerte-action").getAttribute("href")).toBe("#/budgets"); // Lien vers la route
    expect(avec.querySelector("a.alerte-action").textContent).toBe("Corriger"); // Libellé
    expect(alerte({ niveau: "info", message: "Simple" }).querySelector("a")).toBeNull(); // Sans action : pas de lien
  }); // Fin du cas
}); // Fin du groupe

describe("accueil : bandeau d'alertes", () => { // Alertes de l'accueil
  it("affiche « Aucune alerte » quand tout va bien", async () => { // Situation saine
    await poserSolde(500000); // Solde OM
    const id = await budget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // 100 000
    await monter(afficherAccueil); // Accueil
    expect(zone.textContent).toContain("Aucune alerte pour le moment"); // Message
    expect(zone.querySelector(".section-titre")).toBeNull(); // Pas de titre de comptage
  }); // Fin du cas

  it("invite à saisir le solde OM tant qu'il n'existe pas", async () => { // Sans solde
    await monter(afficherAccueil); // Accueil
    expect(zone.querySelector(".section-titre").textContent).toBe("Alertes (1)"); // Une alerte
    expect(zone.querySelector(".zone-alertes a.alerte-action").getAttribute("href")).toBe("#/solde/nouveau"); // Lien de saisie
  }); // Fin du cas

  it("affiche le seuil, le plafond et l'écart, chacun avec son lien d'action, dans l'ordre", async () => { // Plusieurs alertes
    await poserSolde(300000); // Solde OM 300 000
    const a = await budget({ name: "A", soldeAlert: 30000 }); // Sera sous son seuil
    const b = await budget({ name: "B", soldeAlert: 0, montantMax: 50000, montantBudget: 20000 }); // Sera au-dessus de son plafond
    await allouerBudget(base, { budgetId: a, montant: 10000 }); // A : 10 000 < 30 000
    await allouerBudget(base, { budgetId: b, montant: 60000 }); // B : 60 000 > 50 000
    await poserSolde(30000, new Date(Date.now() - 1000)); // Vrai solde 30 000 < réservé 70 000 : écart
    await monter(afficherAccueil); // Accueil
    expect(zone.querySelector(".section-titre").textContent).toBe("Alertes (3)"); // Trois alertes
    const liens = [...zone.querySelectorAll(".zone-alertes a.alerte-action")].map((l) => l.getAttribute("href")); // Liens d'action
    expect(liens).toEqual(["#/operations/depense", `#/allocations/nouveau/${a}`, `#/allocations/transfert/${b}`]); // Écart, seuil, plafond
    expect(zone.querySelector(".zone-alertes").textContent).toMatch(/Écart de 40\s000 Ar/); // Montant de l'écart
  }); // Fin du cas

  it("une dépense qui fait passer un budget sous son seuil déclenche l'alerte, avec le nom du budget", async () => { // Réaction aux opérations
    await poserSolde(500000); // Solde OM
    const id = await budget({ soldeAlert: 30000 }); // Seuil 30 000
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // 100 000
    await monter(afficherAccueil); // Accueil
    expect(zone.textContent).toContain("Aucune alerte"); // Pas encore d'alerte
    await enregistrerDepense(base, { budgetId: id, montant: 80000, dateOperation: new Date().toISOString() }); // Reste 20 000
    await monter(afficherAccueil); // Accueil
    expect(zone.querySelector(".zone-alertes").textContent).toMatch(/« Loisirs » : solde de 20\s000 Ar, sous le seuil d'alerte de 30\s000 Ar/); // Alerte de seuil
  }); // Fin du cas

  it("n'affiche l'avertissement d'écart qu'une seule fois (pas aussi dans la carte du réservé)", async () => { // Pas de doublon
    await poserSolde(150000, new Date(Date.now() - 3 * 24 * 3600 * 1000)); // Solde 150 000
    const id = await budget({ soldeAlert: 0 }); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // Réserve 100 000
    await poserSolde(90000, new Date(Date.now() - 3600 * 1000)); // Vrai solde 90 000 : écart
    await monter(afficherAccueil); // Accueil
    const occurrences = zone.textContent.split("n'a peut-être pas été enregistrée").length - 1; // Nombre d'occurrences du message
    expect(occurrences).toBe(1); // Une seule
  }); // Fin du cas
}); // Fin du groupe

describe("badge de la barre d'onglets", () => { // Nombre d'alertes sur l'onglet Accueil
  const onglets = [ // Onglets de test
    { libelle: "Accueil", nomIcone: "accueil", route: "/", prefixes: [] }, // Accueil
    { libelle: "Budgets", nomIcone: "budgets", route: "/budgets", prefixes: [] }, // Budgets
    { libelle: "Bientôt", nomIcone: "reglages", route: null, prefixes: [] }, // Onglet grisé
  ]; // Fin des onglets

  it("est caché au départ, s'affiche avec un nombre, et se cache de nouveau à zéro", () => { // Cycle de vie
    const racine = h("div", {}); // Racine de test
    const { definirBadge } = construireCoque(racine, onglets); // Construit la coque
    const badge = () => racine.querySelector("a[data-route='/'] .badge"); // Badge de l'accueil
    expect(badge().hidden).toBe(true); // Caché au départ
    definirBadge("/", 3); // Trois alertes
    expect(badge().hidden).toBe(false); // Visible
    expect(badge().textContent).toBe("3"); // Nombre affiché
    expect(racine.querySelector("a[data-route='/']").getAttribute("aria-label")).toBe("Accueil, 3 alertes"); // Annoncé aux lecteurs d'écran
    definirBadge("/", 1); // Une alerte
    expect(racine.querySelector("a[data-route='/']").getAttribute("aria-label")).toBe("Accueil, 1 alerte"); // Singulier
    definirBadge("/", 0); // Plus d'alerte
    expect(badge().hidden).toBe(true); // Caché
    expect(racine.querySelector("a[data-route='/']").getAttribute("aria-label")).toBe("Accueil"); // Libellé simple
  }); // Fin du cas

  it("plafonne l'affichage à 99+ et ignore un onglet inconnu ou grisé", () => { // Cas limites
    const racine = h("div", {}); // Racine de test
    const { definirBadge } = construireCoque(racine, onglets); // Construit la coque
    definirBadge("/", 250); // Beaucoup d'alertes
    expect(racine.querySelector("a[data-route='/'] .badge").textContent).toBe("99+"); // Plafonné
    expect(() => definirBadge("/inconnu", 5)).not.toThrow(); // Onglet inconnu : sans effet
    expect(() => definirBadge(null, 5)).not.toThrow(); // Onglet grisé : sans effet
  }); // Fin du cas

  it("le nombre du badge correspond au nombre d'alertes calculées", async () => { // Cohérence
    const racine = h("div", {}); // Racine de test
    const { definirBadge } = construireCoque(racine, onglets); // Construit la coque
    const alertes = await calculerAlertes(base); // Sans solde : une alerte
    definirBadge("/", alertes.length); // Met à jour le badge
    expect(racine.querySelector("a[data-route='/'] .badge").textContent).toBe(String(alertes.length)); // Même nombre
  }); // Fin du cas
}); // Fin du groupe
