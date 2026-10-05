// Écrans des types de budget : liste, création, modification, suppression.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonIcone, boutonPrincipal, champ } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre } from "../formulaire.js"; // Enregistrement de formulaire
import { ErreurMetier } from "../../core/erreurs.js"; // Erreur de règle de gestion
import { creerTypeBudget, modifierTypeBudget, supprimerTypeBudget, listerTypesAvecCompte, lireTypeBudget } from "../../core/types-budget.js"; // Logique métier

// Liste des types de budget.
export async function afficherTypes(zone, { base }) { // Reçoit la zone et la base
  const types = await listerTypesAvecCompte(base); // Lit les types avec leur nombre de budgets
  zone.append(enteteEcran("Types de budget", "Catégories de vos budgets", { retour: "/budgets" }), boutonLien("Nouveau type", "/types-budget/nouveau", "ajouter")); // En-tête et bouton d'ajout
  if (types.length === 0) zone.append(h("div", { class: "espace-haut" }, alerte({ niveau: "info", message: "Aucun type de budget. Créez le premier." }))); // Message si la liste est vide
  for (const t of types) { // Pour chaque type
    const supprimer = async () => { // Action de suppression
      const ok = await confirmer({ titre: "Supprimer ce type ?", message: `« ${t.name} » sera supprimé définitivement.`, libelleOk: "Supprimer", danger: true }); // Demande confirmation
      if (!ok) return; // Annulé : on s'arrête
      try { // Tente la suppression
        await supprimerTypeBudget(base, t.id); // Supprime (refusé si utilisé)
        afficherToast("Type de budget supprimé.", "succes"); // Confirme
        vider(zone); // Efface l'écran
        await afficherTypes(zone, { base }); // Le redessine à jour
      } catch (erreur) { // Si c'est refusé
        afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur.message}`, "erreur"); // Explique pourquoi
      } // Fin du try/catch
    }; // Fin de supprimer
    zone.append(h("div", { class: "carte ligne apparition" }, // Une carte par type
      h("div", { class: "ligne-texte" }, h("div", { class: "ligne-titre" }, t.name), h("div", { class: "ligne-detail" }, `${t.code} · ${t.nbBudgets} budget(s)`)), // Nom, code et nombre de budgets
      boutonIcone({ nomIcone: "modifier", libelle: `Modifier ${t.name}`, route: `/types-budget/${t.id}` }), // Bouton modifier
      boutonIcone({ nomIcone: "supprimer", libelle: `Supprimer ${t.name}`, auClic: supprimer, danger: true }), // Bouton supprimer
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de afficherTypes

// Formulaire de création (sans paramètre) ou de modification (params.id) d'un type.
export async function afficherFormulaireType(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  const id = params.id === undefined ? null : Number(params.id); // Identifiant si on modifie
  const existant = id === null ? null : await lireTypeBudget(base, id); // Type à modifier (null si création)
  zone.append(enteteEcran(id === null ? "Nouveau type" : "Modifier le type", null, { retour: "/types-budget" })); // En-tête
  if (id !== null && !existant) { // Type introuvable
    zone.append(alerte({ niveau: "danger", message: "Ce type de budget n'existe plus." })); // Message
    return; // Rien d'autre à afficher
  } // Fin du cas introuvable
  const champs = { name: champ({ id: "type-nom", libelle: "Nom du type", valeur: existant?.name ?? "", aide: existant ? `Code : ${existant.code} (ne change jamais)` : "Le code bdg-001, bdg-002… est attribué automatiquement." }) }; // Champ du nom
  const enregistrer = () => soumettre({ // Enregistre le formulaire
    champs, // Champs à surveiller
    action: () => (id === null ? creerTypeBudget(base, { name: champs.name.lire() }) : modifierTypeBudget(base, id, { name: champs.name.lire() })), // Création ou modification
    messageSucces: id === null ? "Type de budget créé." : "Type de budget modifié.", // Message de succès
    routeSucces: "/types-budget", // Retour à la liste
  }); // Fin de l'enregistrement
  zone.append(carte(champs.name.element, boutonPrincipal("Enregistrer", enregistrer))); // Carte du formulaire
} // Fin de afficherFormulaireType
