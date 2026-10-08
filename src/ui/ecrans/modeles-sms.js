// Écrans « Modèles de SMS » : liste (ordre de priorité, activation), création/modification d'un modèle, essai d'un SMS.
// Un modèle décrit un type de SMS de l'opérateur par un gabarit : une ligne par information, avec des variables entre accolades (voir core/modeles-sms-defaut.js).
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonPrincipal, champ, choix, zoneTexte } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre } from "../formulaire.js"; // Enregistrement de formulaire
import { aller } from "../routeur.js"; // Navigation
import { ErreurMetier } from "../../core/erreurs.js"; // Erreur expliquée
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { afficherDateHeure } from "../../core/dates.js"; // Affichage des dates
import { listerModeles, lireModele, creerModele, modifierModele, supprimerModele, activerModele, deplacerModele, retablirModelesParDefaut } from "../../core/modeles-sms.js"; // Logique des modèles
import { analyserSmsMM, validerModeleSms } from "../../core/sms-mm.js"; // Reconnaissance d'un SMS et contrôle d'un modèle
import { SENS_SMS } from "../../core/modeles-sms-defaut.js"; // Sens possibles

let texteDepart = ""; // SMS à pré-remplir dans le prochain formulaire « nouveau modèle » (venant d'un SMS non compris)

// Prépare le formulaire « nouveau modèle » avec le texte d'un SMS non compris, puis l'ouvre.
export function creerModeleDepuisSms(texte) { // Reçoit le texte du SMS
  texteDepart = String(texte ?? ""); // Garde le texte pour le formulaire
  aller("/sms/modeles/nouveau"); // Ouvre le formulaire
} // Fin de creerModeleDepuisSms

const AIDE_VARIABLES = "Variables : {montant_debit} {montant_credit} {frais} {solde} {ref_trx} {date_trx} {numero_source} {numero_destination}"; // Rappel des variables

// Phrase qui décrit ce qu'un modèle a lu dans un SMS d'essai.
export function decrireResultat(r) { // Reçoit le résultat de analyserSmsMM
  if (r === null) return "Aucun modèle ne reconnaît ce SMS : il serait listé « non compris »."; // Pas reconnu
  const parties = []; // Informations lues
  if (r.ignore) parties.push("SMS à ignorer (aucune transaction)"); // Ignoré
  else if (r.credit) parties.push(`argent reçu ${formaterMontant(r.montant)}`); // Crédit
  else { parties.push(`dépense ${formaterMontant(r.total)}`); if (r.frais > 0) parties.push(`dont ${formaterMontant(r.frais)} de frais`); parties.push(`note « ${r.note} »`); } // Dépense
  if (r.soldeApres !== null && r.soldeApres !== undefined) parties.push(`solde ${formaterMontant(r.soldeApres)}`); // Solde
  if (r.trxId) parties.push(`référence ${r.trxId}`); // Référence
  if (r.dateTrx) parties.push(`date ${afficherDateHeure(r.dateTrx)}`); // Date écrite dans le SMS
  return `${r.modele ? `Modèle « ${r.modele} » : ` : ""}${parties.join(" · ")}.`; // Phrase finale
} // Fin de decrireResultat

// Zone d'essai : un SMS collé est analysé avec les modèles donnés par « fournirModeles » (rien n'est enregistré).
function zoneEssai(fournirModeles, texte = "") { // Reçoit la fonction qui donne les modèles à essayer et le texte de départ
  const sms = zoneTexte({ id: "essai-sms", libelle: "SMS d'essai (facultatif)", valeur: texte, aide: "Collez ici un vrai SMS de votre opérateur pour voir ce qui est lu." }); // Texte du SMS
  const resultat = h("div", { class: "espace-haut" }); // Résultat de l'essai
  const essayer = async () => { // Analyse le SMS
    vider(resultat); // Efface le résultat précédent
    const modeles = await fournirModeles(); // Modèles à essayer
    if (modeles === null) return; // Modèle en cours invalide : l'erreur est déjà affichée
    const r = analyserSmsMM(sms.lire(), modeles); // Analyse
    resultat.append(alerte({ niveau: r === null ? "attention" : "succes", message: decrireResultat(r) })); // Affiche
  }; // Fin de essayer
  return { element: carte(h("h2", { class: "carte-titre" }, "Essayer un SMS"), sms.element, boutonPrincipal("Essayer", essayer), resultat), sms }; // Carte et champ
} // Fin de zoneEssai

// Liste des modèles.
export async function afficherModelesSms(zone, { base }) { // Reçoit la zone et la base
  const modeles = await listerModeles(base); // Modèles dans l'ordre de priorité
  const recharger = async () => { vider(zone); await afficherModelesSms(zone, { base }); }; // Redessine l'écran
  zone.append( // En-tête et aide
    enteteEcran("Modèles de SMS", "Reconnaissance des SMS de votre opérateur", { retour: "/sms" }), // En-tête
    alerte({ niveau: "info", message: "Chaque modèle décrit un type de SMS. Ils sont essayés dans l'ordre : le premier qui correspond gagne. Les modèles « à ignorer » sont donc placés en premier." }), // Aide
    h("div", { class: "espace-haut" }, boutonLien("Nouveau modèle", "/sms/modeles/nouveau", "ajouter")), // Bouton d'ajout
  ); // Fin de l'en-tête
  for (const [i, m] of modeles.entries()) { // Pour chaque modèle
    zone.append(h("div", { class: "carte apparition" }, // Une carte par modèle
      h("div", { class: "ligne-titre" }, `${i + 1}. ${m.nom}${m.actif ? "" : " (désactivé)"}`), // Rang, nom, état
      h("div", { class: "ligne-detail" }, SENS_SMS[m.sens]), // Sens
      h("div", { class: "espace-haut" }, boutonLien("Modifier", `/sms/modeles/${m.id}`, "modifier")), // Modifier
      h("div", { class: "espace-haut" }, boutonPrincipal(m.actif ? "Désactiver" : "Activer", async () => { await activerModele(base, m.id, !m.actif); await recharger(); })), // Activer ou désactiver
      i > 0 ? h("div", { class: "espace-haut" }, boutonPrincipal("Monter (essayé plus tôt)", async () => { await deplacerModele(base, m.id, -1); await recharger(); })) : null, // Monter
      i < modeles.length - 1 ? h("div", { class: "espace-haut" }, boutonPrincipal("Descendre (essayé plus tard)", async () => { await deplacerModele(base, m.id, 1); await recharger(); })) : null, // Descendre
    )); // Fin de la carte
  } // Fin de la boucle
  const essai = zoneEssai(async () => (await listerModeles(base)).filter((m) => m.actif)); // Essai avec les modèles enregistrés et actifs
  zone.append(essai.element, h("div", { class: "espace-haut" }, boutonPrincipal("Rétablir les modèles livrés", async () => { // Retour aux modèles de départ
    if (!(await confirmer({ titre: "Rétablir les modèles livrés ?", message: "Tous vos modèles seront remplacés par ceux livrés avec l'application (formats Orange Money).", libelleOk: "Rétablir" }))) return; // Confirmation
    await retablirModelesParDefaut(base); // Remplace
    afficherToast("Modèles rétablis.", "succes"); // Confirme
    await recharger(); // Redessine
  }, { danger: true }))); // Fin du bouton
} // Fin de afficherModelesSms

// Formulaire de création (sans params.id) ou de modification d'un modèle.
export async function afficherFormulaireModeleSms(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  const id = params.id === undefined ? null : Number(params.id); // Identifiant ou null (création)
  const existant = id === null ? null : await lireModele(base, id); // Modèle à modifier
  zone.append(enteteEcran(id === null ? "Nouveau modèle" : "Modifier le modèle", null, { retour: "/sms/modeles" })); // En-tête
  if (id !== null && !existant) { zone.append(alerte({ niveau: "danger", message: "Ce modèle n'existe plus." })); return; } // Introuvable
  const depart = id === null ? texteDepart : ""; // SMS de départ (création depuis un SMS non compris)
  texteDepart = ""; // Utilisé une seule fois
  const champs = { // Champs du formulaire
    nom: champ({ id: "modele-nom", libelle: "Nom du modèle", valeur: existant?.nom ?? "", aide: "Ex. Transfert, Retrait, Argent reçu" }), // Nom
    sens: choix({ id: "modele-sens", libelle: "Ce SMS est…", valeur: existant?.sens ?? "debit", options: Object.entries(SENS_SMS).map(([valeur, libelle]) => ({ valeur, libelle })), aide: "Dépense : crée une dépense à classer. Argent reçu : seul le solde est gardé. À ignorer : aucune dépense, mais le solde est gardé." }), // Sens
    gabarit: zoneTexte({ id: "modele-gabarit", libelle: "Gabarit (une ligne par information)", valeur: existant?.gabarit ?? "", lignes: 8, aide: `Écrivez le texte du SMS en remplaçant chaque valeur par sa variable. Ex. : transfert de {montant_debit} Ar — Trans Id : {ref_trx}. Les lignes avec le montant ou la référence sont obligatoires, les autres (frais, solde, numéros, date) sont facultatives. ${AIDE_VARIABLES}` }), // Gabarit
    note: champ({ id: "modele-note", libelle: "Note de la dépense (facultatif)", valeur: existant?.note ?? "", aide: "Ex. Transfert vers {numero_destination}. Si une variable manque dans le SMS, le nom du modèle est utilisé." }), // Note
  }; // Fin des champs
  const saisie = () => ({ nom: champs.nom.lire(), sens: champs.sens.lire(), gabarit: champs.gabarit.lire(), note: champs.note.lire() }); // Valeurs saisies
  const enregistrer = () => soumettre({ champs, action: () => (id === null ? creerModele(base, saisie()) : modifierModele(base, id, saisie())), messageSucces: id === null ? "Modèle créé." : "Modèle modifié.", routeSucces: "/sms/modeles" }); // Enregistre
  const essai = zoneEssai(async () => { // Essai avec le modèle en cours de saisie (rien n'est enregistré)
    try { // Contrôle le modèle
      return [{ ...validerModeleSms(saisie()), actif: true }]; // Modèle propre, utilisé seul
    } catch (erreur) { // Modèle invalide
      const messages = erreur?.erreurs ? Object.entries(erreur.erreurs) : [["", erreur?.message ?? String(erreur)]]; // Erreurs par champ
      for (const [nom, message] of messages) (champs[nom] ?? champs.gabarit).afficherErreur(message); // Affiche sous les champs
      afficherToast("Corrigez le modèle avant de l'essayer.", "erreur"); // Rappel
      return null; // Pas d'essai
    } // Fin du try/catch
  }, depart); // Fin de l'essai
  zone.append(carte(champs.nom.element, champs.sens.element, champs.gabarit.element, champs.note.element, boutonPrincipal("Enregistrer", enregistrer)), essai.element); // Assemble
  if (id !== null) zone.append(h("div", { class: "espace-haut" }, boutonPrincipal("Supprimer ce modèle", async () => { // Suppression
    if (!(await confirmer({ titre: "Supprimer ce modèle ?", message: existant.nom, libelleOk: "Supprimer" }))) return; // Confirmation
    try { await supprimerModele(base, id); } catch (e) { afficherToast(e instanceof ErreurMetier ? e.message : `Erreur : ${e?.message ?? e}`, "erreur"); return; } // Supprime
    afficherToast("Modèle supprimé.", "succes"); // Confirme
    aller("/sms/modeles"); // Retour à la liste
  }, { danger: true }))); // Fin du bouton
} // Fin de afficherFormulaireModeleSms

