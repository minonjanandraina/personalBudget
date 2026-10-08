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

describe("types de valeurs (sprint 17)", () => { // Références, textes, dates, ponctuation
  const TYPES = { variables: ["solde", "frais", "ref_trx", "numero_destination", "date_trx"], types: { ref_trx: "ref", numero_destination: "texte", date_trx: "date" } }; // Types de test
  it("lit une référence avec des points, sans le point final de la phrase", () => { // ref
    const re = compilerGabarit("Trans Id : {ref_trx}", TYPES); // Gabarit
    expect(lireAvecGabarit("Trans Id: MP261005.1023.C25734.", re)).toEqual({ ref_trx: "MP261005.1023.C25734" }); // Lue
  }); // Fin du cas
  it("lit un texte (numéro, nom) entre deux textes fixes ou en fin de ligne", () => { // texte
    const milieu = compilerGabarit("vers {numero_destination} est reussi", TYPES); // Entre deux textes
    expect(lireAvecGabarit("vers PAMF 5969657 est reussi", milieu)).toEqual({ numero_destination: "PAMF 5969657" }); // Lu
    const fin = compilerGabarit("aupres du {numero_destination}", TYPES); // En fin de ligne
    expect(lireAvecGabarit("aupres du 0327573815. Frais", fin)).toEqual({ numero_destination: "0327573815" }); // Lu, sans la ponctuation
  }); // Fin du cas
  it("lit une date", () => { // date
    const re = compilerGabarit("le {date_trx}", TYPES); // Gabarit
    expect(lireAvecGabarit("le 05/10/2026 14:30:15 merci", re)).toEqual({ date_trx: "05/10/2026 14:30:15" }); // Lue
    expect(lireAvecGabarit("le 2026-10-05", re)).toEqual({ date_trx: "2026-10-05" }); // Autre format
  }); // Fin du cas
  it("accepte « solde: » comme « solde : » (ponctuation collée ou non)", () => { // Ponctuation
    const re = compilerGabarit("Nouveau solde : {solde} Ar", TYPES); // Gabarit
    for (const sms of ["Nouveau solde: 60416 Ar", "Nouveau solde : 60416 Ar", "Nouveau solde :60416Ar"]) expect(lireAvecGabarit(sms, re)).toEqual({ solde: 60416 }); // Toutes reconnues
    expect(lireAvecGabarit("Nouveau solde epargne : 509 Ar", re)).toBeNull(); // Un mot en plus : non reconnu
  }); // Fin du cas
  it("arrondit vers le haut les noms demandés quand il y a des centimes", () => { // haut
    const re = compilerGabarit("frais {frais} Ar, solde {solde} Ar", TYPES); // Gabarit
    expect(lireAvecGabarit("frais 20.50 Ar, solde 99.99 Ar", re, { haut: ["frais"] })).toEqual({ frais: 21, solde: 99 }); // Frais vers le haut, solde vers le bas
    expect(lireAvecGabarit("frais 20.00 Ar, solde 1 Ar", re, { haut: ["frais"] })).toEqual({ frais: 20, solde: 1 }); // Centimes nuls : pas d'arrondi
  }); // Fin du cas
}); // Fin du groupe
