import { describe, it, expect } from "vitest"; // Outils de test
import { analyserMontant } from "./format.js"; // Lecture d'un montant saisi
import { datetimeLocalVersIso, isoVersDatetimeLocal, afficherDateHeure } from "./dates.js"; // Conversions de dates
import { ErreurValidation, ErreurMetier } from "./erreurs.js"; // Erreurs

describe("analyserMontant", () => { // Lecture des montants tapés par l'utilisateur
  it("accepte un entier simple", () => { // Cas simple
    expect(analyserMontant("100000")).toEqual({ valeur: 100000 }); // Nombre lu
  }); // Fin du cas

  it("accepte les espaces entre les milliers (y compris insécables)", () => { // Séparateurs de milliers
    expect(analyserMontant("100 000")).toEqual({ valeur: 100000 }); // Espace normale
    expect(analyserMontant("1 234 567")).toEqual({ valeur: 1234567 }); // Espaces insécables
    expect(analyserMontant("  42  ")).toEqual({ valeur: 42 }); // Espaces autour
  }); // Fin du cas

  it("accepte zéro", () => { // Cas limite
    expect(analyserMontant("0")).toEqual({ valeur: 0 }); // Zéro valide
    expect(analyserMontant("007")).toEqual({ valeur: 7 }); // Zéros devant ignorés
  }); // Fin du cas

  it("refuse un champ vide", () => { // Champ vide
    expect(analyserMontant("").erreur).toMatch(/Saisissez/); // Message d'erreur
    expect(analyserMontant("   ").erreur).toMatch(/Saisissez/); // Espaces seulement
    expect(analyserMontant(null).erreur).toMatch(/Saisissez/); // Valeur absente
  }); // Fin du cas

  it("refuse virgule, point, signe et lettres", () => { // Règle « jamais de float »
    for (const texte of ["12,5", "12.5", "-5", "+5", "12a", "1e3", "abc"]) { // Saisies invalides
      expect(analyserMontant(texte).erreur, texte).toMatch(/entier/); // Chacune est refusée avec un message
    } // Fin de la boucle
  }); // Fin du cas

  it("refuse un nombre trop grand pour être exact", () => { // Limite des entiers JavaScript
    expect(analyserMontant("9".repeat(20)).erreur).toMatch(/trop grand/); // Message dédié
  }); // Fin du cas
}); // Fin du groupe

describe("dates", () => { // Conversions de dates
  it("convertit un aller-retour sans perte (heure locale <-> ISO)", () => { // Aller-retour
    const iso = datetimeLocalVersIso("2026-10-05T10:30"); // Saisie -> ISO
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); // Format ISO UTC
    expect(isoVersDatetimeLocal(iso)).toBe("2026-10-05T10:30"); // ISO -> saisie identique
  }); // Fin du cas

  it("refuse un format ou une date invalide", () => { // Entrées incorrectes
    expect(datetimeLocalVersIso("")).toBeNull(); // Vide
    expect(datetimeLocalVersIso("05/10/2026 10:30")).toBeNull(); // Mauvais format
    expect(datetimeLocalVersIso("2026-13-45T10:30")).toBeNull(); // Mois et jour impossibles
  }); // Fin du cas

  it("affiche une date lisible", () => { // Affichage
    const texte = afficherDateHeure(datetimeLocalVersIso("2026-10-05T10:30")); // Formate
    expect(texte).toMatch(/05\/10\/2026/); // Jour/mois/année à la française
  }); // Fin du cas
}); // Fin du groupe

describe("erreurs", () => { // Classes d'erreurs
  it("ErreurValidation garde le détail par champ et un message global", () => { // Détail
    const e = new ErreurValidation({ nom: "Obligatoire", montant: "Trop grand" }); // Crée l'erreur
    expect(e.erreurs).toEqual({ nom: "Obligatoire", montant: "Trop grand" }); // Détail conservé
    expect(e.message).toBe("Obligatoire Trop grand"); // Message regroupé
    expect(e).toBeInstanceOf(Error); // C'est bien une erreur
  }); // Fin du cas

  it("ErreurMetier porte un message simple", () => { // Message
    const e = new ErreurMetier("Impossible"); // Crée l'erreur
    expect(e.message).toBe("Impossible"); // Message conservé
    expect(e.name).toBe("ErreurMetier"); // Nom reconnaissable
  }); // Fin du cas
}); // Fin du groupe
