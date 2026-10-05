// Formate un montant entier en texte lisible : 1234567 -> "1 234 567 Ar".
export function formaterMontant(montant) { // Fonction exportée, reçoit un montant
  if (!Number.isInteger(montant)) { // Vérifie que le montant est bien un nombre entier
    throw new Error("Le montant doit être un nombre entier (jamais de virgule)."); // Refuse les décimales
  } // Fin de la vérification
  const signe = montant < 0 ? "-" : ""; // Garde le signe moins pour les montants négatifs
  const chiffres = String(Math.abs(montant)); // Convertit la valeur absolue en texte
  const groupes = chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, " "); // Insère une espace tous les 3 chiffres
  return `${signe}${groupes} Ar`; // Assemble signe, chiffres groupés et unité
} // Fin de la fonction
