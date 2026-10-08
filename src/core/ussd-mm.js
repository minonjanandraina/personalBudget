// Analyse de la réponse USSD de consultation du solde Mobile Money, avec un gabarit réglable (src/core/gabarit.js).
// Exemple de réponse vue sur le téléphone : « Le solde de votre compte est de 202316 AR. Achetez du crédit via Mobile Money… ».
// Aucune dépendance Android : testable sous Windows. Renvoie le solde en entier (centimes arrondis à l'inférieur, comme pour les SMS) ou null.
import { compilerGabarit, lireAvecGabarit } from "./gabarit.js"; // Conversion du gabarit et lecture

export const GABARIT_SOLDE_DEFAUT = "solde de votre compte est de {solde} AR"; // Gabarit par défaut (réponse actuelle du réseau)
const REGLES = { variables: ["solde"], obligatoires: ["solde"] }; // {solde} obligatoire, une seule fois

// Vérifie le gabarit de réponse : il doit contenir {solde} une seule fois et du texte autour. Renvoie le gabarit nettoyé ; lance ErreurValidation (champ « gabarit ») sinon.
export function validerGabaritSolde(gabarit) { // Reçoit le texte saisi
  compilerGabarit(gabarit, REGLES); // Lance l'erreur si invalide
  return String(gabarit).trim(); // Gabarit valide
} // Fin de validerGabaritSolde

// Extrait le solde de la réponse USSD. Renvoie un entier (Ar) ou null si la réponse ne correspond pas au gabarit (erreur de PIN, service indisponible…).
export function analyserReponseUssd(texte, gabarit = GABARIT_SOLDE_DEFAUT) { // Reçoit le texte de la réponse et le gabarit
  let regex; // Expression régulière du gabarit
  try { regex = compilerGabarit(gabarit, REGLES); } catch { return null; } // Gabarit invalide : rien n'est lu
  return lireAvecGabarit(texte, regex)?.solde ?? null; // Solde lu, ou null
} // Fin de analyserReponseUssd
