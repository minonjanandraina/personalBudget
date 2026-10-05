// Gestion des transactions (dépenses et alimentations). Les contrôles de solde viennent au sprint 5.

// Génère un identifiant pour une saisie manuelle, ex. "MAN-3F9A1C07B2D4".
export function genererTrxIdManuel() { // Aucun paramètre
  const octets = new Uint8Array(6); // Prépare 6 octets aléatoires
  globalThis.crypto.getRandomValues(octets); // Les remplit avec le générateur aléatoire sûr du système
  const hex = Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join(""); // Convertit chaque octet en 2 caractères hexadécimaux
  return `MAN-${hex.toUpperCase()}`; // Préfixe MAN- pour les distinguer des ID venant des SMS
} // Fin de genererTrxIdManuel

// Crée une transaction. Sans trxId (saisie manuelle), un identifiant est généré.
export async function creerTransaction(base, { trxId, allocationId = null, insertType = "manuel", debitCredit, montant, sms = null }) { // Reçoit la base et les champs
  const identifiant = trxId ?? genererTrxIdManuel(); // Utilise l'ID du SMS, sinon en fabrique un
  const { dernierId } = await base.executer( // Insère la transaction
    "INSERT INTO transactions (trx_id, allocation_id, insert_type, debit_credit, montant, sms) VALUES (?, ?, ?, ?, ?, ?)", // Requête d'insertion
    [identifiant, allocationId, insertType, debitCredit, montant, sms], // Valeurs dans l'ordre des colonnes
  ); // Fin de l'insertion
  return dernierId; // Renvoie l'identifiant créé
} // Fin de creerTransaction
