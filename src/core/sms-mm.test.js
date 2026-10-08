// Tests de l'analyse des SMS Mobile Money, sur les vrais SMS reçus.
import { describe, it, expect } from "vitest"; // Outils de test
import { analyserSmsMM } from "./sms-mm.js"; // Fonction testée
import { formaterMontant } from "./format.js"; // Pour comparer les notes
import { SMS_EXEMPLES, SMS_IGNORES } from "../platform/sms-exemples.js"; // Les SMS réels

const [transfert, epargne, pretSolde, retrait, pretPartiel, promo] = SMS_EXEMPLES(new Date()).map((m) => m.corps); // Les six textes

describe("analyse des SMS Mobile Money", () => { // Groupe de tests
  it("lit un transfert avec frais : total débité = montant + frais", () => { // Cas 1
    expect(analyserSmsMM(transfert)).toMatchObject({ trxId: "MP261005.1023.C25734", type: "transfert", montant: 12000, frais: 400, total: 12400, soldeApres: 931616 }); // Valeurs lues
    expect(analyserSmsMM(transfert).note).toBe(`Transfert vers PAMF 5969657 (dont ${formaterMontant(400)} de frais)`); // Libellé avec destinataire et frais
  }); // Fin du cas

  it("ignore un virement vers l'épargne : pas de transaction, et pas de solde Mobile Money (« Nouveau solde epargne » n'est pas le solde Mobile Money)", () => { // Cas 2
    expect(analyserSmsMM(epargne)).toEqual({ ignore: true, trxId: "CO261001.0800.A06136", soldeApres: null }); // Ignoré
  }); // Fin du cas

  it("ignore les mouvements d'épargne, le prêt crédité et le dépôt, en gardant le solde Mobile Money", () => { // SMS demandés à ignorer
    const [depuisEpargne, versEpargne, virement, pret, depot] = SMS_IGNORES(new Date()).map((m) => m.corps); // Les cinq textes
    expect(analyserSmsMM(depuisEpargne)).toEqual({ ignore: true, trxId: "CI261006.1157.D91424", soldeApres: 201073 }); // Épargne -> Mobile Money : solde Mobile Money, pas le solde épargne
    expect(analyserSmsMM(versEpargne)).toEqual({ ignore: true, trxId: "CO261006.1211.C12301", soldeApres: 200573 }); // Mobile Money -> épargne
    expect(analyserSmsMM(virement)).toMatchObject({ ignore: true, soldeApres: null }); // Virement programmé
    expect(analyserSmsMM(pret)).toMatchObject({ ignore: true, soldeApres: 1005916 }); // Prêt crédité : « est de », sans « Trans Id »
    expect(analyserSmsMM(depot)).toEqual({ ignore: true, trxId: "CI261005.0752.C42831", soldeApres: 60416 }); // Dépôt : « Nouveau solde: »
  }); // Fin du cas

  it("lit un remboursement de prêt et arrondit le solde à l'entier inférieur", () => { // Cas 3
    expect(analyserSmsMM(pretSolde)).toMatchObject({ trxId: "CO261005.0817.B53793", type: "remboursement", total: 54500, soldeApres: 5916 }); // 5916.47 -> 5916
  }); // Fin du cas

  it("lit un retrait avec frais et l'agent", () => { // Cas 4
    const r = analyserSmsMM(retrait); // Analyse
    expect(r).toMatchObject({ trxId: "CO261005.1019.A72879", type: "retrait", montant: 60000, frais: 1900, total: 61900, soldeApres: 944016 }); // Valeurs lues
    expect(r.note).toContain("0327573815"); // L'agent est dans la note
  }); // Fin du cas

  it("lit un remboursement partiel (le « reste à payer » n'est pas pris pour le solde)", () => { // Cas 5
    expect(analyserSmsMM(pretPartiel)).toMatchObject({ trxId: "CO261005.1641.B33339", type: "remboursement", total: 500, soldeApres: 931116 }); // 931116.47 -> 931116
  }); // Fin du cas

  it("ne comprend pas un SMS qui n'est pas une opération", () => { // Cas 6
    expect(analyserSmsMM(promo)).toBeNull(); // Aucun montant débité ni identifiant
    expect(analyserSmsMM("")).toBeNull(); // Texte vide
    expect(analyserSmsMM(null)).toBeNull(); // Rien du tout
  }); // Fin du cas

  it("arrondit vers le haut une sortie d'argent avec centimes", () => { // Prudence : on ne sous-estime jamais une dépense
    expect(analyserSmsMM("Le retrait de 1000.50 Ar est reussi. Frais : 20.0 Ar. Nouveau solde : 500.99 Ar. Trans Id : CO1.2.X").total).toBe(1021); // 1001 + 20
  }); // Fin du cas
}); // Fin du groupe
