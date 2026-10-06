// Allocation automatique à l'ouverture (rattrapage) : pour les budgets « allocation automatique », crée l'allocation de la période en cours
// si elle manque et reporte les reliquats des périodes terminées. Idempotent : sans danger si appelée à chaque ouverture.
// Exécutée seulement quand l'application est ouverte (décidé au sprint 11) : si le jour d'allocation est passé sans ouverture, elle se fait à la prochaine.
import { ErreurMetier } from "./erreurs.js"; // Erreur de règle de gestion
import { lancerAllocationPeriode } from "./reallocation.js"; // Lancement de la période (tout ou rien pour l'argent frais)

// Lance l'allocation des budgets automatiques. Ne lance jamais d'erreur. Renvoie { faits, erreur, resultats } :
// « faits » = nombre de budgets réellement alloués ou dont un reliquat a été reporté ; « erreur » = message si rien n'a pu être écrit (ex. libre insuffisant).
export async function allocationAutomatique(base, maintenant = new Date()) { // Reçoit la base et l'heure
  try { // Une erreur ne doit jamais gêner l'ouverture de l'application
    const { resultats } = await lancerAllocationPeriode(base, maintenant, { seulementAuto: true }); // Budgets automatiques seulement
    const faits = resultats.filter((r) => r.statut === "alloue" || r.statut === "reporte").length; // Budgets modifiés
    const problemes = resultats.filter((r) => r.statut === "erreur" || r.statut === "refuse"); // Budgets refusés (ex. solde minimal) ou en échec inattendu
    return { faits, erreur: problemes.length > 0 ? problemes.map((r) => `${r.nom} : ${r.raison}`).join(" ") : null, resultats }; // Résultat
  } catch (erreur) { // Refus de règle de gestion (aucun solde OM, libre insuffisant…) ou problème inattendu
    return { faits: 0, erreur: erreur instanceof ErreurMetier ? erreur.message : String(erreur?.message ?? erreur), resultats: [] }; // Message à montrer
  } // Fin du try/catch
} // Fin de allocationAutomatique
