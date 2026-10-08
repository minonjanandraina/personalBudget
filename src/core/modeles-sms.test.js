import { describe, it, expect, beforeEach } from "vitest"; // Outils de test
import { creerBaseDeTest } from "./db/aide-tests.js"; // Base neuve
import { ErreurValidation } from "./erreurs.js"; // Erreur attendue
import { MODELES_PAR_DEFAUT } from "./modeles-sms-defaut.js"; // Modèles livrés
import { listerModeles, listerModelesActifs, lireModele, creerModele, modifierModele, activerModele, supprimerModele, deplacerModele, retablirModelesParDefaut } from "./modeles-sms.js"; // Fonctions testées
import { analyserSmsMM, validerModeleSms, analyserDate } from "./sms-mm.js"; // Reconnaissance
import { ajouterSoldeMMDeTest } from "./db/aide-tests.js"; // Solde initial de test
import { importerSms } from "./import-sms.js"; // Import
import { creerSauvegarde, restaurerSauvegarde, creerTexteSauvegarde } from "./sauvegarde.js"; // Sauvegarde

let base; // Base de chaque cas
beforeEach(async () => { base = await creerBaseDeTest(); }); // Base neuve avant chaque cas

// Modèle d'un autre opérateur, avec un ordre de lignes et des mots différents.
const MVOLA = { nom: "Envoi Mvola", sens: "debit", gabarit: "Vous avez envoye {montant_debit} Ar a {numero_destination}.\nFrais {frais} Ar\nSolde : {solde} Ar\nRef {ref_trx}\nle {date_trx}", note: "Envoi à {numero_destination}" }; // Un autre format
const ARGENT_RECU = { nom: "Argent reçu", sens: "credit", gabarit: "Vous avez recu {montant_credit} Ar de {numero_source}\nTrx : {ref_trx}\nNouveau solde: {solde} Ar", note: null }; // Crédit

describe("modèles livrés (migration 7)", () => { // Installation
  it("sont installés dans l'ordre, tous actifs", async () => { // Base neuve
    const modeles = await listerModeles(base); // Lecture
    expect(modeles.map((m) => m.nom)).toEqual(MODELES_PAR_DEFAUT.map((m) => m.nom)); // Mêmes modèles, même ordre
    expect(modeles.every((m) => m.actif)).toBe(true); // Tous actifs
    expect(modeles.map((m) => m.sens).slice(0, 3)).toEqual(["ignorer", "ignorer", "ignorer"]); // Les « ignorer » d'abord
    expect(modeles[3].gabarit).toContain("\n"); // Les retours à la ligne sont conservés
  }); // Fin du cas
}); // Fin du groupe

describe("gestion des modèles", () => { // Création, modification, ordre
  it("crée un modèle en dernier, le relit, le modifie et le supprime", async () => { // Cycle
    const id = await creerModele(base, MVOLA); // Création
    const m = await lireModele(base, id); // Relecture
    expect(m).toMatchObject({ nom: "Envoi Mvola", sens: "debit", actif: true, position: MODELES_PAR_DEFAUT.length + 1 }); // Placé en dernier
    await modifierModele(base, id, { ...MVOLA, nom: "Envoi M-vola" }); // Modification
    expect((await lireModele(base, id)).nom).toBe("Envoi M-vola"); // Relu
    await supprimerModele(base, id); // Suppression
    expect(await lireModele(base, id)).toBeNull(); // Disparu
  }); // Fin du cas
  it("refuse un nom déjà pris (sans tenir compte des majuscules) et un modèle invalide", async () => { // Validation
    await creerModele(base, MVOLA); // Premier
    await expect(creerModele(base, { ...MVOLA, nom: "envoi MVOLA" })).rejects.toThrow(ErreurValidation); // Doublon
    await expect(creerModele(base, { ...MVOLA, nom: "" })).rejects.toThrow(ErreurValidation); // Nom vide
    await expect(creerModele(base, { ...MVOLA, nom: "Autre", sens: "x" })).rejects.toThrow(ErreurValidation); // Sens inconnu
    await expect(creerModele(base, { ...MVOLA, nom: "Autre", gabarit: "montant {montant_debit}" })).rejects.toThrow(ErreurValidation); // Sans {ref_trx}
    await expect(creerModele(base, { ...MVOLA, nom: "Autre", gabarit: "x {montant_debit} {inconnue} {ref_trx}" })).rejects.toThrow(ErreurValidation); // Variable inconnue
  }); // Fin du cas
  it("désactive un modèle et le sort de la liste des modèles actifs", async () => { // Activation
    const [premier] = await listerModeles(base); // Premier modèle
    await activerModele(base, premier.id, false); // Désactive
    expect((await listerModelesActifs(base)).some((m) => m.id === premier.id)).toBe(false); // Absent des actifs
    expect((await listerModeles(base)).some((m) => m.id === premier.id)).toBe(true); // Toujours dans la liste
  }); // Fin du cas
  it("monte et descend un modèle, sans effet aux extrémités", async () => { // Ordre
    const avant = (await listerModeles(base)).map((m) => m.id); // Ordre de départ
    await deplacerModele(base, avant[2], -1); // Monte le 3e
    expect((await listerModeles(base)).map((m) => m.id).slice(0, 3)).toEqual([avant[0], avant[2], avant[1]]); // Échange avec le 2e
    await deplacerModele(base, avant[0], -1); // Déjà en haut
    await deplacerModele(base, avant[avant.length - 1], 1); // Déjà en bas
    expect((await listerModeles(base)).map((m) => m.id).slice(0, 3)).toEqual([avant[0], avant[2], avant[1]]); // Inchangé
  }); // Fin du cas
  it("rétablit les modèles livrés", async () => { // Retour au départ
    await creerModele(base, MVOLA); // Ajout
    await retablirModelesParDefaut(base); // Retour aux modèles livrés
    expect((await listerModeles(base)).map((m) => m.nom)).toEqual(MODELES_PAR_DEFAUT.map((m) => m.nom)); // Mêmes modèles
  }); // Fin du cas
}); // Fin du groupe

describe("reconnaissance avec les variables", () => { // Chaque variable
  it("lit toutes les variables d'un autre opérateur, dans un autre ordre", () => { // Mvola
    const sms = "Vous avez envoye 25 000 Ar a 034 12 345 67. Frais 500 Ar. Solde : 120 500.75 Ar. Ref MV2610.55 le 05/10/2026 14:30"; // SMS d'un autre opérateur
    const r = analyserSmsMM(sms, [MVOLA]); // Analyse avec ce seul modèle
    expect(r).toMatchObject({ trxId: "MV2610.55", montant: 25000, frais: 500, total: 25500, soldeApres: 120500, modele: "Envoi Mvola" }); // Valeurs lues (solde arrondi à l'inférieur)
    expect(r.note).toContain("Envoi à 034 12 345 67"); // {numero_destination} dans la note
    expect(r.dateTrx).toBe("2026-10-05T11:30:00.000Z"); // 14:30 à Madagascar = 11:30 UTC
  }); // Fin du cas
  it("lit l'argent reçu ({montant_credit}, {numero_source}) sans créer de dépense", () => { // Crédit
    const r = analyserSmsMM("Vous avez recu 50000 Ar de 0321234567\nTrx : CR1.2\nNouveau solde: 70000 Ar", [ARGENT_RECU]); // SMS de crédit
    expect(r).toEqual({ credit: true, trxId: "CR1.2", modele: "Argent reçu", montant: 50000, soldeApres: 70000, dateTrx: null }); // Crédit lu
  }); // Fin du cas
  it("ignore les accents, les majuscules et les espaces en trop", () => { // Souplesse
    const r = analyserSmsMM("VOUS AVEZ  ENVOYÉ 1000 AR À 0341111111 . REF   A1", [{ ...MVOLA, gabarit: "Vous avez envoye {montant_debit} Ar a {numero_destination}.\nRef {ref_trx}" }]); // Texte déformé
    expect(r).toMatchObject({ montant: 1000, trxId: "A1" }); // Reconnu quand même
  }); // Fin du cas
  it("les lignes facultatives absentes ne bloquent pas ; la ligne obligatoire absente bloque", () => { // Lignes obligatoires
    expect(analyserSmsMM("Vous avez envoye 1000 Ar a 0341111111. Ref A1", [MVOLA])).toMatchObject({ frais: 0, total: 1000, soldeApres: null }); // Sans frais ni solde
    expect(analyserSmsMM("Vous avez envoye 1000 Ar a 0341111111. Frais 5 Ar", [MVOLA])).toBeNull(); // Sans référence : non compris
  }); // Fin du cas
  it("essaie les modèles dans l'ordre et saute les modèles désactivés", () => { // Priorité
    const a = { nom: "A", sens: "debit", gabarit: "envoi de {montant_debit} Ar\nref {ref_trx}", note: null }; // Premier modèle
    const b = { nom: "B", sens: "debit", gabarit: "envoi de {montant_debit} Ar\nref {ref_trx}", note: null }; // Même gabarit
    expect(analyserSmsMM("envoi de 10 Ar ref X1", [a, b]).modele).toBe("A"); // Le premier gagne
    expect(analyserSmsMM("envoi de 10 Ar ref X1", [{ ...a, actif: false }, b]).modele).toBe("B"); // Le premier est désactivé
  }); // Fin du cas
  it("ne comprend plus un SMS quand son modèle est supprimé", () => { // Sans modèle
    expect(analyserSmsMM("Vous avez envoye 1000 Ar a 0341111111. Ref A1", [])).toBeNull(); // Aucun modèle
  }); // Fin du cas
  it("convertit les dates de SMS et refuse les dates impossibles", () => { // Dates
    expect(analyserDate("2026-10-05 08:00:00")).toBe("2026-10-05T05:00:00.000Z"); // aaaa-mm-jj
    expect(analyserDate("5/10/26")).toBe("2026-10-04T21:00:00.000Z"); // Date seule, année sur 2 chiffres : minuit local
    for (const mauvaise of ["31/02/2026", "05/13/2026", "n'importe quoi", "", null, "05/10/2026 25:00"]) expect(analyserDate(mauvaise)).toBeNull(); // Invalides
  }); // Fin du cas
}); // Fin du groupe

describe("validation d'un modèle", () => { // Contrôles de forme
  it("exige une ligne de texte repère pour « à ignorer » et les bonnes variables pour chaque sens", () => { // Sens
    expect(() => validerModeleSms({ nom: "x", sens: "ignorer", gabarit: "Solde : {solde} Ar" })).toThrow(ErreurValidation); // Reconnaîtrait tout
    expect(validerModeleSms({ nom: "x", sens: "ignorer", gabarit: "epargne\nSolde : {solde} Ar" }).gabarit).toBe("epargne\nSolde : {solde} Ar"); // Valide
    expect(() => validerModeleSms({ nom: "x", sens: "credit", gabarit: "recu {montant_debit} Ar ref {ref_trx}" })).toThrow(ErreurValidation); // Mauvaise variable
    expect(() => validerModeleSms({ nom: "x", sens: "debit", gabarit: "a {montant_debit} Ar\nref {ref_trx}", note: "vers {inconnu}" })).toThrow(ErreurValidation); // Variable de note inconnue
    expect(() => validerModeleSms({ nom: "x", sens: "ignorer", gabarit: "epargne", note: "note inutile" })).toThrow(ErreurValidation); // Note réservée aux dépenses
  }); // Fin du cas
  it("signale la ligne fautive", () => { // Message
    try { validerModeleSms({ nom: "x", sens: "debit", gabarit: "a {montant_debit} Ar\nref {ref_trx} {ref_trx}" }); } catch (e) { expect(e.erreurs.gabarit).toMatch(/^Ligne 2/); } // Numéro de ligne
  }); // Fin du cas
}); // Fin du groupe

describe("import avec les modèles", () => { // Intégration
  const DEPART = "2026-10-01T00:00:00.000Z"; // Date du solde initial
  beforeEach(async () => { await ajouterSoldeMMDeTest(base, 1000000, DEPART); }); // Solde initial
  it("importe avec un modèle ajouté, utilise la date du SMS, et reste idempotent", async () => { // Cas nominal
    await creerModele(base, MVOLA); // Modèle de l'opérateur
    const recu = new Date("2026-10-05T11:31:00.000Z"); // Réception du SMS
    const messages = [{ corps: "Vous avez envoye 25000 Ar a 0341111111. Frais 500 Ar. Solde : 974500 Ar. Ref MV1.1 le 05/10/2026 14:30", date: recu.toISOString() }]; // SMS
    expect(await importerSms(base, messages)).toMatchObject({ importes: 1, illisibles: 0 }); // Importé
    const [t] = await base.requeter("SELECT montant, date_operation, note FROM transactions WHERE trx_id = 'MV1.1'"); // Transaction créée
    expect(Number(t.montant)).toBe(25500); // Montant + frais
    expect(t.date_operation).toBe("2026-10-05T11:30:00.000Z"); // Date écrite dans le SMS
    expect(await importerSms(base, messages)).toMatchObject({ importes: 0, doublons: 1 }); // Rejoué : aucun doublon
    expect(Number((await base.requeter("SELECT COUNT(*) AS n FROM solde_om WHERE balance = 974500"))[0].n)).toBe(1); // Un seul solde
  }); // Fin du cas
  it("garde la date de réception si la date du SMS est invraisemblable", async () => { // Garde-fou
    await creerModele(base, MVOLA); // Modèle
    const messages = [{ corps: "Vous avez envoye 100 Ar a 0341111111. Ref MV2.2 le 05/10/2030 10:00", date: "2026-10-05T11:31:00.000Z" }]; // Date dans le futur
    await importerSms(base, messages); // Import
    const [t] = await base.requeter("SELECT date_operation FROM transactions WHERE trx_id = 'MV2.2'"); // Transaction
    expect(t.date_operation).toBe("2026-10-05T11:31:00.000Z"); // Réception gardée
  }); // Fin du cas
  it("traite l'argent reçu : aucun mouvement de budget, solde gardé, compté à part, rejouable", async () => { // Crédit
    await creerModele(base, ARGENT_RECU); // Modèle de crédit
    const messages = [{ corps: "Vous avez recu 50000 Ar de 0321234567\nTrx : CR1.2\nNouveau solde: 1050000 Ar", date: "2026-10-05T08:00:00.000Z" }]; // SMS
    expect(await importerSms(base, messages)).toMatchObject({ importes: 0, credits: 1, illisibles: 0 }); // Compté comme argent reçu
    expect(Number((await base.requeter("SELECT COUNT(*) AS n FROM transactions"))[0].n)).toBe(0); // Aucune transaction
    expect(Number((await base.requeter("SELECT COUNT(*) AS n FROM solde_om WHERE balance = 1050000"))[0].n)).toBe(1); // Solde gardé
    await importerSms(base, messages); // Rejoue
    expect(Number((await base.requeter("SELECT COUNT(*) AS n FROM solde_om WHERE balance = 1050000"))[0].n)).toBe(1); // Toujours un seul
  }); // Fin du cas
  it("liste « non compris » un SMS sans modèle, puis le comprend quand le modèle existe", async () => { // Évolution
    const messages = [{ corps: "Vous avez envoye 100 Ar a 0341111111. Ref MV3.3", date: "2026-10-05T08:00:00.000Z" }]; // SMS inconnu
    expect(await importerSms(base, messages)).toMatchObject({ importes: 0, illisibles: 1 }); // Non compris
    await creerModele(base, MVOLA); // Ajout du modèle
    expect(await importerSms(base, messages)).toMatchObject({ importes: 1 }); // Compris après coup
  }); // Fin du cas
  it("n'utilise pas un modèle désactivé", async () => { // Désactivation
    const id = await creerModele(base, MVOLA); // Modèle
    await activerModele(base, id, false); // Désactivé
    const messages = [{ corps: "Vous avez envoye 100 Ar a 0341111111. Ref MV4.4", date: "2026-10-05T08:00:00.000Z" }]; // SMS
    expect(await importerSms(base, messages)).toMatchObject({ importes: 0, illisibles: 1 }); // Non compris
  }); // Fin du cas
}); // Fin du groupe

describe("sauvegarde des modèles", () => { // Sauvegarde / restauration
  it("inclut les modèles et les restaure tels quels", async () => { // Aller-retour
    await creerModele(base, MVOLA); // Modèle ajouté
    await activerModele(base, (await listerModeles(base))[0].id, false); // Un modèle désactivé
    const attendu = await listerModeles(base); // État à sauvegarder
    const texte = await creerTexteSauvegarde(base); // Sauvegarde
    expect(Object.keys((await creerSauvegarde(base)).tables)).toContain("modele_sms"); // Table présente
    await retablirModelesParDefaut(base); // Change l'état
    await restaurerSauvegarde(base, texte); // Restaure
    expect(await listerModeles(base)).toEqual(attendu); // Mêmes modèles, même ordre, mêmes états
  }); // Fin du cas
}); // Fin du groupe
