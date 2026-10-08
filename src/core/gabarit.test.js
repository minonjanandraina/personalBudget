import { describe, it, expect } from "vitest"; // Outils de test
import { compilerGabarit, lireAvecGabarit } from "./gabarit.js"; // Fonctions testées
import { ErreurValidation } from "./erreurs.js"; // Erreur attendue

const REGLES = { variables: ["solde", "frais"], obligatoires: ["solde"] }; // Règles de test

describe("compilerGabarit", () => { // Conversion d'un gabarit
  it("lit une valeur au milieu d'une phrase, sans tenir compte de la casse", () => { // Cas nominal
    const re = compilerGabarit("solde de votre compte est de {solde} AR", REGLES); // Gabarit
    expect(lireAvecGabarit("Le SOLDE de votre compte est de 202316 ar. Merci", re)).toEqual({ solde: 202316 }); // Lu
  }); // Fin du cas
  it("accepte les espaces entre milliers et ignore les centimes (arrondi à l'inférieur)", () => { // Formats de nombre
    const re = compilerGabarit("solde : {solde} Ar", REGLES); // Gabarit
    expect(lireAvecGabarit("Votre solde : 1 202 316 Ar", re)).toEqual({ solde: 1202316 }); // Espaces
    expect(lireAvecGabarit("Votre solde : 5916.47 Ar", re)).toEqual({ solde: 5916 }); // Point
    expect(lireAvecGabarit("Votre solde : 5916,47 Ar", re)).toEqual({ solde: 5916 }); // Virgule
  }); // Fin du cas
  it("tolère des espaces en plus ou en moins autour de la valeur", () => { // Souplesse
    const re = compilerGabarit("solde {solde} Ar", REGLES); // Gabarit
    expect(lireAvecGabarit("solde   5000Ar", re)).toEqual({ solde: 5000 }); // Collé
    expect(lireAvecGabarit("solde\n5000 Ar", re)).toEqual({ solde: 5000 }); // Retour à la ligne
  }); // Fin du cas
  it("lit plusieurs variables", () => { // Deux valeurs
    const re = compilerGabarit("frais {frais} Ar, solde {solde} Ar", REGLES); // Gabarit
    expect(lireAvecGabarit("Frais 400 Ar, solde 931616 Ar", re)).toEqual({ frais: 400, solde: 931616 }); // Lues
  }); // Fin du cas
  it("traite les signes spéciaux du texte comme du texte (pas comme une expression régulière)", () => { // Échappement
    const re = compilerGabarit("(solde)+ [{solde}] Ar?", REGLES); // Gabarit avec signes spéciaux
    expect(lireAvecGabarit("(solde)+ [700] Ar?", re)).toEqual({ solde: 700 }); // Reconnu tel quel
    expect(lireAvecGabarit("solde 700 Ar", re)).toBeNull(); // Pas reconnu
  }); // Fin du cas
  it("renvoie null si le texte ne correspond pas", () => { // Pas de correspondance
    const re = compilerGabarit("solde de votre compte est de {solde} AR", REGLES); // Gabarit
    expect(lireAvecGabarit("Code PIN incorrect.", re)).toBeNull(); // Autre réponse
    expect(lireAvecGabarit("", re)).toBeNull(); // Vide
    expect(lireAvecGabarit(undefined, re)).toBeNull(); // Absent
  }); // Fin du cas
  it("refuse un nombre démesuré", () => { // Entier non sûr
    const re = compilerGabarit("solde {solde} Ar", REGLES); // Gabarit
    expect(lireAvecGabarit("solde 99999999999999999999 Ar", re)).toBeNull(); // Refusé
  }); // Fin du cas
  it("refuse les gabarits invalides, avec le message sous le bon champ", () => { // Validation
    for (const mauvais of ["", "   ", "solde Ar", "{solde}", "solde {inconnu} Ar", "solde {solde} et {solde} Ar", "a".repeat(201) + "{solde}"]) { // Mauvais gabarits
      expect(() => compilerGabarit(mauvais, REGLES)).toThrow(ErreurValidation); // Refusé
    } // Fin de la boucle
    expect(() => compilerGabarit("texte sans variable", REGLES)).toThrow(/doit contenir \{solde\}/); // Variable obligatoire absente
    try { compilerGabarit("", { ...REGLES, champErreur: "texte" }); } catch (e) { expect(Object.keys(e.erreurs)).toEqual(["texte"]); } // Nom du champ
  }); // Fin du cas
}); // Fin du groupe
