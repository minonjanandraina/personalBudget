// Modèles de SMS fournis à l'installation (formats réels d'Orange Money). Installés par la migration 7, puis modifiables dans l'écran « Modèles de SMS ».
// ATTENTION : cette liste sert aussi à la migration 7 (base de données) : on ne la modifie plus ; un nouveau modèle par défaut = une nouvelle migration.
// Un modèle = un type de SMS. Son gabarit a UNE LIGNE PAR INFORMATION ; les majuscules, les accents et les espaces en trop n'ont pas d'importance.
// Une ligne est OBLIGATOIRE si elle ne contient aucune variable ou si elle contient {montant_debit}, {montant_credit} ou {ref_trx} (débit/crédit) ;
// les autres lignes ({frais}, {solde}, {numero_source}, {numero_destination}, {date_trx}) sont facultatives. Si plusieurs lignes donnent la même variable, la première trouvée est gardée.
// Les modèles sont essayés dans l'ordre (position 1, 2, 3…) : le premier qui correspond gagne. Les « ignorer » passent donc avant les autres.

// Variables utilisables dans un gabarit, avec leur type de lecture.
export const VARIABLES_SMS = { // Nom -> type
  montant_debit: "nombre", // Montant débité (sans les frais)
  montant_credit: "nombre", // Montant reçu
  frais: "nombre", // Frais de l'opération
  solde: "nombre", // Solde du compte après l'opération
  ref_trx: "ref", // Identifiant de la transaction (unique)
  date_trx: "date", // Date écrite dans le SMS (sinon : date de réception)
  numero_source: "texte", // Numéro ou nom de l'expéditeur
  numero_destination: "texte", // Numéro ou nom du destinataire
}; // Fin des variables

// Sens possibles d'un modèle.
export const SENS_SMS = { debit: "Dépense (argent sorti)", credit: "Argent reçu", ignorer: "À ignorer" }; // Code -> libellé

export const MODELES_PAR_DEFAUT = [ // Modèles, dans l'ordre de priorité
  { // 1 : mouvements avec le compte épargne (dans les deux sens, virement programmé compris)
    nom: "Compte épargne (ignoré)", sens: "ignorer", note: null,
    gabarit: ["compte epargne", "Ref : {ref_trx}", "Trans Id : {ref_trx}", "Nouveau solde Orange Money : {solde} Ar"].join("\n"), // « Nouveau solde epargne » n'est pas reconnu comme solde
  }, // Fin du modèle 1
  { // 2 : prêt crédité
    nom: "Prêt crédité (ignoré)", sens: "ignorer", note: null,
    gabarit: ["a ete credit", "TrID : {ref_trx}", "Trans Id : {ref_trx}", "nouveau solde Orange Money est de {solde} Ar", "Nouveau solde Orange Money : {solde} Ar"].join("\n"),
  }, // Fin du modèle 2
  { // 3 : dépôt d'argent
    nom: "Dépôt (ignoré)", sens: "ignorer", note: null,
    gabarit: ["depot de", "Trans Id : {ref_trx}", "Nouveau solde : {solde} Ar", "Nouveau solde Orange Money : {solde} Ar"].join("\n"),
  }, // Fin du modèle 3
  { // 4 : transfert d'argent
    nom: "Transfert", sens: "debit", note: "Transfert vers {numero_destination}",
    gabarit: ["transfert de {montant_debit} Ar", "vers le numero client {numero_destination} est reussi", "vers {numero_destination} est reussi", "Frais : {frais} Ar", "Nouveau solde Orange Money : {solde} Ar", "Trans Id : {ref_trx}"].join("\n"),
  }, // Fin du modèle 4
  { // 5 : retrait chez un agent
    nom: "Retrait", sens: "debit", note: "Retrait auprès du {numero_destination}",
    gabarit: ["retrait de {montant_debit} Ar", "aupres du {numero_destination} est reussi", "Frais : {frais} Ar", "Nouveau solde : {solde} Ar", "Nouveau solde Orange Money : {solde} Ar", "Trans Id : {ref_trx}"].join("\n"),
  }, // Fin du modèle 5
  { // 6 : remboursement de prêt (total ou partiel)
    nom: "Remboursement de prêt", sens: "debit", note: "Remboursement de prêt",
    gabarit: ["debite de {montant_debit} Ar", "rembours", "Nouveau solde Orange Money : {solde} Ar", "Trans Id : {ref_trx}"].join("\n"),
  }, // Fin du modèle 6
  { // 7 : tout autre débit
    nom: "Autre débit", sens: "debit", note: "Opération Mobile Money",
    gabarit: ["debite de {montant_debit} Ar", "Frais : {frais} Ar", "Nouveau solde Orange Money : {solde} Ar", "Nouveau solde : {solde} Ar", "Trans Id : {ref_trx}"].join("\n"),
  }, // Fin du modèle 7
]; // Fin des modèles par défaut
