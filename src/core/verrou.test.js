import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve
import { lireMeta } from "./meta.js"; // Lecture des réglages
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs
import { activerVerrou, verifierPin, changerPin, desactiverVerrou, regenererCodeSecours, reinitialiserAvecCodeSecours, verrouActif, secondesDeBlocage, genererCodeSecours, formaterDuree, CLES_VERROU } from "./verrou.js"; // Fonctions à tester

let base; // Base de chaque cas
let compteur = 0; // Fait varier le « hasard » des tests
const alea = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11 + (compteur += 7)) % 256); // Hasard prévisible (les tests doivent être rejouables)
const T0 = new Date("2026-10-06T10:00:00.000Z"); // Heure fixe
const apres = (secondes) => new Date(T0.getTime() + secondes * 1000); // T0 plus quelques secondes

beforeEach(async () => { base = await creerBaseDeTest(); }); // Base neuve avant chaque cas

describe("activation", () => { // Activer le verrou
  it("enregistre une empreinte (jamais le PIN) et renvoie un code de secours", async () => { // Cas nominal
    expect(await verrouActif(base)).toBe(false); // Au départ : pas de verrou
    const code = await activerVerrou(base, "1234", alea); // Active
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); // Forme du code de secours
    expect(await verrouActif(base)).toBe(true); // Actif
    const [lignes] = [await base.requeter("SELECT cle, valeur FROM meta WHERE cle LIKE 'verrou%'")]; // Tout ce qui est gardé
    const texte = JSON.stringify(lignes); // En texte
    expect(texte).not.toContain("1234"); // Le PIN n'est pas en clair
    expect(texte).not.toContain(code.replaceAll("-", "")); // Le code de secours non plus
  }); // Fin du cas
  it("refuse un PIN mal formé et une seconde activation", async () => { // Contrôles
    for (const pin of ["", "123", "123456789", "12a4", "12 34"]) await expect(activerVerrou(base, pin, alea)).rejects.toThrow(ErreurValidation); // Formats invalides
    await activerVerrou(base, "1234", alea); // Active
    await expect(activerVerrou(base, "5678", alea)).rejects.toThrow(ErreurMetier); // Déjà actif
  }); // Fin du cas
}); // Fin du groupe

describe("vérification du PIN", () => { // Bon et mauvais PIN
  beforeEach(async () => { await activerVerrou(base, "1234", alea); }); // Verrou actif avec 1234

  it("accepte le bon PIN et refuse un mauvais avec le nombre d'essais restants", async () => { // Cas de base
    expect(await verifierPin(base, "1234", T0)).toBe(true); // Bon
    await expect(verifierPin(base, "0000", T0)).rejects.toThrow("Il reste 4 essais"); // 1er échec
    await expect(verifierPin(base, "0000", T0)).rejects.toThrow("Il reste 3 essais"); // 2e échec
  }); // Fin du cas
  it("bloque après 5 échecs de suite, avec une attente qui grandit : 30 s, 1 min, 5 min, puis 30 min", async () => { // Barème
    for (let i = 0; i < 4; i += 1) await expect(verifierPin(base, "0000", T0)).rejects.toThrow("PIN incorrect"); // 4 échecs libres
    await expect(verifierPin(base, "0000", T0)).rejects.toThrow("Réessayez dans 30 secondes"); // 5e : 30 s
    await expect(verifierPin(base, "1234", apres(10))).rejects.toThrow("Trop d'essais"); // Même le bon PIN est refusé pendant le blocage
    expect(await secondesDeBlocage(base, apres(10))).toBe(20); // Temps restant
    await expect(verifierPin(base, "0000", apres(31))).rejects.toThrow("Réessayez dans 1 min"); // 6e : 1 min
    await expect(verifierPin(base, "0000", apres(31 + 61))).rejects.toThrow("Réessayez dans 5 min"); // 7e : 5 min
    await expect(verifierPin(base, "0000", apres(31 + 61 + 301))).rejects.toThrow("Réessayez dans 30 min"); // 8e : 30 min
    await expect(verifierPin(base, "0000", apres(31 + 61 + 301 + 1801))).rejects.toThrow("Réessayez dans 30 min"); // Plafond : 30 min
  }); // Fin du cas
  it("remet les échecs à zéro après un bon PIN", async () => { // Réussite
    for (let i = 0; i < 3; i += 1) await expect(verifierPin(base, "0000", T0)).rejects.toThrow(); // 3 échecs
    await verifierPin(base, "1234", T0); // Bon PIN
    await expect(verifierPin(base, "0000", T0)).rejects.toThrow("Il reste 4 essais"); // Le compteur est reparti
  }); // Fin du cas
  it("ne bloque jamais les données : le bon PIN marche une fois le blocage passé", async () => { // Pas d'effacement
    for (let i = 0; i < 5; i += 1) await verifierPin(base, "0000", T0).catch(() => {}); // Provoque un blocage
    expect(await verifierPin(base, "1234", apres(31))).toBe(true); // Après 31 s : ouvert
  }); // Fin du cas
}); // Fin du groupe

describe("changer, désactiver", () => { // Gestion du PIN
  beforeEach(async () => { await activerVerrou(base, "1234", alea); }); // Verrou actif avec 1234

  it("change le PIN seulement avec l'ancien", async () => { // Changement
    await expect(changerPin(base, "9999", "5678", alea, T0)).rejects.toThrow(ErreurMetier); // Mauvais ancien PIN
    await changerPin(base, "1234", "5678", alea, T0); // Bon ancien PIN
    expect(await verifierPin(base, "5678", T0)).toBe(true); // Nouveau PIN
    await expect(verifierPin(base, "1234", T0)).rejects.toThrow(); // Ancien refusé
  }); // Fin du cas
  it("désactive le verrou avec le bon PIN et efface toute trace", async () => { // Désactivation
    await expect(desactiverVerrou(base, "0000", T0)).rejects.toThrow(); // Mauvais PIN
    await desactiverVerrou(base, "1234", T0); // Bon PIN
    expect(await verrouActif(base)).toBe(false); // Plus de verrou
    for (const cle of CLES_VERROU) expect(await lireMeta(base, cle)).toBeNull(); // Aucune clé restante
  }); // Fin du cas
}); // Fin du groupe

describe("code de secours", () => { // PIN oublié
  let code; // Code de secours en clair
  beforeEach(async () => { code = await activerVerrou(base, "1234", alea); }); // Verrou actif

  it("redéfinit le PIN sans perte, accepte le code en minuscules et sans tirets, et le périme aussitôt", async () => { // Réinitialisation
    const nouveau = await reinitialiserAvecCodeSecours(base, code.toLowerCase().replaceAll("-", " "), "5678", alea, T0); // Code mal saisi mais reconnu
    expect(await verifierPin(base, "5678", T0)).toBe(true); // Nouveau PIN actif
    expect(nouveau).not.toBe(code); // Nouveau code de secours
    await expect(reinitialiserAvecCodeSecours(base, code, "1111", alea, T0)).rejects.toThrow("Code de secours incorrect"); // L'ancien code est périmé
  }); // Fin du cas
  it("refuse un mauvais code et compte les échecs comme pour le PIN", async () => { // Protection
    for (let i = 0; i < 5; i += 1) await reinitialiserAvecCodeSecours(base, "AAAA-AAAA-AAAA", "5678", alea, T0).catch(() => {}); // 5 mauvais codes
    await expect(reinitialiserAvecCodeSecours(base, code, "5678", alea, T0)).rejects.toThrow("Trop d'essais"); // Bloqué même avec le bon code
    await expect(verifierPin(base, "1234", apres(1))).rejects.toThrow("Trop d'essais"); // Le PIN reste lui aussi bloqué (compteur commun)
  }); // Fin du cas
  it("refuse un nouveau PIN mal formé sans rien changer", async () => { // Format
    await expect(reinitialiserAvecCodeSecours(base, code, "12", alea, T0)).rejects.toThrow(ErreurValidation); // PIN trop court
    expect(await verifierPin(base, "1234", T0)).toBe(true); // L'ancien PIN marche encore
  }); // Fin du cas
  it("génère un nouveau code (l'ancien ne marche plus) seulement avec le PIN", async () => { // Régénération
    await expect(regenererCodeSecours(base, "0000", alea, T0)).rejects.toThrow(); // Mauvais PIN
    const autre = await regenererCodeSecours(base, "1234", alea, T0); // Bon PIN
    expect(autre).not.toBe(code); // Nouveau code
    await expect(reinitialiserAvecCodeSecours(base, code, "5678", alea, T0)).rejects.toThrow(); // Ancien code refusé
    await reinitialiserAvecCodeSecours(base, autre, "5678", alea, T0); // Nouveau code accepté
  }); // Fin du cas
}); // Fin du groupe

describe("outils", () => { // Petites fonctions
  it("fabrique des codes de secours différents avec un vrai hasard", () => { // Hasard réel
    expect(genererCodeSecours()).not.toBe(genererCodeSecours()); // Deux codes différents
  }); // Fin du cas
  it("écrit une durée en phrase", () => { // Durées
    expect(formaterDuree(1)).toBe("1 seconde"); // Singulier
    expect(formaterDuree(30)).toBe("30 secondes"); // Pluriel
    expect(formaterDuree(60)).toBe("1 min"); // Minute pleine
    expect(formaterDuree(130)).toBe("2 min 10 s"); // Minutes et secondes
  }); // Fin du cas
}); // Fin du groupe
