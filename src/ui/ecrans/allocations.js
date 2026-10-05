// Écrans des allocations : situation de chaque budget sur la période en cours, et formulaire d'allocation.
import { h } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonPrincipal, champ, choix } from "../composants.js"; // Composants
import { afficherToast } from "../messages.js"; // Notifications
import { soumettre, lireMontant, effacerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { periodePour } from "../../core/periodes.js"; // Calcul de la période en cours
import { lireJourJob } from "../../core/parametres.js"; // Jour de lancement
import { allouerBudget, resumeBudgets, libellePeriode } from "../../core/allocations.js"; // Logique métier

// Une petite case « libellé + valeur » de la carte d'un budget.
const info = (libelle, valeur) => h("div", { class: "info" }, h("span", { class: "info-libelle" }, libelle), h("strong", {}, valeur)); // Libellé au-dessus, valeur en gras

// Situation de chaque budget pour la période en cours.
export async function afficherAllocations(zone, { base }) { // Reçoit la zone et la base
  const periode = periodePour(await lireJourJob(base)); // Période en cours
  const resumes = await resumeBudgets(base); // Situation de chaque budget
  zone.append(enteteEcran("Allocations", `Période en cours : ${libellePeriode(periode)}`, { retour: "/budgets" }), boutonLien("Allouer un budget", "/allocations/nouveau", "ajouter")); // En-tête et bouton d'allocation
  if (resumes.length === 0) zone.append(h("div", { class: "espace-haut" }, alerte({ niveau: "info", message: "Aucun budget. Créez d'abord un budget." }), h("div", { class: "espace-haut" }, boutonLien("Créer un budget", "/budgets/nouveau", "budgets")))); // Aucun budget : explication et raccourci
  for (const r of resumes) { // Pour chaque budget
    const a = r.allocation; // Son allocation en cours
    zone.append(h("div", { class: "carte apparition" }, // Une carte par budget
      h("div", { class: "ligne ligne-sans-carte" }, h("div", { class: "ligne-texte" }, h("div", { class: "ligne-titre" }, r.budget.name), h("div", { class: "ligne-detail" }, r.budget.typeName))), // Nom et type
      a // Détail selon qu'une allocation existe ou non
        ? [h("div", { class: "infos" }, info("Alloué", formaterMontant(a.alimente)), info("Dépensé", formaterMontant(a.depense)), info("Solde", formaterMontant(a.solde)), info("Seuil d'alerte", formaterMontant(r.budget.soldeAlert))), // Montants de la période
            r.depassePlafond ? h("div", { class: "espace-haut" }, alerte({ niveau: "attention", message: `Le solde dépasse le plafond de ${formaterMontant(r.budget.montantMax)} : une réallocation manuelle est nécessaire.` })) : null, // Plafond dépassé
            r.sousSeuil ? h("div", { class: "espace-haut" }, alerte({ niveau: "danger", message: "Le solde est sous le seuil d'alerte." })) : null, // Sous le seuil
            h("div", { class: "espace-haut" }, boutonLien("Allouer de nouveau", `/allocations/nouveau/${r.budget.id}`, "ajouter"))] // Compléter l'allocation
        : [h("div", { class: "ligne-detail" }, "Pas encore alloué sur cette période."), h("div", { class: "espace-haut" }, boutonLien("Allouer ce budget", `/allocations/nouveau/${r.budget.id}`, "ajouter"))], // Proposer d'allouer
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de afficherAllocations

// Formulaire d'allocation d'un budget pour la période en cours (params.budgetId présélectionne le budget).
export async function afficherFormulaireAllocation(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  zone.append(enteteEcran("Allouer un budget", null, { retour: "/allocations" })); // En-tête
  const resumes = await resumeBudgets(base); // Situation de chaque budget
  if (resumes.length === 0) { // Aucun budget : rien à allouer
    zone.append(alerte({ niveau: "attention", message: "Créez d'abord un budget." }), h("div", { class: "espace-haut" }, boutonLien("Créer un budget", "/budgets/nouveau", "budgets"))); // Explication et raccourci
    return; // Rien d'autre à afficher
  } // Fin du cas sans budget
  const periode = periodePour(await lireJourJob(base)); // Période en cours
  const parId = new Map(resumes.map((r) => [String(r.budget.id), r])); // Index des budgets par identifiant
  const initial = parId.has(String(params.budgetId)) ? String(params.budgetId) : ""; // Budget présélectionné
  const champs = { // Champs du formulaire
    budgetId: choix({ id: "alloc-budget", libelle: "Budget", valeur: initial, options: [{ valeur: "", libelle: "— Choisir —" }, ...resumes.map((r) => ({ valeur: r.budget.id, libelle: r.budget.name }))] }), // Budget
    montant: champ({ id: "alloc-montant", libelle: "Montant à allouer (Ar)", inputmode: "numeric" }), // Montant
    note: champ({ id: "alloc-note", libelle: "Note (facultative)" }), // Note
  }; // Fin des champs
  const details = h("div", { class: "champ-aide info-formulaire" }); // Zone d'information sous le formulaire
  const majDetails = () => { // Met à jour le montant proposé et les informations selon le budget choisi
    const r = parId.get(champs.budgetId.lire()); // Budget choisi
    if (!r) { details.textContent = `Période : ${libellePeriode(periode)}`; return; } // Aucun budget choisi
    champs.montant.ecrire(String(r.budget.montantBudget)); // Propose le montant mensuel du budget
    const solde = r.allocation ? formaterMontant(r.allocation.solde) : "aucune allocation"; // Solde actuel de la période
    details.textContent = `Période : ${libellePeriode(periode)} · Solde actuel : ${solde} · Minimum après allocation : ${formaterMontant(r.budget.montantMin)}`; // Informations utiles
  }; // Fin de majDetails
  majDetails(); // Remplit les informations au départ
  champs.budgetId.element.querySelector("select").addEventListener("change", majDetails); // Les met à jour à chaque changement de budget
  const enregistrer = () => { // Enregistre le formulaire
    effacerErreurs(champs); // Repart sans erreur affichée
    const montant = lireMontant(champs.montant); // Lit le montant (affiche l'erreur de format)
    if (montant === null) { afficherToast("Corrigez les champs en rouge.", "erreur"); return Promise.resolve(false); } // Arrête si le montant est illisible
    return soumettre({ // Enregistre
      champs, // Champs à surveiller
      action: async () => { // Lance l'allocation
        const r = await allouerBudget(base, { budgetId: Number(champs.budgetId.lire()) || null, montant, note: champs.note.lire() }); // Alloue
        if (r.depassePlafond) afficherToast("Attention : le solde dépasse le plafond du budget. Une réallocation manuelle sera nécessaire.", "info"); // Signale un plafond dépassé
      }, // Fin de l'action
      messageSucces: "Budget alloué.", // Message de succès
      routeSucces: "/allocations", // Retour à la situation des budgets
    }); // Fin de l'enregistrement
  }; // Fin de enregistrer
  zone.append(carte(champs.budgetId.element, champs.montant.element, details, champs.note.element, boutonPrincipal("Allouer", enregistrer))); // Carte du formulaire
} // Fin de afficherFormulaireAllocation
