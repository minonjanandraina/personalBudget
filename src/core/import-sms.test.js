// Tests de l'import des SMS Orange Money : idempotence, soldes, doublons, anciens SMS, classement.
import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest, creerBudgetDeTest } from "./db/aide-tests.js"; // Base neuve et budget
import { importerSms, synchroniserSms, listerNonClassees, classerTransaction, listerSmsIllisibles, ignorerSmsIllisible, lireExpediteur, modifierExpediteur, dateDepartImport } from "./import-sms.js"; // Fonctions testées
import { soldeOMDisponible, lireDernierSolde } from "./soldes.js"; // Soldes
import { allouerBudget, soldeAllocation } from "./allocations.js"; // Allocation
import { calculerAlertes } from "./alertes.js"; // Alertes
import { SMS_EXEMPLES, SMS_IGNORES } from "../platform/sms-exemples.js"; // Les SMS réels
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs

let base; // Base de chaque cas
const DEPART = "2026-10-05T06:00:00.000Z"; // Solde initial saisi
const APRES = new Date("2026-10-05T10:00:00.000Z"); // « Maintenant » des SMS d'exemple (après le solde initial)
const sms = () => SMS_EXEMPLES(APRES); // Les six SMS d'exemple

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  await base.executer("INSERT INTO solde_om (datetime, balance) VALUES (?, 1000000)", [DEPART]); // Solde initial
}); // Fin de la préparation

describe("import des SMS", () => { // Groupe
  it("refuse d'importer sans solde initial", async () => { // Sans point de départ
    const vide = await creerBaseDeTest(); // Base sans solde
    await expect(importerSms(vide, sms())).rejects.toThrow(ErreurMetier); // Refusé avec un message
  }); // Fin du cas

  it("crée une dépense non classée par SMS compris, avec le total débité et le texte du SMS", async () => { // Cas principal
    expect(await importerSms(base, sms())).toEqual({ importes: 4, doublons: 0, anciens: 0, illisibles: 1, ignores: 1 }); // 4 opérations + 1 SMS non compris + 1 virement d'épargne ignoré
    const liste = await listerNonClassees(base); // Dépenses à classer
    expect(liste).toHaveLength(4); // Quatre dépenses
    expect(liste.map((t) => t.montant).sort((a, b) => a - b)).toEqual([500, 12400, 54500, 61900]); // Totaux (frais compris)
    const [ligne] = await base.requeter("SELECT insert_type, debit_credit, allocation_id, sms FROM transactions WHERE trx_id = 'MP261005.1023.C25734'"); // La dépense du transfert
    expect(ligne).toMatchObject({ insert_type: "auto", debit_credit: -1, allocation_id: null }); // Automatique, dépense, sans budget
    expect(ligne.sms).toContain("Votre transfert de 12000.0Ar"); // Texte brut conservé
  }); // Fin du cas

  it("est idempotent : relancer ne crée ni transaction, ni solde, ni SMS non compris en double", async () => { // Règle essentielle
    await importerSms(base, sms()); // Premier import
    const requete = "SELECT (SELECT COUNT(*) FROM transactions) AS t, (SELECT COUNT(*) FROM solde_om) AS s, (SELECT COUNT(*) FROM sms_illisible) AS i"; // Compteurs
    const avant = await base.requeter(requete); // Avant
    expect(await importerSms(base, sms())).toEqual({ importes: 0, doublons: 4, anciens: 0, illisibles: 0, ignores: 1 }); // Rien de nouveau
    expect(await base.requeter(requete)).toEqual(avant); // Identiques
  }); // Fin du cas

  it("enregistre le solde OM de chaque SMS qui en contient un, et le plus récent fait foi", async () => { // Soldes
    await importerSms(base, sms()); // Import
    const [{ n }] = await base.requeter("SELECT COUNT(*) AS n FROM solde_om"); // Soldes enregistrés
    expect(Number(n)).toBe(1 + 4); // Solde initial + 4 SMS avec solde (l'épargne n'en a pas)
    expect((await lireDernierSolde(base)).balance).toBe(931116); // Le dernier SMS : 931116.47 arrondi
  }); // Fin du cas

  it("ne retire pas une seconde fois du solde disponible les dépenses déjà comprises dans le solde du SMS", async () => { // Cohérence des soldes
    await importerSms(base, sms()); // Import
    expect((await soldeOMDisponible(base)).disponible).toBe(931116); // Égal au solde du dernier SMS (rien retiré en plus)
  }); // Fin du cas

  it("ignore les SMS antérieurs au solde initial", async () => { // Ancien historique
    const anciens = SMS_EXEMPLES(new Date("2026-10-01T10:00:00.000Z")); // SMS datés d'avant le solde initial
    expect(await importerSms(base, anciens)).toEqual({ importes: 0, doublons: 0, anciens: 6, illisibles: 0, ignores: 0 }); // Tous ignorés
    expect(await dateDepartImport(base)).toBe(DEPART); // Départ = solde initial
  }); // Fin du cas

  it("liste les SMS non compris une seule fois et permet de les ignorer pour de bon", async () => { // Revue des SMS
    await importerSms(base, sms()); // Import
    const [promo] = await listerSmsIllisibles(base); // Le SMS non compris
    expect(promo.texte).toContain("Promo"); // C'est la promotion
    await ignorerSmsIllisible(base, promo.id); // L'utilisateur l'ignore
    await importerSms(base, sms()); // Nouvelle synchronisation
    expect(await listerSmsIllisibles(base)).toEqual([]); // Il ne revient pas
  }); // Fin du cas

  it("synchroniserSms lit depuis le solde initial avec l'expéditeur réglé", async () => { // Lecture + import
    await modifierExpediteur(base, "OM-Mada"); // Réglage de l'expéditeur
    expect(await lireExpediteur(base)).toBe("OM-Mada"); // Relu
    let demande; // Paramètres reçus par la fausse lecture
    const bilan = await synchroniserSms(base, async (p) => { demande = p; return sms(); }); // Fausse lecture
    expect(demande).toEqual({ expediteur: "OM-Mada", depuis: DEPART }); // Bons paramètres
    expect(bilan.importes).toBe(4); // Importé
    await expect(modifierExpediteur(base, "  ")).rejects.toThrow(ErreurValidation); // Nom vide refusé
  }); // Fin du cas

  it("signale les dépenses à classer et les SMS non compris dans les alertes", async () => { // Alertes
    await importerSms(base, sms()); // Import
    const types = (await calculerAlertes(base)).map((a) => a.type); // Types d'alertes
    expect(types).toContain("a_classer"); // Dépenses à classer
    expect(types).toContain("sms_illisibles"); // SMS non compris
  }); // Fin du cas
}); // Fin du groupe

describe("classement d'une dépense SMS dans un budget", () => { // Groupe
  let budgetId; // Budget de test
  beforeEach(async () => { // Préparation : un budget alloué à la date des SMS
    ({ budgetId } = await creerBudgetDeTest(base, { montant_budget: 100000, montant_max: 150000 })); // Budget
    await allouerBudget(base, { budgetId, montant: 20000 }, APRES); // Allocation de 20 000 sur la période contenant le 5 octobre
    await importerSms(base, sms()); // Import
  }); // Fin de la préparation

  const idDe = async (montant) => (await listerNonClassees(base)).find((t) => t.montant === montant).id; // Identifiant d'une dépense à classer

  it("rattache la dépense à l'allocation de sa période : le solde du budget baisse", async () => { // Cas nominal
    const { allocationId } = await classerTransaction(base, await idDe(12400), budgetId); // Classe le transfert
    expect(await soldeAllocation(base, allocationId)).toBe(20000 - 12400); // Solde réduit du total débité
    expect(await listerNonClassees(base)).toHaveLength(3); // Plus que trois à classer
  }); // Fin du cas

  it("refuse quand le solde du budget est insuffisant", async () => { // Contrôle comme pour une dépense manuelle
    await expect(classerTransaction(base, await idDe(54500), budgetId)).rejects.toThrow(ErreurValidation); // 54 500 > 20 000
    expect(await listerNonClassees(base)).toHaveLength(4); // Rien n'a bougé
  }); // Fin du cas

  it("refuse quand le budget n'a pas d'allocation à la date de la dépense", async () => { // Budget non alloué
    const autre = (await base.executer("INSERT INTO budget (name, type_id, montant_budget, montant_max) VALUES ('Autre', 1, 1000, 2000)")).dernierId; // Budget sans allocation
    await expect(classerTransaction(base, await idDe(54500), autre)).rejects.toThrow(ErreurMetier); // Refusé
  }); // Fin du cas

  it("permet de remettre la dépense « à classer »", async () => { // Annulation
    const id = (await listerNonClassees(base)).find((t) => t.montant === 12400).id; // Le transfert
    await classerTransaction(base, id, budgetId); // Classe
    await classerTransaction(base, id, null); // Remet à classer
    expect(await listerNonClassees(base)).toHaveLength(4); // De nouveau quatre
  }); // Fin du cas

  it("refuse de classer une opération qui ne vient pas d'un SMS", async () => { // Seules les dépenses SMS
    const [{ id }] = await base.requeter("SELECT id FROM transactions WHERE debit_credit = 1 LIMIT 1"); // L'allocation
    await expect(classerTransaction(base, Number(id), budgetId)).rejects.toThrow(ErreurMetier); // Refusé
  }); // Fin du cas
}); // Fin du groupe

describe("SMS à ignorer (épargne, prêt crédité, dépôt)", () => { // Opérations que l'utilisateur ne veut pas voir comme dépenses
  const ignores = () => SMS_IGNORES(APRES); // Les cinq SMS à ignorer

  it("ne crée aucune transaction ni SMS non compris, mais garde les soldes OM qu'ils contiennent", async () => { // Cas principal
    expect(await importerSms(base, ignores())).toEqual({ importes: 0, doublons: 0, anciens: 0, illisibles: 0, ignores: 5 }); // Tous ignorés
    const [{ t, i, s }] = await base.requeter("SELECT (SELECT COUNT(*) FROM transactions) AS t, (SELECT COUNT(*) FROM sms_illisible) AS i, (SELECT COUNT(*) FROM solde_om) AS s"); // Compteurs
    expect([Number(t), Number(i)]).toEqual([0, 0]); // Ni transaction, ni SMS non compris
    expect(Number(s)).toBe(1 + 4); // Solde initial + 4 SMS avec solde OM (le virement programmé n'en a pas)
    expect((await lireDernierSolde(base)).balance).toBe(60416); // Le dernier SMS est le dépôt
  }); // Fin du cas

  it("est idempotent : relancer ne duplique aucun solde", async () => { // Rejouable
    await importerSms(base, ignores()); // Premier import
    await importerSms(base, ignores()); // Second import
    const [{ s }] = await base.requeter("SELECT COUNT(*) AS s FROM solde_om"); // Soldes
    expect(Number(s)).toBe(1 + 4); // Pas de doublon
  }); // Fin du cas

  it("retire la dépense à classer créée avant que ces SMS soient ignorés, et masque le SMS déjà listé non compris", async () => { // Nettoyage de l'ancien import
    const [virement] = ignores().filter((m) => m.corps.startsWith("Virement programme")); // Le virement vers l'épargne
    await base.executer("INSERT INTO transactions (trx_id, insert_type, debit_credit, montant, sms, date_operation) VALUES ('CO261001.0800.A06136', 'auto', -1, 500, ?, ?)", [virement.corps, virement.date]); // Ancienne dépense créée par l'ancien parser
    const [pret] = ignores().filter((m) => m.corps.includes("demande de pret")); // Le prêt crédité
    await base.executer("INSERT INTO sms_illisible (date_sms, texte) VALUES (?, ?)", [pret.date, pret.corps]); // Ancien « non compris »
    await importerSms(base, ignores()); // Import avec les nouvelles règles
    expect(await listerNonClassees(base)).toHaveLength(0); // La dépense a disparu
    expect(await listerSmsIllisibles(base)).toHaveLength(0); // Le SMS n'est plus listé
  }); // Fin du cas

  it("ne retire jamais une dépense déjà classée dans un budget", async () => { // Sécurité
    const [virement] = ignores().filter((m) => m.corps.startsWith("Virement programme")); // Le virement vers l'épargne
    await base.executer("INSERT INTO type_budget (code, name) VALUES ('bdg-001', 'T')"); // Type
    const b = (await base.executer("INSERT INTO budget (name, type_id, montant_budget, montant_max) VALUES ('B', 1, 1000, 2000)")).dernierId; // Budget
    const a = (await base.executer("INSERT INTO allocation_budget (budget_id, date_from, date_to, montant_alloue) VALUES (?, '2026-09-20', '2026-10-19', 1000)", [b])).dernierId; // Allocation
    await base.executer("INSERT INTO transactions (trx_id, allocation_id, insert_type, debit_credit, montant, sms, date_operation) VALUES ('CO261001.0800.A06136', ?, 'auto', -1, 500, ?, ?)", [a, virement.corps, virement.date]); // Dépense classée
    await importerSms(base, ignores()); // Import
    const [{ n }] = await base.requeter("SELECT COUNT(*) AS n FROM transactions"); // Transactions restantes
    expect(Number(n)).toBe(1); // Conservée
  }); // Fin du cas
}); // Fin du groupe
