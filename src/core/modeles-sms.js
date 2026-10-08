// Modèles de SMS enregistrés dans la base (table modele_sms) : liste, création, modification, ordre de priorité, activation, suppression, retour aux modèles livrés.
// La reconnaissance elle-même (gabarits) est dans sms-mm.js ; les modèles livrés sont dans modeles-sms-defaut.js.
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs expliquées à l'utilisateur
import { validerModeleSms } from "./sms-mm.js"; // Contrôle d'un modèle
import { MODELES_PAR_DEFAUT } from "./modeles-sms-defaut.js"; // Modèles livrés avec l'application

// Transforme une ligne de la base en objet.
const versModele = (l) => ({ id: Number(l.id), nom: l.nom, sens: l.sens, gabarit: l.gabarit, note: l.note, position: Number(l.position), actif: Number(l.actif) === 1 }); // Convertit

// Tous les modèles, dans l'ordre de priorité.
export async function listerModeles(base) { // Reçoit la base
  const lignes = await base.requeter("SELECT id, nom, sens, gabarit, note, position, actif FROM modele_sms ORDER BY position, id"); // Lit les modèles
  return lignes.map(versModele); // Convertit
} // Fin de listerModeles

// Modèles activés seulement (ceux que l'import utilise), dans l'ordre de priorité.
export async function listerModelesActifs(base) { // Reçoit la base
  return (await listerModeles(base)).filter((m) => m.actif); // Garde les modèles activés
} // Fin de listerModelesActifs

// Lit un modèle (null s'il n'existe pas).
export async function lireModele(base, id) { // Reçoit la base et l'identifiant
  const [l] = await base.requeter("SELECT id, nom, sens, gabarit, note, position, actif FROM modele_sms WHERE id = ?", [id]); // Lit le modèle
  return l ? versModele(l) : null; // Objet ou null
} // Fin de lireModele

// Contrôles communs à la création et à la modification (forme du modèle, nom déjà pris).
async function controler(base, saisie, idExistant = null) { // Reçoit la base, la saisie et l'identifiant s'il existe déjà
  let propre; // Modèle nettoyé
  const erreurs = {}; // Erreurs par champ
  try { propre = validerModeleSms(saisie); } catch (e) { if (e instanceof ErreurValidation) Object.assign(erreurs, e.erreurs); else throw e; } // Contrôles de forme
  const nom = String(saisie?.nom ?? "").trim(); // Nom saisi
  if (!erreurs.nom) { // Nom valide : est-il libre ?
    const [pris] = await base.requeter("SELECT id FROM modele_sms WHERE lower(nom) = lower(?) AND id <> ?", [nom, idExistant ?? -1]); // Même nom ailleurs ?
    if (pris) erreurs.nom = "Un modèle porte déjà ce nom."; // Refuse
  } // Fin du contrôle du nom
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une erreur existe
  return propre; // Valeurs propres
} // Fin de controler

// Crée un modèle (placé en dernier dans l'ordre de priorité). Renvoie son identifiant.
export async function creerModele(base, saisie) { // Reçoit la base et la saisie
  const v = await controler(base, saisie); // Contrôles
  const [{ suivante }] = await base.requeter("SELECT COALESCE(MAX(position), 0) + 1 AS suivante FROM modele_sms"); // Dernière position + 1
  const { dernierId } = await base.executer("INSERT INTO modele_sms (nom, sens, gabarit, note, position) VALUES (?, ?, ?, ?, ?)", [v.nom, v.sens, v.gabarit, v.note, Number(suivante)]); // Insère
  return dernierId; // Identifiant créé
} // Fin de creerModele

// Modifie un modèle.
export async function modifierModele(base, id, saisie) { // Reçoit la base, l'identifiant et la saisie
  if (!(await lireModele(base, id))) throw new ErreurMetier("Ce modèle n'existe plus."); // Introuvable
  const v = await controler(base, saisie, id); // Contrôles
  await base.executer("UPDATE modele_sms SET nom = ?, sens = ?, gabarit = ?, note = ? WHERE id = ?", [v.nom, v.sens, v.gabarit, v.note, id]); // Met à jour
} // Fin de modifierModele

// Active ou désactive un modèle (un modèle désactivé n'est plus utilisé à l'import).
export async function activerModele(base, id, actif) { // Reçoit la base, l'identifiant et l'état voulu
  await base.executer("UPDATE modele_sms SET actif = ? WHERE id = ?", [actif ? 1 : 0, id]); // Met à jour
} // Fin de activerModele

// Supprime un modèle.
export async function supprimerModele(base, id) { // Reçoit la base et l'identifiant
  await base.executer("DELETE FROM modele_sms WHERE id = ?", [id]); // Supprime
} // Fin de supprimerModele

// Monte (-1) ou descend (+1) un modèle dans l'ordre de priorité, en l'échangeant avec son voisin.
export async function deplacerModele(base, id, sens) { // Reçoit la base, l'identifiant et le sens
  await base.transaction(async () => { // Tout ou rien
    const modeles = await listerModeles(base); // Ordre actuel
    const i = modeles.findIndex((m) => m.id === id); // Rang du modèle
    const j = i + (sens < 0 ? -1 : 1); // Rang du voisin
    if (i < 0 || j < 0 || j >= modeles.length) return; // Déjà en haut ou en bas
    const ordre = modeles.map((m) => m.id); // Identifiants dans l'ordre
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]]; // Échange
    for (let rang = 0; rang < ordre.length; rang += 1) await base.executer("UPDATE modele_sms SET position = ? WHERE id = ?", [rang + 1, ordre[rang]]); // Renumérote 1, 2, 3…
  }); // Fin de la transaction
} // Fin de deplacerModele

// Remplace TOUS les modèles par ceux livrés avec l'application.
export async function retablirModelesParDefaut(base) { // Reçoit la base
  await base.transaction(async () => { // Tout ou rien
    await base.executer("DELETE FROM modele_sms"); // Efface les modèles actuels
    for (const [i, m] of MODELES_PAR_DEFAUT.entries()) await base.executer("INSERT INTO modele_sms (nom, sens, gabarit, note, position) VALUES (?, ?, ?, ?, ?)", [m.nom, m.sens, m.gabarit, m.note, i + 1]); // Réinsère les modèles livrés
  }); // Fin de la transaction
} // Fin de retablirModelesParDefaut
