import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas
import { lireDernierSolde } from "./soldes.js"; // Fonction à tester

let base; // Base utilisée par les cas de test
beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
}); // Fin de la préparation

describe("lireDernierSolde", () => { // Groupe de tests
  it("renvoie null s'il n'y a aucun solde", async () => { // Base vide
    expect(await lireDernierSolde(base)).toBeNull(); // Aucun solde
  }); // Fin du cas

  it("renvoie le solde le plus récent (par date, pas par ordre de saisie)", async () => { // Tri par date
    await base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-05T08:00:00.000Z', 300000)"); // Solde récent saisi en premier
    await base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-01T08:00:00.000Z', 100000)"); // Solde ancien saisi après
    expect(await lireDernierSolde(base)).toEqual({ balance: 300000, datetime: "2026-10-05T08:00:00.000Z" }); // Le plus récent gagne
  }); // Fin du cas
}); // Fin du groupe
