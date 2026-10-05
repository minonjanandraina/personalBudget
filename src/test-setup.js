// Réglage commun à tous les tests : rend les attentes (vi.waitFor) tolérantes quand le PC est occupé.
// Par défaut, une attente abandonne après 1 seconde, ce qui peut échouer par hasard sur une machine chargée.
import { vi } from "vitest"; // Outils de test

const attendreOrigine = vi.waitFor.bind(vi); // Mémorise la fonction d'attente d'origine

// Remplace vi.waitFor : attente jusqu'à 5 secondes, avec un contrôle toutes les 25 ms (le test reste rapide quand tout va bien).
vi.waitFor = (fonction, options = {}) => { // Reçoit la vérification et ses options
  const personnalisees = typeof options === "number" ? { timeout: options } : options; // Accepte aussi un simple nombre de millisecondes
  return attendreOrigine(fonction, { timeout: 5000, interval: 25, ...personnalisees }); // Applique les valeurs par défaut sauf si le test précise les siennes
}; // Fin du remplacement
