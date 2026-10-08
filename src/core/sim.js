// Choix de la carte SIM utilisée pour les codes USSD (consultation du solde, opérations). Gardé dans la table « meta » (clé ussd_sim) :
// identifiant Android de la SIM + emplacement (1 ou 2) + nom, pour l'affichage. Sans choix : SIM par défaut du téléphone.
// Aucune dépendance Android : la liste des SIM vient de src/platform/ussd.js. Le plugin Kotlin revérifie que la SIM est toujours présente à chaque envoi.
import { ErreurValidation } from "./erreurs.js"; // Erreur expliquée à l'utilisateur
import { lireMeta, ecrireMeta, supprimerMeta } from "./meta.js"; // Petites informations de fonctionnement

const CLE_SIM = "ussd_sim"; // Clé (table meta) de la SIM choisie

// Vérifie une SIM { id, emplacement, nom } et renvoie sa forme nettoyée. Lance ErreurValidation sinon.
export function validerSim(sim) { // Reçoit la SIM
  if (!sim || !Number.isInteger(sim.id) || sim.id < 0) throw new ErreurValidation({ sim: "SIM inconnue : détectez les SIM puis choisissez-en une." }); // Identifiant Android invalide
  if (!Number.isInteger(sim.emplacement) || sim.emplacement < 1 || sim.emplacement > 4) throw new ErreurValidation({ sim: "Emplacement de SIM invalide." }); // Emplacement invalide
  return { id: sim.id, emplacement: sim.emplacement, nom: String(sim.nom ?? "").slice(0, 60) }; // Forme nettoyée
} // Fin de validerSim

// SIM choisie (ou null : SIM par défaut du téléphone).
export async function lireSimChoisie(base) { // Reçoit la base
  const texte = await lireMeta(base, CLE_SIM); // Valeur gardée
  if (texte === null) return null; // Aucun choix
  try { return validerSim(JSON.parse(texte)); } catch { return null; } // Valeur abîmée : comme si rien n'était choisi
} // Fin de lireSimChoisie

// Enregistre la SIM choisie ; avec null, revient à la SIM par défaut du téléphone. Renvoie la SIM enregistrée.
export async function ecrireSimChoisie(base, sim) { // Reçoit la base et la SIM
  if (sim === null) { await supprimerMeta(base, CLE_SIM); return null; } // Retour à la SIM par défaut
  const propre = validerSim(sim); // Vérifie
  await ecrireMeta(base, CLE_SIM, JSON.stringify(propre)); // Enregistre
  return propre; // SIM enregistrée
} // Fin de ecrireSimChoisie

// Envoie un code USSD complet sur la SIM choisie (ou la SIM par défaut). « ussd » = src/platform/ussd.js ou faux de test.
export async function envoyerSurSimChoisie(base, ussd, code) { // Reçoit la base, l'accès USSD et le code complet
  const sim = await lireSimChoisie(base); // SIM choisie
  return sim ? ussd.envoyerCode(code, sim) : ussd.envoyerCode(code); // Sans choix : appel inchangé
} // Fin de envoyerSurSimChoisie
