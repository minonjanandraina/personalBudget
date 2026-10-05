// Routeur : affiche l'écran qui correspond à l'adresse (la partie après # dans l'URL).
// Exemple : l'adresse « #/reglages » affiche l'écran des réglages. Le bouton Retour d'Android fonctionne tout seul.
import { vider } from "./dom.js"; // Outil pour vider une zone
import { apparaitreEnCascade } from "./animations.js"; // Animation d'apparition
import { alerte } from "./composants.js"; // Bandeau d'alerte (pour afficher une erreur d'écran)

// Crée un routeur. « routes » associe une adresse à une fonction qui dessine l'écran.
export function creerRouteur({ routes, conteneur, parDefaut = "/", auChangement = null }) { // Configuration du routeur
  const routeDemandee = () => window.location.hash.slice(1) || "/"; // Lit l'adresse après le # (« / » si vide)

  const afficher = async () => { // Dessine l'écran correspondant à l'adresse actuelle
    const demandee = routeDemandee(); // Adresse demandée
    const route = routes[demandee] ? demandee : parDefaut; // Adresse inconnue : retombe sur l'écran par défaut
    vider(conteneur); // Efface l'écran précédent
    try { // Tente de dessiner le nouvel écran
      await routes[route](conteneur); // Appelle la fonction de l'écran
    } catch (erreur) { // Si l'écran plante
      conteneur.append(alerte({ niveau: "danger", message: `Erreur d'affichage : ${erreur?.message ?? erreur}` })); // Montre l'erreur au lieu d'un écran blanc
    } // Fin du try/catch
    apparaitreEnCascade(conteneur); // Lance l'animation d'apparition
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0); // Remonte en haut de page
    if (auChangement) auChangement(route); // Prévient que l'écran a changé (pour la barre d'onglets)
  }; // Fin de afficher

  return { // Fonctions offertes par le routeur
    demarrer() { // Démarre le routeur
      window.addEventListener("hashchange", afficher); // Réagit à chaque changement d'adresse
      return afficher(); // Affiche l'écran initial
    }, // Fin de demarrer
    naviguer(route) { // Va vers un écran
      window.location.hash = route; // Change l'adresse : le routeur réagit tout seul
    }, // Fin de naviguer
    arreter() { // Arrête d'écouter (utile aux tests)
      window.removeEventListener("hashchange", afficher); // Retire l'écouteur
    }, // Fin de arreter
  }; // Fin de l'objet
} // Fin de creerRouteur
