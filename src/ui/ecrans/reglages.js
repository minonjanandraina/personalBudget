// Écran des réglages : jour de l'allocation automatique et accès aux autres écrans.
import { h } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, boutonLien, boutonPrincipal, champ, tuilePlate } from "../composants.js"; // Composants
import { soumettre } from "../formulaire.js"; // Enregistrement de formulaire
import { lireJourJob, modifierJourJob } from "../../core/parametres.js"; // Paramètre du jour de lancement
import { analyserMontant } from "../../core/format.js"; // Lecture d'un entier saisi

// Dessine l'écran des réglages dans le conteneur.
export async function afficherReglages(conteneur, { base }) { // Reçoit la zone et la base
  const jour = await lireJourJob(base); // Jour actuellement réglé
  const champJour = champ({ id: "reglage-jour", libelle: "Jour du mois", valeur: String(jour), inputmode: "numeric", aide: "L'allocation et la réallocation des budgets se lancent ce jour-là chaque mois (de 1 à 28)." }); // Champ du jour
  const champs = { jour: champJour }; // Dictionnaire des champs (pour l'affichage des erreurs)
  const enregistrer = () => { // Enregistre le réglage
    champJour.effacerErreur(); // Retire une erreur précédente
    const lu = analyserMontant(champJour.lire()); // Lit le nombre saisi
    if (lu.erreur) { champJour.afficherErreur(lu.erreur); return Promise.resolve(false); } // Saisie illisible : message sous le champ
    return soumettre({ champs, action: () => modifierJourJob(base, lu.valeur), messageSucces: "Réglage enregistré." }); // Enregistre (reste sur l'écran)
  }; // Fin de enregistrer
  conteneur.append( // Assemble l'écran
    enteteEcran("Réglages", "Votre application"), // En-tête
    carte(h("h2", { class: "carte-titre" }, "Allocation automatique"), champJour.element, boutonPrincipal("Enregistrer", enregistrer)), // Carte du jour de lancement
    h("div", { class: "mosaique espace-haut" }, // Sous-menu en mosaïque : icônes sans contour ni couleur
      tuilePlate({ libelle: "Sauvegarde et restauration", nomIcone: "sauvegarde", route: "/sauvegarde" }), // Sauvegarde des données
      tuilePlate({ libelle: "Verrouillage par PIN", nomIcone: "info", route: "/verrou" }), // Code PIN de l'application
      tuilePlate({ libelle: "Consultation du solde (USSD)", nomIcone: "telephone", route: "/ussd" }), // Code USSD et consultation du solde (PIN demandé à chaque fois)
      tuilePlate({ libelle: "Solde Mobile Money", nomIcone: "argent", route: "/solde" }), // Historique des soldes
      tuilePlate({ libelle: "Types de budget", nomIcone: "types", route: "/types-budget" }), // Types de budget
      tuilePlate({ libelle: "Diagnostic et essais", nomIcone: "reglages", route: "/diagnostic" }), // Diagnostic
    ), // Fin de la mosaïque
  ); // Fin de l'assemblage
} // Fin de afficherReglages
