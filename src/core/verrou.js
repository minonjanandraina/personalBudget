// Verrouillage de l'application par code PIN : activation, vérification, blocage progressif, code de secours.
// Le PIN n'est JAMAIS gardé en clair : seule une empreinte salée (SHA-256 répété 10 000 fois) est enregistrée dans la table « meta ».
// ATTENTION : c'est un verrou d'ACCÈS à l'écran. Les données de la base ne sont pas chiffrées ; quelqu'un qui lirait le fichier de la base
// (téléphone « rooté », sauvegarde JSON) n'est pas arrêté par ce PIN. Les clés « verrou_* » ne sont pas dans la sauvegarde JSON.
import { sha256Hex } from "./sha256.js"; // Empreinte SHA-256 (écrite à la main, fonctionne partout)
import { lireMeta, ecrireMeta, supprimerMeta } from "./meta.js"; // Petites informations de fonctionnement
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs expliquées à l'utilisateur

const CLE_EMPREINTE = "verrou_pin_hash"; // Empreinte du PIN
const CLE_SEL = "verrou_pin_sel"; // Sel du PIN (texte aléatoire propre à ce téléphone)
const CLE_SECOURS_EMPREINTE = "verrou_secours_hash"; // Empreinte du code de secours
const CLE_SECOURS_SEL = "verrou_secours_sel"; // Sel du code de secours
const CLE_ECHECS = "verrou_echecs"; // Nombre d'échecs de suite
const CLE_BLOQUE = "verrou_bloque_jusqua"; // Date (ISO) jusqu'à laquelle les essais sont bloqués
export const CLES_VERROU = [CLE_EMPREINTE, CLE_SEL, CLE_SECOURS_EMPREINTE, CLE_SECOURS_SEL, CLE_ECHECS, CLE_BLOQUE]; // Toutes les clés (pour tout effacer)
const ITERATIONS = 10000; // Nombre de répétitions du calcul d'empreinte (ralentit les essais en série)
const DELAIS_SECONDES = { 5: 30, 6: 60, 7: 300 }; // Blocage après le 5e, 6e, 7e échec de suite
const DELAI_MAXIMUM_SECONDES = 1800; // À partir du 8e échec : 30 minutes
const ECHECS_SANS_BLOCAGE = 4; // Les 4 premiers échecs ne bloquent pas
const ALPHABET_SECOURS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 caractères sans ambiguïté (ni 0/O, ni 1/I/L)

// Octets aléatoires (par défaut : générateur sûr du téléphone/navigateur ; remplaçable dans les tests).
export function octetsAleatoires(nombre) { // Reçoit le nombre d'octets voulus
  const octets = new Uint8Array(nombre); // Tableau à remplir
  globalThis.crypto.getRandomValues(octets); // Remplit avec un hasard sûr
  return octets; // Renvoie les octets
} // Fin de octetsAleatoires

// Empreinte d'un secret avec son sel, répétée pour ralentir les essais en série.
function empreinte(secret, sel) { // Reçoit le secret et le sel
  let valeur = sha256Hex(`${sel}:${secret}`); // Premier calcul
  for (let i = 0; i < ITERATIONS; i += 1) valeur = sha256Hex(`${valeur}${sel}`); // Répétitions
  return valeur; // Empreinte finale
} // Fin de empreinte

// Sel aléatoire (32 caractères hexadécimaux).
const nouveauSel = (alea) => [...alea(16)].map((o) => o.toString(16).padStart(2, "0")).join(""); // Octets -> texte

// Code de secours lisible : « XXXX-XXXX-XXXX » (12 caractères tirés sans biais).
export function genererCodeSecours(alea = octetsAleatoires) { // Reçoit le générateur de hasard
  let code = ""; // Code en construction
  while (code.length < 12) { // Jusqu'à 12 caractères
    for (const o of alea(24)) { // Tire des octets
      if (o < 248 && code.length < 12) code += ALPHABET_SECOURS[o % ALPHABET_SECOURS.length]; // 248 = 8 x 31 : pas de biais
    } // Fin du tirage
  } // Fin de la boucle
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`; // Groupes de 4
} // Fin de genererCodeSecours

// Remet un code de secours saisi à la forme enregistrée (majuscules, sans espaces ni tirets).
const normaliserCode = (code) => String(code ?? "").toUpperCase().replace(/[\s-]/g, ""); // Texte propre

// Vérifie le format du PIN (4 à 8 chiffres). Lance ErreurValidation sinon.
export function validerFormatPin(pin, champ = "pin") { // Reçoit le texte saisi et le nom du champ
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) throw new ErreurValidation({ [champ]: "Le PIN doit contenir de 4 à 8 chiffres." }); // Format invalide
} // Fin de validerFormatPin

// Durée en phrase : « 45 secondes », « 2 min 10 s ».
export function formaterDuree(secondes) { // Reçoit des secondes
  if (secondes < 60) return `${secondes} seconde${secondes > 1 ? "s" : ""}`; // Moins d'une minute
  const minutes = Math.floor(secondes / 60); // Minutes entières
  const reste = secondes % 60; // Secondes restantes
  return reste === 0 ? `${minutes} min` : `${minutes} min ${reste} s`; // Minutes et secondes
} // Fin de formaterDuree

// Vrai si un PIN de verrouillage est enregistré.
export async function verrouActif(base) { // Reçoit la base
  return (await lireMeta(base, CLE_EMPREINTE)) !== null; // Présence de l'empreinte
} // Fin de verrouActif

// Secondes restantes avant de pouvoir réessayer (0 si les essais sont permis).
export async function secondesDeBlocage(base, maintenant = new Date()) { // Reçoit la base et l'heure
  const jusqua = await lireMeta(base, CLE_BLOQUE); // Fin du blocage
  if (jusqua === null) return 0; // Pas de blocage
  return Math.max(0, Math.ceil((new Date(jusqua).getTime() - maintenant.getTime()) / 1000)); // Temps restant
} // Fin de secondesDeBlocage

// Refuse l'essai pendant un blocage.
async function refuserSiBloque(base, maintenant) { // Reçoit la base et l'heure
  const reste = await secondesDeBlocage(base, maintenant); // Temps restant
  if (reste > 0) throw new ErreurMetier(`Trop d'essais. Réessayez dans ${formaterDuree(reste)}.`); // Message avec la durée
} // Fin de refuserSiBloque

// Note un échec : augmente le compteur et bloque les essais selon le barème. Renvoie le message à montrer.
async function noterEchec(base, maintenant, objet) { // Reçoit la base, l'heure et ce qui était saisi (« PIN » ou « code de secours »)
  const echecs = Number(await lireMeta(base, CLE_ECHECS) ?? 0) + 1; // Nouveau nombre d'échecs de suite
  await ecrireMeta(base, CLE_ECHECS, echecs); // Enregistre
  if (echecs <= ECHECS_SANS_BLOCAGE) { // Pas encore de blocage
    const restants = ECHECS_SANS_BLOCAGE + 1 - echecs; // Essais libres restants
    return `${objet} incorrect. Il reste ${restants} essai${restants > 1 ? "s" : ""} avant un blocage.`; // Message
  } // Fin du cas sans blocage
  const secondes = DELAIS_SECONDES[echecs] ?? DELAI_MAXIMUM_SECONDES; // Durée du blocage
  await ecrireMeta(base, CLE_BLOQUE, new Date(maintenant.getTime() + secondes * 1000).toISOString()); // Date de fin du blocage
  return `${objet} incorrect. Réessayez dans ${formaterDuree(secondes)}.`; // Message
} // Fin de noterEchec

// Après une réussite : plus d'échecs ni de blocage.
async function oublierEchecs(base) { // Reçoit la base
  await supprimerMeta(base, CLE_ECHECS); // Remet le compteur à zéro
  await supprimerMeta(base, CLE_BLOQUE); // Lève le blocage
} // Fin de oublierEchecs

// Enregistre l'empreinte d'un nouveau PIN.
async function ecrirePin(base, pin, alea) { // Reçoit la base, le PIN et le générateur
  const sel = nouveauSel(alea); // Nouveau sel
  await ecrireMeta(base, CLE_SEL, sel); // Enregistre le sel
  await ecrireMeta(base, CLE_EMPREINTE, empreinte(pin, sel)); // Enregistre l'empreinte
} // Fin de ecrirePin

// Fabrique, enregistre (empreinte seulement) et renvoie un nouveau code de secours en clair (à montrer UNE fois).
async function ecrireCodeSecours(base, alea) { // Reçoit la base et le générateur
  const code = genererCodeSecours(alea); // Nouveau code
  const sel = nouveauSel(alea); // Son sel
  await ecrireMeta(base, CLE_SECOURS_SEL, sel); // Enregistre le sel
  await ecrireMeta(base, CLE_SECOURS_EMPREINTE, empreinte(normaliserCode(code), sel)); // Enregistre l'empreinte
  return code; // Le code en clair n'est renvoyé qu'ici
} // Fin de ecrireCodeSecours

// Active le verrou avec un PIN. Renvoie le code de secours (à faire noter par l'utilisateur).
export async function activerVerrou(base, pin, alea = octetsAleatoires) { // Reçoit la base, le PIN et le générateur
  validerFormatPin(pin); // Format
  if (await verrouActif(base)) throw new ErreurMetier("Le verrouillage est déjà activé."); // Déjà actif
  await ecrirePin(base, pin, alea); // Enregistre le PIN
  await oublierEchecs(base); // Repart à zéro
  return ecrireCodeSecours(base, alea); // Fabrique le code de secours
} // Fin de activerVerrou

// Vérifie un PIN. Renvoie vrai s'il est bon ; sinon lance ErreurMetier (essais restants ou durée de blocage).
export async function verifierPin(base, pin, maintenant = new Date()) { // Reçoit la base, le PIN et l'heure
  await refuserSiBloque(base, maintenant); // Essais bloqués ?
  const sel = await lireMeta(base, CLE_SEL); // Sel
  const attendu = await lireMeta(base, CLE_EMPREINTE); // Empreinte attendue
  if (sel === null || attendu === null) return true; // Pas de verrou : rien à vérifier
  if (empreinte(String(pin ?? ""), sel) === attendu) { await oublierEchecs(base); return true; } // Bon PIN
  throw new ErreurMetier(await noterEchec(base, maintenant, "PIN")); // Mauvais PIN
} // Fin de verifierPin

// Change le PIN (demande l'ancien).
export async function changerPin(base, ancienPin, nouveauPin, alea = octetsAleatoires, maintenant = new Date()) { // Reçoit la base, l'ancien et le nouveau PIN
  validerFormatPin(nouveauPin, "nouveauPin"); // Format du nouveau PIN
  await verifierPin(base, ancienPin, maintenant); // Vérifie l'ancien
  await ecrirePin(base, nouveauPin, alea); // Enregistre le nouveau
} // Fin de changerPin

// Désactive le verrou (demande le PIN) et efface toute trace.
export async function desactiverVerrou(base, pin, maintenant = new Date()) { // Reçoit la base, le PIN et l'heure
  await verifierPin(base, pin, maintenant); // Vérifie le PIN
  for (const cle of CLES_VERROU) await supprimerMeta(base, cle); // Efface les clés
} // Fin de desactiverVerrou

// Fabrique un nouveau code de secours (demande le PIN). L'ancien code ne marche plus.
export async function regenererCodeSecours(base, pin, alea = octetsAleatoires, maintenant = new Date()) { // Reçoit la base, le PIN, le générateur et l'heure
  await verifierPin(base, pin, maintenant); // Vérifie le PIN
  return ecrireCodeSecours(base, alea); // Nouveau code
} // Fin de regenererCodeSecours

// PIN oublié : avec le code de secours, définit un nouveau PIN et renvoie un NOUVEAU code de secours (l'ancien est périmé).
export async function reinitialiserAvecCodeSecours(base, code, nouveauPin, alea = octetsAleatoires, maintenant = new Date()) { // Reçoit la base, le code, le nouveau PIN, le générateur et l'heure
  validerFormatPin(nouveauPin, "nouveauPin"); // Format du nouveau PIN
  await refuserSiBloque(base, maintenant); // Essais bloqués ?
  const sel = await lireMeta(base, CLE_SECOURS_SEL); // Sel du code de secours
  const attendu = await lireMeta(base, CLE_SECOURS_EMPREINTE); // Empreinte attendue
  if (sel === null || attendu === null) throw new ErreurMetier("Aucun code de secours n'est enregistré."); // Rien à comparer
  if (empreinte(normaliserCode(code), sel) !== attendu) throw new ErreurMetier(await noterEchec(base, maintenant, "Code de secours")); // Mauvais code
  await ecrirePin(base, nouveauPin, alea); // Enregistre le nouveau PIN
  await oublierEchecs(base); // Repart à zéro
  return ecrireCodeSecours(base, alea); // Nouveau code de secours
} // Fin de reinitialiserAvecCodeSecours
