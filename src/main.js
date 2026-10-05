import { ouvrirBase } from "./platform/base.js"; // Ouvre la base (SQLite Android ou navigateur)
import { appliquerMigrations } from "./core/db/migrations.js"; // Crée/met à jour les tables
import { construireCoque } from "./ui/coque.js"; // Zone de contenu + barre d'onglets
import { creerRouteur } from "./ui/routeur.js"; // Affichage de l'écran selon l'adresse
import { afficherAccueil } from "./ui/ecrans/accueil.js"; // Écran d'accueil
import { afficherReglages } from "./ui/ecrans/reglages.js"; // Écran des réglages
import { afficherDiagnostic } from "./ui/ecrans/diagnostic.js"; // Écran de diagnostic
import { afficherTypes, afficherFormulaireType } from "./ui/ecrans/types-budget.js"; // Écrans des types de budget
import { afficherBudgets, afficherFormulaireBudget } from "./ui/ecrans/budgets.js"; // Écrans des budgets
import { afficherSoldes, afficherFormulaireSolde } from "./ui/ecrans/solde.js"; // Écrans du solde OM
import { afficherAllocations, afficherFormulaireAllocation } from "./ui/ecrans/allocations.js"; // Écrans des allocations
import { afficherOperations, afficherFormulaireDepense, afficherFormulaireOperation } from "./ui/ecrans/operations.js"; // Écrans des opérations
import { h } from "./ui/dom.js"; // Fabrication d'éléments

const racine = document.getElementById("app"); // Zone vide définie dans index.html

// Démarre l'application : ouvre la base, la met à jour, puis lance la navigation.
async function demarrer() { // Fonction asynchrone (la base répond avec un petit délai)
  try { // Tente le démarrage normal
    const base = await ouvrirBase(); // Ouvre la base
    await appliquerMigrations(base); // Applique les migrations en attente
    const { contenu, marquerActif } = construireCoque(racine); // Construit la coque (contenu + barre d'onglets)
    const routeur = creerRouteur({ // Crée le routeur
      conteneur: contenu, // Zone où les écrans s'affichent
      parDefaut: "/", // Écran affiché si l'adresse est inconnue
      auChangement: marquerActif, // Met à jour l'onglet actif à chaque changement d'écran
      routes: { // Liste des écrans
        "/": (zone) => afficherAccueil(zone, { base }), // Accueil
        "/budgets": (zone) => afficherBudgets(zone, { base }), // Liste des budgets
        "/budgets/nouveau": (zone) => afficherFormulaireBudget(zone, { base }), // Création d'un budget
        "/budgets/:id": (zone, ctx) => afficherFormulaireBudget(zone, { base, params: ctx.params }), // Modification d'un budget
        "/allocations": (zone) => afficherAllocations(zone, { base }), // Situation des budgets sur la période
        "/allocations/nouveau": (zone) => afficherFormulaireAllocation(zone, { base }), // Allocation d'un budget
        "/allocations/nouveau/:budgetId": (zone, ctx) => afficherFormulaireAllocation(zone, { base, params: ctx.params }), // Allocation d'un budget présélectionné
        "/operations": (zone) => afficherOperations(zone, { base }), // Liste des opérations
        "/operations/depense": (zone) => afficherFormulaireDepense(zone, { base }), // Saisie d'une dépense
        "/operations/:id": (zone, ctx) => afficherFormulaireOperation(zone, { base, params: ctx.params }), // Modification d'une opération
        "/types-budget": (zone) => afficherTypes(zone, { base }), // Liste des types
        "/types-budget/nouveau": (zone) => afficherFormulaireType(zone, { base }), // Création d'un type
        "/types-budget/:id": (zone, ctx) => afficherFormulaireType(zone, { base, params: ctx.params }), // Modification d'un type
        "/solde": (zone) => afficherSoldes(zone, { base }), // Historique des soldes
        "/solde/nouveau": (zone) => afficherFormulaireSolde(zone, { base }), // Saisie d'un solde
        "/reglages": (zone) => afficherReglages(zone, { base }), // Réglages
        "/diagnostic": (zone) => afficherDiagnostic(zone, { base }), // Diagnostic
      }, // Fin des écrans
    }); // Fin du routeur
    await routeur.demarrer(); // Affiche le premier écran
  } catch (erreur) { // En cas de problème au démarrage
    racine.replaceChildren(h("main", { class: "contenu" }, h("section", { class: "carte visible" }, h("h1", { class: "titre" }, "Volako"), h("p", {}, "Erreur au démarrage :"), h("pre", {}, String(erreur?.message ?? erreur))))); // Affiche l'erreur à l'écran (utile sur téléphone, sans console)
  } // Fin du try/catch
} // Fin de demarrer

demarrer(); // Lance le démarrage
