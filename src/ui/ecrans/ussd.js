// Écran « Consultation du solde » : code USSD réglable et consultation immédiate. Le PIN Mobile Money est demandé à chaque consultation, jamais enregistré.
import { h } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonPrincipal, champ } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre, effacerErreurs, appliquerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { ErreurMetier, ErreurValidation } from "../../core/erreurs.js"; // Erreurs expliquées
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { consulterEtEnregistrer, lireCodeSolde, ecrireCodeSolde, reinitialiserCodeSolde, CODE_SOLDE_DEFAUT } from "../../core/ussd-solde.js"; // Logique métier
import * as ussdPlateforme from "../../platform/ussd.js"; // Accès USSD (téléphone ou simulation)

// Dessine l'écran dans la zone.
export async function afficherUssd(zone, { base, ussd = ussdPlateforme }) { // Reçoit la zone, la base et l'accès USSD
  const champs = { // Champs du formulaire
    code: champ({ id: "ussd-code-solde", libelle: "Code USSD de consultation", valeur: await lireCodeSolde(base), inputmode: "text", aide: `Par défaut : ${CODE_SOLDE_DEFAUT} — {pin} est remplacé par le PIN Mobile Money que vous saisissez à chaque consultation.` }), // Code réglable
    pin: champ({ id: "ussd-pin", libelle: "PIN Mobile Money", type: "password", inputmode: "numeric", aide: "Demandé à chaque consultation ; jamais enregistré, ni dans la base, ni dans les sauvegardes." }), // PIN saisi à chaque fois
  }; // Fin des champs
  const enregistrerCode = () => soumettre({ champs: { code: champs.code }, action: () => ecrireCodeSolde(base, champs.code.lire()), messageSucces: "Code enregistré." }); // Enregistre le code
  const retablir = async () => { // Revient au code par défaut
    if (!(await confirmer({ titre: "Rétablir le code par défaut ?", message: CODE_SOLDE_DEFAUT, libelleOk: "Rétablir" }))) return; // Confirmation
    await reinitialiserCodeSolde(base); // Oublie le code personnalisé
    champs.code.ecrire(CODE_SOLDE_DEFAUT); // Réaffiche le code par défaut
    champs.code.effacerErreur(); // Retire une erreur éventuelle
    afficherToast("Code par défaut rétabli.", "succes"); // Confirme
  }; // Fin de retablir
  const consulter = async () => { // Consulte maintenant
    effacerErreurs(champs); // Repart sans erreur
    try { // Tente la consultation
      if (!(await ussd.demanderPermission())) throw new ErreurMetier("Permission « téléphone » refusée : Volako ne peut pas envoyer le code USSD. Autorisez-la dans les paramètres Android de l'application."); // Permission
      const r = await consulterEtEnregistrer(base, ussd, { pin: champs.pin.lire(), forcer: true }); // Consulte avec le code en vigueur (enregistré, pas celui en cours de frappe)
      afficherToast(`Solde enregistré : ${formaterMontant(r.balance)}.`, "succes"); // Confirme
    } catch (erreur) { // Refus ou erreur
      if (erreur instanceof ErreurValidation) { const orphelins = appliquerErreurs(champs, erreur.erreurs); afficherToast(orphelins[0] ?? "Corrigez le champ en rouge.", "erreur"); } // Erreur sous le champ
      else afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur?.message ?? erreur}`, "erreur"); // Message unique
    } finally { champs.pin.ecrire(""); } // Efface toujours le PIN saisi
  }; // Fin de consulter
  zone.append( // Assemble
    enteteEcran("Consultation du solde", "Mobile Money par USSD", { retour: "/reglages" }), // En-tête
    carte(h("h2", { class: "carte-titre" }, "Code USSD"), champs.code.element, boutonPrincipal("Enregistrer le code", enregistrerCode), h("div", { class: "espace-haut" }, boutonPrincipal("Rétablir le code par défaut", retablir))), // Carte du code
    carte(h("h2", { class: "carte-titre" }, "Consulter maintenant"), alerte({ niveau: "info", message: "Saisissez votre PIN Mobile Money : il sert à cet envoi seulement et n'est pas gardé. Aucune consultation automatique (elle exigerait de garder le PIN)." }), champs.pin.element, boutonPrincipal("Consulter le solde", consulter)), // Carte de la consultation
  ); // Fin de l'assemblage
} // Fin de afficherUssd
