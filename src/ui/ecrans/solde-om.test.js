// @vitest-environment jsdom
// Tests d'intégration : solde OM disponible, détail par budget et limite du solde libre (écrans).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget } from "../../core/types-budget.js"; // Types
import { creerBudget } from "../../core/budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense } from "../../core/allocations.js"; // Allocation et dépense
import { listerTransactions } from "../../core/transactions.js"; // Transactions
import { afficherAccueil } from "./accueil.js"; // Accueil
import { afficherAllocations, afficherFormulaireAllocation } from "./allocations.js"; // Allocations

let base; // Base utilisée par les cas de test
let zone; // Zone où l'écran est dessiné
let typeId; // Type de budget disponible

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve, SANS solde OM
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran neuve
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

const poserSolde = (balance, quand = "2020-01-01T00:00:00.000Z") => base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [quand, balance]); // Enregistre un solde OM
const budget = (surcharges = {}) => creerBudget(base, { name: "Sorties", typeId, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 10000, autogenFinMois: true, ...surcharges }); // Crée un budget
const monter = async (ecran, params = undefined) => { await ecran(zone, { base, params }); }; // Dessine un écran
const saisir = (id, valeur) => { zone.querySelector(`#${id}`).value = valeur; }; // Remplit un champ
const toucher = (texte) => { [...zone.querySelectorAll("button, a.bouton")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton
const erreurDe = (id) => zone.querySelector(`#${id}-message`).textContent; // Message d'erreur sous un champ

describe("accueil : solde OM disponible et réservé", () => { // Accueil
  it("invite à saisir le solde tant qu'aucun n'existe", async () => { // Sans solde
    await monter(afficherAccueil); // Accueil
    expect(zone.textContent).toContain("Aucun solde enregistré"); // Invitation
    expect(zone.querySelector("a.solde").getAttribute("href")).toBe("#/solde/nouveau"); // Lien vers la saisie
  }); // Fin du cas

  it("affiche le solde disponible diminué des dépenses, avec le détail du calcul", async () => { // Cas demandé
    await poserSolde(150000); // Solde de 150 000
    const id = await budget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // Allocation
    await monter(afficherAccueil); // Accueil
    expect(zone.querySelector(".solde-montant").textContent).toBe("150 000 Ar"); // L'allocation ne diminue pas le solde OM
    zone.replaceChildren(); // Vide la zone
    await enregistrerDepense(base, { budgetId: id, montant: 30000, dateOperation: new Date().toISOString() }); // Dépense de 30 000
    await monter(afficherAccueil); // Accueil
    expect(zone.querySelector(".solde-montant").textContent).toBe("120 000 Ar"); // Le solde disponible a diminué
    expect(zone.querySelector(".solde-date").textContent).toMatch(/Dernier solde 150\s000 Ar.*− 30\s000 Ar de dépenses depuis/); // Détail du calcul
  }); // Fin du cas

  it("affiche l'argent réservé et le libre à allouer", async () => { // Réservé et libre
    await poserSolde(150000); // Solde de 150 000
    const id = await budget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // Allocation
    await enregistrerDepense(base, { budgetId: id, montant: 30000, dateOperation: new Date().toISOString() }); // Dépense
    await monter(afficherAccueil); // Accueil
    expect(zone.querySelector(".reserve-montant").textContent).toBe("70 000 Ar"); // Réservé = 100 000 - 30 000
    expect(zone.querySelector(".reserve-libre").textContent).toContain("50 000 Ar"); // Libre = 120 000 - 70 000
  }); // Fin du cas

  it("détaille le solde par budget au toucher (alloué - dépensé)", async () => { // Détail dépliable
    await poserSolde(500000); // Solde
    const a = await budget({ name: "A" }); // Budget A
    const b = await budget({ name: "B", montantBudget: 50000 }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }); // A : 100 000
    await allouerBudget(base, { budgetId: b, montant: 50000 }); // B : 50 000
    await enregistrerDepense(base, { budgetId: a, montant: 30000, dateOperation: new Date().toISOString() }); // Dépense sur A
    await monter(afficherAccueil); // Accueil
    const detail = zone.querySelector("#reserve-detail"); // Zone du détail
    expect(detail.hidden).toBe(true); // Cachée au départ
    zone.querySelector(".reserve-bascule").click(); // Touche le solde réservé
    expect(detail.hidden).toBe(false); // Dépliée
    expect(zone.querySelector(".reserve-bascule").getAttribute("aria-expanded")).toBe("true"); // État annoncé
    const lignes = [...detail.querySelectorAll(".reserve-ligne")].map((l) => l.textContent); // Lignes du détail
    expect(lignes[0]).toContain("A"); // Budget A
    expect(lignes[0]).toContain("alloué 100 000 Ar − dépensé 30 000 Ar"); // Calcul de A
    expect(lignes[0]).toContain("70 000 Ar"); // Solde de A
    expect(lignes[1]).toContain("50 000 Ar"); // Solde de B
    zone.querySelector(".reserve-bascule").click(); // Retouche
    expect(detail.hidden).toBe(true); // Repliée
  }); // Fin du cas

  it("avertit quand le total réservé dépasse le solde OM disponible", async () => { // Libre négatif
    await poserSolde(500000); // Solde
    const id = await budget({ montantMax: 900000 }); // Budget
    await allouerBudget(base, { budgetId: id, montant: 400000 }); // Réserve 400 000
    await poserSolde(300000, new Date(Date.now() + 1000).toISOString().replace(/\.\d+Z$/, ".000Z")); // Solde réel plus bas, daté d'après
    await monter(afficherAccueil); // Accueil
    expect(zone.textContent).toContain("n'a peut-être pas été enregistrée"); // Avertissement
  }); // Fin du cas
}); // Fin du groupe

describe("allocation : limite du solde libre (écrans)", () => { // Allocation manuelle et lancement
  it("explique qu'il faut saisir le solde OM avant d'allouer, sans afficher le formulaire", async () => { // Sans solde
    await budget(); // Budget
    await monter(afficherFormulaireAllocation); // Formulaire
    expect(zone.textContent).toContain("Saisissez d'abord le solde"); // Message
    expect(zone.querySelector("#alloc-montant")).toBeNull(); // Pas de formulaire
    expect(zone.querySelector("a[href='#/solde/nouveau']")).not.toBeNull(); // Lien vers la saisie
  }); // Fin du cas

  it("affiche le libre à allouer dans le formulaire et refuse un montant trop grand sous le champ", async () => { // Limite
    await poserSolde(150000); // Solde de 150 000
    const id = await budget(); // Budget
    await monter(afficherFormulaireAllocation, { budgetId: String(id) }); // Formulaire
    expect(zone.textContent).toMatch(/Libre à allouer : 150\s000 Ar/); // Libre affiché
    saisir("alloc-montant", "150001"); // Un de trop
    toucher("Allouer"); // Alloue
    await vi.waitFor(() => expect(erreurDe("alloc-montant")).toMatch(/Solde libre insuffisant/)); // Message sous le montant
    expect(await listerTransactions(base)).toHaveLength(0); // Rien n'est écrit
    saisir("alloc-montant", "150 000"); // Pile le libre
    toucher("Allouer"); // Alloue
    await vi.waitFor(async () => expect(await listerTransactions(base)).toHaveLength(1)); // Accepté
  }); // Fin du cas

  it("la situation des allocations affiche le libre, ou demande le solde OM", async () => { // Écran des allocations
    await budget(); // Budget
    await monter(afficherAllocations); // Écran
    expect(zone.textContent).toContain("Aucun solde Orange Money saisi"); // Sans solde
    zone.replaceChildren(); // Vide la zone
    await poserSolde(250000); // Solde
    await monter(afficherAllocations); // Écran
    expect(zone.textContent).toMatch(/Libre à allouer : 250\s000 Ar/); // Avec solde
  }); // Fin du cas

  it("refuse le lancement (tout ou rien) quand le libre ne suffit pas, avec le détail dans le message", async () => { // Lancement refusé
    await poserSolde(150000); // Solde de 150 000
    await budget({ name: "A" }); // 100 000
    await budget({ name: "B", montantBudget: 100000 }); // 100 000 : total 200 000 > 150 000
    await monter(afficherAllocations); // Écran
    toucher("Lancer l'allocation de la période"); // Touche le bouton
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Confirme
    await vi.waitFor(() => expect(document.querySelector(".toast-erreur").textContent).toMatch(/demande 200\s000 Ar, il reste 150\s000 Ar.*Il manque 50\s000 Ar\. Rien n'a été alloué/)); // Message complet
    expect(await listerTransactions(base)).toHaveLength(0); // Rien n'est écrit
  }); // Fin du cas

  it("lance l'allocation quand le libre suffit", async () => { // Lancement accepté
    await poserSolde(250000); // Solde de 250 000
    await budget({ name: "A" }); // 100 000
    await budget({ name: "B", montantBudget: 100000 }); // 100 000
    await monter(afficherAllocations); // Écran
    toucher("Lancer l'allocation de la période"); // Touche le bouton
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Confirme
    await vi.waitFor(() => expect(zone.textContent).toContain("Détail du lancement")); // Détail affiché
    expect(await listerTransactions(base)).toHaveLength(2); // Deux allocations écrites
  }); // Fin du cas
}); // Fin du groupe
