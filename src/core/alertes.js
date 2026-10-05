// Alertes affichées dans l'application (jamais envoyées ailleurs) :
// 1. écart de solde (dépense probablement non enregistrée), 2. solde d'un budget sous son seuil d'alerte,
// 3. solde d'un budget au-dessus de son plafond, 4. aucun solde Orange Money saisi.
import { formaterMontant } from "./format.js"; // Affichage des montants dans les messages
import { resumeBudgets } from "./allocations.js"; // Situation de chaque budget sur la période en cours
import { situationFinanciere } from "./soldes.js"; // Solde OM disponible, réservé et libre

// Ordre d'affichage : le plus urgent d'abord.
const ORDRE_TYPES = { ecart: 0, seuil: 1, plafond: 2, sans_solde: 3 }; // Écart, puis seuils, puis plafonds, puis solde manquant

// Calcule la liste des alertes actuelles. Chaque alerte : { type, niveau, message, budgetId?, action: { libelle, route } }.
// Aucune tolérance : le moindre écart négatif, le moindre solde sous le seuil ou au-dessus du plafond déclenche l'alerte.
export async function calculerAlertes(base, aujourdhui = new Date()) { // Reçoit la base et la date du jour
  const alertes = []; // Alertes trouvées
  const { om, libre } = await situationFinanciere(base); // Situation d'ensemble
  if (om === null) { // Aucun solde OM saisi : on ne peut ni allouer ni contrôler
    alertes.push({ type: "sans_solde", niveau: "attention", message: "Aucun solde Orange Money saisi : saisissez-le pour pouvoir allouer vos budgets.", action: { libelle: "Saisir le solde", route: "/solde/nouveau" } }); // Alerte de démarrage
  } else if (libre < 0) { // Le total réservé dépasse le solde OM disponible
    alertes.push({ type: "ecart", niveau: "danger", message: `Écart de ${formaterMontant(-libre)} : le total réservé dans les budgets dépasse votre solde Orange Money disponible. Une dépense n'a peut-être pas été enregistrée.`, action: { libelle: "Enregistrer une dépense", route: "/operations/depense" } }); // Dépense probablement oubliée
  } // Fin des alertes de solde
  for (const r of await resumeBudgets(base, aujourdhui)) { // Pour chaque budget alloué sur la période en cours
    const a = r.allocation; // Son allocation en cours
    if (!a) continue; // Un budget non alloué n'a pas de solde à surveiller
    if (r.sousSeuil) alertes.push({ type: "seuil", niveau: "danger", budgetId: r.budget.id, message: `« ${r.budget.name} » : solde de ${formaterMontant(a.solde)}, sous le seuil d'alerte de ${formaterMontant(r.budget.soldeAlert)}.`, action: { libelle: "Allouer ce budget", route: `/allocations/nouveau/${r.budget.id}` } }); // Seuil minimal atteint
    if (r.depassePlafond) alertes.push({ type: "plafond", niveau: "attention", budgetId: r.budget.id, message: `« ${r.budget.name} » : solde de ${formaterMontant(a.solde)}, au-dessus du plafond de ${formaterMontant(r.budget.montantMax)} (excédent ${formaterMontant(a.solde - r.budget.montantMax)}). Une réallocation manuelle est nécessaire.`, action: { libelle: "Transférer l'excédent", route: `/allocations/transfert/${r.budget.id}` } }); // Plafond dépassé
  } // Fin de la boucle
  return alertes.sort((x, y) => ORDRE_TYPES[x.type] - ORDRE_TYPES[y.type]); // Le plus urgent d'abord (l'ordre alphabétique des budgets est conservé à l'intérieur d'un type)
} // Fin de calculerAlertes
