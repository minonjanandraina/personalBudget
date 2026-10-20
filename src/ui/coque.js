// Coque de l'application : zone de contenu + barre d'onglets en bas (comme une application native).
import { h } from "./dom.js"; // Fabrication d'éléments
import { icone } from "./icones.js"; // Icônes
import { alerte } from "./composants.js"; // Affichage d'une alerte

// Onglets de la barre du bas. Sans route, l'onglet est grisé (écran pas encore disponible).
// « prefixes » : tous les écrans qui rattachent l'onglet (ex. « /budgets/5 » garde l'onglet Budgets actif).
export const ONGLETS = [ // Liste des onglets
  { libelle: "Accueil", nomIcone: "accueil", route: "/", prefixes: [] }, // Tableau de bord
  { libelle: "Budgets", nomIcone: "budgets", route: "/budgets", prefixes: ["/budgets", "/types-budget", "/allocations"] }, // Budgets, types et allocations
  { libelle: "Opérations", nomIcone: "transactions", route: "/operations", prefixes: ["/operations", "/operations-ussd"] }, // Dépenses et allocations
  { libelle: "Tableau", nomIcone: "graphique", route: "/tableau-de-bord", prefixes: [] }, // Tableau de bord (graphiques des indicateurs)
  { libelle: "Réglages", nomIcone: "reglages", route: "/reglages", prefixes: ["/reglages", "/solde", "/diagnostic", "/sauvegarde"] }, // Réglages, solde Mobile Money, diagnostic
]; // Fin de la liste

// Dit si un onglet correspond au chemin affiché.
export function ongletActifPour(onglet, chemin) { // Reçoit l'onglet et le chemin
  if (!onglet.route) return false; // Un onglet grisé n'est jamais actif
  if (chemin === onglet.route) return true; // Chemin identique à la route de l'onglet
  return (onglet.prefixes ?? []).some((p) => chemin === p || chemin.startsWith(`${p}/`)); // Ou chemin situé sous l'un de ses préfixes
} // Fin de ongletActifPour

// Construit la coque dans la racine et renvoie la zone de contenu, la mise en évidence de l'onglet actif et la mise à jour de la cloche d'alertes.
// « rafraichirAlertes » (facultatif) : fonction asynchrone qui recalcule les alertes ; elle est appelée à chaque ouverture de la cloche.
// « elementsSms » (facultatif) : éléments de l'icône « SMS à traiter » (bouton, fond, panneau), affichés en permanence à gauche de la cloche.
export function construireCoque(racine, onglets = ONGLETS, { rafraichirAlertes = null, elementsSms = [] } = {}) { // Racine, liste d'onglets et options
  const contenu = h("main", { id: "contenu", class: "contenu" }); // Zone où les écrans s'affichent
  const liens = onglets.map((onglet) => { // Fabrique un élément par onglet
    const corps = [icone(onglet.nomIcone, 26), h("span", {}, onglet.libelle)]; // Icône + texte
    if (!onglet.route) return h("span", { class: "onglet desactive", "aria-disabled": "true" }, ...corps); // Onglet grisé, non cliquable
    return h("a", { class: "onglet", href: `#${onglet.route}`, "data-route": onglet.route }, ...corps); // Onglet cliquable
  }); // Fin de la fabrication des onglets
  const barre = h("nav", { class: "barre-onglets", "aria-label": "Navigation principale" }, ...liens); // Barre du bas

  // --- Cloche d'alertes (en haut à droite) : toutes les alertes de l'application sont regroupées ici ---
  const badge = h("span", { class: "cloche-badge", hidden: true }); // Pastille avec le nombre d'alertes
  const cloche = h("button", { class: "cloche", type: "button", "aria-label": "Alertes", "aria-expanded": "false", "aria-haspopup": "dialog" }, icone("cloche", 24), badge); // Bouton rond
  const liste = h("div", { class: "panneau-alertes-liste" }); // Liste des alertes dans le panneau
  const fermer = h("button", { class: "panneau-alertes-fermer", type: "button" }, "Fermer"); // Bouton de fermeture
  const panneau = h("section", { class: "panneau-alertes", role: "dialog", "aria-label": "Alertes", hidden: true }, h("div", { class: "panneau-alertes-tete" }, h("h2", { class: "panneau-alertes-titre" }, "Alertes"), fermer), liste); // Panneau sous la cloche
  const voile = h("div", { class: "voile-alertes", hidden: true }); // Fond qui se ferme au toucher
  racine.replaceChildren(contenu, barre, cloche, ...elementsSms, voile, panneau); // Place la zone de contenu, la barre, la cloche, l'icône des SMS (si fournie) et le panneau dans la page

  const ouvert = () => !panneau.hidden; // Le panneau est-il affiché ?
  const fermerPanneau = () => { panneau.hidden = true; voile.hidden = true; cloche.setAttribute("aria-expanded", "false"); }; // Ferme le panneau
  const definirAlertes = (alertes) => { // Met à jour la pastille et le contenu du panneau
    const n = alertes.length; // Nombre d'alertes
    badge.textContent = n > 99 ? "99+" : String(n); // Texte de la pastille
    badge.hidden = n === 0; // Cachée quand il n'y a rien à signaler
    badge.classList.toggle("cloche-badge-danger", alertes.some((a) => a.niveau === "danger")); // Rouge s'il y a une alerte grave, orange sinon
    cloche.setAttribute("aria-label", n > 0 ? `Alertes, ${n} à voir` : "Alertes, aucune"); // Annonce le nombre aux lecteurs d'écran
    panneau.querySelector(".panneau-alertes-titre").textContent = n > 0 ? `Alertes (${n})` : "Alertes"; // Titre avec le nombre
    liste.replaceChildren(...(n === 0 ? [alerte({ niveau: "ok", message: "Aucune alerte pour le moment" })] : alertes.map((a) => alerte({ niveau: a.niveau, message: a.message, action: a.action })))); // Une alerte par problème, ou « aucune alerte »
  }; // Fin de definirAlertes
  cloche.addEventListener("click", async () => { // Touche de la cloche
    if (ouvert()) { fermerPanneau(); return; } // Déjà ouvert : referme
    if (rafraichirAlertes) { try { definirAlertes(await rafraichirAlertes()); } catch { /* les alertes affichées restent celles de la dernière mise à jour */ } } // Alertes à jour à chaque ouverture
    panneau.hidden = false; voile.hidden = false; cloche.setAttribute("aria-expanded", "true"); // Affiche le panneau
  }); // Fin du clic
  fermer.addEventListener("click", fermerPanneau); // Bouton « Fermer »
  voile.addEventListener("click", fermerPanneau); // Toucher à côté du panneau
  panneau.addEventListener("click", (e) => { if (e.target.closest("a")) fermerPanneau(); }); // Un lien d'action ferme le panneau puis ouvre l'écran voulu
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ouvert()) fermerPanneau(); }); // Touche Échap
  window.addEventListener("hashchange", fermerPanneau); // Tout changement d'écran ferme le panneau
  definirAlertes([]); // État de départ : aucune alerte

  const marquerActif = (chemin) => { // Met en évidence l'onglet de l'écran affiché
    barre.querySelectorAll("a.onglet").forEach((lien) => { // Pour chaque onglet cliquable
      const onglet = onglets.find((o) => o.route === lien.getAttribute("data-route")); // Retrouve sa description
      const actif = ongletActifPour(onglet, chemin); // Est-ce l'écran actuel ?
      lien.classList.toggle("actif", actif); // Ajoute ou retire la classe « actif »
      if (actif) lien.setAttribute("aria-current", "page"); else lien.removeAttribute("aria-current"); // Signale la page courante aux lecteurs d'écran
    }); // Fin de la boucle
  }; // Fin de marquerActif

  return { contenu, marquerActif, definirAlertes }; // Renvoie ce dont le reste de l'application a besoin
} // Fin de construireCoque
