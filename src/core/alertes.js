// Alertes affichées dans l'application (jamais envoyées ailleurs) :
// 1. écart de solde (dépense probablement non enregistrée), 2. solde d'un budget sous son seuil d'alerte,
// 3. solde d'un budget au-dessus de son plafond, 4. aucun solde Mobile Money saisi,
// 5. dépenses issues de SMS à classer dans un budget, 6. SMS Mobile Money non compris.
import { formaterMontant } from "./format.js"; // Affichage des montants dans les messages
import { resumeBudgets } from "./allocations.js"; // Situation de chaque budget sur la période en cours
import { situationFinanciere } from "./soldes.js"; // Solde Mobile Money disponible, réservé et libre
import { compterNonClassees, compterSmsIllisibles } from "./import-sms.js"; // SMS à classer et SMS non compris

// Ordre d'affichage : le plus urgent d'abord.
const ORDRE_TYPES = { ecart: 0, seuil: 1, plafond: 2, sans_solde: 3, a_classer: 4, sms_illisibles: 5 }; // Écart, puis seuils, puis plafonds, puis solde manquant, puis SMS à classer, puis SMS non compris

// Calcule la liste des alertes actuelles. Chaque alerte : { type, niveau, message, budgetId?, action: { libelle, route } }.
// Aucune tolérance : le moindre écart négatif, le moindre solde sous le seuil ou au-dessus du plafond déclenche l'alerte.
export async function calculerAlertes(base, aujourdhui = new Date()) { // Reçoit la base et la date du jour
  const alertes = []; // Alertes trouvées
  const { mm, libre } = await situationFinanciere(base); // Situation d'ensemble
  if (mm === null) { // Aucun solde Mobile Money saisi : on ne peut ni allouer ni contrôler
    alertes.push({ type: "sans_solde", niveau: "attention", message: "Aucun solde Mobile Money saisi : saisissez-le pour pouvoir allouer vos budgets.", action: { libelle: "Saisir le solde", route: "/solde/nouveau" } }); // Alerte de démarrage
  } else if (libre < 0) { // Le total réservé dépasse le solde Mobile Money disponible
    alertes.push({ type: "ecart", niveau: "danger", message: `Écart de ${formaterMontant(-libre)} : le total réservé dans les budgets dépasse votre solde Mobile Money disponible. Une dépense n'a peut-être pas été enregistrée.`, action: { libelle: "Enregistrer une dépense", route: "/operations/depense" } }); // Dépense probablement oubliée
  } // Fin des alertes de solde
  for (const r of await resumeBudgets(base, aujourdhui)) { // Pour chaque budget alloué sur la période en cours
    const a = r.allocation; // Son allocation en cours
    if (!a) continue; // Un budget non alloué n'a pas de solde à surveiller
    if (r.sousSeuil) alertes.push({ type: "seuil", niveau: "danger", budgetId: r.budget.id, message: `« ${r.budget.name} » : solde de ${formaterMontant(a.solde)}, sous le seuil d'alerte de ${formaterMontant(r.budget.soldeAlert)}.`, action: { libelle: "Allouer ce budget", route: `/allocations/nouveau/${r.budget.id}` } }); // Seuil minimal atteint
    if (r.depassePlafond) alertes.push({ type: "plafond", niveau: "attention", budgetId: r.budget.id, message: `« ${r.budget.name} » : solde de ${formaterMontant(a.solde)}, au-dessus du plafond de ${formaterMontant(r.budget.montantMax)} (excédent ${formaterMontant(a.solde - r.budget.montantMax)}). Une réallocation manuelle est nécessaire.`, action: { libelle: "Transférer l'excédent", route: `/allocations/transfert/${r.budget.id}` } }); // Plafond dépassé
  } // Fin de la boucle
  const aClasser = await compterNonClassees(base); // Dépenses SMS pas encore rangées dans un budget
  if (aClasser > 0) alertes.push({ type: "a_classer", niveau: "attention", message: `${aClasser} dépense${aClasser > 1 ? "s" : ""} issue${aClasser > 1 ? "s" : ""} de SMS Mobile Money ${aClasser > 1 ? "sont" : "est"} à classer dans un budget.`, action: { libelle: "Classer", route: "/sms" } }); // Rappel : tant qu'elles ne sont pas classées, elles pèsent sur le solde libre
  const illisibles = await compterSmsIllisibles(base); // SMS que l'application n'a pas compris
  if (illisibles > 0) alertes.push({ type: "sms_illisibles", niveau: "attention", message: `${illisibles} SMS Mobile Money ${illisibles > 1 ? "n'ont" : "n'a"} pas été compris : vérifiez-${illisibles > 1 ? "les" : "le"} (une opération a peut-être été manquée).`, action: { libelle: "Voir les SMS", route: "/sms" } }); // Un SMS non compris peut cacher une opération
  return alertes.sort((x, y) => ORDRE_TYPES[x.type] - ORDRE_TYPES[y.type]); // Le plus urgent d'abord (l'ordre alphabétique des budgets est conservé à l'intérieur d'un type)
} // Fin de calculerAlertes
