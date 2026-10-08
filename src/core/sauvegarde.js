// Sauvegarde et restauration des données : un fichier texte (JSON) lisible, vérifié par une empreinte SHA-256.
// La restauration est « tout ou rien » : en cas de problème, les données actuelles restent intactes.
import { ErreurMetier } from "./erreurs.js"; // Erreur de règle de gestion
import { MIGRATIONS } from "./db/schema.js"; // Liste des migrations (pour recréer la base à la version de la sauvegarde)
import { appliquerMigrations } from "./db/migrations.js"; // Application des migrations
import { sha256Hex } from "./sha256.js"; // Empreinte de vérification
import { lireMeta, ecrireMeta } from "./meta.js"; // Informations de fonctionnement

export const FORMAT = "volako-sauvegarde"; // Nom du format de fichier
export const VERSION_FORMAT = 1; // Version du format de fichier (à augmenter si la structure du fichier change)
const CLE_DERNIERE_SAUVEGARDE = "derniere_sauvegarde"; // Clé : date de la dernière sauvegarde créée
const CLE_COPIE_AVANT = "copie_avant_restauration"; // Clé : copie de sécurité des données d'avant la dernière restauration
const CLE_DATE_COPIE_AVANT = "date_copie_avant_restauration"; // Clé : date de cette copie

// Tables de données, dans l'ordre où on les remplit (une table ne dépend que de celles qui la précèdent).
const TABLES = ["type_budget", "budget", "solde_om", "allocation_budget", "transactions", "parametre_job", "sms_illisible", "operation_ussd", "ussd_en_attente"]; // Ordre d'insertion
const TABLES_AUTOINCREMENT = ["type_budget", "budget", "solde_om", "allocation_budget", "transactions", "sms_illisible", "operation_ussd", "ussd_en_attente"]; // Tables dont la numérotation ne revient jamais en arrière
const TABLE_DEPUIS_VERSION = { sms_illisible: 5, operation_ussd: 6, ussd_en_attente: 6 }; // Version du schéma qui a créé la table (les autres existent depuis la version 1)

// Tables qu'une sauvegarde faite à cette version du schéma doit contenir (une ancienne sauvegarde n'a pas les tables récentes).
function tablesDeLaVersion(versionSchema) { // Reçoit la version du schéma
  return TABLES.filter((t) => (TABLE_DEPUIS_VERSION[t] ?? 1) <= versionSchema); // Garde les tables déjà créées à cette version
} // Fin de tablesDeLaVersion

// Nom du fichier de sauvegarde, à l'heure locale : volako_2026-10-05_14-30-00.json.
export function nomFichierSauvegarde(date = new Date()) { // Reçoit la date
  const d2 = (n) => String(n).padStart(2, "0"); // Complète avec un zéro
  return `volako_${date.getFullYear()}-${d2(date.getMonth() + 1)}-${d2(date.getDate())}_${d2(date.getHours())}-${d2(date.getMinutes())}-${d2(date.getSeconds())}.json`; // Assemble le nom
} // Fin de nomFichierSauvegarde

// Calcule l'empreinte du contenu d'une sauvegarde (version du schéma, tables, numérotations).
function empreinte({ versionSchema, tables, sequences }) { // Reçoit le contenu
  return sha256Hex(JSON.stringify({ versionSchema, tables, sequences })); // Empreinte du contenu sérialisé
} // Fin de empreinte

// Lit la version actuelle du schéma de la base.
async function versionSchemaActuelle(base) { // Reçoit la base
  const lignes = await base.requeter("SELECT valeur FROM meta WHERE cle = 'version_schema'"); // Lit la version enregistrée
  return lignes.length === 0 ? 0 : Number(lignes[0].valeur); // 0 si la base est vide
} // Fin de versionSchemaActuelle

// Crée une sauvegarde (objet) : copie cohérente de toutes les données, prise en une seule transaction.
export async function creerSauvegarde(base, maintenant = new Date()) { // Reçoit la base et l'heure
  return base.transaction(async () => { // Une seule transaction : les données lues sont cohérentes entre elles
    const versionSchema = await versionSchemaActuelle(base); // Version du schéma
    const tables = {}; // Contenu de chaque table
    for (const nom of tablesDeLaVersion(versionSchema)) tables[nom] = await base.requeter(`SELECT * FROM ${nom} ORDER BY id`); // Toutes les lignes, dans l'ordre des identifiants
    const sequences = await base.requeter("SELECT name, seq FROM sqlite_sequence ORDER BY name"); // Compteurs de numérotation (les identifiants et codes ne sont jamais réutilisés)
    const contenu = { versionSchema, tables, sequences: sequences.map((s) => ({ name: s.name, seq: Number(s.seq) })) }; // Contenu à protéger
    return { format: FORMAT, versionFormat: VERSION_FORMAT, application: "Volako", date: maintenant.toISOString(), ...contenu, controle: empreinte(contenu) }; // Sauvegarde complète avec son empreinte
  }); // Fin de la transaction
} // Fin de creerSauvegarde

// Crée la sauvegarde et la renvoie sous forme de texte prêt à être enregistré dans un fichier.
export async function creerTexteSauvegarde(base, maintenant = new Date()) { // Reçoit la base et l'heure
  return JSON.stringify(await creerSauvegarde(base, maintenant), null, 1); // Texte lisible (une ligne par valeur)
} // Fin de creerTexteSauvegarde

// Vérifie le contenu d'un fichier de sauvegarde. Renvoie { sauvegarde, resume } ou lance une erreur expliquée en français.
export async function verifierSauvegarde(texte) { // Reçoit le texte du fichier
  let s; // Sauvegarde lue
  try { s = JSON.parse(texte); } catch { throw new ErreurMetier("Ce fichier n'est pas une sauvegarde Volako : il est illisible ou incomplet."); } // Texte invalide
  if (!s || typeof s !== "object" || s.format !== FORMAT) throw new ErreurMetier("Ce fichier n'est pas une sauvegarde Volako."); // Mauvais format
  if (!Number.isInteger(s.versionFormat) || s.versionFormat > VERSION_FORMAT) throw new ErreurMetier("Cette sauvegarde a été créée par une version plus récente de Volako. Mettez l'application à jour avant de la restaurer."); // Format trop récent
  const versionMax = MIGRATIONS[MIGRATIONS.length - 1].version; // Version du schéma de cette application
  if (!Number.isInteger(s.versionSchema) || s.versionSchema < 1) throw new ErreurMetier("Cette sauvegarde est invalide (version de la base manquante)."); // Version absente
  if (s.versionSchema > versionMax) throw new ErreurMetier("Cette sauvegarde vient d'une version plus récente de Volako. Mettez l'application à jour avant de la restaurer."); // Application trop ancienne
  const attendues = tablesDeLaVersion(s.versionSchema); // Tables que ce fichier doit contenir
  if (!s.tables || typeof s.tables !== "object" || attendues.some((t) => !Array.isArray(s.tables[t]))) throw new ErreurMetier("Cette sauvegarde est incomplète : il manque des données."); // Tables manquantes
  if (!Array.isArray(s.sequences) || s.sequences.some((q) => typeof q?.name !== "string" || !Number.isInteger(q.seq))) throw new ErreurMetier("Cette sauvegarde est invalide (numérotation illisible)."); // Compteurs invalides
  if (typeof s.controle !== "string" || s.controle !== empreinte(s)) throw new ErreurMetier("Ce fichier est abîmé ou a été modifié : l'empreinte de vérification ne correspond pas. Il ne peut pas être restauré."); // Fichier altéré
  if (attendues.some((t) => s.tables[t].some((ligne) => ligne === null || typeof ligne !== "object" || Array.isArray(ligne)))) throw new ErreurMetier("Cette sauvegarde est invalide (lignes illisibles)."); // Lignes invalides
  const nombres = Object.fromEntries(attendues.map((t) => [t, s.tables[t].length])); // Nombre de lignes par table
  return { sauvegarde: s, resume: { date: s.date ?? null, versionSchema: s.versionSchema, nombres } }; // Résultat
} // Fin de verifierSauvegarde

// Efface toutes les tables de l'application (sauf la table système de SQLite).
async function toutEffacer(base) { // Reçoit la base
  for (const nom of [...TABLES].reverse()) await base.executer(`DROP TABLE IF EXISTS ${nom}`); // Supprime d'abord les tables qui dépendent des autres
  await base.executer("DROP TABLE IF EXISTS meta"); // Puis la table de suivi des versions
} // Fin de toutEffacer

// Insère les lignes d'une table en n'acceptant que les colonnes qui existent vraiment (le fichier ne peut pas injecter de SQL).
async function insererLignes(base, table, lignes) { // Reçoit la base, la table et ses lignes
  const colonnes = (await base.requeter(`PRAGMA table_info(${table})`)).map((c) => c.name); // Colonnes réelles de la table
  for (const ligne of lignes) { // Pour chaque ligne
    const noms = Object.keys(ligne); // Colonnes présentes dans le fichier
    const inconnue = noms.find((n) => !colonnes.includes(n)); // Colonne qui n'existe pas
    if (inconnue) throw new ErreurMetier(`Cette sauvegarde contient une colonne inconnue (${table}.${inconnue}) : elle ne peut pas être restaurée.`); // Refuse
    if (noms.length === 0) throw new ErreurMetier(`Cette sauvegarde contient une ligne vide (${table}).`); // Refuse une ligne vide
    const verbe = table === "parametre_job" ? "INSERT OR REPLACE" : "INSERT"; // La ligne unique des paramètres existe déjà : on la remplace
    await base.executer(`${verbe} INTO ${table} (${noms.join(", ")}) VALUES (${noms.map(() => "?").join(", ")})`, noms.map((n) => ligne[n])); // Insère la ligne (les contraintes de la base vérifient chaque valeur)
  } // Fin de la boucle
} // Fin de insererLignes

// Restaure une sauvegarde (texte). Une copie de sécurité des données actuelles est conservée pour pouvoir annuler.
// Tout ou rien : si une étape échoue, rien ne change.
export async function restaurerSauvegarde(base, texte, maintenant = new Date()) { // Reçoit la base, le texte du fichier et l'heure
  const { sauvegarde: s, resume } = await verifierSauvegarde(texte); // Vérifie le fichier (erreur expliquée sinon)
  const avant = await creerTexteSauvegarde(base, maintenant); // Copie de sécurité des données actuelles
  const derniere = await lireMeta(base, CLE_DERNIERE_SAUVEGARDE); // Date de la dernière sauvegarde créée (à conserver)
  const reglagesLocaux = await base.requeter("SELECT cle, valeur FROM meta WHERE cle LIKE 'verrou!_%' ESCAPE '!' OR cle IN ('sms_expediteur', 'ussd_code_solde', 'ussd_gabarit_solde', 'ussd_sim')"); // Réglages propres à ce téléphone (verrouillage par PIN, expéditeur des SMS, code USSD de consultation du solde) : absents de la sauvegarde, à conserver
  try { // Une erreur de la base (valeur refusée par une contrainte...) devient un message clair
    await ecrireDonnees(base, s, avant, derniere, maintenant, reglagesLocaux); // Écrit la sauvegarde (tout ou rien)
  } catch (erreur) { // Si quelque chose a échoué
    if (erreur instanceof ErreurMetier) throw erreur; // Déjà expliqué en français
    throw new ErreurMetier(`Cette sauvegarde contient des données invalides et ne peut pas être restaurée (${erreur.message}). Vos données actuelles n'ont pas été modifiées.`); // Message clair ; la transaction a tout annulé
  } // Fin du try/catch
  return resume; // Renvoie le résumé de ce qui a été restauré
} // Fin de restaurerSauvegarde

// Écrit une sauvegarde vérifiée dans la base, en une seule transaction (annulée entièrement en cas d'échec).
async function ecrireDonnees(base, s, avant, derniere, maintenant, reglagesLocaux = []) { // Reçoit la base, la sauvegarde, la copie de sécurité, la date de dernière sauvegarde et l'heure
  await base.transaction(async () => { // Tout ou rien
    await toutEffacer(base); // Efface les données actuelles
    await appliquerMigrations(base, MIGRATIONS.filter((m) => m.version <= s.versionSchema)); // Recrée les tables telles qu'elles étaient au moment de la sauvegarde
    for (const table of tablesDeLaVersion(s.versionSchema)) await insererLignes(base, table, s.tables[table]); // Remplit chaque table de la sauvegarde
    for (const q of s.sequences) { // Rétablit la numérotation (jamais de réutilisation d'identifiant ni de code)
      if (!TABLES_AUTOINCREMENT.includes(q.name)) continue; // Seules les tables de l'application sont concernées
      const { changements } = await base.executer("UPDATE sqlite_sequence SET seq = ? WHERE name = ?", [q.seq, q.name]); // Met à jour le compteur
      if (changements === 0) await base.executer("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", [q.name, q.seq]); // Ou le crée
    } // Fin de la numérotation
    await appliquerMigrations(base); // Met la base à jour si la sauvegarde vient d'une ancienne version
    const orphelins = await base.requeter("PRAGMA foreign_key_check"); // Vérifie que tous les liens entre tables sont valides
    if (orphelins.length > 0) throw new ErreurMetier("Cette sauvegarde est incohérente (liens entre données invalides) : elle ne peut pas être restaurée."); // Annule tout
    await ecrireMeta(base, CLE_COPIE_AVANT, avant); // Conserve la copie de sécurité
    await ecrireMeta(base, CLE_DATE_COPIE_AVANT, maintenant.toISOString()); // Et sa date
    if (derniere !== null) await ecrireMeta(base, CLE_DERNIERE_SAUVEGARDE, derniere); // Conserve la date de dernière sauvegarde
    for (const r of reglagesLocaux) await ecrireMeta(base, r.cle, r.valeur); // Conserve le verrouillage et l'expéditeur de CE téléphone
  }); // Fin de la transaction
} // Fin de ecrireDonnees

// Date de la copie de sécurité faite avant la dernière restauration (null s'il n'y en a pas).
export async function dateCopieAvantRestauration(base) { // Reçoit la base
  return lireMeta(base, CLE_DATE_COPIE_AVANT); // Date ISO ou null
} // Fin de dateCopieAvantRestauration

// Annule la dernière restauration en rétablissant la copie de sécurité.
export async function annulerDerniereRestauration(base, maintenant = new Date()) { // Reçoit la base et l'heure
  const copie = await lireMeta(base, CLE_COPIE_AVANT); // Lit la copie de sécurité
  if (copie === null) throw new ErreurMetier("Il n'y a aucune restauration à annuler."); // Rien à annuler
  return restaurerSauvegarde(base, copie, maintenant); // Rétablit la copie (qui devient à son tour la copie de sécurité)
} // Fin de annulerDerniereRestauration

// Enregistre la date de la dernière sauvegarde créée.
export async function enregistrerDerniereSauvegarde(base, maintenant = new Date()) { // Reçoit la base et l'heure
  await ecrireMeta(base, CLE_DERNIERE_SAUVEGARDE, maintenant.toISOString()); // Écrit la date
} // Fin de enregistrerDerniereSauvegarde

// Lit la date de la dernière sauvegarde créée (null si jamais).
export async function lireDerniereSauvegarde(base) { // Reçoit la base
  return lireMeta(base, CLE_DERNIERE_SAUVEGARDE); // Date ISO ou null
} // Fin de lireDerniereSauvegarde

// Nombre de lignes dans chaque table de données (pour montrer ce que contient la base actuelle).
export async function compterDonnees(base) { // Reçoit la base
  const nombres = {}; // Résultat
  const versionSchema = await versionSchemaActuelle(base); // Version du schéma de la base actuelle
  for (const table of tablesDeLaVersion(versionSchema)) nombres[table] = Number((await base.requeter(`SELECT COUNT(*) AS n FROM ${table}`))[0].n); // Compte les lignes de chaque table qui existe
  return nombres; // Renvoie les nombres
} // Fin de compterDonnees
