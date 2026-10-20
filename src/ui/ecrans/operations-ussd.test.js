// @vitest-environment jsdom
// Tests d'intégration des écrans d'opérations USSD (faux téléphone, vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, creerBudgetDeTest, ajouterSoldeMMDeTest } from "../../core/db/aide-tests.js"; // Base neuve, budget et solde Mobile Money
import { allouerBudget } from "../../core/allocations.js"; // Allocation
import { creerOperation, listerOperations } from "../../core/operations-ussd.js"; // Modèles
import { listerEnAttente } from "../../core/ussd-en-attente.js"; // Envois en attente
import { afficherOperationsUssd, afficherFormulaireOperationUssd, afficherLancerOperationUssd } from "./operations-ussd.js"; // Écrans à tester

let base; // Base de chaque cas
let zone; // Zone d'écran
let budgetId; // Budget débité

const faux = () => ({ // Faux téléphone
  demanderPermission: vi.fn(async () => true), // Permission accordée
  envoyerCode: vi.fn(async () => "Retrait en cours."), // Réponse de Mobile Money
}); // Fin du faux

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  await ajouterSoldeMMDeTest(base); // Solde Mobile Money énorme
  ({ budgetId } = await creerBudgetDeTest(base, { montant_budget: 100000, montant_max: 150000 })); // Budget
  await allouerBudget(base, { budgetId, montant: 20000 }); // Allocation de la période en cours
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
}); // Fin de la préparation

const saisir = (id, valeur) => { document.getElementById(id).value = valeur; }; // Remplit un champ
const boutons = (texte) => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === texte); // Boutons portant ce texte

describe("formulaire d'un modèle", () => { // Création
  it("refuse un code sans {montant} pour une sortie, puis crée le modèle", async () => { // Saisie
    await afficherFormulaireOperationUssd(zone, { base }); // Écran
    saisir("ussd-nom", "Retrait"); // Nom
    saisir("ussd-code", "#144*8*8*{numero}*{pin}#"); // Code sans montant
    saisir("ussd-budget", String(budgetId)); // Budget
    boutons("Enregistrer")[0].click(); // Valide
    await vi.waitFor(() => expect(zone.textContent).toContain("doit contenir {montant}")); // Refusé sous le champ
    expect(await listerOperations(base)).toHaveLength(0); // Rien créé
    saisir("ussd-code", "#144*8*8*{numero}*{montant}*{pin}#"); // Code correct
    boutons("Enregistrer")[0].click(); // Valide
    await vi.waitFor(async () => expect(await listerOperations(base)).toHaveLength(1)); // Créé
  }); // Fin du cas
}); // Fin du groupe

describe("liste et lancement", () => { // Utilisation
  it("liste les opérations en mosaïque, avec l'icône et la couleur choisies, sans jamais montrer le PIN", async () => { // Mosaïque
    await creerOperation(base, { nom: "Retrait", type: "sortie", code: "#144*8*8*{numero}*{montant}*{pin}#", budgetId, icone: "argent", couleur: "orange" }); // Modèle personnalisé
    await creerOperation(base, { nom: "Dépôt", type: "entree", code: "#144*2*{pin}#", budgetId: null }); // Modèle sans choix : valeurs par défaut
    await afficherOperationsUssd(zone, { base }); // Écran
    const tuiles = [...zone.querySelectorAll(".mosaique a.tuile-plate")]; // Tuiles de la mosaïque
    expect(tuiles.map((t) => t.textContent)).toEqual(["Dépôt", "Retrait"]); // Une tuile par opération (ordre alphabétique)
    const retrait = tuiles.find((t) => t.textContent === "Retrait"); // Tuile du retrait
    expect(retrait.querySelector(".tuile-plate-icone").classList.contains("fond-orange")).toBe(true); // Couleur choisie
    expect(retrait.getAttribute("href")).toMatch(/^#\/operations-ussd\/lancer\/\d+$/); // Toucher la tuile lance l'opération
    expect(tuiles.find((t) => t.textContent === "Dépôt").querySelector(".tuile-plate-icone").classList.contains("fond-vert")).toBe(true); // Couleur par défaut
    expect(zone.querySelectorAll(".mosaique a[aria-label='Modifier Retrait']")).toHaveLength(1); // Petit bouton modifier
    expect(zone.textContent).not.toContain("{pin}"); // Le PIN n'est jamais affiché
  }); // Fin du cas

  it("choisit l'icône et la couleur dans le formulaire et les enregistre", async () => { // Choix visuels
    await afficherFormulaireOperationUssd(zone, { base }); // Formulaire de création
    saisir("ussd-nom", "Électricité"); // Nom
    saisir("ussd-type", "entree"); // Entrée (pas de budget)
    saisir("ussd-code", "#144*6*{pin}#"); // Code
    expect(zone.querySelector("#ussd-icone .choisi").getAttribute("data-valeur")).toBe("telephone"); // Icône par défaut
    zone.querySelector("#ussd-icone [data-valeur='ampoule']").click(); // Choisit l'icône électricité
    zone.querySelector("#ussd-couleur [data-valeur='violet']").click(); // Choisit le violet
    expect(zone.querySelector("#ussd-couleur .choisi").getAttribute("data-valeur")).toBe("violet"); // Une seule pastille choisie
    boutons("Enregistrer")[0].click(); // Enregistre
    await vi.waitFor(async () => expect((await listerOperations(base))[0]).toMatchObject({ nom: "Électricité", icone: "ampoule", couleur: "violet" })); // Enregistré
  }); // Fin du cas

  it("rouvre le formulaire avec l'icône et la couleur enregistrées", async () => { // Modification
    const id = await creerOperation(base, { nom: "Panier", type: "entree", code: "#144*7*{pin}#", budgetId: null, icone: "panier", couleur: "rouge" }); // Modèle
    await afficherFormulaireOperationUssd(zone, { base, params: { id: String(id) } }); // Modification
    expect(zone.querySelector("#ussd-icone .choisi").getAttribute("data-valeur")).toBe("panier"); // Icône retrouvée
    expect(zone.querySelector("#ussd-couleur .choisi").getAttribute("data-valeur")).toBe("rouge"); // Couleur retrouvée
  }); // Fin du cas

  const suivant = async () => { boutons("Suivant")[0].click(); await new Promise((r) => setTimeout(r, 30)); }; // Passe à l'étape suivante
  const modeleRetrait = () => creerOperation(base, { nom: "Retrait", type: "sortie", code: "#144*8*8*{numero}*{montant}*{pin}#", budgetId }); // Modèle de retrait

  it("n'a plus de PIN de l'application ni besoin du verrouillage, et garde le nom de l'opération en haut", async () => { // Suppression du PIN de l'application
    const id = await modeleRetrait(); // Modèle (aucun verrou activé)
    await afficherLancerOperationUssd(zone, { base, params: { id }, ussd: faux() }); // Écran
    expect(zone.querySelector("h1").textContent).toBe("Retrait"); // Nom en haut
    expect(zone.textContent).not.toContain("verrouillage"); // Aucune exigence de verrou
    expect(document.getElementById("lancer-pin")).toBeNull(); // Pas de PIN de l'application
  }); // Fin du cas

  it("demande les informations une par une, puis récapitule et envoie sans fenêtre de PIN", async () => { // Parcours en étapes
    const id = await modeleRetrait(); // Modèle
    const ussd = faux(); // Faux téléphone
    await afficherLancerOperationUssd(zone, { base, params: { id }, ussd }); // Écran
    expect(zone.querySelector(".sous-titre").textContent).toBe("Étape 1 sur 4 · Numéro de téléphone"); // Première étape
    expect(document.getElementById("lancer-montant")).toBeNull(); // Un seul champ à la fois
    saisir("lancer-numero", "0327573815"); await suivant(); // Numéro
    expect(zone.querySelector(".sous-titre").textContent).toBe("Étape 2 sur 4 · Montant (Ar)"); // Deuxième étape
    expect(document.getElementById("lancer-numero")).toBeNull(); // Le numéro n'est plus affiché
    saisir("lancer-montant", "5000"); await suivant(); // Montant
    expect(document.getElementById("lancer-pin-mm")).not.toBeNull(); // Troisième étape : PIN Mobile Money
    saisir("lancer-pin-mm", "5678"); await suivant(); // PIN
    expect(zone.textContent).toContain("Vérifiez avant d'envoyer"); // Récapitulatif
    expect(zone.textContent).toContain("0327573815"); // Numéro rappelé
    expect(zone.textContent).toContain("••••"); // PIN masqué
    expect(zone.textContent).not.toContain("5678"); // PIN jamais affiché
    expect(zone.querySelector("h1").textContent).toBe("Retrait"); // Nom toujours en haut
    expect(ussd.envoyerCode).not.toHaveBeenCalled(); // Rien envoyé avant la validation
    boutons("Envoyer")[0].click(); // Envoie
    await vi.waitFor(() => expect(ussd.envoyerCode).toHaveBeenCalledWith("#144*8*8*0327573815*5000*5678#")); // Code envoyé avec le PIN Mobile Money saisi
    await vi.waitFor(() => expect(zone.textContent).toContain("Retrait en cours.")); // Réponse montrée
    expect(zone.textContent).toContain("Terminé"); // Parcours terminé
    expect(await listerEnAttente(base)).toMatchObject([{ montant: 5000, statut: "en_attente" }]); // En attente du SMS
  }); // Fin du cas

  it("bloque une étape invalide et permet de revenir en arrière sans perdre les saisies", async () => { // Contrôles par étape
    const id = await modeleRetrait(); // Modèle
    await afficherLancerOperationUssd(zone, { base, params: { id }, ussd: faux() }); // Écran
    saisir("lancer-numero", "12"); await suivant(); // Numéro trop court
    expect(document.getElementById("lancer-numero-message").textContent).toContain("numéro"); // Erreur sous le champ
    saisir("lancer-numero", "0327573815"); await suivant(); // Numéro valide
    saisir("lancer-montant", "99999999"); await suivant(); // Montant au-dessus du solde du budget
    expect(document.getElementById("lancer-montant-message").textContent).toContain("Solde insuffisant"); // Bloqué dès l'étape du montant
    saisir("lancer-montant", "abc"); await suivant(); // Montant illisible
    expect(document.getElementById("lancer-montant-message").textContent).not.toBe(""); // Erreur de format
    boutons("Précédent")[0].click(); // Revient au numéro
    expect(document.getElementById("lancer-numero").value).toBe("0327573815"); // Saisie conservée
  }); // Fin du cas

  it("n'a qu'une étape de vérification quand le code n'a aucune variable", async () => { // Code fixe
    const id = await creerOperation(base, { nom: "Solde", type: "entree", code: "#144*1#", budgetId: null }); // Entrée sans variable
    const ussd = faux(); // Faux téléphone
    await afficherLancerOperationUssd(zone, { base, params: { id }, ussd }); // Écran
    expect(zone.querySelector(".sous-titre").textContent).toBe("Étape 1 sur 1 · Vérification"); // Une seule étape
    boutons("Envoyer")[0].click(); // Envoie
    await vi.waitFor(() => expect(ussd.envoyerCode).toHaveBeenCalledWith("#144*1#")); // Envoyé
  }); // Fin du cas
}); // Fin du groupe
