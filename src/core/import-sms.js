// Import des SMS Orange Money : crée une transaction (non classée) et un solde OM par SMS compris. Rejouable sans doublon.
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs de règle de gestion et de saisie
import { formaterMontant } from "./format.js"; // Affichage des montants dans les messages
import { jourLocal, afficherJour } from "./periodes.js"; // Jour d'une date
import { analyserSmsOM } from "./sms-om.js"; // Analyse d'un SMS
import { creerTransaction } from "./transactions.js"; // Création des transactions
import { lireBudget } from "./budgets.js"; // Lecture d'un budget
import { allocationCouvrant, soldeAllocation } from "./allocations.js"; // Allocation d'une période et son solde
import { lireMeta, ecrireMeta } from "./meta.js"; // Réglages de fonctionnement

export const EXPEDITEUR_PAR_DEFAUT = "OrangeMoney"; // Nom de l'expéditeur des SMS Orange Money (réglable dans l'écran SMS)
const CLE_EXPEDITEUR = "sms_expediteur"; // Clé du réglage

// Lit le nom d'expéditeur réglé (valeur par défaut sinon).
export async function lireExpediteur(base) { // Reçoit la base
  return (await lireMeta(base, CLE_EXPEDITEUR)) ?? EXPEDITEUR_PAR_DEFAUT; // Réglage ou défaut
} // Fin de lireExpediteur

// Enregistre le nom d'expéditeur (non vide, 30 caractères au plus).
export async function modifierExpediteur(base, nom) { // Reçoit la base et le nom
  const propre = String(nom ?? "").trim(); // Retire les espaces autour
  if (propre === "" || propre.length > 30) throw new ErreurValidation({ expediteur: "Le nom de l'expéditeur doit faire de 1 à 30 caractères." }); // Nom invalide
  await ecrireMeta(base, CLE_EXPEDITEUR, propre); // Enregistre
} // Fin de modifierExpediteur

// Date à partir de laquelle on importe les SMS = date du plus ancien solde OM saisi (solde initial). Null s'il n'y en a pas.
// Les SMS plus anciens sont déjà compris dans ce solde initial : les importer fausserait les budgets.
export async function dateDepartImport(base) { // Reçoit la base
  const [ligne] = await base.requeter("SELECT MIN(datetime) AS depart FROM solde_om"); // Plus ancien solde
  return ligne.depart ?? null; // Date ISO ou null
} // Fin de dateDepartImport

// Importe des SMS lus sur le téléphone : messages = [{ corps, date }] (date ISO). Idempotent : relancer ne crée aucun doublon.
// Renvoie { importes, doublons, anciens, illisibles } (nombres de SMS dans chaque cas).
export async function importerSms(base, messages) { // Reçoit la base et les messages
  const depart = await dateDepartImport(base); // Date de départ de l'import
  if (depart === null) throw new ErreurMetier("Saisissez d'abord le solde initial de votre compte Orange Money : seuls les SMS reçus après lui sont importés."); // Pas de solde initial
  const bilan = { importes: 0, doublons: 0, anciens: 0, illisibles: 0 }; // Compteurs
  const tries = messages // Les SMS du plus ancien au plus récent (le solde le plus récent est ainsi enregistré en dernier)
    .map((m) => ({ corps: String(m.corps ?? ""), date: new Date(m.date) })) // Convertit la date
    .filter((m) => !Number.isNaN(m.date.getTime())) // Ignore un SMS sans date valide
    .sort((a, b) => a.date - b.date); // Tri par date
  await base.transaction(async () => { // Tout ou rien : un import interrompu ne laisse rien de moitié écrit
    for (const m of tries) { // Pour chaque SMS
      const dateIso = m.date.toISOString(); // Date ISO UTC
      if (dateIso < depart) { bilan.anciens += 1; continue; } // Antérieur au solde initial : ignoré
      const analyse = analyserSmsOM(m.corps); // Analyse le texte
      if (analyse === null) { // SMS non compris
        const { changements } = await base.executer("INSERT OR IGNORE INTO sms_illisible (date_sms, texte) VALUES (?, ?)", [dateIso, m.corps]); // Le garde pour revue (une seule fois)
        if (changements > 0) bilan.illisibles += 1; // Compte seulement les nouveaux
        continue; // Passe au suivant
      } // Fin du cas non compris
      const [existe] = await base.requeter("SELECT 1 AS un FROM transactions WHERE trx_id = ?", [analyse.trxId]); // Déjà importé ?
      if (existe) { bilan.doublons += 1; continue; } // Oui : rien à faire
      await creerTransaction(base, { trxId: analyse.trxId, insertType: "auto", debitCredit: -1, montant: analyse.total, sms: m.corps, dateOperation: dateIso, note: analyse.note }); // Dépense non classée (sans allocation)
      if (analyse.soldeApres !== null) await base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [dateIso, analyse.soldeApres]); // Solde OM après l'opération
      bilan.importes += 1; // Une opération de plus
    } // Fin de la boucle
  }); // Fin de la transaction
  return bilan; // Résultat
} // Fin de importerSms

// Lit les SMS avec « lireSms » (fourni par la plateforme : téléphone ou simulation) puis les importe.
export async function synchroniserSms(base, lireSms) { // Reçoit la base et la fonction de lecture
  const depart = await dateDepartImport(base); // Date de départ
  if (depart === null) throw new ErreurMetier("Saisissez d'abord le solde initial de votre compte Orange Money : seuls les SMS reçus après lui sont importés."); // Pas de solde initial
  const messages = await lireSms({ expediteur: await lireExpediteur(base), depuis: depart }); // Lit les SMS de l'expéditeur depuis la date de départ
  return importerSms(base, messages); // Importe
} // Fin de synchroniserSms

// Transactions issues d'un SMS et pas encore rangées dans un budget (la plus récente d'abord).
export async function listerNonClassees(base) { // Reçoit la base
  const lignes = await base.requeter("SELECT id, trx_id, montant, note, date_operation, sms FROM transactions WHERE allocation_id IS NULL AND insert_type = 'auto' AND nature = 'normale' ORDER BY date_operation DESC, id DESC"); // Dépenses SMS sans budget
  return lignes.map((l) => ({ id: Number(l.id), trxId: l.trx_id, montant: Number(l.montant), note: l.note, dateOperation: l.date_operation, sms: l.sms })); // Convertit
} // Fin de listerNonClassees

// Nombre de transactions SMS à classer.
export async function compterNonClassees(base) { // Reçoit la base
  const [ligne] = await base.requeter("SELECT COUNT(*) AS n FROM transactions WHERE allocation_id IS NULL AND insert_type = 'auto' AND nature = 'normale'"); // Compte
  return Number(ligne.n); // Entier
} // Fin de compterNonClassees

// Classe une dépense issue d'un SMS dans un budget (budgetId = null : la remet « non classée »).
// Comme pour une dépense saisie à la main : le budget doit avoir une allocation couvrant la date de la dépense, avec assez de solde.
export async function classerTransaction(base, transactionId, budgetId) { // Reçoit la base, la transaction et le budget
  const [t] = await base.requeter("SELECT id, allocation_id, insert_type, debit_credit, montant, date_operation, nature FROM transactions WHERE id = ?", [transactionId]); // Lit la transaction
  if (!t) throw new ErreurMetier("Cette opération n'existe plus."); // Introuvable
  if (t.insert_type !== "auto" || Number(t.debit_credit) !== -1 || t.nature !== "normale") throw new ErreurMetier("Seule une dépense issue d'un SMS peut être classée ici."); // Les autres opérations se gèrent dans Opérations
  if (budgetId === null) { // Remise en « non classée »
    await base.executer("UPDATE transactions SET allocation_id = NULL WHERE id = ?", [transactionId]); // Retire le rattachement
    return { allocationId: null }; // Résultat
  } // Fin du cas « non classée »
  const budget = await lireBudget(base, budgetId); // Lit le budget
  if (!budget) throw new ErreurValidation({ budgetId: "Choisissez un budget." }); // Budget inexistant
  return base.transaction(async () => { // Tout ou rien
    const allocation = await allocationCouvrant(base, budgetId, jourLocal(t.date_operation)); // Allocation de la période de la dépense
    if (!allocation) throw new ErreurMetier(`Aucune allocation pour « ${budget.name} » au ${afficherJour(jourLocal(t.date_operation))} (date de la dépense). Allouez d'abord ce budget.`); // Pas d'allocation
    const montant = Number(t.montant); // Montant de la dépense
    const soldeSansElle = (await soldeAllocation(base, allocation.id)) + (Number(t.allocation_id) === allocation.id ? montant : 0); // Solde de la période sans cette dépense
    if (soldeSansElle < montant) throw new ErreurValidation({ budgetId: `Solde insuffisant : il reste ${formaterMontant(soldeSansElle)} sur « ${budget.name} » pour cette période. Une réallocation est nécessaire.` }); // Dépense bloquée comme une saisie manuelle
    await base.executer("UPDATE transactions SET allocation_id = ? WHERE id = ?", [allocation.id, transactionId]); // Rattache la dépense au budget
    return { allocationId: allocation.id }; // Résultat
  }); // Fin de la transaction
} // Fin de classerTransaction

// SMS non compris à revoir (les ignorés sont exclus), du plus récent au plus ancien.
export async function listerSmsIllisibles(base) { // Reçoit la base
  const lignes = await base.requeter("SELECT id, date_sms, texte FROM sms_illisible WHERE ignore = 0 ORDER BY date_sms DESC, id DESC"); // SMS non ignorés
  return lignes.map((l) => ({ id: Number(l.id), dateSms: l.date_sms, texte: l.texte })); // Convertit
} // Fin de listerSmsIllisibles

// Nombre de SMS non compris à revoir.
export async function compterSmsIllisibles(base) { // Reçoit la base
  const [ligne] = await base.requeter("SELECT COUNT(*) AS n FROM sms_illisible WHERE ignore = 0"); // Compte
  return Number(ligne.n); // Entier
} // Fin de compterSmsIllisibles

// Ignore un SMS non compris (il ne sera plus listé, même si on relance la synchronisation).
export async function ignorerSmsIllisible(base, id) { // Reçoit la base et l'identifiant
  await base.executer("UPDATE sms_illisible SET ignore = 1 WHERE id = ?", [id]); // Marque comme ignoré
} // Fin de ignorerSmsIllisible
