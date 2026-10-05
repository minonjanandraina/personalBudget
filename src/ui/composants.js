// Composants d'interface réutilisables : cartes, tuiles, alertes, boutons, champs de formulaire.
import { h } from "./dom.js"; // Fabrication d'éléments
import { icone } from "./icones.js"; // Icônes

// Carte blanche aux coins arrondis.
export function carte(...enfants) { // Reçoit le contenu
  return h("section", { class: "carte apparition" }, ...enfants); // Section avec la classe carte
} // Fin de carte

// En-tête d'un écran : grand titre, sous-titre facultatif et lien de retour facultatif.
export function enteteEcran(titre, sousTitre = null, { retour = null } = {}) { // Titre, sous-titre et route de retour
  return h("header", { class: "entete" }, // Zone d'en-tête
    retour ? h("a", { class: "retour", href: `#${retour}`, "aria-label": "Retour" }, icone("retour", 22), "Retour") : null, // Lien de retour s'il est demandé
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

// Gros bouton qui est en réalité un lien vers un écran, avec une icône.
export function boutonLien(texte, route, nomIcone = null) { // Texte, route et icône facultative
  return h("a", { class: "bouton bouton-lien", href: `#${route}` }, nomIcone ? icone(nomIcone, 22) : null, texte); // Lien stylé comme un bouton
} // Fin de boutonLien

// Petit bouton rond avec une icône seule (modifier, supprimer...). « libelle » est lu par les lecteurs d'écran.
export function boutonIcone({ nomIcone, libelle, auClic = null, route = null, danger = false }) { // Icône, libellé, action ou route
  const classes = `bouton-icone${danger ? " bouton-icone-danger" : ""}`; // Classes CSS
  if (route) return h("a", { class: classes, href: `#${route}`, "aria-label": libelle, title: libelle }, icone(nomIcone, 20)); // Version lien
  return h("button", { class: classes, type: "button", "aria-label": libelle, title: libelle, onclick: auClic }, icone(nomIcone, 20)); // Version bouton
} // Fin de boutonIcone

// Fabrique l'objet de contrôle commun à tous les champs de formulaire.
function controleChamp({ element, saisie, lire, ecrire, message }) { // Éléments à piloter
  return { // Objet de contrôle
    element, // Bloc à insérer dans la page
    lire, // Lit la valeur
    ecrire, // Change la valeur affichée
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
  }; // Fin de l'objet
} // Fin de controleChamp

// Liste déroulante. « options » : [{ valeur, libelle }]. Lire renvoie la valeur choisie (texte).
export function choix({ id, libelle, options, valeur = "", aide = null }) { // Description du champ
  const saisie = h("select", { id, class: "champ-saisie", "aria-describedby": `${id}-message` }, // Zone de choix
    ...options.map((o) => h("option", { value: String(o.valeur), selected: String(o.valeur) === String(valeur) }, o.libelle)), // Une ligne par option
  ); // Fin de la liste
  const message = h("div", { id: `${id}-message`, class: "champ-message", role: "alert" }); // Zone du message d'erreur
  const element = h("div", { class: "champ" }, h("label", { class: "champ-libelle", for: id }, libelle), saisie, aide ? h("div", { class: "champ-aide" }, aide) : null, message); // Bloc complet
  return controleChamp({ element, saisie, message, lire: () => saisie.value, ecrire: (v) => { saisie.value = String(v); } }); // Objet de contrôle
} // Fin de choix

// Interrupteur oui/non. Lire renvoie un booléen.
export function interrupteur({ id, libelle, valeur = false, aide = null }) { // Description du champ
  const saisie = h("input", { id, class: "interrupteur-saisie", type: "checkbox", checked: valeur, "aria-describedby": `${id}-message` }); // Case à cocher
  const message = h("div", { id: `${id}-message`, class: "champ-message", role: "alert" }); // Zone du message d'erreur
  const element = h("div", { class: "champ champ-interrupteur" }, h("label", { class: "interrupteur", for: id }, saisie, h("span", { class: "champ-libelle" }, libelle)), aide ? h("div", { class: "champ-aide" }, aide) : null, message); // Bloc complet
  return controleChamp({ element, saisie, message, lire: () => saisie.checked, ecrire: (v) => { saisie.checked = Boolean(v); } }); // Objet de contrôle
} // Fin de interrupteur
