// @vitest-environment jsdom
// Tests d'intégration du tableau de bord (vraie logique, vraie base, DOM simulé) et des graphiques SVG.
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeMMDeTest } from "../../core/db/aide-tests.js"; // Base neuve et solde Mobile Money de test
import { creerTypeBudget } from "../../core/types-budget.js"; // Types
import { creerBudget } from "../../core/budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense } from "../../core/allocations.js"; // Allocation et dépense
import { ONGLETS, ongletActifPour } from "../coque.js"; // Barre d'onglets
import { formaterCourt, barresProgression, anneau, courbe, histogramme } from "../graphiques.js"; // Graphiques
import { afficherTableauDeBord } from "./tableau-de-bord.js"; // Écran à tester

let base; // Base de chaque cas
let zone; // Zone d'écran
let typeId; // Type de budget

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  await ajouterSoldeMMDeTest(base); // Solde Mobile Money très grand
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Type
}); // Fin de la préparation

const budget = (nom) => creerBudget(base, { name: nom, typeId, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 0, autogenFinMois: false }); // Budget
const attendre = () => new Promise((r) => setTimeout(r, 30)); // Laisse les affichages asynchrones se terminer
const choisirValeur = async (id, valeur) => { const sel = document.getElementById(id); sel.value = valeur; sel.dispatchEvent(new Event("change")); await attendre(); }; // Change une liste déroulante

describe("graphiques", () => { // Dessins SVG
  it("abrège les montants des axes", () => { // Formatage
    expect([0, 950, 45000, 1250000, 3000000, -45000].map(formaterCourt)).toEqual(["0", "950", "45 k", "1,3 M", "3 M", "−45 k"]); // Abréviations
  }); // Fin du cas

  it("dessine un anneau par élément, avec légende, texte alternatif et tableau des valeurs", () => { // Anneau
    const fig = anneau({ items: [{ label: "Loyer", valeur: 75000 }, { label: "Transport", valeur: 25000 }], titre: "Dépenses" }); // Deux éléments
    expect(fig.querySelectorAll("svg circle")).toHaveLength(2); // Un arc par élément
    expect(fig.querySelector("[role=img]").getAttribute("aria-label")).toContain("Loyer 75 %"); // Texte alternatif
    expect(fig.querySelector("details").textContent).toContain("Transport"); // Tableau des valeurs
    expect(anneau({ items: [], titre: "x" }).textContent).toContain("Aucune dépense"); // Rien à répartir
  }); // Fin du cas

  it("dessine les barres de progression avec leur niveau", () => { // Barres
    const liste = barresProgression([{ label: "A", detail: "d", pct: 150, niveau: "danger" }, { label: "B", detail: "d", pct: 10, niveau: "ok" }]); // Deux barres
    const pistes = liste.querySelectorAll("[role=progressbar]"); // Pistes
    expect(pistes[0].getAttribute("aria-valuenow")).toBe("100"); // Plafonné à 100
    expect(liste.querySelectorAll(".niveau-danger")).toHaveLength(1); // Niveau rouge
    expect(barresProgression([]).textContent).toContain("Rien à afficher"); // Liste vide
  }); // Fin du cas

  it("trace une courbe avec une ligne interrompue, et un message sans donnée", () => { // Courbe
    const fig = courbe({ series: [{ nom: "S", couleur: "#000", points: [{ x: 1, y: 10 }, { x: 2, y: null }, { x: 3, y: 30 }, { x: 4, y: 40 }] }], etiquettesX: [{ x: 1, texte: "J1" }], description: "d", entetes: ["a"], lignes: [["1"]] }); // Une valeur absente
    expect(fig.querySelectorAll("svg circle")).toHaveLength(1); // Point isolé avant la coupure
    expect(fig.querySelectorAll("svg polyline")).toHaveLength(1); // Ligne après la coupure
    expect(courbe({ series: [{ nom: "S", couleur: "#000", points: [] }], etiquettesX: [], description: "d", entetes: [], lignes: [] }).textContent).toContain("Pas encore de données"); // Vide
  }); // Fin du cas

  it("dessine un histogramme empilé et groupé, ou un message si tout est à zéro", () => { // Histogramme
    const base3 = { groupes: ["a", "b"], description: "d", entetes: ["x"], lignes: [["1"]], series: [{ nom: "S1", couleur: "#111", valeurs: [10, 0] }, { nom: "S2", couleur: "#222", valeurs: [5, 20] }] }; // Données
    expect(histogramme({ ...base3, mode: "empile" }).querySelectorAll("svg rect")).toHaveLength(3); // 3 segments non nuls
    expect(histogramme({ ...base3, mode: "groupe" }).querySelectorAll("svg rect")).toHaveLength(3); // 3 barres non nulles
    expect(histogramme({ ...base3, series: [{ nom: "S", couleur: "#111", valeurs: [0, 0] }] }).textContent).toContain("Aucune donnée"); // Tout à zéro
  }); // Fin du cas
}); // Fin du groupe

describe("onglet de la barre du bas", () => { // Navigation
  it("ajoute l'onglet Tableau de bord, actif sur son écran", () => { // Onglet
    const onglet = ONGLETS.find((o) => o.route === "/tableau-de-bord"); // Onglet cherché
    expect(onglet).toBeDefined(); // Présent
    expect(ongletActifPour(onglet, "/tableau-de-bord")).toBe(true); // Actif sur son écran
  }); // Fin du cas
}); // Fin du groupe

describe("tableau de bord : état actuel", () => { // Vue par défaut
  it("affiche la situation, la santé des budgets et la répartition des dépenses", async () => { // Cas nominal
    const a = await budget("Loisirs"); const b = await budget("Transport"); // Deux budgets
    await allouerBudget(base, { budgetId: a, montant: 100000 }); await allouerBudget(base, { budgetId: b, montant: 50000 }); // Allocations
    await enregistrerDepense(base, { budgetId: a, montant: 40000, dateOperation: new Date().toISOString() }); // Dépense
    await afficherTableauDeBord(zone, { base }); // Écran
    expect(zone.querySelector("h1").textContent).toBe("Tableau de bord"); // Titre
    expect(zone.textContent).toContain("Situation de la période"); // Carte 1
    expect(zone.textContent).toMatch(/Dépensé\s*40\s000 Ar/); // Dépensé
    expect(zone.textContent).toMatch(/Disponible sur la période\s*150\s000 Ar/); // Capacité
    expect(zone.textContent).toContain("Santé des budgets"); // Carte 2
    expect(zone.querySelectorAll(".barres-ligne")).toHaveLength(2); // Une barre par budget
    expect(zone.querySelectorAll("[role=img] svg circle").length).toBe(1); // Anneau avec un seul élément dépensé
    expect(zone.textContent).toContain("Répartition des dépenses"); // Carte 3
    expect(zone.textContent).toContain("À traiter"); // Carte 4
  }); // Fin du cas

  it("bascule la répartition par type de budget", async () => { // Choix de répartition
    const a = await budget("Loisirs"); await allouerBudget(base, { budgetId: a, montant: 100000 }); // Un budget
    await enregistrerDepense(base, { budgetId: a, montant: 10000, dateOperation: new Date().toISOString() }); // Dépense
    await afficherTableauDeBord(zone, { base }); // Écran
    expect(document.querySelector(".graphique-legende").textContent).toContain("Loisirs"); // Par budget
    await choisirValeur("tdb-repartition", "type"); // Par type
    expect(document.querySelector(".graphique-legende").textContent).toContain("Loisir"); // Nom du type
  }); // Fin du cas

  it("affiche les noms saisis comme du texte, jamais comme du HTML", async () => { // Sécurité
    const a = await budget("<b>Gras</b>"); await allouerBudget(base, { budgetId: a, montant: 100000 }); // Budget au nom piégé
    await afficherTableauDeBord(zone, { base }); // Écran
    expect(zone.querySelector(".barres-label").textContent).toBe("<b>Gras</b>"); // Texte tel quel
    expect(zone.querySelector(".barres-label b")).toBeNull(); // Aucun élément créé
  }); // Fin du cas

  it("fonctionne sans aucune donnée", async () => { // Base presque vide
    await afficherTableauDeBord(zone, { base }); // Écran
    expect(zone.textContent).toContain("Rien à afficher"); // Aucun budget alloué
    expect(zone.textContent).toContain("Aucune dépense pour le moment"); // Projection
  }); // Fin du cas
}); // Fin du groupe

describe("tableau de bord : historique", () => { // Vue historique
  const ouvrirHistorique = async () => { await afficherTableauDeBord(zone, { base }); [...zone.querySelectorAll("button.segment")].find((b) => b.textContent === "Historique").click(); await attendre(); }; // Ouvre la vue Historique

  it("affiche les six graphiques de l'historique et laisse choisir le nombre de périodes", async () => { // Historique
    const a = await budget("Loisirs"); await allouerBudget(base, { budgetId: a, montant: 100000 }); // Un budget
    await enregistrerDepense(base, { budgetId: a, montant: 30000, dateOperation: new Date().toISOString() }); // Dépense
    await ouvrirHistorique(); // Vue historique
    for (const titre of ["Évolution du solde Mobile Money", "Dépenses par période", "Alloué contre dépensé", "Reliquats reportés", "Rythme de la période", "Plus grosses dépenses"]) expect(zone.textContent).toContain(titre); // Les six cartes
    expect(zone.querySelector(".classement").textContent).toContain("30 000 Ar"); // Plus grosse dépense
    expect(document.getElementById("tdb-nb").value).toBe("6"); // 6 périodes par défaut
    const lignes6 = [...zone.querySelectorAll("figure")].find((f) => f.querySelector("details").textContent.includes("Taux")).querySelectorAll("tbody tr").length; // Lignes du tableau « alloué contre dépensé »
    expect(lignes6).toBe(6); // 6 périodes
    await choisirValeur("tdb-nb", "12"); // 12 périodes
    const lignes12 = [...zone.querySelectorAll("figure")].find((f) => f.querySelector("details").textContent.includes("Taux")).querySelectorAll("tbody tr").length; // Lignes après changement
    expect(lignes12).toBe(12); // 12 périodes
    expect(document.getElementById("tdb-nb").value).toBe("12"); // Choix conservé
  }); // Fin du cas

  it("permet de choisir le budget comparé", async () => { // Choix du budget
    const a = await budget("Loisirs"); const b = await budget("Transport"); // Deux budgets
    await allouerBudget(base, { budgetId: a, montant: 100000 }); await allouerBudget(base, { budgetId: b, montant: 50000 }); // Allocations
    await ouvrirHistorique(); // Vue historique
    const total = () => [...zone.querySelectorAll("figure")].find((f) => f.querySelector("details").textContent.includes("Taux")).querySelector("tbody tr:last-child td:nth-child(2)").textContent; // Disponible de la dernière période
    expect(total()).toMatch(/150\s000 Ar/); // Tous les budgets
    await choisirValeur("tdb-budget", String(b)); // Un seul budget
    expect(total()).toMatch(/50\s000 Ar/); // Transport seulement
  }); // Fin du cas
}); // Fin du groupe
