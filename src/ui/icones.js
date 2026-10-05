// Icônes de l'application (dessins vectoriels intégrés : fonctionnent hors ligne, sans fichier à télécharger).
// Style « trait » 24x24, inspiré des icônes libres Feather (licence MIT).
import { h } from "./dom.js"; // Outil de fabrication d'éléments

// Contenu SVG de chaque icône (textes fixes écrits ici, jamais saisis par l'utilisateur).
const DESSINS = { // Dictionnaire nom -> dessin
  accueil: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', // Maison
  budgets: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>', // Carte / portefeuille
  allocations: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', // Calendrier
  transactions: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>', // Flèches d'échange
  types: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>', // Étiquette
  telephone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>', // Téléphone
  reglages: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', // Curseurs
  succes: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', // Coche dans un cercle
  attention: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', // Triangle d'avertissement
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', // Information
  erreur: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', // Croix dans un cercle
  ajouter: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>', // Plus dans un cercle
  modifier: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>', // Crayon
  supprimer: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', // Corbeille
  sauvegarde: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', // Flèche vers un plateau (téléchargement)
  chevron: '<polyline points="6 9 12 15 18 9"/>', // Flèche vers le bas
  retour: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>', // Flèche vers la gauche
}; // Fin du dictionnaire

// Renvoie la liste des noms d'icônes disponibles.
export function nomsIcones() { // Aucun paramètre
  return Object.keys(DESSINS); // Les clés du dictionnaire
} // Fin de nomsIcones

// Fabrique une icône : <span class="icone"><svg>...</svg></span>.
export function icone(nom, taille = 24) { // Nom de l'icône et taille en pixels
  const dessin = DESSINS[nom]; // Cherche le dessin
  if (!dessin) throw new Error(`Icône inconnue : ${nom}`); // Refuse un nom qui n'existe pas
  const conteneur = h("span", { class: "icone", "aria-hidden": "true" }); // Conteneur invisible pour les lecteurs d'écran (décoratif)
  conteneur.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${dessin}</svg>`; // Insère le dessin (texte fixe de confiance)
  return conteneur; // Renvoie l'icône
} // Fin de icone
