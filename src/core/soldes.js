// Lecture des soldes du compte Orange Money.

// Renvoie le solde le plus récent { balance, datetime }, ou null si aucun solde n'est enregistré.
export async function lireDernierSolde(base) { // Reçoit la base
  const lignes = await base.requeter( // Lit le dernier solde
    "SELECT balance, datetime FROM solde_om ORDER BY datetime DESC, id DESC LIMIT 1", // Le plus récent d'abord, un seul résultat
  ); // Fin de la lecture
  if (lignes.length === 0) return null; // Aucun solde enregistré
  return { balance: Number(lignes[0].balance), datetime: lignes[0].datetime }; // Renvoie le montant (entier) et la date
} // Fin de lireDernierSolde
