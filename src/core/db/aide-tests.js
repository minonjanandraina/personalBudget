// Outils partagés par les tests : fabrique une base neuve en mémoire, avec toutes les migrations appliquées.
import { ouvrirBaseSqlJs } from "../../platform/base-sqljs.js"; // Adaptateur sql.js (tourne sous Windows, sans téléphone)
import { appliquerMigrations } from "./migrations.js"; // Application des migrations

// Renvoie une base prête à l'emploi (vide mais avec toutes les tables).
export async function creerBaseDeTest() { // Aucun paramètre
  const base = await ouvrirBaseSqlJs(); // Ouvre une base vide en mémoire
  await appliquerMigrations(base); // Crée toutes les tables
  return base; // Renvoie la base
} // Fin de creerBaseDeTest

// Crée un type et un budget valides, utiles à de nombreux tests ; renvoie leurs identifiants.
export async function creerBudgetDeTest(base, surcharges = {}) { // Les valeurs peuvent être modifiées via « surcharges »
  const type = await base.executer("INSERT INTO type_budget (code, name) VALUES ('bdg-001', 'Loisir')"); // Crée un type
  const valeurs = { name: "Sorties", montant_budget: 100000, montant_max: 150000, montant_min: 0, solde_alert: 10000, ...surcharges }; // Valeurs par défaut, modifiables
  const budget = await base.executer( // Crée le budget
    "INSERT INTO budget (name, type_id, montant_budget, montant_max, montant_min, solde_alert) VALUES (?, ?, ?, ?, ?, ?)", // Requête d'insertion
    [valeurs.name, type.dernierId, valeurs.montant_budget, valeurs.montant_max, valeurs.montant_min, valeurs.solde_alert], // Valeurs dans l'ordre
  ); // Fin de l'insertion du budget
  return { typeId: type.dernierId, budgetId: budget.dernierId }; // Renvoie les identifiants créés
} // Fin de creerBudgetDeTest

// Enregistre un solde Orange Money très ancien et très grand : les tests d'allocation ne sont pas limités par le solde OM.
export async function ajouterSoldeOMDeTest(base, balance = 10000000000) { // Reçoit la base et le montant
  await base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2020-01-01T00:00:00.000Z', ?)", [balance]); // Solde daté de 2020 : toutes les dépenses des tests sont postérieures
} // Fin de ajouterSoldeOMDeTest
