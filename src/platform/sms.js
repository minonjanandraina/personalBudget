// Lecture des SMS Orange Money. Sur Android : plugin Kotlin « SmsOm » (boîte de réception du téléphone). Dans le navigateur : SMS d'exemple simulés.
// ATTENTION : la partie Android ne peut pas être testée sous Windows ; elle se vérifie dans l'APK sur le téléphone.
import { Capacitor, registerPlugin } from "@capacitor/core"; // Outils Capacitor : savoir si on tourne dans l'APK, déclarer le plugin
import { ErreurMetier } from "../core/erreurs.js"; // Erreur expliquée à l'utilisateur
import { SMS_EXEMPLES } from "./sms-exemples.js"; // SMS d'exemple pour le navigateur

const SmsOm = registerPlugin("SmsOm"); // Plugin Kotlin (android/app/src/main/java/org/minonja/volako/SmsOmPlugin.kt)

// Vrai si l'application peut lire les SMS sans rien demander à l'utilisateur (permission déjà accordée).
// Le navigateur renvoie toujours faux : la synchronisation automatique à l'ouverture n'existe que sur le téléphone.
export async function autoriseSansDemander() { // Aucun paramètre
  if (!Capacitor.isNativePlatform()) return false; // Navigateur : pas de synchronisation automatique
  try { return (await SmsOm.checkPermissions()).sms === "granted"; } catch { return false; } // Interroge Android (faux en cas de problème)
} // Fin de autoriseSansDemander

// Lit les SMS de l'expéditeur reçus à partir de « depuis » (date ISO). Renvoie [{ corps, date }] (date ISO).
export async function lireSmsOM({ expediteur, depuis }) { // Reçoit le nom de l'expéditeur et la date de départ
  if (!Capacitor.isNativePlatform()) return SMS_EXEMPLES(new Date()); // Navigateur : SMS d'exemple datés de maintenant
  let etat = (await SmsOm.checkPermissions()).sms; // État de la permission de lire les SMS
  if (etat !== "granted") etat = (await SmsOm.requestPermissions()).sms; // La demande à l'utilisateur
  if (etat !== "granted") throw new ErreurMetier("Permission refusée : Volako ne peut pas lire vos SMS Orange Money. Autorisez « SMS » dans les paramètres Android de l'application."); // Refus
  const { messages } = await SmsOm.lireSms({ expediteur, depuis: new Date(depuis).getTime() }); // Lit la boîte de réception (date en millisecondes)
  return messages.map((m) => ({ corps: m.corps, date: new Date(m.date).toISOString() })); // Convertit les dates en ISO
} // Fin de lireSmsOM
