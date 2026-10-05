import { describe, it, expect } from "vitest"; // Outils de test : groupe, cas, vérification
import { ouvrirBaseSqlJs } from "../../platform/base-sqljs.js"; // Base en mémoire pour les tests
import { appliquerMigrations, lireVersion, retirerCommentairesSql } from "./migrations.js"; // Fonctions à tester
import { MIGRATIONS } from "./schema.js"; // Liste réelle des migrations

describe("migrations", () => { // Groupe de tests des migrations
  it("part de la version 0 sur une base vide", async () => { // Cas : base neuve
    const base = await ouvrirBaseSqlJs(); // Base vide
    expect(await lireVersion(base)).toBe(0); // Aucune migration appliquée
  }); // Fin du cas

  it("crée toutes les tables et passe à la dernière version", async () => { // Cas : première mise en place
    const base = await ouvrirBaseSqlJs(); // Base vide
    const version = await appliquerMigrations(base); // Applique tout
    expect(version).toBe(MIGRATIONS[MIGRATIONS.length - 1].version); // La version est celle de la dernière migration
    const tables = (await base.requeter("SELECT name FROM sqlite_master WHERE type = 'table'")).map((t) => t.name); // Liste les tables créées
    for (const attendue of ["solde_om", "type_budget", "budget", "allocation_budget", "transactions", "parametre_job", "meta"]) { // Pour chaque table attendue
      expect(tables).toContain(attendue); // Elle doit exister
    } // Fin de la boucle
  }); // Fin du cas

  it("est sans danger si on la relance (idempotente)", async () => { // Cas : relance
    const base = await ouvrirBaseSqlJs(); // Base vide
    const premiere = await appliquerMigrations(base); // Premier passage
    const seconde = await appliquerMigrations(base); // Second passage
    expect(seconde).toBe(premiere); // Même version, aucune erreur « table existe déjà »
  }); // Fin du cas

  it("applique seulement les nouvelles migrations et garde les données", async () => { // Cas : évolution du schéma
    const base = await ouvrirBaseSqlJs(); // Base vide
    await appliquerMigrations(base); // Version actuelle
    await base.executer("INSERT INTO type_budget (code, name) VALUES ('bdg-001', 'Loisir')"); // Ajoute une donnée
    const suivantes = [...MIGRATIONS, { version: 99, instructions: ["ALTER TABLE type_budget ADD COLUMN note TEXT"] }]; // Simule une future migration
    expect(await appliquerMigrations(base, suivantes)).toBe(99); // Passe à la version 99
    const lignes = await base.requeter("SELECT name, note FROM type_budget"); // Relit la donnée
    expect(lignes).toEqual([{ name: "Loisir", note: null }]); // La donnée est intacte et la nouvelle colonne existe
  }); // Fin du cas

  it("annule une migration qui échoue sans rien laisser à moitié fait", async () => { // Cas : tout ou rien
    const base = await ouvrirBaseSqlJs(); // Base vide
    await appliquerMigrations(base); // Version actuelle
    const cassee = [...MIGRATIONS, { version: 50, instructions: ["CREATE TABLE test_a (x INTEGER)", "INSTRUCTION INVALIDE"] }]; // Migration dont la 2e instruction échoue
    await expect(appliquerMigrations(base, cassee)).rejects.toThrow(); // L'erreur remonte
    const tables = (await base.requeter("SELECT name FROM sqlite_master WHERE name = 'test_a'")); // Cherche la table créée avant l'échec
    expect(tables).toHaveLength(0); // Elle a été annulée
    expect(await lireVersion(base)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version); // La version n'a pas bougé
  }); // Fin du cas

  it("retire les commentaires SQL", () => { // Cas : nettoyage du SQL
    expect(retirerCommentairesSql("SELECT 1 -- un commentaire\n, 2")).toBe("SELECT 1 , 2"); // Le commentaire disparaît, le reste est gardé
  }); // Fin du cas
}); // Fin du groupe
