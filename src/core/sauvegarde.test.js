import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas
import { ouvrirBaseSqlJs } from "../platform/base-sqljs.js"; // Base vide (pour fabriquer une ancienne version)
import { appliquerMigrations } from "./db/migrations.js"; // Application des migrations
import { MIGRATIONS } from "./db/schema.js"; // Liste des migrations
import { creerTypeBudget, supprimerTypeBudget, listerTypesBudget } from "./types-budget.js"; // Types
import { creerBudget } from "./budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense } from "./allocations.js"; // Allocation et dépense
import { lancerAllocationPeriode, transfererEntreBudgets } from "./reallocation.js"; // Report et transferts
import { modifierJourJob, lireJourJob } from "./parametres.js"; // Paramètres
import { situationFinanciere } from "./soldes.js"; // Situation financière
import { calculerAlertes } from "./alertes.js"; // Alertes
import { sha256Hex } from "./sha256.js"; // Empreinte
import { ErreurMetier } from "./erreurs.js"; // Erreur de règle de gestion
import { nomFichierSauvegarde, creerSauvegarde, creerTexteSauvegarde, verifierSauvegarde, restaurerSauvegarde, annulerDerniereRestauration, dateCopieAvantRestauration, enregistrerDerniereSauvegarde, lireDerniereSauvegarde, FORMAT } from "./sauvegarde.js"; // Fonctions à tester

const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Date locale (indépendante du fuseau de la machine)
const SEPTEMBRE = local(2026, 9, 25); // Période du 20/09 au 19/10
const OCTOBRE = local(2026, 10, 25); // Période du 20/10 au 19/11

let base; // Base source remplie de données variées

// Remplit une base avec des données de toutes sortes : types (dont un supprimé), budgets, soldes, allocations, dépenses, report, transfert, case « déjà comprise ».
async function remplir(b) { // Reçoit la base à remplir
  await b.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [local(2026, 9, 1).toISOString(), 900000]); // Solde de départ
  const t1 = await creerTypeBudget(b, { name: "Loisir" }); // bdg-001
  const t2 = await creerTypeBudget(b, { name: "Scolarité" }); // bdg-002
  const supprime = await creerTypeBudget(b, { name: "À supprimer" }); // bdg-003
  await supprimerTypeBudget(b, supprime); // Supprimé : la numérotation ne doit jamais revenir en arrière
  const a = await creerBudget(b, { name: "Loisirs", typeId: t1, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 30000, autogenFinMois: true }); // Budget A
  const c = await creerBudget(b, { name: "Écolage", typeId: t2, montantBudget: 50000, montantMax: 300000, montantMin: 0, soldeAlert: 0, autogenFinMois: false }); // Budget B
  await allouerBudget(b, { budgetId: a, montant: 100000, note: "Septembre — essai" }, SEPTEMBRE); // Allocation de septembre
  await enregistrerDepense(b, { budgetId: a, montant: 60000, dateOperation: SEPTEMBRE.toISOString(), note: "Cinéma à Antananarivo" }, SEPTEMBRE); // Dépense
  await lancerAllocationPeriode(b, OCTOBRE); // Report + allocations d'octobre
  await transfererEntreBudgets(b, { sourceId: a, destinationId: c, montant: 5000, note: "Urgence" }, OCTOBRE); // Transfert
  await enregistrerDepense(b, { budgetId: c, montant: 1000, dateOperation: OCTOBRE.toISOString(), compriseDansSolde: true }, OCTOBRE); // Dépense « déjà comprise »
  await modifierJourJob(b, 12); // Jour de lancement modifié
  await enregistrerDerniereSauvegarde(b, local(2026, 10, 20)); // Date de dernière sauvegarde
} // Fin de remplir

// Photographie de toutes les données d'une base (sans la date ni l'empreinte), pour comparer deux bases.
const photo = async (b) => { const s = await creerSauvegarde(b); return JSON.stringify({ tables: s.tables, sequences: s.sequences, versionSchema: s.versionSchema }); }; // Contenu comparable

// Fabrique un texte de sauvegarde modifié, avec une empreinte recalculée (donc « valide » pour la vérification du fichier).
const recalculer = (s) => { const contenu = { versionSchema: s.versionSchema, tables: s.tables, sequences: s.sequences }; return JSON.stringify({ ...s, controle: sha256Hex(JSON.stringify(contenu)) }); }; // Nouvelle empreinte

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base source neuve
  await remplir(base); // Remplie de données
}); // Fin de la préparation

describe("nom et contenu du fichier", () => { // Création de la sauvegarde
  it("nomme le fichier avec la date et l'heure locales", () => { // Nom
    expect(nomFichierSauvegarde(local(2026, 10, 5, 14))).toBe("volako_2026-10-05_14-00-00.json"); // Format daté
    expect(nomFichierSauvegarde(new Date(2026, 0, 3, 4, 5, 6))).toBe("volako_2026-01-03_04-05-06.json"); // Zéros devant
  }); // Fin du cas

  it("contient toutes les données, les numérotations et une empreinte valide", async () => { // Contenu
    const s = await creerSauvegarde(base, OCTOBRE); // Sauvegarde
    expect(s).toMatchObject({ format: FORMAT, versionFormat: 1, application: "Volako", versionSchema: MIGRATIONS[MIGRATIONS.length - 1].version }); // Identité du fichier
    expect(s.tables.type_budget).toHaveLength(2); // Deux types (le troisième a été supprimé)
    expect(s.tables.budget).toHaveLength(2); // Deux budgets
    expect(s.tables.transactions.length).toBeGreaterThan(6); // Allocations, dépenses, reports, transfert
    expect(s.sequences.find((q) => q.name === "type_budget").seq).toBe(3); // Le compteur garde le type supprimé
    expect(s.controle).toMatch(/^[0-9a-f]{64}$/); // Empreinte SHA-256
  }); // Fin du cas

  it("produit un texte JSON lisible qui passe la vérification", async () => { // Texte
    const texte = await creerTexteSauvegarde(base, OCTOBRE); // Texte du fichier
    expect(texte).toContain("Cinéma à Antananarivo"); // Les accents sont conservés tels quels
    const { resume } = await verifierSauvegarde(texte); // Vérification
    expect(resume.nombres).toMatchObject({ type_budget: 2, budget: 2, solde_om: 1, parametre_job: 1 }); // Résumé
    expect(resume.date).toBe(OCTOBRE.toISOString()); // Date de la sauvegarde
  }); // Fin du cas
}); // Fin du groupe

describe("restauration : aller-retour complet", () => { // Cas nominal
  it("reconstitue exactement les mêmes données dans une base vide", async () => { // Base vide
    const texte = await creerTexteSauvegarde(base); // Sauvegarde
    const cible = await creerBaseDeTest(); // Base vide
    await restaurerSauvegarde(cible, texte); // Restaure
    expect(await photo(cible)).toBe(await photo(base)); // Données et numérotations identiques
    expect(await situationFinanciere(cible)).toEqual(await situationFinanciere(base)); // Mêmes soldes
    expect(await calculerAlertes(cible, OCTOBRE)).toEqual(await calculerAlertes(base, OCTOBRE)); // Mêmes alertes
    expect(await lireJourJob(cible)).toBe(12); // Paramètre restauré
  }); // Fin du cas

  it("remplace les données existantes (rien d'ancien ne subsiste)", async () => { // Base non vide
    const texte = await creerTexteSauvegarde(base); // Sauvegarde
    const cible = await creerBaseDeTest(); // Autre base
    await creerTypeBudget(cible, { name: "Autre type" }); // Donnée qui doit disparaître
    await cible.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-01-01T00:00:00.000Z', 1)"); // Autre donnée
    await restaurerSauvegarde(cible, texte); // Restaure
    expect((await listerTypesBudget(cible)).map((t) => t.name)).toEqual(["Loisir", "Scolarité"]); // Seulement les types de la sauvegarde
    expect(await photo(cible)).toBe(await photo(base)); // Données identiques
  }); // Fin du cas

  it("ne réutilise jamais un code ou un identifiant supprimé (numérotation rétablie)", async () => { // Compteurs
    const cible = await creerBaseDeTest(); // Base vide
    await restaurerSauvegarde(cible, await creerTexteSauvegarde(base)); // Restaure
    const id = await creerTypeBudget(cible, { name: "Nouveau" }); // Nouveau type
    expect((await listerTypesBudget(cible)).find((t) => t.id === id).code).toBe("bdg-004"); // bdg-003 (supprimé) n'est pas réutilisé
  }); // Fin du cas

  it("est répétable : restaurer deux fois donne le même résultat", async () => { // Idempotence
    const texte = await creerTexteSauvegarde(base); // Sauvegarde
    const cible = await creerBaseDeTest(); // Base vide
    await restaurerSauvegarde(cible, texte); // Première fois
    const une = await photo(cible); // Photo
    await restaurerSauvegarde(cible, texte); // Seconde fois
    expect(await photo(cible)).toBe(une); // Identique
  }); // Fin du cas

  it("garde les règles de la base après restauration (contraintes, liens, ligne unique)", async () => { // Intégrité
    const cible = await creerBaseDeTest(); // Base vide
    await restaurerSauvegarde(cible, await creerTexteSauvegarde(base)); // Restaure
    await expect(cible.executer("INSERT INTO budget (name, type_id, montant_budget, montant_max) VALUES ('X', 999, 1, 2)")).rejects.toThrow(); // Lien invalide refusé
    await expect(cible.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-01-01T00:00:00.000Z', -5)")).rejects.toThrow(); // Montant négatif refusé
    await expect(cible.executer("DELETE FROM parametre_job")).rejects.toThrow(); // Ligne unique protégée
    expect((await cible.requeter("PRAGMA foreign_keys"))[0].foreign_keys).toBe(1); // Liens contrôlés
  }); // Fin du cas

  it("conserve la date de dernière sauvegarde de la base courante", async () => { // Date conservée
    const texte = await creerTexteSauvegarde(base); // Sauvegarde
    const cible = await creerBaseDeTest(); // Base vide
    await enregistrerDerniereSauvegarde(cible, local(2026, 11, 3)); // Date propre à cette base
    await restaurerSauvegarde(cible, texte); // Restaure
    expect(await lireDerniereSauvegarde(cible)).toBe(local(2026, 11, 3).toISOString()); // Inchangée
  }); // Fin du cas

  it("restaure vite un grand nombre d'opérations", async () => { // Volume
    const grosse = await creerBaseDeTest(); // Base source
    await grosse.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2020-01-01T00:00:00.000Z', 1000000000)"); // Solde
    const t = await creerTypeBudget(grosse, { name: "T" }); // Type
    const b = await creerBudget(grosse, { name: "B", typeId: t, montantBudget: 1, montantMax: 1000000000, montantMin: 0, soldeAlert: 0, autogenFinMois: false }); // Budget
    await allouerBudget(grosse, { budgetId: b, montant: 100000000 }, OCTOBRE); // Allocation
    await grosse.transaction(async () => { for (let i = 0; i < 3000; i++) await grosse.executer("INSERT INTO transactions (trx_id, allocation_id, insert_type, debit_credit, montant) VALUES (?, 1, 'manuel', -1, 10)", [`T${i}`]); }); // 3 000 dépenses
    const cible = await creerBaseDeTest(); // Base vide
    await restaurerSauvegarde(cible, await creerTexteSauvegarde(grosse)); // Restaure
    expect((await cible.requeter("SELECT COUNT(*) AS n FROM transactions"))[0].n).toBe(3001); // 3 000 + 1 allocation
  }); // Fin du cas
}); // Fin du groupe

describe("vérification du fichier : tout fichier douteux est refusé, sans rien modifier", () => { // Fichiers invalides
  // Vérifie qu'une restauration est refusée avec un message précis et que la base n'a pas bougé.
  const refuse = async (texte, motif) => { // Reçoit le texte et le motif attendu
    const avant = await photo(base); // Photo avant
    const erreur = await restaurerSauvegarde(base, texte).catch((e) => e); // Tente la restauration
    expect(erreur).toBeInstanceOf(ErreurMetier); // Erreur expliquée
    expect(erreur.message).toMatch(motif); // Message attendu
    expect(await photo(base)).toBe(avant); // Données intactes
    expect(await dateCopieAvantRestauration(base)).toBeNull(); // Aucune copie de sécurité créée pour rien
  }; // Fin de refuse

  it("refuse un texte qui n'est pas du JSON, un fichier vide ou tronqué", async () => { // Illisible
    await refuse("n'importe quoi", /illisible ou incomplet/); // Pas du JSON
    await refuse("", /illisible ou incomplet/); // Vide
    const texte = await creerTexteSauvegarde(base); // Texte valide
    await refuse(texte.slice(0, texte.length - 200), /illisible ou incomplet/); // Tronqué
  }); // Fin du cas

  it("refuse un JSON qui n'est pas une sauvegarde Volako", async () => { // Mauvais format
    await refuse('{"a":1}', /n'est pas une sauvegarde Volako/); // Autre JSON
    await refuse("[1,2,3]", /n'est pas une sauvegarde Volako/); // Tableau
    await refuse("null", /n'est pas une sauvegarde Volako/); // Null
  }); // Fin du cas

  it("refuse une sauvegarde d'une version plus récente de l'application", async () => { // Trop récent
    const s = await creerSauvegarde(base); // Sauvegarde valide
    await refuse(recalculer({ ...s, versionSchema: 999 }), /version plus récente/); // Schéma trop récent
    await refuse(recalculer({ ...s, versionFormat: 2 }), /version plus récente/); // Format trop récent
  }); // Fin du cas

  it("refuse un fichier modifié à la main (empreinte différente)", async () => { // Falsification
    const s = await creerSauvegarde(base); // Sauvegarde valide
    s.tables.solde_om[0].balance = 999999999; // Modifie un solde sans recalculer l'empreinte
    await refuse(JSON.stringify(s), /abîmé ou a été modifié/); // Refusé
    const t = await creerSauvegarde(base); // Autre copie
    t.controle = "0".repeat(64); // Empreinte fausse
    await refuse(JSON.stringify(t), /abîmé ou a été modifié/); // Refusé
    const u = await creerSauvegarde(base); // Autre copie
    delete u.controle; // Empreinte absente
    await refuse(JSON.stringify(u), /abîmé ou a été modifié/); // Refusé
  }); // Fin du cas

  it("refuse une sauvegarde incomplète (table manquante, numérotation illisible, lignes invalides)", async () => { // Structure
    const s = await creerSauvegarde(base); // Sauvegarde valide
    const sansTable = { ...s, tables: { ...s.tables } }; // Copie
    delete sansTable.tables.budget; // Table manquante
    await refuse(recalculer(sansTable), /incomplète/); // Refusé
    await refuse(recalculer({ ...s, sequences: [{ name: "x" }] }), /numérotation illisible/); // Compteur invalide
    await refuse(recalculer({ ...s, tables: { ...s.tables, solde_om: [5] } }), /lignes illisibles/); // Ligne qui n'est pas un objet
  }); // Fin du cas

  it("refuse une colonne inconnue, y compris une tentative d'injection SQL, sans rien modifier", async () => { // Sécurité
    const s = await creerSauvegarde(base); // Sauvegarde valide
    const piege = JSON.parse(JSON.stringify(s)); // Copie profonde
    piege.tables.solde_om[0]["id) VALUES (1); DROP TABLE budget; --"] = 1; // Nom de colonne piégé
    await refuse(recalculer(piege), /colonne inconnue/); // Refusé
    const autre = JSON.parse(JSON.stringify(s)); // Autre copie
    autre.tables.budget[0].colonne_inexistante = 1; // Colonne qui n'existe pas
    await refuse(recalculer(autre), /colonne inconnue/); // Refusé
    expect((await base.requeter("SELECT COUNT(*) AS n FROM budget"))[0].n).toBe(2); // La table budget existe toujours avec ses lignes
  }); // Fin du cas

  it("refuse des valeurs interdites par les règles de la base et annule tout (rollback)", async () => { // Données invalides
    const s = JSON.parse(JSON.stringify(await creerSauvegarde(base))); // Copie profonde
    s.tables.solde_om[0].balance = -5; // Solde négatif : refusé par la base
    await refuse(recalculer(s), /données invalides.*n'ont pas été modifiées/); // Refusé, avec explication
  }); // Fin du cas

  it("refuse des liens invalides entre tables (budget inexistant) et annule tout", async () => { // Liens
    const s = JSON.parse(JSON.stringify(await creerSauvegarde(base))); // Copie profonde
    s.tables.allocation_budget[0].budget_id = 999; // Allocation d'un budget qui n'existe pas
    await refuse(recalculer(s), /données invalides|incohérente/); // Refusé
  }); // Fin du cas

  it("refuse deux identifiants de transaction identiques", async () => { // Doublons
    const s = JSON.parse(JSON.stringify(await creerSauvegarde(base))); // Copie profonde
    s.tables.transactions[1].trx_id = s.tables.transactions[0].trx_id; // Doublon de trx_id
    await refuse(recalculer(s), /données invalides/); // Refusé
  }); // Fin du cas
}); // Fin du groupe

describe("ancienne sauvegarde (version plus ancienne du schéma)", () => { // Compatibilité
  it("restaure une sauvegarde de la version 1 et met les données à jour (date d'opération, nature, case)", async () => { // Migration à la restauration
    const ancienne = await ouvrirBaseSqlJs(); // Base vide
    await appliquerMigrations(ancienne, [MIGRATIONS[0]]); // Schéma version 1 seulement
    await ancienne.executer("INSERT INTO type_budget (code, name) VALUES ('bdg-001', 'Loisir')"); // Type
    await ancienne.executer("INSERT INTO budget (name, type_id, montant_budget, montant_max) VALUES ('Sorties', 1, 100000, 200000)"); // Budget
    await ancienne.executer("INSERT INTO allocation_budget (budget_id, date_from, date_to, montant_alloue) VALUES (1, '2026-10-20', '2026-11-19', 100000)"); // Allocation
    await ancienne.executer("INSERT INTO transactions (trx_id, allocation_id, insert_type, debit_credit, montant) VALUES ('MAN-1', 1, 'manuel', 1, 100000)"); // Transaction de l'ancienne version
    const s = await creerSauvegarde(ancienne); // Sauvegarde de la version 1
    expect(s.versionSchema).toBe(1); // Bien une ancienne version
    const cible = await creerBaseDeTest(); // Base à jour
    await restaurerSauvegarde(cible, JSON.stringify(s)); // Restaure
    const [t] = await cible.requeter("SELECT date_operation, insert_date, nature, comprise_dans_solde, note FROM transactions"); // Relit
    expect(t.date_operation).toBe(t.insert_date); // Date d'opération = date d'insertion
    expect([t.nature, t.comprise_dans_solde, t.note]).toEqual(["normale", 0, null]); // Valeurs par défaut des nouvelles colonnes
    expect((await cible.requeter("SELECT valeur FROM meta WHERE cle = 'version_schema'"))[0].valeur).toBe(String(MIGRATIONS[MIGRATIONS.length - 1].version)); // Base remise à la dernière version
  }); // Fin du cas
}); // Fin du groupe

describe("annulation de la dernière restauration", () => { // Copie de sécurité
  it("rétablit exactement les données d'avant la restauration", async () => { // Annulation
    const texte = await creerTexteSauvegarde(base); // Sauvegarde de la base source
    const cible = await creerBaseDeTest(); // Autre base avec ses propres données
    await creerTypeBudget(cible, { name: "Mes données actuelles" }); // Donnée à ne pas perdre
    const avant = await photo(cible); // Photo avant restauration
    expect(await dateCopieAvantRestauration(cible)).toBeNull(); // Pas de copie au départ
    await restaurerSauvegarde(cible, texte, OCTOBRE); // Restaure (remplace tout)
    expect(await dateCopieAvantRestauration(cible)).toBe(OCTOBRE.toISOString()); // Copie de sécurité créée
    await annulerDerniereRestauration(cible); // Annule
    expect(await photo(cible)).toBe(avant); // Données d'avant retrouvées
  }); // Fin du cas

  it("refuse d'annuler quand il n'y a rien à annuler", async () => { // Sans copie
    await expect(annulerDerniereRestauration(base)).rejects.toThrow(/aucune restauration à annuler/); // Message
  }); // Fin du cas

  it("une restauration refusée ne crée pas de copie de sécurité et n'écrase pas la précédente", async () => { // Échec
    const texte = await creerTexteSauvegarde(base); // Sauvegarde valide
    const cible = await creerBaseDeTest(); // Autre base
    await restaurerSauvegarde(cible, texte, SEPTEMBRE); // Première restauration réussie
    await restaurerSauvegarde(cible, "pas une sauvegarde", OCTOBRE).catch(() => {}); // Échec
    expect(await dateCopieAvantRestauration(cible)).toBe(SEPTEMBRE.toISOString()); // La copie de la première restauration est conservée
  }); // Fin du cas
}); // Fin du groupe
