// Allocations de budget et dépenses manuelles, avec leurs contrôles.
// Règle de solde : le solde d'un budget est PAR PÉRIODE = somme signée des transactions de l'allocation de la période.
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs de saisie et de règle de gestion
import { formaterMontant } from "./format.js"; // Affichage des montants dans les messages
import { periodePour, jourLocal, formaterJour, afficherJour } from "./periodes.js"; // Calculs de périodes
import { lireBudget, listerBudgets } from "./budgets.js"; // Lecture des budgets
import { lireJourJob } from "./parametres.js"; // Jour de lancement de l'allocation
import { creerTransaction } from "./transactions.js"; // Création des transactions
import { situationFinanciere } from "./soldes.js"; // Solde Mobile Money disponible et argent réservé

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

// Message affiché quand aucun solde Mobile Money n'a été saisi.
export const MESSAGE_SANS_SOLDE = "Saisissez d'abord le solde de votre compte Mobile Money avant d'allouer un budget."; // Texte commun

// Vérifie que « montantNouveau » d'argent frais peut être alloué : le total réservé dans les budgets ne doit pas dépasser le solde Mobile Money disponible.
export async function verifierSoldeLibre(base, montantNouveau) { // Reçoit la base et le montant à réserver en plus
  const { mm, reserve, libre } = await situationFinanciere(base); // Situation d'ensemble
  if (mm === null) throw new ErreurMetier(MESSAGE_SANS_SOLDE); // Aucun solde Mobile Money saisi : on ne peut pas contrôler
  if (montantNouveau > libre) throw new ErreurValidation({ montant: `Solde libre insuffisant : il reste ${formaterMontant(Math.max(libre, 0))} à allouer (solde Mobile Money disponible ${formaterMontant(mm.disponible)} − déjà réservé dans les budgets ${formaterMontant(reserve)}).` }); // Allocation trop grande
} // Fin de verifierSoldeLibre

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
    await verifierSoldeLibre(base, montant); // Contrôle : le total réservé ne dépasse pas le solde Mobile Money disponible
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
export async function enregistrerDepense(base, { budgetId, montant, dateOperation, note = null, compriseDansSolde = false }, maintenant = new Date()) { // Reçoit la base, la saisie et l'heure
  const erreurs = {}; // Erreurs de saisie
  if (!montantValide(montant)) erreurs.montant = "Le montant doit être un entier supérieur à 0."; // Montant invalide
  const date = new Date(dateOperation); // Date de la dépense
  if (!dateOperation || Number.isNaN(date.getTime())) erreurs.dateOperation = "La date et l'heure sont invalides."; // Date illisible
  else if (date.getTime() > maintenant.getTime() + TOLERANCE_FUTUR_MS) erreurs.dateOperation = "La date ne peut pas être dans le futur."; // Date future
  const budget = await lireBudget(base, budgetId); // Lit le budget
  if (!budget) erreurs.budgetId = "Choisissez un budget."; // Budget inexistant
  let noteNette = null; // Note nettoyée
  try { noteNette = nettoyerNote(note); } catch (e) { Object.assign(erreurs, e.erreurs); } // Vérifie la note
  if (compriseDansSolde && (await situationFinanciere(base)).mm === null) erreurs.compriseDansSolde = "Aucun solde Mobile Money saisi : il n'y a rien à rattraper."; // Cette case n'a de sens qu'avec un solde Mobile Money
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une saisie est incorrecte
  return base.transaction(async () => { // Tout ou rien
    const allocation = await allocationCouvrant(base, budgetId, jourLocal(dateOperation)); // Allocation de la période de la dépense
    if (!allocation) throw new ErreurMetier(`Aucune allocation pour « ${budget.name} » à cette date. Allouez d'abord le budget.`); // Pas d'allocation : dépense impossible
    const solde = await soldeAllocation(base, allocation.id); // Solde disponible
    if (solde < montant) throw new ErreurValidation({ montant: `Solde insuffisant : il reste ${formaterMontant(solde)} sur ce budget. Une réallocation est nécessaire.` }); // Dépense bloquée
    const idTransaction = await creerTransaction(base, { allocationId: allocation.id, debitCredit: -1, montant, dateOperation: new Date(dateOperation).toISOString(), note: noteNette, compriseDansSolde }); // Crée la dépense
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
       COALESCE(SUM(CASE WHEN t.debit_credit = -1 AND t.nature = 'normale' THEN t.montant END), 0) AS depense,
       COALESCE(SUM(CASE WHEN t.debit_credit = -1 AND t.nature <> 'normale' THEN t.montant END), 0) AS sorties
     FROM allocation_budget a LEFT JOIN transactions t ON t.allocation_id = a.id
     WHERE a.date_from <= ? AND a.date_to >= ? GROUP BY a.id`, // Totaux par allocation en cours
    [jour, jour], // Jour courant
  ); // Fin de la lecture
  const parBudget = new Map(lignes.map((l) => [Number(l.budget_id), l])); // Index des allocations par budget
  return budgets.map((b) => { // Pour chaque budget
    const l = parBudget.get(b.id); // Son allocation en cours (ou rien)
    if (!l) return { budget: b, allocation: null, depassePlafond: false, sousSeuil: false }; // Pas d'allocation en cours
    const alimente = Number(l.alimente); const depense = Number(l.depense); const sorties = Number(l.sorties); const solde = alimente - depense - sorties; // Totaux et solde (sorties = transferts et reports vers d'autres budgets ou périodes)
    return { // Résumé complet
      budget: b, // Le budget
      allocation: { id: Number(l.allocation_id), dateFrom: l.date_from, dateTo: l.date_to, alimente, depense, sorties, solde }, // L'allocation en cours
      depassePlafond: solde > b.montantMax, // Solde au-dessus du plafond
      sousSeuil: solde < b.soldeAlert, // Solde sous le seuil d'alerte
    }; // Fin du résumé
  }); // Fin de la boucle
} // Fin de resumeBudgets

// Texte de la période pour l'affichage : "20/10/2026 → 19/11/2026".
export function libellePeriode({ dateFrom, dateTo }) { // Reçoit la période
  return `${afficherJour(dateFrom)} → ${afficherJour(dateTo)}`; // Assemble les deux dates
} // Fin de libellePeriode

// ===== Modification et suppression des opérations saisies à la main =====
// Règles : seules les opérations manuelles sont modifiables ; un solde de période ne doit jamais devenir négatif.

// Lit une transaction avec son budget (null si elle n'existe pas).
async function lireOperation(base, id) { // Reçoit la base et l'identifiant
  const lignes = await base.requeter( // Lit la transaction et le budget de son allocation
    "SELECT t.id, t.allocation_id, t.insert_type, t.debit_credit, t.montant, t.date_operation, t.note, t.nature, t.comprise_dans_solde, a.budget_id FROM transactions t LEFT JOIN allocation_budget a ON a.id = t.allocation_id WHERE t.id = ?", // Jointure transaction + allocation
    [id], // Identifiant
  ); // Fin de la lecture
  if (lignes.length === 0) return null; // Transaction introuvable
  const l = lignes[0]; // Ligne trouvée
  return { id: Number(l.id), allocationId: l.allocation_id === null ? null : Number(l.allocation_id), insertType: l.insert_type, debitCredit: Number(l.debit_credit), montant: Number(l.montant), dateOperation: l.date_operation, note: l.note, nature: l.nature, compriseDansSolde: Number(l.comprise_dans_solde) === 1, budgetId: l.budget_id === null ? null : Number(l.budget_id) }; // Objet transaction
} // Fin de lireOperation

// Vérifie qu'une opération existe et peut être modifiée ou supprimée ; renvoie l'opération.
async function operationModifiable(base, id) { // Reçoit la base et l'identifiant
  const operation = await lireOperation(base, id); // Lit l'opération
  if (!operation) throw new ErreurMetier("Cette opération n'existe plus."); // Introuvable
  if (operation.insertType !== "manuel") throw new ErreurMetier("Une opération issue d'un SMS ne peut pas être modifiée ni supprimée."); // Les opérations venant d'un SMS restent telles que reçues
  if (operation.nature !== "normale") throw new ErreurMetier("Un report ou un transfert est généré par l'application : il ne peut pas être modifié ni supprimé."); // Mouvements automatiques en lecture seule (un transfert se défait par un transfert inverse)
  if (operation.allocationId === null) throw new ErreurMetier("Cette opération n'est rattachée à aucun budget."); // Cas non classé : traité plus tard
  return operation; // Opération modifiable
} // Fin de operationModifiable

// Modifie le montant, la note et (pour une dépense) la date d'une opération manuelle.
export async function modifierOperation(base, id, { montant, dateOperation, note = null, compriseDansSolde = undefined }, maintenant = new Date()) { // Reçoit la base, l'identifiant et les nouvelles valeurs
  const operation = await operationModifiable(base, id); // Vérifie que l'opération est modifiable
  const estDepense = operation.debitCredit === -1; // Dépense ou alimentation ?
  const erreurs = {}; // Erreurs de saisie
  if (!montantValide(montant)) erreurs.montant = "Le montant doit être un entier supérieur à 0."; // Montant invalide
  let nouvelleDate = operation.dateOperation; // La date ne change pas par défaut
  if (estDepense) { // La date d'une dépense peut changer
    const date = new Date(dateOperation); // Nouvelle date
    if (!dateOperation || Number.isNaN(date.getTime())) erreurs.dateOperation = "La date et l'heure sont invalides."; // Date illisible
    else if (date.getTime() > maintenant.getTime() + TOLERANCE_FUTUR_MS) erreurs.dateOperation = "La date ne peut pas être dans le futur."; // Date future
    else nouvelleDate = date.toISOString(); // Date valide
  } // Fin du cas dépense
  let noteNette = null; // Note nettoyée
  try { noteNette = nettoyerNote(note); } catch (e) { Object.assign(erreurs, e.erreurs); } // Vérifie la note
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une saisie est incorrecte
  return base.transaction(async () => { // Tout ou rien
    if (estDepense) { // Dépense : elle peut changer de période si la date change
      const drapeau = compriseDansSolde === undefined ? operation.compriseDansSolde : Boolean(compriseDansSolde); // « Déjà comprise dans le solde » : inchangé si non précisé
      if (drapeau && (await situationFinanciere(base)).mm === null) throw new ErreurValidation({ compriseDansSolde: "Aucun solde Mobile Money saisi : il n'y a rien à rattraper." }); // Impossible sans solde Mobile Money
      const allocation = await allocationCouvrant(base, operation.budgetId, jourLocal(nouvelleDate)); // Allocation de la nouvelle date
      if (!allocation) throw new ErreurMetier("Aucune allocation pour ce budget à cette date. Allouez d'abord le budget."); // Pas d'allocation à cette date
      const soldeSansElle = (await soldeAllocation(base, allocation.id)) + (allocation.id === operation.allocationId ? operation.montant : 0); // Solde de la période sans cette dépense
      if (soldeSansElle < montant) throw new ErreurValidation({ montant: `Solde insuffisant : il reste ${formaterMontant(soldeSansElle)} sur ce budget pour cette période.` }); // Dépense bloquée
      await base.executer("UPDATE transactions SET montant = ?, date_operation = ?, note = ?, allocation_id = ?, comprise_dans_solde = ? WHERE id = ?", [montant, nouvelleDate, noteNette, allocation.id, drapeau ? 1 : 0, id]); // Met à jour la dépense
      return { allocationId: allocation.id, soldeApres: soldeSansElle - montant }; // Résultat
    } // Fin du cas dépense
    const soldeApres = (await soldeAllocation(base, operation.allocationId)) - operation.montant + montant; // Solde de la période après la modification d'une allocation
    if (soldeApres < 0) throw new ErreurValidation({ montant: `Impossible : des dépenses de cette période dépasseraient alors le solde (${formaterMontant(soldeApres)}).` }); // Le solde deviendrait négatif
    if (montant > operation.montant) await verifierSoldeLibre(base, montant - operation.montant); // Une augmentation réserve de l'argent frais : elle doit tenir dans le solde Mobile Money disponible
    await base.executer("UPDATE transactions SET montant = ?, note = ? WHERE id = ?", [montant, noteNette, id]); // Met à jour l'allocation
    await base.executer("UPDATE allocation_budget SET montant_alloue = montant_alloue + ? WHERE id = ?", [montant - operation.montant, operation.allocationId]); // Tient à jour le total alloué
    return { allocationId: operation.allocationId, soldeApres }; // Résultat
  }); // Fin de la transaction
} // Fin de modifierOperation

// Supprime une opération manuelle. Une allocation ne peut être supprimée que si les dépenses restent couvertes.
export async function supprimerOperation(base, id) { // Reçoit la base et l'identifiant
  const operation = await operationModifiable(base, id); // Vérifie que l'opération est supprimable
  return base.transaction(async () => { // Tout ou rien
    if (operation.debitCredit === 1) { // Suppression d'une allocation
      const soldeApres = (await soldeAllocation(base, operation.allocationId)) - operation.montant; // Solde de la période sans cette allocation
      if (soldeApres < 0) throw new ErreurMetier(`Suppression impossible : des dépenses de cette période dépasseraient alors le solde (${formaterMontant(soldeApres)}). Supprimez d'abord ces dépenses.`); // Le solde deviendrait négatif
      await base.executer("UPDATE allocation_budget SET montant_alloue = montant_alloue - ? WHERE id = ?", [operation.montant, operation.allocationId]); // Tient à jour le total alloué
    } // Fin du cas allocation
    await base.executer("DELETE FROM transactions WHERE id = ?", [id]); // Supprime l'opération
    const [{ n }] = await base.requeter("SELECT COUNT(*) AS n FROM transactions WHERE allocation_id = ?", [operation.allocationId]); // Reste-t-il des opérations dans cette allocation ?
    if (Number(n) === 0) await base.executer("DELETE FROM allocation_budget WHERE id = ?", [operation.allocationId]); // Sinon l'allocation vide est supprimée (le budget redevient « non alloué »)
  }); // Fin de la transaction
} // Fin de supprimerOperation

// Pourquoi une allocation (période d'un budget) ne peut pas être supprimée en entier ? Renvoie le texte du refus, ou null si c'est permis.
// Permis seulement si elle ne contient que des alimentations normales : aucune dépense (manuelle ou SMS), aucun report, aucun transfert.
export async function raisonRefusSuppressionAllocation(base, allocationId) { // Reçoit la base et l'identifiant de l'allocation
  const [existe] = await base.requeter("SELECT id FROM allocation_budget WHERE id = ?", [allocationId]); // L'allocation existe-t-elle ?
  if (!existe) return "Cette allocation n'existe plus."; // Introuvable
  const [{ n: depenses }] = await base.requeter("SELECT COUNT(*) AS n FROM transactions WHERE allocation_id = ? AND debit_credit = -1 AND nature = 'normale'", [allocationId]); // Dépenses rangées dans cette allocation
  if (Number(depenses) > 0) return "Suppression impossible : des dépenses sont rangées dans cette allocation."; // Il y a des dépenses
  const [{ n: mouvements }] = await base.requeter("SELECT COUNT(*) AS n FROM transactions WHERE allocation_id = ? AND nature <> 'normale'", [allocationId]); // Reports et transferts liés
  if (Number(mouvements) > 0) return "Suppression impossible : cette allocation contient un report ou un transfert (un transfert se défait par un transfert inverse)."; // Mouvements automatiques
  return null; // Aucune raison de refuser
} // Fin de raisonRefusSuppressionAllocation

// Supprime l'allocation d'un budget pour une période (avec ses alimentations). Le budget et son type ne sont jamais touchés.
export async function supprimerAllocation(base, allocationId) { // Reçoit la base et l'identifiant de l'allocation
  return base.transaction(async () => { // Tout ou rien
    const raison = await raisonRefusSuppressionAllocation(base, allocationId); // Vérifie dans la transaction
    if (raison) throw new ErreurMetier(raison); // Refuse avec le motif
    await base.executer("DELETE FROM transactions WHERE allocation_id = ?", [allocationId]); // Supprime les alimentations
    await base.executer("DELETE FROM allocation_budget WHERE id = ?", [allocationId]); // Supprime l'allocation (le budget redevient « non alloué » sur cette période)
  }); // Fin de la transaction
} // Fin de supprimerAllocation

// Lit une opération pour l'afficher dans un formulaire (null si elle n'existe pas) : ajoute le nom du budget.
export async function lireOperationDetaillee(base, id) { // Reçoit la base et l'identifiant
  const operation = await lireOperation(base, id); // Lit l'opération
  if (!operation) return null; // Introuvable
  const budget = operation.budgetId === null ? null : await lireBudget(base, operation.budgetId); // Lit son budget
  return { ...operation, budgetName: budget?.name ?? null }; // Ajoute le nom du budget
} // Fin de lireOperationDetaillee
