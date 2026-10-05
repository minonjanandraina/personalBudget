import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas
import { lireDernierSolde, creerSolde, listerSoldes, supprimerSolde, validerSolde } from "./soldes.js"; // Fonctions à tester
import { lireJourJob, modifierJourJob } from "./parametres.js"; // Paramètres
import { ErreurValidation } from "./erreurs.js"; // Erreur de saisie

let base; // Base utilisée par les cas de test
const MAINTENANT = new Date("2026-10-05T12:00:00.000Z"); // Heure fixée pour des tests reproductibles
beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
}); // Fin de la préparation

describe("lireDernierSolde", () => { // Dernier solde
  it("renvoie null s'il n'y a aucun solde", async () => { // Base vide
    expect(await lireDernierSolde(base)).toBeNull(); // Aucun solde
  }); // Fin du cas

  it("renvoie le solde le plus récent (par date, pas par ordre de saisie)", async () => { // Tri par date
    await base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-05T08:00:00.000Z', 300000)"); // Solde récent saisi en premier
    await base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-01T08:00:00.000Z', 100000)"); // Solde ancien saisi après
    expect(await lireDernierSolde(base)).toEqual({ balance: 300000, datetime: "2026-10-05T08:00:00.000Z" }); // Le plus récent gagne
  }); // Fin du cas
}); // Fin du groupe

describe("validerSolde", () => { // Validation pure
  it("accepte un solde valide", () => { // Cas valide
    expect(validerSolde({ datetime: "2026-10-05T08:00:00.000Z", balance: 250000 }, MAINTENANT)).toEqual({}); // Aucune erreur
  }); // Fin du cas

  it("accepte zéro", () => { // Cas limite
    expect(validerSolde({ datetime: "2026-10-05T08:00:00.000Z", balance: 0 }, MAINTENANT)).toEqual({}); // Zéro valide
  }); // Fin du cas

  it("refuse un solde négatif, à virgule ou non numérique", () => { // Montants invalides
    for (const balance of [-1, 10.5, NaN, "100", null]) { // Valeurs invalides
      expect(validerSolde({ datetime: "2026-10-05T08:00:00.000Z", balance }, MAINTENANT).balance, String(balance)).toBeDefined(); // Chacune est refusée
    } // Fin de la boucle
  }); // Fin du cas

  it("refuse une date invalide ou absente", () => { // Dates invalides
    expect(validerSolde({ datetime: "n'importe quoi", balance: 1 }, MAINTENANT).datetime).toBeDefined(); // Texte non date
    expect(validerSolde({ datetime: "", balance: 1 }, MAINTENANT).datetime).toBeDefined(); // Vide
  }); // Fin du cas

  it("refuse une date dans le futur mais tolère 5 minutes d'avance", () => { // Futur
    expect(validerSolde({ datetime: "2026-10-05T12:03:00.000Z", balance: 1 }, MAINTENANT)).toEqual({}); // +3 min : accepté
    expect(validerSolde({ datetime: "2026-10-05T12:10:00.000Z", balance: 1 }, MAINTENANT).datetime).toMatch(/futur/); // +10 min : refusé
  }); // Fin du cas
}); // Fin du groupe

describe("soldes (base)", () => { // Création, historique, suppression
  it("enregistre un solde et le renvoie en premier dans l'historique", async () => { // Création
    await creerSolde(base, { datetime: "2026-10-01T08:00:00.000Z", balance: 100000 }, MAINTENANT); // Premier solde
    await creerSolde(base, { datetime: "2026-10-04T08:00:00.000Z", balance: 80000 }, MAINTENANT); // Solde plus récent
    const historique = await listerSoldes(base); // Relit
    expect(historique.map((s) => s.balance)).toEqual([80000, 100000]); // Plus récent d'abord
  }); // Fin du cas

  it("refuse un solde invalide sans rien écrire", async () => { // Refus
    await expect(creerSolde(base, { datetime: "2026-10-01T08:00:00.000Z", balance: -5 }, MAINTENANT)).rejects.toThrow(ErreurValidation); // Erreur de saisie
    expect(await listerSoldes(base)).toHaveLength(0); // Rien n'a été écrit
  }); // Fin du cas

  it("limite l'historique au nombre demandé", async () => { // Limite
    for (let i = 1; i <= 5; i++) await creerSolde(base, { datetime: `2026-10-0${i}T08:00:00.000Z`, balance: i * 1000 }, MAINTENANT); // Cinq soldes
    expect(await listerSoldes(base, 3)).toHaveLength(3); // Seulement 3 renvoyés
  }); // Fin du cas

  it("supprime un solde", async () => { // Suppression
    const id = await creerSolde(base, { datetime: "2026-10-01T08:00:00.000Z", balance: 100000 }, MAINTENANT); // Crée
    await supprimerSolde(base, id); // Supprime
    expect(await listerSoldes(base)).toHaveLength(0); // Plus rien
  }); // Fin du cas
}); // Fin du groupe

describe("paramètre du jour de lancement", () => { // Réglage du jour
  it("vaut 20 par défaut et se modifie entre 1 et 28", async () => { // Cas nominal
    expect(await lireJourJob(base)).toBe(20); // Valeur par défaut
    await modifierJourJob(base, 28); // Borne haute
    expect(await lireJourJob(base)).toBe(28); // Acceptée
    await modifierJourJob(base, 1); // Borne basse
    expect(await lireJourJob(base)).toBe(1); // Acceptée
  }); // Fin du cas

  it("refuse hors bornes, à virgule ou non numérique, et garde l'ancienne valeur", async () => { // Refus
    for (const jour of [0, 29, 10.5, "12", NaN]) { // Valeurs invalides
      await expect(modifierJourJob(base, jour), String(jour)).rejects.toThrow(ErreurValidation); // Chacune est refusée
    } // Fin de la boucle
    expect(await lireJourJob(base)).toBe(20); // Valeur inchangée
  }); // Fin du cas
}); // Fin du groupe
