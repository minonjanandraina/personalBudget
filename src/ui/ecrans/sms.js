// Écrans des SMS Mobile Money : synchronisation, dépenses à classer dans un budget, SMS non compris.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonPrincipal, boutonLien, champ, choix } from "../composants.js"; // Composants
import { afficherToast } from "../messages.js"; // Notifications
import { soumettre } from "../formulaire.js"; // Enregistrement de formulaire
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { afficherDateHeure } from "../../core/dates.js"; // Affichage des dates
import { ErreurMetier } from "../../core/erreurs.js"; // Erreur de règle de gestion
import { synchroniserSms, listerNonClassees, listerSmsIllisibles, ignorerSmsIllisible, lireExpediteur, modifierExpediteur, classerTransaction } from "../../core/import-sms.js"; // Logique des SMS
import { resumeBudgets } from "../../core/allocations.js"; // Situation des budgets
import * as smsPlateforme from "../../platform/sms.js"; // Lecture des SMS (téléphone ou simulation)

// Phrase qui résume le résultat d'une synchronisation.
export function decrireBilan(b) { // Reçoit { importes, doublons, anciens, illisibles }
  const morceaux = []; // Parties de la phrase
  morceaux.push(b.importes === 0 ? "Aucune nouvelle opération" : `${b.importes} nouvelle${b.importes > 1 ? "s" : ""} opération${b.importes > 1 ? "s" : ""}`); // Opérations importées
  if (b.illisibles > 0) morceaux.push(`${b.illisibles} SMS non compris`); // SMS à revoir
  return `${morceaux.join(", ")}.`; // Assemble
} // Fin de decrireBilan

// Synchronisation silencieuse à l'ouverture de l'application (seulement si la permission est déjà accordée). Renvoie le bilan ou null.
export async function synchroniserAuDemarrage(base, sms = smsPlateforme) { // Reçoit la base et l'accès aux SMS
  try { // Une erreur ne doit jamais empêcher l'ouverture de l'application
    if (!(await sms.autoriseSansDemander())) return null; // Permission pas encore accordée : on attend le bouton « Synchroniser »
    const bilan = await synchroniserSms(base, sms.lireSmsMM); // Lit et importe
    if (bilan.importes > 0 || bilan.illisibles > 0) afficherToast(decrireBilan(bilan), "info"); // Prévient seulement s'il y a du nouveau
    return bilan; // Résultat
  } catch { return null; } // Silence : l'utilisateur peut relancer à la main
} // Fin de synchroniserAuDemarrage

// Dessine la liste des dépenses SMS à classer.
async function dessinerAClasser(conteneur, base) { // Reçoit la zone et la base
  vider(conteneur); // Efface la liste précédente
  const liste = await listerNonClassees(base); // Dépenses non classées
  conteneur.append(h("h2", { class: "section-titre" }, `À classer (${liste.length})`)); // Titre avec le nombre
  if (liste.length === 0) conteneur.append(alerte({ niveau: "ok", message: "Aucune dépense à classer." })); // Rien à faire
  for (const t of liste) { // Pour chaque dépense
    conteneur.append(h("div", { class: "carte apparition visible" }, // Une carte par dépense
      h("div", { class: "ligne ligne-sans-carte" }, // Ligne texte + montant
        h("div", { class: "ligne-texte" }, // Bloc de texte
          h("div", { class: "ligne-titre" }, t.note ?? "Opération Mobile Money"), // Libellé
          h("div", { class: "ligne-detail" }, afficherDateHeure(t.dateOperation)), // Date
        ), // Fin du bloc de texte
        h("div", { class: "ligne-montant montant-moins" }, `−${formaterMontant(t.montant)}`), // Montant
      ), // Fin de la ligne
      h("div", { class: "espace-haut" }, boutonLien("Classer dans un budget", `/sms/classer/${t.id}`, "budgets")), // Bouton de classement
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de dessinerAClasser

// Dessine la liste des SMS non compris.
async function dessinerIllisibles(conteneur, base, recharger) { // Reçoit la zone, la base et la fonction qui redessine
  vider(conteneur); // Efface la liste précédente
  const liste = await listerSmsIllisibles(base); // SMS non compris
  if (liste.length === 0) return; // Rien à montrer : on n'affiche même pas le titre
  conteneur.append(h("h2", { class: "section-titre" }, `SMS non compris (${liste.length})`)); // Titre avec le nombre
  for (const s of liste) { // Pour chaque SMS
    conteneur.append(h("div", { class: "carte apparition visible" }, // Une carte par SMS
      h("div", { class: "ligne-detail" }, afficherDateHeure(s.dateSms)), // Date
      h("div", { class: "ligne-detail texte-sms" }, s.texte), // Texte du SMS
      h("div", { class: "espace-haut" }, boutonPrincipal("Ignorer ce SMS", async () => { // Bouton pour ne plus le lister
        await ignorerSmsIllisible(base, s.id); // Marque comme ignoré
        await recharger(); // Redessine
      })), // Fin du bouton
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de dessinerIllisibles

// Écran « SMS Mobile Money ».
export async function afficherSms(zone, { base, sms = smsPlateforme }) { // Reçoit la zone, la base et l'accès aux SMS
  const zoneAClasser = h("div", {}); // Zone de la liste à classer
  const zoneIllisibles = h("div", {}); // Zone des SMS non compris
  const recharger = async () => { await dessinerAClasser(zoneAClasser, base); await dessinerIllisibles(zoneIllisibles, base, recharger); }; // Redessine les deux listes
  const champExpediteur = champ({ id: "sms-expediteur", libelle: "Nom de l'expéditeur des SMS", valeur: await lireExpediteur(base), aide: "Tel qu'il s'affiche dans vos messages (ex. OrangeMoney). À corriger si aucun SMS n'est trouvé." }); // Réglage de l'expéditeur
  const synchroniser = async () => { // Bouton « Synchroniser »
    try { // Tente la synchronisation
      const bilan = await synchroniserSms(base, sms.lireSmsMM); // Lit et importe
      afficherToast(decrireBilan(bilan), "succes"); // Résultat
    } catch (erreur) { // Si quelque chose échoue
      afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur?.message ?? erreur}`, "erreur"); // Explique
    } // Fin du try/catch
    await recharger(); // Redessine les listes
  }; // Fin de synchroniser
  const enregistrerExpediteur = () => soumettre({ champs: { expediteur: champExpediteur }, action: () => modifierExpediteur(base, champExpediteur.lire()), messageSucces: "Expéditeur enregistré." }); // Enregistre le nom
  zone.append( // Assemble l'écran
    enteteEcran("SMS Mobile Money", "Importer vos opérations"), // En-tête
    carte(h("p", { class: "ligne-detail" }, "Les SMS ne disent pas à quel budget appartient une dépense : chaque opération importée est à classer vous-même."), boutonPrincipal("Synchroniser maintenant", synchroniser)), // Carte de synchronisation
    zoneAClasser, // Liste à classer
    zoneIllisibles, // SMS non compris
    carte(champExpediteur.element, boutonPrincipal("Enregistrer l'expéditeur", enregistrerExpediteur)), // Réglage de l'expéditeur
  ); // Fin de l'assemblage
  await recharger(); // Affiche les listes
} // Fin de afficherSms

// Formulaire de classement d'une dépense SMS dans un budget (params.id = identifiant de la transaction).
export async function afficherFormulaireClasser(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  const id = Number(params.id); // Identifiant de la transaction
  zone.append(enteteEcran("Classer la dépense", null, { retour: "/sms" })); // En-tête
  const [t] = await base.requeter("SELECT t.id, t.montant, t.note, t.date_operation, t.insert_type, t.debit_credit, t.nature, a.budget_id FROM transactions t LEFT JOIN allocation_budget a ON a.id = t.allocation_id WHERE t.id = ?", [id]); // Lit la dépense
  if (!t || t.insert_type !== "auto" || Number(t.debit_credit) !== -1 || t.nature !== "normale") { zone.append(alerte({ niveau: "danger", message: "Cette dépense n'existe pas ou ne vient pas d'un SMS." })); return; } // Introuvable ou non concernée
  const resumes = await resumeBudgets(base); // Budgets avec leur solde de la période en cours
  if (resumes.length === 0) { zone.append(alerte({ niveau: "attention", message: "Créez d'abord un budget." }), h("div", { class: "espace-haut" }, boutonLien("Créer un budget", "/budgets/nouveau", "budgets"))); return; } // Aucun budget
  const champs = { budgetId: choix({ id: "classer-budget", libelle: "Budget", valeur: t.budget_id === null ? "" : String(t.budget_id), options: [{ valeur: "", libelle: "— Choisir —" }, ...resumes.map((r) => ({ valeur: r.budget.id, libelle: `${r.budget.name} — ${r.allocation ? `solde ${formaterMontant(r.allocation.solde)}` : "non alloué"}` }))] }) }; // Choix du budget
  const enregistrer = () => { // Classe la dépense
    const budgetId = Number(champs.budgetId.lire()) || null; // Budget choisi
    if (budgetId === null) { champs.budgetId.afficherErreur("Choisissez un budget."); return Promise.resolve(false); } // Rien choisi
    return soumettre({ champs, action: () => classerTransaction(base, id, budgetId), messageSucces: "Dépense classée.", routeSucces: "/sms" }); // Classe puis retourne à la liste
  }; // Fin de enregistrer
  const retirer = () => soumettre({ champs, action: () => classerTransaction(base, id, null), messageSucces: "Dépense remise « à classer ».", routeSucces: "/sms" }); // Remet la dépense « non classée »
  zone.append(carte( // Carte du formulaire
    h("div", { class: "ligne-detail info-formulaire" }, `${t.note ?? "Opération Mobile Money"} · ${formaterMontant(Number(t.montant))} · ${afficherDateHeure(t.date_operation)}`), // Rappel de la dépense
    champs.budgetId.element, // Choix du budget
    boutonPrincipal("Classer dans ce budget", enregistrer), // Bouton principal
    t.budget_id === null ? null : h("div", { class: "espace-haut" }, boutonPrincipal("Remettre « à classer »", retirer, { danger: true })), // Possibilité de défaire un classement
  )); // Fin de la carte
} // Fin de afficherFormulaireClasser
