// Paramètres du job d'allocation (une seule ligne dans la base).

// Lit le jour du mois où l'allocation automatique se lance.
export async function lireJourJob(base) { // Reçoit la base
  const lignes = await base.requeter("SELECT start_day_int FROM parametre_job WHERE id = 1"); // Lit l'unique ligne
  return Number(lignes[0].start_day_int); // Renvoie le jour sous forme de nombre
} // Fin de lireJourJob

// Change le jour de lancement (de 1 à 28, vérifié par la base).
export async function modifierJourJob(base, jour) { // Reçoit la base et le nouveau jour
  await base.executer("UPDATE parametre_job SET start_day_int = ? WHERE id = 1", [jour]); // Met à jour l'unique ligne
} // Fin de modifierJourJob
