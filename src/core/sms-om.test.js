// Tests de l'analyse des SMS Orange Money, sur les vrais SMS reçus.
import { describe, it, expect } from "vitest"; // Outils de test
import { analyserSmsOM } from "./sms-om.js"; // Fonction testée
import { formaterMontant } from "./format.js"; // Pour comparer les notes
import { SMS_EXEMPLES } from "../platform/sms-exemples.js"; // Les SMS réels

const [transfert, epargne, pretSolde, retrait, pretPartiel, promo] = SMS_EXEMPLES(new Date()).map((m) => m.corps); // Les six textes

describe("analyse des SMS Orange Money", () => { // Groupe de tests
  it("lit un transfert avec frais : total débité = montant + frais", () => { // Cas 1
    expect(analyserSmsOM(transfert)).toMatchObject({ trxId: "MP261005.1023.C25734", type: "transfert", montant: 12000, frais: 400, total: 12400, soldeApres: 931616 }); // Valeurs lues
    expect(analyserSmsOM(transfert).note).toBe(`Transfert vers PAMF 5969657 (dont ${formaterMontant(400)} de frais)`); // Libellé avec destinataire et frais
  }); // Fin du cas

  it("lit un virement vers l'épargne : l'identifiant est la référence et il n'y a pas de solde OM", () => { // Cas 2
    expect(analyserSmsOM(epargne)).toMatchObject({ trxId: "CO261001.0800.A06136", type: "epargne", montant: 500, frais: 0, total: 500, soldeApres: null }); // « Nouveau solde epargne » n'est pas le solde OM
  }); // Fin du cas

  it("lit un remboursement de prêt et arrondit le solde à l'entier inférieur", () => { // Cas 3
    expect(analyserSmsOM(pretSolde)).toMatchObject({ trxId: "CO261005.0817.B53793", type: "remboursement", total: 54500, soldeApres: 5916 }); // 5916.47 -> 5916
  }); // Fin du cas

  it("lit un retrait avec frais et l'agent", () => { // Cas 4
    const r = analyserSmsOM(retrait); // Analyse
    expect(r).toMatchObject({ trxId: "CO261005.1019.A72879", type: "retrait", montant: 60000, frais: 1900, total: 61900, soldeApres: 944016 }); // Valeurs lues
    expect(r.note).toContain("0327573815"); // L'agent est dans la note
  }); // Fin du cas

  it("lit un remboursement partiel (le « reste à payer » n'est pas pris pour le solde)", () => { // Cas 5
    expect(analyserSmsOM(pretPartiel)).toMatchObject({ trxId: "CO261005.1641.B33339", type: "remboursement", total: 500, soldeApres: 931116 }); // 931116.47 -> 931116
  }); // Fin du cas

  it("ne comprend pas un SMS qui n'est pas une opération", () => { // Cas 6
    expect(analyserSmsOM(promo)).toBeNull(); // Aucun montant débité ni identifiant
    expect(analyserSmsOM("")).toBeNull(); // Texte vide
    expect(analyserSmsOM(null)).toBeNull(); // Rien du tout
  }); // Fin du cas

  it("arrondit vers le haut une sortie d'argent avec centimes", () => { // Prudence : on ne sous-estime jamais une dépense
    expect(analyserSmsOM("Le retrait de 1000.50 Ar est reussi. Frais : 20.0 Ar. Nouveau solde : 500.99 Ar. Trans Id : CO1.2.X").total).toBe(1021); // 1001 + 20
  }); // Fin du cas
}); // Fin du groupe
