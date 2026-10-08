import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve pour chaque cas
import { creerTypeBudget } from "./types-budget.js"; // Types
import { creerBudget } from "./budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense, modifierOperation } from "./allocations.js"; // Allocation et dépense
import { lancerAllocationPeriode, transfererEntreBudgets } from "./reallocation.js"; // Report et transferts
import { calculerAlertes } from "./alertes.js"; // Fonction à tester

let base; // Base utilisée par les cas de test
let typeId; // Type de budget disponible
const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Date locale (indépendante du fuseau de la machine)
const OCTOBRE = local(2026, 10, 25); // Période du 20/10 au 19/11
const SEPTEMBRE = local(2026, 9, 25); // Période du 20/09 au 19/10

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Repart d'une base neuve
  typeId = await creerTypeBudget(base, { name: "Loisir" }); // Crée un type
}); // Fin de la préparation

const poserSolde = (balance, quand = local(2026, 10, 1, 8)) => base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [quand.toISOString(), balance]); // Enregistre un solde Mobile Money
const nouveauBudget = (surcharges = {}) => creerBudget(base, { name: "Loisirs", typeId, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 30000, autogenFinMois: false, ...surcharges }); // Crée un budget
const depenser = (budgetId, montant, quand = OCTOBRE) => enregistrerDepense(base, { budgetId, montant, dateOperation: quand.toISOString() }, quand); // Dépense
const types = async (quand = OCTOBRE) => (await calculerAlertes(base, quand)).map((a) => a.type); // Types des alertes actuelles

describe("alerte « aucun solde Mobile Money »", () => { // Démarrage
  it("est levée tant qu'aucun solde n'est saisi, avec un lien vers la saisie", async () => { // Sans solde
    const [alerte] = await calculerAlertes(base, OCTOBRE); // Alertes
    expect(alerte).toMatchObject({ type: "sans_solde", niveau: "attention", action: { route: "/solde/nouveau" } }); // Alerte de démarrage
  }); // Fin du cas

  it("disparaît dès qu'un solde est saisi", async () => { // Avec solde
    await poserSolde(100000); // Solde
    expect(await types()).toEqual([]); // Plus d'alerte
  }); // Fin du cas
}); // Fin du groupe

describe("alerte « seuil d'alerte »", () => { // Solde sous le seuil
  it("se déclenche quand le solde d'un budget passe SOUS son seuil, pas à égalité", async () => { // Limite exacte
    await poserSolde(500000); // Solde Mobile Money
    const id = await nouveauBudget({ soldeAlert: 30000 }); // Seuil 30 000
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Solde 100 000
    await depenser(id, 70000); // Solde 30 000 : égal au seuil
    expect(await types()).toEqual([]); // Pas d'alerte à égalité
    await depenser(id, 1); // Solde 29 999 : sous le seuil (aucune tolérance)
    const alertes = await calculerAlertes(base, OCTOBRE); // Alertes
    expect(alertes.map((a) => a.type)).toEqual(["seuil"]); // Une alerte de seuil
    expect(alertes[0].message).toMatch(/« Loisirs » : solde de 29\s999 Ar, sous le seuil d'alerte de 30\s000 Ar/); // Message avec les chiffres
    expect(alertes[0]).toMatchObject({ niveau: "danger", budgetId: id, action: { route: `/allocations/nouveau/${id}` } }); // Niveau et lien
  }); // Fin du cas

  it("ne se déclenche pas si le seuil est 0 (un solde ne peut pas être négatif)", async () => { // Seuil nul
    await poserSolde(500000); // Solde Mobile Money
    const id = await nouveauBudget({ soldeAlert: 0 }); // Seuil 0
    await allouerBudget(base, { budgetId: id, montant: 1000 }, OCTOBRE); // 1 000
    await depenser(id, 1000); // Solde 0
    expect(await types()).toEqual([]); // Pas d'alerte
  }); // Fin du cas

  it("ignore un budget non alloué sur la période en cours", async () => { // Sans allocation
    await poserSolde(500000); // Solde Mobile Money
    await nouveauBudget({ soldeAlert: 30000 }); // Budget jamais alloué
    expect(await types()).toEqual([]); // Pas d'alerte
  }); // Fin du cas

  it("disparaît quand on alloue de nouveau le budget", async () => { // Résolution
    await poserSolde(500000); // Solde Mobile Money
    const id = await nouveauBudget({ soldeAlert: 30000 }); // Seuil 30 000
    await allouerBudget(base, { budgetId: id, montant: 20000 }, OCTOBRE); // 20 000 < 30 000
    expect(await types()).toEqual(["seuil"]); // Alerte
    await allouerBudget(base, { budgetId: id, montant: 20000 }, OCTOBRE); // 40 000
    expect(await types()).toEqual([]); // Alerte disparue
  }); // Fin du cas

  it("une alerte par budget concerné, avec le nom de chacun", async () => { // Plusieurs budgets
    await poserSolde(900000); // Solde Mobile Money
    const a = await nouveauBudget({ name: "A" }); // Budget A
    const b = await nouveauBudget({ name: "B" }); // Budget B
    const c = await nouveauBudget({ name: "C", soldeAlert: 0 }); // Budget C (pas d'alerte possible)
    for (const id of [a, b, c]) await allouerBudget(base, { budgetId: id, montant: 10000 }, OCTOBRE); // 10 000 chacun (A et B sous 30 000)
    const alertes = await calculerAlertes(base, OCTOBRE); // Alertes
    expect(alertes.map((x) => x.budgetId)).toEqual([a, b]); // A et B, dans l'ordre alphabétique
  }); // Fin du cas
}); // Fin du groupe

describe("alerte « plafond dépassé »", () => { // Solde au-dessus du plafond
  it("se déclenche quand le solde dépasse le plafond, pas à égalité, avec l'excédent", async () => { // Limite exacte
    await poserSolde(900000); // Solde Mobile Money
    const id = await nouveauBudget({ montantMax: 120000, soldeAlert: 0 }); // Plafond 120 000
    await allouerBudget(base, { budgetId: id, montant: 120000 }, OCTOBRE); // Solde 120 000 : égal au plafond
    expect(await types()).toEqual([]); // Pas d'alerte à égalité
    await allouerBudget(base, { budgetId: id, montant: 20000 }, OCTOBRE); // Solde 140 000
    const [alerte] = await calculerAlertes(base, OCTOBRE); // Alerte
    expect(alerte).toMatchObject({ type: "plafond", niveau: "attention", budgetId: id, action: { route: `/allocations/transfert/${id}` } }); // Type, niveau et lien de transfert
    expect(alerte.message).toMatch(/au-dessus du plafond de 120\s000 Ar \(excédent 20\s000 Ar\)/); // Excédent annoncé
  }); // Fin du cas

  it("apparaît après un report qui fait dépasser le plafond, et disparaît après un transfert de l'excédent", async () => { // Cycle complet
    await poserSolde(900000, local(2026, 9, 1)); // Solde Mobile Money
    const a = await nouveauBudget({ name: "A", montantMax: 120000, soldeAlert: 0, autogenFinMois: true }); // Plafond 120 000
    const b = await nouveauBudget({ name: "B", soldeAlert: 0 }); // Budget B
    await allouerBudget(base, { budgetId: a, montant: 100000 }, SEPTEMBRE); // Septembre
    await depenser(a, 60000, SEPTEMBRE); // Reste 40 000
    await allouerBudget(base, { budgetId: b, montant: 1000 }, OCTOBRE); // B alloué en octobre
    await lancerAllocationPeriode(base, OCTOBRE); // Octobre : 40 000 + 100 000 = 140 000 > 120 000
    expect(await types()).toEqual(["plafond"]); // Alerte de plafond
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 20000 }, OCTOBRE); // Transfère l'excédent
    expect(await types()).toEqual([]); // Alerte disparue
  }); // Fin du cas
}); // Fin du groupe

describe("alerte « écart de solde » (dépense non enregistrée)", () => { // Libre négatif
  it("se déclenche dès le moindre écart négatif (aucune tolérance), mais pas à zéro ni en positif", async () => { // Aucune tolérance
    const id = await nouveauBudget({ soldeAlert: 0, montantMax: 900000 }); // Budget
    await poserSolde(100000); // Solde Mobile Money 100 000
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Réserve 100 000 : libre 0
    expect(await types()).toEqual([]); // Écart nul : pas d'alerte
    await poserSolde(99999, local(2026, 10, 26)); // Vrai solde : 1 Ar de moins
    const alertes = await calculerAlertes(base, OCTOBRE); // Alertes
    expect(alertes.map((a) => a.type)).toEqual(["ecart"]); // Alerte pour 1 Ar d'écart
    expect(alertes[0].message).toMatch(/Écart de 1 Ar/); // Montant de l'écart
    expect(alertes[0]).toMatchObject({ niveau: "danger", action: { route: "/operations/depense" } }); // Niveau et lien
  }); // Fin du cas

  it("ne signale pas l'argent libre (solde supérieur au réservé) comme une erreur", async () => { // Libre positif
    await poserSolde(500000); // Solde Mobile Money
    const id = await nouveauBudget({ soldeAlert: 0 }); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Réserve 100 000 : libre 400 000
    expect(await types()).toEqual([]); // Pas d'alerte
  }); // Fin du cas

  it("indique le montant manquant et disparaît quand la dépense oubliée est rattrapée avec la case", async () => { // Résolution
    const id = await nouveauBudget({ soldeAlert: 0, montantMax: 900000 }); // Budget
    await poserSolde(150000, local(2026, 10, 1, 8)); // Solde 150 000
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Réserve 100 000
    await poserSolde(90000, local(2026, 10, 26, 9)); // Vrai solde 90 000 : 60 000 ont disparu
    const [alerte] = await calculerAlertes(base, OCTOBRE); // Alerte
    expect(alerte.type).toBe("ecart"); // Écart
    expect(alerte.message).toMatch(/Écart de 10\s000 Ar/); // 90 000 - 100 000
    const apres = local(2026, 10, 26, 10); // Le lendemain matin
    await enregistrerDepense(base, { budgetId: id, montant: 60000, dateOperation: apres.toISOString(), compriseDansSolde: true }, apres); // Rattrapage
    expect(await types(apres)).toEqual([]); // Alerte disparue
  }); // Fin du cas

  it("réapparaît si on décoche la case ou si on supprime la dépense", async () => { // Retour de l'écart
    const id = await nouveauBudget({ soldeAlert: 0, montantMax: 900000 }); // Budget
    await poserSolde(150000, local(2026, 10, 1, 8)); // Solde 150 000
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Réserve 100 000
    await poserSolde(90000, local(2026, 10, 26, 9)); // Vrai solde 90 000
    const apres = local(2026, 10, 26, 10); // Le lendemain matin
    const depense = (await enregistrerDepense(base, { budgetId: id, montant: 60000, dateOperation: apres.toISOString(), compriseDansSolde: true }, apres)).idTransaction; // Rattrapage
    await modifierOperation(base, depense, { montant: 60000, dateOperation: apres.toISOString(), compriseDansSolde: false }, apres); // Décoche la case
    expect(await types(apres)).toEqual(["ecart"]); // L'écart est revenu
  }); // Fin du cas
}); // Fin du groupe

describe("ensemble des alertes", () => { // Combinaison
  it("trie les alertes : écart, puis seuils, puis plafonds, puis solde manquant", async () => { // Ordre
    const a = await nouveauBudget({ name: "A", soldeAlert: 30000, montantMax: 500000 }); // Sous le seuil
    const b = await nouveauBudget({ name: "B", soldeAlert: 0, montantMax: 50000, montantBudget: 20000 }); // Au-dessus du plafond
    await poserSolde(200000, local(2026, 10, 1)); // Solde Mobile Money 200 000
    await allouerBudget(base, { budgetId: a, montant: 10000 }, OCTOBRE); // A : 10 000 (sous 30 000)
    await allouerBudget(base, { budgetId: b, montant: 60000 }, OCTOBRE); // B : 60 000 > 50 000
    await poserSolde(30000, local(2026, 10, 26)); // Vrai solde 30 000 : réservé 70 000 > 30 000 → écart
    const t = (await calculerAlertes(base, local(2026, 10, 27))).map((x) => x.type); // Types
    expect(t).toEqual(["ecart", "seuil", "plafond"]); // Ordre attendu
  }); // Fin du cas

  it("ne renvoie aucune alerte quand tout va bien", async () => { // Situation saine
    await poserSolde(500000); // Solde Mobile Money
    const id = await nouveauBudget({ soldeAlert: 30000 }); // Budget
    await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // 100 000
    await depenser(id, 10000); // Reste 90 000
    expect(await calculerAlertes(base, OCTOBRE)).toEqual([]); // Aucune alerte
  }); // Fin du cas
}); // Fin du groupe
