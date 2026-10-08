// Gabarits de texte : un gabarit est une phrase où des mots entre accolades, comme {solde}, marquent les valeurs à lire.
// Exemple : « solde de votre compte est de {solde} AR ». Le code le convertit en expression régulière : l'utilisateur n'en écrit jamais.
// Aucune dépendance Android ni navigateur : testable sous Windows. Utilisé par la consultation du solde (sprint 16) et les modèles de SMS (sprint 17).
import { ErreurValidation } from "./erreurs.js"; // Erreur affichée sous le champ

const LONGUEUR_MAX = 200; // Taille maximale d'une ligne de gabarit
const ALNUM = /[\p{L}\p{N}]/u; // Une lettre ou un chiffre
const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Neutralise les signes spéciaux du texte libre

// Types de valeurs lues : « nombre » (montant, centimes facultatifs), « ref » (identifiant de transaction), « texte » (numéro ou nom), « date » (jj/mm/aaaa, aaaa-mm-jj, avec heure facultative).
const MOTIFS = { // Un motif par type ; « dernier » = la variable termine la ligne
  nombre: (nom) => `(?<${nom}>\\d+(?:[\\s\\u00a0]\\d{3})*)(?:[.,](?<${nom}_dec>\\d+))?`, // Milliers séparés par une espace, centimes facultatifs
  ref: (nom) => `(?<${nom}>[A-Za-z0-9]+(?:\\.[A-Za-z0-9]+)*)`, // Lettres et chiffres, séparés par des points (MP261005.1023.C25734)
  texte: (nom, dernier) => (dernier ? `(?<${nom}>[^\\s.,;:]+(?:[ \\t]+[^\\s.,;:]+){0,3})` : `(?<${nom}>[^\\n]{1,40}?)`), // Quelques mots ; entre deux textes fixes : le plus court possible
  date: (nom) => `(?<${nom}>\\d{1,4}[/-]\\d{1,2}[/-]\\d{1,4}(?:[ T]+\\d{1,2}:\\d{2}(?::\\d{2})?)?)`, // 05/10/2026 14:30 ou 2026-10-05 14:30:00
}; // Fin des motifs

// Convertit un gabarit (une ligne) en expression régulière. « variables » : noms permis ; « types » : type de chaque nom (« nombre » par défaut) ; « obligatoires » : noms qui doivent figurer.
// L'expression renvoyée porte une propriété « types ». Lance ErreurValidation (champ « champErreur ») si le gabarit est invalide.
export function compilerGabarit(gabarit, { variables, types = {}, obligatoires = [], champErreur = "gabarit" }) { // Reçoit le gabarit et les règles
  const refuser = (message) => { throw new ErreurValidation({ [champErreur]: message }); }; // Lance l'erreur sous le bon champ
  const texte = String(gabarit ?? "").trim(); // Texte sans espaces autour
  if (texte === "") refuser("Saisissez le texte de la réponse, avec la valeur à lire entre accolades."); // Gabarit vide
  if (texte.length > LONGUEUR_MAX) refuser(`Une ligne est limitée à ${LONGUEUR_MAX} caractères.`); // Trop long
  const morceaux = texte.split(/(\{[^{}]*\})/); // Alterne texte libre (rangs pairs) et variables (rangs impairs)
  const lus = {}; // Variables rencontrées : nom -> type
  let motif = ""; // Expression régulière en construction
  let lettres = 0; // Nombre de caractères fixes (pour refuser un gabarit trop vague)
  morceaux.forEach((morceau, rang) => { // Traite chaque morceau
    if (rang % 2 === 1) { // Variable entre accolades
      const nom = morceau.slice(1, -1); // Nom sans les accolades
      if (!variables.includes(nom)) refuser(`Variable inconnue : ${morceau}. Permises : ${variables.map((v) => `{${v}}`).join(", ")}.`); // Nom non permis
      if (nom in lus) refuser(`${morceau} ne peut apparaître qu'une fois par ligne.`); // Doublon
      const type = types[nom] ?? "nombre"; // Type de la valeur
      lus[nom] = type; // Mémorise
      const dernier = morceaux.slice(rang + 1).every((m) => m.trim() === ""); // Plus aucun texte fixe après
      motif += MOTIFS[type](nom, dernier); // Ajoute le motif de la valeur
    } else { // Texte libre
      const fixe = morceau.trim(); // Texte sans les espaces des bords
      lettres += fixe.replace(/\s/g, "").length; // Compte les caractères fixes
      const debut = fixe !== "" && /^\s/.test(morceau) ? "\\s*" : ""; // Espaces au début : facultatifs (collés à la valeur)
      const fin = fixe !== "" && /\s$/.test(morceau) ? "\\s*" : ""; // Espaces à la fin : facultatifs
      const mots = fixe.split(/\s+/).filter(Boolean); // Mots du texte fixe
      const corps = mots.map((mot, i) => { // Joint les mots
        const suivant = mots[i + 1]; // Mot qui suit
        const separateur = suivant === undefined ? "" : (ALNUM.test(mot.at(-1)) && ALNUM.test(suivant[0]) ? "\\s+" : "\\s*"); // Une espace obligatoire entre deux mots, facultative autour de la ponctuation (« solde: » comme « solde : »)
        return echapper(mot) + separateur; // Mot échappé puis séparateur
      }).join(""); // Fin de la jonction
      motif += debut + corps + fin; // Ajoute le texte fixe
    } // Fin du cas texte libre
  }); // Fin du parcours
  for (const nom of obligatoires) if (!(nom in lus)) refuser(`Le texte doit contenir {${nom}}.`); // Variable obligatoire absente
  if (lettres < 2) refuser("Ajoutez du texte autour de la valeur, sinon le premier nombre venu serait lu."); // Gabarit trop vague
  const regex = new RegExp(motif, "i"); // Expression régulière (majuscules et minuscules indifférentes)
  regex.types = lus; // Types des valeurs, pour la lecture
  return regex; // Expression régulière
} // Fin de compilerGabarit

// Lit les valeurs d'un texte avec un gabarit compilé. Renvoie { variable: valeur } ou null si le texte ne correspond pas.
// Nombres : entiers (centimes ignorés, donc arrondi à l'inférieur) ; « haut » = noms arrondis à l'entier supérieur s'il y a des centimes (sorties d'argent).
export function lireAvecGabarit(texte, regex, { haut = [] } = {}) { // Reçoit le texte, l'expression compilée et les noms à arrondir vers le haut
  const trouve = String(texte ?? "").match(regex); // Cherche le gabarit dans le texte
  if (!trouve) return null; // Le texte ne correspond pas
  const resultat = {}; // Valeurs lues
  for (const [nom, type] of Object.entries(regex.types ?? {})) { // Chaque variable du gabarit
    const brut = trouve.groups?.[nom]; // Texte trouvé
    if (brut === undefined) continue; // Rien trouvé (ne devrait pas arriver)
    if (type === "nombre") { // Montant
      let valeur = Number(brut.replace(/[\s ]/g, "")); // Partie entière, espaces retirés
      if (!Number.isSafeInteger(valeur)) return null; // Nombre démesuré : refus
      if (haut.includes(nom) && /[1-9]/.test(trouve.groups[`${nom}_dec`] ?? "")) valeur += 1; // Centimes : arrondi vers le haut
      resultat[nom] = valeur; // Garde la valeur
    } else resultat[nom] = brut.trim(); // Texte, référence ou date : gardés tels quels
  } // Fin du parcours
  return resultat; // Valeurs lues
} // Fin de lireAvecGabarit
