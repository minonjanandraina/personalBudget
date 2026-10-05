// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"; // Outils de test (vi = outils d'espionnage)
import { h, vider } from "./dom.js"; // Fonctions à tester

describe("h (fabrication d'éléments)", () => { // Groupe de tests
  it("crée un élément avec classe, attribut et texte", () => { // Cas de base
    const el = h("p", { class: "info", "data-x": "1" }, "Bonjour"); // Fabrique un paragraphe
    expect(el.tagName).toBe("P"); // C'est bien un <p>
    expect(el.className).toBe("info"); // La classe est posée
    expect(el.getAttribute("data-x")).toBe("1"); // L'attribut est posé
    expect(el.textContent).toBe("Bonjour"); // Le texte est là
  }); // Fin du cas

  it("insère le texte comme texte, jamais comme HTML (sécurité)", () => { // Protection contre l'injection
    const el = h("div", {}, "<img src=x onerror=alert(1)>"); // Texte piégé
    expect(el.querySelector("img")).toBeNull(); // Aucune balise créée
    expect(el.textContent).toBe("<img src=x onerror=alert(1)>"); // Le texte reste visible tel quel
  }); // Fin du cas

  it("branche les événements et accepte des enfants imbriqués", () => { // Événements et tableaux
    const auClic = vi.fn(); // Fonction espion
    const el = h("button", { onclick: auClic }, [h("span", {}, "a"), [h("span", {}, "b")]], null, false); // Enfants imbriqués et valeurs vides
    el.click(); // Simule un clic
    expect(auClic).toHaveBeenCalledOnce(); // La fonction a été appelée une fois
    expect(el.querySelectorAll("span")).toHaveLength(2); // Les deux enfants sont présents, les vides ignorés
  }); // Fin du cas

  it("ignore les propriétés vides et gère les booléens", () => { // Propriétés particulières
    const el = h("input", { disabled: true, placeholder: null, hidden: false }); // Mélange de valeurs
    expect(el.hasAttribute("disabled")).toBe(true); // true = attribut présent
    expect(el.hasAttribute("placeholder")).toBe(false); // null = absent
    expect(el.hasAttribute("hidden")).toBe(false); // false = absent
  }); // Fin du cas

  it("vide un élément", () => { // Fonction vider
    const el = h("div", {}, "a", h("b", {}, "c")); // Élément rempli
    vider(el); // Le vide
    expect(el.childNodes).toHaveLength(0); // Plus aucun enfant
  }); // Fin du cas
}); // Fin du groupe
