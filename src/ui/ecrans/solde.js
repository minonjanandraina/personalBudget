// Écrans du solde Mobile Money : historique et saisie manuelle.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonIcone, boutonPrincipal, champ } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre, lireMontant, effacerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { datetimeLocalVersIso, isoVersDatetimeLocal, afficherDateHeure } from "../../core/dates.js"; // Conversions de dates
import { creerSolde, listerSoldes, supprimerSolde } from "../../core/soldes.js"; // Logique métier des soldes

// Historique des soldes, du plus récent au plus ancien.
export async function afficherSoldes(zone, { base }) { // Reçoit la zone et la base
  const soldes = await listerSoldes(base); // Lit l'historique
  zone.append(enteteEcran("Solde Mobile Money", "Historique des soldes", { retour: "/reglages" }), boutonLien("Saisir un solde", "/solde/nouveau", "ajouter")); // En-tête et bouton d'ajout
  if (soldes.length === 0) zone.append(h("div", { class: "espace-haut" }, alerte({ niveau: "info", message: "Aucun solde enregistré. Saisissez le solde actuel de votre compte Mobile Money." }))); // Message si la liste est vide
  for (const s of soldes) { // Pour chaque solde
    const supprimer = async () => { // Action de suppression
      const ok = await confirmer({ titre: "Supprimer ce solde ?", message: `${formaterMontant(s.balance)} du ${afficherDateHeure(s.datetime)} sera retiré de l'historique.`, libelleOk: "Supprimer", danger: true }); // Demande confirmation
      if (!ok) return; // Annulé : on s'arrête
      await supprimerSolde(base, s.id); // Supprime
      afficherToast("Solde supprimé.", "succes"); // Confirme
      vider(zone); // Efface l'écran
      await afficherSoldes(zone, { base }); // Le redessine à jour
    }; // Fin de supprimer
    zone.append(h("div", { class: "carte ligne apparition" }, // Une carte par solde
      h("div", { class: "ligne-texte" }, h("div", { class: "ligne-titre ligne-montant" }, formaterMontant(s.balance)), h("div", { class: "ligne-detail" }, afficherDateHeure(s.datetime))), // Montant et date
      boutonIcone({ nomIcone: "supprimer", libelle: "Supprimer ce solde", auClic: supprimer, danger: true }), // Bouton supprimer
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de afficherSoldes

// Formulaire de saisie manuelle d'un solde.
export async function afficherFormulaireSolde(zone, { base }) { // Reçoit la zone et la base
  zone.append(enteteEcran("Saisir un solde", null, { retour: "/solde" })); // En-tête
  const champs = { // Champs du formulaire
    datetime: champ({ id: "solde-date", libelle: "Date et heure du solde", type: "datetime-local", valeur: isoVersDatetimeLocal(new Date().toISOString()) }), // Date et heure, préremplies à maintenant
    balance: champ({ id: "solde-montant", libelle: "Solde disponible (Ar)", inputmode: "numeric", aide: "Montant affiché sur votre compte Mobile Money" }), // Montant
  }; // Fin des champs
  const enregistrer = () => { // Enregistre le formulaire
    effacerErreurs(champs); // Repart sans erreur affichée
    const balance = lireMontant(champs.balance); // Lit le montant (affiche l'erreur de format)
    const datetime = datetimeLocalVersIso(champs.datetime.lire()); // Convertit la date en ISO UTC
    if (datetime === null) champs.datetime.afficherErreur("La date et l'heure sont invalides."); // Date illisible
    if (balance === null || datetime === null) { afficherToast("Corrigez les champs en rouge.", "erreur"); return Promise.resolve(false); } // Arrête si un champ est illisible
    return soumettre({ // Enregistre
      champs, // Champs à surveiller
      action: () => creerSolde(base, { datetime, balance }), // Création du solde
      messageSucces: "Solde enregistré.", // Message de succès
      routeSucces: "/solde", // Retour à l'historique
    }); // Fin de l'enregistrement
  }; // Fin de enregistrer
  zone.append(carte(champs.datetime.element, champs.balance.element, boutonPrincipal("Enregistrer", enregistrer))); // Carte du formulaire
} // Fin de afficherFormulaireSolde
