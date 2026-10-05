// Petites informations de fonctionnement gardées dans la table « meta » (clé / valeur) : dernière sauvegarde, copie avant restauration.

// Lit une valeur (null si la clé n'existe pas).
export async function lireMeta(base, cle) { // Reçoit la base et la clé
  const lignes = await base.requeter("SELECT valeur FROM meta WHERE cle = ?", [cle]); // Cherche la ligne
  return lignes.length === 0 ? null : lignes[0].valeur; // Renvoie la valeur ou null
} // Fin de lireMeta

// Écrit une valeur (crée ou remplace).
export async function ecrireMeta(base, cle, valeur) { // Reçoit la base, la clé et la valeur
  await base.executer("INSERT INTO meta (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur", [cle, String(valeur)]); // Crée ou met à jour
} // Fin de ecrireMeta

// Supprime une clé.
export async function supprimerMeta(base, cle) { // Reçoit la base et la clé
  await base.executer("DELETE FROM meta WHERE cle = ?", [cle]); // Supprime la ligne
} // Fin de supprimerMeta
