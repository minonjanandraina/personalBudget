import { describe, it, expect } from "vitest"; // Outils de test
import { analyserReponseUssd } from "./ussd-mm.js"; // Fonction à tester

describe("analyserReponseUssd", () => { // Réponses USSD du solde
  it("lit la réponse réelle vue sur le téléphone", () => { // Cas nominal
    expect(analyserReponseUssd("Le solde de votre compte est de 202316 AR. Achetez du crédit via OM et bénéficiez de 20% de bonus.")).toBe(202316); // Solde entier
  }); // Fin du test
  it("accepte des espaces entre milliers et ignore les centimes", () => { // Variantes de format
    expect(analyserReponseUssd("Le solde de votre compte est de 1 202 316 Ar.")).toBe(1202316); // Espaces
    expect(analyserReponseUssd("Le solde de votre compte est de 5916.47 Ar.")).toBe(5916); // Arrondi à l'inférieur
  }); // Fin du test
  it("renvoie null pour une autre réponse", () => { // Réponses sans solde
    expect(analyserReponseUssd("Code PIN incorrect.")).toBeNull(); // Erreur de PIN
    expect(analyserReponseUssd("")).toBeNull(); // Vide
    expect(analyserReponseUssd(undefined)).toBeNull(); // Absente
  }); // Fin du test
}); // Fin du groupe
