import { afficherAccueil } from "./ui/accueil.js"; // Importe l'écran d'accueil
import { ouvrirBase } from "./platform/base.js"; // Ouvre la base (SQLite Android ou navigateur)
import { appliquerMigrations } from "./core/db/migrations.js"; // Crée/met à jour les tables

const conteneur = document.getElementById("app"); // Récupère la zone vide définie dans index.html

// Démarre l'application : ouvre la base, la met à jour, affiche l'accueil.
async function demarrer() { // Fonction asynchrone (la base répond avec un petit délai)
  try { // Tente le démarrage normal
    const base = await ouvrirBase(); // Ouvre la base
    await appliquerMigrations(base); // Applique les migrations en attente
    await afficherAccueil(conteneur, base); // Dessine l'accueil
  } catch (erreur) { // En cas de problème
    conteneur.innerHTML = `<h1>Volako</h1><section class="carte"><p><strong>Erreur au démarrage</strong></p><pre>${String(erreur?.message ?? erreur)}</pre></section>`; // Affiche l'erreur à l'écran (utile sur téléphone, sans console)
  } // Fin du try/catch
} // Fin de demarrer

demarrer(); // Lance le démarrage
