// Analyse de la réponse USSD de consultation du solde Orange Money (code #144*5*3*PIN*).
// Réponse vue sur le téléphone : « Le solde de votre compte est de 202316 AR. Achetez du crédit via OM… ».
// Aucune dépendance Android : testable sous Windows. Renvoie le solde en entier (centimes arrondis à l'inférieur, comme pour les SMS) ou null.

const RE_SOLDE_USSD = /solde\s+de\s+votre\s+compte\s+est\s+de\s+(\d[\d\s]*)(?:[.,](\d+))?\s*Ar\b/i; // « solde de votre compte est de 202316 AR » (espaces entre milliers et centimes acceptés)

// Extrait le solde de la réponse USSD. Renvoie un entier (Ar) ou null si la réponse n'est pas celle d'un solde.
export function analyserReponseUssd(texte) { // Reçoit le texte de la réponse
  const trouve = String(texte ?? "").match(RE_SOLDE_USSD); // Cherche la phrase du solde
  if (!trouve) return null; // Autre réponse (erreur de PIN, service indisponible…)
  const solde = Number(trouve[1].replace(/\s/g, "")); // Partie entière, espaces retirés
  return Number.isSafeInteger(solde) ? solde : null; // Refuse un nombre démesuré
} // Fin de analyserReponseUssd
