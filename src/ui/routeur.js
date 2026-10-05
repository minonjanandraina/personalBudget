// Routeur : affiche l'écran qui correspond à l'adresse (la partie après # dans l'URL).
// Exemple : l'adresse « #/reglages » affiche l'écran des réglages. Le bouton Retour d'Android fonctionne tout seul.
// Une route peut contenir des paramètres : « /budgets/:id » correspond à « /budgets/12 » (params.id = "12").
import { vider } from "./dom.js"; // Outil pour vider une zone
import { apparaitreEnCascade } from "./animations.js"; // Animation d'apparition
import { alerte } from "./composants.js"; // Bandeau d'alerte (pour afficher une erreur d'écran)

// Va vers un écran (change l'adresse ; le routeur réagit tout seul).
export function aller(route) { // Reçoit la route, ex. "/budgets"
  window.location.hash = route; // Change l'adresse
} // Fin de aller

// Cherche la route qui correspond au chemin demandé. Renvoie { cle, params } ou null.
export function trouverRoute(routes, chemin) { // Reçoit la table des routes et le chemin
  if (routes[chemin]) return { cle: chemin, params: {} }; // Correspondance exacte (sans paramètre)
  const segmentsChemin = chemin.split("/"); // Découpe le chemin demandé en morceaux
  for (const cle of Object.keys(routes)) { // Parcourt chaque route déclarée
    const segmentsCle = cle.split("/"); // Découpe la route déclarée
    if (segmentsCle.length !== segmentsChemin.length) continue; // Pas le même nombre de morceaux : ne correspond pas
    const params = {}; // Paramètres extraits
    const correspond = segmentsCle.every((segment, i) => { // Compare morceau par morceau
      if (segment.startsWith(":")) { // Morceau variable (ex. :id)
        if (segmentsChemin[i] === "") return false; // Un paramètre ne peut pas être vide
        params[segment.slice(1)] = decodeURIComponent(segmentsChemin[i]); // Mémorise la valeur
        return true; // Correspond
      } // Fin du cas variable
      return segment === segmentsChemin[i]; // Morceau fixe : doit être identique
    }); // Fin de la comparaison
    if (correspond) return { cle, params }; // Route trouvée
  } // Fin de la boucle
  return null; // Aucune route ne correspond
} // Fin de trouverRoute

// Crée un routeur. « routes » associe une adresse à une fonction (zone, { params }) qui dessine l'écran.
export function creerRouteur({ routes, conteneur, parDefaut = "/", auChangement = null }) { // Configuration du routeur
  const cheminDemande = () => window.location.hash.slice(1) || "/"; // Lit l'adresse après le # (« / » si vide)

  const afficher = async () => { // Dessine l'écran correspondant à l'adresse actuelle
    const demande = cheminDemande(); // Adresse demandée
    const trouvee = trouverRoute(routes, demande); // Cherche l'écran correspondant
    const chemin = trouvee ? demande : parDefaut; // Adresse inconnue : retombe sur l'écran par défaut
    const { cle, params } = trouvee ?? { cle: parDefaut, params: {} }; // Route et paramètres à utiliser
    vider(conteneur); // Efface l'écran précédent
    try { // Tente de dessiner le nouvel écran
      await routes[cle](conteneur, { params }); // Appelle la fonction de l'écran
    } catch (erreur) { // Si l'écran plante
      conteneur.append(alerte({ niveau: "danger", message: `Erreur d'affichage : ${erreur?.message ?? erreur}` })); // Montre l'erreur au lieu d'un écran blanc
    } // Fin du try/catch
    apparaitreEnCascade(conteneur); // Lance l'animation d'apparition
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0); // Remonte en haut de page
    if (auChangement) auChangement(chemin); // Prévient que l'écran a changé (pour la barre d'onglets)
  }; // Fin de afficher

  return { // Fonctions offertes par le routeur
    demarrer() { // Démarre le routeur
      window.addEventListener("hashchange", afficher); // Réagit à chaque changement d'adresse
      return afficher(); // Affiche l'écran initial
    }, // Fin de demarrer
    naviguer: aller, // Va vers un écran
    arreter() { // Arrête d'écouter (utile aux tests)
      window.removeEventListener("hashchange", afficher); // Retire l'écouteur
    }, // Fin de arreter
  }; // Fin de l'objet
} // Fin de creerRouteur
