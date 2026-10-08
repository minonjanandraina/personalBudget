// Opérations USSD envoyées en attente de leur SMS de confirmation : rapprochement avec les SMS importés et classement automatique dans le budget.
// Règle : un SMS de débit non classé, reçu moins de 24 h après l'envoi, dont le montant (frais exclus ou compris) vaut celui demandé, est classé dans le budget de l'opération.
import { ErreurMetier } from "./erreurs.js"; // Erreur de règle de gestion
import { analyserSmsMM } from "./sms-mm.js"; // Analyse d'un SMS (pour connaître le montant sans les frais)
import { classerTransaction } from "./import-sms.js"; // Classement d'une dépense SMS dans un budget (mêmes contrôles qu'une dépense manuelle)

export const DELAI_ATTENTE_MS = 24 * 60 * 60 * 1000; // Au-delà de 24 h, une opération sans SMS est abandonnée
const TOLERANCE_MS = 60 * 1000; // Marge d'une minute entre l'envoi et la date d'un SMS

// Liste des opérations en attente ou récentes, la plus récente d'abord (30 au maximum).
export async function listerEnAttente(base) { // Reçoit la base
  const lignes = await base.requeter("SELECT id, operation_nom, numero, montant, budget_id, date_envoi, reponse, statut, raison FROM ussd_en_attente ORDER BY date_envoi DESC, id DESC LIMIT 30"); // Lit la liste
  return lignes.map((l) => ({ id: Number(l.id), operationNom: l.operation_nom, numero: l.numero, montant: Number(l.montant), budgetId: Number(l.budget_id), dateEnvoi: l.date_envoi, reponse: l.reponse, statut: l.statut, raison: l.raison })); // Convertit
} // Fin de listerEnAttente

// Abandonne une opération en attente (l'utilisateur sait qu'elle a échoué chez Mobile Money).
export async function annulerEnAttente(base, id) { // Reçoit la base et l'identifiant
  const { changements } = await base.executer("UPDATE ussd_en_attente SET statut = 'annulee' WHERE id = ? AND statut = 'en_attente'", [id]); // Annule
  if (changements === 0) throw new ErreurMetier("Cette opération n'est plus en attente."); // Déjà traitée
} // Fin de annulerEnAttente

// Rapproche les opérations en attente des SMS déjà importés. Sans danger si on la relance. Renvoie { classees, echecs, expirees }.
export async function rapprocherEnAttente(base, maintenant = new Date()) { // Reçoit la base et l'heure
  const bilan = { classees: 0, echecs: 0, expirees: 0 }; // Compteurs
  const limite = new Date(maintenant.getTime() - DELAI_ATTENTE_MS).toISOString(); // Date avant laquelle une attente est abandonnée
  const { changements } = await base.executer("UPDATE ussd_en_attente SET statut = 'expiree', raison = 'Aucun SMS de confirmation reçu dans les 24 heures.' WHERE statut = 'en_attente' AND date_envoi < ?", [limite]); // Abandonne les trop anciennes
  bilan.expirees = changements; // Compte
  const attentes = await base.requeter("SELECT id, montant, budget_id, date_envoi FROM ussd_en_attente WHERE statut = 'en_attente' ORDER BY date_envoi, id"); // Opérations encore en attente
  if (attentes.length === 0) return bilan; // Rien à rapprocher
  const candidates = await base.requeter("SELECT id, sms, date_operation FROM transactions WHERE insert_type = 'auto' AND nature = 'normale' AND debit_credit = -1 AND allocation_id IS NULL AND id NOT IN (SELECT transaction_id FROM ussd_en_attente WHERE transaction_id IS NOT NULL) ORDER BY date_operation, id"); // Dépenses SMS non classées, pas déjà rapprochées
  const utilisees = new Set(); // Dépenses déjà prises par une attente pendant ce passage
  for (const a of attentes) { // Pour chaque attente (la plus ancienne d'abord)
    const debut = new Date(a.date_envoi).getTime() - TOLERANCE_MS; // Début de la fenêtre
    const fin = new Date(a.date_envoi).getTime() + DELAI_ATTENTE_MS; // Fin de la fenêtre
    const trouvee = candidates.find((t) => { // Cherche le SMS correspondant
      if (utilisees.has(Number(t.id))) return false; // Déjà pris
      const quand = new Date(t.date_operation).getTime(); // Date du SMS
      if (quand < debut || quand > fin) return false; // Hors fenêtre
      const analyse = analyserSmsMM(t.sms ?? ""); // Relit le SMS
      return analyse !== null && !analyse.ignore && (analyse.montant === Number(a.montant) || analyse.total === Number(a.montant)); // Même montant (frais exclus ou compris)
    }); // Fin de la recherche
    if (!trouvee) continue; // Pas encore de SMS : on attend
    utilisees.add(Number(trouvee.id)); // Réserve cette dépense
    try { // Tente le classement
      await classerTransaction(base, Number(trouvee.id), Number(a.budget_id)); // Classe dans le budget de l'opération
      await base.executer("UPDATE ussd_en_attente SET statut = 'classee', transaction_id = ? WHERE id = ?", [trouvee.id, a.id]); // Note le succès
      bilan.classees += 1; // Compte
    } catch (erreur) { // Classement refusé (solde insuffisant, pas d'allocation…)
      await base.executer("UPDATE ussd_en_attente SET statut = 'echec', transaction_id = ?, raison = ? WHERE id = ?", [trouvee.id, `SMS reçu mais classement refusé : ${erreur.message} La dépense reste à classer à la main.`.slice(0, 300), a.id]); // Note l'échec, la dépense reste « à classer »
      bilan.echecs += 1; // Compte
    } // Fin du try/catch
  } // Fin de la boucle
  return bilan; // Résultat
} // Fin de rapprocherEnAttente
