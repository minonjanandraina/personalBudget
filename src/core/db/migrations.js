import { MIGRATIONS } from "./schema.js"; // Importe la liste des migrations de l'application

// Retire les commentaires SQL (-- jusqu'à la fin de la ligne) pour envoyer un SQL propre à la base.
export function retirerCommentairesSql(sql) { // Reçoit le texte SQL
  return sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim(); // Supprime les commentaires puis réduit les espaces
} // Fin de retirerCommentairesSql

// Lit la version actuelle de la base (0 si la base est vide).
export async function lireVersion(base) { // Reçoit l'accès à la base
  await base.executer( // Crée la table de suivi si elle n'existe pas encore
    "CREATE TABLE IF NOT EXISTS meta (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)", // Table clé/valeur
  ); // Fin de la création
  const lignes = await base.requeter("SELECT valeur FROM meta WHERE cle = 'version_schema'"); // Cherche la version enregistrée
  return lignes.length === 0 ? 0 : Number(lignes[0].valeur); // Aucune ligne = base vide = version 0
} // Fin de lireVersion

// Applique toutes les migrations pas encore appliquées ; sans danger si on la relance.
export async function appliquerMigrations(base, migrations = MIGRATIONS) { // Liste modifiable pour les tests
  const versionActuelle = await lireVersion(base); // Version de la base avant mise à jour
  const aAppliquer = migrations // Part de la liste complète
    .filter((m) => m.version > versionActuelle) // Garde seulement les migrations plus récentes que la base
    .sort((a, b) => a.version - b.version); // Les trie de la plus ancienne à la plus récente
  for (const migration of aAppliquer) { // Pour chaque migration à appliquer
    await base.transaction(async () => { // Tout ou rien : si une instruction échoue, rien n'est gardé
      for (const instruction of migration.instructions) { // Pour chaque instruction SQL
        await base.executer(retirerCommentairesSql(instruction)); // Retire les commentaires puis l'exécute
      } // Fin des instructions
      await base.executer( // Enregistre la nouvelle version de la base
        "INSERT INTO meta (cle, valeur) VALUES ('version_schema', ?) " + // Insère la version
          "ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur", // Ou la met à jour si elle existe
        [String(migration.version)], // Valeur : numéro de la migration
      ); // Fin de l'enregistrement
    }); // Fin de la transaction
  } // Fin des migrations
  return aAppliquer.length === 0 ? versionActuelle : aAppliquer[aAppliquer.length - 1].version; // Renvoie la version finale
} // Fin de appliquerMigrations
