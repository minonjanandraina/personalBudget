// Gabarits de texte : un gabarit est une phrase où des mots entre accolades, comme {solde}, marquent les valeurs à lire.
// Exemple : « solde de votre compte est de {solde} AR ». Le code le convertit en expression régulière : l'utilisateur n'en écrit jamais.
// Aucune dépendance Android ni navigateur : testable sous Windows. Réutilisé par la consultation du solde (sprint 16) et les modèles de SMS (sprint 17).
import { ErreurValidation } from "./erreurs.js"; // Erreur affichée sous le champ

const LONGUEUR_MAX = 200; // Taille maximale d'un gabarit
const MOTIF_NOMBRE = (nom) => `(?<${nom}>\\d+(?:[\\s\\u00a0]\\d{3})*)(?:[.,](?<${nom}_dec>\\d+))?`; // Un nombre : milliers séparés par une espace, centimes facultatifs
const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Neutralise les signes spéciaux du texte libre

// Convertit un gabarit en expression régulière. « variables » : noms permis (tous des nombres). « obligatoires » : noms qui doivent figurer.
// Lance ErreurValidation (champ « champErreur ») si le gabarit est invalide.
export function compilerGabarit(gabarit, { variables, obligatoires = [], champErreur = "gabarit" }) { // Reçoit le gabarit et les règles
  const refuser = (message) => { throw new ErreurValidation({ [champErreur]: message }); }; // Lance l'erreur sous le bon champ
  const texte = String(gabarit ?? "").trim(); // Texte sans espaces autour
  if (texte === "") refuser("Saisissez le texte de la réponse, avec la valeur à lire entre accolades."); // Gabarit vide
  if (texte.length > LONGUEUR_MAX) refuser(`Le texte est limité à ${LONGUEUR_MAX} caractères.`); // Trop long
  const morceaux = texte.split(/(\{[^{}]*\})/); // Alterne texte libre (rangs pairs) et variables (rangs impairs)
  const vus = new Set(); // Variables déjà rencontrées
  let motif = ""; // Expression régulière en construction
  let lettres = 0; // Nombre de caractères fixes (pour refuser un gabarit trop vague)
  morceaux.forEach((morceau, rang) => { // Traite chaque morceau
    if (rang % 2 === 1) { // Variable entre accolades
      const nom = morceau.slice(1, -1); // Nom sans les accolades
      if (!variables.includes(nom)) refuser(`Variable inconnue : ${morceau}. Permises : ${variables.map((v) => `{${v}}`).join(", ")}.`); // Nom non permis
      if (vus.has(nom)) refuser(`${morceau} ne peut apparaître qu'une fois.`); // Doublon
      vus.add(nom); // Mémorise
      motif += MOTIF_NOMBRE(nom); // Ajoute le nombre à lire
    } else { // Texte libre
      const fixe = morceau.trim(); // Texte sans les espaces des bords
      lettres += fixe.replace(/\s/g, "").length; // Compte les caractères fixes
      const debut = fixe !== "" && /^\s/.test(morceau) ? "\\s*" : ""; // Espaces au début : facultatifs (collés à la variable)
      const fin = fixe !== "" && /\s$/.test(morceau) ? "\\s*" : ""; // Espaces à la fin : facultatifs
      motif += debut + fixe.split(/\s+/).filter(Boolean).map(echapper).join("\\s+") + fin; // Espaces internes : au moins une espace
    } // Fin du cas texte libre
  }); // Fin du parcours
  for (const nom of obligatoires) if (!vus.has(nom)) refuser(`Le texte doit contenir {${nom}}.`); // Variable obligatoire absente
  if (lettres < 3) refuser("Ajoutez du texte autour de la valeur, sinon le premier nombre venu serait lu."); // Gabarit trop vague
  return new RegExp(motif, "i"); // Expression régulière (majuscules et minuscules indifférentes)
} // Fin de compilerGabarit

// Lit les valeurs d'un texte avec un gabarit compilé. Renvoie { variable: entier } (centimes ignorés, donc arrondi à l'inférieur) ou null si le texte ne correspond pas.
export function lireAvecGabarit(texte, regex) { // Reçoit le texte et l'expression régulière compilée
  const trouve = String(texte ?? "").match(regex); // Cherche le gabarit dans le texte
  if (!trouve) return null; // Le texte ne correspond pas
  const resultat = {}; // Valeurs lues
  for (const nom of Object.keys(trouve.groups).filter((n) => !n.endsWith("_dec"))) { // Chaque variable (hors centimes)
    const valeur = Number(trouve.groups[nom].replace(/[\s ]/g, "")); // Partie entière, espaces retirés
    if (!Number.isSafeInteger(valeur)) return null; // Nombre démesuré : refus
    resultat[nom] = valeur; // Garde la valeur
  } // Fin du parcours
  return resultat; // Valeurs lues
} // Fin de lireAvecGabarit
