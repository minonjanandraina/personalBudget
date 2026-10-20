// @vitest-environment jsdom
// Tests d'intégration : affichage des alertes (composant d'alerte, cloche en haut à droite et son panneau).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget } from "../../core/types-budget.js"; // Types
import { creerBudget } from "../../core/budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense } from "../../core/allocations.js"; // Allocation et dépense
import { calculerAlertes } from "../../core/alertes.js"; // Alertes
import { afficherAccueil } from "./accueil.js"; // Accueil
import { alerte } from "../composants.js"; // Composant d'alerte
import { construireCoque } from "../coque.js"; // Coque (cloche et panneau d'alertes)
import { ouvrirCloche } from "../aide-alertes-tests.js"; // Ouverture de la cloche
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

const poserSolde = (balance, quand = new Date(Date.now() - 3 * 24 * 3600 * 1000)) => base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [quand.toISOString(), balance]); // Enregistre un solde Mobile Money
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

describe("cloche d'alertes : panneau", () => { // Alertes regroupées en haut à droite
  it("affiche « Aucune alerte » quand tout va bien, sans pastille", async () => { // Situation saine
    await poserSolde(500000); // Solde Mobile Money
    const id = await budget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // 100 000
    const racine = await ouvrirCloche(base); // Ouvre la cloche
    expect(racine.querySelector(".panneau-alertes").textContent).toContain("Aucune alerte pour le moment"); // Message
    expect(racine.querySelector(".cloche-badge").hidden).toBe(true); // Pas de pastille
    expect(racine.querySelector(".panneau-alertes-titre").textContent).toBe("Alertes"); // Titre sans nombre
  }); // Fin du cas

  it("invite à saisir le solde Mobile Money tant qu'il n'existe pas", async () => { // Sans solde
    const racine = await ouvrirCloche(base); // Ouvre la cloche
    expect(racine.querySelector(".panneau-alertes-titre").textContent).toBe("Alertes (1)"); // Une alerte
    expect(racine.querySelector(".panneau-alertes a.alerte-action").getAttribute("href")).toBe("#/solde/nouveau"); // Lien de saisie
  }); // Fin du cas

  it("affiche le seuil, le plafond et l'écart, chacun avec son lien d'action, dans l'ordre", async () => { // Plusieurs alertes
    await poserSolde(300000); // Solde Mobile Money 300 000
    const a = await budget({ name: "A", soldeAlert: 30000 }); // Sera sous son seuil
    const b = await budget({ name: "B", soldeAlert: 0, montantMax: 50000, montantBudget: 20000 }); // Sera au-dessus de son plafond
    await allouerBudget(base, { budgetId: a, montant: 10000 }); // A : 10 000 < 30 000
    await allouerBudget(base, { budgetId: b, montant: 60000 }); // B : 60 000 > 50 000
    await poserSolde(30000, new Date(Date.now() - 1000)); // Vrai solde 30 000 < réservé 70 000 : écart
    const racine = await ouvrirCloche(base); // Ouvre la cloche
    expect(racine.querySelector(".panneau-alertes-titre").textContent).toBe("Alertes (3)"); // Trois alertes
    const liens = [...racine.querySelectorAll(".panneau-alertes a.alerte-action")].map((l) => l.getAttribute("href")); // Liens d'action
    expect(liens).toEqual(["#/operations/depense", `#/allocations/nouveau/${a}`, `#/allocations/transfert/${b}`]); // Écart, seuil, plafond
    expect(racine.querySelector(".panneau-alertes").textContent).toMatch(/Écart de 40\s000 Ar/); // Montant de l'écart
  }); // Fin du cas

  it("une dépense qui fait passer un budget sous son seuil déclenche l'alerte, avec le nom du budget", async () => { // Réaction aux opérations
    await poserSolde(500000); // Solde Mobile Money
    const id = await budget({ soldeAlert: 30000 }); // Seuil 30 000
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // 100 000
    expect((await ouvrirCloche(base)).querySelector(".panneau-alertes").textContent).toContain("Aucune alerte"); // Pas encore d'alerte
    await enregistrerDepense(base, { budgetId: id, montant: 80000, dateOperation: new Date().toISOString() }); // Reste 20 000
    expect((await ouvrirCloche(base)).querySelector(".panneau-alertes").textContent).toMatch(/« Loisirs » : solde de 20\s000 Ar, sous le seuil d'alerte de 30\s000 Ar/); // Alerte de seuil
  }); // Fin du cas

  it("l'accueil n'affiche plus les alertes (elles sont dans la cloche)", async () => { // Regroupement
    await monter(afficherAccueil); // Accueil sans solde : une alerte existe
    expect(zone.querySelector(".zone-alertes")).toBeNull(); // Plus de zone d'alertes
    expect(zone.textContent).not.toContain("Aucun solde Mobile Money saisi"); // Le message n'est plus sur l'accueil
  }); // Fin du cas

  it("n'affiche l'avertissement d'écart qu'une seule fois (pas aussi dans la carte du réservé)", async () => { // Pas de doublon
    await poserSolde(150000, new Date(Date.now() - 3 * 24 * 3600 * 1000)); // Solde 150 000
    const id = await budget({ soldeAlert: 0 }); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // Réserve 100 000
    await poserSolde(90000, new Date(Date.now() - 3600 * 1000)); // Vrai solde 90 000 : écart
    await monter(afficherAccueil); // Accueil
    const racine = await ouvrirCloche(base); // Cloche
    const texte = zone.textContent + racine.textContent; // Tout ce qui est affiché
    expect(texte.split("n'a peut-être pas été enregistrée").length - 1).toBe(1); // Une seule fois
  }); // Fin du cas
}); // Fin du groupe

describe("cloche d'alertes : bouton et pastille", () => { // Comportement de la cloche
  const monterCoque = (rafraichir = null) => { // Construit une coque de test
    document.body.replaceChildren(); // Page vide
    const racine = h("div", {}); // Racine de test
    document.body.append(racine); // La place dans la page
    return { racine, ...construireCoque(racine, undefined, rafraichir ? { rafraichirAlertes: rafraichir } : {}) }; // Coque
  }; // Fin de monterCoque
  const alertes = (n, niveau = "attention") => Array.from({ length: n }, (_, i) => ({ type: "t", niveau, message: `Alerte ${i + 1}`, action: null })); // Fausses alertes

  it("cache la pastille à zéro, l'affiche avec le nombre, et annonce le nombre aux lecteurs d'écran", () => { // Cycle de vie
    const { racine, definirAlertes } = monterCoque(); // Coque
    const badge = () => racine.querySelector(".cloche-badge"); // Pastille
    expect(badge().hidden).toBe(true); // Cachée au départ
    definirAlertes(alertes(3)); // Trois alertes
    expect(badge().hidden).toBe(false); // Visible
    expect(badge().textContent).toBe("3"); // Nombre
    expect(racine.querySelector(".cloche").getAttribute("aria-label")).toBe("Alertes, 3 à voir"); // Annoncé
    definirAlertes([]); // Plus d'alerte
    expect(badge().hidden).toBe(true); // Cachée
    expect(racine.querySelector(".cloche").getAttribute("aria-label")).toBe("Alertes, aucune"); // Annoncé
  }); // Fin du cas

  it("plafonne l'affichage à 99+ et colore la pastille en rouge s'il y a une alerte grave", () => { // Cas limites
    const { racine, definirAlertes } = monterCoque(); // Coque
    definirAlertes(alertes(250)); // Beaucoup d'alertes
    expect(racine.querySelector(".cloche-badge").textContent).toBe("99+"); // Plafonné
    expect(racine.querySelector(".cloche-badge").classList.contains("cloche-badge-danger")).toBe(false); // Orange
    definirAlertes([...alertes(1), ...alertes(1, "danger")]); // Une alerte grave
    expect(racine.querySelector(".cloche-badge").classList.contains("cloche-badge-danger")).toBe(true); // Rouge
  }); // Fin du cas

  it("ouvre et ferme le panneau (cloche, bouton Fermer, fond, touche Échap, lien d'action)", async () => { // Ouverture et fermeture
    const { racine } = monterCoque(async () => [{ type: "t", niveau: "info", message: "Hello", action: { libelle: "Aller", route: "/budgets" } }]); // Coque avec une alerte
    const panneau = racine.querySelector(".panneau-alertes"); // Panneau
    const cloche = racine.querySelector(".cloche"); // Cloche
    const ouvrir = async () => { cloche.click(); await new Promise((r) => setTimeout(r, 10)); }; // Ouvre et attend
    expect(panneau.hidden).toBe(true); // Fermé au départ
    await ouvrir(); // Ouvre
    expect(panneau.hidden).toBe(false); // Ouvert
    expect(cloche.getAttribute("aria-expanded")).toBe("true"); // Annoncé
    expect(panneau.textContent).toContain("Hello"); // Alerte recalculée à l'ouverture
    cloche.click(); // Referme par la cloche
    expect(panneau.hidden).toBe(true); // Fermé
    await ouvrir(); racine.querySelector(".panneau-alertes-fermer").click(); // Bouton Fermer
    expect(panneau.hidden).toBe(true); // Fermé
    await ouvrir(); racine.querySelector(".voile-alertes").click(); // Toucher le fond
    expect(panneau.hidden).toBe(true); // Fermé
    await ouvrir(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); // Touche Échap
    expect(panneau.hidden).toBe(true); // Fermé
    await ouvrir(); panneau.querySelector("a.alerte-action").click(); // Lien d'action
    expect(panneau.hidden).toBe(true); // Fermé par le lien
    await new Promise((r) => setTimeout(r, 30)); // Laisse jsdom envoyer son événement de changement d'adresse (il fermerait le panneau d'un test suivant)
  }); // Fin du cas

  it("garde les alertes précédentes si le recalcul échoue", async () => { // Robustesse
    let essai = 0; // Compteur d'appels
    const { racine, definirAlertes } = monterCoque(async () => { essai += 1; throw new Error("base fermée"); }); // Recalcul qui échoue
    definirAlertes(alertes(2)); // Alertes connues
    racine.querySelector(".cloche").click(); // Ouvre
    await new Promise((r) => setTimeout(r, 10)); // Attend
    expect(essai).toBe(1); // Recalcul tenté
    expect(racine.querySelector(".panneau-alertes").hidden).toBe(false); // Ouvert malgré tout
    expect(racine.querySelector(".panneau-alertes").textContent).toContain("Alerte 2"); // Anciennes alertes
  }); // Fin du cas

  it("le nombre de la pastille correspond au nombre d'alertes calculées", async () => { // Cohérence
    const { racine, definirAlertes } = monterCoque(); // Coque
    const calculees = await calculerAlertes(base); // Sans solde : une alerte
    definirAlertes(calculees); // Met à jour
    expect(racine.querySelector(".cloche-badge").textContent).toBe(String(calculees.length)); // Même nombre
  }); // Fin du cas
}); // Fin du groupe
