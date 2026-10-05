// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"; // Outils de test
import { afficherToast, confirmer } from "./messages.js"; // Fonctions à tester

beforeEach(() => { // Avant chaque cas
  document.body.replaceChildren(); // Repart d'une page vide
  vi.useFakeTimers(); // Contrôle du temps (pour tester la disparition)
}); // Fin de la préparation

afterEach(() => { // Après chaque cas
  vi.useRealTimers(); // Remet le temps normal
}); // Fin du nettoyage

describe("toasts", () => { // Notifications
  it("s'affiche puis disparaît toute seule", () => { // Cycle de vie
    afficherToast("Enregistré", "succes", 1000); // Affiche une notification de 1 seconde
    expect(document.querySelector(".toast").textContent).toContain("Enregistré"); // Elle est visible
    vi.advanceTimersByTime(1001); // Fait avancer le temps
    expect(document.querySelector(".toast")).toBeNull(); // Elle a disparu
  }); // Fin du cas

  it("plusieurs notifications s'empilent dans la même zone", () => { // Empilement
    afficherToast("A"); // Première
    afficherToast("B"); // Deuxième
    expect(document.querySelectorAll("#toasts .toast")).toHaveLength(2); // Deux dans la même zone
    expect(document.querySelectorAll("#toasts")).toHaveLength(1); // Une seule zone
  }); // Fin du cas
}); // Fin du groupe

describe("confirmer", () => { // Fenêtre de confirmation
  it("renvoie true quand on confirme", async () => { // Confirmation
    const reponse = confirmer({ titre: "Supprimer ?", message: "Définitif", libelleOk: "Oui" }); // Ouvre la fenêtre
    expect(document.querySelector("[role=dialog]")).not.toBeNull(); // La fenêtre est affichée
    document.querySelectorAll(".dialogue-actions button")[1].click(); // Clique sur le bouton de confirmation
    expect(await reponse).toBe(true); // Réponse : true
    expect(document.querySelector("[role=dialog]")).toBeNull(); // La fenêtre est refermée
  }); // Fin du cas

  it("renvoie false quand on annule", async () => { // Annulation
    const reponse = confirmer({ titre: "Supprimer ?", message: "Définitif" }); // Ouvre la fenêtre
    document.querySelectorAll(".dialogue-actions button")[0].click(); // Clique sur Annuler
    expect(await reponse).toBe(false); // Réponse : false
  }); // Fin du cas

  it("renvoie false quand on touche à côté de la fenêtre", async () => { // Clic sur le fond
    const reponse = confirmer({ titre: "Supprimer ?", message: "Définitif" }); // Ouvre la fenêtre
    document.querySelector(".fond-dialogue").click(); // Clique sur le fond sombre
    expect(await reponse).toBe(false); // Réponse : false
  }); // Fin du cas

  it("le bouton de confirmation devient rouge pour une action dangereuse", () => { // Style danger
    confirmer({ titre: "Supprimer ?", message: "Définitif", danger: true }); // Ouvre la fenêtre en mode danger
    expect(document.querySelectorAll(".dialogue-actions button")[1].classList.contains("bouton-danger")).toBe(true); // Bouton rouge
  }); // Fin du cas
}); // Fin du groupe
