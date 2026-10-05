// @vitest-environment jsdom
// Tests d'intégration des écrans de report et de transfert (vraie logique métier, vraie base, DOM simulé).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeOMDeTest } from "../../core/db/aide-tests.js"; // Base neuve pour chaque cas et solde OM de test
import { creerTypeBudget } from "../../core/types-budget.js"; // Types
import { creerBudget } from "../../core/budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense, resumeBudgets } from "../../core/allocations.js"; // Allocation et dépense
import { lancerAllocationPeriode } from "../../core/reallocation.js"; // Report
import { listerTransactions } from "../../core/transactions.js"; // Transactions
import { periodePour } from "../../core/periodes.js"; // Période en cours
import { afficherAllocations, afficherFormulaireTransfert, decrireResultat } from "./allocations.js"; // Écrans à tester
import { afficherOperations } from "./operations.js"; // Liste des opérations

let base; // Base utilisée par les cas de test
let zone; // Zone où l'écran est dessiné
let typeId; // Type de budget disponible

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  await ajouterSoldeOMDeTest(base); // Solde OM très grand : ces tests ne vérifient pas la limite du solde OM
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran neuve
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

const budget = (surcharges = {}) => creerBudget(base, { name: "Sorties", typeId, montantBudget: 100000, montantMax: 200000, montantMin: 0, soldeAlert: 10000, autogenFinMois: false, ...surcharges }); // Crée un budget
const monter = async (ecran, params = undefined) => { await ecran(zone, { base, params }); }; // Dessine un écran
const saisir = (id, valeur) => { zone.querySelector(`#${id}`).value = valeur; }; // Remplit un champ
const choisir = (id, valeur) => { const s = zone.querySelector(`#${id}`); s.value = valeur; s.dispatchEvent(new Event("change")); }; // Change une liste déroulante
const toucher = (texte) => { [...zone.querySelectorAll("button, a.bouton")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton
const erreurDe = (id) => zone.querySelector(`#${id}-message`).textContent; // Message d'erreur sous un champ
const confirmerDialogue = () => document.querySelectorAll(".dialogue-actions button")[1].click(); // Clique sur le bouton de confirmation
const annulerDialogue = () => document.querySelectorAll(".dialogue-actions button")[0].click(); // Clique sur Annuler

// Une date située dans la période PRÉCÉDENTE (5 jours avant le début de la période en cours), à midi.
const datePeriodePrecedente = () => { // Aucun paramètre
  const [a, m, j] = periodePour(20).dateFrom.split("-").map(Number); // Début de la période en cours (jour réglé par défaut : 20)
  return new Date(a, m - 1, j - 5, 12); // Cinq jours plus tôt
}; // Fin de datePeriodePrecedente

// Crée un budget alloué de 100 000 sur la période précédente, avec 60 000 dépensés (reliquat : 40 000).
const budgetAvecReliquat = async (surcharges = {}) => { // Valeurs modifiables
  const id = await budget(surcharges); // Budget
  const avant = datePeriodePrecedente(); // Date de la période précédente
  await allouerBudget(base, { budgetId: id, montant: 100000 }, avant); // Allocation de la période précédente
  await enregistrerDepense(base, { budgetId: id, montant: 60000, dateOperation: avant.toISOString() }, avant); // 60 000 dépensés
  return id; // Identifiant du budget
}; // Fin de budgetAvecReliquat

describe("lancement de la période (écran)", () => { // Report du reliquat
  it("décrit le résultat de chaque budget en une phrase", () => { // Phrases
    expect(decrireResultat({ statut: "alloue", montantAlloue: 100000, reliquatReporte: 40000, soldeApres: 140000 })).toBe("Alloué 100 000 Ar + reliquat reporté 40 000 Ar → solde 140 000 Ar"); // Allocation avec report
    expect(decrireResultat({ statut: "alloue", montantAlloue: 100000, reliquatReporte: 0, soldeApres: 100000 })).toBe("Alloué 100 000 Ar → solde 100 000 Ar"); // Allocation sans report
    expect(decrireResultat({ statut: "reporte", reliquatReporte: 30000, soldeApres: 30000 })).toBe("Reliquat reporté 30 000 Ar → solde 30 000 Ar"); // Report seul
    expect(decrireResultat({ statut: "deja", soldeApres: 5 })).toMatch(/rien à faire/); // Déjà fait
    expect(decrireResultat({ statut: "refuse", raison: "Minimum non atteint" })).toBe("Minimum non atteint"); // Refus : la raison
  }); // Fin du cas

  it("lance l'allocation après confirmation, reporte le reliquat et affiche le détail", async () => { // Lancement
    await budgetAvecReliquat(); // Budget avec 40 000 de reliquat
    await monter(afficherAllocations); // Dessine la situation
    toucher("Lancer l'allocation de la période"); // Touche le bouton
    expect(document.querySelector("[role=dialog]").textContent).toContain("reliquats"); // La confirmation explique le report
    confirmerDialogue(); // Confirme
    await vi.waitFor(() => expect(zone.textContent).toContain("Détail du lancement")); // Détail affiché
    expect(zone.textContent).toContain("reliquat reporté 40 000 Ar"); // Report mentionné
    expect((await resumeBudgets(base))[0].allocation.solde).toBe(140000); // 100 000 + 40 000
  }); // Fin du cas

  it("n'écrit rien si on annule, et ne duplique rien si on relance", async () => { // Annulation et idempotence
    await budgetAvecReliquat(); // Budget avec reliquat
    await monter(afficherAllocations); // Dessine la situation
    toucher("Lancer l'allocation de la période"); // Touche le bouton
    annulerDialogue(); // Annule
    await vi.waitFor(() => expect(document.querySelector("[role=dialog]")).toBeNull()); // Fenêtre fermée
    expect((await resumeBudgets(base))[0].allocation).toBeNull(); // Rien n'a été fait
    toucher("Lancer l'allocation de la période"); // Relance
    confirmerDialogue(); // Confirme
    await vi.waitFor(() => expect(zone.textContent).toContain("Détail du lancement")); // Fait
    const nombre = (await listerTransactions(base)).length; // Nombre de transactions
    toucher("Lancer l'allocation de la période"); // Troisième lancement
    confirmerDialogue(); // Confirme
    await vi.waitFor(() => expect(zone.textContent).toContain("rien à faire")); // Détail : déjà à jour
    expect((await listerTransactions(base)).length).toBe(nombre); // Aucune transaction ajoutée
  }); // Fin du cas

  it("montre le report dans les opérations, en lecture seule, avec son filtre", async () => { // Liste des opérations
    await budgetAvecReliquat(); // Budget avec reliquat
    await lancerAllocationPeriode(base); // Report
    await monter(afficherOperations); // Liste
    const cartesReport = [...zone.querySelectorAll(".liste-operations .carte")].filter((c) => c.textContent.includes("Report ·")); // Cartes de report
    expect(cartesReport).toHaveLength(2); // Deux lignes
    expect(zone.textContent).toContain("Report de la période du"); // Note du report
    expect(cartesReport.every((c) => c.querySelector("[aria-label='Modifier cette opération']") === null)).toBe(true); // Aucun bouton de modification
    const select = zone.querySelector("#filtre-sens"); // Filtre de type
    select.value = "mouvements"; select.dispatchEvent(new Event("change")); // Filtre « Reports et transferts »
    await vi.waitFor(() => expect(zone.querySelectorAll(".liste-operations .carte")).toHaveLength(2)); // Seulement les deux lignes de report
  }); // Fin du cas

  it("propose le transfert de l'excédent quand le plafond est dépassé et préremplit le montant", async () => { // Plafond
    const id = await budgetAvecReliquat({ montantMax: 120000 }); // Plafond 120 000
    await budget({ name: "Autre" }); // Second budget
    await lancerAllocationPeriode(base); // Période en cours : 140 000 > 120 000
    await monter(afficherAllocations); // Situation
    expect(zone.textContent).toContain("de 20 000 Ar"); // Excédent annoncé
    expect(zone.querySelector(`a[href='#/allocations/transfert/${id}']`)).not.toBeNull(); // Lien « Transférer l'excédent »
    zone.replaceChildren(); // Vide la zone
    await monter(afficherFormulaireTransfert, { sourceId: String(id) }); // Formulaire avec source présélectionnée
    expect(zone.querySelector("#tr-montant").value).toBe("20000"); // Montant proposé = excédent
  }); // Fin du cas
}); // Fin du groupe

describe("transfert entre budgets (écran)", () => { // Réallocation manuelle
  it("effectue un transfert entre deux budgets", async () => { // Transfert
    const a = await budget({ name: "A" }); // Budget A
    const b = await budget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }); // A : 100 000
    await allouerBudget(base, { budgetId: b, montant: 20000 }); // B : 20 000
    await monter(afficherFormulaireTransfert); // Formulaire
    choisir("tr-source", String(a)); // Source A
    choisir("tr-destination", String(b)); // Destination B
    saisir("tr-montant", "30 000"); // Montant
    saisir("tr-note", "Urgence"); // Note
    toucher("Transférer"); // Transfère
    await vi.waitFor(async () => expect((await resumeBudgets(base)).find((r) => r.budget.id === b).allocation.solde).toBe(50000)); // B reçoit 30 000
    expect((await resumeBudgets(base)).find((r) => r.budget.id === a).allocation.solde).toBe(70000); // A perd 30 000
    expect(window.location.hash).toBe("#/allocations"); // Retour à la situation
  }); // Fin du cas

  it("affiche les erreurs de transfert sous les champs", async () => { // Erreurs
    const a = await budget({ name: "A" }); // Budget A
    await budget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 1000 }); // A : 1 000
    await monter(afficherFormulaireTransfert); // Formulaire
    choisir("tr-source", String(a)); // Source A
    choisir("tr-destination", String(a)); // Même budget
    saisir("tr-montant", "500"); // Montant
    toucher("Transférer"); // Transfère
    await vi.waitFor(() => expect(erreurDe("tr-destination")).toMatch(/différent/)); // Même budget refusé
    choisir("tr-destination", ""); // Pas de destination
    toucher("Transférer"); // Transfère
    await vi.waitFor(() => expect(erreurDe("tr-destination")).toMatch(/Choisissez/)); // Destination obligatoire
    saisir("tr-montant", "12,5"); // Montant à virgule
    toucher("Transférer"); // Transfère
    await vi.waitFor(() => expect(erreurDe("tr-montant")).toMatch(/entier/)); // Format refusé
  }); // Fin du cas

  it("refuse un transfert supérieur au solde de la source", async () => { // Solde insuffisant
    const a = await budget({ name: "A" }); // Budget A
    const b = await budget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 1000 }); // A : 1 000
    await monter(afficherFormulaireTransfert); // Formulaire
    choisir("tr-source", String(a)); // Source A
    choisir("tr-destination", String(b)); // Destination B
    saisir("tr-montant", "1001"); // Plus que le solde
    toucher("Transférer"); // Transfère
    await vi.waitFor(() => expect(erreurDe("tr-montant")).toMatch(/Solde insuffisant/)); // Message sous le montant
  }); // Fin du cas

  it("demande au moins deux budgets pour un transfert", async () => { // Un seul budget
    await budget(); // Un seul budget
    await monter(afficherFormulaireTransfert); // Formulaire
    expect(zone.textContent).toContain("au moins deux budgets"); // Message
  }); // Fin du cas
}); // Fin du groupe
