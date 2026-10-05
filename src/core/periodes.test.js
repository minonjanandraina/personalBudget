import { describe, it, expect } from "vitest"; // Outils de test
import { periodePour, formaterJour, jourLocal, afficherJour } from "./periodes.js"; // Fonctions à tester

// Date construite à l'heure LOCALE : les tests ne dépendent pas du fuseau de la machine.
const local = (a, m, j, h = 12) => new Date(a, m - 1, j, h); // Fabrique une date locale

describe("periodePour (du jour J au jour J-1 du mois suivant)", () => { // Calcul des périodes
  it("après le jour J : la période commence ce mois-ci", () => { // Cas courant
    expect(periodePour(20, local(2026, 10, 25))).toEqual({ dateFrom: "2026-10-20", dateTo: "2026-11-19" }); // 25 octobre
  }); // Fin du cas

  it("le jour J lui-même est le premier jour de la période", () => { // Cas limite début
    expect(periodePour(20, local(2026, 10, 20))).toEqual({ dateFrom: "2026-10-20", dateTo: "2026-11-19" }); // 20 octobre
  }); // Fin du cas

  it("la veille du jour J appartient à la période précédente", () => { // Cas limite fin
    expect(periodePour(20, local(2026, 10, 19))).toEqual({ dateFrom: "2026-09-20", dateTo: "2026-10-19" }); // 19 octobre
  }); // Fin du cas

  it("gère le passage d'année", () => { // Décembre / janvier
    expect(periodePour(20, local(2026, 12, 25))).toEqual({ dateFrom: "2026-12-20", dateTo: "2027-01-19" }); // Fin d'année
    expect(periodePour(20, local(2027, 1, 5))).toEqual({ dateFrom: "2026-12-20", dateTo: "2027-01-19" }); // Début d'année
  }); // Fin du cas

  it("le jour 1 donne le mois calendaire", () => { // J = 1
    expect(periodePour(1, local(2026, 10, 15))).toEqual({ dateFrom: "2026-10-01", dateTo: "2026-10-31" }); // Octobre entier
    expect(periodePour(1, local(2026, 2, 10))).toEqual({ dateFrom: "2026-02-01", dateTo: "2026-02-28" }); // Février (non bissextile)
    expect(periodePour(1, local(2028, 2, 10))).toEqual({ dateFrom: "2028-02-01", dateTo: "2028-02-29" }); // Février bissextile
  }); // Fin du cas

  it("le jour 28 fonctionne même en février", () => { // J = 28
    expect(periodePour(28, local(2026, 2, 28))).toEqual({ dateFrom: "2026-02-28", dateTo: "2026-03-27" }); // 28 février
    expect(periodePour(28, local(2026, 3, 1))).toEqual({ dateFrom: "2026-02-28", dateTo: "2026-03-27" }); // 1er mars
  }); // Fin du cas

  it("deux périodes consécutives ne se chevauchent pas et ne laissent aucun trou", () => { // Continuité sur toute l'année
    let jour = local(2026, 1, 1); // Premier jour de l'année
    let precedente = periodePour(20, jour); // Période du premier jour
    for (let i = 0; i < 400; i++) { // Parcourt 400 jours
      jour = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate() + 1, 12); // Jour suivant
      const p = periodePour(20, jour); // Période de ce jour
      if (p.dateFrom !== precedente.dateFrom) { // Changement de période
        const veille = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate() - 1, 12); // Veille du changement
        expect(precedente.dateTo).toBe(formaterJour(veille)); // La précédente se termine la veille
        expect(p.dateFrom).toBe(formaterJour(jour)); // La nouvelle commence ce jour
        precedente = p; // Passe à la nouvelle
      } // Fin du changement
      expect(formaterJour(jour) >= p.dateFrom && formaterJour(jour) <= p.dateTo).toBe(true); // Le jour est dans sa période
    } // Fin de la boucle
  }); // Fin du cas
}); // Fin du groupe

describe("jours", () => { // Conversions de jours
  it("formate un jour avec des zéros", () => { // Format
    expect(formaterJour(local(2026, 1, 5))).toBe("2026-01-05"); // AAAA-MM-JJ
  }); // Fin du cas

  it("retrouve le jour local d'un instant ISO", () => { // Conversion depuis ISO
    expect(jourLocal(local(2026, 10, 25, 9).toISOString())).toBe("2026-10-25"); // Matin
    expect(jourLocal(local(2026, 10, 25, 23).toISOString())).toBe("2026-10-25"); // Soir (même jour local)
  }); // Fin du cas

  it("affiche un jour à la française", () => { // Affichage
    expect(afficherJour("2026-10-20")).toBe("20/10/2026"); // JJ/MM/AAAA
  }); // Fin du cas
}); // Fin du groupe
