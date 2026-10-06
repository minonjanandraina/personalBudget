// Écran « Consultation du solde » : PIN Orange Money, consultation immédiate par USSD, consultation automatique toutes les heures.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonPrincipal, champ } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { ErreurMetier, ErreurValidation } from "../../core/erreurs.js"; // Erreurs expliquées
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { validerPin, consulterEtEnregistrer } from "../../core/ussd-solde.js"; // Logique métier
import * as ussdPlateforme from "../../platform/ussd.js"; // Accès USSD (téléphone ou simulation)

const messageErreur = (e) => (e instanceof ErreurMetier || e instanceof ErreurValidation ? (e.message ?? "Saisie invalide.") : `Erreur : ${e?.message ?? e}`); // Texte d'une erreur

// Dessine l'écran dans la zone.
export async function afficherUssd(zone, { base, ussd = ussdPlateforme }) { // Reçoit la zone, la base et l'accès USSD
  const contenu = h("div", {}); // Zone redessinée après chaque action
  const champPin = champ({ id: "ussd-pin", libelle: "PIN Orange Money", type: "password", inputmode: "numeric", aide: "Chiffré par le coffre d'Android sur ce téléphone ; jamais dans la base ni dans les sauvegardes." }); // Saisie du PIN
  const dessiner = async () => { // Redessine selon l'état
    const etat = await ussd.etat(); // État actuel (lu AVANT d'effacer, pour ne jamais montrer un écran vide)
    vider(contenu); // Efface
    const executer = (action) => async () => { try { if ((await action()) === false) return; } catch (e) { afficherToast(messageErreur(e), "erreur"); } await dessiner(); }; // Exécute une action (faux = rien à redessiner), affiche l'erreur, redessine
    contenu.append(alerte({ niveau: etat.pinDefini ? "ok" : "attention", message: etat.pinDefini ? "PIN enregistré (chiffré)." : "Aucun PIN enregistré : enregistrez-le pour consulter le solde." })); // État du PIN
    const enregistrerPin = executer(async () => { // Enregistre le PIN saisi
      champPin.effacerErreur(); // Repart sans erreur
      try { validerPin(champPin.lire()); } catch (e) { if (e instanceof ErreurValidation) { champPin.afficherErreur(e.erreurs?.pin ?? "PIN invalide."); return false; } throw e; } // Vérifie le format
      await ussd.definirPin(champPin.lire()); // Enregistre (chiffré sur Android)
      champPin.ecrire(""); // Efface la saisie
      afficherToast("PIN enregistré.", "succes"); // Confirme
    }); // Fin de enregistrerPin
    const supprimerPin = executer(async () => { // Supprime le PIN
      if (!(await confirmer({ titre: "Supprimer le PIN ?", message: "La consultation automatique sera aussi arrêtée.", libelleOk: "Supprimer", danger: true }))) return; // Confirmation
      await ussd.effacerPin(); // Efface
      afficherToast("PIN supprimé.", "succes"); // Confirme
    }); // Fin de supprimerPin
    const consulter = executer(async () => { // Consulte maintenant
      if (!(await ussd.demanderPermission())) throw new ErreurMetier("Permission « téléphone » refusée : Volako ne peut pas envoyer le code USSD. Autorisez-la dans les paramètres Android de l'application."); // Permission
      const r = await consulterEtEnregistrer(base, ussd, { forcer: true }); // Consulte et enregistre
      afficherToast(`Solde enregistré : ${formaterMontant(r.balance)}.`, "succes"); // Confirme
    }); // Fin de consulter
    const basculerAuto = executer(async () => { // Active ou arrête l'automatique
      if (!etat.actif && !(await ussd.demanderPermission())) throw new ErreurMetier("Permission « téléphone » refusée : autorisez-la dans les paramètres Android de l'application."); // Permission avant activation
      await ussd.programmerAuto(!etat.actif); // Bascule
      afficherToast(etat.actif ? "Consultation automatique arrêtée." : "Consultation automatique activée.", "succes"); // Confirme
    }); // Fin de basculerAuto
    contenu.append( // Assemble
      carte(champPin.element, boutonPrincipal(etat.pinDefini ? "Remplacer le PIN" : "Enregistrer le PIN", enregistrerPin), etat.pinDefini ? h("div", { class: "espace-haut" }, boutonPrincipal("Supprimer le PIN", supprimerPin, { danger: true })) : null), // Carte du PIN
      etat.pinDefini ? carte(h("h2", { class: "carte-titre" }, "Consulter maintenant"), h("p", { class: "ligne-detail" }, `Code envoyé : ${etat.code}`), boutonPrincipal("Consulter le solde", consulter)) : null, // Carte de la consultation immédiate
      etat.pinDefini ? carte( // Carte de l'automatique
        h("h2", { class: "carte-titre" }, "Consultation automatique"), // Titre
        h("p", { class: "ligne-detail" }, "Toutes les heures : application ouverte, et aussi en arrière-plan (Android peut retarder ou refuser l'arrière-plan). Si Orange Money répond autre chose qu'un solde (PIN refusé…), la consultation s'arrête aussitôt, pour ne jamais répéter un PIN faux."), // Explication
        alerte({ niveau: etat.actif ? "ok" : "info", message: etat.actif ? "Active." : "Arrêtée." }), // État
        boutonPrincipal(etat.actif ? "Arrêter la consultation automatique" : "Activer la consultation automatique", basculerAuto), // Bouton
      ) : null, // Rien sans PIN
    ); // Fin de l'assemblage
  }; // Fin de dessiner
  zone.append(enteteEcran("Consultation du solde", "Orange Money par USSD", { retour: "/reglages" }), contenu); // En-tête et contenu
  await dessiner(); // Premier affichage
} // Fin de afficherUssd
