// Gestion des types de budget (liste : loisir, scolarité...).

// Fabrique le code d'un type à partir de son numéro : 1 -> "bdg-001".
export function formaterCodeType(numero) { // Reçoit le numéro
  return `bdg-${String(numero).padStart(3, "0")}`; // Complète avec des zéros à gauche jusqu'à 3 chiffres
} // Fin de formaterCodeType

// Crée un type de budget ; le code (bdg-001...) est généré et n'est jamais réutilisé.
export async function creerTypeBudget(base, { name }) { // Reçoit la base et le nom
  return base.transaction(async () => { // Tout dans une transaction pour éviter deux codes identiques
    const suivi = await base.requeter( // Lit le dernier numéro utilisé par la base
      "SELECT seq FROM sqlite_sequence WHERE name = 'type_budget'", // Compteur interne de SQLite (jamais remis en arrière)
    ); // Fin de la lecture
    const numero = (suivi.length === 0 ? 0 : Number(suivi[0].seq)) + 1; // Numéro suivant (1 si aucun type n'a jamais existé)
    const { dernierId } = await base.executer( // Insère le nouveau type
      "INSERT INTO type_budget (code, name) VALUES (?, ?)", // Requête d'insertion
      [formaterCodeType(numero), name], // Valeurs : code généré et nom saisi
    ); // Fin de l'insertion
    return dernierId; // Renvoie l'identifiant du type créé
  }); // Fin de la transaction
} // Fin de creerTypeBudget

// Renvoie tous les types de budget, classés par code.
export async function listerTypesBudget(base) { // Reçoit la base
  return base.requeter("SELECT id, code, name, insert_date FROM type_budget ORDER BY code"); // Lit et renvoie les lignes
} // Fin de listerTypesBudget
