// Soldes du compte Orange Money : lecture, saisie manuelle, historique.
import { ErreurValidation } from "./erreurs.js"; // Erreur de saisie

const TOLERANCE_FUTUR_MS = 5 * 60 * 1000; // On accepte jusqu'à 5 minutes d'avance (décalage d'horloge)

// Renvoie le solde le plus récent { balance, datetime }, ou null si aucun solde n'est enregistré.
export async function lireDernierSolde(base) { // Reçoit la base
  const lignes = await base.requeter( // Lit le dernier solde
    "SELECT balance, datetime FROM solde_om ORDER BY datetime DESC, id DESC LIMIT 1", // Le plus récent d'abord, un seul résultat
  ); // Fin de la lecture
  if (lignes.length === 0) return null; // Aucun solde enregistré
  return { balance: Number(lignes[0].balance), datetime: lignes[0].datetime }; // Renvoie le montant (entier) et la date
} // Fin de lireDernierSolde

// Vérifie une saisie de solde. Renvoie un dictionnaire d'erreurs (vide si tout est correct).
export function validerSolde({ datetime, balance }, maintenant = new Date()) { // « maintenant » modifiable pour les tests
  const erreurs = {}; // Erreurs trouvées, par champ
  if (!Number.isInteger(balance) || balance < 0) erreurs.balance = "Le solde doit être un entier positif ou nul."; // Montant invalide
  const date = new Date(datetime); // Convertit la date saisie
  if (!datetime || Number.isNaN(date.getTime())) erreurs.datetime = "La date et l'heure sont invalides."; // Date illisible
  else if (date.getTime() > maintenant.getTime() + TOLERANCE_FUTUR_MS) erreurs.datetime = "La date ne peut pas être dans le futur."; // Date future
  return erreurs; // Renvoie les erreurs
} // Fin de validerSolde

// Enregistre un solde saisi à la main. « datetime » est un texte ISO UTC.
export async function creerSolde(base, { datetime, balance }, maintenant = new Date()) { // Reçoit la base et la saisie
  const erreurs = validerSolde({ datetime, balance }, maintenant); // Vérifie
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une erreur existe
  const { dernierId } = await base.executer( // Insère le solde
    "INSERT INTO solde_om (datetime, balance) VALUES (?, ?)", // Requête d'insertion
    [new Date(datetime).toISOString(), balance], // Date normalisée en ISO UTC, et montant
  ); // Fin de l'insertion
  return dernierId; // Renvoie l'identifiant créé
} // Fin de creerSolde

// Renvoie l'historique des soldes, du plus récent au plus ancien (100 maximum).
export async function listerSoldes(base, limite = 100) { // Reçoit la base et le nombre maximal de lignes
  const lignes = await base.requeter( // Lit l'historique
    "SELECT id, datetime, balance FROM solde_om ORDER BY datetime DESC, id DESC LIMIT ?", // Plus récent d'abord
    [limite], // Nombre maximal de lignes
  ); // Fin de la lecture
  return lignes.map((l) => ({ id: Number(l.id), datetime: l.datetime, balance: Number(l.balance) })); // Convertit en nombres
} // Fin de listerSoldes

// Supprime un solde de l'historique.
export async function supprimerSolde(base, id) { // Reçoit la base et l'identifiant
  await base.executer("DELETE FROM solde_om WHERE id = ?", [id]); // Supprime la ligne
} // Fin de supprimerSolde
