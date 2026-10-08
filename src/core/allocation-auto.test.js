import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeMMDeTest } from "./db/aide-tests.js"; // Base neuve et solde Mobile Money de test
import { creerTypeBudget } from "./types-budget.js"; // Types
import { creerBudget } from "./budgets.js"; // Budgets
import { resumeBudgets, enregistrerDepense, allouerBudget } from "./allocations.js"; // Allocation
import { allocationAutomatique } from "./allocation-auto.js"; // Fonction à tester

let base; // Base de chaque cas
let typeId; // Type de budget
const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Date locale (indépendante du fuseau de la machine)
const SEPTEMBRE = local(2026, 9, 25); // Période du 20/09 au 19/10
const OCTOBRE = local(2026, 10, 25); // Période du 20/10 au 19/11

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Type
}); // Fin de la préparation

const nouveauBudget = (surcharges = {}) => creerBudget(base, { name: "Loisirs", typeId, montantBudget: 100000, montantMax: 200000, montantMin: 0, soldeAlert: 0, autogenFinMois: true, ...surcharges }); // Budget automatique par défaut
const soldeEnCours = async (budgetId, quand) => (await resumeBudgets(base, quand)).find((r) => r.budget.id === budgetId)?.allocation?.solde ?? null; // Solde de la période

describe("allocationAutomatique", () => { // Rattrapage à l'ouverture
  it("alloue les budgets automatiques seulement, pas les autres", async () => { // Cas nominal
    await ajouterSoldeMMDeTest(base, 1000000); // Solde Mobile Money
    const auto = await nouveauBudget({ name: "Auto" }); // Automatique
    const manuel = await nouveauBudget({ name: "Manuel", autogenFinMois: false }); // Manuel
    const bilan = await allocationAutomatique(base, OCTOBRE); // Lance
    expect(bilan).toMatchObject({ faits: 1, erreur: null }); // Un budget alloué
    expect(await soldeEnCours(auto, OCTOBRE)).toBe(100000); // Alloué
    expect(await soldeEnCours(manuel, OCTOBRE)).toBeNull(); // Non touché
  }); // Fin du cas

  it("est idempotent : relancer à chaque ouverture ne change plus rien", async () => { // Rejouable
    await ajouterSoldeMMDeTest(base, 1000000); // Solde Mobile Money
    const id = await nouveauBudget(); // Budget automatique
    await allocationAutomatique(base, OCTOBRE); // Première ouverture
    const bilan = await allocationAutomatique(base, OCTOBRE); // Seconde ouverture
    expect(bilan).toMatchObject({ faits: 0, erreur: null }); // Rien de nouveau
    expect(await soldeEnCours(id, OCTOBRE)).toBe(100000); // Pas de double allocation
  }); // Fin du cas

  it("rattrape un mois manqué et reporte le reliquat de l'ancienne période", async () => { // Application fermée le jour J
    await ajouterSoldeMMDeTest(base, 1000000); // Solde Mobile Money
    const id = await nouveauBudget(); // Budget automatique
    await allouerBudget(base, { budgetId: id, montant: 100000 }, SEPTEMBRE); // Allocation de septembre
    await enregistrerDepense(base, { budgetId: id, montant: 60000, dateOperation: SEPTEMBRE.toISOString() }, SEPTEMBRE); // 60 000 dépensés
    const bilan = await allocationAutomatique(base, OCTOBRE); // Ouverture en octobre, sans avoir ouvert le 20
    expect(bilan.faits).toBe(1); // Mis à jour
    expect(await soldeEnCours(id, OCTOBRE)).toBe(140000); // 40 000 reportés + 100 000
  }); // Fin du cas

  it("ne lance jamais d'erreur : sans solde Mobile Money, renvoie le message et n'écrit rien", async () => { // Aucun solde
    const id = await nouveauBudget(); // Budget automatique
    const bilan = await allocationAutomatique(base, OCTOBRE); // Lance
    expect(bilan.faits).toBe(0); // Rien fait
    expect(bilan.erreur).toContain("solde"); // Message expliquant
    expect(await soldeEnCours(id, OCTOBRE)).toBeNull(); // Rien d'écrit
  }); // Fin du cas

  it("tout ou rien : si le libre à allouer est insuffisant, aucune allocation n'est écrite", async () => { // Solde trop juste
    await ajouterSoldeMMDeTest(base, 150000); // Solde Mobile Money : de quoi payer un seul budget
    const a = await nouveauBudget({ name: "A" }); // Premier budget
    const b = await nouveauBudget({ name: "B" }); // Second budget
    const bilan = await allocationAutomatique(base, OCTOBRE); // Lance
    expect(bilan.faits).toBe(0); // Rien d'écrit
    expect(bilan.erreur).toContain("insuffisant"); // Message
    expect(await soldeEnCours(a, OCTOBRE)).toBeNull(); // A non alloué
    expect(await soldeEnCours(b, OCTOBRE)).toBeNull(); // B non alloué
  }); // Fin du cas

  it("ne fait rien (sans erreur) quand il n'y a aucun budget automatique", async () => { // Aucun budget
    await nouveauBudget({ autogenFinMois: false }); // Budget manuel seulement
    expect(await allocationAutomatique(base, OCTOBRE)).toMatchObject({ faits: 0, erreur: null }); // Rien à faire
  }); // Fin du cas
}); // Fin du groupe
