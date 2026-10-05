// Écran de diagnostic : état de la base de données et essai des composants d'interface.
import { h } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, boutonPrincipal, champ } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { lireVersion } from "../../core/db/migrations.js"; // Version de la base

// Dessine l'écran de diagnostic dans le conteneur.
export async function afficherDiagnostic(conteneur, { base }) { // Reçoit la zone et la base
  const version = await lireVersion(base); // Version actuelle du schéma
  const comptes = await base.requeter("SELECT (SELECT COUNT(*) FROM type_budget) AS types, (SELECT COUNT(*) FROM budget) AS budgets, (SELECT COUNT(*) FROM solde_om) AS soldes"); // Compte les enregistrements (preuve que la base répond)

  const diagnostic = carte( // Carte de diagnostic
    h("h2", { class: "carte-titre" }, "Diagnostic de la base"), // Titre
    h("ul", { class: "liste-diagnostic" }, // Liste des constats
      h("li", {}, `Moteur : ${base.nom}`), // Moteur de base de données
      h("li", {}, `Version du schéma : ${version}`), // Version du schéma
      h("li", {}, `Liens entre tables contrôlés : ${base.cleEtrangeresActives ? "oui" : "NON"}`), // Contrôle des clés étrangères
      h("li", {}, `Types de budget : ${Number(comptes[0].types)}`), // Nombre de types
      h("li", {}, `Budgets : ${Number(comptes[0].budgets)}`), // Nombre de budgets
      h("li", {}, `Soldes enregistrés : ${Number(comptes[0].soldes)}`), // Nombre de soldes
    ), // Fin de la liste
  ); // Fin de la carte

  const champDemo = champ({ id: "demo-montant", libelle: "Montant (essai)", inputmode: "numeric", aide: "Entier positif, sans virgule" }); // Champ d'essai
  const verifier = () => { // Vérifie la saisie du champ d'essai
    champDemo.effacerErreur(); // Retire une éventuelle erreur précédente
    const texte = champDemo.lire().trim(); // Lit la saisie sans espaces autour
    if (!/^\d+$/.test(texte)) { // Seuls des chiffres sont acceptés
      champDemo.afficherErreur("Saisissez un nombre entier positif."); // Message d'erreur sous le champ
      return; // Arrête là
    } // Fin du cas invalide
    afficherToast(`Montant accepté : ${texte}`, "succes"); // Confirme visuellement
  }; // Fin de verifier

  const essai = carte( // Carte d'essai des composants
    h("h2", { class: "carte-titre" }, "Essai de l'interface"), // Titre
    h("div", { class: "groupe" }, // Groupe de boutons
      boutonPrincipal("Notification de succès", () => afficherToast("Enregistré avec succès", "succes")), // Toast de succès
      boutonPrincipal("Notification d'erreur", () => afficherToast("Une erreur est survenue", "erreur")), // Toast d'erreur
      boutonPrincipal("Demander confirmation", async () => { // Fenêtre de confirmation
        const reponse = await confirmer({ titre: "Supprimer ?", message: "Cette action est définitive.", libelleOk: "Supprimer", danger: true }); // Attend la réponse
        afficherToast(reponse ? "Confirmé" : "Annulé", reponse ? "succes" : "info"); // Affiche la réponse choisie
      }, { danger: true }), // Bouton rouge
    ), // Fin du groupe
    champDemo.element, // Champ d'essai
    boutonPrincipal("Vérifier le montant", verifier), // Bouton de vérification
  ); // Fin de la carte

  conteneur.append(enteteEcran("Diagnostic", "État de la base et essais", { retour: "/reglages" }), diagnostic, essai); // Assemble l'écran
} // Fin de afficherDiagnostic
