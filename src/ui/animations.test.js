// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"; // Outils de test
import { animerCompteur, apparaitreEnCascade, animationsReduites } from "./animations.js"; // Fonctions à tester
import { formaterMontant } from "../core/format.js"; // Formatage des montants

afterEach(() => { // Après chaque cas
  vi.restoreAllMocks(); // Retire les simulations
  vi.useRealTimers(); // Remet le temps normal
}); // Fin du nettoyage

// Simule la préférence « réduire les animations » du téléphone.
const simulerReduction = (reduit) => { // Reçoit true ou false
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduit }); // Fausse fonction matchMedia
}; // Fin de simulerReduction

describe("animations", () => { // Groupe de tests
  it("détecte la préférence « réduire les animations »", () => { // Détection
    simulerReduction(true); // Préférence active
    expect(animationsReduites()).toBe(true); // Détectée
    simulerReduction(false); // Préférence inactive
    expect(animationsReduites()).toBe(false); // Non détectée
  }); // Fin du cas

  it("affiche directement la valeur finale si les animations sont réduites", () => { // Compteur sans animation
    simulerReduction(true); // Préférence active
    const el = document.createElement("div"); // Élément d'essai
    animerCompteur(el, 250000, formaterMontant); // Lance le compteur
    expect(el.textContent).toBe("250 000 Ar"); // Valeur finale tout de suite
  }); // Fin du cas

  it("fait défiler le compteur puis termine sur la valeur exacte", () => { // Compteur animé
    simulerReduction(false); // Animations permises
    let imageSuivante = null; // Fonction à rappeler à l'image suivante
    globalThis.requestAnimationFrame = (f) => { imageSuivante = f; return 1; }; // Remplace requestAnimationFrame par un contrôle manuel
    const el = document.createElement("div"); // Élément d'essai
    animerCompteur(el, 1000, formaterMontant, 800); // Lance le compteur sur 800 ms
    imageSuivante(0); // Première image à t = 0
    expect(el.textContent).toBe("0 Ar"); // Départ à 0
    imageSuivante(400); // Image à mi-parcours
    const milieu = Number(el.textContent.replace(/\D/g, "")); // Valeur affichée
    expect(milieu).toBeGreaterThan(0); // Au-dessus de 0
    expect(milieu).toBeLessThan(1000); // Mais pas encore au bout
    imageSuivante(900); // Image après la durée
    expect(el.textContent).toBe("1 000 Ar"); // Arrive exactement sur la valeur finale (entier)
  }); // Fin du cas

  it("affiche tout de suite les éléments si les animations sont réduites", () => { // Apparition sans animation
    simulerReduction(true); // Préférence active
    document.body.innerHTML = '<div class="apparition"></div><div class="apparition"></div>'; // Deux éléments à faire apparaître
    apparaitreEnCascade(); // Lance l'apparition
    expect(document.querySelectorAll(".apparition.visible")).toHaveLength(2); // Les deux sont visibles
  }); // Fin du cas

  it("fait apparaître les éléments l'un après l'autre sinon", () => { // Cascade
    simulerReduction(false); // Animations permises
    vi.useFakeTimers(); // Contrôle du temps
    document.body.innerHTML = '<div class="apparition"></div><div class="apparition"></div>'; // Deux éléments
    apparaitreEnCascade(); // Lance la cascade
    vi.advanceTimersByTime(1); // Un instant passe
    expect(document.querySelectorAll(".apparition.visible")).toHaveLength(1); // Seul le premier est visible
    vi.advanceTimersByTime(100); // Le temps passe
    expect(document.querySelectorAll(".apparition.visible")).toHaveLength(2); // Les deux sont visibles
  }); // Fin du cas
}); // Fin du groupe
