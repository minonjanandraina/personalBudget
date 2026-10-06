// Écrans des opérations : liste filtrable des transactions et saisie d'une dépense manuelle.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonIcone, boutonPrincipal, champ, choix, interrupteur } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre, lireMontant, effacerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { datetimeLocalVersIso, isoVersDatetimeLocal, afficherDateHeure } from "../../core/dates.js"; // Conversions de dates
import { enregistrerDepense, resumeBudgets, modifierOperation, supprimerOperation, lireOperationDetaillee } from "../../core/allocations.js"; // Logique métier
import { ErreurMetier } from "../../core/erreurs.js"; // Erreur de règle de gestion
import { listerTransactions } from "../../core/transactions.js"; // Liste des transactions
import { listerBudgets } from "../../core/budgets.js"; // Liste des budgets
import { situationFinanciere } from "../../core/soldes.js"; // Solde OM disponible et libre à allouer

// Libellé et aide de la case « déjà comprise dans le solde OM » (dépense oubliée rattrapée après un solde réel).
const LIBELLE_COMPRISE = "Déjà comprise dans mon dernier solde OM"; // Libellé de la case
const AIDE_COMPRISE = "À cocher pour une dépense oubliée, faite avant votre dernier solde Orange Money saisi : elle ne sera pas retirée une seconde fois du solde disponible."; // Aide de la case

// Dessine la liste des transactions dans le conteneur, selon les filtres.
async function dessinerListe(conteneur, base, { budgetId, sens, nature }, recharger) { // Reçoit la zone, la base, les filtres et la fonction qui redessine la liste
  vider(conteneur); // Efface la liste précédente
  const transactions = await listerTransactions(base, { budgetId, sens, nature }); // Lit les transactions filtrées
  if (transactions.length === 0) conteneur.append(alerte({ niveau: "info", message: "Aucune opération pour ces critères." })); // Message si la liste est vide
  for (const t of transactions) { // Pour chaque transaction
    const entree = t.debitCredit === 1; // Entrée d'argent dans le budget ?
    const genre = t.nature === "report" ? "Report" : t.nature === "transfert" ? "Transfert" : entree ? "Allocation" : "Dépense"; // Nature affichée
    conteneur.append(h("div", { class: "carte apparition visible" }, // Une carte par transaction
      h("div", { class: "ligne ligne-sans-carte" }, // Ligne du haut : texte et montant
      h("div", { class: "ligne-texte" }, // Bloc de texte
        h("div", { class: "ligne-titre" }, t.budgetName ?? "Non classée"), // Budget (ou « Non classée »)
        h("div", { class: "ligne-detail" }, `${afficherDateHeure(t.dateOperation)} · ${genre} · ${t.insertType === "auto" ? "SMS" : t.nature !== "normale" ? "automatique" : "manuel"}`), // Date, nature et origine
        t.note ? h("div", { class: "ligne-detail" }, t.note) : null, // Note éventuelle
        t.compriseDansSolde ? h("div", { class: "ligne-detail" }, "Déjà comprise dans le solde OM") : null, // Rappel : dépense rattrapée, non retirée du solde disponible
      ), // Fin du bloc de texte
      h("div", { class: `ligne-montant ${entree ? "montant-plus" : "montant-moins"}` }, `${entree ? "+" : "−"}${formaterMontant(t.montant)}`), // Montant signé
      ), // Fin de la ligne du haut
      t.insertType === "manuel" && t.nature === "normale" && t.allocationId !== null ? h("div", { class: "actions-ligne" }, // Seules les saisies manuelles rattachées à un budget sont modifiables (pas les reports ni les transferts)
        boutonIcone({ nomIcone: "modifier", libelle: "Modifier cette opération", route: `/operations/${t.id}` }), // Bouton modifier
        boutonIcone({ nomIcone: "supprimer", libelle: "Supprimer cette opération", danger: true, auClic: async () => { // Bouton supprimer
          const ok = await confirmer({ titre: "Supprimer cette opération ?", message: `${entree ? "L'allocation" : "La dépense"} de ${formaterMontant(t.montant)} sera supprimée définitivement.`, libelleOk: "Supprimer", danger: true }); // Demande confirmation
          if (!ok) return; // Annulé : on s'arrête
          try { // Tente la suppression
            await supprimerOperation(base, t.id); // Supprime (refusé si le solde deviendrait négatif)
            afficherToast("Opération supprimée.", "succes"); // Confirme
            await recharger(); // Redessine la liste
          } catch (erreur) { // Si c'est refusé
            afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur.message}`, "erreur"); // Explique pourquoi
          } // Fin du try/catch
        } }), // Fin du bouton supprimer
      ) : null, // Fin des boutons
      t.insertType === "auto" && t.debitCredit === -1 && t.nature === "normale" ? h("div", { class: "actions-ligne" }, boutonLien(t.allocationId === null ? "Classer dans un budget" : "Changer de budget", `/sms/classer/${t.id}`, "budgets")) : null, // Une dépense issue d'un SMS se classe (ou se reclasse) dans un budget
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de dessinerListe

// Liste des opérations avec filtres par budget et par sens.
export async function afficherOperations(zone, { base }) { // Reçoit la zone et la base
  const budgets = await listerBudgets(base); // Budgets (pour le filtre)
  const filtreBudget = choix({ id: "filtre-budget", libelle: "Budget", options: [{ valeur: "", libelle: "Tous les budgets" }, ...budgets.map((b) => ({ valeur: b.id, libelle: b.name }))] }); // Filtre par budget
  const filtreSens = choix({ id: "filtre-sens", libelle: "Type", options: [{ valeur: "", libelle: "Toutes" }, { valeur: "depense", libelle: "Dépenses" }, { valeur: "allocation", libelle: "Allocations" }, { valeur: "mouvements", libelle: "Reports et transferts" }] }); // Filtre par type d'opération
  const liste = h("div", { class: "liste-operations" }); // Zone de la liste
  const filtresChoisis = () => { // Traduit les choix des listes en filtres pour la requête
    const type = filtreSens.lire(); // Type choisi
    return { budgetId: filtreBudget.lire() === "" ? null : Number(filtreBudget.lire()), sens: type === "depense" ? -1 : type === "allocation" ? 1 : null, nature: type === "depense" || type === "allocation" ? "normale" : type === "mouvements" ? "mouvements" : null }; // Budget, sens et nature
  }; // Fin de filtresChoisis
  const recharger = () => dessinerListe(liste, base, filtresChoisis(), recharger); // Redessine la liste selon les filtres
  filtreBudget.element.querySelector("select").addEventListener("change", recharger); // Recharge quand le budget change
  filtreSens.element.querySelector("select").addEventListener("change", recharger); // Recharge quand le type change
  zone.append( // Assemble l'écran
    enteteEcran("Opérations", "Dépenses et allocations"), // En-tête
    boutonLien("Nouvelle dépense", "/operations/depense", "ajouter"), // Bouton de saisie d'une dépense
    h("div", { class: "espace-haut" }, boutonLien("Allouer un budget", "/allocations/nouveau", "allocations")), // Raccourci d'allocation
    h("div", { class: "espace-haut" }, boutonLien("Transférer entre budgets", "/allocations/transfert", "transactions")), // Raccourci de transfert
    h("div", { class: "filtres espace-haut" }, filtreBudget.element, filtreSens.element), // Filtres
    liste, // Liste
  ); // Fin de l'assemblage
  await recharger(); // Affiche la liste initiale
} // Fin de afficherOperations

// Formulaire de saisie d'une dépense manuelle.
export async function afficherFormulaireDepense(zone, { base }) { // Reçoit la zone et la base
  zone.append(enteteEcran("Nouvelle dépense", null, { retour: "/operations" })); // En-tête
  const resumes = await resumeBudgets(base); // Situation de chaque budget
  if (resumes.length === 0) { // Aucun budget : rien à dépenser
    zone.append(alerte({ niveau: "attention", message: "Créez d'abord un budget." }), h("div", { class: "espace-haut" }, boutonLien("Créer un budget", "/budgets/nouveau", "budgets"))); // Explication et raccourci
    return; // Rien d'autre à afficher
  } // Fin du cas sans budget
  const situation = await situationFinanciere(base); // Solde OM disponible et libre à allouer
  const libelleBudget = (r) => `${r.budget.name} — ${r.allocation ? `solde ${formaterMontant(r.allocation.solde)}` : "non alloué"}`; // Texte d'une option : nom et solde
  const champs = { // Champs du formulaire
    budgetId: choix({ id: "dep-budget", libelle: "Budget", options: [{ valeur: "", libelle: "— Choisir —" }, ...resumes.map((r) => ({ valeur: r.budget.id, libelle: libelleBudget(r) }))] }), // Budget avec son solde
    montant: champ({ id: "dep-montant", libelle: "Montant (Ar)", inputmode: "numeric" }), // Montant
    dateOperation: champ({ id: "dep-date", libelle: "Date et heure", type: "datetime-local", valeur: isoVersDatetimeLocal(new Date().toISOString()) }), // Date préremplie à maintenant
    note: champ({ id: "dep-note", libelle: "Note (facultative)", aide: "Ex. : essence, repas…" }), // Note
    ...(situation.om === null ? {} : { compriseDansSolde: interrupteur({ id: "dep-comprise", libelle: LIBELLE_COMPRISE, aide: AIDE_COMPRISE }) }), // Case « déjà comprise » (seulement s'il existe un solde OM)
  }; // Fin des champs
  const enregistrer = () => { // Enregistre le formulaire
    effacerErreurs(champs); // Repart sans erreur affichée
    const montant = lireMontant(champs.montant); // Lit le montant (affiche l'erreur de format)
    const dateOperation = datetimeLocalVersIso(champs.dateOperation.lire()); // Convertit la date en ISO UTC
    if (dateOperation === null) champs.dateOperation.afficherErreur("La date et l'heure sont invalides."); // Date illisible
    if (montant === null || dateOperation === null) { afficherToast("Corrigez les champs en rouge.", "erreur"); return Promise.resolve(false); } // Arrête si un champ est illisible
    return soumettre({ // Enregistre
      champs, // Champs à surveiller
      action: () => enregistrerDepense(base, { budgetId: Number(champs.budgetId.lire()) || null, montant, dateOperation, note: champs.note.lire(), compriseDansSolde: champs.compriseDansSolde ? champs.compriseDansSolde.lire() : false }), // Enregistre la dépense (bloquée si solde insuffisant)
      messageSucces: "Dépense enregistrée.", // Message de succès
      routeSucces: "/operations", // Retour à la liste
    }); // Fin de l'enregistrement
  }; // Fin de enregistrer
  const indiceEcart = situation.libre !== null && situation.libre < 0 ? alerte({ niveau: "attention", message: "Le total réservé dépasse votre solde Orange Money : si vous rattrapez une dépense oubliée, cochez « Déjà comprise dans mon dernier solde OM »." }) : null; // Aide quand un écart existe
  zone.append(carte(champs.budgetId.element, champs.montant.element, champs.dateOperation.element, champs.note.element, champs.compriseDansSolde ? champs.compriseDansSolde.element : null, indiceEcart, boutonPrincipal("Enregistrer la dépense", enregistrer))); // Carte du formulaire
} // Fin de afficherFormulaireDepense

// Formulaire de modification d'une opération manuelle (params.id). La date ne se modifie que pour une dépense.
export async function afficherFormulaireOperation(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  const id = Number(params.id); // Identifiant de l'opération
  const operation = await lireOperationDetaillee(base, id); // Lit l'opération
  zone.append(enteteEcran("Modifier l'opération", null, { retour: "/operations" })); // En-tête
  if (!operation) { zone.append(alerte({ niveau: "danger", message: "Cette opération n'existe plus." })); return; } // Introuvable
  if (operation.insertType !== "manuel" || operation.allocationId === null) { zone.append(alerte({ niveau: "attention", message: "Cette opération ne peut pas être modifiée." })); return; } // Opération non modifiable
  const estDepense = operation.debitCredit === -1; // Dépense ou allocation ?
  const situation = await situationFinanciere(base); // Solde OM disponible
  const champs = { // Champs du formulaire
    montant: champ({ id: "op-montant", libelle: "Montant (Ar)", valeur: String(operation.montant), inputmode: "numeric" }), // Montant
    ...(estDepense ? { dateOperation: champ({ id: "op-date", libelle: "Date et heure", type: "datetime-local", valeur: isoVersDatetimeLocal(operation.dateOperation) }) } : {}), // Date (dépense seulement)
    note: champ({ id: "op-note", libelle: "Note (facultative)", valeur: operation.note ?? "" }), // Note
    ...(estDepense && (operation.compriseDansSolde || situation.om !== null) ? { compriseDansSolde: interrupteur({ id: "op-comprise", libelle: LIBELLE_COMPRISE, valeur: operation.compriseDansSolde, aide: AIDE_COMPRISE }) } : {}), // Case « déjà comprise » (dépenses seulement)
  }; // Fin des champs
  const enregistrer = () => { // Enregistre le formulaire
    effacerErreurs(champs); // Repart sans erreur affichée
    const montant = lireMontant(champs.montant); // Lit le montant (affiche l'erreur de format)
    const dateOperation = estDepense ? datetimeLocalVersIso(champs.dateOperation.lire()) : operation.dateOperation; // Convertit la date
    if (dateOperation === null) champs.dateOperation.afficherErreur("La date et l'heure sont invalides."); // Date illisible
    if (montant === null || dateOperation === null) { afficherToast("Corrigez les champs en rouge.", "erreur"); return Promise.resolve(false); } // Arrête si un champ est illisible
    return soumettre({ champs, action: () => modifierOperation(base, id, { montant, dateOperation, note: champs.note.lire(), compriseDansSolde: champs.compriseDansSolde ? champs.compriseDansSolde.lire() : undefined }), messageSucces: "Opération modifiée.", routeSucces: "/operations" }); // Enregistre
  }; // Fin de enregistrer
  zone.append(carte( // Carte du formulaire
    h("div", { class: "ligne-detail info-formulaire" }, `${estDepense ? "Dépense" : "Allocation"} · ${operation.budgetName}`), // Rappel du type et du budget
    ...Object.values(champs).map((c) => c.element), // Champs
    boutonPrincipal("Enregistrer", enregistrer), // Bouton d'enregistrement
  )); // Fin de la carte
} // Fin de afficherFormulaireOperation
