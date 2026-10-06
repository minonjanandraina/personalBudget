// Écrans des opérations USSD dynamiques : liste (modèles et envois en attente), création/modification d'un modèle, lancement d'une opération.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonIcone, boutonPrincipal, champ, choix } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre, lireMontant, effacerErreurs, appliquerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { ErreurMetier, ErreurValidation } from "../../core/erreurs.js"; // Erreurs expliquées
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { afficherDateHeure } from "../../core/dates.js"; // Affichage des dates
import { listerBudgets } from "../../core/budgets.js"; // Budgets
import { verrouActif } from "../../core/verrou.js"; // Le verrouillage est-il activé ?
import { creerOperation, modifierOperation, supprimerOperation, listerOperations, lireOperation, lancerOperation, preparerEnvoi, variablesDuCode, TYPES } from "../../core/operations-ussd.js"; // Logique métier
import { listerEnAttente, annulerEnAttente } from "../../core/ussd-en-attente.js"; // Envois en attente de leur SMS
import * as ussdPlateforme from "../../platform/ussd.js"; // Accès USSD (téléphone ou simulation)

const masquer = (code) => String(code).replaceAll("{pin}", "••••"); // Code sans PIN visible
const LIBELLE_STATUT = { en_attente: "En attente du SMS", classee: "Classée dans le budget", echec: "À classer à la main", expiree: "Abandonnée (pas de SMS)", annulee: "Annulée" }; // Texte de chaque état

// Liste des modèles et des envois récents.
export async function afficherOperationsUssd(zone, { base }) { // Reçoit la zone et la base
  const modeles = await listerOperations(base); // Modèles
  const envois = await listerEnAttente(base); // Envois récents
  zone.append(enteteEcran("Opérations USSD", "Retrait, paiement… en un geste", { retour: "/" }), boutonLien("Nouvelle opération", "/operations-ussd/nouveau", "ajouter")); // En-tête et bouton d'ajout
  if (modeles.length === 0) zone.append(h("div", { class: "espace-haut" }, alerte({ niveau: "info", message: "Aucune opération. Créez-en une : nom, type, code USSD avec {numero}, {montant} et {pin}, et le budget à débiter." }))); // Liste vide
  for (const m of modeles) { // Pour chaque modèle
    zone.append(h("div", { class: "carte apparition" }, // Une carte par modèle
      h("div", { class: "ligne ligne-sans-carte" }, // Ligne texte + modifier
        h("div", { class: "ligne-texte" }, // Bloc de texte
          h("div", { class: "ligne-titre" }, m.nom), // Nom
          h("div", { class: "ligne-detail" }, `${m.type === "sortie" ? `Sortie · budget « ${m.budgetNom} »` : "Entrée"} · ${masquer(m.code)}`), // Type, budget et code
        ), // Fin du bloc de texte
        boutonIcone({ nomIcone: "modifier", libelle: `Modifier ${m.nom}`, route: `/operations-ussd/${m.id}` }), // Bouton modifier
      ), // Fin de la ligne
      h("div", { class: "espace-haut" }, boutonLien("Lancer", `/operations-ussd/lancer/${m.id}`, "telephone")), // Bouton lancer
    )); // Fin de la carte
  } // Fin de la boucle
  if (envois.length === 0) return; // Pas d'envoi à montrer
  zone.append(h("h2", { class: "section-titre" }, "Envois récents")); // Titre
  const recharger = async () => { vider(zone); await afficherOperationsUssd(zone, { base }); }; // Redessine l'écran
  for (const e of envois) { // Pour chaque envoi
    zone.append(h("div", { class: "carte apparition" }, // Une carte par envoi
      h("div", { class: "ligne ligne-sans-carte" }, // Ligne texte + montant
        h("div", { class: "ligne-texte" }, // Bloc de texte
          h("div", { class: "ligne-titre" }, e.operationNom), // Nom du modèle
          h("div", { class: "ligne-detail" }, `${afficherDateHeure(e.dateEnvoi)} · ${LIBELLE_STATUT[e.statut] ?? e.statut}`), // Date et état
          e.raison ? h("div", { class: "ligne-detail" }, e.raison) : null, // Explication éventuelle
        ), // Fin du bloc de texte
        h("div", { class: "ligne-montant montant-moins" }, `−${formaterMontant(e.montant)}`), // Montant
      ), // Fin de la ligne
      e.statut === "en_attente" ? h("div", { class: "espace-haut" }, boutonPrincipal("Annuler cet envoi", async () => { // Annulation
        if (!(await confirmer({ titre: "Annuler cet envoi ?", message: "À faire seulement si l'opération a échoué chez Orange Money. Le SMS ne sera plus classé automatiquement.", libelleOk: "Annuler l'envoi", danger: true }))) return; // Confirmation
        try { await annulerEnAttente(base, e.id); } catch (erreur) { afficherToast(erreur.message, "erreur"); } // Annule
        await recharger(); // Redessine
      })) : null, // Fin du bouton
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de afficherOperationsUssd

// Formulaire de création (sans paramètre) ou de modification (params.id) d'un modèle.
export async function afficherFormulaireOperationUssd(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  const id = params.id === undefined ? null : Number(params.id); // Identifiant si on modifie
  const existant = id === null ? null : await lireOperation(base, id); // Modèle à modifier
  zone.append(enteteEcran(id === null ? "Nouvelle opération" : "Modifier l'opération", null, { retour: "/operations-ussd" })); // En-tête
  if (id !== null && !existant) { zone.append(alerte({ niveau: "danger", message: "Cette opération n'existe plus." })); return; } // Introuvable
  const budgets = await listerBudgets(base); // Budgets disponibles
  const champs = { // Champs du formulaire
    nom: champ({ id: "ussd-nom", libelle: "Nom de l'opération", valeur: existant?.nom ?? "", aide: "Ex. Retrait Orange Money, Paiement marchand" }), // Nom
    type: choix({ id: "ussd-type", libelle: "Type", valeur: existant?.type ?? "sortie", options: TYPES.map((t) => ({ valeur: t.valeur, libelle: t.libelle })) }), // Sortie ou entrée
    code: champ({ id: "ussd-code", libelle: "Code USSD", valeur: existant?.code ?? "", inputmode: "text", aide: "Ex. #144*8*8*{numero}*{montant}*{pin}# — {numero} : numéro saisi à chaque envoi, {montant} : montant saisi (obligatoire pour une sortie), {pin} : votre PIN Orange Money (enregistré chiffré, jamais affiché)." }), // Code
    budgetId: choix({ id: "ussd-budget", libelle: "Budget à débiter (sortie)", valeur: existant?.budgetId === null || existant === null ? "" : String(existant.budgetId), options: [{ valeur: "", libelle: "— Aucun —" }, ...budgets.map((b) => ({ valeur: b.id, libelle: b.name }))] }), // Budget
  }; // Fin des champs
  const enregistrer = () => { // Enregistre
    const donnees = { nom: champs.nom.lire(), type: champs.type.lire(), code: champs.code.lire(), budgetId: Number(champs.budgetId.lire()) || null }; // Rassemble les valeurs
    return soumettre({ champs, action: () => (id === null ? creerOperation(base, donnees) : modifierOperation(base, id, donnees)), messageSucces: id === null ? "Opération créée." : "Opération modifiée.", routeSucces: "/operations-ussd" }); // Création ou modification
  }; // Fin de enregistrer
  const supprimer = async () => { // Suppression
    if (!(await confirmer({ titre: "Supprimer cette opération ?", message: `« ${existant.nom} » sera supprimée définitivement.`, libelleOk: "Supprimer", danger: true }))) return; // Confirmation
    await soumettre({ champs: {}, action: () => supprimerOperation(base, id), messageSucces: "Opération supprimée.", routeSucces: "/operations-ussd" }); // Supprime (refusé si en attente)
  }; // Fin de supprimer
  zone.append(carte(champs.nom.element, champs.type.element, champs.code.element, champs.budgetId.element, boutonPrincipal("Enregistrer", enregistrer), existant ? h("div", { class: "espace-haut" }, boutonPrincipal("Supprimer", supprimer, { danger: true })) : null)); // Carte du formulaire
} // Fin de afficherFormulaireOperationUssd

// Écran de lancement d'une opération (params.id = modèle).
export async function afficherLancerOperationUssd(zone, { base, params = {}, ussd = ussdPlateforme }) { // Reçoit la zone, la base, les paramètres et l'accès USSD
  const operation = await lireOperation(base, Number(params.id)); // Modèle
  zone.append(enteteEcran(operation?.nom ?? "Opération", "Envoyer le code USSD", { retour: "/operations-ussd" })); // En-tête
  if (!operation) { zone.append(alerte({ niveau: "danger", message: "Cette opération n'existe plus." })); return; } // Introuvable
  if (!(await verrouActif(base))) { // Le PIN de l'application autorise l'envoi : il doit exister
    zone.append(alerte({ niveau: "attention", message: "Activez d'abord le verrouillage par PIN : le PIN de l'application autorise l'envoi des opérations USSD." }), h("div", { class: "espace-haut" }, boutonLien("Activer le verrouillage", "/verrou", "info"))); // Explication et lien
    return; // Rien d'autre
  } // Fin du cas sans verrou
  const variables = variablesDuCode(operation.code); // Variables à saisir
  const champs = {}; // Champs du formulaire
  if (variables.includes("numero")) champs.numero = champ({ id: "lancer-numero", libelle: "Numéro de téléphone", inputmode: "numeric", aide: "Chiffres seulement, sans +" }); // Numéro
  if (variables.includes("montant")) champs.montant = champ({ id: "lancer-montant", libelle: "Montant (Ar)", inputmode: "numeric" }); // Montant
  champs.pin = champ({ id: "lancer-pin", libelle: "PIN de l'application", type: "password", inputmode: "numeric", aide: "Le PIN de verrouillage de Volako autorise l'envoi." }); // PIN de l'application
  const zoneResultat = h("div", {}); // Réponse d'Orange Money
  const envoyer = async () => { // Envoie
    effacerErreurs(champs); // Repart sans erreur
    const montant = champs.montant ? lireMontant(champs.montant) : null; // Montant (affiche l'erreur de format)
    if (champs.montant && montant === null) return; // Montant illisible
    const valeurs = { numero: champs.numero?.lire() ?? "", montant }; // Valeurs saisies
    try { // Tente l'envoi
      const prep = await preparerEnvoi(base, operation.id, valeurs); // Contrôles (formats, budget, solde) avant de demander confirmation
      if (!(await ussd.demanderPermission())) throw new ErreurMetier("Permission « téléphone » refusée : autorisez-la dans les paramètres Android de l'application."); // Permission
      const ok = await confirmer({ titre: "Envoyer cette opération ?", message: `${operation.nom}\nCode : ${prep.codeAffiche}${prep.montant ? `\nMontant : ${formaterMontant(prep.montant)}` : ""}${operation.type === "sortie" ? `\nBudget : ${operation.budgetNom}` : ""}\n\nUne opération envoyée ne peut pas être annulée depuis Volako.`, libelleOk: "Envoyer" }); // Confirmation
      if (!ok) return; // Annulé
      const { texte, enAttente } = await lancerOperation(base, ussd, operation.id, { ...valeurs, pinApp: champs.pin.lire() }); // Envoie
      champs.pin.ecrire(""); // Efface le PIN saisi
      vider(zoneResultat); // Efface l'ancienne réponse
      zoneResultat.append(carte(h("h2", { class: "carte-titre" }, "Réponse d'Orange Money"), h("p", {}, texte), h("p", { class: "ligne-detail" }, enAttente ? "La dépense sera enregistrée dans le budget dès que le SMS de confirmation sera importé." : "Aucune dépense enregistrée (opération d'entrée)."))); // Montre la réponse
      afficherToast("Code envoyé.", "succes"); // Confirme
    } catch (erreur) { // Refus ou erreur
      if (erreur instanceof ErreurValidation) { const orphelins = appliquerErreurs(champs, erreur.erreurs); afficherToast(orphelins[0] ?? "Corrigez les champs en rouge.", "erreur"); } // Erreurs sous les champs
      else afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur?.message ?? erreur}`, "erreur"); // Message unique
    } // Fin du try/catch
  }; // Fin de envoyer
  zone.append( // Assemble
    carte(h("p", { class: "ligne-detail" }, `Code : ${masquer(operation.code)}`), operation.type === "sortie" ? h("p", { class: "ligne-detail" }, `Budget débité : « ${operation.budgetNom} »`) : null, ...Object.values(champs).map((c) => c.element), boutonPrincipal("Envoyer", envoyer)), // Formulaire
    zoneResultat, // Réponse
  ); // Fin de l'assemblage
} // Fin de afficherLancerOperationUssd
