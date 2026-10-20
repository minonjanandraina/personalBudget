import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest, ajouterSoldeMMDeTest } from "./db/aide-tests.js"; // Base neuve et solde Mobile Money de test
import { creerTypeBudget } from "./types-budget.js"; // Types
import { creerBudget } from "./budgets.js"; // Budgets
import { allouerBudget, enregistrerDepense } from "./allocations.js"; // Allocation et dépense
import { lancerAllocationPeriode, transfererEntreBudgets } from "./reallocation.js"; // Report et transfert
import { creerTransaction } from "./transactions.js"; // Création d'une transaction SMS
import { periodesRecentes, etatActuel, historique, CHOIX_NB_PERIODES } from "./tableau-de-bord.js"; // Fonctions testées

let base; // Base de chaque cas
let typeLoisir; // Type « Loisir »
let typeVie; // Type « Vie »
const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Date locale (indépendante du fuseau de la machine)
const SEPTEMBRE = local(2026, 9, 25); // Période du 20/09 au 19/10
const OCTOBRE = local(2026, 10, 25); // Période du 20/10 au 19/11
const MAINTENANT = local(2026, 10, 29); // 10e jour de la période d'octobre

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  await ajouterSoldeMMDeTest(base); // Solde Mobile Money très grand
  typeLoisir = await creerTypeBudget(base, { name: "Loisir" }); // Type 1
  typeVie = await creerTypeBudget(base, { name: "Vie" }); // Type 2
}); // Fin de la préparation

const budget = (nom, surcharges = {}) => creerBudget(base, { name: nom, typeId: typeLoisir, montantBudget: 100000, montantMax: 500000, montantMin: 0, soldeAlert: 0, autogenFinMois: true, ...surcharges }); // Budget
const depenser = (budgetId, montant, quand) => enregistrerDepense(base, { budgetId, montant, dateOperation: quand.toISOString() }, quand); // Dépense

describe("periodesRecentes", () => { // Liste des périodes
  it("donne les périodes de la plus ancienne à la période en cours", () => { // Cas nominal
    const p = periodesRecentes(20, 3, OCTOBRE); // 3 périodes
    expect(p.map((x) => x.dateFrom)).toEqual(["2026-08-20", "2026-09-20", "2026-10-20"]); // Débuts
    expect(p[2]).toMatchObject({ dateTo: "2026-11-19", court: "20/10", libelle: "20/10/2026 → 19/11/2026" }); // Dernière période
  }); // Fin du cas
  it("traverse le changement d'année", () => { // Cas limite
    const p = periodesRecentes(5, 3, local(2027, 1, 10)); // Janvier 2027
    expect(p.map((x) => x.dateFrom)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]); // Débuts
  }); // Fin du cas
}); // Fin du groupe

describe("etatActuel", () => { // Indicateurs de la période en cours
  it("calcule les totaux, le rythme et la projection de fin de période", async () => { // Cas de référence
    const a = await budget("A"); const b = await budget("B", { montantBudget: 50000 }); // Deux budgets
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); // A : 100 000
    await allouerBudget(base, { budgetId: b, montant: 50000 }, OCTOBRE); // B : 50 000
    await depenser(a, 40000, local(2026, 10, 25)); // 40 000 dépensés
    const e = await etatActuel(base, MAINTENANT); // État du 29/10 (10e jour sur 31)
    expect(e.periode.dateFrom).toBe("2026-10-20"); // Période en cours
    expect(e).toMatchObject({ joursTotal: 31, joursEcoules: 10, joursRestants: 22 }); // Avancement
    expect(e.totaux).toEqual({ capacite: 150000, depense: 40000, solde: 110000, pctConsomme: 27, pctTemps: 32 }); // Totaux
    expect(e.rythme).toEqual({ depenseParJour: 4000, projectionFin: 124000, margeProjection: 26000, resteParJour: 5000 }); // 4 000/jour -> 124 000 ; 110 000 / 22 jours
    expect(e.situation.reserve).toBe(110000); // Réservé
    expect(e.budgets.map((x) => [x.nom, x.pct])).toEqual([["A", 40], ["B", 0]]); // Les plus consommés d'abord
  }); // Fin du cas

  it("colore les budgets selon le seuil d'alerte et le plafond", async () => { // Santé des budgets
    const ok = await budget("Ok"); // Normal
    const bas = await budget("Bas", { soldeAlert: 30000 }); // Sous son seuil
    const haut = await budget("Haut", { montantMax: 50000, montantBudget: 40000 }); // Au-dessus de son plafond
    await allouerBudget(base, { budgetId: ok, montant: 100000 }, OCTOBRE); // Ok
    await allouerBudget(base, { budgetId: bas, montant: 100000 }, OCTOBRE); // Bas
    await allouerBudget(base, { budgetId: haut, montant: 100000 }, OCTOBRE); // Haut
    await depenser(bas, 80000, local(2026, 10, 25)); // Bas : il reste 20 000 < 30 000
    const niveaux = Object.fromEntries((await etatActuel(base, MAINTENANT)).budgets.map((x) => [x.nom, x.niveau])); // Niveau de chaque budget
    expect(niveaux).toEqual({ Ok: "ok", Bas: "danger", Haut: "attention" }); // Couleurs
  }); // Fin du cas

  it("répartit les dépenses par budget et par type, du plus grand au plus petit", async () => { // Répartition
    const a = await budget("A"); const b = await budget("B", { typeId: typeVie }); const c = await budget("C"); // Trois budgets, deux types
    for (const id of [a, b, c]) await allouerBudget(base, { budgetId: id, montant: 100000 }, OCTOBRE); // Alloue
    await depenser(a, 10000, local(2026, 10, 25)); await depenser(b, 30000, local(2026, 10, 25)); await depenser(c, 5000, local(2026, 10, 26)); // Dépenses
    const e = await etatActuel(base, MAINTENANT); // État
    expect(e.repartitionBudgets).toEqual([{ label: "B", valeur: 30000 }, { label: "A", valeur: 10000 }, { label: "C", valeur: 5000 }]); // Par budget
    expect(e.repartitionTypes).toEqual([{ label: "Vie", valeur: 30000 }, { label: "Loisir", valeur: 15000 }]); // Par type
  }); // Fin du cas

  it("compte les éléments à traiter (SMS non classés, SMS non compris, alertes)", async () => { // À traiter
    await creerTransaction(base, { trxId: "CO1.1", insertType: "auto", debitCredit: -1, montant: 7000, sms: "x", dateOperation: OCTOBRE.toISOString(), note: "sms" }); // Dépense non classée
    await base.executer("INSERT INTO sms_illisible (date_sms, texte) VALUES (?, ?)", [OCTOBRE.toISOString(), "texte inconnu"]); // SMS non compris
    const e = await etatActuel(base, MAINTENANT); // État
    expect(e.aTraiter).toMatchObject({ nonClassees: 1, montantNonClasse: 7000, illisibles: 1 }); // Compteurs
    expect(e.aTraiter.alertes).toBeGreaterThanOrEqual(2); // Au moins « à classer » et « non compris »
  }); // Fin du cas

  it("ne plante pas sans aucune allocation", async () => { // Base presque vide
    const e = await etatActuel(base, MAINTENANT); // État
    expect(e.totaux).toEqual({ capacite: 0, depense: 0, solde: 0, pctConsomme: 0, pctTemps: 32 }); // Zéros
    expect(e.budgets).toEqual([]); // Aucun budget alloué
    expect(e.rythme).toMatchObject({ depenseParJour: 0, projectionFin: 0 }); // Pas de dépense
  }); // Fin du cas

  it("prend en compte les transferts dans la capacité", async () => { // Transferts
    const a = await budget("A"); const b = await budget("B"); // Deux budgets
    await allouerBudget(base, { budgetId: a, montant: 100000 }, OCTOBRE); await allouerBudget(base, { budgetId: b, montant: 20000 }, OCTOBRE); // Allocations
    await transfererEntreBudgets(base, { sourceId: a, destinationId: b, montant: 30000 }, OCTOBRE); // A -> B
    const e = await etatActuel(base, MAINTENANT); // État
    expect(Object.fromEntries(e.budgets.map((x) => [x.nom, x.capacite]))).toEqual({ A: 70000, B: 50000 }); // Capacités nettes
    expect(e.totaux.capacite).toBe(120000); // Le transfert ne change pas le total
  }); // Fin du cas
}); // Fin du groupe

describe("historique", () => { // Indicateurs sur plusieurs périodes
  let a; // Budget A
  beforeEach(async () => { // Un mois de septembre dépensé en partie, puis le report en octobre
    a = await budget("A"); // Budget A
    await allouerBudget(base, { budgetId: a, montant: 100000 }, SEPTEMBRE); // Septembre : 100 000
    await depenser(a, 60000, local(2026, 9, 28)); // 60 000 dépensés
    await lancerAllocationPeriode(base, OCTOBRE); // Report de 40 000 + allocation d'octobre de 100 000
  }); // Fin de la préparation

  it("calcule les dépenses, reliquats et reports de chaque période", async () => { // Séries par période
    const h = await historique(base, { nombrePeriodes: 3 }, MAINTENANT); // 3 périodes
    expect(h.periodes.map((p) => p.court)).toEqual(["20/08", "20/09", "20/10"]); // Axe
    expect(h.depensesParPeriode.periodes.map((p) => p.total)).toEqual([0, 60000, 0]); // Dépenses par période
    expect(h.depensesParPeriode.types).toEqual(["Loisir"]); // Types
    expect(h.depensesParPeriode.periodes[1].parType).toEqual([{ type: "Loisir", montant: 60000 }]); // Détail par type
    expect(h.reliquats.map((r) => r.total)).toEqual([0, 0, 40000]); // Reports reçus
    expect(h.reliquats[2].parBudget).toEqual([{ budget: "A", montant: 40000 }]); // Détail du report
  }); // Fin du cas

  it("compare l'alloué et le dépensé par budget, avec le taux moyen", async () => { // Comparatif
    const h = await historique(base, { nombrePeriodes: 3 }, MAINTENANT); // 3 périodes
    const [ligneA] = h.comparatif.budgets; // Budget A
    expect(ligneA.parPeriode).toEqual([{ capacite: 0, depense: 0 }, { capacite: 100000, depense: 60000 }, { capacite: 140000, depense: 0 }]); // Capacité (report compris) et dépensé
    expect(ligneA.tauxMoyen).toBe(25); // 60 000 / 240 000
  }); // Fin du cas

  it("trace le rythme de la période choisie contre la droite idéale, sans futur", async () => { // Rythme
    await depenser(a, 5000, local(2026, 10, 22)); // Jour 3 de la période
    await depenser(a, 3000, local(2026, 10, 24)); // Jour 5
    const h = await historique(base, { nombrePeriodes: 3 }, MAINTENANT); // Période en cours par défaut
    expect(h.choisie.dateFrom).toBe("2026-10-20"); // Période par défaut
    expect(h.rythme.points).toHaveLength(31); // Un point par jour
    expect(h.rythme.points[2].reel).toBe(5000); // Cumul au jour 3
    expect(h.rythme.points[9].reel).toBe(8000); // Cumul au jour 10 (aujourd'hui)
    expect(h.rythme.points[10].reel).toBeNull(); // Pas de point dans le futur
    expect(h.rythme.points[30].ideal).toBe(140000); // La droite finit à la capacité
    const sept = await historique(base, { nombrePeriodes: 3, periodeRythme: "2026-09-20" }, MAINTENANT); // Période de septembre
    expect(sept.rythme.depenseTotale).toBe(60000); // Dépenses de septembre
    expect(sept.rythme.points[sept.rythme.points.length - 1].reel).toBe(60000); // Période passée : tracée en entier
  }); // Fin du cas

  it("liste les 10 plus grosses dépenses de la période choisie", async () => { // Top 10
    for (let i = 1; i <= 12; i += 1) await depenser(a, i * 100, local(2026, 10, 21)); // 12 petites dépenses
    const h = await historique(base, {}, MAINTENANT); // Période en cours
    expect(h.plusGrosses).toHaveLength(10); // 10 maximum
    expect(h.plusGrosses[0]).toMatchObject({ montant: 1200, budgetNom: "A" }); // La plus grosse d'abord
    expect(h.plusGrosses.map((d) => d.montant)).toEqual([1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300]); // Tri décroissant
    const sept = await historique(base, { periodeRythme: "2026-09-20" }, MAINTENANT); // Septembre
    expect(sept.plusGrosses.map((d) => d.montant)).toEqual([60000]); // Une seule dépense en septembre
  }); // Fin du cas

  it("garde un point par jour pour le solde Mobile Money (le dernier du jour)", async () => { // Courbe du solde
    await base.executer("DELETE FROM solde_om"); // Repart sans solde
    await base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [local(2026, 10, 21, 9).toISOString(), 500000]); // Matin
    await base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [local(2026, 10, 21, 18).toISOString(), 450000]); // Soir
    await base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", [local(2026, 10, 25, 10).toISOString(), 300000]); // Quelques jours plus tard
    const h = await historique(base, { nombrePeriodes: 3 }, MAINTENANT); // Historique
    expect(h.soldeMM).toEqual([{ jour: "2026-10-21", solde: 450000 }, { jour: "2026-10-25", solde: 300000 }]); // Un point par jour
  }); // Fin du cas

  it("revient à 6 périodes pour un nombre non proposé et accepte 3, 6 et 12", async () => { // Choix du nombre de périodes
    expect((await historique(base, { nombrePeriodes: 7 }, MAINTENANT)).periodes).toHaveLength(6); // Valeur inconnue
    for (const n of CHOIX_NB_PERIODES) expect((await historique(base, { nombrePeriodes: n }, MAINTENANT)).periodes).toHaveLength(n); // Valeurs proposées
  }); // Fin du cas
}); // Fin du groupe
