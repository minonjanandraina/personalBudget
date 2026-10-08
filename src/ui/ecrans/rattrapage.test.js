// @vitest-environment jsdom
// Tests d'intégration : rattrapage d'une dépense oubliée (case « déjà comprise dans mon dernier solde Mobile Money »).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget } from "../../core/types-budget.js"; // Types
import { creerBudget } from "../../core/budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense } from "../../core/allocations.js"; // Allocation et dépense
import { listerTransactions } from "../../core/transactions.js"; // Transactions
import { situationFinanciere } from "../../core/soldes.js"; // Situation financière
import { afficherAccueil } from "./accueil.js"; // Accueil
import { afficherOperations, afficherFormulaireDepense, afficherFormulaireOperation } from "./operations.js"; // Opérations

let base; // Base utilisée par les cas de test
let zone; // Zone où l'écran est dessiné
let budgetId; // Budget alloué de 100 000

const poserSolde = (balance, quand) => base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [quand.toISOString(), balance]); // Enregistre un solde Mobile Money
const monter = async (ecran, params = undefined) => { zone.replaceChildren(); await ecran(zone, { base, params }); }; // Dessine un écran (en vidant la zone d'abord)
const saisir = (id, valeur) => { zone.querySelector(`#${id}`).value = valeur; }; // Remplit un champ
const choisir = (id, valeur) => { const s = zone.querySelector(`#${id}`); s.value = valeur; s.dispatchEvent(new Event("change")); }; // Change une liste déroulante
const toucher = (texte) => { [...zone.querySelectorAll("button, a.bouton")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton

// Scénario : solde Mobile Money 150 000, 100 000 alloués, puis le vrai solde saisi est 90 000 (60 000 dépensés sans être enregistrés).
beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran neuve
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
  const typeId = await creerTypeBudget(base, { name: "Loisir" }); // Type
  budgetId = await creerBudget(base, { name: "Sorties", typeId, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 0, autogenFinMois: false }); // Budget
  await poserSolde(150000, new Date(Date.now() - 3 * 24 * 3600 * 1000)); // Solde d'il y a 3 jours
  await allouerBudget(base, { budgetId, montant: 100000 }); // Réserve 100 000
  await poserSolde(90000, new Date(Date.now() - 3600 * 1000)); // Vrai solde d'il y a une heure : 60 000 ont disparu
}); // Fin de la préparation

describe("rattrapage d'une dépense oubliée (écrans)", () => { // Scénario de bout en bout
  it("l'accueil avertit de l'écart, et le formulaire de dépense explique quoi faire", async () => { // Écart visible
    await monter(afficherAccueil); // Accueil
    expect(zone.textContent).toContain("n'a peut-être pas été enregistrée"); // Avertissement de l'accueil
    await monter(afficherFormulaireDepense); // Formulaire de dépense
    expect(zone.textContent).toContain("cochez « Déjà comprise dans mon dernier solde Mobile Money »"); // Aide dans le formulaire
    expect(zone.querySelector("#dep-comprise")).not.toBeNull(); // Case présente
  }); // Fin du cas

  it("sans la case, l'avertissement reste (la dépense est retirée une seconde fois)", async () => { // Comportement sans case
    await monter(afficherFormulaireDepense); // Formulaire
    choisir("dep-budget", String(budgetId)); // Budget
    saisir("dep-montant", "60 000"); // Montant
    toucher("Enregistrer la dépense"); // Enregistre
    await vi.waitFor(async () => expect(await listerTransactions(base, { sens: -1 })).toHaveLength(1)); // Dépense créée
    await monter(afficherAccueil); // Accueil
    expect(zone.textContent).toContain("n'a peut-être pas été enregistrée"); // Avertissement toujours là
  }); // Fin du cas

  it("avec la case cochée, l'avertissement disparaît et le libre redevient positif", async () => { // Solution
    await monter(afficherFormulaireDepense); // Formulaire
    choisir("dep-budget", String(budgetId)); // Budget
    saisir("dep-montant", "60 000"); // Montant
    zone.querySelector("#dep-comprise").click(); // Coche « déjà comprise »
    toucher("Enregistrer la dépense"); // Enregistre
    await vi.waitFor(async () => expect(await listerTransactions(base, { sens: -1 })).toHaveLength(1)); // Dépense créée
    expect((await situationFinanciere(base)).libre).toBe(50000); // 90 000 - 40 000
    await monter(afficherAccueil); // Accueil
    expect(zone.textContent).not.toContain("n'a peut-être pas été enregistrée"); // Plus d'avertissement
    expect(zone.querySelector(".reserve-libre").textContent).toContain("50 000 Ar"); // Libre affiché
    expect(zone.querySelector(".solde-montant").textContent).toBe("90 000 Ar"); // Solde disponible inchangé
  }); // Fin du cas

  it("n'affiche pas la case quand aucun solde Mobile Money n'existe", async () => { // Sans solde
    await base.executer("DELETE FROM solde_om"); // Supprime les soldes
    await monter(afficherFormulaireDepense); // Formulaire
    expect(zone.querySelector("#dep-comprise")).toBeNull(); // Pas de case
  }); // Fin du cas

  it("l'écart n'est pas signalé dans le formulaire quand tout est cohérent", async () => { // Sans écart
    await poserSolde(500000, new Date()); // Solde confortable, plus récent
    await monter(afficherFormulaireDepense); // Formulaire
    expect(zone.textContent).not.toContain("cochez « Déjà comprise"); // Pas d'aide inutile
    expect(zone.querySelector("#dep-comprise")).not.toBeNull(); // La case reste disponible
  }); // Fin du cas

  it("la liste marque la dépense rattrapée, et le formulaire de modification permet de décocher la case", async () => { // Liste et modification
    const id = (await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: new Date().toISOString(), compriseDansSolde: true })).idTransaction; // Dépense rattrapée
    await monter(afficherOperations); // Liste
    expect(zone.textContent).toContain("Déjà comprise dans le solde Mobile Money"); // Mention dans la liste
    await monter(afficherFormulaireOperation, { id: String(id) }); // Formulaire de modification
    expect(zone.querySelector("#op-comprise").checked).toBe(true); // Case préremplie
    zone.querySelector("#op-comprise").click(); // Décoche
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(async () => expect((await listerTransactions(base, { sens: -1 }))[0].compriseDansSolde).toBe(false)); // Marque retirée
    expect((await situationFinanciere(base)).libre).toBe(-10000); // L'écart est revenu
  }); // Fin du cas

  it("n'offre pas la case pour modifier une allocation", async () => { // Allocation
    const alimentation = (await listerTransactions(base, { sens: 1 }))[0].id; // Identifiant de l'allocation
    await monter(afficherFormulaireOperation, { id: String(alimentation) }); // Formulaire
    expect(zone.querySelector("#op-comprise")).toBeNull(); // Pas de case pour une allocation
  }); // Fin du cas
}); // Fin du groupe
