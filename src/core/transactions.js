// Gestion des transactions (dépenses et alimentations). Les contrôles de solde sont dans allocations.js.

// Génère un identifiant aléatoire avec un préfixe, ex. genererTrxId("MAN") -> "MAN-3F9A1C07B2D4".
export function genererTrxId(prefixe) { // Reçoit le préfixe
  const octets = new Uint8Array(6); // Prépare 6 octets aléatoires
  globalThis.crypto.getRandomValues(octets); // Les remplit avec le générateur aléatoire sûr du système
  const hex = Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join(""); // Convertit chaque octet en 2 caractères hexadécimaux
  return `${prefixe}-${hex.toUpperCase()}`; // Préfixe pour distinguer l'origine de l'ID
} // Fin de genererTrxId

// Génère un identifiant pour une saisie manuelle, ex. "MAN-3F9A1C07B2D4".
export function genererTrxIdManuel() { // Aucun paramètre
  return genererTrxId("MAN"); // Préfixe MAN- pour les distinguer des ID venant des SMS
} // Fin de genererTrxIdManuel

// Crée une transaction (sans contrôle de solde). Sans trxId (saisie manuelle), un identifiant est généré.
export async function creerTransaction(base, { trxId, allocationId = null, insertType = "manuel", debitCredit, montant, sms = null, dateOperation = new Date().toISOString(), note = null, nature = "normale" }) { // Reçoit la base et les champs
  const identifiant = trxId ?? genererTrxIdManuel(); // Utilise l'ID du SMS, sinon en fabrique un
  const { dernierId } = await base.executer( // Insère la transaction
    "INSERT INTO transactions (trx_id, allocation_id, insert_type, debit_credit, montant, sms, date_operation, note, nature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", // Requête d'insertion
    [identifiant, allocationId, insertType, debitCredit, montant, sms, dateOperation, note, nature], // Valeurs dans l'ordre des colonnes
  ); // Fin de l'insertion
  return dernierId; // Renvoie l'identifiant créé
} // Fin de creerTransaction

// Liste les transactions, de la plus récente à la plus ancienne.
// Filtres facultatifs : budgetId, sens (-1 sorties, 1 entrées), nature ("normale" ou "mouvements" = reports et transferts).
export async function listerTransactions(base, { budgetId = null, sens = null, nature = null, limite = 200 } = {}) { // Filtres et nombre maximal de lignes
  const conditions = []; // Conditions SQL à combiner
  const parametres = []; // Valeurs associées
  if (budgetId !== null) { conditions.push("b.id = ?"); parametres.push(budgetId); } // Filtre par budget
  if (sens !== null) { conditions.push("t.debit_credit = ?"); parametres.push(sens); } // Filtre par sens
  if (nature === "normale") conditions.push("t.nature = 'normale'"); // Seulement les saisies de l'utilisateur
  if (nature === "mouvements") conditions.push("t.nature <> 'normale'"); // Seulement les reports et transferts
  const lignes = await base.requeter( // Lit les transactions avec le nom du budget
    `SELECT t.id, t.trx_id, t.insert_type, t.debit_credit, t.montant, t.note, t.sms, t.date_operation, t.nature, t.allocation_id, b.id AS budget_id, b.name AS budget_name
     FROM transactions t LEFT JOIN allocation_budget a ON a.id = t.allocation_id LEFT JOIN budget b ON b.id = a.budget_id
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY t.date_operation DESC, t.id DESC LIMIT ?`, // Plus récent d'abord, nombre limité
    [...parametres, limite], // Valeurs des filtres puis limite
  ); // Fin de la lecture
  return lignes.map((l) => ({ // Convertit chaque ligne en objet
    id: Number(l.id), trxId: l.trx_id, insertType: l.insert_type, debitCredit: Number(l.debit_credit), // Identité et sens
    montant: Number(l.montant), note: l.note, sms: l.sms, dateOperation: l.date_operation, nature: l.nature, // Montant, note, SMS, date, nature
    allocationId: l.allocation_id === null ? null : Number(l.allocation_id), // Allocation (null = non classée)
    budgetId: l.budget_id === null ? null : Number(l.budget_id), budgetName: l.budget_name ?? null, // Budget (null = non classée)
  })); // Fin de la conversion
} // Fin de listerTransactions
