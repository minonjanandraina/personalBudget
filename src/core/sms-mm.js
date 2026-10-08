// Analyse d'un SMS Mobile Money : extrait l'identifiant, le montant, les frais et le solde après l'opération.
// Les SMS reçus ne contiennent PAS le budget : la transaction créée est toujours « non classée » (voir import-sms.js).
// Reconnus comme DÉBITS : transfert, retrait, remboursement de prêt. Les mouvements avec le compte épargne, les prêts crédités et les dépôts sont IGNORÉS (« ignore: true ») :
// aucune transaction n'est créée, mais le solde Mobile Money qu'ils contiennent est conservé. Les autres SMS sont listés « non compris » pour revue.
import { formaterMontant } from "./format.js"; // Affichage des montants dans la note

const NOMBRE = "(\\d+(?:[.,]\\d+)?)"; // Un nombre, avec des centimes éventuels (ex. 12000.0 ou 5916.47)
const RE_DEBIT = new RegExp(`(?:transfert|retrait|debite) de\\s+${NOMBRE}\\s*Ar`, "i"); // Montant débité : « transfert de 12000.0Ar », « debite de 500 Ar »...
const RE_FRAIS = new RegExp(`Frais\\s*:\\s*${NOMBRE}\\s*Ar`, "i"); // Frais : « Frais: 400.0Ar »
const RE_SOLDE = new RegExp(`Nouveau solde(?:\\s+Orange\\s+Money)?\\s*(?::|est de)\\s*${NOMBRE}\\s*Ar`, "i"); // Solde Mobile Money après l'opération : « Nouveau solde Orange Money : 5916 Ar », « Nouveau solde: 60416 Ar », « nouveau solde Orange Money est de 1005916.47 Ar » (« Nouveau solde epargne » n'est pas reconnu : ce n'est pas le solde Mobile Money)
const RE_IGNORE = /compte\s+epargne|a\s+ete\s+credit[eé]e?|d[ée]p[oô]t\s+de\s+\d/i; // SMS à ignorer : mouvement avec le compte épargne (dans les deux sens, virement programmé compris), prêt crédité, dépôt d'argent
const RE_ID = /(?:Trans\s*Id|Ref)\s*:\s*([A-Z0-9]+(?:\.[A-Z0-9]+)*)/i; // Identifiant : « Trans Id: MP261005.1023.C25734 » ou « Ref: CO261001.0800.A06136. »

// Convertit un nombre en texte (« 5916.47 ») en entier. « haut » = vrai : arrondi vers le haut (pour les sorties d'argent) ; faux : vers le bas (pour les soldes).
function versEntier(texte, haut) { // Reçoit le texte et le sens de l'arrondi
  const [entier, decimales = ""] = texte.replace(",", ".").split("."); // Sépare la partie entière et les centimes
  const base = Number(entier); // Partie entière
  return haut && /[1-9]/.test(decimales) ? base + 1 : base; // Les centimes comptent comme 1 Ar de plus quand on arrondit vers le haut
} // Fin de versEntier

// Texte lisible de l'opération, gardé comme note de la transaction (200 caractères au plus).
function fabriquerNote(type, texte, frais) { // Reçoit le type, le SMS et les frais
  let note = "Opération Mobile Money"; // Note par défaut
  if (type === "transfert") { // Transfert d'argent
    const destinataire = texte.match(/vers\s+(?:le\s+numero\s+client\s+)?(.+?)\s+est\s+reussi/i)?.[1]; // Destinataire indiqué dans le SMS
    note = destinataire ? `Transfert vers ${destinataire}` : "Transfert"; // Avec ou sans destinataire
  } else if (type === "retrait") { // Retrait
    const agent = texte.match(/aupres du\s+(\d+)/i)?.[1]; // Numéro de l'agent
    note = agent ? `Retrait auprès du ${agent}` : "Retrait"; // Avec ou sans agent
  } else if (type === "remboursement") note = "Remboursement de prêt"; // Remboursement de prêt
  if (frais > 0) note += ` (dont ${formaterMontant(frais)} de frais)`; // Rappelle les frais compris dans le montant
  return note.slice(0, 200); // Limite de la base
} // Fin de fabriquerNote

// Analyse un SMS. Renvoie { trxId, type, montant, frais, total, soldeApres, note }, { ignore: true, trxId, soldeApres } pour un SMS à ignorer, ou null si le SMS n'est pas compris.
// « total » = montant + frais = somme réellement débitée ; « soldeApres » = solde Mobile Money après l'opération (null s'il n'est pas dans le SMS).
export function analyserSmsMM(texte) { // Reçoit le texte du SMS
  const sms = String(texte ?? ""); // Texte sûr
  const debit = sms.match(RE_DEBIT); // Montant débité
  const id = sms.match(RE_ID); // Identifiant de la transaction
  if (RE_IGNORE.test(sms)) { // SMS à ignorer (épargne, prêt crédité, dépôt) : pas de transaction, mais le solde Mobile Money est gardé
    const soldeIgnore = sms.match(RE_SOLDE); // Solde Mobile Money après l'opération (absent du virement vers l'épargne)
    return { ignore: true, trxId: id ? id[1].toUpperCase() : null, soldeApres: soldeIgnore ? versEntier(soldeIgnore[1], false) : null }; // Résultat réduit
  } // Fin du cas ignoré
  if (!debit || !id) return null; // Sans montant débité ou sans identifiant : SMS non compris
  const type = /transfert/i.test(sms) ? "transfert" : /retrait/i.test(sms) ? "retrait" : /rembours/i.test(sms) ? "remboursement" : "autre"; // Type d'opération
  const montant = versEntier(debit[1], true); // Montant débité (entier, arrondi vers le haut)
  if (!(montant > 0)) return null; // Un montant nul n'a aucun sens
  const frais = versEntier(sms.match(RE_FRAIS)?.[1] ?? "0", true); // Frais (0 s'il n'y en a pas)
  const solde = sms.match(RE_SOLDE); // Solde après l'opération
  return { // Résultat
    trxId: id[1].toUpperCase(), // Identifiant (unique : évite les doublons)
    type, // Type d'opération
    montant, // Montant sans les frais
    frais, // Frais
    total: montant + frais, // Total débité du compte
    soldeApres: solde ? versEntier(solde[1], false) : null, // Solde Mobile Money après l'opération, arrondi vers le bas
    note: fabriquerNote(type, sms, frais), // Libellé
  }; // Fin du résultat
} // Fin de analyserSmsMM
