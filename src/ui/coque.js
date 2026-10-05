// Coque de l'application : zone de contenu + barre d'onglets en bas (comme une application native).
import { h } from "./dom.js"; // Fabrication d'éléments
import { icone } from "./icones.js"; // Icônes

// Onglets de la barre du bas. Sans route, l'onglet est grisé (écran pas encore disponible).
export const ONGLETS = [ // Liste des onglets
  { libelle: "Accueil", nomIcone: "accueil", route: "/" }, // Tableau de bord
  { libelle: "Budgets", nomIcone: "budgets", route: null }, // Sprint 4
  { libelle: "Opérations", nomIcone: "transactions", route: null }, // Sprint 5
  { libelle: "Réglages", nomIcone: "reglages", route: "/reglages" }, // Réglages et diagnostic
]; // Fin de la liste

// Construit la coque dans la racine et renvoie la zone de contenu et la fonction de mise en évidence de l'onglet actif.
export function construireCoque(racine, onglets = ONGLETS) { // Racine et liste d'onglets
  const contenu = h("main", { id: "contenu", class: "contenu" }); // Zone où les écrans s'affichent
  const liens = onglets.map((onglet) => { // Fabrique un élément par onglet
    const corps = [icone(onglet.nomIcone, 26), h("span", {}, onglet.libelle)]; // Icône + texte
    if (!onglet.route) return h("span", { class: "onglet desactive", "aria-disabled": "true" }, ...corps); // Onglet grisé, non cliquable
    return h("a", { class: "onglet", href: `#${onglet.route}`, "data-route": onglet.route }, ...corps); // Onglet cliquable
  }); // Fin de la fabrication des onglets
  const barre = h("nav", { class: "barre-onglets", "aria-label": "Navigation principale" }, ...liens); // Barre du bas
  racine.replaceChildren(contenu, barre); // Place la zone de contenu puis la barre dans la page

  const marquerActif = (route) => { // Met en évidence l'onglet de l'écran affiché
    barre.querySelectorAll("a.onglet").forEach((lien) => { // Pour chaque onglet cliquable
      const actif = lien.getAttribute("data-route") === route; // Est-ce l'écran actuel ?
      lien.classList.toggle("actif", actif); // Ajoute ou retire la classe « actif »
      if (actif) lien.setAttribute("aria-current", "page"); else lien.removeAttribute("aria-current"); // Signale la page courante aux lecteurs d'écran
    }); // Fin de la boucle
  }; // Fin de marquerActif

  return { contenu, marquerActif }; // Renvoie ce dont le reste de l'application a besoin
} // Fin de construireCoque
