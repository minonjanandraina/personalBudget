// Écrans des budgets : liste, création, modification, suppression.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonIcone, boutonPrincipal, champ, choix, interrupteur } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre, lireMontant, effacerErreurs } from "../formulaire.js"; // Enregistrement de formulaire et lecture des montants
import { ErreurMetier } from "../../core/erreurs.js"; // Erreur de règle de gestion
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { creerBudget, modifierBudget, supprimerBudget, lireBudget } from "../../core/budgets.js"; // Logique métier des budgets
import { resumeBudgets } from "../../core/allocations.js"; // Solde de la période en cours
import { listerTypesBudget } from "../../core/types-budget.js"; // Types de budget (pour la liste déroulante)

// Une petite case « libellé + montant » de la carte d'un budget.
const info = (libelle, montant) => h("div", { class: "info" }, h("span", { class: "info-libelle" }, libelle), h("strong", {}, formaterMontant(montant))); // Libellé au-dessus, montant en gras

// Liste des budgets.
export async function afficherBudgets(zone, { base }) { // Reçoit la zone et la base
  const resumes = await resumeBudgets(base); // Lit les budgets avec leur solde de la période en cours
  zone.append(enteteEcran("Budgets", "Vos enveloppes mensuelles"), boutonLien("Nouveau budget", "/budgets/nouveau", "ajouter"), h("div", { class: "espace-haut" }, boutonLien("Types de budget", "/types-budget", "types"))); // En-tête et boutons
  if (resumes.length === 0) zone.append(h("div", { class: "espace-haut" }, alerte({ niveau: "info", message: "Aucun budget. Créez d'abord un type de budget, puis votre premier budget." }))); // Message si la liste est vide
  for (const { budget: b, allocation } of resumes) { // Pour chaque budget et son allocation en cours
    const supprimer = async () => { // Action de suppression
      const ok = await confirmer({ titre: "Supprimer ce budget ?", message: `« ${b.name} » sera supprimé définitivement.`, libelleOk: "Supprimer", danger: true }); // Demande confirmation
      if (!ok) return; // Annulé : on s'arrête
      try { // Tente la suppression
        await supprimerBudget(base, b.id); // Supprime (refusé s'il a des allocations)
        afficherToast("Budget supprimé.", "succes"); // Confirme
        vider(zone); // Efface l'écran
        await afficherBudgets(zone, { base }); // Le redessine à jour
      } catch (erreur) { // Si c'est refusé
        afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur.message}`, "erreur"); // Explique pourquoi
      } // Fin du try/catch
    }; // Fin de supprimer
    zone.append(h("div", { class: "carte apparition" }, // Une carte par budget
      h("div", { class: "ligne ligne-sans-carte" }, // En-tête de la carte
        h("div", { class: "ligne-texte" }, h("div", { class: "ligne-titre" }, b.name), h("div", { class: "ligne-detail" }, `${b.typeName}${b.autogenFinMois ? " · automatique" : ""}`)), // Nom, type et mode
        boutonIcone({ nomIcone: "modifier", libelle: `Modifier ${b.name}`, route: `/budgets/${b.id}` }), // Bouton modifier
        boutonIcone({ nomIcone: "supprimer", libelle: `Supprimer ${b.name}`, auClic: supprimer, danger: true }), // Bouton supprimer
      ), // Fin de l'en-tête
      h("div", { class: "infos" }, info("Par mois", b.montantBudget), info("Plafond", b.montantMax), info("Solde min.", b.montantMin), info("Seuil d'alerte", b.soldeAlert)), // Les quatre montants
      h("div", { class: "ligne-detail espace-haut" }, allocation ? `Solde en cours : ${formaterMontant(allocation.solde)}` : "Pas encore alloué sur la période en cours"), // Solde de la période en cours
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de afficherBudgets

// Formulaire de création (sans paramètre) ou de modification (params.id) d'un budget.
export async function afficherFormulaireBudget(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  const id = params.id === undefined ? null : Number(params.id); // Identifiant si on modifie
  const existant = id === null ? null : await lireBudget(base, id); // Budget à modifier (null si création)
  zone.append(enteteEcran(id === null ? "Nouveau budget" : "Modifier le budget", null, { retour: "/budgets" })); // En-tête
  if (id !== null && !existant) { // Budget introuvable
    zone.append(alerte({ niveau: "danger", message: "Ce budget n'existe plus." })); // Message
    return; // Rien d'autre à afficher
  } // Fin du cas introuvable
  const types = await listerTypesBudget(base); // Types disponibles
  if (types.length === 0) { // Aucun type : impossible de créer un budget
    zone.append(alerte({ niveau: "attention", message: "Créez d'abord un type de budget." }), h("div", { class: "espace-haut" }, boutonLien("Créer un type de budget", "/types-budget/nouveau", "ajouter"))); // Explication et raccourci
    return; // Rien d'autre à afficher
  } // Fin du cas sans type
  const v = existant ?? { name: "", typeId: "", montantBudget: "", montantMax: "", montantMin: 0, soldeAlert: 0, autogenFinMois: false }; // Valeurs de départ
  const champs = { // Champs du formulaire
    name: champ({ id: "budget-nom", libelle: "Nom du budget", valeur: v.name, aide: "Ex. : écolage, frais scolaires, loisirs" }), // Nom
    typeId: choix({ id: "budget-type", libelle: "Type", valeur: v.typeId, options: [{ valeur: "", libelle: "— Choisir —" }, ...types.map((t) => ({ valeur: t.id, libelle: t.name }))] }), // Type
    montantBudget: champ({ id: "budget-mensuel", libelle: "Montant par mois (Ar)", valeur: String(v.montantBudget), inputmode: "numeric", aide: "Montant alloué chaque mois" }), // Montant mensuel
    montantMax: champ({ id: "budget-max", libelle: "Plafond (Ar)", valeur: String(v.montantMax), inputmode: "numeric", aide: "Le solde du budget ne devrait pas dépasser ce montant" }), // Plafond
    montantMin: champ({ id: "budget-min", libelle: "Solde minimal après allocation (Ar)", valeur: String(v.montantMin), inputmode: "numeric", aide: "Une allocation est refusée si le solde du budget resterait en dessous" }), // Minimum
    soldeAlert: champ({ id: "budget-alerte", libelle: "Seuil d'alerte (Ar)", valeur: String(v.soldeAlert), inputmode: "numeric", aide: "Alerte quand le solde du budget passe sous ce montant" }), // Seuil d'alerte
    autogenFinMois: interrupteur({ id: "budget-auto", libelle: "Allocation automatique", valeur: v.autogenFinMois, aide: "Le budget est alloué automatiquement chaque mois" }), // Allocation automatique
  }; // Fin des champs
  const enregistrer = () => { // Enregistre le formulaire
    effacerErreurs(champs); // Repart sans erreur affichée (la lecture des montants peut en ajouter)
    const montants = { montantBudget: lireMontant(champs.montantBudget), montantMax: lireMontant(champs.montantMax), montantMin: lireMontant(champs.montantMin), soldeAlert: lireMontant(champs.soldeAlert) }; // Lit les 4 montants (affiche les erreurs de format)
    if (Object.values(montants).some((m) => m === null)) { afficherToast("Corrigez les champs en rouge.", "erreur"); return Promise.resolve(false); } // Arrête si un montant est illisible
    const donnees = { name: champs.name.lire(), typeId: Number(champs.typeId.lire()) || null, ...montants, autogenFinMois: champs.autogenFinMois.lire() }; // Rassemble les données
    return soumettre({ // Enregistre
      champs, // Champs à surveiller
      action: () => (id === null ? creerBudget(base, donnees) : modifierBudget(base, id, donnees)), // Création ou modification
      messageSucces: id === null ? "Budget créé." : "Budget modifié.", // Message de succès
      routeSucces: "/budgets", // Retour à la liste
    }); // Fin de l'enregistrement
  }; // Fin de enregistrer
  zone.append(carte(...Object.values(champs).map((c) => c.element), boutonPrincipal("Enregistrer", enregistrer))); // Carte du formulaire
} // Fin de afficherFormulaireBudget
