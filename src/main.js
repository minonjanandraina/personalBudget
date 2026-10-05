import { ouvrirBase } from "./platform/base.js"; // Ouvre la base (SQLite Android ou navigateur)
import { appliquerMigrations } from "./core/db/migrations.js"; // Crée/met à jour les tables
import { construireCoque } from "./ui/coque.js"; // Zone de contenu + barre d'onglets
import { creerRouteur } from "./ui/routeur.js"; // Affichage de l'écran selon l'adresse
import { afficherAccueil } from "./ui/ecrans/accueil.js"; // Écran d'accueil
import { afficherReglages } from "./ui/ecrans/reglages.js"; // Écran des réglages
import { h } from "./ui/dom.js"; // Fabrication d'éléments

const racine = document.getElementById("app"); // Zone vide définie dans index.html

// Démarre l'application : ouvre la base, la met à jour, puis lance la navigation.
async function demarrer() { // Fonction asynchrone (la base répond avec un petit délai)
  try { // Tente le démarrage normal
    const base = await ouvrirBase(); // Ouvre la base
    await appliquerMigrations(base); // Applique les migrations en attente
    const { contenu, marquerActif } = construireCoque(racine); // Construit la coque (contenu + barre d'onglets)
    const routeur = creerRouteur({ // Crée le routeur
      conteneur: contenu, // Zone où les écrans s'affichent
      parDefaut: "/", // Écran affiché si l'adresse est inconnue
      auChangement: marquerActif, // Met à jour l'onglet actif à chaque changement d'écran
      routes: { // Liste des écrans
        "/": (zone) => afficherAccueil(zone, { base }), // Accueil
        "/reglages": (zone) => afficherReglages(zone, { base }), // Réglages
      }, // Fin des écrans
    }); // Fin du routeur
    await routeur.demarrer(); // Affiche le premier écran
  } catch (erreur) { // En cas de problème au démarrage
    racine.replaceChildren(h("main", { class: "contenu" }, h("section", { class: "carte visible" }, h("h1", { class: "titre" }, "Volako"), h("p", {}, "Erreur au démarrage :"), h("pre", {}, String(erreur?.message ?? erreur))))); // Affiche l'erreur à l'écran (utile sur téléphone, sans console)
  } // Fin du try/catch
} // Fin de demarrer

demarrer(); // Lance le démarrage
