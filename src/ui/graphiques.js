// Graphiques du tableau de bord, dessinés en SVG par l'application elle-même (aucune bibliothèque, tout fonctionne hors ligne).
// Chaque graphique est accompagné d'un texte alternatif (lecteurs d'écran) et d'un tableau des valeurs (« Voir les valeurs »).
// Les textes sont toujours insérés comme TEXTE (jamais comme HTML), comme partout dans l'application.
import { h } from "./dom.js"; // Fabrication d'éléments de page
import { formaterMontant } from "../core/format.js"; // Affichage des montants

const NS = "http://www.w3.org/2000/svg"; // Espace de noms des éléments SVG

// Couleurs des séries (lisibles en thème clair et sombre).
export const PALETTE = ["#0a84ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff453a", "#64d2ff", "#ffd60a", "#8e8e93"]; // Bleu, vert, orange, violet, rouge, cyan, jaune, gris
export const couleurSerie = (i) => PALETTE[i % PALETTE.length]; // Couleur de la i-ème série (recommence au début si besoin)

// Fabrique un élément SVG : balise, attributs, puis enfants (textes ou éléments).
function s(balise, attributs = {}, ...enfants) { // Reçoit la balise, les attributs et les enfants
  const element = document.createElementNS(NS, balise); // Crée l'élément SVG
  for (const [nom, valeur] of Object.entries(attributs)) if (valeur !== null && valeur !== undefined && valeur !== false) element.setAttribute(nom, String(valeur)); // Pose chaque attribut
  for (const enfant of enfants.flat()) if (enfant !== null && enfant !== undefined) element.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant))); // Ajoute les enfants (le texte reste du texte)
  return element; // Élément prêt
} // Fin de s

// Montant abrégé pour les axes : 1 250 000 -> "1,3 M", 45 000 -> "45 k".
export function formaterCourt(n) { // Reçoit un entier
  const a = Math.abs(n); // Valeur absolue
  const signe = n < 0 ? "−" : ""; // Signe moins typographique
  if (a >= 1e6) return `${signe}${(a / 1e6).toFixed(1).replace(".", ",").replace(",0", "")} M`; // Millions
  if (a >= 1e3) return `${signe}${Math.round(a / 1e3)} k`; // Milliers
  return `${signe}${a}`; // Petit nombre
} // Fin de formaterCourt

// Pas « rond » (1, 2, 5 × puissance de 10) pour graduer un axe.
function pasRond(valeur) { // Reçoit l'écart approximatif entre deux graduations
  if (!(valeur > 0)) return 1; // Valeur invalide : pas de 1
  const exposant = 10 ** Math.floor(Math.log10(valeur)); // Puissance de 10 en dessous
  const f = valeur / exposant; // Mantisse entre 1 et 10
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exposant; // Arrondi à 1, 2, 5 ou 10
} // Fin de pasRond

// Graduations d'un axe vertical : { min, max, graduations }. « zeroBase » : l'axe commence à 0.
function echelle(valeurs, zeroBase) { // Reçoit les valeurs à représenter
  const plein = valeurs.filter((v) => v !== null && v !== undefined); // Valeurs présentes
  let min = plein.length ? Math.min(...plein) : 0; let max = plein.length ? Math.max(...plein) : 1; // Extrêmes
  if (zeroBase) min = Math.min(0, min); // Axe à partir de 0
  if (max === min) max = min + 1; // Évite une échelle plate
  const pas = pasRond((max - min) / 4); // Pas entre deux graduations
  const bas = Math.floor(min / pas) * pas; const haut = Math.ceil(max / pas) * pas; // Bornes arrondies
  const graduations = []; for (let v = bas; v <= haut + pas / 2; v += pas) graduations.push(v); // Liste des graduations
  return { min: bas, max: haut, graduations }; // Échelle
} // Fin de echelle

// Tableau des valeurs, replié sous le graphique.
function tableauValeurs(entetes, lignes) { // Reçoit les en-têtes et les lignes (tableaux de textes)
  return h("details", { class: "graphique-valeurs" }, // Zone repliable
    h("summary", {}, "Voir les valeurs"), // Titre cliquable
    h("div", { class: "graphique-valeurs-defilement" }, // Défilement horizontal si le tableau est large
      h("table", {}, h("thead", {}, h("tr", {}, ...entetes.map((e) => h("th", { scope: "col" }, e)))), h("tbody", {}, ...lignes.map((l) => h("tr", {}, ...l.map((c) => h("td", {}, c))))))), // Tableau
  ); // Fin de la zone
} // Fin de tableauValeurs

// Légende : une pastille de couleur et un nom par série.
function legende(series) { // Reçoit les séries [{ nom, couleur }]
  return h("ul", { class: "graphique-legende" }, ...series.map((x) => h("li", {}, h("span", { class: "graphique-pastille", style: `background:${x.couleur}` }), x.nom))); // Une ligne par série
} // Fin de legende

// Enveloppe d'un graphique : titre, dessin (décrit par un texte alternatif), légende et tableau des valeurs.
function figure({ description, dessin, serieLegende = null, entetes, lignes }) { // Reçoit les éléments du graphique
  return h("figure", { class: "graphique" }, // Bloc du graphique
    h("div", { class: "graphique-dessin", role: "img", "aria-label": description }, dessin), // Dessin vu comme une image décrite
    serieLegende ? legende(serieLegende) : null, // Légende éventuelle
    tableauValeurs(entetes, lignes), // Valeurs
  ); // Fin du bloc
} // Fin de figure

// Message quand il n'y a rien à dessiner.
export const aucuneDonnee = (message) => h("p", { class: "ligne-detail graphique-vide" }, message); // Phrase discrète

// ===== Barres de progression (santé des budgets) =====
// items : [{ label, detail, pct, niveau }] ; niveau : ok, attention ou danger.
export function barresProgression(items) { // Reçoit les éléments à afficher
  if (items.length === 0) return aucuneDonnee("Rien à afficher pour le moment."); // Liste vide
  return h("ul", { class: "barres" }, ...items.map((x) => h("li", { class: "barres-ligne" }, // Une ligne par élément
    h("div", { class: "barres-texte" }, h("span", { class: "barres-label" }, x.label), h("span", { class: "barres-detail" }, x.detail)), // Nom et détail
    h("div", { class: "barres-piste", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.min(100, x.pct)), "aria-label": `${x.label} : ${x.pct} %` }, // Piste
      h("div", { class: `barres-remplissage niveau-${x.niveau}`, style: `width:${Math.min(100, x.pct)}%` })), // Partie remplie
  ))); // Fin des lignes
} // Fin de barresProgression

// ===== Anneau (répartition) =====
// items : [{ label, valeur }] ; total : somme affichée au centre.
export function anneau({ items, titre }) { // Reçoit les éléments et le titre
  const total = items.reduce((somme, x) => somme + x.valeur, 0); // Somme des valeurs
  if (total <= 0) return aucuneDonnee("Aucune dépense sur cette période."); // Rien à répartir
  const rayon = 42; const circonference = 2 * Math.PI * rayon; // Cercle du dessin
  let decalage = 0; // Position de départ du segment suivant
  const segments = items.map((x, i) => { // Un segment par élément
    const longueur = (x.valeur / total) * circonference; // Longueur de l'arc
    const arc = s("circle", { cx: 60, cy: 60, r: rayon, fill: "none", stroke: couleurSerie(i), "stroke-width": 18, "stroke-dasharray": `${longueur} ${circonference - longueur}`, "stroke-dashoffset": -decalage, transform: "rotate(-90 60 60)" }); // Arc de cercle
    decalage += longueur; // Avance
    return arc; // Segment
  }); // Fin des segments
  const dessin = s("svg", { viewBox: "0 0 120 120", class: "graphique-svg graphique-anneau", focusable: "false" }, ...segments, s("text", { x: 60, y: 57, "text-anchor": "middle", class: "graphique-texte-gros" }, formaterCourt(total)), s("text", { x: 60, y: 71, "text-anchor": "middle", class: "graphique-texte" }, "Ar")); // Anneau et total au centre
  const description = `${titre} : ${items.map((x) => `${x.label} ${Math.round((x.valeur * 100) / total)} %`).join(", ")}.`; // Texte alternatif
  return figure({ description, dessin, serieLegende: items.map((x, i) => ({ nom: `${x.label} — ${formaterMontant(x.valeur)} (${Math.round((x.valeur * 100) / total)} %)`, couleur: couleurSerie(i) })), entetes: ["Élément", "Montant", "Part"], lignes: items.map((x) => [x.label, formaterMontant(x.valeur), `${Math.round((x.valeur * 100) / total)} %`]) }); // Anneau complet
} // Fin de anneau

// ===== Axes communs aux courbes et histogrammes =====
const L = 320; const H = 190; const MG = 46; const MD = 10; const MH = 10; const MB = 26; // Taille du dessin et marges (gauche, droite, haut, bas)

// Axe vertical gradué avec lignes de repère. Renvoie les éléments et la fonction qui convertit une valeur en position verticale.
function axeVertical(ech, formaterY) { // Reçoit l'échelle et le formateur
  const y = (v) => MH + (H - MH - MB) * (1 - (v - ech.min) / (ech.max - ech.min)); // Valeur -> position verticale
  const elements = ech.graduations.flatMap((g) => [s("line", { x1: MG, x2: L - MD, y1: y(g), y2: y(g), class: "graphique-repere" }), s("text", { x: MG - 5, y: y(g) + 3, "text-anchor": "end", class: "graphique-texte" }, formaterY(g))]); // Ligne et valeur de chaque graduation
  return { elements, y }; // Éléments et conversion
} // Fin de axeVertical

// ===== Courbes =====
// series : [{ nom, couleur, pointille, points: [{ x, y }] }] (y peut être null : la ligne s'interrompt) ; etiquettesX : [{ x, texte }] ; formaterY : formateur des valeurs.
export function courbe({ series, etiquettesX, formaterY = formaterCourt, zeroBase = true, description, entetes, lignes }) { // Reçoit la description complète du graphique
  const xs = series.flatMap((x) => x.points.map((p) => p.x)); // Toutes les abscisses
  const toutesY = series.flatMap((x) => x.points.map((p) => p.y)); // Toutes les ordonnées
  if (xs.length === 0 || toutesY.every((v) => v === null)) return aucuneDonnee("Pas encore de données à afficher."); // Rien à tracer
  const xMin = Math.min(...xs); const xMax = Math.max(...xs); // Étendue horizontale
  const x = (v) => (xMax === xMin ? (MG + L - MD) / 2 : MG + ((L - MG - MD) * (v - xMin)) / (xMax - xMin)); // Valeur -> position horizontale
  const ech = echelle(toutesY, zeroBase); // Échelle verticale
  const axe = axeVertical(ech, formaterY); // Axe vertical
  const traces = series.map((serie) => { // Un tracé par série
    const morceaux = []; let courant = []; // Morceaux continus de la ligne
    for (const p of serie.points) { if (p.y === null) { if (courant.length) morceaux.push(courant); courant = []; } else courant.push(p); } // Coupe aux valeurs absentes
    if (courant.length) morceaux.push(courant); // Dernier morceau
    return s("g", {}, ...morceaux.map((m) => m.length === 1 ? s("circle", { cx: x(m[0].x), cy: axe.y(m[0].y), r: 3, fill: serie.couleur }) : s("polyline", { points: m.map((p) => `${x(p.x).toFixed(1)},${axe.y(p.y).toFixed(1)}`).join(" "), fill: "none", stroke: serie.couleur, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": serie.pointille ? "5 4" : null }))); // Ligne ou point isolé
  }); // Fin des tracés
  const reperes = etiquettesX.map((e) => s("text", { x: x(e.x), y: H - 8, "text-anchor": "middle", class: "graphique-texte" }, e.texte)); // Étiquettes de l'axe horizontal
  const dessin = s("svg", { viewBox: `0 0 ${L} ${H}`, class: "graphique-svg", focusable: "false" }, ...axe.elements, ...reperes, ...traces); // Dessin complet
  return figure({ description, dessin, serieLegende: series.length > 1 ? series.map((x) => ({ nom: x.nom, couleur: x.couleur })) : null, entetes, lignes }); // Courbe complète
} // Fin de courbe

// ===== Histogrammes =====
// groupes : textes de l'axe horizontal ; series : [{ nom, couleur, valeurs: [nombres] }] ; mode : "empile" ou "groupe".
export function histogramme({ groupes, series, mode = "empile", formaterY = formaterCourt, description, entetes, lignes }) { // Reçoit la description complète du graphique
  const totaux = groupes.map((_, i) => series.reduce((somme, x) => somme + (x.valeurs[i] ?? 0), 0)); // Hauteur de chaque pile
  const toutes = mode === "empile" ? totaux : series.flatMap((x) => x.valeurs); // Valeurs qui fixent l'échelle
  if (toutes.every((v) => !v)) return aucuneDonnee("Aucune donnée sur ces périodes."); // Rien à dessiner
  const ech = echelle(toutes, true); // Échelle verticale
  const axe = axeVertical(ech, formaterY); // Axe vertical
  const largeurGroupe = (L - MG - MD) / groupes.length; // Place de chaque groupe
  const barres = groupes.flatMap((_, i) => { // Barres de chaque groupe
    const x0 = MG + i * largeurGroupe; // Début du groupe
    if (mode === "empile") { // Pile de segments
      let cumul = 0; // Hauteur déjà posée
      return series.map((serie, k) => { const v = serie.valeurs[i] ?? 0; const haut = axe.y(cumul + v); const bas = axe.y(cumul); cumul += v; return v > 0 ? s("rect", { x: x0 + largeurGroupe * 0.18, y: haut, width: largeurGroupe * 0.64, height: Math.max(0, bas - haut), fill: serie.couleur ?? couleurSerie(k), rx: 2 }) : null; }); // Un segment par série
    } // Fin du mode empilé
    const largeur = (largeurGroupe * 0.8) / series.length; // Largeur d'une barre groupée
    return series.map((serie, k) => { const v = serie.valeurs[i] ?? 0; const haut = axe.y(v); return v > 0 ? s("rect", { x: x0 + largeurGroupe * 0.1 + k * largeur, y: haut, width: largeur - 1, height: Math.max(0, axe.y(0) - haut), fill: serie.couleur ?? couleurSerie(k), rx: 2 }) : null; }); // Une barre par série
  }); // Fin des barres
  const reperes = groupes.map((g, i) => s("text", { x: MG + (i + 0.5) * largeurGroupe, y: H - 8, "text-anchor": "middle", class: "graphique-texte" }, g)); // Étiquettes de l'axe horizontal
  const dessin = s("svg", { viewBox: `0 0 ${L} ${H}`, class: "graphique-svg", focusable: "false" }, ...axe.elements, ...reperes, ...barres); // Dessin complet
  return figure({ description, dessin, serieLegende: series.length > 1 ? series.map((x, k) => ({ nom: x.nom, couleur: x.couleur ?? couleurSerie(k) })) : null, entetes, lignes }); // Histogramme complet
} // Fin de histogramme
