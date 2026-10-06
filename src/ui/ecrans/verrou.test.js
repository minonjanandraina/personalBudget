// @vitest-environment jsdom
// Tests d'intégration du verrouillage par PIN : fenêtre de déverrouillage et écran de réglage (vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve
import { activerVerrou, verrouActif, verifierPin } from "../../core/verrou.js"; // Logique du verrou
import { creerTexteSauvegarde, restaurerSauvegarde } from "../../core/sauvegarde.js"; // Sauvegarde et restauration
import { demanderDeverrouillage, afficherReglageVerrou } from "./verrou.js"; // Écrans à tester

let base; // Base de chaque cas
let zone; // Zone d'écran des réglages

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
}); // Fin de la préparation

const saisir = (id, valeur) => { document.getElementById(id).value = valeur; }; // Remplit un champ
const toucher = (racine, texte) => { [...racine.querySelectorAll("button")].find((b) => b.textContent.trim() === texte).click(); }; // Touche un bouton

describe("fenêtre de déverrouillage", () => { // Au démarrage et au retour sur l'application
  it("reste affichée avec un mauvais PIN, puis disparaît avec le bon", async () => { // Cas nominal
    await activerVerrou(base, "1234"); // Active le verrou
    let ouvert = false; // Devient vrai au déverrouillage
    const promesse = demanderDeverrouillage(base).then(() => { ouvert = true; }); // Affiche la fenêtre
    await vi.waitFor(() => expect(document.querySelector(".verrou")).not.toBeNull()); // Fenêtre visible
    saisir("verrou-pin", "0000"); // Mauvais PIN
    toucher(document.body, "Déverrouiller"); // Valide
    await vi.waitFor(() => expect(document.body.textContent).toContain("PIN incorrect")); // Message
    expect(ouvert).toBe(false); // Toujours verrouillé
    saisir("verrou-pin", "1234"); // Bon PIN
    toucher(document.body, "Déverrouiller"); // Valide
    await promesse; // Se termine
    expect(ouvert).toBe(true); // Déverrouillé
    expect(document.querySelector(".verrou")).toBeNull(); // Fenêtre retirée
  }); // Fin du cas

  it("PIN oublié : le code de secours redéfinit le PIN et montre un nouveau code", async () => { // Code de secours
    const code = await activerVerrou(base, "1234"); // Active et récupère le code
    const promesse = demanderDeverrouillage(base); // Affiche la fenêtre
    await vi.waitFor(() => expect(document.querySelector(".verrou")).not.toBeNull()); // Visible
    toucher(document.body, "PIN oublié ?"); // Va à l'écran de secours
    await vi.waitFor(() => expect(document.getElementById("verrou-code")).not.toBeNull()); // Écran de secours
    saisir("verrou-code", code); // Code de secours
    saisir("verrou-nouveau", "5678"); // Nouveau PIN
    toucher(document.body, "Redéfinir le PIN"); // Valide
    await vi.waitFor(() => expect(document.body.textContent).toContain("Nouveau code de secours")); // Nouveau code montré
    toucher(document.body, "J'ai noté mon code"); // Confirme
    await promesse; // Déverrouillé
    expect(await verifierPin(base, "5678")).toBe(true); // Nouveau PIN actif
  }); // Fin du cas
}); // Fin du groupe

describe("écran de réglage", () => { // Réglages > Verrouillage par PIN
  it("active le verrou après confirmation du PIN, montre le code de secours, puis permet de désactiver", async () => { // Cycle complet
    await afficherReglageVerrou(zone, { base }); // Écran
    saisir("verrou-new", "1234"); // PIN
    saisir("verrou-conf", "9999"); // Confirmation différente
    toucher(zone, "Activer le verrouillage"); // Valide
    await vi.waitFor(() => expect(zone.textContent).toContain("Les deux PIN sont différents")); // Refusé
    expect(await verrouActif(base)).toBe(false); // Rien activé
    saisir("verrou-conf", "1234"); // Confirmation correcte
    toucher(zone, "Activer le verrouillage"); // Valide
    await vi.waitFor(() => expect(zone.textContent).toContain("code de secours")); // Code montré
    expect(zone.querySelector(".code-secours").textContent).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); // Forme du code
    toucher(zone, "J'ai noté mon code"); // Confirme
    await vi.waitFor(() => expect(zone.textContent).toContain("Verrouillage activé.")); // État actif
    saisir("verrou-pin-off", "0000"); // Mauvais PIN
    toucher(zone, "Désactiver le verrouillage"); // Tente
    await vi.waitFor(() => expect(zone.textContent).toContain("PIN incorrect")); // Refusé
    expect(await verrouActif(base)).toBe(true); // Toujours actif
    saisir("verrou-pin-off", "1234"); // Bon PIN
    toucher(zone, "Désactiver le verrouillage"); // Désactive
    await vi.waitFor(async () => expect(await verrouActif(base)).toBe(false)); // Désactivé
  }); // Fin du cas
}); // Fin du groupe

describe("restauration d'une sauvegarde", () => { // Le verrou est propre au téléphone
  it("conserve le PIN de verrouillage actuel (il n'est pas dans la sauvegarde)", async () => { // Réglages locaux
    const texte = await creerTexteSauvegarde(base); // Sauvegarde faite sans verrou
    await activerVerrou(base, "1234"); // Verrou activé ensuite
    await restaurerSauvegarde(base, texte); // Restaure l'ancienne sauvegarde
    expect(await verrouActif(base)).toBe(true); // Le verrou est toujours là
    expect(await verifierPin(base, "1234")).toBe(true); // Avec le même PIN
  }); // Fin du cas
}); // Fin du groupe
