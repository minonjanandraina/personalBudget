import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve
import { lireDernierSolde, listerSoldes } from "./soldes.js"; // Soldes
import { validerPin, enregistrerReponse, consulterEtEnregistrer, importerReponsesEnAttente, consultationAutomatique } from "./ussd-solde.js"; // Fonctions à tester

let base; // Base de chaque cas
const REPONSE = (n) => `Le solde de votre compte est de ${n} AR. Achetez du crédit via OM.`; // Réponse type
const MAINTENANT = new Date("2026-10-06T10:00:00.000Z"); // Heure fixe

// Faux accès USSD : réponses programmables, appels comptés.
const faux = (extra = {}) => ({ // Fabrique un faux
  etat: vi.fn(async () => ({ pinDefini: true, actif: true, permission: true, code: "#144*5*3*••••*#" })), // État
  consulter: vi.fn(async () => REPONSE(150000)), // Réponse du réseau
  programmerAuto: vi.fn(async () => {}), // Arrêt/activation
  recupererReponses: vi.fn(async () => ({ reponses: [], arret: null })), // Rien reçu en arrière-plan
  ...extra, // Surcharges
}); // Fin du faux

beforeEach(async () => { base = await creerBaseDeTest(); }); // Base neuve avant chaque cas

describe("validerPin", () => { // Format du PIN
  it("accepte 4 à 8 chiffres", () => { expect(() => validerPin("1234")).not.toThrow(); expect(() => validerPin("12345678")).not.toThrow(); }); // Valides
  it("refuse le reste", () => { for (const p of ["", "123", "123456789", "12a4", "12 34", null]) expect(() => validerPin(p)).toThrow(); }); // Invalides
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
  it("consulte puis enregistre le solde", async () => { // Cas nominal
    const ussd = faux(); // Faux
    expect(await consulterEtEnregistrer(base, ussd, { forcer: true, maintenant: MAINTENANT })).toEqual({ balance: 150000, enregistre: true }); // Résultat
    expect((await lireDernierSolde(base)).balance).toBe(150000); // Enregistré
  }); // Fin du cas
  it("arrête la consultation automatique si la réponse n'est pas un solde", async () => { // Sécurité anti-blocage du PIN
    const ussd = faux({ consulter: vi.fn(async () => "PIN incorrect") }); // Réponse d'erreur
    await expect(consulterEtEnregistrer(base, ussd, { maintenant: MAINTENANT })).rejects.toThrow("vérifiez votre PIN"); // Erreur expliquée
    expect(ussd.programmerAuto).toHaveBeenCalledWith(false); // Arrêt demandé
    expect(await lireDernierSolde(base)).toBeNull(); // Rien d'enregistré
  }); // Fin du cas
}); // Fin du groupe

describe("importerReponsesEnAttente", () => { // Réponses de l'arrière-plan
  it("enregistre les réponses reçues, de la plus ancienne à la plus récente, et ignore les illisibles", async () => { // Cas nominal
    const ussd = faux({ recupererReponses: vi.fn(async () => ({ reponses: [ // Trois réponses dans le désordre
      { texte: REPONSE(900), date: Date.parse("2026-10-06T09:00:00.000Z") }, // Récente
      { texte: REPONSE(1000), date: Date.parse("2026-10-06T08:00:00.000Z") }, // Ancienne
      { texte: "bizarre", date: Date.parse("2026-10-06T08:30:00.000Z") }, // Illisible
    ], arret: "Arrêt pour test" })) }); // Fin du faux
    expect(await importerReponsesEnAttente(base, ussd)).toEqual({ importes: 2, arret: "Arrêt pour test" }); // Deux soldes, raison transmise
    expect((await lireDernierSolde(base)).balance).toBe(900); // Le plus récent est le dernier
  }); // Fin du cas
}); // Fin du groupe

describe("consultationAutomatique", () => { // Consultation horaire au premier plan
  it("consulte quand c'est actif et jamais fait", async () => { // Première fois
    const ussd = faux(); // Faux
    const bilan = await consultationAutomatique(base, ussd, MAINTENANT); // Appel
    expect(bilan).toMatchObject({ consulte: true, importes: 1, erreur: null }); // Consulté
    expect(ussd.consulter).toHaveBeenCalledTimes(1); // Un seul envoi
  }); // Fin du cas
  it("ne reconsulte pas avant environ une heure", async () => { // Cadence
    const ussd = faux(); // Faux
    await consultationAutomatique(base, ussd, MAINTENANT); // Première
    await consultationAutomatique(base, ussd, new Date(MAINTENANT.getTime() + 30 * 60 * 1000)); // 30 minutes après
    expect(ussd.consulter).toHaveBeenCalledTimes(1); // Pas de seconde consultation
    await consultationAutomatique(base, ussd, new Date(MAINTENANT.getTime() + 56 * 60 * 1000)); // 56 minutes après
    expect(ussd.consulter).toHaveBeenCalledTimes(2); // Seconde consultation
  }); // Fin du cas
  it("ne consulte pas si la consultation automatique est arrêtée, mais importe l'arrière-plan", async () => { // Inactif
    const ussd = faux({ etat: vi.fn(async () => ({ pinDefini: true, actif: false, permission: true })) }); // Inactif
    const bilan = await consultationAutomatique(base, ussd, MAINTENANT); // Appel
    expect(bilan.consulte).toBe(false); // Pas de consultation
    expect(ussd.recupererReponses).toHaveBeenCalled(); // Mais l'arrière-plan est repris
  }); // Fin du cas
  it("renvoie l'erreur sans la lancer", async () => { // Robustesse
    const ussd = faux({ consulter: vi.fn(async () => "PIN incorrect") }); // Réponse d'erreur
    const bilan = await consultationAutomatique(base, ussd, MAINTENANT); // Appel
    expect(bilan.erreur).toContain("vérifiez votre PIN"); // Message gardé
  }); // Fin du cas
}); // Fin du groupe
