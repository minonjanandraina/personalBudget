import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve
import { lireSimChoisie, ecrireSimChoisie, validerSim, envoyerSurSimChoisie } from "./sim.js"; // Fonctions testées
import { ecrireMeta } from "./meta.js"; // Pour abîmer la valeur

let base; // Base de chaque cas
beforeEach(async () => { base = await creerBaseDeTest(); }); // Base neuve avant chaque cas

describe("choix de la carte SIM", () => { // SIM utilisée pour l'USSD
  it("n'a aucun choix au départ (SIM par défaut)", async () => { expect(await lireSimChoisie(base)).toBeNull(); }); // Départ
  it("enregistre une SIM, la relit, puis revient à la SIM par défaut", async () => { // Cycle
    expect(await ecrireSimChoisie(base, { id: 7, emplacement: 2, nom: "Telma" })).toEqual({ id: 7, emplacement: 2, nom: "Telma" }); // Enregistrée
    expect(await lireSimChoisie(base)).toEqual({ id: 7, emplacement: 2, nom: "Telma" }); // Relue
    await ecrireSimChoisie(base, null); // Retour au défaut
    expect(await lireSimChoisie(base)).toBeNull(); // Plus de choix
  }); // Fin du cas
  it("refuse une SIM invalide et ne change rien", async () => { // Validation
    for (const mauvaise of [null, {}, { id: -1, emplacement: 1 }, { id: 1.5, emplacement: 1 }, { id: 1, emplacement: 0 }, { id: 1, emplacement: 9 }]) expect(() => validerSim(mauvaise)).toThrow(); // Refusées
    await expect(ecrireSimChoisie(base, { id: "x", emplacement: 1 })).rejects.toThrow(); // Refusée à l'enregistrement
    expect(await lireSimChoisie(base)).toBeNull(); // Rien n'a changé
  }); // Fin du cas
  it("traite une valeur abîmée comme l'absence de choix", async () => { // Robustesse
    await ecrireMeta(base, "ussd_sim", "pas du json"); // Valeur abîmée
    expect(await lireSimChoisie(base)).toBeNull(); // Ignorée
  }); // Fin du cas
  it("envoie le code sur la SIM choisie, ou sans SIM précisée s'il n'y a pas de choix", async () => { // Envoi
    const ussd = { envoyerCode: vi.fn(async () => "ok") }; // Faux accès
    await envoyerSurSimChoisie(base, ussd, "#144*1#"); // Sans choix
    expect(ussd.envoyerCode).toHaveBeenLastCalledWith("#144*1#"); // Appel inchangé
    await ecrireSimChoisie(base, { id: 3, emplacement: 1, nom: "Orange" }); // Choix d'une SIM
    await envoyerSurSimChoisie(base, ussd, "#144*1#"); // Avec choix
    expect(ussd.envoyerCode).toHaveBeenLastCalledWith("#144*1#", { id: 3, emplacement: 1, nom: "Orange" }); // SIM transmise
  }); // Fin du cas
}); // Fin du groupe
