// Soldes du compte Orange Money : lecture, saisie manuelle, historique.
import { ErreurValidation } from "./erreurs.js"; // Erreur de saisie

const TOLERANCE_FUTUR_MS = 5 * 60 * 1000; // On accepte jusqu'à 5 minutes d'avance (décalage d'horloge)

// Renvoie le solde le plus récent { balance, datetime }, ou null si aucun solde n'est enregistré.
export async function lireDernierSolde(base) { // Reçoit la base
  const lignes = await base.requeter( // Lit le dernier solde
    "SELECT balance, datetime FROM solde_om ORDER BY datetime DESC, id DESC LIMIT 1", // Le plus récent d'abord, un seul résultat
  ); // Fin de la lecture
  if (lignes.length === 0) return null; // Aucun solde enregistré
  return { balance: Number(lignes[0].balance), datetime: lignes[0].datetime }; // Renvoie le montant (entier) et la date
} // Fin de lireDernierSolde

// Vérifie une saisie de solde. Renvoie un dictionnaire d'erreurs (vide si tout est correct).
export function validerSolde({ datetime, balance }, maintenant = new Date()) { // « maintenant » modifiable pour les tests
  const erreurs = {}; // Erreurs trouvées, par champ
  if (!Number.isInteger(balance) || balance < 0) erreurs.balance = "Le solde doit être un entier positif ou nul."; // Montant invalide
  const date = new Date(datetime); // Convertit la date saisie
  if (!datetime || Number.isNaN(date.getTime())) erreurs.datetime = "La date et l'heure sont invalides."; // Date illisible
  else if (date.getTime() > maintenant.getTime() + TOLERANCE_FUTUR_MS) erreurs.datetime = "La date ne peut pas être dans le futur."; // Date future
  return erreurs; // Renvoie les erreurs
} // Fin de validerSolde

// Enregistre un solde saisi à la main. « datetime » est un texte ISO UTC.
export async function creerSolde(base, { datetime, balance }, maintenant = new Date()) { // Reçoit la base et la saisie
  const erreurs = validerSolde({ datetime, balance }, maintenant); // Vérifie
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une erreur existe
  const { dernierId } = await base.executer( // Insère le solde
    "INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", // Requête d'insertion
    [new Date(datetime).toISOString(), balance], // Date normalisée en ISO UTC, et montant
  ); // Fin de l'insertion
  return dernierId; // Renvoie l'identifiant créé
} // Fin de creerSolde

// Renvoie l'historique des soldes, du plus récent au plus ancien (100 maximum).
export async function listerSoldes(base, limite = 100) { // Reçoit la base et le nombre maximal de lignes
  const lignes = await base.requeter( // Lit l'historique
    "SELECT id, datetime, balance FROM solde_om ORDER BY datetime DESC, id DESC LIMIT ?", // Plus récent d'abord
    [limite], // Nombre maximal de lignes
  ); // Fin de la lecture
  return lignes.map((l) => ({ id: Number(l.id), datetime: l.datetime, balance: Number(l.balance) })); // Convertit en nombres
} // Fin de listerSoldes

// Supprime un solde de l'historique.
export async function supprimerSolde(base, id) { // Reçoit la base et l'identifiant
  await base.executer("DELETE FROM solde_om WHERE id = ?", [id]); // Supprime la ligne
} // Fin de supprimerSolde

// ===== Situation financière : solde OM disponible, argent réservé dans les budgets, libre à allouer =====

// Solde du compte Orange Money disponible = dernier solde saisi (ou reçu) moins les dépenses enregistrées après lui.
// Les dépenses issues d'un SMS à la même seconde que le solde sont déjà comprises dans ce solde ; les saisies manuelles de la même seconde sont retirées.
export async function soldeOMDisponible(base) { // Reçoit la base
  const dernier = await lireDernierSolde(base); // Dernier solde connu
  if (dernier === null) return null; // Aucun solde saisi : situation inconnue
  const [ligne] = await base.requeter( // Somme des dépenses postérieures au solde
    "SELECT COALESCE(SUM(montant), 0) AS total FROM transactions WHERE debit_credit = -1 AND nature = 'normale' AND (date_operation > ? OR (date_operation = ? AND insert_type = 'manuel'))", // Dépenses normales après le solde
    [dernier.datetime, dernier.datetime], // Date du solde
  ); // Fin de la lecture
  const depensesDepuis = Number(ligne.total); // Dépenses retirées du dernier solde
  return { dernierSolde: dernier.balance, datetime: dernier.datetime, depensesDepuis, disponible: dernier.balance - depensesDepuis }; // Résultat
} // Fin de soldeOMDisponible

// Total réservé dans les budgets = somme des soldes de toutes les allocations = total des allocations moins total des dépenses.
export async function totalReserve(base) { // Reçoit la base
  const [ligne] = await base.requeter("SELECT COALESCE(SUM(debit_credit * montant), 0) AS total FROM transactions WHERE allocation_id IS NOT NULL"); // Somme signée des transactions rattachées à un budget
  return Number(ligne.total); // Renvoie un entier
} // Fin de totalReserve

// Situation d'ensemble : solde OM disponible, total réservé et libre à allouer (null si aucun solde OM n'est saisi).
export async function situationFinanciere(base) { // Reçoit la base
  const om = await soldeOMDisponible(base); // Solde OM disponible
  const reserve = await totalReserve(base); // Total réservé dans les budgets
  return { om, reserve, libre: om === null ? null : om.disponible - reserve }; // Libre = disponible moins réservé
} // Fin de situationFinanciere

// Détail du solde réservé par budget : alloué (net des reports et transferts) moins dépensé, sur toutes les périodes.
export async function soldesParBudget(base) { // Reçoit la base
  const lignes = await base.requeter( // Lit chaque budget avec ses totaux
    `SELECT b.id, b.name, t.name AS type_name,
       COALESCE(SUM(CASE WHEN x.debit_credit = 1 THEN x.montant WHEN x.debit_credit = -1 AND x.nature <> 'normale' THEN -x.montant END), 0) AS alloue,
       COALESCE(SUM(CASE WHEN x.debit_credit = -1 AND x.nature = 'normale' THEN x.montant END), 0) AS depense
     FROM budget b JOIN type_budget t ON t.id = b.type_id
     LEFT JOIN allocation_budget a ON a.budget_id = b.id
     LEFT JOIN transactions x ON x.allocation_id = a.id
     GROUP BY b.id ORDER BY b.name`, // Alloué net et dépensé par budget
  ); // Fin de la lecture
  return lignes.map((l) => ({ budgetId: Number(l.id), name: l.name, typeName: l.type_name, alloue: Number(l.alloue), depense: Number(l.depense), solde: Number(l.alloue) - Number(l.depense) })); // Solde = alloué - dépensé
} // Fin de soldesParBudget
