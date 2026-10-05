// Composants d'interface réutilisables : cartes, tuiles, alertes, boutons, champs de formulaire.
import { h } from "./dom.js"; // Fabrication d'éléments
import { icone } from "./icones.js"; // Icônes

// Carte blanche aux coins arrondis.
export function carte(...enfants) { // Reçoit le contenu
  return h("section", { class: "carte apparition" }, ...enfants); // Section avec la classe carte
} // Fin de carte

// En-tête d'un écran : grand titre et sous-titre facultatif.
export function enteteEcran(titre, sousTitre = null) { // Titre et sous-titre
  return h("header", { class: "entete" }, // Zone d'en-tête
    h("h1", { class: "titre" }, titre), // Grand titre
    sousTitre ? h("p", { class: "sous-titre" }, sousTitre) : null, // Sous-titre s'il existe
  ); // Fin de l'en-tête
} // Fin de enteteEcran

// Tuile façon icône d'application. Sans route, elle est grisée avec la mention « bientôt ».
export function tuile({ libelle, nomIcone, couleur, route = null }) { // Libellé, icône, couleur, destination
  const contenu = [ // Contenu de la tuile
    route ? null : h("span", { class: "tuile-bientot" }, "bientôt"), // Étiquette « bientôt » si pas de destination
    h("span", { class: `tuile-icone fond-${couleur}` }, icone(nomIcone, 32)), // Pastille colorée avec l'icône
    h("span", { class: "tuile-libelle" }, libelle), // Nom de la tuile
  ]; // Fin du contenu
  if (!route) return h("div", { class: "tuile desactivee apparition", "aria-disabled": "true" }, ...contenu); // Tuile inactive : simple bloc
  return h("a", { class: "tuile apparition", href: `#${route}` }, ...contenu); // Tuile active : lien vers la route
} // Fin de tuile

// Bandeau d'alerte. Niveaux : ok, attention, danger, info.
export function alerte({ niveau = "info", message }) { // Niveau et message
  const nomIcone = { ok: "succes", attention: "attention", danger: "erreur", info: "info" }[niveau] ?? "info"; // Choisit l'icône selon le niveau
  return h("div", { class: `alerte alerte-${niveau} apparition`, role: niveau === "danger" ? "alert" : "status" }, // Bloc d'alerte (annoncé par les lecteurs d'écran)
    icone(nomIcone, 22), // Icône du niveau
    h("span", {}, message), // Texte du message
  ); // Fin de l'alerte
} // Fin de alerte

// Gros bouton principal (zone tactile confortable).
export function boutonPrincipal(texte, auClic, { danger = false } = {}) { // Texte, fonction au clic, option danger
  return h("button", { class: `bouton${danger ? " bouton-danger" : ""}`, type: "button", onclick: auClic }, texte); // Bouton avec sa fonction
} // Fin de boutonPrincipal

// Champ de formulaire avec libellé, aide et message d'erreur.
// Renvoie { element, lire, ecrire, afficherErreur, effacerErreur }.
export function champ({ id, libelle, type = "text", valeur = "", aide = null, inputmode = null }) { // Description du champ
  const saisie = h("input", { id, class: "champ-saisie", type, value: valeur, inputmode, autocomplete: "off", "aria-describedby": `${id}-message` }); // Zone de saisie
  const message = h("div", { id: `${id}-message`, class: "champ-message", role: "alert" }); // Zone du message d'erreur (vide au départ)
  const element = h("div", { class: "champ" }, // Bloc complet du champ
    h("label", { class: "champ-libelle", for: id }, libelle), // Libellé lié à la saisie
    saisie, // Zone de saisie
    aide ? h("div", { class: "champ-aide" }, aide) : null, // Texte d'aide éventuel
    message, // Zone d'erreur
  ); // Fin du bloc
  return { // Objet de contrôle du champ
    element, // Bloc à insérer dans la page
    lire: () => saisie.value, // Lit la valeur saisie (toujours du texte)
    ecrire: (nouvelle) => { saisie.value = nouvelle; }, // Change la valeur affichée
    afficherErreur: (texte) => { // Affiche une erreur sous le champ
      message.textContent = texte; // Écrit le message
      saisie.setAttribute("aria-invalid", "true"); // Signale l'erreur aux lecteurs d'écran
      element.classList.add("en-erreur"); // Colore le champ en rouge
    }, // Fin de afficherErreur
    effacerErreur: () => { // Retire l'erreur
      message.textContent = ""; // Vide le message
      saisie.removeAttribute("aria-invalid"); // Retire le signal d'erreur
      element.classList.remove("en-erreur"); // Retire la couleur rouge
    }, // Fin de effacerErreur
  }; // Fin de l'objet de contrôle
} // Fin de champ
