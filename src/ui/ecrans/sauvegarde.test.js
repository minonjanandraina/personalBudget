// @vitest-environment jsdom
// Tests d'intégration de l'écran « Sauvegarde et restauration » (faux accès aux fichiers, vraie logique et vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeOMDeTest } from "../../core/db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget, listerTypesBudget } from "../../core/types-budget.js"; // Types
import { creerBudget, listerBudgets } from "../../core/budgets.js"; // Budgets
import { allouerBudget } from "../../core/allocations.js"; // Allocation
import { creerTexteSauvegarde, verifierSauvegarde, lireDerniereSauvegarde } from "../../core/sauvegarde.js"; // Sauvegarde
import { afficherSauvegarde, decrireContenu } from "./sauvegarde.js"; // Écran à tester

let base; // Base utilisée par les cas de test (celle du téléphone)
let zone; // Zone où l'écran est dessiné

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran neuve
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
}); // Fin de la préparation

// Crée une base « d'un autre téléphone » avec ses propres données et renvoie le texte de sa sauvegarde.
async function sauvegardeAutreTelephone() { // Aucun paramètre
  const autre = await creerBaseDeTest(); // Autre base
  await ajouterSoldeOMDeTest(autre); // Solde OM
  const t = await creerTypeBudget(autre, { name: "Scolarité" }); // Type
  const b = await creerBudget(autre, { name: "Écolage", typeId: t, montantBudget: 50000, montantMax: 100000, montantMin: 0, soldeAlert: 0, autogenFinMois: false }); // Budget
  await allouerBudget(autre, { budgetId: b, montant: 50000 }); // Allocation
  return creerTexteSauvegarde(autre); // Texte de la sauvegarde
} // Fin de sauvegardeAutreTelephone

// Faux accès aux fichiers : enregistre ce qu'on lui donne, et « choisit » le fichier indiqué.
const faux = (choix = null) => ({ // Reçoit le fichier à « choisir » ({ nom, texte } ou null)
  enregistrerFichier: vi.fn(async () => ({ mode: "partage" })), // Simule l'enregistrement
  choisirFichierTexte: vi.fn(async () => choix), // Simule le sélecteur de fichiers
}); // Fin de faux

const monter = async (fichiers) => { zone.replaceChildren(); await afficherSauvegarde(zone, { base, fichiers }); }; // Dessine l'écran
const toucher = (texte) => { [...zone.querySelectorAll("button")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton
const dialogue = () => document.querySelector("[role=dialog]"); // Fenêtre de confirmation ouverte
const confirmerDialogue = () => document.querySelectorAll(".dialogue-actions button")[1].click(); // Bouton de confirmation
const annulerDialogue = () => document.querySelectorAll(".dialogue-actions button")[0].click(); // Bouton Annuler

describe("décrire le contenu", () => { // Phrases
  it("accorde les mots au pluriel", () => { // Pluriel
    expect(decrireContenu({ budget: 2, type_budget: 1, solde_om: 0, transactions: 12 })).toBe("2 budgets, 1 type de budget, 0 solde OM, 12 opérations"); // Singulier et pluriel
  }); // Fin du cas
}); // Fin du groupe

describe("sauvegarder", () => { // Création du fichier
  it("affiche « aucune sauvegarde » au départ", async () => { // État initial
    await monter(faux()); // Écran
    expect(zone.textContent).toContain("Aucune sauvegarde créée pour l'instant"); // Message
    expect(zone.textContent).not.toContain("Annuler la dernière restauration"); // Pas de carte d'annulation
  }); // Fin du cas

  it("crée un fichier daté et valide, l'envoie à l'enregistrement et retient la date", async () => { // Cas nominal
    await creerTypeBudget(base, { name: "Loisir" }); // Une donnée
    const f = faux(); // Faux fichiers
    await monter(f); // Écran
    toucher("Sauvegarder maintenant"); // Touche le bouton
    await vi.waitFor(() => expect(f.enregistrerFichier).toHaveBeenCalledOnce()); // Fichier envoyé
    const { nom, contenu } = f.enregistrerFichier.mock.calls[0][0]; // Ce qui a été enregistré
    expect(nom).toMatch(/^volako_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/); // Nom daté
    expect((await verifierSauvegarde(contenu)).resume.nombres.type_budget).toBe(1); // Contenu valide avec la donnée
    await vi.waitFor(async () => expect(await lireDerniereSauvegarde(base)).not.toBeNull()); // Date retenue
    await vi.waitFor(() => expect(zone.textContent).toContain("Dernière sauvegarde créée :")); // Écran mis à jour
    expect(document.querySelector(".toast-succes").textContent).toContain(nom); // Notification avec le nom du fichier
  }); // Fin du cas

  it("signale l'échec de l'enregistrement et ne retient pas de date", async () => { // Échec
    const f = faux(); // Faux fichiers
    f.enregistrerFichier.mockRejectedValue(new Error("Espace insuffisant")); // Simule une panne
    await monter(f); // Écran
    toucher("Sauvegarder maintenant"); // Touche le bouton
    await vi.waitFor(() => expect(document.querySelector(".toast-erreur").textContent).toContain("Espace insuffisant")); // Message d'erreur
    expect(await lireDerniereSauvegarde(base)).toBeNull(); // Pas de date retenue
  }); // Fin du cas
}); // Fin du groupe

describe("restaurer", () => { // Restauration depuis un fichier
  it("vérifie le fichier, demande confirmation avec le détail, puis remplace les données", async () => { // Cas nominal
    await creerTypeBudget(base, { name: "Mes données actuelles" }); // Données qui seront remplacées
    const texte = await sauvegardeAutreTelephone(); // Sauvegarde d'un autre téléphone
    const f = faux({ nom: "volako_2026-10-05_14-00-00.json", texte }); // Fichier « choisi »
    await monter(f); // Écran
    toucher("Choisir un fichier de sauvegarde"); // Touche le bouton
    await vi.waitFor(() => expect(dialogue()).not.toBeNull()); // Confirmation demandée
    expect(dialogue().textContent).toContain("1 budget, 1 type de budget, 1 solde OM, 1 opération"); // Contenu de la sauvegarde
    expect(dialogue().textContent).toContain("0 budget, 1 type de budget"); // Contenu actuel annoncé comme remplacé
    expect(dialogue().textContent).toContain("REMPLACÉES"); // Avertissement
    expect(await listerTypesBudget(base)).toHaveLength(1); // Rien n'est encore remplacé
    confirmerDialogue(); // Confirme
    await vi.waitFor(async () => expect((await listerBudgets(base)).map((b) => b.name)).toEqual(["Écolage"])); // Données remplacées
    expect((await listerTypesBudget(base)).map((t) => t.name)).toEqual(["Scolarité"]); // Anciens types disparus
    expect(window.location.hash).toBe("#/"); // Retour à l'accueil
    expect(document.querySelector(".toast-succes").textContent).toContain("restaurée"); // Notification
  }); // Fin du cas

  it("ne change rien si l'utilisateur annule le choix du fichier ou la confirmation", async () => { // Annulations
    await creerTypeBudget(base, { name: "Intact" }); // Donnée
    const texte = await sauvegardeAutreTelephone(); // Autre sauvegarde
    await monter(faux(null)); // Sélecteur annulé
    toucher("Choisir un fichier de sauvegarde"); // Touche le bouton
    await new Promise((r) => setTimeout(r, 30)); // Laisse le temps de réagir
    expect(dialogue()).toBeNull(); // Aucune confirmation
    await monter(faux({ nom: "x.json", texte })); // Fichier choisi
    toucher("Choisir un fichier de sauvegarde"); // Touche le bouton
    await vi.waitFor(() => expect(dialogue()).not.toBeNull()); // Confirmation
    annulerDialogue(); // Annule
    await vi.waitFor(() => expect(dialogue()).toBeNull()); // Fenêtre fermée
    expect((await listerTypesBudget(base)).map((t) => t.name)).toEqual(["Intact"]); // Données intactes
  }); // Fin du cas

  it("refuse un fichier abîmé avec un message clair et sans rien modifier", async () => { // Fichier corrompu
    await creerTypeBudget(base, { name: "Intact" }); // Donnée
    const texte = await sauvegardeAutreTelephone(); // Sauvegarde valide
    const abime = texte.replace("50000", "99999"); // Modifie un montant : l'empreinte ne correspond plus
    await monter(faux({ nom: "abime.json", texte: abime })); // Fichier abîmé
    toucher("Choisir un fichier de sauvegarde"); // Touche le bouton
    await vi.waitFor(() => expect(zone.querySelector(".alerte-danger")).not.toBeNull()); // Alerte affichée
    expect(zone.querySelector(".alerte-danger").textContent).toMatch(/« abime\.json » ne peut pas être restauré.*abîmé ou a été modifié/); // Nom du fichier et explication
    expect(dialogue()).toBeNull(); // Pas de confirmation
    expect((await listerTypesBudget(base)).map((t) => t.name)).toEqual(["Intact"]); // Données intactes
  }); // Fin du cas

  it("refuse un fichier qui n'est pas une sauvegarde (photo, texte...)", async () => { // Mauvais fichier
    await monter(faux({ nom: "notes.txt", texte: "Liste de courses : riz, huile" })); // Fichier quelconque
    toucher("Choisir un fichier de sauvegarde"); // Touche le bouton
    await vi.waitFor(() => expect(zone.querySelector(".alerte-danger")).not.toBeNull()); // Alerte affichée
    expect(zone.querySelector(".alerte-danger").textContent).toContain("illisible ou incomplet"); // Explication
  }); // Fin du cas

  it("efface l'erreur précédente quand on choisit un autre fichier", async () => { // Message temporaire
    const f = faux({ nom: "mauvais.txt", texte: "xxx" }); // Mauvais fichier
    await monter(f); // Écran
    toucher("Choisir un fichier de sauvegarde"); // Premier essai
    await vi.waitFor(() => expect(zone.querySelector(".alerte-danger")).not.toBeNull()); // Erreur
    f.choisirFichierTexte.mockResolvedValue(null); // Le second essai est annulé
    toucher("Choisir un fichier de sauvegarde"); // Second essai
    await vi.waitFor(() => expect(zone.querySelector(".alerte-danger")).toBeNull()); // Erreur effacée
  }); // Fin du cas
}); // Fin du groupe

describe("annuler la dernière restauration (écran)", () => { // Copie de sécurité
  it("propose d'annuler après une restauration, et rétablit les données d'avant", async () => { // Cycle complet
    await creerTypeBudget(base, { name: "Avant la restauration" }); // Données d'origine
    const texte = await sauvegardeAutreTelephone(); // Autre sauvegarde
    await monter(faux({ nom: "x.json", texte })); // Écran
    toucher("Choisir un fichier de sauvegarde"); // Choisit
    await vi.waitFor(() => expect(dialogue()).not.toBeNull()); // Confirmation
    confirmerDialogue(); // Confirme
    await vi.waitFor(async () => expect((await listerTypesBudget(base)).map((t) => t.name)).toEqual(["Scolarité"])); // Restauré
    await monter(faux()); // Redessine l'écran
    expect(zone.textContent).toContain("Annuler la dernière restauration"); // Carte d'annulation visible
    toucher("Annuler la dernière restauration"); // Touche le bouton
    await vi.waitFor(() => expect(dialogue()).not.toBeNull()); // Confirmation
    expect(dialogue().textContent).toContain("seront rétablies"); // Explication
    confirmerDialogue(); // Confirme
    await vi.waitFor(async () => expect((await listerTypesBudget(base)).map((t) => t.name)).toEqual(["Avant la restauration"])); // Données d'origine retrouvées
  }); // Fin du cas
}); // Fin du groupe
