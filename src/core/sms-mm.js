// Analyse d'un SMS Mobile Money avec des MODÈLES réglables (sprint 17) : chaque modèle décrit un type de SMS par un gabarit (voir modeles-sms-defaut.js).
// Les SMS reçus ne contiennent PAS le budget : la transaction créée est toujours « non classée » (voir import-sms.js).
// Sens d'un modèle : « debit » (dépense : crée une transaction), « credit » (argent reçu : seul le solde est gardé), « ignorer » (aucune transaction, mais le solde est gardé).
// Aucune dépendance Android ni base de données : testable sous Windows. Les modèles viennent de la base (modeles-sms.js) ou, par défaut, de modeles-sms-defaut.js.
import { ErreurValidation } from "./erreurs.js"; // Erreur affichée sous le champ
import { formaterMontant } from "./format.js"; // Affichage des montants dans la note
import { compilerGabarit, lireAvecGabarit } from "./gabarit.js"; // Conversion d'une ligne de gabarit et lecture
import { MODELES_PAR_DEFAUT, VARIABLES_SMS, SENS_SMS } from "./modeles-sms-defaut.js"; // Modèles et variables

const NOMS_VARIABLES = Object.keys(VARIABLES_SMS); // Noms des variables permises
const OBLIGATOIRES_PAR_SENS = { debit: ["montant_debit", "ref_trx"], credit: ["montant_credit", "ref_trx"], ignorer: [] }; // Variables qui rendent une ligne obligatoire
const LIGNES_MAX = 12; // Nombre de lignes d'un gabarit
const ARRONDI_HAUT = ["montant_debit", "frais"]; // Sorties d'argent : centimes arrondis vers le haut (prudence) ; le solde et les entrées sont arrondis vers le bas
const FUSEAU_MS = 3 * 3600 * 1000; // Madagascar : UTC+3, sans heure d'été

// Retire les accents et les majuscules : « Dépôt » et « depot » se valent. Sert à comparer, pas à afficher.
export function normaliser(texte) { // Reçoit un texte
  return String(texte ?? "").normalize("NFD").replace(/\p{M}/gu, ""); // Sépare les lettres de leurs accents puis retire les accents
} // Fin de normaliser

// Lignes d'un gabarit (lignes vides retirées).
export function lignesDuGabarit(gabarit) { // Reçoit le gabarit
  return String(gabarit ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== ""); // Une entrée par ligne non vide
} // Fin de lignesDuGabarit

const cache = new Map(); // Gabarits déjà compilés : ligne -> expression régulière (ou erreur)

// Compile une ligne (avec mémoire). Lance ErreurValidation si elle est invalide.
function compilerLigne(ligne) { // Reçoit la ligne
  if (!cache.has(ligne)) { // Pas encore compilée
    try { cache.set(ligne, compilerGabarit(normaliser(ligne), { variables: NOMS_VARIABLES, types: VARIABLES_SMS })); } catch (e) { cache.set(ligne, e); } // Garde le résultat ou l'erreur
    if (cache.size > 500) cache.delete(cache.keys().next().value); // Mémoire bornée
  } // Fin de la compilation
  const resultat = cache.get(ligne); // Résultat gardé
  if (resultat instanceof Error) throw resultat; // Ligne invalide
  return resultat; // Expression régulière
} // Fin de compilerLigne

// Une ligne est obligatoire si elle n'a aucune variable (texte repère) ou si elle donne le montant ou la référence du sens du modèle.
function ligneObligatoire(regex, sens) { // Reçoit l'expression de la ligne et le sens
  const noms = Object.keys(regex.types); // Variables de la ligne
  return noms.length === 0 || noms.some((n) => OBLIGATOIRES_PAR_SENS[sens].includes(n)); // Obligatoire ?
} // Fin de ligneObligatoire

// Compile un modèle : { lignes: [{ regex, obligatoire }] }. Lance ErreurValidation (champ « gabarit ») si le gabarit est invalide.
function compilerModele(modele) { // Reçoit le modèle
  const lignes = lignesDuGabarit(modele.gabarit); // Lignes du gabarit
  const refuser = (message) => { throw new ErreurValidation({ gabarit: message }); }; // Erreur sous le champ gabarit
  if (lignes.length === 0) refuser("Écrivez au moins une ligne : le texte à repérer dans le SMS, avec les valeurs à lire entre accolades."); // Gabarit vide
  if (lignes.length > LIGNES_MAX) refuser(`Un modèle est limité à ${LIGNES_MAX} lignes.`); // Trop de lignes
  const compilees = lignes.map((ligne, i) => { // Compile chaque ligne
    try { const regex = compilerLigne(ligne); return { regex, obligatoire: ligneObligatoire(regex, modele.sens) }; } // Ligne valide
    catch (e) { if (e instanceof ErreurValidation) refuser(`Ligne ${i + 1} : ${Object.values(e.erreurs)[0]}`); throw e; } // Ligne invalide : numéro de la ligne dans le message
  }); // Fin de la compilation
  const presentes = new Set(compilees.flatMap((l) => Object.keys(l.regex.types))); // Variables présentes dans le gabarit
  for (const nom of OBLIGATOIRES_PAR_SENS[modele.sens] ?? []) if (!presentes.has(nom)) refuser(`Un modèle « ${SENS_SMS[modele.sens]} » doit contenir {${nom}}.`); // Variable indispensable absente
  if (!compilees.some((l) => l.obligatoire)) refuser("Ajoutez une ligne de texte sans variable (un mot ou une phrase propre à ce SMS), sinon ce modèle reconnaîtrait n'importe quel SMS."); // Modèle « ignorer » trop vague
  return { lignes: compilees }; // Modèle compilé
} // Fin de compilerModele

// Vérifie un modèle { nom, sens, gabarit, note } et renvoie sa forme nettoyée. Lance ErreurValidation (une erreur par champ).
export function validerModeleSms(modele) { // Reçoit le modèle saisi
  const erreurs = {}; // Erreurs par champ
  const nom = String(modele?.nom ?? "").trim(); // Nom sans espaces autour
  if (nom === "" || nom.length > 60) erreurs.nom = "Le nom doit faire de 1 à 60 caractères."; // Nom invalide
  const sens = String(modele?.sens ?? ""); // Sens
  if (!(sens in SENS_SMS)) erreurs.sens = "Choisissez ce que fait ce modèle."; // Sens inconnu
  const gabarit = lignesDuGabarit(modele?.gabarit).join("\n"); // Gabarit nettoyé (une ligne par information)
  if (!erreurs.sens) { try { compilerModele({ sens, gabarit }); } catch (e) { if (e instanceof ErreurValidation) Object.assign(erreurs, e.erreurs); else throw e; } } // Gabarit invalide
  if (gabarit.length > 1500) erreurs.gabarit = "Le gabarit est trop long."; // Taille maximale
  const note = String(modele?.note ?? "").trim(); // Libellé de la note
  if (note.length > 200) erreurs.note = "La note est limitée à 200 caractères."; // Trop long
  for (const [, variable] of note.matchAll(/\{([^{}]*)\}/g)) if (!NOMS_VARIABLES.includes(variable)) erreurs.note = `Variable inconnue dans la note : {${variable}}.`; // Variable non permise
  if (sens !== "debit" && note !== "") erreurs.note = "La note ne sert que pour une dépense."; // Les autres sens ne créent pas de transaction
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse
  return { nom, sens, gabarit, note: note === "" ? null : note }; // Forme nettoyée
} // Fin de validerModeleSms

// Convertit une date écrite dans un SMS (« 05/10/2026 14:30 », « 2026-10-05 14:30:00 ») en instant ISO UTC (heure de Madagascar). Renvoie null si elle est invalide.
export function analyserDate(texte) { // Reçoit le texte de la date
  const m = String(texte ?? "").trim().match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); // Découpe
  if (!m) return null; // Format inconnu
  const anneeEnPremier = m[1].length === 4; // aaaa-mm-jj ou jj/mm/aaaa
  let [annee, mois, jour] = anneeEnPremier ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]]; // Année, mois, jour (texte)
  annee = Number(annee); mois = Number(mois); jour = Number(jour); // Nombres
  if (annee < 100) annee += 2000; // Année sur deux chiffres
  const [h, mi, s] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)]; // Heure locale
  if (annee < 2000 || mois < 1 || mois > 12 || jour < 1 || jour > 31 || h > 23 || mi > 59 || s > 59) return null; // Valeurs impossibles
  const instant = new Date(Date.UTC(annee, mois - 1, jour, h, mi, s) - FUSEAU_MS); // Heure de Madagascar -> UTC
  const verif = new Date(instant.getTime() + FUSEAU_MS); // Retour à l'heure locale pour vérifier
  if (verif.getUTCMonth() !== mois - 1 || verif.getUTCDate() !== jour) return null; // 31 février, etc.
  return instant.toISOString(); // Instant ISO UTC
} // Fin de analyserDate

// Libellé de la transaction : note du modèle avec ses variables remplacées. Si une variable manque dans le SMS, on garde le nom du modèle.
function fabriquerNote(modele, valeurs, frais) { // Reçoit le modèle, les valeurs lues et les frais
  let manque = false; // Une variable de la note est-elle absente du SMS ?
  const note = modele.note ? modele.note.replace(/\{(\w+)\}/g, (_, nom) => { // Remplace chaque variable
    const valeur = valeurs[nom]; // Valeur lue
    if (valeur === undefined) { manque = true; return ""; } // Absente
    return VARIABLES_SMS[nom] === "nombre" ? formaterMontant(valeur) : String(valeur); // Montant mis en forme, ou texte tel quel
  }) : ""; // Sans note : nom du modèle
  let texte = !modele.note || manque ? modele.nom : note; // Note finale
  if (frais > 0) texte += ` (dont ${formaterMontant(frais)} de frais)`; // Rappelle les frais compris dans le montant
  return texte.slice(0, 200); // Limite de la base
} // Fin de fabriquerNote

// Analyse un SMS avec les modèles donnés (par défaut : ceux livrés avec l'application), dans l'ordre. Le premier modèle dont les lignes obligatoires sont toutes trouvées gagne.
// Renvoie { trxId, modele, montant, frais, total, soldeApres, note, dateTrx } pour une dépense ; { credit: true, trxId, modele, montant, soldeApres, dateTrx } pour de l'argent reçu ;
// { ignore: true, trxId, soldeApres } pour un SMS à ignorer ; ou null si aucun modèle ne correspond. « total » = montant + frais = somme réellement débitée.
export function analyserSmsMM(texte, modeles = MODELES_PAR_DEFAUT) { // Reçoit le texte du SMS et les modèles
  const sms = normaliser(texte); // Texte comparable
  if (sms.trim() === "") return null; // SMS vide
  for (const modele of modeles) { // Essaie chaque modèle
    if (modele.actif === false || modele.actif === 0) continue; // Modèle désactivé
    let compile; // Modèle compilé
    try { compile = compilerModele(modele); } catch { continue; } // Modèle invalide : passe au suivant
    const valeurs = {}; // Valeurs lues dans le SMS
    let correspond = true; // Toutes les lignes obligatoires sont-elles trouvées ?
    for (const ligne of compile.lignes) { // Vérifie chaque ligne
      const lu = lireAvecGabarit(sms, ligne.regex, { haut: ARRONDI_HAUT }); // Cherche la ligne dans le SMS
      if (lu === null) { if (ligne.obligatoire) { correspond = false; break; } continue; } // Absente : bloquant seulement si obligatoire
      for (const [nom, valeur] of Object.entries(lu)) if (!(nom in valeurs)) valeurs[nom] = valeur; // La première valeur trouvée est gardée
    } // Fin des lignes
    if (!correspond) continue; // Ce modèle ne convient pas
    const trxId = valeurs.ref_trx ? valeurs.ref_trx.toUpperCase() : null; // Identifiant (en majuscules)
    const soldeApres = valeurs.solde ?? null; // Solde après l'opération
    if (modele.sens === "ignorer") return { ignore: true, trxId, soldeApres }; // SMS à ignorer : le solde est gardé par l'import
    const dateTrx = valeurs.date_trx ? analyserDate(valeurs.date_trx) : null; // Date écrite dans le SMS (null si absente ou invalide)
    if (modele.sens === "credit") { // Argent reçu
      if (!(valeurs.montant_credit > 0)) continue; // Un montant nul n'a aucun sens
      return { credit: true, trxId, modele: modele.nom, montant: valeurs.montant_credit, soldeApres, dateTrx }; // Résultat
    } // Fin du cas crédit
    if (!(valeurs.montant_debit > 0)) continue; // Un montant nul n'a aucun sens
    const frais = valeurs.frais ?? 0; // Frais (0 s'il n'y en a pas)
    return { trxId, modele: modele.nom, montant: valeurs.montant_debit, frais, total: valeurs.montant_debit + frais, soldeApres, note: fabriquerNote(modele, valeurs, frais), dateTrx }; // Dépense
  } // Fin des modèles
  return null; // Aucun modèle ne correspond : SMS non compris
} // Fin de analyserSmsMM
