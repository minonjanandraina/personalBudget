// Aide pour les tests d'interface : ouvre la cloche d'alertes de la coque, comme le ferait l'utilisateur, et renvoie la racine pour inspecter le panneau.
import { construireCoque } from "./coque.js"; // Coque (cloche et panneau d'alertes)
import { calculerAlertes } from "../core/alertes.js"; // Alertes actuelles

// Construit la coque, touche la cloche et attend que le panneau soit rempli. Renvoie la racine de la page de test.
export async function ouvrirCloche(base) { // Reçoit la base
  document.body.querySelectorAll(".racine-test").forEach((r) => r.remove()); // Retire une coque précédente
  const racine = document.createElement("div"); // Racine de la coque de test
  racine.className = "racine-test"; // Repère pour la retrouver
  document.body.append(racine); // La place dans la page
  construireCoque(racine, undefined, { rafraichirAlertes: () => calculerAlertes(base) }); // Coque avec calcul des alertes à l'ouverture
  racine.querySelector(".cloche").click(); // Touche la cloche
  await new Promise((r) => setTimeout(r, 30)); // Laisse le calcul des alertes se terminer
  return racine; // Racine pour inspection
} // Fin de ouvrirCloche

// Texte du panneau d'alertes après ouverture de la cloche.
export async function texteAlertes(base) { // Reçoit la base
  return (await ouvrirCloche(base)).querySelector(".panneau-alertes").textContent; // Texte du panneau
} // Fin de texteAlertes
