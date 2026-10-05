// Écran d'accueil : solde Orange Money, alertes et tuiles d'accès.
import { h } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, tuile } from "../composants.js"; // Composants
import { animerCompteur } from "../animations.js"; // Animation du solde
import { formaterMontant } from "../../core/format.js"; // Formatage des montants
import { lireDernierSolde } from "../../core/soldes.js"; // Lecture du dernier solde

// Tuiles de l'accueil. Une tuile sans route est grisée « bientôt » (écran prévu dans un sprint suivant).
const TUILES = [ // Liste des tuiles
  { libelle: "Budgets", nomIcone: "budgets", couleur: "bleu", route: null }, // Sprint 4
  { libelle: "Allocations", nomIcone: "allocations", couleur: "vert", route: null }, // Sprint 5
  { libelle: "Opérations", nomIcone: "transactions", couleur: "orange", route: null }, // Sprint 5
  { libelle: "Types de budget", nomIcone: "types", couleur: "violet", route: null }, // Sprint 4
  { libelle: "Solde OM", nomIcone: "telephone", couleur: "rouge", route: null }, // Sprint 4
  { libelle: "Réglages", nomIcone: "reglages", couleur: "gris", route: "/reglages" }, // Disponible
]; // Fin de la liste

// Dessine l'écran d'accueil dans le conteneur.
export async function afficherAccueil(conteneur, { base }) { // Reçoit la zone et la base
  const solde = await lireDernierSolde(base); // Lit le dernier solde (null s'il n'y en a pas)
  const montant = h("div", { class: "solde-montant" }, formaterMontant(solde ? solde.balance : 0)); // Zone du montant
  const date = solde // Texte sous le montant
    ? `Au ${new Date(solde.datetime).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` // Date du solde en français
    : "Aucun solde enregistré"; // Message si aucun solde
  conteneur.append( // Ajoute les éléments de l'écran
    enteteEcran("Volako", "Votre budget, hors ligne"), // En-tête
    carte( // Carte du solde
      h("div", { class: "solde" }, // Bloc dégradé
        h("div", { class: "solde-libelle" }, "Solde Orange Money"), // Libellé
        montant, // Montant
        h("div", { class: "solde-date" }, date), // Date
      ), // Fin du bloc
    ), // Fin de la carte
    h("div", { class: "zone-alertes" }, alerte({ niveau: "ok", message: "Aucune alerte pour le moment" })), // Zone des alertes (alimentée au sprint 7)
    h("div", { class: "tuiles" }, ...TUILES.map(tuile)), // Grille de tuiles
  ); // Fin de l'ajout
  if (solde) animerCompteur(montant, solde.balance, formaterMontant); // Fait défiler le solde jusqu'à sa valeur
} // Fin de afficherAccueil
