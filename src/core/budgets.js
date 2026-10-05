// Gestion des budgets (écolage, loisirs...).
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs de saisie et de règle de gestion
import { validerNom } from "./types-budget.js"; // Vérification du nom

const entierPositifOuNul = (v) => Number.isInteger(v) && v >= 0; // Vrai pour un entier ≥ 0

// Vérifie les données d'un budget. Renvoie un dictionnaire d'erreurs par champ (vide si tout est correct).
export function validerBudget(d) { // Reçoit les données du budget
  const erreurs = {}; // Erreurs trouvées
  try { validerNom(d.name); } catch (e) { Object.assign(erreurs, e.erreurs); } // Vérifie le nom et récupère son erreur éventuelle
  if (!Number.isInteger(d.typeId) || d.typeId <= 0) erreurs.typeId = "Choisissez un type de budget."; // Type obligatoire
  for (const [champ, libelle] of [["montantBudget", "Le montant par mois"], ["montantMax", "Le plafond"], ["montantMin", "Le solde minimal"], ["soldeAlert", "Le seuil d'alerte"]]) { // Pour chaque montant
    if (!entierPositifOuNul(d[champ])) erreurs[champ] = `${libelle} doit être un entier positif ou nul.`; // Doit être un entier ≥ 0
  } // Fin de la boucle
  if (!erreurs.montantMin && !erreurs.montantMax && d.montantMin > d.montantMax) erreurs.montantMin = "Doit être inférieur ou égal au plafond."; // Minimum ≤ plafond
  if (!erreurs.montantBudget && !erreurs.montantMax && d.montantBudget > d.montantMax) erreurs.montantBudget = "Ne peut pas dépasser le plafond."; // Montant mensuel ≤ plafond
  return erreurs; // Renvoie les erreurs
} // Fin de validerBudget

// Transforme une ligne de la base en objet utilisable par l'application.
function versBudget(l) { // Reçoit une ligne SQL
  return { // Objet budget
    id: Number(l.id), name: l.name, typeId: Number(l.type_id), typeName: l.type_name ?? null, // Identité et type
    montantBudget: Number(l.montant_budget), montantMax: Number(l.montant_max), // Montants mensuel et plafond
    montantMin: Number(l.montant_min), soldeAlert: Number(l.solde_alert), // Minimum et seuil d'alerte
    autogenFinMois: Number(l.autogen_fin_mois) === 1, // Booléen
  }; // Fin de l'objet
} // Fin de versBudget

// Requête de base pour lire les budgets avec le nom de leur type.
const SELECT_BUDGETS = "SELECT b.*, t.name AS type_name FROM budget b JOIN type_budget t ON t.id = b.type_id"; // Jointure budget + type

// Vérifie que le type choisi existe ; sinon lance une erreur de saisie.
async function verifierType(base, typeId) { // Reçoit la base et l'identifiant du type
  const lignes = await base.requeter("SELECT id FROM type_budget WHERE id = ?", [typeId]); // Cherche le type
  if (lignes.length === 0) throw new ErreurValidation({ typeId: "Ce type de budget n'existe pas." }); // Type introuvable
} // Fin de verifierType

// Valeurs à écrire dans la base, dans l'ordre des colonnes.
const valeursBudget = (d) => [validerNom(d.name), d.typeId, d.montantBudget, d.montantMax, d.montantMin, d.soldeAlert, d.autogenFinMois ? 1 : 0]; // Nom nettoyé, puis les autres champs

// Crée un budget et renvoie son identifiant.
export async function creerBudget(base, donnees) { // Reçoit la base et les données
  const erreurs = validerBudget(donnees); // Vérifie
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une erreur existe
  await verifierType(base, donnees.typeId); // Vérifie que le type existe
  const { dernierId } = await base.executer( // Insère le budget
    "INSERT INTO budget (name, type_id, montant_budget, montant_max, montant_min, solde_alert, autogen_fin_mois) VALUES (?, ?, ?, ?, ?, ?, ?)", // Requête
    valeursBudget(donnees), // Valeurs
  ); // Fin de l'insertion
  return dernierId; // Renvoie l'identifiant créé
} // Fin de creerBudget

// Modifie un budget existant.
export async function modifierBudget(base, id, donnees) { // Reçoit la base, l'identifiant et les données
  const erreurs = validerBudget(donnees); // Vérifie
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une erreur existe
  if (!(await lireBudget(base, id))) throw new ErreurMetier("Ce budget n'existe plus."); // Budget disparu
  await verifierType(base, donnees.typeId); // Vérifie que le type existe
  await base.executer( // Met à jour la ligne
    "UPDATE budget SET name = ?, type_id = ?, montant_budget = ?, montant_max = ?, montant_min = ?, solde_alert = ?, autogen_fin_mois = ? WHERE id = ?", // Requête
    [...valeursBudget(donnees), id], // Valeurs puis identifiant
  ); // Fin de la mise à jour
} // Fin de modifierBudget

// Lit un budget par son identifiant (null s'il n'existe pas).
export async function lireBudget(base, id) { // Reçoit la base et l'identifiant
  const lignes = await base.requeter(`${SELECT_BUDGETS} WHERE b.id = ?`, [id]); // Cherche la ligne
  return lignes.length === 0 ? null : versBudget(lignes[0]); // Renvoie l'objet ou null
} // Fin de lireBudget

// Liste tous les budgets, par nom.
export async function listerBudgets(base) { // Reçoit la base
  const lignes = await base.requeter(`${SELECT_BUDGETS} ORDER BY b.name`); // Lit toutes les lignes
  return lignes.map(versBudget); // Convertit chaque ligne
} // Fin de listerBudgets

// Supprime un budget, sauf s'il a des allocations.
export async function supprimerBudget(base, id) { // Reçoit la base et l'identifiant
  const [{ n }] = await base.requeter("SELECT COUNT(*) AS n FROM allocation_budget WHERE budget_id = ?", [id]); // Compte ses allocations
  if (Number(n) > 0) throw new ErreurMetier(`Suppression impossible : ce budget a ${Number(n)} allocation(s).`); // Refuse avec un message clair
  await base.executer("DELETE FROM budget WHERE id = ?", [id]); // Supprime le budget
} // Fin de supprimerBudget
