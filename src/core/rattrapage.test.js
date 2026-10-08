// Dépense oubliée rattrapée après un solde Mobile Money réel : la case « déjà comprise dans le solde » évite de la retirer deux fois.
import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget } from "./types-budget.js"; // Types
import { creerBudget } from "./budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense, modifierOperation } from "./allocations.js"; // Allocation et dépense
import { situationFinanciere, soldeMMDisponible } from "./soldes.js"; // Situation financière
import { listerTransactions } from "./transactions.js"; // Transactions
import { ErreurValidation } from "./erreurs.js"; // Erreurs

let base; // Base utilisée par les cas de test
let budgetId; // Budget alloué de 100 000
const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Date locale (indépendante du fuseau de la machine)
const OCTOBRE = local(2026, 10, 25); // Allocation le 25 octobre (période du 20/10 au 19/11)
const APRES = local(2026, 10, 26, 10); // Le lendemain matin : on rattrape la dépense oubliée

const poserSolde = (balance, quand) => base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [quand.toISOString(), balance]); // Enregistre un solde Mobile Money

// Scénario de départ : solde Mobile Money 150 000, 100 000 alloués, puis le vrai solde saisi est 90 000 (60 000 ont été dépensés sans être enregistrés).
beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  const typeId = await creerTypeBudget(base, { name: "Loisir" }); // Type
  budgetId = await creerBudget(base, { name: "Sorties", typeId, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 0, autogenFinMois: false }); // Budget
  await poserSolde(150000, local(2026, 10, 1, 8)); // Solde du 1er octobre
  await allouerBudget(base, { budgetId, montant: 100000 }, OCTOBRE); // Réserve 100 000
  await poserSolde(90000, local(2026, 10, 26, 9)); // Vrai solde du 26 octobre : 60 000 ont disparu
}); // Fin de la préparation

describe("dépense oubliée rattrapée", () => { // Scénario demandé
  it("point de départ : le libre est négatif (150 000 → solde réel 90 000, réservé 100 000)", async () => { // Écart
    expect(await situationFinanciere(base)).toMatchObject({ reserve: 100000, libre: -10000 }); // 90 000 - 100 000
  }); // Fin du cas

  it("sans la case, la dépense est retirée une seconde fois et l'écart reste (le piège)", async () => { // Comportement sans case
    await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: APRES.toISOString() }, APRES); // Dépense datée après le solde
    expect(await situationFinanciere(base)).toMatchObject({ reserve: 40000, libre: -10000 }); // Disponible 30 000, réservé 40 000 : libre inchangé
  }); // Fin du cas

  it("avec la case « déjà comprise », l'écart disparaît", async () => { // Solution
    await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: APRES.toISOString(), compriseDansSolde: true }, APRES); // Dépense rattrapée
    const s = await situationFinanciere(base); // Situation
    expect(s.mm.disponible).toBe(90000); // Le solde réel n'est pas retiré une seconde fois
    expect(s.reserve).toBe(40000); // La dépense a bien diminué le budget
    expect(s.libre).toBe(50000); // 90 000 - 40 000 : plus d'écart
  }); // Fin du cas

  it("une dépense normale saisie ensuite continue de diminuer le solde disponible", async () => { // Dépenses suivantes
    await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: APRES.toISOString(), compriseDansSolde: true }, APRES); // Rattrapage
    await enregistrerDepense(base, { budgetId, montant: 10000, dateOperation: local(2026, 10, 26, 11).toISOString() }, local(2026, 10, 26, 11)); // Vraie nouvelle dépense
    expect((await soldeMMDisponible(base)).disponible).toBe(80000); // 90 000 - 10 000 seulement
  }); // Fin du cas

  it("la dépense garde sa vraie date et est marquée dans la liste", async () => { // Date et marque
    const vraieDate = local(2026, 10, 22, 15); // La dépense a eu lieu le 22
    await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: vraieDate.toISOString(), compriseDansSolde: true }, APRES); // Rattrapage
    const [t] = await listerTransactions(base, { sens: -1 }); // Relit
    expect(t.dateOperation).toBe(vraieDate.toISOString()); // Date réelle conservée
    expect(t.compriseDansSolde).toBe(true); // Marquée
  }); // Fin du cas

  it("refuse la case quand aucun solde Mobile Money n'est saisi", async () => { // Sans solde
    await base.executer("DELETE FROM solde_om"); // Supprime les soldes
    const erreur = await enregistrerDepense(base, { budgetId, montant: 1000, dateOperation: APRES.toISOString(), compriseDansSolde: true }, APRES).catch((e) => e); // Tente
    expect(erreur).toBeInstanceOf(ErreurValidation); // Erreur de saisie
    expect(erreur.erreurs.compriseDansSolde).toMatch(/rien à rattraper/); // Message
    expect(await listerTransactions(base, { sens: -1 })).toHaveLength(0); // Rien n'est écrit
  }); // Fin du cas

  it("peut être cochée ou décochée en modifiant la dépense, et reste inchangée si on ne précise rien", async () => { // Modification
    const id = (await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: APRES.toISOString() }, APRES)).idTransaction; // Dépense sans la case
    expect((await situationFinanciere(base)).libre).toBe(-10000); // Écart
    await modifierOperation(base, id, { montant: 60000, dateOperation: APRES.toISOString(), compriseDansSolde: true }, APRES); // Coche la case
    expect((await situationFinanciere(base)).libre).toBe(50000); // Écart disparu
    await modifierOperation(base, id, { montant: 60000, dateOperation: APRES.toISOString() }, APRES); // Modifie sans préciser la case
    expect((await situationFinanciere(base)).libre).toBe(50000); // Toujours cochée
    await modifierOperation(base, id, { montant: 60000, dateOperation: APRES.toISOString(), compriseDansSolde: false }, APRES); // Décoche
    expect((await situationFinanciere(base)).libre).toBe(-10000); // Écart revenu
  }); // Fin du cas

  it("n'a plus d'effet sur un solde saisi encore plus tard", async () => { // Nouveau solde
    await enregistrerDepense(base, { budgetId, montant: 60000, dateOperation: APRES.toISOString(), compriseDansSolde: true }, APRES); // Rattrapage
    await poserSolde(85000, local(2026, 10, 27, 9)); // Nouveau solde réel plus tard
    expect((await soldeMMDisponible(base)).disponible).toBe(85000); // Le nouveau solde remplace le calcul
  }); // Fin du cas
}); // Fin du groupe
