import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve
import { lireDernierSolde, listerSoldes } from "./soldes.js"; // Soldes
import { validerPin, validerCodeSolde, lireCodeSolde, ecrireCodeSolde, reinitialiserCodeSolde, CODE_SOLDE_DEFAUT, enregistrerReponse, consulterEtEnregistrer } from "./ussd-solde.js"; // Fonctions à tester

let base; // Base de chaque cas
const REPONSE = (n) => `Le solde de votre compte est de ${n} AR. Achetez du crédit via OM.`; // Réponse type
const MAINTENANT = new Date("2026-10-06T10:00:00.000Z"); // Heure fixe

// Faux accès USSD : réponse programmable, appels comptés.
const faux = (extra = {}) => ({ // Fabrique un faux
  envoyerCode: vi.fn(async () => REPONSE(150000)), // Réponse du réseau
  ...extra, // Surcharges
}); // Fin du faux

beforeEach(async () => { base = await creerBaseDeTest(); }); // Base neuve avant chaque cas

describe("validerPin", () => { // Format du PIN
  it("accepte 4 à 8 chiffres", () => { expect(() => validerPin("1234")).not.toThrow(); expect(() => validerPin("12345678")).not.toThrow(); }); // Valides
  it("refuse le reste", () => { for (const p of ["", "123", "123456789", "12a4", "12 34", null]) expect(() => validerPin(p)).toThrow(); }); // Invalides
}); // Fin du groupe

describe("code de consultation réglable", () => { // Code USSD choisi par l'utilisateur
  it("vaut le code actuel par défaut", async () => { expect(await lireCodeSolde(base)).toBe("#144*5*3*{pin}*#"); expect(CODE_SOLDE_DEFAUT).toBe("#144*5*3*{pin}*#"); }); // Défaut inchangé
  it("enregistre un autre code, puis revient au défaut", async () => { // Cycle
    expect(await ecrireCodeSolde(base, "  #144*5*3*{pin}#  ")).toBe("#144*5*3*{pin}#"); // Espaces retirés
    expect(await lireCodeSolde(base)).toBe("#144*5*3*{pin}#"); // Relu
    await reinitialiserCodeSolde(base); // Retour au défaut
    expect(await lireCodeSolde(base)).toBe(CODE_SOLDE_DEFAUT); // Défaut
  }); // Fin du cas
  it("refuse un code sans {pin}, mal formé ou avec une autre variable", async () => { // Validation
    expect(() => validerCodeSolde("#144*5*3#")).toThrow(); // Sans PIN
    expect(() => validerCodeSolde("144*5*3*{pin}#")).toThrow(); // Ne commence pas par # ou *
    expect(() => validerCodeSolde("#144*5*3*{pin}")).toThrow(); // Ne finit pas par #
    expect(() => validerCodeSolde("#144*{montant}*{pin}#")).toThrow(); // Autre variable
    await expect(ecrireCodeSolde(base, "abc")).rejects.toThrow(); // Refusé à l'enregistrement
    expect(await lireCodeSolde(base)).toBe(CODE_SOLDE_DEFAUT); // Rien n'a changé
  }); // Fin du cas
}); // Fin du groupe

describe("enregistrerReponse", () => { // Enregistrement d'une réponse
  it("crée un solde à la date de la réponse", async () => { // Cas nominal
    expect(await enregistrerReponse(base, REPONSE(202316), "2026-10-06T09:00:00.000Z")).toEqual({ balance: 202316, enregistre: true }); // Enregistré
    expect(await lireDernierSolde(base)).toEqual({ balance: 202316, datetime: "2026-10-06T09:00:00.000Z" }); // Lu
  }); // Fin du cas
  it("n'enregistre pas deux fois le même solde sans dépense entre-temps, sauf si forcé", async () => { // Évite les doublons
    await enregistrerReponse(base, REPONSE(1000), "2026-10-06T08:00:00.000Z"); // Premier
    expect((await enregistrerReponse(base, REPONSE(1000), "2026-10-06T09:00:00.000Z")).enregistre).toBe(false); // Identique : ignoré
    expect((await enregistrerReponse(base, REPONSE(1000), "2026-10-06T09:00:00.000Z", { forcer: true })).enregistre).toBe(true); // Forcé : enregistré
    expect(await listerSoldes(base)).toHaveLength(2); // Deux lignes
  }); // Fin du cas
  it("refuse une réponse sans solde", async () => { // Réponse inattendue
    await expect(enregistrerReponse(base, "Code PIN incorrect.", "2026-10-06T09:00:00.000Z")).rejects.toThrow("ne contient pas de solde"); // Refusé
  }); // Fin du cas
}); // Fin du groupe

describe("consulterEtEnregistrer", () => { // Consultation immédiate
  it("insère le PIN saisi dans le code par défaut, puis enregistre le solde", async () => { // Cas nominal
    const ussd = faux(); // Faux
    expect(await consulterEtEnregistrer(base, ussd, { pin: "1234", maintenant: MAINTENANT })).toEqual({ balance: 150000, enregistre: true }); // Résultat
    expect(ussd.envoyerCode).toHaveBeenCalledWith("#144*5*3*1234*#"); // Code complet envoyé
    expect((await lireDernierSolde(base)).balance).toBe(150000); // Enregistré
  }); // Fin du cas
  it("utilise le code personnalisé", async () => { // Code réglable
    await ecrireCodeSolde(base, "#144*9*{pin}#"); // Autre code
    const ussd = faux(); // Faux
    await consulterEtEnregistrer(base, ussd, { pin: "4321", maintenant: MAINTENANT }); // Consulte
    expect(ussd.envoyerCode).toHaveBeenCalledWith("#144*9*4321#"); // Code personnalisé envoyé
  }); // Fin du cas
  it("refuse un PIN mal formé sans rien envoyer", async () => { // Validation du PIN
    const ussd = faux(); // Faux
    await expect(consulterEtEnregistrer(base, ussd, { pin: "12", maintenant: MAINTENANT })).rejects.toThrow("de 4 à 8 chiffres"); // Refusé
    expect(ussd.envoyerCode).not.toHaveBeenCalled(); // Rien envoyé
  }); // Fin du cas
  it("explique une réponse qui n'est pas un solde, sans rien enregistrer", async () => { // Réponse d'erreur
    const ussd = faux({ envoyerCode: vi.fn(async () => "PIN incorrect") }); // Réponse d'erreur
    await expect(consulterEtEnregistrer(base, ussd, { pin: "1234", maintenant: MAINTENANT })).rejects.toThrow("Vérifiez votre PIN"); // Erreur expliquée
    expect(await lireDernierSolde(base)).toBeNull(); // Rien d'enregistré
  }); // Fin du cas
  it("ne garde le PIN nulle part dans la base", async () => { // Aucun stockage
    await consulterEtEnregistrer(base, faux(), { pin: "7391", maintenant: MAINTENANT }); // Consulte
    const meta = JSON.stringify(await base.requeter("SELECT cle, valeur FROM meta")); // Contenu de la table meta
    expect(meta).not.toContain("7391"); // Le PIN n'y est pas
  }); // Fin du cas
}); // Fin du groupe
