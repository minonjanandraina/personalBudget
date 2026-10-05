// Écrans des opérations : liste filtrable des transactions et saisie d'une dépense manuelle.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonPrincipal, champ, choix } from "../composants.js"; // Composants
import { afficherToast } from "../messages.js"; // Notifications
import { soumettre, lireMontant, effacerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { datetimeLocalVersIso, isoVersDatetimeLocal, afficherDateHeure } from "../../core/dates.js"; // Conversions de dates
import { enregistrerDepense, resumeBudgets } from "../../core/allocations.js"; // Logique métier
import { listerTransactions } from "../../core/transactions.js"; // Liste des transactions
import { listerBudgets } from "../../core/budgets.js"; // Liste des budgets

// Dessine la liste des transactions dans le conteneur, selon les filtres.
async function dessinerListe(conteneur, base, { budgetId, sens }) { // Reçoit la zone, la base et les filtres
  vider(conteneur); // Efface la liste précédente
  const transactions = await listerTransactions(base, { budgetId, sens }); // Lit les transactions filtrées
  if (transactions.length === 0) conteneur.append(alerte({ niveau: "info", message: "Aucune opération pour ces critères." })); // Message si la liste est vide
  for (const t of transactions) { // Pour chaque transaction
    const entree = t.debitCredit === 1; // Alimentation (entrée d'argent dans le budget) ?
    conteneur.append(h("div", { class: "carte ligne apparition visible" }, // Une carte par transaction
      h("div", { class: "ligne-texte" }, // Bloc de texte
        h("div", { class: "ligne-titre" }, t.budgetName ?? "Non classée"), // Budget (ou « Non classée »)
        h("div", { class: "ligne-detail" }, `${afficherDateHeure(t.dateOperation)} · ${entree ? "Allocation" : "Dépense"} · ${t.insertType === "auto" ? "SMS" : "manuel"}`), // Date, nature et origine
        t.note ? h("div", { class: "ligne-detail" }, t.note) : null, // Note éventuelle
      ), // Fin du bloc de texte
      h("div", { class: `ligne-montant ${entree ? "montant-plus" : "montant-moins"}` }, `${entree ? "+" : "−"}${formaterMontant(t.montant)}`), // Montant signé
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de dessinerListe

// Liste des opérations avec filtres par budget et par sens.
export async function afficherOperations(zone, { base }) { // Reçoit la zone et la base
  const budgets = await listerBudgets(base); // Budgets (pour le filtre)
  const filtreBudget = choix({ id: "filtre-budget", libelle: "Budget", options: [{ valeur: "", libelle: "Tous les budgets" }, ...budgets.map((b) => ({ valeur: b.id, libelle: b.name }))] }); // Filtre par budget
  const filtreSens = choix({ id: "filtre-sens", libelle: "Type", options: [{ valeur: "", libelle: "Toutes" }, { valeur: "-1", libelle: "Dépenses" }, { valeur: "1", libelle: "Allocations" }] }); // Filtre par sens
  const liste = h("div", { class: "liste-operations" }); // Zone de la liste
  const recharger = () => dessinerListe(liste, base, { budgetId: filtreBudget.lire() === "" ? null : Number(filtreBudget.lire()), sens: filtreSens.lire() === "" ? null : Number(filtreSens.lire()) }); // Redessine la liste selon les filtres
  filtreBudget.element.querySelector("select").addEventListener("change", recharger); // Recharge quand le budget change
  filtreSens.element.querySelector("select").addEventListener("change", recharger); // Recharge quand le type change
  zone.append( // Assemble l'écran
    enteteEcran("Opérations", "Dépenses et allocations"), // En-tête
    boutonLien("Nouvelle dépense", "/operations/depense", "ajouter"), // Bouton de saisie d'une dépense
    h("div", { class: "espace-haut" }, boutonLien("Allouer un budget", "/allocations/nouveau", "allocations")), // Raccourci d'allocation
    h("div", { class: "filtres espace-haut" }, filtreBudget.element, filtreSens.element), // Filtres
    liste, // Liste
  ); // Fin de l'assemblage
  await recharger(); // Affiche la liste initiale
} // Fin de afficherOperations

// Formulaire de saisie d'une dépense manuelle.
export async function afficherFormulaireDepense(zone, { base }) { // Reçoit la zone et la base
  zone.append(enteteEcran("Nouvelle dépense", null, { retour: "/operations" })); // En-tête
  const resumes = await resumeBudgets(base); // Situation de chaque budget
  if (resumes.length === 0) { // Aucun budget : rien à dépenser
    zone.append(alerte({ niveau: "attention", message: "Créez d'abord un budget." }), h("div", { class: "espace-haut" }, boutonLien("Créer un budget", "/budgets/nouveau", "budgets"))); // Explication et raccourci
    return; // Rien d'autre à afficher
  } // Fin du cas sans budget
  const libelleBudget = (r) => `${r.budget.name} — ${r.allocation ? `solde ${formaterMontant(r.allocation.solde)}` : "non alloué"}`; // Texte d'une option : nom et solde
  const champs = { // Champs du formulaire
    budgetId: choix({ id: "dep-budget", libelle: "Budget", options: [{ valeur: "", libelle: "— Choisir —" }, ...resumes.map((r) => ({ valeur: r.budget.id, libelle: libelleBudget(r) }))] }), // Budget avec son solde
    montant: champ({ id: "dep-montant", libelle: "Montant (Ar)", inputmode: "numeric" }), // Montant
    dateOperation: champ({ id: "dep-date", libelle: "Date et heure", type: "datetime-local", valeur: isoVersDatetimeLocal(new Date().toISOString()) }), // Date préremplie à maintenant
    note: champ({ id: "dep-note", libelle: "Note (facultative)", aide: "Ex. : essence, repas…" }), // Note
  }; // Fin des champs
  const enregistrer = () => { // Enregistre le formulaire
    effacerErreurs(champs); // Repart sans erreur affichée
    const montant = lireMontant(champs.montant); // Lit le montant (affiche l'erreur de format)
    const dateOperation = datetimeLocalVersIso(champs.dateOperation.lire()); // Convertit la date en ISO UTC
    if (dateOperation === null) champs.dateOperation.afficherErreur("La date et l'heure sont invalides."); // Date illisible
    if (montant === null || dateOperation === null) { afficherToast("Corrigez les champs en rouge.", "erreur"); return Promise.resolve(false); } // Arrête si un champ est illisible
    return soumettre({ // Enregistre
      champs, // Champs à surveiller
      action: () => enregistrerDepense(base, { budgetId: Number(champs.budgetId.lire()) || null, montant, dateOperation, note: champs.note.lire() }), // Enregistre la dépense (bloquée si solde insuffisant)
      messageSucces: "Dépense enregistrée.", // Message de succès
      routeSucces: "/operations", // Retour à la liste
    }); // Fin de l'enregistrement
  }; // Fin de enregistrer
  zone.append(carte(champs.budgetId.element, champs.montant.element, champs.dateOperation.element, champs.note.element, boutonPrincipal("Enregistrer la dépense", enregistrer))); // Carte du formulaire
} // Fin de afficherFormulaireDepense
