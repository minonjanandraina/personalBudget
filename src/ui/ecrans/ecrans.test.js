// @vitest-environment jsdom
// Tests d'intégration des écrans : vraie logique métier, vraie base (sql.js en mémoire), vrai DOM simulé (jsdom).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget, listerTypesBudget } from "../../core/types-budget.js"; // Types
import { creerBudget, listerBudgets } from "../../core/budgets.js"; // Budgets
import { listerSoldes, creerSolde } from "../../core/soldes.js"; // Soldes
import { lireJourJob } from "../../core/parametres.js"; // Paramètre du jour
import { afficherTypes, afficherFormulaireType } from "./types-budget.js"; // Écrans des types
import { afficherBudgets, afficherFormulaireBudget } from "./budgets.js"; // Écrans des budgets
import { afficherSoldes, afficherFormulaireSolde } from "./solde.js"; // Écrans du solde
import { afficherReglages } from "./reglages.js"; // Écran des réglages
import { afficherAccueil } from "./accueil.js"; // Écran d'accueil

let base; // Base utilisée par les cas de test
let zone; // Zone où l'écran est dessiné

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran neuve
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
}); // Fin de la préparation

// Dessine un écran dans la zone.
const monter = async (ecran, params = undefined) => { await ecran(zone, { base, params }); }; // Appelle la fonction d'écran

// Écrit une valeur dans un champ (par son identifiant).
const saisir = (id, valeur) => { zone.querySelector(`#${id}`).value = valeur; }; // Remplit le champ

// Touche un bouton selon son texte.
const toucher = (texte) => { [...zone.querySelectorAll("button, a.bouton")].find((b) => b.textContent.trim() === texte).click(); }; // Clique

// Texte du message d'erreur sous un champ.
const erreurDe = (id) => zone.querySelector(`#${id}-message`).textContent; // Lit le message

describe("types de budget", () => { // Écrans des types
  it("affiche un message quand il n'y a aucun type", async () => { // Liste vide
    await monter(afficherTypes); // Dessine la liste
    expect(zone.textContent).toContain("Aucun type de budget"); // Message d'aide
  }); // Fin du cas

  it("crée un type avec son code automatique et revient à la liste", async () => { // Création
    await monter(afficherFormulaireType); // Dessine le formulaire
    saisir("type-nom", "Loisir"); // Saisit le nom
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(async () => expect(await listerTypesBudget(base)).toHaveLength(1)); // Le type est créé
    expect((await listerTypesBudget(base))[0].code).toBe("bdg-001"); // Code automatique
    expect(window.location.hash).toBe("#/types-budget"); // Retour à la liste
    expect(document.querySelector(".toast-succes")).not.toBeNull(); // Notification de succès
  }); // Fin du cas

  it("refuse un nom vide avec un message sous le champ", async () => { // Validation
    await monter(afficherFormulaireType); // Dessine le formulaire
    toucher("Enregistrer"); // Enregistre sans rien saisir
    await vi.waitFor(() => expect(erreurDe("type-nom")).toMatch(/obligatoire/)); // Message sous le champ
    expect(await listerTypesBudget(base)).toHaveLength(0); // Rien n'est créé
    expect(window.location.hash).toBe(""); // On reste sur le formulaire
  }); // Fin du cas

  it("modifie le nom d'un type existant", async () => { // Modification
    const id = await creerTypeBudget(base, { name: "Ancien" }); // Type existant
    await monter(afficherFormulaireType, { id: String(id) }); // Formulaire en modification
    expect(zone.querySelector("#type-nom").value).toBe("Ancien"); // Champ prérempli
    saisir("type-nom", "Nouveau"); // Change le nom
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(async () => expect((await listerTypesBudget(base))[0].name).toBe("Nouveau")); // Nom modifié
  }); // Fin du cas

  it("signale un type introuvable", async () => { // Identifiant inconnu
    await monter(afficherFormulaireType, { id: "999" }); // Formulaire pour un type absent
    expect(zone.textContent).toContain("n'existe plus"); // Message clair
  }); // Fin du cas

  it("supprime après confirmation, et annule si on refuse", async () => { // Suppression
    const id = await creerTypeBudget(base, { name: "A supprimer" }); // Type existant
    await monter(afficherTypes); // Dessine la liste
    zone.querySelector("[aria-label='Supprimer A supprimer']").click(); // Touche Supprimer
    document.querySelectorAll(".dialogue-actions button")[0].click(); // Choisit Annuler
    await vi.waitFor(() => expect(document.querySelector("[role=dialog]")).toBeNull()); // Fenêtre fermée
    expect(await listerTypesBudget(base)).toHaveLength(1); // Le type existe toujours
    zone.querySelector("[aria-label='Supprimer A supprimer']").click(); // Touche Supprimer de nouveau
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Confirme
    await vi.waitFor(async () => expect(await listerTypesBudget(base)).toHaveLength(0)); // Type supprimé
    expect(id).toBeGreaterThan(0); // (l'identifiant existait)
  }); // Fin du cas

  it("explique pourquoi un type utilisé ne peut pas être supprimé", async () => { // Suppression refusée
    const typeId = await creerTypeBudget(base, { name: "Utilisé" }); // Type
    await creerBudget(base, { name: "B", typeId, montantBudget: 1, montantMax: 2, montantMin: 0, soldeAlert: 0, autogenFinMois: false }); // Budget qui l'utilise
    await monter(afficherTypes); // Dessine la liste
    zone.querySelector("[aria-label='Supprimer Utilisé']").click(); // Touche Supprimer
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Confirme
    await vi.waitFor(() => expect(document.querySelector(".toast-erreur").textContent).toMatch(/1 budget/)); // Message d'erreur clair
    expect(await listerTypesBudget(base)).toHaveLength(1); // Le type existe toujours
  }); // Fin du cas
}); // Fin du groupe

describe("budgets", () => { // Écrans des budgets
  let typeId; // Type disponible
  beforeEach(async () => { // Avant chaque cas
    typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
  }); // Fin de la préparation

  // Remplit le formulaire avec des valeurs valides, modifiables.
  const remplir = (v = {}) => { // Valeurs à écrire
    const d = { nom: "Sorties", type: String(typeId), mensuel: "100 000", max: "150000", min: "0", alerte: "10000", ...v }; // Valeurs par défaut
    saisir("budget-nom", d.nom); saisir("budget-type", d.type); saisir("budget-mensuel", d.mensuel); // Nom, type, mensuel
    saisir("budget-max", d.max); saisir("budget-min", d.min); saisir("budget-alerte", d.alerte); // Plafond, minimum, alerte
  }; // Fin de remplir

  it("demande de créer un type d'abord s'il n'y en a aucun", async () => { // Aucun type
    await base.executer("DELETE FROM type_budget"); // Supprime le type
    await monter(afficherFormulaireBudget); // Dessine le formulaire
    expect(zone.textContent).toContain("Créez d'abord un type"); // Message
    expect(zone.querySelector("#budget-nom")).toBeNull(); // Pas de formulaire
  }); // Fin du cas

  it("crée un budget à partir de montants saisis avec des espaces", async () => { // Création
    await monter(afficherFormulaireBudget); // Dessine le formulaire
    remplir(); // Saisit des valeurs valides
    zone.querySelector("#budget-auto").click(); // Active l'allocation automatique
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(async () => expect(await listerBudgets(base)).toHaveLength(1)); // Budget créé
    const b = (await listerBudgets(base))[0]; // Relit
    expect([b.name, b.montantBudget, b.montantMax, b.soldeAlert, b.autogenFinMois]).toEqual(["Sorties", 100000, 150000, 10000, true]); // Valeurs correctes
    expect(window.location.hash).toBe("#/budgets"); // Retour à la liste
  }); // Fin du cas

  it("refuse les montants à virgule ou vides, champ par champ", async () => { // Validation de format
    await monter(afficherFormulaireBudget); // Dessine le formulaire
    remplir({ mensuel: "12,5", max: "", min: "abc" }); // Valeurs invalides
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("budget-mensuel")).toMatch(/entier/)); // Erreur sur le montant mensuel
    expect(erreurDe("budget-max")).toMatch(/Saisissez/); // Erreur sur le plafond
    expect(erreurDe("budget-min")).toMatch(/entier/); // Erreur sur le minimum
    expect(erreurDe("budget-alerte")).toBe(""); // Le champ correct n'a pas d'erreur
    expect(await listerBudgets(base)).toHaveLength(0); // Rien n'est créé
  }); // Fin du cas

  it("applique les règles croisées (minimum et montant au-dessus du plafond)", async () => { // Validation métier
    await monter(afficherFormulaireBudget); // Dessine le formulaire
    remplir({ mensuel: "200000", max: "150000", min: "160000" }); // Valeurs incohérentes
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("budget-min")).toMatch(/plafond/)); // Minimum au-dessus du plafond
    expect(erreurDe("budget-mensuel")).toMatch(/plafond/); // Mensuel au-dessus du plafond
    expect(await listerBudgets(base)).toHaveLength(0); // Rien n'est créé
  }); // Fin du cas

  it("efface les anciennes erreurs quand on corrige", async () => { // Erreurs temporaires
    await monter(afficherFormulaireBudget); // Dessine le formulaire
    remplir({ mensuel: "12,5" }); // Une erreur
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("budget-mensuel")).not.toBe("")); // Erreur affichée
    saisir("budget-mensuel", "100000"); // Corrige
    toucher("Enregistrer"); // Enregistre de nouveau
    await vi.waitFor(async () => expect(await listerBudgets(base)).toHaveLength(1)); // Budget créé
    expect(erreurDe("budget-mensuel")).toBe(""); // Plus d'erreur
  }); // Fin du cas

  it("exige de choisir un type", async () => { // Type obligatoire
    await monter(afficherFormulaireBudget); // Dessine le formulaire
    remplir({ type: "" }); // Aucun type choisi
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("budget-type")).toMatch(/Choisissez/)); // Message sous la liste
  }); // Fin du cas

  it("préremplit puis modifie un budget existant", async () => { // Modification
    const id = await creerBudget(base, { name: "Cinéma", typeId, montantBudget: 50000, montantMax: 80000, montantMin: 0, soldeAlert: 5000, autogenFinMois: false }); // Budget existant
    await monter(afficherFormulaireBudget, { id: String(id) }); // Formulaire en modification
    expect(zone.querySelector("#budget-nom").value).toBe("Cinéma"); // Nom prérempli
    expect(zone.querySelector("#budget-type").value).toBe(String(typeId)); // Type présélectionné
    expect(zone.querySelector("#budget-mensuel").value).toBe("50000"); // Montant prérempli
    saisir("budget-mensuel", "60000"); // Change le montant
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(async () => expect((await listerBudgets(base))[0].montantBudget).toBe(60000)); // Modifié
  }); // Fin du cas

  it("liste les budgets avec montants formatés et supprime après confirmation", async () => { // Liste et suppression
    await creerBudget(base, { name: "Écolage", typeId, montantBudget: 100000, montantMax: 150000, montantMin: 0, soldeAlert: 10000, autogenFinMois: false }); // Budget existant
    await monter(afficherBudgets); // Dessine la liste
    expect(zone.textContent).toContain("Écolage"); // Nom affiché
    expect(zone.textContent).toContain("100 000 Ar"); // Montant formaté
    zone.querySelector("[aria-label='Supprimer Écolage']").click(); // Touche Supprimer
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Confirme
    await vi.waitFor(async () => expect(await listerBudgets(base)).toHaveLength(0)); // Budget supprimé
  }); // Fin du cas
}); // Fin du groupe

describe("solde Mobile Money", () => { // Écrans du solde
  it("affiche un message quand l'historique est vide", async () => { // Liste vide
    await monter(afficherSoldes); // Dessine l'historique
    expect(zone.textContent).toContain("Aucun solde enregistré"); // Message d'aide
  }); // Fin du cas

  it("enregistre un solde saisi (date prérenseignée) et revient à l'historique", async () => { // Création
    await monter(afficherFormulaireSolde); // Dessine le formulaire
    expect(zone.querySelector("#solde-date").value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/); // Date préremplie
    saisir("solde-montant", "250 000"); // Saisit le montant
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(async () => expect(await listerSoldes(base)).toHaveLength(1)); // Solde créé
    expect((await listerSoldes(base))[0].balance).toBe(250000); // Montant correct
    expect(window.location.hash).toBe("#/solde"); // Retour à l'historique
  }); // Fin du cas

  it("refuse un montant illisible, une date invalide et une date future", async () => { // Validation
    await monter(afficherFormulaireSolde); // Dessine le formulaire
    saisir("solde-montant", "10.5"); // Montant à virgule
    saisir("solde-date", ""); // Date vide
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("solde-montant")).toMatch(/entier/)); // Erreur de montant
    expect(erreurDe("solde-date")).toMatch(/invalides/); // Erreur de date
    saisir("solde-montant", "1000"); // Corrige le montant
    saisir("solde-date", "2999-01-01T08:00"); // Date future
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("solde-date")).toMatch(/futur/)); // Erreur de date future
    expect(await listerSoldes(base)).toHaveLength(0); // Rien n'est enregistré
  }); // Fin du cas

  it("supprime un solde après confirmation", async () => { // Suppression
    await creerSolde(base, { datetime: "2026-10-01T08:00:00.000Z", balance: 5000 }, new Date("2026-10-05T00:00:00Z")); // Solde existant
    await monter(afficherSoldes); // Dessine l'historique
    expect(zone.textContent).toContain("5 000 Ar"); // Montant affiché
    zone.querySelector("[aria-label='Supprimer ce solde']").click(); // Touche Supprimer
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Confirme
    await vi.waitFor(async () => expect(await listerSoldes(base)).toHaveLength(0)); // Solde supprimé
  }); // Fin du cas

  it("l'accueil affiche le dernier solde saisi", async () => { // Accueil
    await creerSolde(base, { datetime: "2026-10-01T08:00:00.000Z", balance: 123456 }, new Date("2026-10-05T00:00:00Z")); // Solde existant
    await monter(afficherAccueil); // Dessine l'accueil
    expect(zone.textContent).toContain("123 456 Ar"); // Montant affiché (après animation sans effet en test : valeur de départ)
  }); // Fin du cas
}); // Fin du groupe

describe("réglages", () => { // Écran des réglages
  it("affiche le jour actuel et l'enregistre", async () => { // Modification
    await monter(afficherReglages); // Dessine l'écran
    expect(zone.querySelector("#reglage-jour").value).toBe("20"); // Valeur par défaut
    saisir("reglage-jour", "12"); // Change le jour
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(async () => expect(await lireJourJob(base)).toBe(12)); // Jour enregistré
  }); // Fin du cas

  it("refuse un jour hors de 1 à 28 ou à virgule et garde l'ancien", async () => { // Validation
    await monter(afficherReglages); // Dessine l'écran
    saisir("reglage-jour", "31"); // Jour impossible
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("reglage-jour")).toMatch(/1 à 28/)); // Message sous le champ
    saisir("reglage-jour", "1,5"); // Saisie à virgule
    toucher("Enregistrer"); // Enregistre
    await vi.waitFor(() => expect(erreurDe("reglage-jour")).toMatch(/entier/)); // Message de format
    expect(await lireJourJob(base)).toBe(20); // Valeur inchangée
  }); // Fin du cas
}); // Fin du groupe
