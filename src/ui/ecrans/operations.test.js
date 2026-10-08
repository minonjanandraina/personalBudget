// @vitest-environment jsdom
// Tests d'intégration des écrans d'allocation et de dépense (vraie logique métier, vraie base, DOM simulé).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeMMDeTest } from "../../core/db/aide-tests.js"; // Base neuve pour chaque cas et solde Mobile Money de test
import { creerTypeBudget } from "../../core/types-budget.js"; // Types
import { creerBudget } from "../../core/budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense, resumeBudgets, soldeAllocation } from "../../core/allocations.js"; // Allocation et dépense
import { listerTransactions } from "../../core/transactions.js"; // Transactions
import { afficherAllocations, afficherFormulaireAllocation } from "./allocations.js"; // Écrans des allocations
import { afficherOperations, afficherFormulaireDepense, afficherFormulaireOperation } from "./operations.js"; // Écrans des opérations
import { afficherBudgets } from "./budgets.js"; // Liste des budgets

let base; // Base utilisée par les cas de test
let zone; // Zone où l'écran est dessiné
let typeId; // Type de budget disponible

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  await ajouterSoldeMMDeTest(base); // Solde Mobile Money très grand : ces tests ne vérifient pas la limite du solde Mobile Money
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran neuve
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

// Crée un budget avec des valeurs par défaut modifiables ; renvoie son identifiant.
const budget = (surcharges = {}) => creerBudget(base, { name: "Sorties", typeId, montantBudget: 100000, montantMax: 150000, montantMin: 0, soldeAlert: 10000, autogenFinMois: false, ...surcharges }); // Création

const monter = async (ecran, params = undefined) => { await ecran(zone, { base, params }); }; // Dessine un écran
const saisir = (id, valeur) => { zone.querySelector(`#${id}`).value = valeur; }; // Remplit un champ
const choisir = (id, valeur) => { const s = zone.querySelector(`#${id}`); s.value = valeur; s.dispatchEvent(new Event("change")); }; // Change une liste déroulante
const toucher = (texte) => { [...zone.querySelectorAll("button, a.bouton")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton
const erreurDe = (id) => zone.querySelector(`#${id}-message`).textContent; // Message d'erreur sous un champ

describe("allocations (écrans)", () => { // Situation des budgets et formulaire
  it("explique qu'il faut d'abord créer un budget", async () => { // Aucun budget
    await monter(afficherAllocations); // Dessine la situation
    expect(zone.textContent).toContain("Aucun budget"); // Message
    zone.replaceChildren(); // Vide la zone
    await monter(afficherFormulaireAllocation); // Dessine le formulaire
    expect(zone.textContent).toContain("Créez d'abord un budget"); // Message
  }); // Fin du cas

  it("propose d'allouer un budget pas encore alloué", async () => { // Budget sans allocation
    const id = await budget(); // Budget
    await monter(afficherAllocations); // Dessine la situation
    expect(zone.textContent).toContain("Pas encore alloué"); // Message
    expect(zone.querySelector(`a[href='#/allocations/nouveau/${id}']`)).not.toBeNull(); // Lien d'allocation direct
  }); // Fin du cas

  it("propose le montant mensuel du budget choisi et alloue", async () => { // Allocation
    const id = await budget(); // Budget
    await monter(afficherFormulaireAllocation, { budgetId: String(id) }); // Formulaire avec budget présélectionné
    expect(zone.querySelector("#alloc-montant").value).toBe("100000"); // Montant proposé
    expect(zone.textContent).toMatch(/Période : \d{2}\/\d{2}\/\d{4} → \d{2}\/\d{2}\/\d{4}/); // Période affichée
    toucher("Allouer"); // Alloue
    await vi.waitFor(async () => expect(await listerTransactions(base)).toHaveLength(1)); // Transaction créée
    expect((await resumeBudgets(base))[0].allocation.solde).toBe(100000); // Solde de la période
    expect(window.location.hash).toBe("#/allocations"); // Retour à la situation
  }); // Fin du cas

  it("met à jour le montant proposé quand on change de budget", async () => { // Changement de budget
    await budget({ name: "A", montantBudget: 1000 }); // Budget A
    const b = await budget({ name: "B", montantBudget: 5000 }); // Budget B
    await monter(afficherFormulaireAllocation); // Formulaire sans présélection
    choisir("alloc-budget", String(b)); // Choisit B
    expect(zone.querySelector("#alloc-montant").value).toBe("5000"); // Montant de B proposé
  }); // Fin du cas

  it("affiche l'erreur du minimum sous le montant", async () => { // Contrôle du minimum
    const id = await budget({ montantMin: 50000 }); // Minimum 50 000
    await monter(afficherFormulaireAllocation, { budgetId: String(id) }); // Formulaire
    saisir("alloc-montant", "10 000"); // Montant trop faible
    toucher("Allouer"); // Alloue
    await vi.waitFor(() => expect(erreurDe("alloc-montant")).toMatch(/minimum/)); // Message sous le champ
    expect(await listerTransactions(base)).toHaveLength(0); // Rien n'est créé
  }); // Fin du cas

  it("refuse un montant illisible et un budget non choisi", async () => { // Validation de format
    await budget(); // Budget
    await monter(afficherFormulaireAllocation); // Formulaire
    saisir("alloc-montant", "12,5"); // Montant à virgule
    toucher("Allouer"); // Alloue
    await vi.waitFor(() => expect(erreurDe("alloc-montant")).toMatch(/entier/)); // Erreur de format
    saisir("alloc-montant", "1000"); // Corrige
    toucher("Allouer"); // Alloue sans budget
    await vi.waitFor(() => expect(erreurDe("alloc-budget")).toMatch(/Choisissez/)); // Budget obligatoire
  }); // Fin du cas

  it("affiche alloué, dépensé et solde, et avertit d'un plafond dépassé", async () => { // Situation
    const id = await budget({ montantMax: 120000 }); // Plafond 120 000
    await allouerBudget(base, { budgetId: id, montant: 150000 }); // Dépasse le plafond
    await monter(afficherAllocations); // Dessine la situation
    expect(zone.textContent).toContain("150 000 Ar"); // Montant alloué
    expect(zone.textContent).toContain("réallocation manuelle"); // Avertissement
  }); // Fin du cas

  it("la liste des budgets affiche le solde en cours", async () => { // Solde dans la liste des budgets
    const id = await budget(); // Budget
    await monter(afficherBudgets); // Dessine la liste
    expect(zone.textContent).toContain("Pas encore alloué"); // Avant allocation
    zone.replaceChildren(); // Vide la zone
    await allouerBudget(base, { budgetId: id, montant: 40000 }); // Alloue
    await monter(afficherBudgets); // Redessine
    expect(zone.textContent).toContain("Solde en cours : 40 000 Ar"); // Après allocation
  }); // Fin du cas
}); // Fin du groupe

describe("dépenses et liste des opérations (écrans)", () => { // Saisie et liste
  it("demande de créer un budget d'abord", async () => { // Aucun budget
    await base.executer("DELETE FROM type_budget"); // Aucun budget possible
    await monter(afficherFormulaireDepense); // Formulaire
    expect(zone.textContent).toContain("Créez d'abord un budget"); // Message
  }); // Fin du cas

  it("affiche le solde de chaque budget dans la liste de choix", async () => { // Libellés
    const a = await budget({ name: "Alloué" }); // Budget alloué
    await budget({ name: "Libre" }); // Budget non alloué
    await allouerBudget(base, { budgetId: a, montant: 30000 }); // Alloue le premier
    await monter(afficherFormulaireDepense); // Formulaire
    const options = [...zone.querySelectorAll("#dep-budget option")].map((o) => o.textContent); // Textes des options
    expect(options).toEqual(["— Choisir —", "Alloué — solde 30 000 Ar", "Libre — non alloué"]); // Soldes affichés
  }); // Fin du cas

  it("enregistre une dépense et la montre dans la liste", async () => { // Dépense
    const id = await budget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // Alloue
    await monter(afficherFormulaireDepense); // Formulaire
    choisir("dep-budget", String(id)); // Choisit le budget
    saisir("dep-montant", "60 000"); // Montant
    saisir("dep-note", "Cinéma"); // Note
    toucher("Enregistrer la dépense"); // Enregistre
    await vi.waitFor(async () => expect(await listerTransactions(base, { sens: -1 })).toHaveLength(1)); // Dépense créée
    expect(window.location.hash).toBe("#/operations"); // Retour à la liste
    zone.replaceChildren(); // Vide la zone
    await monter(afficherOperations); // Dessine la liste
    expect(zone.textContent).toContain("−60 000 Ar"); // Dépense en rouge avec signe moins
    expect(zone.textContent).toContain("+100 000 Ar"); // Allocation avec signe plus
    expect(zone.textContent).toContain("Cinéma"); // Note affichée
  }); // Fin du cas

  it("bloque une dépense supérieure au solde avec un message sous le montant", async () => { // Blocage
    const id = await budget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 10000 }); // Alloue 10 000
    await monter(afficherFormulaireDepense); // Formulaire
    choisir("dep-budget", String(id)); // Choisit le budget
    saisir("dep-montant", "10001"); // Dépasse le solde
    toucher("Enregistrer la dépense"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("dep-montant")).toMatch(/Solde insuffisant/)); // Message sous le champ
    expect(await listerTransactions(base, { sens: -1 })).toHaveLength(0); // Rien n'est créé
    expect(window.location.hash).toBe(""); // On reste sur le formulaire
  }); // Fin du cas

  it("explique qu'un budget non alloué ne peut pas être dépensé", async () => { // Pas d'allocation
    const id = await budget(); // Budget non alloué
    await monter(afficherFormulaireDepense); // Formulaire
    choisir("dep-budget", String(id)); // Choisit le budget
    saisir("dep-montant", "1000"); // Montant
    toucher("Enregistrer la dépense"); // Enregistre
    await vi.waitFor(() => expect(document.querySelector(".toast-erreur").textContent).toMatch(/Aucune allocation/)); // Message en notification
  }); // Fin du cas

  it("refuse montant illisible, date invalide et budget non choisi, champ par champ", async () => { // Validation
    await budget(); // Budget
    await monter(afficherFormulaireDepense); // Formulaire
    saisir("dep-montant", "abc"); // Montant illisible
    saisir("dep-date", ""); // Date vide
    toucher("Enregistrer la dépense"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("dep-montant")).toMatch(/entier/)); // Erreur de montant
    expect(erreurDe("dep-date")).toMatch(/invalides/); // Erreur de date
    saisir("dep-montant", "1000"); // Corrige
    saisir("dep-date", "2999-01-01T08:00"); // Date future
    toucher("Enregistrer la dépense"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("dep-date")).toMatch(/futur/)); // Erreur de date future
    expect(erreurDe("dep-budget")).toMatch(/Choisissez/); // Budget obligatoire
  }); // Fin du cas

  it("filtre la liste par budget et par type d'opération", async () => { // Filtres
    const a = await budget({ name: "A" }); // Budget A
    const b = await budget({ name: "B" }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 10000 }); // Allocation A
    await allouerBudget(base, { budgetId: b, montant: 20000 }); // Allocation B
    await monter(afficherOperations); // Liste
    expect(zone.querySelectorAll(".liste-operations .carte")).toHaveLength(2); // Deux opérations
    choisir("filtre-budget", String(a)); // Filtre sur A
    await vi.waitFor(() => expect(zone.querySelectorAll(".liste-operations .carte")).toHaveLength(1)); // Une seule
    expect(zone.querySelector(".liste-operations").textContent).toContain("10 000 Ar"); // C'est celle de A
    choisir("filtre-sens", "depense"); // Filtre sur les dépenses
    await vi.waitFor(() => expect(zone.querySelector(".liste-operations").textContent).toContain("Aucune opération")); // Aucune dépense pour A
  }); // Fin du cas

  it("affiche un message quand il n'y a aucune opération", async () => { // Liste vide
    await monter(afficherOperations); // Liste
    expect(zone.textContent).toContain("Aucune opération"); // Message
  }); // Fin du cas
}); // Fin du groupe

describe("modifier et supprimer une opération (écrans)", () => { // Modification et suppression
  let id; // Budget alloué de 100 000
  let depenseId; // Dépense de 30 000
  beforeEach(async () => { // Avant chaque cas
    id = await budget(); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }); // Alloue 100 000
    depenseId = (await enregistrerDepense(base, { budgetId: id, montant: 30000, dateOperation: new Date().toISOString(), note: "Essence" })).idTransaction; // Dépense
  }); // Fin de la préparation

  it("propose modifier et supprimer sur chaque opération manuelle", async () => { // Boutons
    await monter(afficherOperations); // Liste
    expect(zone.querySelectorAll("[aria-label='Modifier cette opération']")).toHaveLength(2); // Une allocation et une dépense
    expect(zone.querySelectorAll("[aria-label='Supprimer cette opération']")).toHaveLength(2); // Idem
  }); // Fin du cas

  it("n'offre aucun bouton sur une opération issue d'un SMS", async () => { // Opération automatique
    const allocation = (await base.requeter("SELECT id FROM allocation_budget"))[0].id; // Allocation existante
    await base.executer("INSERT INTO transactions (trx_id, allocation_id, insert_type, debit_credit, montant, sms) VALUES ('OM1', ?, 'auto', -1, 500, 'texte')", [allocation]); // Dépense venant d'un SMS
    await monter(afficherOperations); // Liste
    expect(zone.querySelectorAll("[aria-label='Modifier cette opération']")).toHaveLength(2); // Seules les 2 manuelles ont des boutons (3 opérations affichées)
    expect(zone.querySelectorAll(".liste-operations .carte")).toHaveLength(3); // Trois opérations affichées
  }); // Fin du cas

  it("préremplit le formulaire de modification d'une dépense et l'enregistre", async () => { // Modification
    await monter(afficherFormulaireOperation, { id: String(depenseId) }); // Formulaire
    expect(zone.querySelector("#op-montant").value).toBe("30000"); // Montant prérempli
    expect(zone.querySelector("#op-note").value).toBe("Essence"); // Note préremplie
    expect(zone.querySelector("#op-date")).not.toBeNull(); // Date modifiable pour une dépense
    saisir("op-montant", "45 000"); // Nouveau montant
    saisir("op-note", "Essence + péage"); // Nouvelle note
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(async () => expect((await listerTransactions(base, { sens: -1 }))[0].montant).toBe(45000)); // Montant modifié
    expect((await listerTransactions(base, { sens: -1 }))[0].note).toBe("Essence + péage"); // Note modifiée
    expect(window.location.hash).toBe("#/operations"); // Retour à la liste
  }); // Fin du cas

  it("n'offre pas la date pour une allocation", async () => { // Allocation
    const alimentation = (await listerTransactions(base, { sens: 1 }))[0].id; // Identifiant de l'allocation
    await monter(afficherFormulaireOperation, { id: String(alimentation) }); // Formulaire
    expect(zone.querySelector("#op-date")).toBeNull(); // Pas de date
    expect(zone.textContent).toContain("Allocation"); // Rappel du type
  }); // Fin du cas

  it("affiche l'erreur de solde insuffisant sous le montant", async () => { // Blocage
    await monter(afficherFormulaireOperation, { id: String(depenseId) }); // Formulaire
    saisir("op-montant", "100001"); // Dépasse le solde total
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("op-montant")).toMatch(/Solde insuffisant/)); // Message
    expect((await listerTransactions(base, { sens: -1 }))[0].montant).toBe(30000); // Rien n'a changé
  }); // Fin du cas

  it("refuse de réduire une allocation sous les dépenses", async () => { // Allocation réduite
    const alimentation = (await listerTransactions(base, { sens: 1 }))[0].id; // Identifiant de l'allocation
    await monter(afficherFormulaireOperation, { id: String(alimentation) }); // Formulaire
    saisir("op-montant", "20000"); // Moins que les 30 000 dépensés
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("op-montant")).toMatch(/dépasseraient/)); // Message
  }); // Fin du cas

  it("signale une opération introuvable ou non modifiable", async () => { // Cas d'erreur
    await monter(afficherFormulaireOperation, { id: "999" }); // Identifiant inconnu
    expect(zone.textContent).toContain("n'existe plus"); // Message
  }); // Fin du cas

  it("supprime après confirmation et rend le solde, et annule si on refuse", async () => { // Suppression
    await monter(afficherOperations); // Liste
    zone.querySelectorAll("[aria-label='Supprimer cette opération']")[0].click(); // Touche Supprimer sur la plus récente (la dépense)
    document.querySelectorAll(".dialogue-actions button")[0].click(); // Annule
    await vi.waitFor(() => expect(document.querySelector("[role=dialog]")).toBeNull()); // Fenêtre fermée
    expect(await listerTransactions(base, { sens: -1 })).toHaveLength(1); // La dépense existe toujours
    zone.querySelectorAll("[aria-label='Supprimer cette opération']")[0].click(); // Touche Supprimer de nouveau
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Confirme
    await vi.waitFor(async () => expect(await listerTransactions(base, { sens: -1 })).toHaveLength(0)); // Dépense supprimée
    await vi.waitFor(() => expect(zone.querySelectorAll(".liste-operations .carte")).toHaveLength(1)); // La liste est redessinée
    const allocation = (await base.requeter("SELECT id FROM allocation_budget"))[0].id; // Allocation
    expect(await soldeAllocation(base, Number(allocation))).toBe(100000); // Solde rétabli
  }); // Fin du cas

  it("explique pourquoi une allocation ne peut pas être supprimée", async () => { // Suppression refusée
    await monter(afficherOperations); // Liste
    zone.querySelectorAll("[aria-label='Supprimer cette opération']")[1].click(); // Touche Supprimer sur l'allocation (la plus ancienne)
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Confirme
    await vi.waitFor(() => expect(document.querySelector(".toast-erreur").textContent).toMatch(/Supprimez d'abord ces dépenses/)); // Message clair
    expect(await listerTransactions(base, { sens: 1 })).toHaveLength(1); // L'allocation existe toujours
  }); // Fin du cas
}); // Fin du groupe
