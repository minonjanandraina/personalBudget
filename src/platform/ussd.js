// Envoi de codes USSD (consultation du solde Mobile Money, opérations dynamiques). Sur Android : plugin Kotlin « UssdMm » (API téléphonie d'Android).
// Le PIN Mobile Money n'est JAMAIS enregistré : l'écran le demande à chaque envoi, le code arrive ici déjà complet, et rien n'est gardé.
// Dans le navigateur : simulation (réponse d'exemple).
// ATTENTION : la partie Android ne peut pas être testée sous Windows ; elle se vérifie dans l'APK sur le téléphone.
import { Capacitor, registerPlugin } from "@capacitor/core"; // Outils Capacitor : savoir si on tourne dans l'APK, déclarer le plugin
import { ErreurMetier } from "../core/erreurs.js"; // Erreur expliquée à l'utilisateur

const UssdMm = registerPlugin("UssdMm"); // Plugin Kotlin (android/app/src/main/java/org/minonja/volako/UssdMmPlugin.kt)
const natif = () => Capacitor.isNativePlatform(); // Vrai dans l'APK

// Demande les permissions « téléphone » si besoin. Renvoie vrai si elles sont accordées.
export async function demanderPermission() { // Aucun paramètre
  if (!natif()) return true; // Navigateur : rien à demander
  if ((await UssdMm.checkPermissions()).ussd === "granted") return true; // Déjà accordée
  return (await UssdMm.requestPermissions({ permissions: ["ussd"] })).ussd === "granted"; // Demande à l'utilisateur
} // Fin de demanderPermission

// Envoie un code USSD COMPLET (PIN déjà inséré). Renvoie le texte de la réponse de Mobile Money.
export async function envoyerCode(code) { // Reçoit le code complet
  if (!natif()) return /^#144\*5\*3\*/.test(code) ? "Le solde de votre compte est de 202316 AR. Achetez du crédit via Mobile Money et bénéficiez de 20% de bonus." : "Simulation : un code USSD serait envoyé sur le téléphone."; // Navigateur : rien n'est envoyé (la réponse d'exemple ne répète jamais le code, donc jamais le PIN)
  try { return (await UssdMm.envoyerCode({ code })).texte; } catch (e) { throw new ErreurMetier(e?.message ?? "Envoi impossible."); } // Android
} // Fin de envoyerCode
