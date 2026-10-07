import { ouvrirBase } from "./platform/base.js"; // Ouvre la base (SQLite Android ou navigateur)
import { appliquerMigrations } from "./core/db/migrations.js"; // Crée/met à jour les tables
import { installerValeursParDefaut } from "./core/valeurs-par-defaut.js"; // Types et budgets proposés à la première ouverture
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
import { afficherReglageVerrou, demanderDeverrouillage, DELAI_VERROU_MS } from "./ui/ecrans/verrou.js"; // Verrouillage par PIN
import { verrouActif } from "./core/verrou.js"; // Le verrouillage est-il activé ?
import { allocationAutomatique } from "./core/allocation-auto.js"; // Allocation automatique à l'ouverture
import { afficherOperationsUssd, afficherFormulaireOperationUssd, afficherLancerOperationUssd } from "./ui/ecrans/operations-ussd.js"; // Opérations USSD dynamiques
import { h } from "./ui/dom.js"; // Fabrication d'éléments

const racine = document.getElementById("app"); // Zone vide définie dans index.html

// Démarre l'application : ouvre la base, la met à jour, puis lance la navigation.
async function demarrer() { // Fonction asynchrone (la base répond avec un petit délai)
  try { // Tente le démarrage normal
    const base = await ouvrirBase(); // Ouvre la base
    await appliquerMigrations(base); // Applique les migrations en attente
    await installerValeursParDefaut(base); // Première ouverture : types et budgets par défaut (jamais sur une base déjà utilisée)
    if (await verrouActif(base)) await demanderDeverrouillage(base); // Verrouillage par PIN : rien ne s'affiche avant le bon PIN
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
        "/verrou": (zone) => afficherReglageVerrou(zone, { base }), // Verrouillage par PIN
        "/operations-ussd": (zone) => afficherOperationsUssd(zone, { base }), // Liste des opérations USSD
        "/operations-ussd/nouveau": (zone) => afficherFormulaireOperationUssd(zone, { base }), // Création d'une opération USSD
        "/operations-ussd/lancer/:id": (zone, ctx) => afficherLancerOperationUssd(zone, { base, params: ctx.params }), // Lancement d'une opération USSD
        "/operations-ussd/:id": (zone, ctx) => afficherFormulaireOperationUssd(zone, { base, params: ctx.params }), // Modification d'une opération USSD
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
    let allocationEnCours = false; // Vrai pendant l'allocation automatique (évite d'en lancer deux en même temps)
    async function allouerAutomatiquement() { // Allocation automatique des budgets « automatiques » (rattrapage à l'ouverture)
      if (allocationEnCours) return; // Déjà en cours
      allocationEnCours = true; // Marque comme en cours
      try { // Une erreur ne doit jamais gêner l'application
        const bilan = await allocationAutomatique(base); // Crée les allocations manquantes et reporte les reliquats
        if (bilan.faits > 0) afficherToast(`Allocation automatique : ${bilan.faits} budget${bilan.faits > 1 ? "s" : ""} mis à jour.`, "succes", 6000); // Informe
        if (bilan.erreur) afficherToast(`Allocation automatique non faite : ${bilan.erreur}`, "erreur", 10000); // Explique pourquoi (ex. libre insuffisant)
        if (bilan.faits > 0 && ECRANS_LISTE.includes(window.location.hash)) window.dispatchEvent(new HashChangeEvent("hashchange")); // Réaffiche l'écran s'il n'y a pas de formulaire ouvert
      } finally { allocationEnCours = false; } // Libère
    } // Fin de allouerAutomatiquement
    let masqueDepuis = null; // Heure (en ms) à laquelle l'application est passée en arrière-plan
    let verrouOuvert = false; // Vrai pendant que la fenêtre de PIN est affichée
    allouerAutomatiquement(); // Allocation automatique à l'ouverture
    synchroniser(); // Première synchronisation à l'ouverture
    consulterSolde(); // Première consultation à l'ouverture
    setInterval(consulterSolde, 5 * 60 * 1000); // Vérifie toutes les 5 minutes (la consultation n'a lieu que si la dernière date de plus d'une heure)
    document.addEventListener("visibilitychange", async () => { // À chaque passage en arrière-plan ou retour sur l'application
      if (document.visibilityState === "hidden") { masqueDepuis = Date.now(); return; } // Note l'heure du départ
      if (!verrouOuvert && masqueDepuis !== null && Date.now() - masqueDepuis > DELAI_VERROU_MS && (await verrouActif(base))) { // Absent depuis plus d'une minute et verrou activé
        verrouOuvert = true; // Marque la fenêtre comme ouverte
        await demanderDeverrouillage(base); // Redemande le PIN (couvre tout l'écran)
        verrouOuvert = false; // Fenêtre refermée
      } // Fin du verrouillage au retour
      masqueDepuis = null; // Remet à zéro
      allouerAutomatiquement(); synchroniser(); consulterSolde(); // Rattrape allocation, SMS et solde
    }); // Fin de l'écoute
  } catch (erreur) { // En cas de problème au démarrage
    racine.replaceChildren(h("main", { class: "contenu" }, h("section", { class: "carte visible" }, h("h1", { class: "titre" }, "Volako"), h("p", {}, "Erreur au démarrage :"), h("pre", {}, String(erreur?.message ?? erreur))))); // Affiche l'erreur à l'écran (utile sur téléphone, sans console)
  } // Fin du try/catch
} // Fin de demarrer

demarrer(); // Lance le démarrage
