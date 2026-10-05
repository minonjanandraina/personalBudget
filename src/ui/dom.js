// Petit outil pour fabriquer des éléments de page en JavaScript, de façon sûre.
// Exemple : h("p", { class: "info" }, "Bonjour") fabrique <p class="info">Bonjour</p>.
// Le texte est toujours inséré comme TEXTE (jamais interprété comme du HTML) : impossible d'injecter du code par accident.

// Fabrique un élément : balise, propriétés, puis enfants (textes, éléments ou tableaux de ceux-ci).
export function h(balise, proprietes = {}, ...enfants) { // Reçoit la balise, les propriétés et les enfants
  const element = document.createElement(balise); // Crée l'élément vide
  for (const [nom, valeur] of Object.entries(proprietes ?? {})) { // Parcourt chaque propriété
    if (valeur === null || valeur === undefined || valeur === false) continue; // Ignore les valeurs vides
    if (nom.startsWith("on") && typeof valeur === "function") { // Propriété « onclick », « oninput »... avec une fonction
      element.addEventListener(nom.slice(2).toLowerCase(), valeur); // Branche la fonction sur l'événement (click, input...)
    } else if (nom === "class") { // Propriété « class »
      element.className = valeur; // Applique les classes CSS
    } else { // Toute autre propriété
      element.setAttribute(nom, valeur === true ? "" : String(valeur)); // La pose comme attribut (true = attribut présent sans valeur)
    } // Fin des cas
  } // Fin de la boucle des propriétés
  ajouterEnfants(element, enfants); // Ajoute les enfants à l'élément
  return element; // Renvoie l'élément fabriqué
} // Fin de h

// Ajoute des enfants à un élément (textes, éléments, tableaux imbriqués).
export function ajouterEnfants(parent, enfants) { // Reçoit le parent et la liste d'enfants
  for (const enfant of enfants.flat(Infinity)) { // Aplatit les tableaux imbriqués
    if (enfant === null || enfant === undefined || enfant === false) continue; // Ignore les valeurs vides
    parent.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant))); // Élément tel quel, sinon texte sûr
  } // Fin de la boucle
} // Fin de ajouterEnfants

// Vide un élément de tout son contenu.
export function vider(element) { // Reçoit l'élément à vider
  element.replaceChildren(); // Retire tous ses enfants
} // Fin de vider
