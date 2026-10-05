// Aides communes aux écrans de formulaire : affichage des erreurs sous les champs et enregistrement.
import { ErreurValidation, ErreurMetier } from "../core/erreurs.js"; // Erreurs « normales » de l'application
import { analyserMontant } from "../core/format.js"; // Lecture d'un montant saisi
import { afficherToast } from "./messages.js"; // Notifications
import { aller } from "./routeur.js"; // Navigation

// Retire toutes les erreurs affichées sous les champs.
export function effacerErreurs(champs) { // Reçoit le dictionnaire nom -> champ
  Object.values(champs).forEach((c) => c.effacerErreur()); // Efface l'erreur de chaque champ
} // Fin de effacerErreurs

// Affiche chaque erreur sous son champ. Renvoie les messages qui ne correspondent à aucun champ.
export function appliquerErreurs(champs, erreurs) { // Champs et erreurs par nom
  const orphelins = []; // Messages sans champ associé
  for (const [nom, message] of Object.entries(erreurs)) { // Pour chaque erreur
    if (champs[nom]) champs[nom].afficherErreur(message); // L'affiche sous son champ
    else orphelins.push(message); // Sinon la garde à part
  } // Fin de la boucle
  return orphelins; // Renvoie les messages sans champ
} // Fin de appliquerErreurs

// Lit un champ de montant. Affiche l'erreur sous le champ et renvoie null si la saisie est invalide.
export function lireMontant(champ) { // Reçoit le contrôle du champ
  const resultat = analyserMontant(champ.lire()); // Analyse le texte saisi
  if (resultat.erreur) { // Saisie invalide
    champ.afficherErreur(resultat.erreur); // Affiche le message sous le champ
    return null; // Signale l'échec
  } // Fin du cas invalide
  return resultat.valeur; // Montant entier valide
} // Fin de lireMontant

// Exécute l'enregistrement d'un formulaire et gère les erreurs de façon uniforme.
// « action » fait le travail ; en cas de succès : notification puis retour à « routeSucces » (si fournie).
export async function soumettre({ champs, action, messageSucces, routeSucces = null }) { // Description de l'enregistrement
  effacerErreurs(champs); // Repart sans erreur affichée
  try { // Tente l'enregistrement
    await action(); // Lance le travail
  } catch (erreur) { // Si quelque chose est refusé
    if (erreur instanceof ErreurValidation) { // Saisie incorrecte
      const orphelins = appliquerErreurs(champs, erreur.erreurs); // Affiche sous les champs
      afficherToast(orphelins[0] ?? "Corrigez les champs en rouge.", "erreur"); // Notification de rappel
    } else if (erreur instanceof ErreurMetier) { // Règle de gestion
      afficherToast(erreur.message, "erreur"); // Message tel quel
    } else { // Vrai problème inattendu
      afficherToast(`Erreur inattendue : ${erreur?.message ?? erreur}`, "erreur"); // Montre la cause
    } // Fin des cas d'erreur
    return false; // Échec
  } // Fin du try/catch
  afficherToast(messageSucces, "succes"); // Confirme l'enregistrement
  if (routeSucces) aller(routeSucces); // Retourne à l'écran suivant
  return true; // Succès
} // Fin de soumettre
