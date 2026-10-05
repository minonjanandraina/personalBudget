// Écrans des allocations : situation des budgets, lancement de la période, allocation manuelle et transferts.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonPrincipal, champ, choix } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre, lireMontant, effacerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { periodePour } from "../../core/periodes.js"; // Calcul de la période en cours
import { lireJourJob } from "../../core/parametres.js"; // Jour de lancement
import { allouerBudget, resumeBudgets, libellePeriode } from "../../core/allocations.js"; // Logique métier
import { lancerAllocationPeriode, transfererEntreBudgets } from "../../core/reallocation.js"; // Report et transferts
import { situationFinanciere } from "../../core/soldes.js"; // Solde OM disponible et libre à allouer
import { ErreurMetier } from "../../core/erreurs.js"; // Erreur de règle de gestion

// Une petite case « libellé + valeur » de la carte d'un budget.
const info = (libelle, valeur) => h("div", { class: "info" }, h("span", { class: "info-libelle" }, libelle), h("strong", {}, valeur)); // Libellé au-dessus, valeur en gras

// Phrase qui décrit ce qui s'est passé pour un budget lors du lancement de la période.
export function decrireResultat(r) { // Reçoit le résultat d'un budget
  const solde = Number.isInteger(r.soldeApres) ? ` → solde ${formaterMontant(r.soldeApres)}` : ""; // Solde final, s'il est connu
  switch (r.statut) { // Selon le résultat
    case "alloue": return `Alloué ${formaterMontant(r.montantAlloue)}${r.reliquatReporte > 0 ? ` + reliquat reporté ${formaterMontant(r.reliquatReporte)}` : ""}${solde}`; // Allocation (avec ou sans report)
    case "reporte": return `Reliquat reporté ${formaterMontant(r.reliquatReporte)}${solde}`; // Report seul
    case "deja": return "Déjà à jour, rien à faire"; // Rien à faire
    default: return r.raison ?? "Non traité"; // Refusé, ignoré ou erreur : la raison
  } // Fin du choix
} // Fin de decrireResultat

// Situation de chaque budget pour la période en cours. « resultat » (facultatif) = résultat du dernier lancement.
export async function afficherAllocations(zone, { base, resultat = null }) { // Reçoit la zone, la base et le dernier résultat
  const periode = periodePour(await lireJourJob(base)); // Période en cours
  const resumes = await resumeBudgets(base); // Situation de chaque budget
  const situation = await situationFinanciere(base); // Solde OM disponible et libre à allouer
  const lancer = async () => { // Lance l'allocation de la période
    const ok = await confirmer({ titre: "Lancer l'allocation ?", message: `Tous les budgets seront alloués pour la période ${libellePeriode(periode)}, et les reliquats des périodes précédentes seront reportés.`, libelleOk: "Lancer" }); // Demande confirmation
    if (!ok) return; // Annulé : on s'arrête
    try { // Tente le lancement
      const lancement = await lancerAllocationPeriode(base); // Alloue et reporte (sans danger si déjà fait)
      const faits = lancement.resultats.filter((r) => r.statut === "alloue" || r.statut === "reporte").length; // Nombre de budgets modifiés
      afficherToast(faits > 0 ? `${faits} budget(s) mis à jour.` : "Rien à faire : tout est déjà à jour.", faits > 0 ? "succes" : "info"); // Résumé
      if (lancement.resultats.some((r) => r.depassePlafond)) afficherToast("Attention : au moins un budget dépasse son plafond. Une réallocation manuelle est nécessaire.", "info"); // Signale les plafonds dépassés
      vider(zone); // Efface l'écran
      await afficherAllocations(zone, { base, resultat: lancement }); // Le redessine avec le détail
    } catch (erreur) { // Erreur inattendue
      afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur.message}`, "erreur"); // Affiche la cause (message complet pour une règle de gestion)
    } // Fin du try/catch
  }; // Fin de lancer
  zone.append(enteteEcran("Allocations", `Période en cours : ${libellePeriode(periode)}`, { retour: "/budgets" }), boutonPrincipal("Lancer l'allocation de la période", lancer), h("div", { class: "espace-haut" }, boutonLien("Allouer un budget", "/allocations/nouveau", "ajouter")), h("div", { class: "espace-haut" }, boutonLien("Transférer entre budgets", "/allocations/transfert", "transactions")), situation.om === null ? h("div", { class: "espace-haut" }, alerte({ niveau: "attention", message: "Aucun solde Orange Money saisi : impossible d'allouer." }), h("div", { class: "espace-haut" }, boutonLien("Saisir le solde OM", "/solde/nouveau", "telephone"))) : h("div", { class: "ligne-detail espace-haut" }, `Libre à allouer : ${formaterMontant(Math.max(situation.libre, 0))} (solde OM disponible ${formaterMontant(situation.om.disponible)} − réservé ${formaterMontant(situation.reserve)})`)); // En-tête, boutons et solde libre
  if (resultat) zone.append(h("div", { class: "espace-haut" }, carte(h("h2", { class: "carte-titre" }, "Détail du lancement"), h("ul", { class: "liste-diagnostic" }, ...resultat.resultats.map((r) => h("li", {}, `${r.nom} : ${decrireResultat(r)}`)))))); // Détail du dernier lancement
  if (resumes.length === 0) zone.append(h("div", { class: "espace-haut" }, alerte({ niveau: "info", message: "Aucun budget. Créez d'abord un budget." }), h("div", { class: "espace-haut" }, boutonLien("Créer un budget", "/budgets/nouveau", "budgets")))); // Aucun budget : explication et raccourci
  for (const r of resumes) { // Pour chaque budget
    const a = r.allocation; // Son allocation en cours
    const excedent = a ? a.solde - r.budget.montantMax : 0; // Montant au-dessus du plafond
    zone.append(h("div", { class: "carte apparition" }, // Une carte par budget
      h("div", { class: "ligne ligne-sans-carte" }, h("div", { class: "ligne-texte" }, h("div", { class: "ligne-titre" }, r.budget.name), h("div", { class: "ligne-detail" }, r.budget.typeName))), // Nom et type
      a // Détail selon qu'une allocation existe ou non
        ? [h("div", { class: "infos" }, info("Alloué", formaterMontant(a.alimente)), info("Dépensé", formaterMontant(a.depense)), info("Solde", formaterMontant(a.solde)), a.sorties > 0 ? info("Transféré", formaterMontant(a.sorties)) : info("Seuil d'alerte", formaterMontant(r.budget.soldeAlert))), // Montants de la période
            r.depassePlafond ? h("div", { class: "espace-haut" }, alerte({ niveau: "attention", message: `Le solde dépasse le plafond (${formaterMontant(r.budget.montantMax)}) de ${formaterMontant(excedent)} : une réallocation manuelle est nécessaire.` }), h("div", { class: "espace-haut" }, boutonLien("Transférer l'excédent", `/allocations/transfert/${r.budget.id}`, "transactions"))) : null, // Plafond dépassé avec raccourci de transfert
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
  const situation = await situationFinanciere(base); // Solde OM disponible et libre à allouer
  if (situation.om === null) { // Sans solde OM, aucune allocation n'est possible
    zone.append(alerte({ niveau: "attention", message: "Saisissez d'abord le solde de votre compte Orange Money avant d'allouer un budget." }), h("div", { class: "espace-haut" }, boutonLien("Saisir le solde OM", "/solde/nouveau", "telephone"))); // Explication et raccourci
    return; // Rien d'autre à afficher
  } // Fin du cas sans solde
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
    if (!r) { details.textContent = `Période : ${libellePeriode(periode)} · Libre à allouer : ${formaterMontant(Math.max(situation.libre, 0))}`; return; } // Aucun budget choisi
    champs.montant.ecrire(String(r.budget.montantBudget)); // Propose le montant mensuel du budget
    const solde = r.allocation ? formaterMontant(r.allocation.solde) : "aucune allocation"; // Solde actuel de la période
    details.textContent = `Période : ${libellePeriode(periode)} · Solde actuel : ${solde} · Minimum après allocation : ${formaterMontant(r.budget.montantMin)} · Libre à allouer : ${formaterMontant(Math.max(situation.libre, 0))}`; // Informations utiles
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

// Formulaire de transfert entre deux budgets pour la période en cours (params.sourceId présélectionne la source).
export async function afficherFormulaireTransfert(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  zone.append(enteteEcran("Transférer entre budgets", "Réallocation manuelle de la période en cours", { retour: "/allocations" })); // En-tête
  const resumes = await resumeBudgets(base); // Situation de chaque budget
  if (resumes.length < 2) { // Il faut au moins deux budgets
    zone.append(alerte({ niveau: "attention", message: "Il faut au moins deux budgets pour faire un transfert." }), h("div", { class: "espace-haut" }, boutonLien("Créer un budget", "/budgets/nouveau", "budgets"))); // Explication et raccourci
    return; // Rien d'autre à afficher
  } // Fin du cas sans assez de budgets
  const parId = new Map(resumes.map((r) => [String(r.budget.id), r])); // Index des budgets par identifiant
  const initial = parId.has(String(params.sourceId)) ? String(params.sourceId) : ""; // Source présélectionnée
  const libelle = (r) => `${r.budget.name} — ${r.allocation ? `solde ${formaterMontant(r.allocation.solde)}` : "non alloué"}`; // Texte d'une option : nom et solde
  const champs = { // Champs du formulaire
    sourceId: choix({ id: "tr-source", libelle: "Retirer de", valeur: initial, options: [{ valeur: "", libelle: "— Choisir —" }, ...resumes.map((r) => ({ valeur: r.budget.id, libelle: libelle(r) }))] }), // Budget source
    destinationId: choix({ id: "tr-destination", libelle: "Ajouter à", options: [{ valeur: "", libelle: "— Choisir —" }, ...resumes.map((r) => ({ valeur: r.budget.id, libelle: libelle(r) }))] }), // Budget destination
    montant: champ({ id: "tr-montant", libelle: "Montant (Ar)", inputmode: "numeric" }), // Montant
    note: champ({ id: "tr-note", libelle: "Note (facultative)", aide: "80 caractères au plus" }), // Note
  }; // Fin des champs
  const proposer = () => { // Propose l'excédent du plafond comme montant quand la source le dépasse
    const r = parId.get(champs.sourceId.lire()); // Source choisie
    if (r?.allocation && r.depassePlafond) champs.montant.ecrire(String(r.allocation.solde - r.budget.montantMax)); // Excédent au-dessus du plafond
  }; // Fin de proposer
  proposer(); // Propose au départ si la source est présélectionnée
  champs.sourceId.element.querySelector("select").addEventListener("change", proposer); // Et à chaque changement de source
  const enregistrer = () => { // Enregistre le formulaire
    effacerErreurs(champs); // Repart sans erreur affichée
    const montant = lireMontant(champs.montant); // Lit le montant (affiche l'erreur de format)
    if (montant === null) { afficherToast("Corrigez les champs en rouge.", "erreur"); return Promise.resolve(false); } // Arrête si le montant est illisible
    return soumettre({ // Enregistre
      champs, // Champs à surveiller
      action: async () => { // Lance le transfert
        const r = await transfererEntreBudgets(base, { sourceId: Number(champs.sourceId.lire()) || null, destinationId: Number(champs.destinationId.lire()) || null, montant, note: champs.note.lire() }); // Transfère
        if (r.depassePlafond) afficherToast("Attention : le budget crédité dépasse maintenant son plafond.", "info"); // Signale un plafond dépassé
      }, // Fin de l'action
      messageSucces: "Transfert effectué.", // Message de succès
      routeSucces: "/allocations", // Retour à la situation des budgets
    }); // Fin de l'enregistrement
  }; // Fin de enregistrer
  zone.append(carte(champs.sourceId.element, champs.destinationId.element, champs.montant.element, champs.note.element, boutonPrincipal("Transférer", enregistrer))); // Carte du formulaire
} // Fin de afficherFormulaireTransfert
