// Réallocation de fin de période : report du reliquat, lancement de l'allocation de la période, transferts entre budgets.
// Rappel : le solde d'un budget est PAR PÉRIODE. Un report est donc écrit en deux lignes visibles (lecture seule) :
// une sortie « report » sur l'ancienne période (qui retombe à 0) et une entrée « report » sur la nouvelle.
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs de saisie et de règle de gestion
import { formaterMontant } from "./format.js"; // Affichage des montants dans les messages
import { periodePour, afficherJour } from "./periodes.js"; // Calculs de périodes
import { listerBudgets, lireBudget } from "./budgets.js"; // Lecture des budgets
import { lireJourJob } from "./parametres.js"; // Jour de lancement de l'allocation
import { creerTransaction, genererTrxId } from "./transactions.js"; // Création des transactions
import { soldeAllocation, MESSAGE_SANS_SOLDE } from "./allocations.js"; // Solde d'une allocation et message commun
import { situationFinanciere } from "./soldes.js"; // Solde Mobile Money disponible et argent réservé

const LONGUEUR_MAX_NOTE_TRANSFERT = 80; // Longueur maximale de la note saisie pour un transfert (le reste de la note est généré)

// Raccourcit un nom trop long pour tenir dans une note (ajoute « … »).
const abreger = (nom) => (nom.length > 40 ? `${nom.slice(0, 39)}…` : nom); // 40 caractères au plus

// Retourne l'identifiant de l'allocation d'un budget pour une période, en la créant (vide) si elle n'existe pas.
async function obtenirAllocation(base, budgetId, { dateFrom, dateTo }) { // Reçoit la base, le budget et la période
  const existante = await base.requeter("SELECT id FROM allocation_budget WHERE budget_id = ? AND date_from = ?", [budgetId, dateFrom]); // Cherche l'allocation de cette période
  if (existante.length > 0) return Number(existante[0].id); // Elle existe déjà
  const { dernierId } = await base.executer("INSERT INTO allocation_budget (budget_id, date_from, date_to, montant_alloue) VALUES (?, ?, ?, 0)", [budgetId, dateFrom, dateTo]); // Crée l'allocation vide
  return Number(dernierId); // Renvoie son identifiant
} // Fin de obtenirAllocation

// Écrit une paire de lignes liées : une sortie sur « depuis » et une entrée sur « vers » (report ou transfert).
async function ecrirePaire(base, { depuisAllocationId, versAllocationId, montant, nature, noteSortie, noteEntree, instant }) { // Reçoit les deux allocations et les notes
  const prefixe = nature === "report" ? "RPT" : "TRF"; // Préfixe des identifiants selon la nature
  const racine = genererTrxId(prefixe); // Identifiant commun aux deux lignes
  await creerTransaction(base, { trxId: `${racine}-S`, allocationId: depuisAllocationId, debitCredit: -1, montant, nature, note: noteSortie, dateOperation: instant }); // Sortie (S)
  await creerTransaction(base, { trxId: `${racine}-E`, allocationId: versAllocationId, debitCredit: 1, montant, nature, note: noteEntree, dateOperation: instant }); // Entrée (E)
  await base.executer("UPDATE allocation_budget SET montant_alloue = montant_alloue + ? WHERE id = ?", [montant, versAllocationId]); // Tient à jour le total alloué de la destination
} // Fin de ecrirePaire

// ÉTAPE 1 : calcule ce qu'il faudrait faire pour un budget, SANS rien écrire. Renvoie un plan.
async function planifierPeriodeBudget(base, budget, periode) { // Reçoit la base, le budget et la période
  const plan = { budget, statut: "", raison: null, existanteId: null, aReporter: [], totalReport: 0, creerMensuel: false, soldeApres: null }; // Plan à remplir
  const existante = (await base.requeter("SELECT id FROM allocation_budget WHERE budget_id = ? AND date_from = ?", [budget.id, periode.dateFrom]))[0]; // Allocation de la période en cours, si elle existe
  plan.existanteId = existante ? Number(existante.id) : null; // Son identifiant
  const precedentes = await base.requeter("SELECT id, date_from FROM allocation_budget WHERE budget_id = ? AND date_to < ? ORDER BY date_from", [budget.id, periode.dateFrom]); // Allocations des périodes terminées
  for (const p of precedentes) { // Pour chaque période terminée
    const solde = await soldeAllocation(base, Number(p.id)); // Son solde restant
    if (solde > 0) plan.aReporter.push({ id: Number(p.id), dateFrom: p.date_from, solde }); // À reporter s'il reste de l'argent
  } // Fin de la boucle
  plan.totalReport = plan.aReporter.reduce((somme, p) => somme + p.solde, 0); // Total à reporter
  plan.creerMensuel = plan.existanteId === null && budget.montantBudget > 0; // Faut-il créer l'allocation mensuelle ?
  if (plan.existanteId === null && !plan.creerMensuel && plan.totalReport === 0) { plan.statut = "ignore"; plan.raison = "Rien à allouer : montant mensuel nul et aucun reliquat."; return plan; } // Rien à faire
  if (plan.existanteId !== null && plan.totalReport === 0) { plan.statut = "deja"; plan.soldeApres = await soldeAllocation(base, plan.existanteId); return plan; } // Déjà fait : l'opération est idempotente
  const soldeCourant = plan.existanteId === null ? 0 : await soldeAllocation(base, plan.existanteId); // Solde déjà présent dans la période
  plan.soldeApres = soldeCourant + plan.totalReport + (plan.creerMensuel ? budget.montantBudget : 0); // Solde après report et allocation
  if (plan.creerMensuel && plan.soldeApres < budget.montantMin) { // Contrôle du minimum (comme pour une allocation manuelle)
    plan.statut = "refuse"; // Refusé
    plan.raison = `Minimum non atteint : le solde serait de ${formaterMontant(plan.soldeApres)}, sous le minimum de ${formaterMontant(budget.montantMin)}.`; // Explication
    return plan; // Aucune écriture
  } // Fin du contrôle
  plan.statut = plan.creerMensuel ? "alloue" : "reporte"; // Ce qui sera fait
  return plan; // Renvoie le plan
} // Fin de planifierPeriodeBudget

// ÉTAPE 2 : écrit le plan d'un budget dans la base. Renvoie le résultat à afficher.
async function appliquerPlan(base, plan, periode, instant) { // Reçoit la base, le plan, la période et l'heure
  const { budget } = plan; // Budget concerné
  const resultat = { budgetId: budget.id, nom: budget.name, statut: plan.statut, reliquatReporte: 0, montantAlloue: 0, soldeApres: plan.soldeApres, depassePlafond: false, raison: plan.raison }; // Résultat de base
  if (plan.statut !== "alloue" && plan.statut !== "reporte") return resultat; // Rien à écrire (ignoré, déjà fait ou refusé)
  const allocationId = plan.existanteId ?? await obtenirAllocation(base, budget.id, periode); // Allocation de la période (créée si besoin)
  for (const p of plan.aReporter) { // Pour chaque reliquat à reporter
    await ecrirePaire(base, { depuisAllocationId: p.id, versAllocationId: allocationId, montant: p.solde, nature: "report", noteSortie: `Report vers la période du ${afficherJour(periode.dateFrom)}`, noteEntree: `Report de la période du ${afficherJour(p.dateFrom)}`, instant: instant.toISOString() }); // Écrit le report
  } // Fin de la boucle
  if (plan.creerMensuel) { // Allocation mensuelle
    await creerTransaction(base, { allocationId, debitCredit: 1, montant: budget.montantBudget, note: "Allocation de la période", dateOperation: instant.toISOString() }); // Alimentation du budget
    await base.executer("UPDATE allocation_budget SET montant_alloue = montant_alloue + ? WHERE id = ?", [budget.montantBudget, allocationId]); // Tient à jour le total alloué
  } // Fin de l'allocation mensuelle
  Object.assign(resultat, { reliquatReporte: plan.totalReport, montantAlloue: plan.creerMensuel ? budget.montantBudget : 0, depassePlafond: plan.soldeApres > budget.montantMax }); // Résultat final (un plafond dépassé est signalé, jamais tronqué)
  return resultat; // Renvoie le résultat
} // Fin de appliquerPlan

// Lance l'allocation de la période en cours pour tous les budgets (ou seulement les automatiques). Sans danger si on la relance.
// TOUT OU RIEN : si l'argent frais demandé dépasse le solde libre à allouer, rien n'est écrit.
export async function lancerAllocationPeriode(base, maintenant = new Date(), { seulementAuto = false } = {}) { // Reçoit la base, l'heure et l'option
  const periode = periodePour(await lireJourJob(base), maintenant); // Période en cours
  const budgets = (await listerBudgets(base)).filter((b) => !seulementAuto || b.autogenFinMois); // Budgets concernés
  const plans = []; // Plan de chaque budget
  for (const budget of budgets) plans.push(await planifierPeriodeBudget(base, budget, periode)); // Étape 1 : calcule tout sans rien écrire
  const argentFrais = plans.filter((p) => p.statut === "alloue").reduce((somme, p) => somme + p.budget.montantBudget, 0); // Total des nouvelles allocations mensuelles (les reports ne sont pas de l'argent frais)
  if (argentFrais > 0) { // Contrôle du solde libre
    const { mm, reserve, libre } = await situationFinanciere(base); // Situation d'ensemble
    if (mm === null) throw new ErreurMetier(MESSAGE_SANS_SOLDE); // Aucun solde Mobile Money saisi
    if (argentFrais > libre) throw new ErreurMetier(`Solde libre insuffisant : l'allocation de tous les budgets demande ${formaterMontant(argentFrais)}, il reste ${formaterMontant(Math.max(libre, 0))} à allouer (solde Mobile Money disponible ${formaterMontant(mm.disponible)} − déjà réservé dans les budgets ${formaterMontant(reserve)}). Il manque ${formaterMontant(argentFrais - Math.max(libre, 0))}. Rien n'a été alloué.`); // Tout ou rien
  } // Fin du contrôle
  const resultats = []; // Résultat de chaque budget
  for (const plan of plans) { // Étape 2 : écrit chaque plan
    try { // Un budget en échec ne bloque pas les autres
      resultats.push(await base.transaction(() => appliquerPlan(base, plan, periode, maintenant))); // Écrit le plan (tout ou rien pour ce budget)
    } catch (erreur) { // En cas d'erreur inattendue
      resultats.push({ budgetId: plan.budget.id, nom: plan.budget.name, statut: "erreur", reliquatReporte: 0, montantAlloue: 0, soldeApres: null, depassePlafond: false, raison: erreur.message }); // Signale l'erreur pour ce budget
    } // Fin du try/catch
  } // Fin de la boucle
  return { periode, resultats }; // Renvoie la période et les résultats
} // Fin de lancerAllocationPeriode

// Transfère un montant d'un budget vers un autre pour la période en cours (réallocation manuelle). Neutre pour le solde libre.
export async function transfererEntreBudgets(base, { sourceId, destinationId, montant, note = null }, maintenant = new Date()) { // Reçoit la base, la demande et l'heure
  const erreurs = {}; // Erreurs de saisie
  if (!Number.isInteger(montant) || montant <= 0) erreurs.montant = "Le montant doit être un entier supérieur à 0."; // Montant invalide
  const noteSaisie = String(note ?? "").trim(); // Note nettoyée
  if (noteSaisie.length > LONGUEUR_MAX_NOTE_TRANSFERT) erreurs.note = `La note ne peut pas dépasser ${LONGUEUR_MAX_NOTE_TRANSFERT} caractères pour un transfert.`; // Note trop longue
  const source = await lireBudget(base, sourceId); // Budget source
  const destination = await lireBudget(base, destinationId); // Budget destination
  if (!source) erreurs.sourceId = "Choisissez le budget à débiter."; // Source inexistante
  if (!destination) erreurs.destinationId = "Choisissez le budget à créditer."; // Destination inexistante
  if (source && destination && source.id === destination.id) erreurs.destinationId = "Choisissez un budget différent de la source."; // Même budget
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une saisie est incorrecte
  const periode = periodePour(await lireJourJob(base), maintenant); // Période en cours
  return base.transaction(async () => { // Tout ou rien
    const alloSource = (await base.requeter("SELECT id FROM allocation_budget WHERE budget_id = ? AND date_from = ?", [source.id, periode.dateFrom]))[0]; // Allocation de la source
    if (!alloSource) throw new ErreurMetier(`« ${source.name} » n'est pas alloué sur la période en cours : rien à transférer.`); // Source non allouée
    const soldeSource = await soldeAllocation(base, Number(alloSource.id)); // Solde de la source
    if (soldeSource < montant) throw new ErreurValidation({ montant: `Solde insuffisant : il reste ${formaterMontant(soldeSource)} sur « ${source.name} ».` }); // Source insuffisante
    const alloDestinationExistante = (await base.requeter("SELECT id FROM allocation_budget WHERE budget_id = ? AND date_from = ?", [destination.id, periode.dateFrom]))[0]; // Allocation de la destination, si elle existe
    const soldeDestinationAvant = alloDestinationExistante ? await soldeAllocation(base, Number(alloDestinationExistante.id)) : 0; // Solde de la destination avant transfert
    const soldeDestination = soldeDestinationAvant + montant; // Solde de la destination après transfert
    if (soldeDestination < destination.montantMin) throw new ErreurValidation({ montant: `Après ce transfert, « ${destination.name} » aurait ${formaterMontant(soldeDestination)}, en dessous de son minimum de ${formaterMontant(destination.montantMin)}.` }); // Minimum de la destination
    const alloDestination = alloDestinationExistante ? Number(alloDestinationExistante.id) : await obtenirAllocation(base, destination.id, periode); // Allocation de la destination (créée si besoin)
    const suffixe = noteSaisie ? ` — ${noteSaisie}` : ""; // Note de l'utilisateur ajoutée à la fin
    await ecrirePaire(base, { depuisAllocationId: Number(alloSource.id), versAllocationId: alloDestination, montant, nature: "transfert", noteSortie: `Transfert vers « ${abreger(destination.name)} »${suffixe}`, noteEntree: `Transfert depuis « ${abreger(source.name)} »${suffixe}`, instant: maintenant.toISOString() }); // Écrit le transfert
    return { soldeSource: soldeSource - montant, soldeDestination, depassePlafond: soldeDestination > destination.montantMax }; // Résultat (plafond dépassé signalé)
  }); // Fin de la transaction
} // Fin de transfererEntreBudgets
