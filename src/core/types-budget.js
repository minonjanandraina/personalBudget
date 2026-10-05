// Gestion des types de budget (liste : loisir, scolarité...).
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs de saisie et de règle de gestion

const LONGUEUR_MAX_NOM = 100; // Longueur maximale d'un nom

// Fabrique le code d'un type à partir de son numéro : 1 -> "bdg-001".
export function formaterCodeType(numero) { // Reçoit le numéro
  return `bdg-${String(numero).padStart(3, "0")}`; // Complète avec des zéros à gauche jusqu'à 3 chiffres
} // Fin de formaterCodeType

// Vérifie un nom (de type ou de budget). Renvoie le nom nettoyé ou lance une erreur de saisie.
export function validerNom(nom, champ = "name") { // Reçoit le nom et le champ concerné
  const propre = String(nom ?? "").trim(); // Retire les espaces autour
  if (propre === "") throw new ErreurValidation({ [champ]: "Le nom est obligatoire." }); // Nom vide refusé
  if (propre.length > LONGUEUR_MAX_NOM) throw new ErreurValidation({ [champ]: `Le nom ne peut pas dépasser ${LONGUEUR_MAX_NOM} caractères.` }); // Nom trop long refusé
  return propre; // Nom valide
} // Fin de validerNom

// Crée un type de budget ; le code (bdg-001...) est généré et n'est jamais réutilisé.
export async function creerTypeBudget(base, { name }) { // Reçoit la base et le nom
  const nom = validerNom(name); // Vérifie le nom avant toute écriture
  return base.transaction(async () => { // Tout dans une transaction pour éviter deux codes identiques
    const suivi = await base.requeter( // Lit le dernier numéro utilisé par la base
      "SELECT seq FROM sqlite_sequence WHERE name = 'type_budget'", // Compteur interne de SQLite (jamais remis en arrière)
    ); // Fin de la lecture
    const numero = (suivi.length === 0 ? 0 : Number(suivi[0].seq)) + 1; // Numéro suivant (1 si aucun type n'a jamais existé)
    const { dernierId } = await base.executer( // Insère le nouveau type
      "INSERT INTO type_budget (code, name) VALUES (?, ?)", // Requête d'insertion
      [formaterCodeType(numero), nom], // Valeurs : code généré et nom saisi
    ); // Fin de l'insertion
    return dernierId; // Renvoie l'identifiant du type créé
  }); // Fin de la transaction
} // Fin de creerTypeBudget

// Renvoie tous les types de budget, classés par code.
export async function listerTypesBudget(base) { // Reçoit la base
  return base.requeter("SELECT id, code, name, insert_date FROM type_budget ORDER BY code"); // Lit et renvoie les lignes
} // Fin de listerTypesBudget

// Renvoie les types avec le nombre de budgets qui les utilisent (pour l'affichage et la suppression).
export async function listerTypesAvecCompte(base) { // Reçoit la base
  const lignes = await base.requeter( // Lit les types et compte leurs budgets
    "SELECT t.id, t.code, t.name, COUNT(b.id) AS nb_budgets FROM type_budget t LEFT JOIN budget b ON b.type_id = t.id GROUP BY t.id ORDER BY t.code", // Jointure + comptage
  ); // Fin de la lecture
  return lignes.map((l) => ({ id: Number(l.id), code: l.code, name: l.name, nbBudgets: Number(l.nb_budgets) })); // Convertit en nombres
} // Fin de listerTypesAvecCompte

// Lit un type par son identifiant (null s'il n'existe pas).
export async function lireTypeBudget(base, id) { // Reçoit la base et l'identifiant
  const lignes = await base.requeter("SELECT id, code, name FROM type_budget WHERE id = ?", [id]); // Cherche la ligne
  return lignes.length === 0 ? null : { id: Number(lignes[0].id), code: lignes[0].code, name: lignes[0].name }; // Renvoie l'objet ou null
} // Fin de lireTypeBudget

// Change le nom d'un type (le code ne change jamais).
export async function modifierTypeBudget(base, id, { name }) { // Reçoit la base, l'identifiant et le nouveau nom
  const nom = validerNom(name); // Vérifie le nom
  if (!(await lireTypeBudget(base, id))) throw new ErreurMetier("Ce type de budget n'existe plus."); // Type disparu
  await base.executer("UPDATE type_budget SET name = ? WHERE id = ?", [nom, id]); // Met à jour le nom
} // Fin de modifierTypeBudget

// Supprime un type, sauf s'il est utilisé par au moins un budget.
export async function supprimerTypeBudget(base, id) { // Reçoit la base et l'identifiant
  const [{ n }] = await base.requeter("SELECT COUNT(*) AS n FROM budget WHERE type_id = ?", [id]); // Compte les budgets qui l'utilisent
  if (Number(n) > 0) throw new ErreurMetier(`Suppression impossible : ${Number(n)} budget(s) utilisent ce type.`); // Refuse avec un message clair
  await base.executer("DELETE FROM type_budget WHERE id = ?", [id]); // Supprime le type
} // Fin de supprimerTypeBudget
