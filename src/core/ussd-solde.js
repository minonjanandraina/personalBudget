// Consultation du solde Orange Money par USSD : enregistrement des réponses en SoldeOM, import des réponses reçues en arrière-plan, consultation automatique.
// Aucun appel à Capacitor : l'accès au téléphone (« ussd ») est fourni par src/platform/ussd.js, ou par un faux dans les tests.
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs expliquées à l'utilisateur
import { analyserReponseUssd } from "./ussd-om.js"; // Lecture du solde dans la réponse
import { creerSolde, soldeOMDisponible } from "./soldes.js"; // Soldes OM
import { lireMeta, ecrireMeta } from "./meta.js"; // Petites informations de fonctionnement

const CLE_DERNIERE = "ussd_derniere_consultation"; // Clé de la date de la dernière consultation
export const INTERVALLE_MS = 60 * 60 * 1000; // Une consultation par heure
const MARGE_MS = 5 * 60 * 1000; // Marge : on consulte dès 55 minutes écoulées (la vérification se fait toutes les 5 minutes)

// Vérifie le format du PIN OM (4 à 8 chiffres). Lance ErreurValidation sinon.
export function validerPin(pin) { // Reçoit le texte saisi
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) throw new ErreurValidation({ pin: "Le PIN doit contenir de 4 à 8 chiffres." }); // Format invalide
} // Fin de validerPin

// Enregistre une réponse USSD comme SoldeOM à la date donnée. Renvoie { balance, enregistre }.
// Sauf « forcer », un solde identique au dernier, sans dépense enregistrée depuis, n'est pas ré-enregistré (évite 24 lignes par jour).
export async function enregistrerReponse(base, texte, dateIso, { forcer = false } = {}) { // Reçoit la base, la réponse et sa date
  const balance = analyserReponseUssd(texte); // Solde lu dans la réponse
  if (balance === null) throw new ErreurMetier("La réponse d'Orange Money ne contient pas de solde."); // Réponse inattendue
  if (!forcer) { // Consultation automatique : évite les doublons inutiles
    const om = await soldeOMDisponible(base); // Situation actuelle
    if (om && om.dernierSolde === balance && om.depensesDepuis === 0) return { balance, enregistre: false }; // Rien n'a changé
  } // Fin du contrôle
  await creerSolde(base, { datetime: dateIso, balance }, new Date(Math.max(Date.now(), new Date(dateIso).getTime()))); // Enregistre le solde
  return { balance, enregistre: true }; // Résultat
} // Fin de enregistrerReponse

// Consulte le solde maintenant et l'enregistre. Si la réponse n'est pas un solde (PIN faux…), arrête la consultation automatique par sécurité.
export async function consulterEtEnregistrer(base, ussd, { forcer = false, maintenant = new Date() } = {}) { // Reçoit la base et l'accès USSD
  await ecrireMeta(base, CLE_DERNIERE, maintenant.toISOString()); // Note l'heure AVANT l'envoi : même en cas d'échec, pas de nouvel essai avant une heure
  const texte = await ussd.consulter(); // Envoie l'USSD et attend la réponse
  if (analyserReponseUssd(texte) === null) { // Réponse sans solde
    await ussd.programmerAuto(false); // Arrête la consultation automatique (jamais de PIN faux répété)
    throw new ErreurMetier(`Réponse inattendue d'Orange Money : « ${String(texte).slice(0, 200)} ». La consultation automatique est arrêtée : vérifiez votre PIN.`); // Explique
  } // Fin du cas inattendu
  return enregistrerReponse(base, texte, maintenant.toISOString(), { forcer }); // Enregistre le solde
} // Fin de consulterEtEnregistrer

// Importe les réponses reçues en arrière-plan (téléphone seulement). Renvoie { importes, arret } (arret = raison d'un arrêt automatique, ou null).
export async function importerReponsesEnAttente(base, ussd) { // Reçoit la base et l'accès USSD
  const { reponses, arret } = await ussd.recupererReponses(); // Réponses en attente (vidées côté téléphone)
  let importes = 0; // Nombre de soldes enregistrés
  let derniere = await lireMeta(base, CLE_DERNIERE); // Dernière consultation connue
  for (const r of [...reponses].sort((a, b) => a.date - b.date)) { // Du plus ancien au plus récent
    const dateIso = new Date(r.date).toISOString(); // Date de la réponse
    try { if ((await enregistrerReponse(base, r.texte, dateIso)).enregistre) importes += 1; } catch { /* réponse illisible : ignorée */ } // Enregistre si le solde a changé
    if (derniere === null || dateIso > derniere) derniere = dateIso; // Retient la plus récente
  } // Fin de la boucle
  if (derniere !== null && reponses.length > 0) await ecrireMeta(base, CLE_DERNIERE, derniere); // Mémorise
  return { importes, arret: arret ?? null }; // Résultat
} // Fin de importerReponsesEnAttente

// Appelée à l'ouverture, au retour sur l'application et toutes les 5 minutes : importe les réponses de l'arrière-plan,
// puis consulte le solde si la consultation automatique est active et que la dernière date de plus d'une heure.
// Renvoie { importes, consulte, arret, erreur } ; ne lance jamais d'erreur.
export async function consultationAutomatique(base, ussd, maintenant = new Date()) { // Reçoit la base et l'accès USSD
  const bilan = { importes: 0, consulte: false, arret: null, erreur: null }; // Résultat
  try { // Une erreur ne doit jamais gêner l'application
    const importe = await importerReponsesEnAttente(base, ussd); // Réponses de l'arrière-plan
    bilan.importes = importe.importes; // Compte
    bilan.arret = importe.arret; // Raison d'un arrêt éventuel
    const etat = await ussd.etat(); // État actuel
    if (!etat.actif || !etat.pinDefini || !etat.permission) return bilan; // Consultation automatique non active
    const derniere = await lireMeta(base, CLE_DERNIERE); // Dernière consultation
    if (derniere !== null && maintenant.getTime() - new Date(derniere).getTime() < INTERVALLE_MS - MARGE_MS) return bilan; // Trop tôt
    const resultat = await consulterEtEnregistrer(base, ussd, { maintenant }); // Consulte et enregistre
    bilan.consulte = true; // Une consultation a eu lieu
    if (resultat.enregistre) bilan.importes += 1; // Compte le nouveau solde
  } catch (erreur) { bilan.erreur = erreur instanceof ErreurMetier ? erreur.message : String(erreur?.message ?? erreur); } // Garde le message
  return bilan; // Résultat
} // Fin de consultationAutomatique
