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

describe("migration 2 (date de l'opération et note)", () => { // Groupe de tests de la migration 2
  it("conserve les transactions existantes et copie la date d'insertion comme date d'opération", async () => { // Migration de données
    const base = await ouvrirBaseSqlJs(); // Base vide
    await appliquerMigrations(base, [MIGRATIONS[0]]); // Version 1 seulement
    await base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant) VALUES ('ANCIEN', 'manuel', -1, 500)"); // Transaction de l'ancienne version
    const [avant] = await base.requeter("SELECT insert_date FROM transactions"); // Date d'insertion d'origine
    await appliquerMigrations(base); // Passe à la dernière version
    const [ligne] = await base.requeter("SELECT trx_id, montant, date_operation, note, insert_date FROM transactions"); // Relit la transaction
    expect(ligne).toMatchObject({ trx_id: "ANCIEN", montant: 500, note: null }); // Données conservées
    expect(ligne.date_operation).toBe(avant.insert_date); // Date d'opération = date d'insertion
    expect(ligne.insert_date).toBe(avant.insert_date); // Date d'insertion intacte
  }); // Fin du cas

  it("garde la numérotation et les règles de la table", async () => { // Continuité
    const base = await ouvrirBaseSqlJs(); // Base vide
    await appliquerMigrations(base, [MIGRATIONS[0]]); // Version 1
    await base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant) VALUES ('A', 'manuel', -1, 500)"); // Première transaction (id 1)
    await appliquerMigrations(base); // Version 2
    const { dernierId } = await base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant) VALUES ('B', 'manuel', 1, 700)"); // Nouvelle transaction
    expect(dernierId).toBe(2); // La numérotation continue
    await expect(base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant) VALUES ('A', 'manuel', 1, 1)")).rejects.toThrow(); // trx_id toujours unique
    await expect(base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant) VALUES ('C', 'manuel', 2, 1)")).rejects.toThrow(); // debit_credit toujours contrôlé
    await expect(base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant, note) VALUES ('D', 'manuel', 1, 1, ?)", ["x".repeat(201)])).rejects.toThrow(); // Note limitée à 200 caractères
  }); // Fin du cas

  it("garde les liens vers les allocations", async () => { // Clé étrangère
    const base = await ouvrirBaseSqlJs(); // Base vide
    await appliquerMigrations(base); // Dernière version
    await expect(base.executer("INSERT INTO transactions (trx_id, allocation_id, insert_type, debit_credit, montant) VALUES ('Z', 999, 'manuel', 1, 10)")).rejects.toThrow(); // Allocation inexistante refusée
  }); // Fin du cas
}); // Fin du groupe

describe("migration 3 (nature des transactions)", () => { // Groupe de tests de la migration 3
  it("donne la nature « normale » aux transactions existantes et refuse une nature inconnue", async () => { // Migration de données et contrainte
    const base = await ouvrirBaseSqlJs(); // Base vide
    await appliquerMigrations(base, MIGRATIONS.slice(0, 2)); // Versions 1 et 2 seulement
    await base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant) VALUES ('ANCIEN', 'manuel', -1, 500)"); // Transaction de l'ancienne version
    await appliquerMigrations(base); // Passe à la dernière version
    expect((await base.requeter("SELECT nature FROM transactions"))[0].nature).toBe("normale"); // Nature par défaut
    await expect(base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant, nature) VALUES ('X', 'manuel', 1, 1, 'bizarre')")).rejects.toThrow(); // Nature inconnue refusée
    await expect(base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant, nature) VALUES ('Y', 'manuel', 1, 1, 'report')")).resolves.toBeTruthy(); // « report » accepté
  }); // Fin du cas
}); // Fin du groupe

describe("migration 4 (dépense déjà comprise dans le solde)", () => { // Groupe de tests de la migration 4
  it("met 0 par défaut aux transactions existantes et n'accepte que 0 ou 1", async () => { // Migration de données et contrainte
    const base = await ouvrirBaseSqlJs(); // Base vide
    await appliquerMigrations(base, MIGRATIONS.slice(0, 3)); // Versions 1 à 3 seulement
    await base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant) VALUES ('ANCIEN', 'manuel', -1, 500)"); // Transaction de l'ancienne version
    await appliquerMigrations(base); // Passe à la dernière version
    expect((await base.requeter("SELECT comprise_dans_solde FROM transactions"))[0].comprise_dans_solde).toBe(0); // Valeur par défaut
    await expect(base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant, comprise_dans_solde) VALUES ('X', 'manuel', -1, 1, 2)")).rejects.toThrow(); // 2 refusé
    await expect(base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant, comprise_dans_solde) VALUES ('Y', 'manuel', -1, 1, 1)")).resolves.toBeTruthy(); // 1 accepté
  }); // Fin du cas
}); // Fin du groupe
