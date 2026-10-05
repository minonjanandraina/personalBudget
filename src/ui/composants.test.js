// @vitest-environment jsdom
import { describe, it, expect } from "vitest"; // Outils de test
import { tuile, alerte, champ, enteteEcran } from "./composants.js"; // Composants à tester
import { icone, nomsIcones } from "./icones.js"; // Icônes à tester

describe("composants", () => { // Groupe de tests
  it("une tuile avec route est un lien", () => { // Tuile active
    const el = tuile({ libelle: "Réglages", nomIcone: "reglages", couleur: "gris", route: "/reglages" }); // Fabrique la tuile
    expect(el.tagName).toBe("A"); // C'est un lien
    expect(el.getAttribute("href")).toBe("#/reglages"); // Il pointe vers la route
    expect(el.textContent).not.toContain("bientôt"); // Pas d'étiquette « bientôt »
  }); // Fin du cas

  it("une tuile sans route est grisée avec « bientôt »", () => { // Tuile inactive
    const el = tuile({ libelle: "Budgets", nomIcone: "budgets", couleur: "bleu" }); // Fabrique la tuile sans route
    expect(el.tagName).toBe("DIV"); // Ce n'est pas un lien
    expect(el.classList.contains("desactivee")).toBe(true); // Elle est grisée
    expect(el.getAttribute("aria-disabled")).toBe("true"); // Signalée comme inactive
    expect(el.textContent).toContain("bientôt"); // Étiquette présente
  }); // Fin du cas

  it("une alerte danger est annoncée comme alerte", () => { // Accessibilité
    const el = alerte({ niveau: "danger", message: "Problème" }); // Fabrique l'alerte
    expect(el.getAttribute("role")).toBe("alert"); // Rôle « alert »
    expect(el.textContent).toContain("Problème"); // Message affiché
    expect(alerte({ niveau: "ok", message: "x" }).getAttribute("role")).toBe("status"); // Une alerte normale est un simple statut
  }); // Fin du cas

  it("un champ affiche puis efface son erreur", () => { // Validation de formulaire
    const c = champ({ id: "montant", libelle: "Montant", valeur: "12" }); // Fabrique le champ
    expect(c.lire()).toBe("12"); // Valeur initiale lue
    c.afficherErreur("Nombre invalide"); // Affiche une erreur
    expect(c.element.querySelector(".champ-message").textContent).toBe("Nombre invalide"); // Message visible
    expect(c.element.querySelector("input").getAttribute("aria-invalid")).toBe("true"); // Champ signalé invalide
    expect(c.element.classList.contains("en-erreur")).toBe(true); // Champ en rouge
    c.effacerErreur(); // Efface l'erreur
    expect(c.element.querySelector(".champ-message").textContent).toBe(""); // Message vidé
    expect(c.element.querySelector("input").hasAttribute("aria-invalid")).toBe(false); // Signal retiré
  }); // Fin du cas

  it("le libellé du champ est lié à sa saisie", () => { // Accessibilité
    const c = champ({ id: "nom", libelle: "Nom" }); // Fabrique le champ
    expect(c.element.querySelector("label").getAttribute("for")).toBe("nom"); // Le libellé pointe vers la saisie
    expect(c.element.querySelector("input").id).toBe("nom"); // La saisie porte cet identifiant
  }); // Fin du cas

  it("l'en-tête affiche titre et sous-titre", () => { // En-tête d'écran
    const el = enteteEcran("Volako", "Hors ligne"); // Fabrique l'en-tête
    expect(el.querySelector("h1").textContent).toBe("Volako"); // Titre
    expect(el.querySelector(".sous-titre").textContent).toBe("Hors ligne"); // Sous-titre
  }); // Fin du cas

  it("toutes les icônes se fabriquent et un nom inconnu est refusé", () => { // Icônes
    for (const nom of nomsIcones()) expect(icone(nom).querySelector("svg")).not.toBeNull(); // Chaque icône contient un dessin
    expect(() => icone("inexistante")).toThrow(); // Nom inconnu : erreur claire
  }); // Fin du cas
}); // Fin du groupe
