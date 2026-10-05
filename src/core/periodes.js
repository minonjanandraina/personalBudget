// Périodes d'allocation : du jour J d'un mois au jour J-1 du mois suivant (J = jour réglé, de 1 à 28).
// Exemple avec J = 20 : du 20 octobre au 19 novembre. Les jours sont au format texte « AAAA-MM-JJ » (heure locale du téléphone).

const deuxChiffres = (n) => String(n).padStart(2, "0"); // Complète avec un zéro : 5 -> "05"

// Transforme une date en texte « AAAA-MM-JJ » à l'heure locale.
export function formaterJour(date) { // Reçoit une date
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}`; // Assemble année, mois, jour
} // Fin de formaterJour

// Jour local (AAAA-MM-JJ) d'un instant donné en texte ISO UTC.
export function jourLocal(iso) { // Reçoit le texte ISO
  return formaterJour(new Date(iso)); // Convertit à l'heure locale puis formate
} // Fin de jourLocal

// Période (début et fin) qui contient la date donnée, pour un jour de lancement donné.
export function periodePour(jourJob, date = new Date()) { // Jour réglé et date de référence
  const debut = date.getDate() >= jourJob // La période commence ce mois-ci si on a atteint le jour J...
    ? new Date(date.getFullYear(), date.getMonth(), jourJob) // ...le jour J de ce mois
    : new Date(date.getFullYear(), date.getMonth() - 1, jourJob); // ...sinon le jour J du mois précédent
  const fin = new Date(debut.getFullYear(), debut.getMonth() + 1, jourJob - 1); // Fin = veille du jour J du mois suivant (jour 0 = dernier jour du mois précédent)
  return { dateFrom: formaterJour(debut), dateTo: formaterJour(fin) }; // Renvoie les deux jours en texte
} // Fin de periodePour

// Affiche un jour « AAAA-MM-JJ » en français : "20/10/2026".
export function afficherJour(jour) { // Reçoit le jour en texte
  const [annee, mois, j] = jour.split("-"); // Sépare année, mois, jour
  return `${j}/${mois}/${annee}`; // Réassemble à la française
} // Fin de afficherJour
