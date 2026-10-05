// Point d'entrée unique pour obtenir la base de données : choisit l'adaptateur selon l'environnement.
import { Capacitor } from "@capacitor/core"; // Outil Capacitor : permet de savoir si on tourne dans l'APK

const CLE_STOCKAGE = "volako_base_dev"; // Nom sous lequel la base de développement est gardée dans le navigateur

// Convertit des octets en texte (pour les ranger dans le stockage du navigateur).
function octetsVersTexte(octets) { // Reçoit un tableau d'octets
  let texte = ""; // Texte construit petit à petit
  for (let i = 0; i < octets.length; i += 8192) { // Traite par blocs de 8192 octets
    texte += String.fromCharCode(...octets.subarray(i, i + 8192)); // Convertit un bloc en caractères
  } // Fin de la boucle
  return btoa(texte); // Encode le tout en base64 (texte sans caractère spécial)
} // Fin de octetsVersTexte

// Convertit le texte du stockage en octets.
function texteVersOctets(base64) { // Reçoit le texte base64
  const texte = atob(base64); // Décode le base64
  return Uint8Array.from(texte, (c) => c.charCodeAt(0)); // Reconvertit chaque caractère en octet
} // Fin de texteVersOctets

// Ouvre la base : SQLite du téléphone dans l'APK, sql.js dans le navigateur.
export async function ouvrirBase() { // Aucun paramètre
  if (Capacitor.isNativePlatform()) { // Si on tourne dans l'application Android
    const { ouvrirBaseCapacitor } = await import("./base-capacitor.js"); // Charge l'adaptateur Android
    return ouvrirBaseCapacitor(); // Ouvre la vraie base du téléphone
  } // Fin du cas Android
  const { ouvrirBaseSqlJs } = await import("./base-sqljs.js"); // Sinon charge l'adaptateur navigateur
  const urlWasm = (await import("sql.js/dist/sql-wasm.wasm?url")).default; // Adresse du fichier WebAssembly de sql.js
  let octets = null; // Octets de la base enregistrée (aucun par défaut)
  try { // Le stockage du navigateur peut être indisponible
    const sauvegarde = localStorage.getItem(CLE_STOCKAGE); // Cherche une base déjà enregistrée
    if (sauvegarde) octets = texteVersOctets(sauvegarde); // La reconvertit en octets si elle existe
  } catch { // Si le stockage est inaccessible
    octets = null; // On repart d'une base vide
  } // Fin du try/catch
  return ouvrirBaseSqlJs({ // Ouvre la base du navigateur
    octets, // Contenu précédent (ou vide)
    localiserFichier: () => urlWasm, // Indique où trouver le fichier .wasm
    apresEcriture: (donnees) => { // Après chaque écriture, on garde une copie
      try { localStorage.setItem(CLE_STOCKAGE, octetsVersTexte(donnees)); } catch { /* stockage plein ou bloqué : on ignore */ } // Enregistre la base dans le navigateur
    }, // Fin de apresEcriture
  }); // Fin de l'ouverture
} // Fin de ouvrirBase
