import { describe, it, expect } from "vitest"; // Outils de test
import { sha256Hex } from "./sha256.js"; // Fonction à tester

describe("sha256Hex", () => { // Empreintes SHA-256
  it("donne les empreintes officielles de référence", () => { // Vecteurs de test connus
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"); // Texte vide
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); // « abc »
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"); // Message de 56 octets (limite du remplissage)
  }); // Fin du cas

  it("gère les messages longs (plusieurs blocs)", () => { // Un million de « a »
    expect(sha256Hex("a".repeat(1000000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"); // Valeur officielle
  }); // Fin du cas

  it("gère les accents (UTF-8) et change au moindre caractère", () => { // Texte accentué
    expect(sha256Hex("é")).toBe("4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c"); // Valeur calculée par l'outil de référence de Node
    expect(sha256Hex("Réservé 100 000 Ar – été")).toBe("2c97ac258471f633a48cdcaf4b04524b6241332ea3692c6aeaac0d55b40c9b63"); // Texte accentué avec tiret long
    expect(sha256Hex("é")).not.toBe(sha256Hex("e")); // Un accent change l'empreinte
    expect(sha256Hex("100000")).not.toBe(sha256Hex("100001")); // Un chiffre change l'empreinte
    expect(sha256Hex("é")).toHaveLength(64); // 64 caractères hexadécimaux
  }); // Fin du cas
}); // Fin du groupe
