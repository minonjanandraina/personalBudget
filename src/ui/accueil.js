import { formaterMontant } from "../core/format.js"; // Reprend la fonction de formatage de la logique métier

// Dessine l'écran d'accueil dans l'élément reçu.
export function afficherAccueil(conteneur) { // Reçoit la zone où dessiner
  conteneur.innerHTML = ` 
    <h1>Gestion de Budget</h1>
    <section class="carte">
      <p>Solde Orange Money</p>
      <strong>${formaterMontant(0)}</strong>
    </section>
  `; // Remplace le contenu de la zone par le titre et une carte de solde à 0
} // Fin de la fonction
