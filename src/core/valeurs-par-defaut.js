// Types de budget et budgets proposés par défaut à la toute première ouverture de l'application (modifiables ensuite dans l'écran Budgets).
// Installés une seule fois, et seulement si la base ne contient encore ni type ni budget : une base déjà utilisée n'est jamais touchée.
import { creerTypeBudget } from "./types-budget.js"; // Création d'un type (génère le code bdg-001...)
import { creerBudget } from "./budgets.js"; // Création d'un budget (avec ses contrôles)

const CLE_INSTALLE = "defauts_installes"; // Repère dans la table meta : les valeurs par défaut ont déjà été traitées

// Types par défaut (l'ordre donne les codes bdg-001, bdg-002...).
export const TYPES_PAR_DEFAUT = [ // Liste des types
  "Logement et charges", // Loyer, JIRAMA (eau, électricité), internet
  "Charge journaliaire", // Nourriture, café, cigarette, goûter...
  "Transport", // Taxi-be, carburant, taxi
  "Éducation", // Écolage, fournitures, frais scolaires
  "Loisirs et vie sociale", // Sorties, cadeaux, fêtes
  "Épargne et imprévus", // Réserve, dépenses non prévues
  "Abonnement", // Abonnements internet, IA...
  "Sociale", // Adidy et cotisation
]; // Fin des types

// Budgets par défaut : nom, type, montant mensuel, plafond, minimum, seuil d'alerte (allocation automatique : oui pour tous).
export const BUDGETS_PAR_DEFAUT = [ // Liste des budgets
  { name: "Loyer", type: "Logement et charges", montantBudget: 90000, montantMax: 300000, montantMin: 0, soldeAlert: 0 }, // Loyer
  { name: "Internet et téléphone", type: "Logement et charges", montantBudget: 40000, montantMax: 80000, montantMin: 0, soldeAlert: 5000 }, // Internet et téléphone
  { name: "Argent de poche", type: "Charge journaliaire", montantBudget: 250000, montantMax: 300000, montantMin: 0, soldeAlert: 100000 }, // Argent de poche
  { name: "Transport", type: "Transport", montantBudget: 120000, montantMax: 150000, montantMin: 0, soldeAlert: 10000 }, // Transport
  { name: "Abonnement claude", type: "Abonnement", montantBudget: 80000, montantMax: 150000, montantMin: 0, soldeAlert: 0 }, // Abonnement Claude
  { name: "Abonnement elearning", type: "Éducation", montantBudget: 100000, montantMax: 200000, montantMin: 0, soldeAlert: 5000 }, // Abonnement e-learning
  { name: "Loisirs", type: "Loisirs et vie sociale", montantBudget: 100000, montantMax: 100000, montantMin: 0, soldeAlert: 10000 }, // Loisirs
  { name: "Imprévus", type: "Épargne et imprévus", montantBudget: 100000, montantMax: 200000, montantMin: 0, soldeAlert: 0 }, // Imprévus
  { name: "Cotisation sociale PAMF", type: "Sociale", montantBudget: 5000, montantMax: 50000, montantMin: 0, soldeAlert: 0 }, // Cotisation sociale
]; // Fin des budgets

// Installe les valeurs par défaut si c'est la première ouverture. Renvoie true si quelque chose a été créé.
export async function installerValeursParDefaut(base) { // Reçoit la base
  const [fait] = await base.requeter("SELECT valeur FROM meta WHERE cle = ?", [CLE_INSTALLE]); // Déjà traité ?
  if (fait) return false; // Oui : on ne recrée jamais (même si l'utilisateur a tout supprimé)
  const [{ n: nbTypes }] = await base.requeter("SELECT COUNT(*) AS n FROM type_budget"); // Types existants
  const [{ n: nbBudgets }] = await base.requeter("SELECT COUNT(*) AS n FROM budget"); // Budgets existants
  const vide = Number(nbTypes) === 0 && Number(nbBudgets) === 0; // Base encore vierge ?
  if (vide) { // Seulement sur une base vierge
    await base.transaction(async () => { // Tout ou rien
      const idParNom = new Map(); // Identifiant de chaque type créé
      for (const nom of TYPES_PAR_DEFAUT) idParNom.set(nom, await creerTypeBudget(base, { name: nom })); // Crée les types
      for (const b of BUDGETS_PAR_DEFAUT) await creerBudget(base, { ...b, typeId: idParNom.get(b.type), autogenFinMois: true }); // Crée les budgets
    }); // Fin de la transaction
  } // Fin du cas base vierge
  await base.executer("INSERT INTO meta (cle, valeur) VALUES (?, '1')", [CLE_INSTALLE]); // Retient que c'est fait (aussi sur une base déjà utilisée)
  return vide; // Indique si des valeurs ont été créées
} // Fin de installerValeursParDefaut
