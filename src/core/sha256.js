// Empreinte SHA-256 d'un texte, écrite à la main pour fonctionner partout (navigateur, téléphone, tests) sans dépendance.
// Sert à vérifier qu'un fichier de sauvegarde n'a pas été abîmé ni modifié.

// Les 64 constantes de l'algorithme SHA-256 (racines cubiques de nombres premiers).
const K = [ // Tableau des constantes
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, // Constantes 0 à 7
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, // Constantes 8 à 15
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, // Constantes 16 à 23
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, // Constantes 24 à 31
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, // Constantes 32 à 39
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, // Constantes 40 à 47
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, // Constantes 48 à 55
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2, // Constantes 56 à 63
]; // Fin des constantes

// Convertit un texte en octets UTF-8 (les accents prennent deux octets, etc.).
function versOctetsUtf8(texte) { // Reçoit un texte
  const binaire = unescape(encodeURIComponent(texte)); // Chaque caractère du résultat représente un octet
  const octets = new Uint8Array(binaire.length); // Tableau d'octets
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i); // Recopie chaque octet
  return octets; // Renvoie les octets
} // Fin de versOctetsUtf8

// Rotation vers la droite d'un nombre de 32 bits.
const tourner = (x, n) => (x >>> n) | (x << (32 - n)); // Décale à droite et ramène les bits sortis à gauche

// Calcule l'empreinte SHA-256 d'un texte et la renvoie en hexadécimal (64 caractères).
export function sha256Hex(texte) { // Reçoit un texte
  const octets = versOctetsUtf8(texte); // Texte en octets
  const longueurBits = octets.length * 8; // Longueur du message en bits
  const total = (((octets.length + 9 + 63) >> 6) << 6); // Longueur après remplissage (multiple de 64 octets)
  const message = new Uint8Array(total); // Message rempli
  message.set(octets); // Copie le texte au début
  message[octets.length] = 0x80; // Ajoute le bit « 1 » de remplissage
  const vue = new DataView(message.buffer); // Vue pour écrire des nombres de 32 bits
  vue.setUint32(total - 8, Math.floor(longueurBits / 0x100000000)); // Longueur : partie haute (64 bits au total)
  vue.setUint32(total - 4, longueurBits >>> 0); // Longueur : partie basse
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a; // Valeurs de départ (1/2)
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19; // Valeurs de départ (2/2)
  const w = new Uint32Array(64); // Tableau de travail de 64 mots
  for (let bloc = 0; bloc < total; bloc += 64) { // Traite le message par blocs de 64 octets
    for (let i = 0; i < 16; i++) w[i] = vue.getUint32(bloc + i * 4); // Les 16 premiers mots viennent du bloc
    for (let i = 16; i < 64; i++) { // Les 48 autres sont calculés
      const s0 = tourner(w[i - 15], 7) ^ tourner(w[i - 15], 18) ^ (w[i - 15] >>> 3); // Mélange du mot i-15
      const s1 = tourner(w[i - 2], 17) ^ tourner(w[i - 2], 19) ^ (w[i - 2] >>> 10); // Mélange du mot i-2
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; // Nouveau mot (modulo 2^32)
    } // Fin du calcul des mots
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7; // Copie les valeurs de travail
    for (let i = 0; i < 64; i++) { // 64 tours de mélange
      const S1 = tourner(e, 6) ^ tourner(e, 11) ^ tourner(e, 25); // Mélange de e
      const ch = (e & f) ^ (~e & g); // Choix : e décide entre f et g
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0; // Premier terme temporaire
      const S0 = tourner(a, 2) ^ tourner(a, 13) ^ tourner(a, 22); // Mélange de a
      const maj = (a & b) ^ (a & c) ^ (b & c); // Majorité de a, b et c
      const t2 = (S0 + maj) >>> 0; // Second terme temporaire
      h = g; g = f; f = e; e = (d + t1) >>> 0; // Décale les valeurs de travail (1/2)
      d = c; c = b; b = a; a = (t1 + t2) >>> 0; // Décale les valeurs de travail (2/2)
    } // Fin des tours
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; // Ajoute le résultat du bloc (1/2)
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0; // Ajoute le résultat du bloc (2/2)
  } // Fin des blocs
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((n) => n.toString(16).padStart(8, "0")).join(""); // Assemble les 8 mots en hexadécimal
} // Fin de sha256Hex
