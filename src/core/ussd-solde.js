// Consultation du solde Mobile Money par USSD : code réglable, PIN demandé à chaque consultation (jamais enregistré), enregistrement de la réponse en SoldeMM.
// Aucun appel à Capacitor : l'accès au téléphone (« ussd ») est fourni par src/platform/ussd.js, ou par un faux dans les tests.
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs expliquées à l'utilisateur
import { analyserReponseUssd } from "./ussd-mm.js"; // Lecture du solde dans la réponse
import { creerSolde, soldeMMDisponible } from "./soldes.js"; // Soldes Mobile Money
import { lireMeta, ecrireMeta, supprimerMeta } from "./meta.js"; // Petites informations de fonctionnement

export const CODE_SOLDE_DEFAUT = "#144*5*3*{pin}*#"; // Code par défaut ({pin} = PIN Mobile Money saisi à chaque consultation) ; le « # » final est à vérifier sur le téléphone
const CLE_CODE = "ussd_code_solde"; // Clé (table meta) du code choisi par l'utilisateur

// Vérifie le format du PIN Mobile Money (4 à 8 chiffres). Lance ErreurValidation sinon.
export function validerPin(pin) { // Reçoit le texte saisi
  if (!/^\d{4,8}$/.test(String(pin ?? ""))) throw new ErreurValidation({ pin: "Le PIN doit contenir de 4 à 8 chiffres." }); // Format invalide
} // Fin de validerPin

// Vérifie le code de consultation. Lance ErreurValidation (champ « code ») s'il est invalide ; renvoie le code nettoyé.
export function validerCodeSolde(code) { // Reçoit le texte saisi
  const propre = String(code ?? "").trim(); // Sans espaces autour
  if (!propre.includes("{pin}")) throw new ErreurValidation({ code: "Le code doit contenir {pin} : le PIN Mobile Money est demandé à chaque consultation, jamais enregistré." }); // PIN obligatoire
  if (!/^[#*][0-9*#]{2,98}#$/.test(propre.replaceAll("{pin}", "0")) || propre.length > 100) throw new ErreurValidation({ code: "Le code doit commencer par # ou *, finir par # et ne contenir que des chiffres, des * et des # (et {pin})." }); // Forme invalide (seule variable permise : {pin})
  return propre; // Code valide
} // Fin de validerCodeSolde

// Code de consultation en vigueur (celui de l'utilisateur, ou le code par défaut).
export async function lireCodeSolde(base) { // Reçoit la base
  return (await lireMeta(base, CLE_CODE)) ?? CODE_SOLDE_DEFAUT; // Code enregistré ou code par défaut
} // Fin de lireCodeSolde

// Enregistre le code de consultation choisi. Renvoie le code enregistré.
export async function ecrireCodeSolde(base, code) { // Reçoit la base et le code
  const propre = validerCodeSolde(code); // Vérifie
  await ecrireMeta(base, CLE_CODE, propre); // Enregistre
  return propre; // Code enregistré
} // Fin de ecrireCodeSolde

// Revient au code par défaut.
export async function reinitialiserCodeSolde(base) { // Reçoit la base
  await supprimerMeta(base, CLE_CODE); // Oublie le code personnalisé
} // Fin de reinitialiserCodeSolde

// Enregistre une réponse USSD comme SoldeMM à la date donnée. Renvoie { balance, enregistre }.
// Sauf « forcer », un solde identique au dernier, sans dépense enregistrée depuis, n'est pas ré-enregistré.
export async function enregistrerReponse(base, texte, dateIso, { forcer = false } = {}) { // Reçoit la base, la réponse et sa date
  const balance = analyserReponseUssd(texte); // Solde lu dans la réponse
  if (balance === null) throw new ErreurMetier("La réponse de Mobile Money ne contient pas de solde."); // Réponse inattendue
  if (!forcer) { // Évite les doublons inutiles
    const mm = await soldeMMDisponible(base); // Situation actuelle
    if (mm && mm.dernierSolde === balance && mm.depensesDepuis === 0) return { balance, enregistre: false }; // Rien n'a changé
  } // Fin du contrôle
  await creerSolde(base, { datetime: dateIso, balance }, new Date(Math.max(Date.now(), new Date(dateIso).getTime()))); // Enregistre le solde
  return { balance, enregistre: true }; // Résultat
} // Fin de enregistrerReponse

// Consulte le solde maintenant (avec le PIN Mobile Money saisi) et l'enregistre. Le PIN n'est gardé nulle part : il n'existe que le temps de l'envoi.
export async function consulterEtEnregistrer(base, ussd, { pin, forcer = true, maintenant = new Date() } = {}) { // Reçoit la base, l'accès USSD et le PIN saisi
  validerPin(pin); // Format du PIN
  const code = (await lireCodeSolde(base)).replaceAll("{pin}", pin); // Code complet avec le PIN
  const texte = await ussd.envoyerCode(code); // Envoie l'USSD et attend la réponse
  if (analyserReponseUssd(texte) === null) throw new ErreurMetier(`Réponse inattendue de Mobile Money : « ${String(texte).slice(0, 200)} ». Vérifiez votre PIN et le code USSD.`); // Explique (sans répéter le PIN)
  return enregistrerReponse(base, texte, maintenant.toISOString(), { forcer }); // Enregistre le solde
} // Fin de consulterEtEnregistrer
