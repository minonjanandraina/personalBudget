// @vitest-environment jsdom
// Tests d'intégration des écrans « Modèles de SMS » (vraie logique, vraie base).
import { describe, it, expect, beforeEach, vi } from "vitest"; // Outils de test
import { creerBaseDeTest } from "../../core/db/aide-tests.js"; // Base neuve
import { listerModeles } from "../../core/modeles-sms.js"; // Modèles
import { MODELES_PAR_DEFAUT } from "../../core/modeles-sms-defaut.js"; // Modèles livrés
import { afficherModelesSms, afficherFormulaireModeleSms, decrireResultat } from "./modeles-sms.js"; // Écrans à tester

let base; // Base de chaque cas
let zone; // Zone d'écran

beforeEach(async () => { // Avant chaque cas
  base = await creerBaseDeTest(); // Base neuve
  document.body.replaceChildren(); // Page vide
  zone = document.createElement("main"); // Zone d'écran
  document.body.append(zone); // La place dans la page
  window.scrollTo = vi.fn(); // jsdom ne sait pas faire défiler la page
  window.location.hash = ""; // Adresse vide
}); // Fin de la préparation

const cliquer = (texte) => [...zone.querySelectorAll("button, a")].find((b) => b.textContent.includes(texte)).click(); // Clique sur un bouton par son texte
const attendre = () => new Promise((r) => setTimeout(r, 30)); // Laisse les actions asynchrones se terminer

describe("liste des modèles", () => { // Écran principal
  it("affiche les modèles livrés dans l'ordre", async () => { // Liste
    await afficherModelesSms(zone, { base }); // Affiche
    for (const [i, m] of MODELES_PAR_DEFAUT.entries()) expect(zone.textContent).toContain(`${i + 1}. ${m.nom}`); // Chaque modèle numéroté
  }); // Fin du cas
  it("essaie un SMS collé avec les modèles actifs, sans rien enregistrer", async () => { // Essai
    await afficherModelesSms(zone, { base }); // Affiche
    zone.querySelector("#essai-sms").value = "Le retrait de 60000 Ar sur votre compte aupres du 0327573815 est reussi. Frais : 1900 Ar. Nouveau solde : 944016 Ar. Trans Id : CO261005.1019.A72879 ."; // SMS réel
    cliquer("Essayer"); // Essai
    await attendre(); // Attend
    expect(zone.textContent).toContain("Modèle « Retrait »"); // Modèle reconnu
    expect(zone.textContent).toContain("CO261005.1019.A72879"); // Référence lue
  }); // Fin du cas
  it("désactive un modèle", async () => { // Activation
    await afficherModelesSms(zone, { base }); // Affiche
    cliquer("Désactiver"); // Désactive le premier modèle
    await attendre(); // Attend
    expect((await listerModeles(base))[0].actif).toBe(false); // Enregistré
    expect(zone.textContent).toContain("(désactivé)"); // Affiché
  }); // Fin du cas
}); // Fin du groupe

describe("formulaire d'un modèle", () => { // Création
  it("crée un modèle valide", async () => { // Cas nominal
    await afficherFormulaireModeleSms(zone, { base }); // Formulaire vide
    zone.querySelector("#modele-nom").value = "Argent reçu"; // Nom
    zone.querySelector("#modele-sens").value = "credit"; // Sens
    zone.querySelector("#modele-gabarit").value = "recu {montant_credit} Ar\nTrx : {ref_trx}"; // Gabarit
    cliquer("Enregistrer"); // Enregistre
    await attendre(); // Attend
    expect((await listerModeles(base)).map((m) => m.nom)).toContain("Argent reçu"); // Créé
  }); // Fin du cas
  it("montre l'erreur sous le champ gabarit et ne crée rien", async () => { // Validation
    await afficherFormulaireModeleSms(zone, { base }); // Formulaire vide
    zone.querySelector("#modele-nom").value = "Mauvais"; // Nom
    zone.querySelector("#modele-gabarit").value = "montant {montant_debit}"; // Sans référence
    cliquer("Enregistrer"); // Enregistre
    await attendre(); // Attend
    expect(zone.querySelector("#modele-gabarit-message").textContent).toContain("{ref_trx}"); // Message sous le champ
    expect(await listerModeles(base)).toHaveLength(MODELES_PAR_DEFAUT.length); // Rien créé
  }); // Fin du cas
  it("essaie le modèle en cours de saisie sur un SMS sans l'enregistrer", async () => { // Essai du formulaire
    await afficherFormulaireModeleSms(zone, { base }); // Formulaire vide
    zone.querySelector("#modele-nom").value = "Test"; // Nom
    zone.querySelector("#modele-gabarit").value = "envoi de {montant_debit} Ar\nref {ref_trx}"; // Gabarit
    zone.querySelector("#essai-sms").value = "Envoi de 1500 Ar. Ref Z9"; // SMS
    cliquer("Essayer"); // Essai
    await attendre(); // Attend
    expect(zone.textContent).toContain("dépense"); // Reconnu
    expect(await listerModeles(base)).toHaveLength(MODELES_PAR_DEFAUT.length); // Rien enregistré
  }); // Fin du cas
  it("explique ce qui est lu", () => { // Phrases
    expect(decrireResultat(null)).toContain("non compris"); // Pas reconnu
    expect(decrireResultat({ ignore: true, trxId: null, soldeApres: 5 })).toContain("à ignorer"); // Ignoré
  }); // Fin du cas
}); // Fin du groupe
