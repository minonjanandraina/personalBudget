import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest, creerBudgetDeTest, ajouterSoldeMMDeTest } from "./db/aide-tests.js"; // Base neuve, budget et solde Mobile Money
import { allouerBudget } from "./allocations.js"; // Allocation
import { supprimerBudget } from "./budgets.js"; // Suppression d'un budget
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs
import { importerSms, listerNonClassees } from "./import-sms.js"; // Import des SMS
import { SMS_EXEMPLES } from "../platform/sms-exemples.js"; // SMS réels
import { validerOperation, variablesDuCode, resumeSaisies, creerOperation, modifierOperation, supprimerOperation, listerOperations, preparerEnvoi, lancerOperation , erreurNumero, erreurPinMm, controlerSortie } from "./operations-ussd.js"; // Fonctions à tester
import { rapprocherEnAttente, listerEnAttente, annulerEnAttente } from "./ussd-en-attente.js"; // Envois en attente

const APRES = new Date("2026-10-05T10:00:00.000Z"); // Heure des SMS d'exemple
const RETRAIT = "#144*8*8*{numero}*{montant}*{pin}#"; // Code de retrait
let base; // Base de chaque cas
let budgetId; // Budget débité

// Faux accès USSD : enregistre le dernier code envoyé.
const faux = (extra = {}) => ({ // Fabrique un faux
  envoyerCode: vi.fn(async () => "Operation en cours de traitement."), // Réponse de Mobile Money
  ...extra, // Surcharges
}); // Fin du faux

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  await ajouterSoldeMMDeTest(base); // Solde Mobile Money énorme (daté de 2020)
  ({ budgetId } = await creerBudgetDeTest(base, { montant_budget: 100000, montant_max: 150000 })); // Budget
  await allouerBudget(base, { budgetId, montant: 20000 }, APRES); // 20 000 alloués sur la période du 5 octobre
}); // Fin de la préparation

const modele = (surcharges = {}) => ({ nom: "Retrait Mobile Money", type: "sortie", code: RETRAIT, budgetId, ...surcharges }); // Modèle valide

describe("validation d'un modèle", () => { // Contrôles de saisie
  it("reconnaît les variables du code", () => { // Variables
    expect(variablesDuCode(RETRAIT)).toEqual(["numero", "montant", "pin"]); // Dans l'ordre
    expect(variablesDuCode("#144#")).toEqual([]); // Aucune
  }); // Fin du cas
  it("résume les saisies demandées (numéro répété, sans numéro, sans rien)", () => { // Aperçu du formulaire
    expect(resumeSaisies("#144*1*2*{numero}*{numero}*{montant}*{pin}#")).toContain("inséré 2 fois"); // Numéro répété
    expect(resumeSaisies("#144*4*1*1*{montant}*{pin}#")).toBe("À chaque envoi, on demandera un montant."); // Sans numéro
    expect(resumeSaisies("#144*1*{pin}#")).toContain("Aucune saisie"); // Rien à saisir
  }); // Fin du cas
  it("accepte un modèle correct", () => { expect(validerOperation(modele())).toEqual({}); }); // Cas nominal
  it("accepte un long code (plus de 100 caractères) mais refuse celui qui dépasserait 182 caractères une fois rempli", () => { // Codes longs
    const long = `#144*${"1*".repeat(50)}{numero}*{montant}*{pin}#`; // Environ 120 caractères
    expect(validerOperation(modele({ code: long })).code).toBeUndefined(); // Accepté
    const tropLong = `#144*${"1*".repeat(80)}{numero}*{montant}*{pin}#`; // Environ 180 caractères une fois rempli : trop long
    expect(validerOperation(modele({ code: tropLong })).code).toMatch(/trop long/); // Refusé avec explication
  }); // Fin du cas
  it("refuse les codes mal formés et les variables inconnues", () => { // Codes invalides
    expect(validerOperation(modele({ code: "144*8*8*{montant}#" })).code).toBeDefined(); // Ne commence pas par # ou *
    expect(validerOperation(modele({ code: "#144*8*8*{montant}" })).code).toBeDefined(); // Ne finit pas par #
    expect(validerOperation(modele({ code: "#144*abc*{montant}#" })).code).toBeDefined(); // Lettres
    expect(validerOperation(modele({ code: "#144*{compte}*{montant}#" })).code).toContain("Variable inconnue"); // Variable inconnue
  }); // Fin du cas
  it("une sortie exige {montant} et un budget ; une entrée n'a pas de budget", () => { // Règles par type
    expect(validerOperation(modele({ code: "#144*8*8*{numero}*{pin}#" })).code).toContain("{montant}"); // Montant indispensable
    expect(validerOperation(modele({ budgetId: null })).budgetId).toBeDefined(); // Budget obligatoire
    expect(validerOperation(modele({ type: "entree", code: "#144*1*{pin}#", budgetId: null }))).toEqual({}); // Entrée valide
    expect(validerOperation(modele({ type: "entree", code: "#144*1*{pin}#" })).budgetId).toBeDefined(); // Entrée avec budget : refusée
  }); // Fin du cas
}); // Fin du groupe

describe("modèles : création, modification, suppression", () => { // CRUD
  it("crée, liste, modifie et supprime", async () => { // Cycle
    const id = await creerOperation(base, modele()); // Création
    expect((await listerOperations(base))[0]).toMatchObject({ id, nom: "Retrait Mobile Money", type: "sortie", budgetId, budgetNom: "Sorties" }); // Liste
    await modifierOperation(base, id, modele({ nom: "Retrait Mobile Money" })); // Modification
    expect((await listerOperations(base))[0].nom).toBe("Retrait Mobile Money"); // Modifié
    await supprimerOperation(base, id); // Suppression
    expect(await listerOperations(base)).toEqual([]); // Supprimé
  }); // Fin du cas
  it("refuse deux modèles de même nom (sans tenir compte des majuscules)", async () => { // Unicité
    await creerOperation(base, modele()); // Premier
    await expect(creerOperation(base, modele({ nom: "retrait mobile money" }))).rejects.toThrow(ErreurValidation); // Doublon
  }); // Fin du cas
  it("un budget utilisé par un modèle ne peut pas être supprimé", async () => { // Intégrité
    const libre = (await base.executer("INSERT INTO budget (name, type_id, montant_budget, montant_max) VALUES ('Libre', 1, 1000, 2000)")).dernierId; // Budget sans allocation
    await creerOperation(base, modele({ budgetId: libre })); // Modèle qui le débite
    await expect(supprimerBudget(base, libre)).rejects.toThrow("opération(s) USSD"); // Refusé avec un message clair
  }); // Fin du cas
}); // Fin du groupe

describe("préparation d'un envoi", () => { // Contrôles avant l'envoi
  it("remplace {numero} et {montant}, garde {pin} et masque le PIN à l'affichage", async () => { // Code final
    const id = await creerOperation(base, modele()); // Modèle
    const prep = await preparerEnvoi(base, id, { numero: "032 75 738 15", montant: 5000 }, APRES); // Prépare
    expect(prep.code).toBe("#144*8*8*0327573815*5000*{pin}#"); // Le PIN Mobile Money reste à insérer côté Android
    expect(prep.codeAffiche).toBe("#144*8*8*0327573815*5000*••••#"); // Masqué
  }); // Fin du cas
  it("un numéro retapé : {numero} répété dans le code est remplacé partout, saisi une seule fois", async () => { // Retrait avec confirmation du numéro
    const id = await creerOperation(base, modele({ code: "#144*1*2*{numero}*{numero}*{montant}*{pin}#" })); // Modèle de retrait
    const prep = await preparerEnvoi(base, id, { numero: "0327573815", montant: 5000 }, APRES); // Prépare
    expect(prep.code).toBe("#144*1*2*0327573815*0327573815*5000*{pin}#"); // Numéro inséré aux deux endroits
  }); // Fin du cas
  it("sans numéro : un code sans {numero} ne demande aucun numéro", async () => { // Remboursement de prêt
    const id = await creerOperation(base, modele({ code: "#144*4*1*1*{montant}*{pin}#" })); // Modèle sans numéro
    const prep = await preparerEnvoi(base, id, { montant: 5000 }, APRES); // Prépare sans numéro
    expect(prep.code).toBe("#144*4*1*1*5000*{pin}#"); // Pas de numéro dans le code
    expect(prep.numero).toBe(""); // Aucun numéro retenu
  }); // Fin du cas
  it("refuse un numéro ou un montant invalide", async () => { // Valeurs
    const id = await creerOperation(base, modele()); // Modèle
    await expect(preparerEnvoi(base, id, { numero: "12", montant: 5000 }, APRES)).rejects.toThrow(ErreurValidation); // Numéro trop court
    await expect(preparerEnvoi(base, id, { numero: "0327573815", montant: 0 }, APRES)).rejects.toThrow(ErreurValidation); // Montant nul
  }); // Fin du cas
  it("refuse quand le solde du budget est insuffisant, comme une dépense manuelle", async () => { // Contrôle du budget
    const id = await creerOperation(base, modele()); // Modèle
    await expect(preparerEnvoi(base, id, { numero: "0327573815", montant: 20001 }, APRES)).rejects.toThrow("Solde insuffisant"); // 20 001 > 20 000
  }); // Fin du cas
  it("refuse quand le budget n'a pas d'allocation à la date du jour", async () => { // Budget non alloué
    const id = await creerOperation(base, modele()); // Modèle
    await expect(preparerEnvoi(base, id, { numero: "0327573815", montant: 100 }, new Date("2027-03-01T10:00:00.000Z"))).rejects.toThrow(ErreurMetier); // Aucune allocation en mars 2027
  }); // Fin du cas
}); // Fin du groupe

describe("lancement d'une opération", () => { // Envoi réel (faux téléphone)
  let id; // Modèle de sortie
  beforeEach(async () => { id = await creerOperation(base, modele()); }); // Modèle

  it("n'exige aucun PIN de l'application ni verrouillage : seul le PIN Mobile Money est demandé", async () => { // Pas de PIN de l'application
    const ussd = faux(); // Faux téléphone
    await lancerOperation(base, ussd, id, { numero: "0327573815", montant: 5000, pinMm: "5678" }, APRES); // Envoi sans verrou
    expect(ussd.envoyerCode).toHaveBeenCalledTimes(1); // Envoyé
  }); // Fin du cas
  it("contrôle étape par étape : numéro, PIN Mobile Money, puis budget (solde)", async () => { // Contrôles utilisés par l'écran en étapes
    expect(erreurNumero("0327573815")).toBeNull(); // Valide
    expect(erreurNumero("03 27 57 38 15")).toBeNull(); // Espaces tolérés
    expect(erreurNumero("12")).toMatch(/numéro/); // Trop court
    expect(erreurPinMm("5678")).toBeNull(); // Valide
    expect(erreurPinMm("12")).toMatch(/PIN/); // Trop court
    await expect(controlerSortie(base, id, 5000, APRES)).resolves.toBeUndefined(); // Solde suffisant
    await expect(controlerSortie(base, id, 99999999, APRES)).rejects.toThrow(ErreurValidation); // Solde insuffisant
  }); // Fin du cas
  it("refuse si le PIN Mobile Money saisi est absent ou mal formé", async () => { // PIN Mobile Money
    const ussd = faux(); // Faux téléphone
    await expect(lancerOperation(base, ussd, id, { numero: "0327573815", montant: 5000, pinMm: "12" }, APRES)).rejects.toThrow(ErreurValidation); // PIN Mobile Money mal formé : refusé sous le champ
    expect(ussd.envoyerCode).not.toHaveBeenCalled(); // Rien envoyé
  }); // Fin du cas
  it("envoie le code et met la sortie en attente de son SMS, sans toucher au budget", async () => { // Cas nominal
    const ussd = faux(); // Faux
    const r = await lancerOperation(base, ussd, id, { numero: "0327573815", montant: 5000, pinMm: "5678" }, APRES); // Lance
    expect(ussd.envoyerCode).toHaveBeenCalledWith("#144*8*8*0327573815*5000*5678#"); // Code envoyé avec le PIN Mobile Money saisi (jamais enregistré)
    expect(r).toMatchObject({ texte: "Operation en cours de traitement.", enAttente: true }); // Résultat
    expect(await listerEnAttente(base)).toMatchObject([{ operationNom: "Retrait Mobile Money", montant: 5000, budgetId, statut: "en_attente" }]); // En attente
    const [{ n }] = await base.requeter("SELECT COUNT(*) AS n FROM transactions WHERE debit_credit = -1"); // Dépenses enregistrées
    expect(Number(n)).toBe(0); // Aucune dépense tant que le SMS n'est pas là
  }); // Fin du cas
  it("une opération d'entrée n'attend rien", async () => { // Entrée
    const entree = await creerOperation(base, { nom: "Dépôt", type: "entree", code: "#144*2*{pin}#", budgetId: null }); // Entrée
    const r = await lancerOperation(base, faux(), entree, { pinMm: "5678" }, APRES); // Lance
    expect(r.enAttente).toBe(false); // Rien en attente
    expect(await listerEnAttente(base)).toEqual([]); // Aucune ligne
  }); // Fin du cas
  it("supprimer un modèle est refusé tant qu'un envoi attend son SMS", async () => { // Intégrité
    await lancerOperation(base, faux(), id, { numero: "0327573815", montant: 5000, pinMm: "5678" }, APRES); // Envoi
    await expect(supprimerOperation(base, id)).rejects.toThrow("attend encore"); // Refusé
  }); // Fin du cas
}); // Fin du groupe

describe("rapprochement avec les SMS", () => { // Classement automatique
  const envoyer = async (montant, quand = new Date(APRES.getTime() - 30000)) => { // Envoie une opération 30 s avant les SMS
    const id = await creerOperation(base, modele()); // Modèle
    await lancerOperation(base, faux(), id, { numero: "0327573815", montant, pinMm: "5678" }, quand); // Envoi
  }; // Fin de envoyer

  beforeEach(async () => { await base.executer("INSERT INTO solde_om (datetime, balance) VALUES ('2026-10-05T06:00:00.000Z', 1000000)"); }); // Solde initial avant les SMS

  it("classe seule dans le budget la dépense du SMS correspondant (frais compris dans le total débité)", async () => { // Cas nominal
    await envoyer(12000); // Transfert de 12 000 (+400 de frais)
    await importerSms(base, SMS_EXEMPLES(APRES), APRES); // Import : le rapprochement se fait tout seul
    const [e] = await listerEnAttente(base); // L'envoi
    expect(e.statut).toBe("classee"); // Classé
    expect((await listerNonClassees(base)).map((t) => t.montant).sort((a, b) => a - b)).toEqual([500, 54500, 61900]); // Les autres restent à classer ; le transfert de 12 400 est classé
    const [{ solde }] = await base.requeter("SELECT SUM(debit_credit * montant) AS solde FROM transactions WHERE allocation_id IS NOT NULL"); // Solde du budget
    expect(Number(solde)).toBe(20000 - 12400); // 12 400 débités (montant + frais)
  }); // Fin du cas
  it("est rejouable : un second import ne reclasse rien", async () => { // Idempotence
    await envoyer(12000); // Envoi
    await importerSms(base, SMS_EXEMPLES(APRES), APRES); // Premier import
    await importerSms(base, SMS_EXEMPLES(APRES), APRES); // Second import
    expect(await listerEnAttente(base)).toMatchObject([{ statut: "classee" }]); // Toujours une seule ligne classée
    expect((await listerNonClassees(base)).length).toBe(3); // Inchangé
  }); // Fin du cas
  it("si le classement est refusé (solde insuffisant), la dépense reste à classer et l'échec est expliqué", async () => { // Échec
    await envoyer(20000); // Demande de 20 000 : le budget a 20 000 mais le retrait réel (60 000) dépasse
    await base.executer("UPDATE ussd_en_attente SET montant = 60000"); // L'opération réelle (retrait de 60 000 + 1 900 de frais) dépasse le budget
    await importerSms(base, SMS_EXEMPLES(APRES), APRES); // Import
    const [e] = await listerEnAttente(base); // L'envoi
    expect(e.statut).toBe("echec"); // Échec
    expect(e.raison).toContain("Solde insuffisant"); // Explication
    expect((await listerNonClassees(base)).length).toBe(4); // Toutes les dépenses restent à classer
  }); // Fin du cas
  it("ignore un SMS de même montant reçu avant l'envoi ou plus de 24 h après", async () => { // Fenêtre de temps
    await envoyer(12000, new Date(APRES.getTime() + 60000)); // Envoyé APRÈS les SMS d'exemple
    await importerSms(base, SMS_EXEMPLES(APRES), APRES); // Import
    expect((await listerEnAttente(base))[0].statut).toBe("en_attente"); // Toujours en attente
  }); // Fin du cas
  it("abandonne une attente de plus de 24 h et permet d'annuler à la main", async () => { // Expiration et annulation
    await envoyer(12000, new Date(APRES.getTime() - 30000)); // Envoi
    const bilan = await rapprocherEnAttente(base, new Date(APRES.getTime() + 25 * 3600 * 1000)); // 25 h plus tard
    expect(bilan.expirees).toBe(1); // Abandonnée
    expect((await listerEnAttente(base))[0].statut).toBe("expiree"); // État
    await expect(annulerEnAttente(base, (await listerEnAttente(base))[0].id)).rejects.toThrow(ErreurMetier); // Plus rien à annuler
  }); // Fin du cas
}); // Fin du groupe

describe("icône et couleur d'une opération", () => { // Choix visuels
  it("a une icône et une couleur par défaut, modifiables", async () => { // Par défaut puis choix
    const id = await creerOperation(base, modele()); // Modèle sans choix
    expect((await listerOperations(base))[0]).toMatchObject({ icone: "telephone", couleur: "vert" }); // Valeurs par défaut
    await modifierOperation(base, id, { ...modele(), icone: "cadeau", couleur: "bleu" }); // Modification
    expect((await listerOperations(base))[0]).toMatchObject({ icone: "cadeau", couleur: "bleu" }); // Valeurs choisies
  }); // Fin du cas
  it("refuse une icône ou une couleur inconnue", async () => { // Validation
    await expect(creerOperation(base, modele({ icone: "inconnue" }))).rejects.toThrow(ErreurValidation); // Icône inconnue
    await expect(creerOperation(base, modele({ couleur: "rose" }))).rejects.toThrow(ErreurValidation); // Couleur inconnue
    expect(validerOperation({ nom: "x", type: "entree", code: "#1*{pin}#", icone: "zzz", couleur: "rose" })).toMatchObject({ icone: expect.any(String), couleur: expect.any(String) }); // Deux erreurs
  }); // Fin du cas
}); // Fin du groupe
