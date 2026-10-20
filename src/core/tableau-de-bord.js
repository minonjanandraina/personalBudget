// Tableau de bord : calcule les indicateurs (état actuel et historique) à partir des données locales. Aucun dessin ici : l'écran dessine les graphiques.
// Définitions (par période et par budget) :
//   allocation nette = allocations normales + transferts entrants − transferts sortants ;
//   capacité = allocation nette + reports entrants (l'argent disponible pour dépenser pendant la période) ;
//   dépensé = dépenses normales ; reliquat = capacité − dépensé ; taux de consommation = dépensé ÷ capacité.
// Une période est celle de l'allocation (jour J au jour J-1 du mois suivant, voir periodes.js).
import { lireJourJob } from "./parametres.js"; // Jour de lancement des périodes
import { periodePour, jourLocal, afficherJour } from "./periodes.js"; // Calcul des périodes
import { situationFinanciere } from "./soldes.js"; // Solde Mobile Money disponible, réservé, libre
import { compterNonClassees, compterSmsIllisibles } from "./import-sms.js"; // SMS à traiter
import { calculerAlertes } from "./alertes.js"; // Alertes actuelles

export const CHOIX_NB_PERIODES = [3, 6, 12]; // Nombres de périodes proposés pour l'historique
export const NB_PERIODES_DEFAUT = 6; // Valeur par défaut
const JOUR_MS = 24 * 3600 * 1000; // Un jour en millisecondes

// Jour « AAAA-MM-JJ » en nombre de jours depuis 1970 (pour compter des jours sans souci d'heure d'été).
const numeroJour = (jour) => { const [a, m, j] = jour.split("-").map(Number); return Math.round(Date.UTC(a, m - 1, j) / JOUR_MS); }; // Convertit un jour en entier

// Texte court d'une période pour un axe de graphique : "20/10".
const courtPeriode = (dateFrom) => afficherJour(dateFrom).slice(0, 5); // Jour et mois du début

// Les périodes récentes, de la plus ancienne à la période en cours (incluse).
export function periodesRecentes(jourJob, nombre, maintenant = new Date()) { // Reçoit le jour réglé, le nombre de périodes et l'instant de référence
  const liste = [periodePour(jourJob, maintenant)]; // Période en cours
  while (liste.length < nombre) { // Remonte dans le passé
    const [a, m, j] = liste[0].dateFrom.split("-").map(Number); // Début de la plus ancienne période connue
    liste.unshift(periodePour(jourJob, new Date(a, m - 1, j - 1))); // La veille de ce début tombe dans la période précédente
  } // Fin de la remontée
  return liste.map((p) => ({ ...p, libelle: `${afficherJour(p.dateFrom)} → ${afficherJour(p.dateTo)}`, court: courtPeriode(p.dateFrom) })); // Ajoute les textes d'affichage
} // Fin de periodesRecentes

// Une ligne par (période, budget) avec les totaux de l'allocation correspondante.
async function lignesBudgetsParPeriode(base, periodes) { // Reçoit la base et les périodes (ordre chronologique)
  const lignes = await base.requeter( // Totaux par allocation
    `SELECT a.id AS allocation_id, a.date_from, b.id AS budget_id, b.name AS budget_name, b.montant_max, b.solde_alert, ty.name AS type_name,
       COALESCE(SUM(CASE WHEN t.debit_credit = 1 AND t.nature = 'normale' THEN t.montant END), 0) AS allocations,
       COALESCE(SUM(CASE WHEN t.debit_credit = 1 AND t.nature = 'report' THEN t.montant END), 0) AS reporte,
       COALESCE(SUM(CASE WHEN t.debit_credit = 1 AND t.nature = 'transfert' THEN t.montant END), 0) AS transferts_entrants,
       COALESCE(SUM(CASE WHEN t.debit_credit = -1 AND t.nature = 'transfert' THEN t.montant END), 0) AS transferts_sortants,
       COALESCE(SUM(CASE WHEN t.debit_credit = -1 AND t.nature = 'normale' THEN t.montant END), 0) AS depense
     FROM allocation_budget a JOIN budget b ON b.id = a.budget_id JOIN type_budget ty ON ty.id = b.type_id
     LEFT JOIN transactions t ON t.allocation_id = a.id
     WHERE a.date_from >= ? AND a.date_from <= ? GROUP BY a.id ORDER BY b.name`, // Allocations dont le début tombe dans la fenêtre
    [periodes[0].dateFrom, periodes[periodes.length - 1].dateTo], // Fenêtre
  ); // Fin de la lecture
  return lignes.flatMap((l) => { // Rattache chaque allocation à sa période
    const rang = periodes.findIndex((p) => l.date_from >= p.dateFrom && l.date_from <= p.dateTo); // Période qui contient le début de l'allocation
    if (rang < 0) return []; // Hors fenêtre
    const alloueNet = Number(l.allocations) + Number(l.transferts_entrants) - Number(l.transferts_sortants); // Allocation nette
    const capacite = alloueNet + Number(l.reporte); // Argent disponible dans la période
    const depense = Number(l.depense); // Dépensé
    return [{ rang, budgetId: Number(l.budget_id), budgetNom: l.budget_name, typeNom: l.type_name, montantMax: Number(l.montant_max), soldeAlert: Number(l.solde_alert), alloueNet, reporte: Number(l.reporte), capacite, depense, reliquat: capacite - depense, taux: capacite > 0 ? depense / capacite : 0 }]; // Ligne calculée
  }); // Fin du rattachement
} // Fin de lignesBudgetsParPeriode

// Pourcentage entier (0 si le dénominateur est nul).
const pourcent = (partie, total) => (total > 0 ? Math.round((partie * 100) / total) : 0); // Arrondi à l'entier

// Regroupe des lignes par clé en additionnant les dépenses : [{ label, valeur }] trié du plus grand au plus petit.
function repartition(lignes, cle) { // Reçoit les lignes et la fonction qui donne la clé
  const somme = new Map(); // Total par clé
  for (const l of lignes) somme.set(cle(l), (somme.get(cle(l)) ?? 0) + l.depense); // Additionne les dépenses
  return [...somme.entries()].map(([label, valeur]) => ({ label, valeur })).filter((x) => x.valeur > 0).sort((a, b) => b.valeur - a.valeur); // Garde ce qui a été dépensé
} // Fin de repartition

// ===== ÉTAT ACTUEL =====
// Indicateurs de la période en cours : situation, rythme, santé des budgets, répartition, éléments à traiter.
export async function etatActuel(base, maintenant = new Date()) { // Reçoit la base et l'instant de référence
  const jourJob = await lireJourJob(base); // Jour de lancement
  const [periode] = periodesRecentes(jourJob, 1, maintenant); // Période en cours
  const lignes = await lignesBudgetsParPeriode(base, [periode]); // Budgets alloués sur la période
  const aujourdhui = jourLocal(maintenant.toISOString()); // Jour courant
  const joursTotal = numeroJour(periode.dateTo) - numeroJour(periode.dateFrom) + 1; // Nombre de jours de la période
  const joursEcoules = Math.min(joursTotal, Math.max(1, numeroJour(aujourdhui) - numeroJour(periode.dateFrom) + 1)); // Jours écoulés, aujourd'hui compris
  const joursRestants = Math.max(0, joursTotal - joursEcoules + 1); // Jours restants, aujourd'hui compris
  const capacite = lignes.reduce((s, l) => s + l.capacite, 0); // Argent disponible dans la période
  const depense = lignes.reduce((s, l) => s + l.depense, 0); // Total dépensé
  const solde = capacite - depense; // Reste à dépenser
  const depenseParJour = Math.round(depense / joursEcoules); // Dépense moyenne par jour écoulé
  const projectionFin = Math.round((depense / joursEcoules) * joursTotal); // Dépense totale estimée à la fin de la période
  const situation = await situationFinanciere(base); // Solde Mobile Money, réservé, libre
  const budgets = lignes.map((l) => ({ // Santé de chaque budget
    budgetId: l.budgetId, nom: l.budgetNom, typeNom: l.typeNom, capacite: l.capacite, depense: l.depense, solde: l.reliquat, pct: pourcent(l.depense, l.capacite),
    niveau: l.soldeAlert > 0 && l.reliquat < l.soldeAlert ? "danger" : l.reliquat > l.montantMax ? "attention" : "ok", // Seuil d'alerte franchi, plafond dépassé, ou normal
  })).sort((a, b) => b.pct - a.pct || a.nom.localeCompare(b.nom)); // Les plus consommés d'abord
  const [{ n: nonClasseesN, total }] = await base.requeter("SELECT COUNT(*) AS n, COALESCE(SUM(montant), 0) AS total FROM transactions WHERE allocation_id IS NULL AND insert_type = 'auto' AND nature = 'normale'"); // Dépenses SMS à classer
  return { // Résultat
    periode, joursTotal, joursEcoules, joursRestants, // La période et son avancement
    situation: { disponible: situation.mm?.disponible ?? null, reserve: situation.reserve, libre: situation.libre }, // Situation financière
    totaux: { capacite, depense, solde, pctConsomme: pourcent(depense, capacite), pctTemps: pourcent(joursEcoules, joursTotal) }, // Totaux de la période
    rythme: { depenseParJour, projectionFin, margeProjection: capacite - projectionFin, resteParJour: Math.floor(Math.max(0, solde) / Math.max(1, joursRestants)) }, // Rythme et projection
    budgets, // Santé des budgets
    repartitionBudgets: repartition(lignes, (l) => l.budgetNom), repartitionTypes: repartition(lignes, (l) => l.typeNom), // Répartition des dépenses
    aTraiter: { nonClassees: Number(nonClasseesN), montantNonClasse: Number(total), illisibles: await compterSmsIllisibles(base), alertes: (await calculerAlertes(base, maintenant)).length }, // Éléments à traiter
  }; // Fin du résultat
} // Fin de etatActuel

// ===== HISTORIQUE =====

// Dépenses normales (classées ou non) d'une période, avec le nom du budget.
async function depensesDeLaPeriode(base, periode) { // Reçoit la base et la période
  const [a, m, j] = periode.dateFrom.split("-").map(Number); // Début de la période
  const debutIso = new Date(a, m - 1, j - 1).toISOString(); // Un jour de marge avant le début (le tri exact se fait en jours locaux)
  const lignes = await base.requeter( // Dépenses depuis cette date
    `SELECT t.id, t.montant, t.note, t.date_operation, b.name AS budget_nom FROM transactions t
     LEFT JOIN allocation_budget al ON al.id = t.allocation_id LEFT JOIN budget b ON b.id = al.budget_id
     WHERE t.debit_credit = -1 AND t.nature = 'normale' AND t.date_operation >= ? ORDER BY t.date_operation`, [debutIso]); // Dépenses normales
  return lignes.map((l) => ({ id: Number(l.id), montant: Number(l.montant), note: l.note, dateOperation: l.date_operation, jour: jourLocal(l.date_operation), budgetNom: l.budget_nom ?? null })).filter((d) => d.jour >= periode.dateFrom && d.jour <= periode.dateTo); // Garde celles de la période
} // Fin de depensesDeLaPeriode

// Un point par jour : le dernier solde Mobile Money connu ce jour-là, depuis le début de la fenêtre.
async function courbeSoldeMM(base, debutFenetre) { // Reçoit la base et le premier jour de la fenêtre
  const [a, m, j] = debutFenetre.split("-").map(Number); // Premier jour
  const lignes = await base.requeter("SELECT datetime, balance FROM solde_om WHERE datetime >= ? ORDER BY datetime, id", [new Date(a, m - 1, j).toISOString()]); // Soldes de la fenêtre
  const parJour = new Map(); // Dernier solde de chaque jour
  for (const l of lignes) parJour.set(jourLocal(l.datetime), Number(l.balance)); // Le plus récent du jour écrase les autres
  return [...parJour.entries()].map(([jour, solde]) => ({ jour, solde })); // Liste chronologique
} // Fin de courbeSoldeMM

// Historique sur les N dernières périodes. « periodeRythme » : début (AAAA-MM-JJ) de la période pour les graphiques 9 et 10 (défaut : période en cours).
export async function historique(base, { nombrePeriodes = NB_PERIODES_DEFAUT, periodeRythme = null } = {}, maintenant = new Date()) { // Reçoit la base, les choix et l'instant de référence
  const jourJob = await lireJourJob(base); // Jour de lancement
  const periodes = periodesRecentes(jourJob, CHOIX_NB_PERIODES.includes(nombrePeriodes) ? nombrePeriodes : NB_PERIODES_DEFAUT, maintenant); // Périodes affichées
  const lignes = await lignesBudgetsParPeriode(base, periodes); // Totaux par période et par budget
  const types = [...new Set(lignes.map((l) => l.typeNom))].sort(); // Types rencontrés (ordre stable pour les couleurs)
  const parPeriode = periodes.map((p, rang) => { // Totaux de chaque période
    const l = lignes.filter((x) => x.rang === rang); // Lignes de la période
    const capacite = l.reduce((s, x) => s + x.capacite, 0); // Capacité
    const depense = l.reduce((s, x) => s + x.depense, 0); // Dépensé
    return { periode: p, capacite, depense, reliquat: capacite - depense, reporte: l.reduce((s, x) => s + x.reporte, 0), parType: types.map((t) => ({ type: t, montant: l.filter((x) => x.typeNom === t).reduce((s, x) => s + x.depense, 0) })), reportesParBudget: l.filter((x) => x.reporte > 0).map((x) => ({ budget: x.budgetNom, montant: x.reporte })) }; // Totaux, détail par type et reports par budget
  }); // Fin des périodes
  const budgetsConnus = [...new Map(lignes.map((l) => [l.budgetId, l.budgetNom])).entries()].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom)); // Budgets présents dans la fenêtre
  const comparatif = budgetsConnus.map((b) => { // Alloué contre dépensé pour chaque budget
    const parPer = periodes.map((p, rang) => { const l = lignes.find((x) => x.rang === rang && x.budgetId === b.id); return { capacite: l?.capacite ?? 0, depense: l?.depense ?? 0 }; }); // Une entrée par période
    const cap = parPer.reduce((s, x) => s + x.capacite, 0); const dep = parPer.reduce((s, x) => s + x.depense, 0); // Totaux sur la fenêtre
    return { budgetId: b.id, nom: b.nom, parPeriode: parPer, tauxMoyen: pourcent(dep, cap) }; // Résultat par budget
  }).sort((a, b) => b.tauxMoyen - a.tauxMoyen); // Les plus consommés d'abord
  const choisie = periodes.find((p) => p.dateFrom === periodeRythme) ?? periodes[periodes.length - 1]; // Période des graphiques 9 et 10
  const depenses = await depensesDeLaPeriode(base, choisie); // Dépenses de cette période
  const total = numeroJour(choisie.dateTo) - numeroJour(choisie.dateFrom) + 1; // Jours de la période
  const aujourdhui = numeroJour(jourLocal(maintenant.toISOString())); // Jour courant
  const dernierJour = Math.min(total, aujourdhui - numeroJour(choisie.dateFrom) + 1); // Dernier jour à tracer (jamais dans le futur)
  const capaciteChoisie = parPeriode[periodes.indexOf(choisie)].capacite; // Argent disponible dans cette période
  const parJour = new Map(); // Dépense de chaque jour de la période (rang 1..total)
  for (const d of depenses) parJour.set(numeroJour(d.jour) - numeroJour(choisie.dateFrom) + 1, (parJour.get(numeroJour(d.jour) - numeroJour(choisie.dateFrom) + 1) ?? 0) + d.montant); // Additionne par jour
  let cumul = 0; // Cumul courant
  const rythme = Array.from({ length: total }, (_, i) => { // Un point par jour
    const jour = i + 1; // Rang du jour
    if (jour <= dernierJour) cumul += parJour.get(jour) ?? 0; // Cumule jusqu'à aujourd'hui
    return { jour, reel: jour <= dernierJour ? cumul : null, ideal: Math.round((capaciteChoisie * jour) / total) }; // Réel (absent dans le futur) et droite idéale
  }); // Fin des points
  return { // Résultat
    periodes, choisie, // Périodes affichées et période choisie
    soldeMM: await courbeSoldeMM(base, periodes[0].dateFrom), // Graphique 5
    depensesParPeriode: { types, periodes: parPeriode.map((x) => ({ court: x.periode.court, libelle: x.periode.libelle, total: x.depense, parType: x.parType })) }, // Graphique 6
    comparatif: { budgets: comparatif, periodes: periodes.map((p) => ({ court: p.court, libelle: p.libelle })) }, // Graphique 7
    reliquats: parPeriode.map((x) => ({ court: x.periode.court, libelle: x.periode.libelle, total: x.reporte, parBudget: x.reportesParBudget })), // Graphique 8
    rythme: { capacite: capaciteChoisie, points: rythme, depenseTotale: cumul }, // Graphique 9
    plusGrosses: depenses.slice().sort((a, b) => b.montant - a.montant || a.id - b.id).slice(0, 10).map((d) => ({ montant: d.montant, jour: d.jour, budgetNom: d.budgetNom, note: d.note })), // Graphique 10
  }; // Fin du résultat
} // Fin de historique
