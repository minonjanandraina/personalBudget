// Messages à l'utilisateur : petites notifications (toasts) et fenêtre de confirmation.
import { h } from "./dom.js"; // Fabrication d'éléments
import { icone } from "./icones.js"; // Icônes

// Retrouve (ou crée) la zone où s'empilent les notifications.
function zoneToasts() { // Aucun paramètre
  let zone = document.getElementById("toasts"); // Cherche la zone existante
  if (!zone) { // Si elle n'existe pas encore
    zone = h("div", { id: "toasts", class: "toasts", "aria-live": "polite" }); // La crée (annoncée aux lecteurs d'écran)
    document.body.append(zone); // L'ajoute à la page
  } // Fin du cas
  return zone; // Renvoie la zone
} // Fin de zoneToasts

// Affiche une notification qui disparaît seule. Niveaux : succes, erreur, info.
export function afficherToast(message, niveau = "info", dureeMs = 3500) { // Message, niveau, durée d'affichage
  const nomIcone = { succes: "succes", erreur: "erreur", info: "info" }[niveau] ?? "info"; // Choisit l'icône
  const toast = h("div", { class: `toast toast-${niveau}`, role: "status" }, icone(nomIcone, 20), h("span", {}, message)); // Construit la notification
  zoneToasts().append(toast); // L'affiche
  setTimeout(() => toast.remove(), dureeMs); // La retire après la durée prévue
  return toast; // Renvoie l'élément (utile aux tests)
} // Fin de afficherToast

// Demande une confirmation. Renvoie une promesse : true si l'utilisateur confirme, false s'il annule.
export function confirmer({ titre, message, libelleOk = "Confirmer", danger = false }) { // Textes et style
  return new Promise((resoudre) => { // La promesse se termine quand l'utilisateur répond
    const fermer = (reponse) => { // Ferme la fenêtre et donne la réponse
      fond.remove(); // Retire la fenêtre de la page
      resoudre(reponse); // Termine la promesse avec la réponse
    }; // Fin de fermer
    const fond = h("div", { class: "fond-dialogue", onclick: (evenement) => { if (evenement.target === fond) fermer(false); } }, // Fond sombre ; un clic à côté annule
      h("div", { class: "dialogue", role: "dialog", "aria-modal": "true", "aria-label": titre }, // La fenêtre elle-même
        h("h2", { class: "dialogue-titre" }, titre), // Titre
        h("p", { class: "dialogue-message" }, message), // Message
        h("div", { class: "dialogue-actions" }, // Zone des boutons
          h("button", { class: "bouton bouton-secondaire", type: "button", onclick: () => fermer(false) }, "Annuler"), // Bouton Annuler
          h("button", { class: `bouton${danger ? " bouton-danger" : ""}`, type: "button", onclick: () => fermer(true) }, libelleOk), // Bouton de confirmation
        ), // Fin des actions
      ), // Fin de la fenêtre
    ); // Fin du fond
    document.body.append(fond); // Affiche la fenêtre
  }); // Fin de la promesse
} // Fin de confirmer
