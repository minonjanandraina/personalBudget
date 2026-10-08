// Écran d'accueil : solde Mobile Money disponible, argent réservé dans les budgets (détaillé par budget au toucher), alertes et tuiles.
import { h } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, tuile } from "../composants.js"; // Composants
import { icone } from "../icones.js"; // Icônes
import { animerCompteur } from "../animations.js"; // Animation du solde
import { formaterMontant } from "../../core/format.js"; // Formatage des montants
import { afficherDateHeure } from "../../core/dates.js"; // Date lisible
import { situationFinanciere, soldesParBudget } from "../../core/soldes.js"; // Situation financière et détail par budget
import { calculerAlertes } from "../../core/alertes.js"; // Alertes actuelles

// Tuiles de l'accueil. Une tuile sans route est grisée « bientôt » (écran prévu dans un sprint suivant).
const TUILES = [ // Liste des tuiles
  { libelle: "Budgets", nomIcone: "budgets", couleur: "bleu", route: "/budgets" }, // Liste des budgets
  { libelle: "Allocations", nomIcone: "allocations", couleur: "vert", route: "/allocations" }, // Situation des budgets
  { libelle: "Opérations", nomIcone: "transactions", couleur: "orange", route: "/operations" }, // Dépenses et allocations
  { libelle: "Types de budget", nomIcone: "types", couleur: "violet", route: "/types-budget" }, // Types de budget
  { libelle: "Solde Mobile Money", nomIcone: "telephone", couleur: "rouge", route: "/solde" }, // Historique des soldes
  { libelle: "SMS Mobile Money", nomIcone: "message", couleur: "bleu", route: "/sms" }, // Import des SMS
  { libelle: "Opérations USSD", nomIcone: "telephone", couleur: "vert", route: "/operations-ussd" }, // Retrait, paiement… par code USSD
  { libelle: "Réglages", nomIcone: "reglages", couleur: "gris", route: "/reglages" }, // Disponible
]; // Fin de la liste

// Carte du solde Mobile Money disponible (dernier solde moins les dépenses saisies depuis).
function carteSoldeMM(mm) { // Reçoit le solde Mobile Money disponible (ou null)
  if (mm === null) { // Aucun solde saisi
    return carte(h("a", { class: "solde", href: "#/solde/nouveau" }, // Bloc dégradé qui mène à la saisie
      h("div", { class: "solde-libelle" }, "Solde Mobile Money"), // Libellé
      h("div", { class: "solde-montant" }, formaterMontant(0)), // Montant à 0
      h("div", { class: "solde-date" }, "Aucun solde enregistré — touchez pour en saisir un"), // Invitation
    )); // Fin de la carte
  } // Fin du cas sans solde
  const montant = h("div", { class: "solde-montant" }, formaterMontant(mm.disponible)); // Zone du montant disponible
  animerCompteur(montant, mm.disponible, formaterMontant); // Fait défiler le montant jusqu'à sa valeur
  const detail = mm.depensesDepuis > 0 // Texte sous le montant
    ? `Dernier solde ${formaterMontant(mm.dernierSolde)} (${afficherDateHeure(mm.datetime)}) − ${formaterMontant(mm.depensesDepuis)} de dépenses depuis` // Avec les dépenses retirées
    : `Au ${afficherDateHeure(mm.datetime)}`; // Sans dépense depuis
  return carte(h("a", { class: "solde", href: "#/solde" }, // Bloc dégradé (touchable : ouvre l'historique des soldes)
    h("div", { class: "solde-libelle" }, "Solde Mobile Money disponible"), // Libellé
    montant, // Montant
    h("div", { class: "solde-date" }, detail), // Détail du calcul
  )); // Fin de la carte
} // Fin de carteSoldeMM

// Carte « réservé dans les budgets » : touchez pour voir le solde de chaque budget (alloué moins dépensé).
function carteReserve(situation, detail) { // Reçoit la situation d'ensemble et le détail par budget
  const liste = h("div", { class: "reserve-detail", id: "reserve-detail", hidden: true }, // Liste cachée au départ
    detail.length === 0 ? h("div", { class: "ligne-detail" }, "Aucun budget.") : detail.map((d) => h("div", { class: "reserve-ligne" }, // Une ligne par budget
      h("div", { class: "ligne-texte" }, h("div", { class: "ligne-titre" }, d.name), h("div", { class: "ligne-detail" }, `alloué ${formaterMontant(d.alloue)} − dépensé ${formaterMontant(d.depense)}`)), // Nom et calcul
      h("strong", {}, formaterMontant(d.solde)), // Solde du budget
    )), // Fin des lignes
  ); // Fin de la liste
  const bascule = h("button", { class: "reserve-bascule", type: "button", "aria-expanded": "false", "aria-controls": "reserve-detail", onclick: () => { // Bouton qui déplie ou replie la liste
    const ouvert = bascule.getAttribute("aria-expanded") === "true"; // Est-elle ouverte ?
    bascule.setAttribute("aria-expanded", ouvert ? "false" : "true"); // Inverse l'état
    liste.hidden = ouvert; // Cache ou montre la liste
  } }, // Fin du bouton
    h("div", { class: "ligne-texte" }, h("div", { class: "ligne-detail" }, "Réservé dans les budgets"), h("div", { class: "reserve-montant" }, formaterMontant(situation.reserve))), // Libellé et montant réservé
    h("span", { class: "reserve-fleche" }, icone("chevron", 22)), // Flèche qui pivote quand c'est ouvert
  ); // Fin du bouton
  const libre = situation.libre; // Solde libre à allouer (null si aucun solde Mobile Money)
  return carte( // Carte complète
    bascule, // Bouton de dépliage
    libre === null ? null : h("div", { class: "reserve-libre" }, h("span", {}, "Libre à allouer"), h("strong", { class: libre < 0 ? "montant-moins" : "" }, formaterMontant(libre))), // Solde libre
    liste, // Liste par budget
  ); // Fin de la carte
} // Fin de carteReserve

// Dessine l'écran d'accueil dans le conteneur.
export async function afficherAccueil(conteneur, { base }) { // Reçoit la zone et la base
  const situation = await situationFinanciere(base); // Solde Mobile Money disponible, réservé et libre
  const detail = await soldesParBudget(base); // Solde de chaque budget
  const alertes = await calculerAlertes(base); // Alertes actuelles
  conteneur.append( // Ajoute les éléments de l'écran
    enteteEcran("Volako", "Votre budget, hors ligne"), // En-tête
    carteSoldeMM(situation.mm), // Solde Mobile Money disponible
    carteReserve(situation, detail), // Argent réservé dans les budgets
    h("div", { class: "zone-alertes" }, // Zone des alertes
      alertes.length > 0 ? h("h2", { class: "section-titre" }, `Alertes (${alertes.length})`) : null, // Titre avec le nombre d'alertes
      alertes.length === 0 ? alerte({ niveau: "ok", message: "Aucune alerte pour le moment" }) : alertes.map((a) => alerte({ niveau: a.niveau, message: a.message, action: a.action })), // Une alerte par problème, ou « aucune alerte »
    ), // Fin de la zone des alertes
    h("div", { class: "tuiles" }, ...TUILES.map(tuile)), // Grille de tuiles
  ); // Fin de l'ajout
} // Fin de afficherAccueil
