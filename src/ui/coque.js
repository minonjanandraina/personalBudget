// Coque de l'application : zone de contenu + barre d'onglets en bas (comme une application native).
import { h } from "./dom.js"; // Fabrication d'éléments
import { icone } from "./icones.js"; // Icônes

// Onglets de la barre du bas. Sans route, l'onglet est grisé (écran pas encore disponible).
// « prefixes » : tous les écrans qui rattachent l'onglet (ex. « /budgets/5 » garde l'onglet Budgets actif).
export const ONGLETS = [ // Liste des onglets
  { libelle: "Accueil", nomIcone: "accueil", route: "/", prefixes: [] }, // Tableau de bord
  { libelle: "Budgets", nomIcone: "budgets", route: "/budgets", prefixes: ["/budgets", "/types-budget", "/allocations"] }, // Budgets, types et allocations
  { libelle: "Opérations", nomIcone: "transactions", route: "/operations", prefixes: ["/operations", "/operations-ussd"] }, // Dépenses et allocations
  { libelle: "Réglages", nomIcone: "reglages", route: "/reglages", prefixes: ["/reglages", "/solde", "/diagnostic", "/sauvegarde"] }, // Réglages, solde Mobile Money, diagnostic
]; // Fin de la liste

// Dit si un onglet correspond au chemin affiché.
export function ongletActifPour(onglet, chemin) { // Reçoit l'onglet et le chemin
  if (!onglet.route) return false; // Un onglet grisé n'est jamais actif
  if (chemin === onglet.route) return true; // Chemin identique à la route de l'onglet
  return (onglet.prefixes ?? []).some((p) => chemin === p || chemin.startsWith(`${p}/`)); // Ou chemin situé sous l'un de ses préfixes
} // Fin de ongletActifPour

// Construit la coque dans la racine et renvoie la zone de contenu et la fonction de mise en évidence de l'onglet actif.
export function construireCoque(racine, onglets = ONGLETS) { // Racine et liste d'onglets
  const contenu = h("main", { id: "contenu", class: "contenu" }); // Zone où les écrans s'affichent
  const liens = onglets.map((onglet) => { // Fabrique un élément par onglet
    const corps = [icone(onglet.nomIcone, 26), h("span", {}, onglet.libelle)]; // Icône + texte
    if (!onglet.route) return h("span", { class: "onglet desactive", "aria-disabled": "true" }, ...corps); // Onglet grisé, non cliquable
    return h("a", { class: "onglet", href: `#${onglet.route}`, "data-route": onglet.route }, h("span", { class: "badge", hidden: true }), ...corps); // Onglet cliquable (avec un badge de comptage caché au départ)
  }); // Fin de la fabrication des onglets
  const barre = h("nav", { class: "barre-onglets", "aria-label": "Navigation principale" }, ...liens); // Barre du bas
  racine.replaceChildren(contenu, barre); // Place la zone de contenu puis la barre dans la page

  const marquerActif = (chemin) => { // Met en évidence l'onglet de l'écran affiché
    barre.querySelectorAll("a.onglet").forEach((lien) => { // Pour chaque onglet cliquable
      const onglet = onglets.find((o) => o.route === lien.getAttribute("data-route")); // Retrouve sa description
      const actif = ongletActifPour(onglet, chemin); // Est-ce l'écran actuel ?
      lien.classList.toggle("actif", actif); // Ajoute ou retire la classe « actif »
      if (actif) lien.setAttribute("aria-current", "page"); else lien.removeAttribute("aria-current"); // Signale la page courante aux lecteurs d'écran
    }); // Fin de la boucle
  }; // Fin de marquerActif

  // Affiche (ou cache si 0) un petit nombre rouge sur un onglet, par exemple le nombre d'alertes sur l'accueil.
  const definirBadge = (route, nombre) => { // Reçoit la route de l'onglet et le nombre à afficher
    const lien = barre.querySelector(`a.onglet[data-route="${route}"]`); // Retrouve l'onglet
    if (!lien) return; // Onglet inconnu : rien à faire
    const badge = lien.querySelector(".badge"); // Pastille de comptage
    badge.textContent = nombre > 99 ? "99+" : String(nombre); // Texte du badge
    badge.hidden = !(nombre > 0); // Caché quand il n'y a rien à signaler
    const onglet = onglets.find((o) => o.route === route); // Description de l'onglet
    lien.setAttribute("aria-label", nombre > 0 ? `${onglet.libelle}, ${nombre} alerte${nombre > 1 ? "s" : ""}` : onglet.libelle); // Annonce le nombre aux lecteurs d'écran
  }; // Fin de definirBadge

  return { contenu, marquerActif, definirBadge }; // Renvoie ce dont le reste de l'application a besoin
} // Fin de construireCoque
