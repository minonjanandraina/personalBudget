// Limites d'un code USSD, communes à tous les écrans qui en saisissent un (opérations, consultation du solde).
export const LONGUEUR_MAX_USSD = 182; // Longueur maximale d'une chaîne USSD acceptée par les réseaux (norme GSM)
export const CHIFFRES_NUMERO_MAX = 15; // Plus long numéro de téléphone que l'on peut saisir (pour l'estimation de la longueur)
export const CHIFFRES_MONTANT_MAX = 12; // Plus grand montant raisonnable, en chiffres (pour l'estimation de la longueur)
export const CHIFFRES_PIN_MAX = 8; // Plus long PIN Mobile Money (4 à 8 chiffres)
export const FORME_CODE_USSD = new RegExp(`^[#*][0-9*#]{2,${LONGUEUR_MAX_USSD - 2}}#$`); // Forme d'un code : commence par # ou *, finit par #, que des chiffres, * et #

// Longueur d'un code une fois ses variables remplacées par les valeurs les plus longues possibles.
export function longueurMaxDuCode(code) { // Reçoit le code avec ses variables
  return String(code ?? "").replaceAll("{numero}", "0".repeat(CHIFFRES_NUMERO_MAX)).replaceAll("{montant}", "0".repeat(CHIFFRES_MONTANT_MAX)).replaceAll("{pin}", "0".repeat(CHIFFRES_PIN_MAX)).length; // Compte les caractères
} // Fin de longueurMaxDuCode
