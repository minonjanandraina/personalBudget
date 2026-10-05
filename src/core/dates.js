// Conversions de dates. Dans la base : texte ISO en UTC (ex. "2026-10-05T07:30:00.000Z").
// Dans les formulaires : champ « date et heure locale » (ex. "2026-10-05T10:30"), à l'heure du téléphone.

const deuxChiffres = (n) => String(n).padStart(2, "0"); // Complète avec un zéro : 5 -> "05"

// Transforme une saisie de formulaire (heure locale) en texte ISO UTC. Renvoie null si la date est invalide.
export function datetimeLocalVersIso(texte) { // Reçoit "AAAA-MM-JJTHH:MM"
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(texte ?? ""))) return null; // Format inattendu
  const date = new Date(texte); // Interprétée à l'heure locale du téléphone
  return Number.isNaN(date.getTime()) ? null : date.toISOString(); // Invalide : null ; sinon texte ISO UTC
} // Fin de datetimeLocalVersIso

// Transforme un texte ISO UTC en valeur pour un champ de formulaire (heure locale).
export function isoVersDatetimeLocal(iso) { // Reçoit le texte ISO
  const d = new Date(iso); // Convertit en date
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}T${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`; // Assemble AAAA-MM-JJTHH:MM en heure locale
} // Fin de isoVersDatetimeLocal

// Affiche une date ISO de façon lisible en français : "05/10/2026 10:30".
export function afficherDateHeure(iso) { // Reçoit le texte ISO
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); // Format court français
} // Fin de afficherDateHeure
