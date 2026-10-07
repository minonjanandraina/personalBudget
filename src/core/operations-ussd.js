// Opérations USSD dynamiques : modèles créés par l'utilisateur (nom, type, code USSD à variables, budget à débiter) et leur lancement.
// Variables du code : {numero} (numéro de téléphone), {montant} (montant entier) et {pin} (PIN Orange Money, demandé à chaque envoi et jamais enregistré).
// Exemple : #144*8*8*{numero}*{montant}*{pin}#
// Autorisation de l'envoi : PIN de verrouillage de l'application (obligatoire : le verrouillage doit être activé).
// Une opération de SORTIE n'enregistre rien tout de suite : elle est « en attente » et le SMS de confirmation est classé seul dans le budget (voir ussd-en-attente.js).
import { ErreurMetier, ErreurValidation } from "./erreurs.js"; // Erreurs expliquées à l'utilisateur
import { formaterMontant } from "./format.js"; // Affichage des montants
import { jourLocal, afficherJour } from "./periodes.js"; // Jour d'une date
import { allocationCouvrant, soldeAllocation } from "./allocations.js"; // Allocation d'une période et son solde
import { lireBudget } from "./budgets.js"; // Lecture d'un budget
import { verrouActif, verifierPin } from "./verrou.js"; // PIN de verrouillage de l'application

export const VARIABLES = ["numero", "montant", "pin"]; // Variables autorisées dans un code
export const TYPES = [{ valeur: "sortie", libelle: "Sortie (dépense d'un budget)" }, { valeur: "entree", libelle: "Entrée (argent reçu sur le compte)" }]; // Types d'opération
const RE_VARIABLE = /\{([a-z]+)\}/g; // Une variable entre accolades

// Liste (sans doublon, dans l'ordre) des variables utilisées par un code.
export function variablesDuCode(code) { // Reçoit le code
  return [...new Set([...String(code ?? "").matchAll(RE_VARIABLE)].map((m) => m[1]))]; // Noms trouvés
} // Fin de variablesDuCode

// Décrit en français ce que l'écran de lancement demandera pour un code (aperçu dans le formulaire du modèle).
export function resumeSaisies(code) { // Reçoit le code
  const texte = String(code ?? ""); // Code en texte
  const nbNumero = (texte.match(/\{numero\}/g) ?? []).length; // Nombre de fois où le numéro est inséré
  const demandes = []; // Phrases décrivant chaque saisie
  if (nbNumero === 1) demandes.push("un numéro de téléphone"); // Numéro utilisé une fois
  if (nbNumero > 1) demandes.push(`un numéro de téléphone (saisi une fois, inséré ${nbNumero} fois dans le code, p. ex. pour la confirmation du numéro)`); // Numéro répété
  if (texte.includes("{montant}")) demandes.push("un montant"); // Montant
  return demandes.length === 0 ? "Aucune saisie : le code sera envoyé tel quel." : `À chaque envoi, on demandera ${demandes.join(" et ")}.`; // Phrase finale
} // Fin de resumeSaisies

// Vérifie un modèle. Renvoie un dictionnaire d'erreurs par champ (vide si tout est correct).
export function validerOperation({ nom, type, code, budgetId }) { // Reçoit le modèle
  const erreurs = {}; // Erreurs par champ
  const nomPropre = String(nom ?? "").trim(); // Nom sans espaces autour
  if (nomPropre === "" || nomPropre.length > 60) erreurs.nom = "Le nom doit faire de 1 à 60 caractères."; // Nom invalide
  if (!TYPES.some((t) => t.valeur === type)) erreurs.type = "Choisissez un type."; // Type inconnu
  const codePropre = String(code ?? "").trim(); // Code sans espaces autour
  const inconnues = variablesDuCode(codePropre).filter((v) => !VARIABLES.includes(v)); // Variables non autorisées
  const sansVariables = codePropre.replace(RE_VARIABLE, "0"); // Code où chaque variable est remplacée par un chiffre
  if (inconnues.length > 0) erreurs.code = `Variable inconnue : {${inconnues[0]}}. Variables permises : {numero}, {montant}, {pin}.`; // Variable inconnue
  else if (!/^[#*][0-9*#]{2,98}#$/.test(sansVariables) || codePropre.length > 100) erreurs.code = "Le code doit commencer par # ou *, finir par # et ne contenir que des chiffres, des * et des # (et les variables {numero}, {montant}, {pin})."; // Forme invalide
  else if (type === "sortie" && !variablesDuCode(codePropre).includes("montant")) erreurs.code = "Une opération de sortie doit contenir {montant} (il sert à débiter le budget)."; // Montant indispensable pour une sortie
  if (type === "sortie" && !budgetId) erreurs.budgetId = "Choisissez le budget à débiter."; // Budget obligatoire
  if (type === "entree" && budgetId) erreurs.budgetId = "Une opération d'entrée ne débite aucun budget."; // Pas de budget pour une entrée
  return erreurs; // Erreurs trouvées
} // Fin de validerOperation

// Transforme une ligne de la base en objet.
const versOperation = (l) => ({ id: Number(l.id), nom: l.nom, type: l.type, code: l.code, budgetId: l.budget_id === null ? null : Number(l.budget_id), budgetNom: l.budget_nom ?? null }); // Convertit

// Lit un modèle (null s'il n'existe pas).
export async function lireOperation(base, id) { // Reçoit la base et l'identifiant
  const [l] = await base.requeter("SELECT o.id, o.nom, o.type, o.code, o.budget_id, b.name AS budget_nom FROM operation_ussd o LEFT JOIN budget b ON b.id = o.budget_id WHERE o.id = ?", [id]); // Lit le modèle
  return l ? versOperation(l) : null; // Objet ou null
} // Fin de lireOperation

// Liste des modèles, par nom.
export async function listerOperations(base) { // Reçoit la base
  const lignes = await base.requeter("SELECT o.id, o.nom, o.type, o.code, o.budget_id, b.name AS budget_nom FROM operation_ussd o LEFT JOIN budget b ON b.id = o.budget_id ORDER BY o.nom"); // Lit les modèles
  return lignes.map(versOperation); // Convertit
} // Fin de listerOperations

// Contrôles communs à la création et à la modification (erreurs de saisie, nom déjà pris, budget inexistant).
async function controler(base, donnees, idExistant = null) { // Reçoit la base, le modèle et l'identifiant s'il existe déjà
  const erreurs = validerOperation(donnees); // Contrôles de forme
  const nom = String(donnees.nom ?? "").trim(); // Nom propre
  if (!erreurs.nom) { // Nom valide : est-il libre ?
    const [pris] = await base.requeter("SELECT id FROM operation_ussd WHERE lower(nom) = lower(?) AND id <> ?", [nom, idExistant ?? -1]); // Même nom ailleurs ?
    if (pris) erreurs.nom = "Une opération porte déjà ce nom."; // Refuse
  } // Fin du contrôle du nom
  if (!erreurs.budgetId && donnees.budgetId && !(await lireBudget(base, donnees.budgetId))) erreurs.budgetId = "Ce budget n'existe plus."; // Budget inexistant
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse si une erreur existe
  return { nom, type: donnees.type, code: String(donnees.code).trim(), budgetId: donnees.type === "sortie" ? Number(donnees.budgetId) : null }; // Valeurs propres
} // Fin de controler

// Crée un modèle. Renvoie son identifiant.
export async function creerOperation(base, donnees) { // Reçoit la base et le modèle
  const v = await controler(base, donnees); // Contrôles
  const { dernierId } = await base.executer("INSERT INTO operation_ussd (nom, type, code, budget_id) VALUES (?, ?, ?, ?)", [v.nom, v.type, v.code, v.budgetId]); // Insère
  return dernierId; // Identifiant créé
} // Fin de creerOperation

// Modifie un modèle.
export async function modifierOperation(base, id, donnees) { // Reçoit la base, l'identifiant et le modèle
  if (!(await lireOperation(base, id))) throw new ErreurMetier("Cette opération n'existe plus."); // Introuvable
  const v = await controler(base, donnees, id); // Contrôles
  await base.executer("UPDATE operation_ussd SET nom = ?, type = ?, code = ?, budget_id = ? WHERE id = ?", [v.nom, v.type, v.code, v.budgetId, id]); // Met à jour
} // Fin de modifierOperation

// Supprime un modèle (refusé tant qu'une opération envoyée attend sa confirmation par SMS).
export async function supprimerOperation(base, id) { // Reçoit la base et l'identifiant
  const [{ n }] = await base.requeter("SELECT COUNT(*) AS n FROM ussd_en_attente WHERE operation_id = ? AND statut = 'en_attente'", [id]); // Opérations en attente
  if (Number(n) > 0) throw new ErreurMetier("Suppression impossible : une opération envoyée avec ce modèle attend encore sa confirmation par SMS."); // Refuse
  await base.executer("DELETE FROM operation_ussd WHERE id = ?", [id]); // Supprime
} // Fin de supprimerOperation

// Prépare un envoi : contrôle les valeurs saisies et le budget, et construit le code. Ne contacte pas le téléphone.
// valeurs = { numero (texte), montant (entier ou null) }. Renvoie { operation, code (avec {pin} encore à remplacer), codeAffiche (PIN masqué), montant, numero }.
export async function preparerEnvoi(base, operationId, { numero = "", montant = null } = {}, maintenant = new Date()) { // Reçoit la base, le modèle, les valeurs et l'heure
  const operation = await lireOperation(base, operationId); // Modèle
  if (!operation) throw new ErreurMetier("Cette opération n'existe plus."); // Introuvable
  const variables = variablesDuCode(operation.code); // Variables à remplir
  const erreurs = {}; // Erreurs par champ
  const numeroPropre = String(numero ?? "").replace(/[\s.-]/g, ""); // Numéro sans séparateurs
  if (variables.includes("numero") && !/^\d{8,15}$/.test(numeroPropre)) erreurs.numero = "Saisissez le numéro de téléphone (8 à 15 chiffres, sans +)."; // Numéro invalide
  if (variables.includes("montant") && !(Number.isSafeInteger(montant) && montant > 0)) erreurs.montant = "Saisissez un montant entier supérieur à 0."; // Montant invalide
  if (Object.keys(erreurs).length > 0) throw new ErreurValidation(erreurs); // Refuse
  if (operation.type === "sortie") { // Une sortie débite un budget : mêmes contrôles qu'une dépense saisie
    const allocation = await allocationCouvrant(base, operation.budgetId, jourLocal(maintenant.toISOString())); // Allocation de la période en cours
    if (!allocation) throw new ErreurMetier(`Aucune allocation pour « ${operation.budgetNom} » au ${afficherJour(jourLocal(maintenant.toISOString()))}. Allouez d'abord ce budget.`); // Pas d'allocation
    const solde = await soldeAllocation(base, allocation.id); // Solde de la période
    if (solde < montant) throw new ErreurValidation({ montant: `Solde insuffisant : il reste ${formaterMontant(solde)} sur « ${operation.budgetNom} » pour cette période. Une réallocation est nécessaire.` }); // Bloqué comme une dépense manuelle
  } // Fin du contrôle du budget
  const code = operation.code.replaceAll("{numero}", numeroPropre).replaceAll("{montant}", String(montant ?? "")); // Remplace les variables connues ici
  return { operation, code, codeAffiche: code.replaceAll("{pin}", "••••"), montant, numero: numeroPropre }; // Résultat
} // Fin de preparerEnvoi

// Lance une opération : vérifie le PIN de l'application, prépare le code, y insère le PIN Orange Money saisi, l'envoie, puis note l'attente du SMS (sorties).
// « ussd » = accès au téléphone (platform/ussd.js ou faux de test). Le PIN Orange Money (« pinOm ») n'est gardé nulle part. Renvoie { texte (réponse d'Orange Money), enAttente }.
export async function lancerOperation(base, ussd, operationId, { numero, montant, pinApp, pinOm = "" }, maintenant = new Date()) { // Reçoit la base, l'accès USSD, le modèle et les valeurs
  if (!(await verrouActif(base))) throw new ErreurMetier("Activez d'abord le verrouillage par PIN (Réglages) : le PIN de l'application autorise l'envoi des opérations USSD."); // Verrou obligatoire
  try { await verifierPin(base, pinApp, maintenant); } catch (e) { throw new ErreurValidation({ pin: e.message }); } // Mauvais PIN : message sous le champ
  const prep = await preparerEnvoi(base, operationId, { numero, montant }, maintenant); // Contrôles et code
  if (prep.code.includes("{pin}") && !/^\d{4,8}$/.test(String(pinOm ?? ""))) throw new ErreurValidation({ pinOm: "Saisissez votre PIN Orange Money (4 à 8 chiffres) : il est demandé à chaque envoi." }); // Le code a besoin du PIN OM
  const texte = await ussd.envoyerCode(prep.code.replaceAll("{pin}", pinOm)); // Envoi avec le PIN OM saisi (jamais enregistré)
  const enAttente = prep.operation.type === "sortie"; // Une sortie attend son SMS
  if (enAttente) await base.executer( // Note l'attente
    "INSERT INTO ussd_en_attente (operation_id, operation_nom, numero, montant, budget_id, date_envoi, reponse) VALUES (?, ?, ?, ?, ?, ?, ?)", // Requête
    [prep.operation.id, prep.operation.nom, prep.numero || null, prep.montant, prep.operation.budgetId, maintenant.toISOString(), String(texte).slice(0, 300)], // Valeurs
  ); // Fin de l'insertion
  return { texte, enAttente }; // Résultat
} // Fin de lancerOperation
