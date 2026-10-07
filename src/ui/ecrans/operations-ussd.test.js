// @vitest-environment jsdom
// Tests d'intégration des écrans d'opérations USSD (faux téléphone, vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, creerBudgetDeTest, ajouterSoldeOMDeTest } from "../../core/db/aide-tests.js"; // Base neuve, budget et solde OM
import { allouerBudget } from "../../core/allocations.js"; // Allocation
import { activerVerrou } from "../../core/verrou.js"; // Verrouillage par PIN
import { creerOperation, listerOperations } from "../../core/operations-ussd.js"; // Modèles
import { listerEnAttente } from "../../core/ussd-en-attente.js"; // Envois en attente
import { afficherOperationsUssd, afficherFormulaireOperationUssd, afficherLancerOperationUssd } from "./operations-ussd.js"; // Écrans à tester

let base; // Base de chaque cas
let zone; // Zone d'écran
let budgetId; // Budget débité

const faux = () => ({ // Faux téléphone
  demanderPermission: vi.fn(async () => true), // Permission accordée
  envoyerCode: vi.fn(async () => "Retrait en cours."), // Réponse d'Orange Money
}); // Fin du faux

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  await ajouterSoldeOMDeTest(base); // Solde OM énorme
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
  it("liste les modèles avec leur code, PIN masqué", async () => { // Liste
    await creerOperation(base, { nom: "Retrait", type: "sortie", code: "#144*8*8*{numero}*{montant}*{pin}#", budgetId }); // Modèle
    await afficherOperationsUssd(zone, { base }); // Écran
    expect(zone.textContent).toContain("Retrait"); // Nom
    expect(zone.textContent).toContain("{numero}*{montant}*••••#"); // PIN masqué
    expect(zone.textContent).not.toContain("{pin}"); // Jamais affiché
  }); // Fin du cas

  it("demande d'abord d'activer le verrouillage par PIN", async () => { // Autorisation
    const id = await creerOperation(base, { nom: "Retrait", type: "sortie", code: "#144*8*8*{numero}*{montant}*{pin}#", budgetId }); // Modèle
    await afficherLancerOperationUssd(zone, { base, params: { id }, ussd: faux() }); // Écran
    expect(zone.textContent).toContain("Activez d'abord le verrouillage par PIN"); // Message
    expect(document.getElementById("lancer-pin")).toBeNull(); // Pas de formulaire
  }); // Fin du cas

  it("envoie après confirmation et le bon PIN de l'application, et note l'attente du SMS", async () => { // Cas nominal
    await activerVerrou(base, "1234"); // Verrou actif
    const id = await creerOperation(base, { nom: "Retrait", type: "sortie", code: "#144*8*8*{numero}*{montant}*{pin}#", budgetId }); // Modèle
    const ussd = faux(); // Faux téléphone
    await afficherLancerOperationUssd(zone, { base, params: { id }, ussd }); // Écran
    saisir("lancer-numero", "0327573815"); // Numéro
    saisir("lancer-montant", "5000"); // Montant
    saisir("lancer-pin-om", "5678"); // PIN Orange Money (demandé à chaque envoi)
    saisir("lancer-pin", "1234"); // PIN de l'application
    boutons("Envoyer")[0].click(); // Demande l'envoi
    await vi.waitFor(() => expect(document.body.textContent).toContain("Envoyer cette opération ?")); // Fenêtre de confirmation
    expect(document.body.textContent).toContain("••••"); // Le PIN OM n'est pas affiché
    boutons("Envoyer").at(-1).click(); // Confirme dans la fenêtre
    await vi.waitFor(() => expect(ussd.envoyerCode).toHaveBeenCalledWith("#144*8*8*0327573815*5000*5678#")); // Code envoyé avec le PIN OM saisi
    await vi.waitFor(() => expect(zone.textContent).toContain("Retrait en cours.")); // Réponse montrée
    expect(await listerEnAttente(base)).toMatchObject([{ montant: 5000, statut: "en_attente" }]); // En attente du SMS
  }); // Fin du cas

  it("n'envoie rien avec un mauvais PIN de l'application", async () => { // Mauvais PIN
    await activerVerrou(base, "1234"); // Verrou actif
    const id = await creerOperation(base, { nom: "Retrait", type: "sortie", code: "#144*8*8*{numero}*{montant}*{pin}#", budgetId }); // Modèle
    const ussd = faux(); // Faux téléphone
    await afficherLancerOperationUssd(zone, { base, params: { id }, ussd }); // Écran
    saisir("lancer-numero", "0327573815"); // Numéro
    saisir("lancer-montant", "5000"); // Montant
    saisir("lancer-pin-om", "5678"); // PIN Orange Money
    saisir("lancer-pin", "0000"); // Mauvais PIN
    boutons("Envoyer")[0].click(); // Demande l'envoi
    await vi.waitFor(() => expect(document.body.textContent).toContain("Envoyer cette opération ?")); // Confirmation
    boutons("Envoyer").at(-1).click(); // Confirme
    await vi.waitFor(() => expect(zone.textContent).toContain("PIN incorrect")); // Refusé sous le champ
    expect(ussd.envoyerCode).not.toHaveBeenCalled(); // Rien envoyé
  }); // Fin du cas
}); // Fin du groupe
