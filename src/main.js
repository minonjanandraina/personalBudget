import { ouvrirBase } from "./platform/base.js"; // Ouvre la base (SQLite Android ou navigateur)
import { appliquerMigrations } from "./core/db/migrations.js"; // Crée/met à jour les tables
import { construireCoque } from "./ui/coque.js"; // Zone de contenu + barre d'onglets
import { creerRouteur } from "./ui/routeur.js"; // Affichage de l'écran selon l'adresse
import { calculerAlertes } from "./core/alertes.js"; // Alertes (pour le badge)
import { afficherAccueil } from "./ui/ecrans/accueil.js"; // Écran d'accueil
import { afficherReglages } from "./ui/ecrans/reglages.js"; // Écran des réglages
import { afficherDiagnostic } from "./ui/ecrans/diagnostic.js"; // Écran de diagnostic
import { afficherSauvegarde } from "./ui/ecrans/sauvegarde.js"; // Écran de sauvegarde et restauration
import { afficherTypes, afficherFormulaireType } from "./ui/ecrans/types-budget.js"; // Écrans des types de budget
import { afficherBudgets, afficherFormulaireBudget } from "./ui/ecrans/budgets.js"; // Écrans des budgets
import { afficherSoldes, afficherFormulaireSolde } from "./ui/ecrans/solde.js"; // Écrans du solde OM
import { afficherAllocations, afficherFormulaireAllocation, afficherFormulaireTransfert } from "./ui/ecrans/allocations.js"; // Écrans des allocations
import { afficherOperations, afficherFormulaireDepense, afficherFormulaireOperation } from "./ui/ecrans/operations.js"; // Écrans des opérations
import { afficherSms, afficherFormulaireClasser, synchroniserAuDemarrage } from "./ui/ecrans/sms.js"; // Écrans des SMS Orange Money
import { afficherUssd } from "./ui/ecrans/ussd.js"; // Écran de consultation du solde par USSD
import { consultationAutomatique } from "./core/ussd-solde.js"; // Consultation automatique du solde
import * as ussd from "./platform/ussd.js"; // Accès USSD (téléphone ou simulation)
import { afficherToast } from "./ui/messages.js"; // Notifications
import { h } from "./ui/dom.js"; // Fabrication d'éléments

const racine = document.getElementById("app"); // Zone vide définie dans index.html

// Démarre l'application : ouvre la base, la met à jour, puis lance la navigation.
async function demarrer() { // Fonction asynchrone (la base répond avec un petit délai)
  try { // Tente le démarrage normal
    const base = await ouvrirBase(); // Ouvre la base
    await appliquerMigrations(base); // Applique les migrations en attente
    const { contenu, marquerActif, definirBadge } = construireCoque(racine); // Construit la coque (contenu + barre d'onglets)
    const routeur = creerRouteur({ // Crée le routeur
      conteneur: contenu, // Zone où les écrans s'affichent
      parDefaut: "/", // Écran affiché si l'adresse est inconnue
      auChangement: async (chemin) => { // À chaque changement d'écran
        marquerActif(chemin); // Met à jour l'onglet actif
        try { definirBadge("/", (await calculerAlertes(base)).length); } catch { /* le badge est facultatif : une erreur ne doit pas gêner l'affichage */ } // Met à jour le nombre d'alertes sur l'onglet Accueil
      }, // Fin du rappel
      routes: { // Liste des écrans
        "/": (zone) => afficherAccueil(zone, { base }), // Accueil
        "/budgets": (zone) => afficherBudgets(zone, { base }), // Liste des budgets
        "/budgets/nouveau": (zone) => afficherFormulaireBudget(zone, { base }), // Création d'un budget
        "/budgets/:id": (zone, ctx) => afficherFormulaireBudget(zone, { base, params: ctx.params }), // Modification d'un budget
        "/allocations": (zone) => afficherAllocations(zone, { base }), // Situation des budgets sur la période
        "/allocations/nouveau": (zone) => afficherFormulaireAllocation(zone, { base }), // Allocation d'un budget
        "/allocations/nouveau/:budgetId": (zone, ctx) => afficherFormulaireAllocation(zone, { base, params: ctx.params }), // Allocation d'un budget présélectionné
        "/allocations/transfert": (zone) => afficherFormulaireTransfert(zone, { base }), // Transfert entre budgets
        "/allocations/transfert/:sourceId": (zone, ctx) => afficherFormulaireTransfert(zone, { base, params: ctx.params }), // Transfert depuis un budget présélectionné
        "/operations": (zone) => afficherOperations(zone, { base }), // Liste des opérations
        "/operations/depense": (zone) => afficherFormulaireDepense(zone, { base }), // Saisie d'une dépense
        "/operations/:id": (zone, ctx) => afficherFormulaireOperation(zone, { base, params: ctx.params }), // Modification d'une opération
        "/types-budget": (zone) => afficherTypes(zone, { base }), // Liste des types
        "/types-budget/nouveau": (zone) => afficherFormulaireType(zone, { base }), // Création d'un type
        "/types-budget/:id": (zone, ctx) => afficherFormulaireType(zone, { base, params: ctx.params }), // Modification d'un type
        "/solde": (zone) => afficherSoldes(zone, { base }), // Historique des soldes
        "/solde/nouveau": (zone) => afficherFormulaireSolde(zone, { base }), // Saisie d'un solde
        "/reglages": (zone) => afficherReglages(zone, { base }), // Réglages
        "/diagnostic": (zone) => afficherDiagnostic(zone, { base }), // Diagnostic
        "/sauvegarde": (zone) => afficherSauvegarde(zone, { base }), // Sauvegarde et restauration
        "/ussd": (zone) => afficherUssd(zone, { base }), // Consultation du solde par USSD
        "/sms": (zone) => afficherSms(zone, { base }), // SMS Orange Money
        "/sms/classer/:id": (zone, ctx) => afficherFormulaireClasser(zone, { base, params: ctx.params }), // Classement d'une dépense SMS
      }, // Fin des écrans
    }); // Fin du routeur
    await routeur.demarrer(); // Affiche le premier écran
    const ECRANS_LISTE = ["", "#/", "#/sms", "#/operations", "#/solde", "#/allocations", "#/budgets"]; // Écrans sans formulaire : on peut les réafficher sans perdre une saisie
    let synchroEnCours = false; // Vrai pendant une synchronisation (évite d'en lancer deux en même temps)
    let derniereSynchro = 0; // Heure (en ms) de la dernière synchronisation
    async function synchroniser() { // Importe les nouveaux SMS (téléphone seulement, si la permission est déjà accordée)
      if (synchroEnCours || Date.now() - derniereSynchro < 30000) return; // Déjà en cours, ou faite il y a moins de 30 secondes
      synchroEnCours = true; // Marque comme en cours
      try { // Une erreur ne doit jamais gêner l'application
        const bilan = await synchroniserAuDemarrage(base); // Lit et importe les SMS
        if (bilan && bilan.importes > 0 && ECRANS_LISTE.includes(window.location.hash)) window.dispatchEvent(new HashChangeEvent("hashchange")); // Réaffiche l'écran s'il n'y a pas de formulaire ouvert
      } finally { synchroEnCours = false; derniereSynchro = Date.now(); } // Libère et note l'heure
    } // Fin de synchroniser
    let ussdEnCours = false; // Vrai pendant une consultation USSD (évite d'en lancer deux en même temps)
    async function consulterSolde() { // Consultation automatique du solde (réponses de l'arrière-plan + consultation horaire)
      if (ussdEnCours) return; // Déjà en cours
      ussdEnCours = true; // Marque comme en cours
      try { // Une erreur ne doit jamais gêner l'application
        const bilan = await consultationAutomatique(base, ussd); // Importe et consulte si nécessaire
        if (bilan.arret) afficherToast(bilan.arret, "erreur", 10000); // Consultation arrêtée en arrière-plan : prévient
        if (bilan.erreur) afficherToast(bilan.erreur, "erreur", 10000); // Erreur de la consultation (réponse inattendue…)
        if (bilan.importes > 0 && ECRANS_LISTE.includes(window.location.hash)) window.dispatchEvent(new HashChangeEvent("hashchange")); // Réaffiche l'écran s'il n'y a pas de formulaire ouvert
      } finally { ussdEnCours = false; } // Libère
    } // Fin de consulterSolde
    synchroniser(); // Première synchronisation à l'ouverture
    consulterSolde(); // Première consultation à l'ouverture
    setInterval(consulterSolde, 5 * 60 * 1000); // Vérifie toutes les 5 minutes (la consultation n'a lieu que si la dernière date de plus d'une heure)
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { synchroniser(); consulterSolde(); } }); // Et à chaque retour sur l'application (après passage en arrière-plan)
  } catch (erreur) { // En cas de problème au démarrage
    racine.replaceChildren(h("main", { class: "contenu" }, h("section", { class: "carte visible" }, h("h1", { class: "titre" }, "Volako"), h("p", {}, "Erreur au démarrage :"), h("pre", {}, String(erreur?.message ?? erreur))))); // Affiche l'erreur à l'écran (utile sur téléphone, sans console)
  } // Fin du try/catch
} // Fin de demarrer

demarrer(); // Lance le démarrage
