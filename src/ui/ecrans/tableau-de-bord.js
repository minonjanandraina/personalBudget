// Écran « Tableau de bord » : indicateurs de la période en cours (État actuel) et sur plusieurs périodes (Historique), avec des graphiques.
// Les calculs sont dans core/tableau-de-bord.js ; les dessins dans ui/graphiques.js. Les choix de l'utilisateur sont gardés tant que l'application est ouverte.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, choix, boutonLien } from "../composants.js"; // Composants
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { afficherJour } from "../../core/periodes.js"; // Affichage des jours
import { etatActuel, historique, CHOIX_NB_PERIODES, NB_PERIODES_DEFAUT } from "../../core/tableau-de-bord.js"; // Calcul des indicateurs
import { barresProgression, anneau, courbe, histogramme, aucuneDonnee, couleurSerie, PALETTE } from "../graphiques.js"; // Graphiques

// Choix de l'utilisateur, conservés d'un affichage à l'autre.
const choixEcran = { onglet: "actuel", repartition: "budget", nombrePeriodes: NB_PERIODES_DEFAUT, budgetId: "", periode: "" }; // Valeurs de départ

// Un indicateur : libellé, grande valeur et petite explication.
const kpi = (libelle, valeur, detail = null, classe = "") => h("div", { class: `kpi ${classe}` }, h("div", { class: "kpi-libelle" }, libelle), h("div", { class: "kpi-valeur" }, valeur), detail ? h("div", { class: "kpi-detail" }, detail) : null); // Bloc d'indicateur

// Titre de section.
const titre = (texte) => h("h2", { class: "carte-titre" }, texte); // Titre d'une carte

// Niveau d'une barre de taux de consommation (historique).
const niveauTaux = (pct) => (pct >= 100 ? "danger" : pct >= 80 ? "attention" : "ok"); // Rouge au-delà de la capacité, orange à partir de 80 %

// ===== ÉTAT ACTUEL =====
function dessinerActuel(conteneur, e, redessiner) { // Reçoit la zone, les indicateurs et la fonction qui redessine
  const t = e.totaux; const r = e.rythme; // Raccourcis
  const marge = r.margeProjection; // Écart entre ce qui est disponible et la projection
  const phraseProjection = e.totaux.depense === 0 ? "Aucune dépense pour le moment." : marge >= 0 ? `Au rythme actuel, il resterait ${formaterMontant(marge)} à la fin de la période.` : `Au rythme actuel, il manquerait ${formaterMontant(-marge)} avant la fin de la période.`; // Phrase de projection
  conteneur.append(
    carte(titre("Situation de la période"), // 1. Situation de la période
      h("p", { class: "ligne-detail" }, `Du ${afficherJour(e.periode.dateFrom)} au ${afficherJour(e.periode.dateTo)} — jour ${e.joursEcoules} sur ${e.joursTotal}`), // Période et avancement
      h("div", { class: "kpis" },
        kpi("Solde Mobile Money", e.situation.disponible === null ? "—" : formaterMontant(e.situation.disponible), e.situation.disponible === null ? "Aucun solde saisi" : "disponible"), // Solde disponible
        kpi("Réservé dans les budgets", formaterMontant(e.situation.reserve)), // Réservé
        kpi("Libre à allouer", e.situation.libre === null ? "—" : formaterMontant(e.situation.libre), null, e.situation.libre !== null && e.situation.libre < 0 ? "kpi-danger" : ""), // Libre (rouge si négatif)
        kpi("Disponible sur la période", formaterMontant(t.capacite), "alloué + reports"), // Capacité
        kpi("Dépensé", formaterMontant(t.depense), `${t.pctConsomme} % du disponible`), // Dépensé
        kpi("Restant", formaterMontant(t.solde), `${100 - t.pctConsomme} % du disponible`), // Restant
        kpi("Jours restants", String(e.joursRestants), `${t.pctTemps} % du temps écoulé`), // Jours
        kpi("Dépense par jour", formaterMontant(r.depenseParJour), `reste conseillé : ${formaterMontant(r.resteParJour)}/jour`), // Rythme
        kpi("Projection de fin", formaterMontant(r.projectionFin), null, r.margeProjection < 0 ? "kpi-danger" : ""), // Projection
      ), // Fin des indicateurs
      alerte({ niveau: t.depense === 0 ? "info" : marge >= 0 ? "ok" : "attention", message: phraseProjection }), // Projection en une phrase
    ), // Fin de la carte
    carte(titre("Santé des budgets"), // 2. Santé des budgets
      barresProgression(e.budgets.map((b) => ({ label: b.nom, detail: `${formaterMontant(b.depense)} sur ${formaterMontant(b.capacite)} — reste ${formaterMontant(b.solde)}`, pct: b.pct, niveau: b.niveau }))), // Une barre par budget
      e.budgets.length === 0 ? h("div", { class: "espace-haut" }, boutonLien("Allouer un budget", "/allocations/nouveau", "allocations")) : null, // Aide si aucun budget alloué
    ), // Fin de la carte
  ); // Fin de l'ajout
  const parType = choixEcran.repartition === "type"; // Répartition par type ?
  const selecteur = choix({ id: "tdb-repartition", libelle: "Répartir par", valeur: choixEcran.repartition, options: [{ valeur: "budget", libelle: "Budget" }, { valeur: "type", libelle: "Type de budget" }] }); // Choix de la répartition
  selecteur.element.querySelector("select").addEventListener("change", () => { choixEcran.repartition = selecteur.lire(); redessiner(); }); // Redessine au changement
  conteneur.append(
    carte(titre("Répartition des dépenses"), selecteur.element, anneau({ items: parType ? e.repartitionTypes : e.repartitionBudgets, titre: `Dépenses de la période par ${parType ? "type" : "budget"}` })), // 3. Répartition
    carte(titre("À traiter"), // 4. Éléments à traiter
      h("div", { class: "kpis" },
        kpi("Dépenses SMS à classer", String(e.aTraiter.nonClassees), e.aTraiter.nonClassees > 0 ? formaterMontant(e.aTraiter.montantNonClasse) : "rien à classer"), // À classer
        kpi("SMS non compris", String(e.aTraiter.illisibles), e.aTraiter.illisibles > 0 ? "à revoir" : "tout est compris"), // Non compris
        kpi("Alertes", String(e.aTraiter.alertes), e.aTraiter.alertes > 0 ? "voir la cloche en haut à droite" : "aucune"), // Alertes
      ), // Fin des indicateurs
      e.aTraiter.nonClassees + e.aTraiter.illisibles > 0 ? h("div", { class: "espace-haut" }, boutonLien("Traiter les SMS", "/sms", "message")) : null, // Raccourci
    ), // Fin de la carte
  ); // Fin de l'ajout
} // Fin de dessinerActuel

// ===== HISTORIQUE =====
function dessinerHistorique(conteneur, hst, redessiner) { // Reçoit la zone, l'historique et la fonction qui redessine
  const selNb = choix({ id: "tdb-nb", libelle: "Périodes affichées", valeur: String(choixEcran.nombrePeriodes), options: CHOIX_NB_PERIODES.map((n) => ({ valeur: String(n), libelle: `${n} dernières périodes` })) }); // Choix du nombre de périodes
  selNb.element.querySelector("select").addEventListener("change", () => { choixEcran.nombrePeriodes = Number(selNb.lire()); choixEcran.periode = ""; redessiner(); }); // Redessine au changement
  const selPeriode = choix({ id: "tdb-periode", libelle: "Période (rythme et plus grosses dépenses)", valeur: hst.choisie.dateFrom, options: hst.periodes.slice().reverse().map((p) => ({ valeur: p.dateFrom, libelle: p.libelle })) }); // Choix de la période détaillée
  selPeriode.element.querySelector("select").addEventListener("change", () => { choixEcran.periode = selPeriode.lire(); redessiner(); }); // Redessine au changement
  conteneur.append(carte(titre("Choix de l'affichage"), selNb.element, selPeriode.element)); // Carte des choix

  const jourEnNombre = (jour) => { const [a, m, j] = jour.split("-").map(Number); return Math.round(Date.UTC(a, m - 1, j) / 86400000); }; // Jour -> numéro de jour
  const courtJour = (jour) => afficherJour(jour).slice(0, 5); // "21/10"
  // 5. Évolution du solde Mobile Money
  const pts = hst.soldeMM.map((p) => ({ x: jourEnNombre(p.jour), y: p.solde })); // Points de la courbe
  const etiqSolde = pts.length === 0 ? [] : [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])].map((i) => ({ x: pts[i].x, texte: courtJour(hst.soldeMM[i].jour) })); // Début, milieu, fin
  conteneur.append(carte(titre("Évolution du solde Mobile Money"), courbe({
    series: [{ nom: "Solde Mobile Money", couleur: PALETTE[0], points: pts }], etiquettesX: etiqSolde, zeroBase: false,
    description: pts.length ? `Solde Mobile Money du ${afficherJour(hst.soldeMM[0].jour)} au ${afficherJour(hst.soldeMM[pts.length - 1].jour)} : de ${formaterMontant(pts[0].y)} à ${formaterMontant(pts[pts.length - 1].y)}.` : "Aucun solde enregistré.",
    entetes: ["Jour", "Solde"], lignes: hst.soldeMM.map((p) => [afficherJour(p.jour), formaterMontant(p.solde)]),
  }))); // Fin de la carte

  // 6. Dépenses par période, détail par type
  const dp = hst.depensesParPeriode; // Données du graphique
  conteneur.append(carte(titre("Dépenses par période"), histogramme({
    groupes: dp.periodes.map((p) => p.court), mode: "empile",
    series: dp.types.map((tp, k) => ({ nom: tp, couleur: couleurSerie(k), valeurs: dp.periodes.map((p) => p.parType.find((x) => x.type === tp)?.montant ?? 0) })),
    description: `Dépenses par période : ${dp.periodes.map((p) => `${p.court} ${formaterMontant(p.total)}`).join(", ")}.`,
    entetes: ["Période", "Total", ...dp.types], lignes: dp.periodes.map((p) => [p.libelle, formaterMontant(p.total), ...dp.types.map((tp) => formaterMontant(p.parType.find((x) => x.type === tp)?.montant ?? 0))]),
  }))); // Fin de la carte

  // 7. Alloué contre dépensé, par budget
  const cmp = hst.comparatif; // Données du graphique
  const selBudget = choix({ id: "tdb-budget", libelle: "Budget", valeur: choixEcran.budgetId, options: [{ valeur: "", libelle: "Tous les budgets" }, ...cmp.budgets.map((b) => ({ valeur: String(b.budgetId), libelle: b.nom }))] }); // Choix du budget
  selBudget.element.querySelector("select").addEventListener("change", () => { choixEcran.budgetId = selBudget.lire(); redessiner(); }); // Redessine au changement
  const retenus = choixEcran.budgetId === "" ? cmp.budgets : cmp.budgets.filter((b) => String(b.budgetId) === choixEcran.budgetId); // Budgets pris en compte
  const somme = (cle) => cmp.periodes.map((_, i) => retenus.reduce((s, b) => s + b.parPeriode[i][cle], 0)); // Somme par période
  const capacites = somme("capacite"); const depenses = somme("depense"); // Séries
  conteneur.append(carte(titre("Alloué contre dépensé"), selBudget.element, histogramme({
    groupes: cmp.periodes.map((p) => p.court), mode: "groupe",
    series: [{ nom: "Disponible (alloué + reports)", couleur: PALETTE[0], valeurs: capacites }, { nom: "Dépensé", couleur: PALETTE[2], valeurs: depenses }],
    description: `Disponible et dépensé par période : ${cmp.periodes.map((p, i) => `${p.court} ${formaterMontant(capacites[i])} et ${formaterMontant(depenses[i])}`).join(" ; ")}.`,
    entetes: ["Période", "Disponible", "Dépensé", "Taux"], lignes: cmp.periodes.map((p, i) => [p.libelle, formaterMontant(capacites[i]), formaterMontant(depenses[i]), capacites[i] > 0 ? `${Math.round((depenses[i] * 100) / capacites[i])} %` : "—"]),
  }), h("h3", { class: "section-titre espace-haut" }, "Taux moyen de consommation"), barresProgression(cmp.budgets.map((b) => ({ label: b.nom, detail: `${b.tauxMoyen} %`, pct: b.tauxMoyen, niveau: niveauTaux(b.tauxMoyen) }))))); // Fin de la carte

  // 8. Reliquats reportés
  conteneur.append(carte(titre("Reliquats reportés"), histogramme({
    groupes: hst.reliquats.map((r) => r.court), mode: "empile", series: [{ nom: "Reports reçus", couleur: PALETTE[1], valeurs: hst.reliquats.map((r) => r.total) }],
    description: `Montants reportés d'une période à l'autre : ${hst.reliquats.map((r) => `${r.court} ${formaterMontant(r.total)}`).join(", ")}.`,
    entetes: ["Période", "Budget", "Report reçu"], lignes: hst.reliquats.flatMap((r) => (r.parBudget.length ? r.parBudget.map((b) => [r.libelle, b.budget, formaterMontant(b.montant)]) : [[r.libelle, "—", formaterMontant(0)]])),
  }))); // Fin de la carte

  // 9. Rythme de la période
  const ry = hst.rythme; const total = ry.points.length; // Données du graphique
  const etiqJours = [...new Set([1, Math.ceil(total / 2), total])].map((j) => ({ x: j, texte: `J${j}` })); // Début, milieu, fin
  conteneur.append(carte(titre("Rythme de la période"), h("p", { class: "ligne-detail" }, `${hst.choisie.libelle} — dépensé ${formaterMontant(ry.depenseTotale)} sur ${formaterMontant(ry.capacite)} disponibles`), courbe({
    series: [{ nom: "Dépenses cumulées", couleur: PALETTE[2], points: ry.points.map((p) => ({ x: p.jour, y: p.reel })) }, { nom: "Budget idéal (régulier)", couleur: PALETTE[7], pointille: true, points: ry.points.map((p) => ({ x: p.jour, y: p.ideal })) }], etiquettesX: etiqJours,
    description: `Dépenses cumulées jour par jour contre un budget régulier : ${formaterMontant(ry.depenseTotale)} dépensés sur ${formaterMontant(ry.capacite)}.`,
    entetes: ["Jour", "Dépenses cumulées", "Budget idéal"], lignes: ry.points.map((p) => [`J${p.jour}`, p.reel === null ? "—" : formaterMontant(p.reel), formaterMontant(p.ideal)]),
  }))); // Fin de la carte

  // 10. Plus grosses dépenses
  conteneur.append(carte(titre("Plus grosses dépenses"), hst.plusGrosses.length === 0 ? aucuneDonnee("Aucune dépense sur cette période.") : h("ol", { class: "classement" }, ...hst.plusGrosses.map((d) => h("li", {}, // Une ligne par dépense
    h("div", { class: "classement-texte" }, h("div", { class: "ligne-titre" }, d.budgetNom ?? "Non classée"), h("div", { class: "ligne-detail" }, `${afficherJour(d.jour)}${d.note ? ` · ${d.note}` : ""}`)), // Budget, date et note
    h("div", { class: "ligne-montant montant-moins" }, `−${formaterMontant(d.montant)}`)))))); // Montant
} // Fin de dessinerHistorique

// Dessine l'écran dans la zone.
export async function afficherTableauDeBord(zone, { base, maintenant = new Date() }) { // Reçoit la zone, la base et l'instant de référence
  const onglets = [{ id: "actuel", libelle: "État actuel" }, { id: "historique", libelle: "Historique" }]; // Les deux vues
  const contenu = h("div", {}); // Contenu de la vue choisie
  const barre = h("div", { class: "segments", role: "tablist", "aria-label": "Vue du tableau de bord" }, ...onglets.map((o) => h("button", { type: "button", role: "tab", class: "segment", "data-vue": o.id, onclick: () => { choixEcran.onglet = o.id; dessiner(); } }, o.libelle))); // Boutons de choix de la vue
  zone.append(enteteEcran("Tableau de bord", "Vos indicateurs en graphiques"), barre, contenu); // Assemble
  async function dessiner() { // Affiche la vue choisie
    barre.querySelectorAll(".segment").forEach((b) => { const actif = b.getAttribute("data-vue") === choixEcran.onglet; b.classList.toggle("actif", actif); b.setAttribute("aria-selected", String(actif)); }); // Met en évidence la vue choisie
    const defilement = window.scrollY; // Position de la page (conservée quand on change un réglage)
    vider(contenu); // Efface l'ancienne vue
    try { // Calcule et dessine
      if (choixEcran.onglet === "actuel") dessinerActuel(contenu, await etatActuel(base, maintenant), dessiner); // État actuel
      else dessinerHistorique(contenu, await historique(base, { nombrePeriodes: choixEcran.nombrePeriodes, periodeRythme: choixEcran.periode || null }, maintenant), dessiner); // Historique
    } catch (erreur) { contenu.append(alerte({ niveau: "danger", message: `Impossible de calculer le tableau de bord : ${erreur?.message ?? erreur}` })); } // Erreur inattendue
    window.scrollTo?.(0, defilement); // Revient à la même position
  } // Fin de dessiner
  await dessiner(); // Première vue
} // Fin de afficherTableauDeBord
