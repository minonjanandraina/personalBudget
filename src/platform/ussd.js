// Consultation USSD du solde Orange Money. Sur Android : plugin Kotlin « UssdOm » (PIN chiffré par le coffre Android, USSD, tâche toutes les heures).
// Dans le navigateur : simulation (réponse d'exemple ; le PIN y est gardé SANS chiffrement dans le localStorage, pour le développement seulement).
// ATTENTION : la partie Android ne peut pas être testée sous Windows ; elle se vérifie dans l'APK sur le téléphone.
import { Capacitor, registerPlugin } from "@capacitor/core"; // Outils Capacitor : savoir si on tourne dans l'APK, déclarer le plugin
import { ErreurMetier } from "../core/erreurs.js"; // Erreur expliquée à l'utilisateur

const UssdOm = registerPlugin("UssdOm"); // Plugin Kotlin (android/app/src/main/java/org/minonja/volako/UssdOmPlugin.kt)
const natif = () => Capacitor.isNativePlatform(); // Vrai dans l'APK

// Lecture/écriture protégées du localStorage simulé (peut être indisponible).
const lireSimule = (cle) => { try { return localStorage.getItem(`volako-ussd-${cle}`); } catch { return null; } }; // Lit une valeur simulée
const ecrireSimule = (cle, valeur) => { try { if (valeur === null) localStorage.removeItem(`volako-ussd-${cle}`); else localStorage.setItem(`volako-ussd-${cle}`, valeur); } catch { /* sans importance en simulation */ } }; // Écrit ou efface

// État : { pinDefini, actif, permission, code } (code = forme du code composé, PIN masqué).
export async function etat() { // Aucun paramètre
  if (!natif()) return { pinDefini: lireSimule("pin") !== null, actif: lireSimule("actif") === "1", permission: true, code: "#144*5*3*••••*#" }; // Navigateur : état simulé
  return UssdOm.etatUssd(); // Android : état réel
} // Fin de etat

// Enregistre le PIN (chiffré sur Android).
export async function definirPin(pin) { // Reçoit le PIN en chiffres
  if (!natif()) { ecrireSimule("pin", pin); return; } // Navigateur : simulation
  try { await UssdOm.definirPin({ pin }); } catch (e) { throw new ErreurMetier(e?.message ?? "Enregistrement du PIN impossible."); } // Android
} // Fin de definirPin

// Efface le PIN (et arrête la consultation automatique).
export async function effacerPin() { // Aucun paramètre
  if (!natif()) { ecrireSimule("pin", null); ecrireSimule("actif", null); return; } // Navigateur : simulation
  await UssdOm.effacerPin(); // Android
} // Fin de effacerPin

// Demande les permissions « téléphone » si besoin. Renvoie vrai si elles sont accordées.
export async function demanderPermission() { // Aucun paramètre
  if (!natif()) return true; // Navigateur : rien à demander
  if ((await UssdOm.checkPermissions()).ussd === "granted") return true; // Déjà accordée
  return (await UssdOm.requestPermissions({ permissions: ["ussd"] })).ussd === "granted"; // Demande à l'utilisateur
} // Fin de demanderPermission

// Interroge le solde maintenant. Renvoie le texte de la réponse.
export async function consulter() { // Aucun paramètre
  if (!natif()) return "Le solde de votre compte est de 202316 AR. Achetez du crédit via OM et bénéficiez de 20% de bonus."; // Navigateur : réponse d'exemple
  try { return (await UssdOm.consulterSolde()).texte; } catch (e) { throw new ErreurMetier(e?.message ?? "Consultation impossible."); } // Android
} // Fin de consulter

// Active ou arrête la consultation automatique toutes les heures en arrière-plan.
export async function programmerAuto(actif) { // Reçoit vrai/faux
  if (!natif()) { ecrireSimule("actif", actif ? "1" : null); return; } // Navigateur : simulation
  try { await UssdOm.programmerAuto({ actif }); } catch (e) { throw new ErreurMetier(e?.message ?? "Programmation impossible."); } // Android
} // Fin de programmerAuto

// Reprend les réponses reçues en arrière-plan : { reponses: [{ texte, date (ms) }], arret: raison ou null }.
export async function recupererReponses() { // Aucun paramètre
  if (!natif()) return { reponses: [], arret: null }; // Navigateur : jamais d'arrière-plan
  try { return await UssdOm.recupererReponses(); } catch { return { reponses: [], arret: null }; } // Android (silencieux en cas de problème)
} // Fin de recupererReponses

// Envoie un code USSD préparé par l'application (opérations dynamiques). « {pin} » reste tel quel : il est remplacé côté Android par le PIN Orange Money (chiffré).
// Renvoie le texte de la réponse d'Orange Money.
export async function envoyerCode(code) { // Reçoit le code, avec éventuellement {pin}
  if (!natif()) return `Simulation : le code ${String(code).replaceAll("{pin}", "••••")} serait envoyé sur le téléphone.`; // Navigateur : rien n'est envoyé
  try { return (await UssdOm.envoyerCode({ code })).texte; } catch (e) { throw new ErreurMetier(e?.message ?? "Envoi impossible."); } // Android
} // Fin de envoyerCode
