// Animations légères. Toutes sont désactivées si le téléphone demande de « réduire les animations ».

// Dit si l'utilisateur a demandé de réduire les animations.
export function animationsReduites() { // Aucun paramètre
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; // true si la préférence est active
} // Fin de animationsReduites

// Fait apparaître en cascade les éléments portant la classe « apparition ».
export function apparaitreEnCascade(racine = document) { // Zone à parcourir (toute la page par défaut)
  const elements = racine.querySelectorAll(".apparition:not(.visible)"); // Éléments pas encore affichés
  elements.forEach((element, rang) => { // Pour chaque élément, avec son rang
    if (animationsReduites()) { // Si les animations sont réduites
      element.classList.add("visible"); // Affiche tout de suite
      return; // Passe au suivant
    } // Fin du cas
    setTimeout(() => element.classList.add("visible"), 60 * rang); // Sinon décale chaque élément de 60 ms
  }); // Fin de la boucle
} // Fin de apparaitreEnCascade

// Fait « défiler » un nombre de 0 jusqu'à sa valeur dans un élément.
export function animerCompteur(element, valeurFinale, formater, dureeMs = 800) { // Élément, valeur, fonction de formatage, durée
  if (animationsReduites() || typeof requestAnimationFrame !== "function") { // Pas d'animation possible ou souhaitée
    element.textContent = formater(valeurFinale); // Affiche directement la valeur finale
    return; // Terminé
  } // Fin du cas
  let debut = null; // Heure de départ (inconnue au début)
  const etape = (maintenant) => { // Fonction appelée à chaque image
    if (debut === null) debut = maintenant; // Mémorise l'heure de la première image
    const progression = Math.min((maintenant - debut) / dureeMs, 1); // Avancement de 0 à 1
    const adoucie = 1 - Math.pow(1 - progression, 3); // Courbe qui ralentit à la fin
    element.textContent = formater(Math.round(valeurFinale * adoucie)); // Affiche la valeur intermédiaire (toujours entière)
    if (progression < 1) requestAnimationFrame(etape); // Continue tant que ce n'est pas fini
  }; // Fin de etape
  requestAnimationFrame(etape); // Lance l'animation
} // Fin de animerCompteur
