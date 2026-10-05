// Allocations de budget et dépenses manuelles, avec leurs contrôles.
// Règle de solde : le solde d'un budget est PAR PÉRIODE = somme signée des transactions de l'allocation de la période.
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs de saisie et de règle de gestion
import { formaterMontant } from "./format.js"; // Affichage des montants dans les messages
import { periodePour, jourLocal, formaterJour, afficherJour } from "./periodes.js"; // Calculs de périodes
import { lireBudget, listerBudgets } from "./budgets.js"; // Lecture des budgets
import { lireJourJob } from "./parametres.js"; // Jour de lancement de l'allocation
import { creerTransaction } from "./transactions.js"; // Création des transactions

const TOLERANCE_FUTUR_MS = 5 * 60 * 1000; // On accepte jusqu'à 5 minutes d'avance (décalage d'horloge)

// Solde d'une allocation : alimentations moins dépenses.
export async function soldeAllocation(base, allocationId) { // Reçoit la base et l'identifiant
  const [ligne] = await base.requeter("SELECT COALESCE(SUM(debit_credit * montant), 0) AS solde FROM transactions WHERE allocation_id = ?", [allocationId]); // Somme signée des transactions
  return Number(ligne.solde); // Renvoie un entier
} // Fin de soldeAllocation

// Cherche l'allocation d'un budget dont la période contient le jour donné (« AAAA-MM-JJ »). Renvoie null s'il n'y en a pas.
export async function allocationCouvrant(base, budgetId, jour) { // Reçoit la base, le budget et le jour
  const lignes = await base.requeter( // Cherche l'allocation de la période
    "SELECT id, date_from, date_to, montant_alloue FROM allocation_budget WHERE budget_id = ? AND date_from <= ? AND date_to >= ?", // Période contenant le jour
    [budgetId, jour, jour], // Valeurs
  ); // Fin de la recherche
  if (lignes.length === 0) return null; // Aucune allocation pour ce jour
  const l = lignes[0]; // Première (et seule) ligne
  return { id: Number(l.id), dateFrom: l.date_from, dateTo: l.date_to, montantAlloue: Number(l.montant_alloue) }; // Objet allocation
} // Fin de allocationCouvrant

// Vérifie qu'un montant est un entier strictement positif.
const montantValide = (m) => Number.isInteger(m) && m > 0; // Vrai si entier > 0

// Vérifie une note facultative et la nettoie (null si vide).
function nettoyerNote(note) { // Reçoit la note
  const propre = String(note ?? "").trim(); // Retire les espaces autour
  if (propre.length > 200) throw new ErreurValidation({ note: "La note ne peut pas dépasser 200 caractères." }); // Trop longue
  return propre === "" ? null : propre; // Vide = null
} // Fin de nettoyerNote

// Alloue un budget pour une période (par défaut : la période en cours) : crée l'allocation si besoin et son alimentation.
// Contrôle : le solde après allocation ne peut pas être inférieur à montant_min du budget.
export async function allouerBudget(base, { budgetId, montant, periode = null, note = null }, maintenant = new Date()) { // Reçoit la base, la demande et l'heure
  if (!montantValide(montant)) throw new ErreurValidation({ montant: "Le montant doit être un entier supérieur à 0." }); // Montant invalide
  const noteNette = nettoyerNote(note); // Vérifie la note
  const budget = await lireBudget(base, budgetId); // Lit le budget
  if (!budget) throw new ErreurValidation({ budgetId: "Choisissez un budget." }); // Budget inexistant
  const { dateFrom, dateTo } = periode ?? periodePour(await lireJourJob(base), maintenant); // Période demandée, sinon la période en cours
  return base.transaction(async () => { // Tout ou rien
    let allocation = (await base.requeter("SELECT id FROM allocation_budget WHERE budget_id = ? AND date_from = ?", [budgetId, dateFrom]))[0]; // Allocation déjà existante pour cette période ?
    let allocationId = allocation ? Number(allocation.id) : null; // Son identifiant, ou null
    const soldeAvant = allocationId === null ? 0 : await soldeAllocation(base, allocationId); // Solde actuel de la période
    const soldeApres = soldeAvant + montant; // Solde après cette allocation
    if (soldeApres < budget.montantMin) { // Contrôle du minimum
      throw new ErreurValidation({ montant: `Après cette allocation, le solde serait de ${formaterMontant(soldeApres)}, en dessous du minimum de ${formaterMontant(budget.montantMin)}.` }); // Refus avec explication
    } // Fin du contrôle
    if (allocationId === null) { // Première allocation de la période
      const { dernierId } = await base.executer("INSERT INTO allocation_budget (budget_id, date_from, date_to, montant_alloue) VALUES (?, ?, ?, 0)", [budgetId, dateFrom, dateTo]); // Crée la ligne d'allocation
      allocationId = Number(dernierId); // Mémorise son identifiant
    } // Fin de la création
    const idTransaction = await creerTransaction(base, { allocationId, debitCredit: 1, montant, dateOperation: maintenant.toISOString(), note: noteNette }); // Crée l'alimentation du budget
    await base.executer("UPDATE allocation_budget SET montant_alloue = montant_alloue + ? WHERE id = ?", [montant, allocationId]); // Tient à jour le total alloué
    return { allocationId, idTransaction, soldeApres, depassePlafond: soldeApres > budget.montantMax }; // Résultat (le plafond dépassé est signalé, jamais tronqué)
  }); // Fin de la transaction
} // Fin de allouerBudget

// Enregistre une dépense manuelle sur un budget. Bloquée si le solde de la période est insuffisant.
export async function enregistrerDepense(base, { budgetId, montant, dateOperation, note = null }, maintenant = new Date()) { // Reçoit la base, la saisie et l'heure
  const erreurs = {}; // Erreurs de saisie
  if (!montantValide(montant)) erreurs.montant = "Le montant doit être un entier supérieur à 0."; // Montant invalide
  const date = new Date(dateOperation); // Date de la dépense
  if (!dateOperation || Number.isNaN(date.getTime())) erreurs.dateOperation = "La date et l'heure sont invalides."; // Date illisible
  else if (date.getTime() > maintenant.getTime() + TOLERANCE_FUTUR_MS) erreurs.dateOperation = "La date ne peut pas être dans le futur."; // Date future
  const budget = await lireBudget(base, budgetId); // Lit le budget
  if (!budget) erreurs.budgetId = "Choisissez un budget."; // Budget inexistant
  let noteNette = null; // Note nettoyée
  try { noteNette = nettoyerNote(note); } catch (e) { Object.assign(erreurs, e.erreurs); } // Vérifie la note
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une saisie est incorrecte
  return base.transaction(async () => { // Tout ou rien
    const allocation = await allocationCouvrant(base, budgetId, jourLocal(dateOperation)); // Allocation de la période de la dépense
    if (!allocation) throw new ErreurMetier(`Aucune allocation pour « ${budget.name} » à cette date. Allouez d'abord le budget.`); // Pas d'allocation : dépense impossible
    const solde = await soldeAllocation(base, allocation.id); // Solde disponible
    if (solde < montant) throw new ErreurValidation({ montant: `Solde insuffisant : il reste ${formaterMontant(solde)} sur ce budget. Une réallocation est nécessaire.` }); // Dépense bloquée
    const idTransaction = await creerTransaction(base, { allocationId: allocation.id, debitCredit: -1, montant, dateOperation: new Date(dateOperation).toISOString(), note: noteNette }); // Crée la dépense
    return { allocationId: allocation.id, idTransaction, soldeApres: solde - montant }; // Résultat
  }); // Fin de la transaction
} // Fin de enregistrerDepense

// Résumé de chaque budget pour la période en cours : allocation, alloué, dépensé, solde et indicateurs.
export async function resumeBudgets(base, aujourdhui = new Date()) { // Reçoit la base et la date du jour
  const jour = formaterJour(aujourdhui); // Jour courant
  const budgets = await listerBudgets(base); // Tous les budgets
  const lignes = await base.requeter( // Allocations en cours avec leurs totaux
    `SELECT a.budget_id, a.id AS allocation_id, a.date_from, a.date_to,
       COALESCE(SUM(CASE WHEN t.debit_credit = 1 THEN t.montant END), 0) AS alimente,
       COALESCE(SUM(CASE WHEN t.debit_credit = -1 THEN t.montant END), 0) AS depense
     FROM allocation_budget a LEFT JOIN transactions t ON t.allocation_id = a.id
     WHERE a.date_from <= ? AND a.date_to >= ? GROUP BY a.id`, // Totaux par allocation en cours
    [jour, jour], // Jour courant
  ); // Fin de la lecture
  const parBudget = new Map(lignes.map((l) => [Number(l.budget_id), l])); // Index des allocations par budget
  return budgets.map((b) => { // Pour chaque budget
    const l = parBudget.get(b.id); // Son allocation en cours (ou rien)
    if (!l) return { budget: b, allocation: null, depassePlafond: false, sousSeuil: false }; // Pas d'allocation en cours
    const alimente = Number(l.alimente); const depense = Number(l.depense); const solde = alimente - depense; // Totaux et solde
    return { // Résumé complet
      budget: b, // Le budget
      allocation: { id: Number(l.allocation_id), dateFrom: l.date_from, dateTo: l.date_to, alimente, depense, solde }, // L'allocation en cours
      depassePlafond: solde > b.montantMax, // Solde au-dessus du plafond
      sousSeuil: solde < b.soldeAlert, // Solde sous le seuil d'alerte
    }; // Fin du résumé
  }); // Fin de la boucle
} // Fin de resumeBudgets

// Texte de la période pour l'affichage : "20/10/2026 → 19/11/2026".
export function libellePeriode({ dateFrom, dateTo }) { // Reçoit la période
  return `${afficherJour(dateFrom)} → ${afficherJour(dateTo)}`; // Assemble les deux dates
} // Fin de libellePeriode
