// Écran « Consultation du solde » : code USSD réglable, texte de la réponse attendue (gabarit), choix de la carte SIM et consultation immédiate.
// Le PIN Mobile Money est demandé à chaque consultation, jamais enregistré.
import { h } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonPrincipal, champ, choix } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre, effacerErreurs, appliquerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { ErreurMetier, ErreurValidation } from "../../core/erreurs.js"; // Erreurs expliquées
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { consulterEtEnregistrer, lireCodeSolde, ecrireCodeSolde, reinitialiserCodeSolde, CODE_SOLDE_DEFAUT, lireGabaritSolde, ecrireGabaritSolde, reinitialiserGabaritSolde } from "../../core/ussd-solde.js"; // Logique métier
import { GABARIT_SOLDE_DEFAUT, validerGabaritSolde, analyserReponseUssd } from "../../core/ussd-mm.js"; // Gabarit de la réponse
import { lireSimChoisie, ecrireSimChoisie } from "../../core/sim.js"; // Choix de la carte SIM
import * as ussdPlateforme from "../../platform/ussd.js"; // Accès USSD (téléphone ou simulation)

const REPONSE_EXEMPLE = "Le solde de votre compte est de 202316 AR. Achetez du crédit et bénéficiez de 20% de bonus."; // Réponse d'exemple pour l'essai du gabarit
const VALEUR_DEFAUT_SIM = ""; // Valeur de la liste pour « SIM par défaut du téléphone »

// Texte d'une SIM dans la liste de choix.
const libelleSim = (sim) => `SIM ${sim.emplacement} — ${sim.nom}`; // Ex. « SIM 2 — Telma »

// Dessine l'écran dans la zone.
export async function afficherUssd(zone, { base, ussd = ussdPlateforme }) { // Reçoit la zone, la base et l'accès USSD
  const champs = { // Champs du formulaire
    code: champ({ id: "ussd-code-solde", libelle: "Code USSD de consultation", valeur: await lireCodeSolde(base), inputmode: "text", aide: `Par défaut : ${CODE_SOLDE_DEFAUT} — {pin} est remplacé par le PIN Mobile Money que vous saisissez à chaque consultation.` }), // Code réglable
    gabarit: champ({ id: "ussd-gabarit", libelle: "Texte de la réponse attendue", valeur: await lireGabaritSolde(base), inputmode: "text", aide: "Écrivez la phrase de la réponse de votre opérateur et mettez {solde} à la place du montant. Ex. : solde de votre compte est de {solde} AR" }), // Gabarit de la réponse
    essai: champ({ id: "ussd-essai", libelle: "Réponse d'essai (facultatif)", valeur: REPONSE_EXEMPLE, inputmode: "text", aide: "Collez ici une vraie réponse de votre opérateur pour vérifier que le texte ci-dessus la reconnaît." }), // Réponse d'essai
    pin: champ({ id: "ussd-pin", libelle: "PIN Mobile Money", type: "password", inputmode: "numeric", aide: "Demandé à chaque consultation ; jamais enregistré, ni dans la base, ni dans les sauvegardes." }), // PIN saisi à chaque fois
  }; // Fin des champs
  const enregistrerCode = () => soumettre({ champs: { code: champs.code }, action: () => ecrireCodeSolde(base, champs.code.lire()), messageSucces: "Code enregistré." }); // Enregistre le code
  const retablir = async () => { // Revient au code par défaut
    if (!(await confirmer({ titre: "Rétablir le code par défaut ?", message: CODE_SOLDE_DEFAUT, libelleOk: "Rétablir" }))) return; // Confirmation
    await reinitialiserCodeSolde(base); // Oublie le code personnalisé
    champs.code.ecrire(CODE_SOLDE_DEFAUT); // Réaffiche le code par défaut
    champs.code.effacerErreur(); // Retire une erreur éventuelle
    afficherToast("Code par défaut rétabli.", "succes"); // Confirme
  }; // Fin de retablir
  const enregistrerGabarit = () => soumettre({ champs: { gabarit: champs.gabarit }, action: () => ecrireGabaritSolde(base, champs.gabarit.lire()), messageSucces: "Texte de la réponse enregistré." }); // Enregistre le gabarit
  const retablirGabarit = async () => { // Revient au gabarit par défaut
    if (!(await confirmer({ titre: "Rétablir le texte par défaut ?", message: GABARIT_SOLDE_DEFAUT, libelleOk: "Rétablir" }))) return; // Confirmation
    await reinitialiserGabaritSolde(base); // Oublie le gabarit personnalisé
    champs.gabarit.ecrire(GABARIT_SOLDE_DEFAUT); // Réaffiche le gabarit par défaut
    champs.gabarit.effacerErreur(); // Retire une erreur éventuelle
    afficherToast("Texte par défaut rétabli.", "succes"); // Confirme
  }; // Fin de retablirGabarit
  const essayer = () => { // Essaie le gabarit en cours de frappe sur la réponse d'essai (rien n'est enregistré)
    effacerErreurs({ gabarit: champs.gabarit }); // Repart sans erreur
    try { // Tente la lecture
      const gabarit = validerGabaritSolde(champs.gabarit.lire()); // Vérifie le gabarit
      const solde = analyserReponseUssd(champs.essai.lire(), gabarit); // Lit le solde dans la réponse d'essai
      if (solde === null) afficherToast("Le texte ne correspond pas à cette réponse : aucun solde lu.", "erreur"); // Pas reconnu
      else afficherToast(`Solde lu : ${formaterMontant(solde)}.`, "succes"); // Reconnu
    } catch (erreur) { // Gabarit invalide
      if (erreur instanceof ErreurValidation) appliquerErreurs({ gabarit: champs.gabarit }, erreur.erreurs); // Erreur sous le champ
      else afficherToast(`Erreur : ${erreur?.message ?? erreur}`, "erreur"); // Autre erreur
    } // Fin du try/catch
  }; // Fin de essayer

  // --- Choix de la carte SIM ---
  const zoneSim = h("div", {}); // Zone redessinée quand la liste des SIM change
  const dessinerSim = (sims, choisie) => { // Reçoit les SIM connues et la SIM enregistrée
    const options = [{ valeur: VALEUR_DEFAUT_SIM, libelle: "SIM par défaut du téléphone" }, ...sims.map((s) => ({ valeur: String(s.id), libelle: libelleSim(s) }))]; // Une ligne par SIM + la SIM par défaut
    if (choisie && !sims.some((s) => s.id === choisie.id)) options.push({ valeur: String(choisie.id), libelle: `${libelleSim(choisie)} (à vérifier)` }); // SIM enregistrée mais pas encore relue
    const liste = choix({ id: "ussd-sim", libelle: "Carte SIM utilisée pour les codes USSD", options, valeur: choisie ? String(choisie.id) : VALEUR_DEFAUT_SIM, aide: "Utile si votre téléphone a deux cartes SIM. Si la SIM choisie est retirée, rien n'est envoyé et un message l'explique." }); // Liste de choix
    const detecter = async () => { // Cherche les SIM présentes
      try { // Tente la détection
        if (!(await ussd.demanderPermissionSim())) throw new ErreurMetier("Permission « état du téléphone » refusée : Volako ne peut pas lister les cartes SIM. Autorisez-la dans les paramètres Android de l'application."); // Permission
        dessinerSim(await ussd.listerSim(), await lireSimChoisie(base)); // Redessine avec la liste à jour
        afficherToast("Cartes SIM détectées.", "succes"); // Confirme
      } catch (erreur) { afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur?.message ?? erreur}`, "erreur"); } // Message d'erreur
    }; // Fin de detecter
    const enregistrerSim = async () => { // Enregistre le choix
      try { // Tente l'enregistrement
        const valeur = liste.lire(); // Valeur choisie
        const sim = valeur === VALEUR_DEFAUT_SIM ? null : [...sims, choisie].filter(Boolean).find((s) => String(s.id) === valeur); // SIM correspondante
        await ecrireSimChoisie(base, sim ?? null); // Enregistre (null = SIM par défaut)
        afficherToast(sim ? `${libelleSim(sim)} enregistrée.` : "SIM par défaut du téléphone.", "succes"); // Confirme
      } catch (erreur) { afficherToast(erreur instanceof ErreurValidation ? Object.values(erreur.erreurs)[0] : `Erreur : ${erreur?.message ?? erreur}`, "erreur"); } // Message d'erreur
    }; // Fin de enregistrerSim
    zoneSim.replaceChildren(liste.element, boutonPrincipal("Détecter les cartes SIM", detecter), h("div", { class: "espace-haut" }, boutonPrincipal("Enregistrer la SIM", enregistrerSim))); // Remplace le contenu de la zone
  }; // Fin de dessinerSim
  dessinerSim([], await lireSimChoisie(base)); // Premier dessin : sans détection (aucune permission demandée à l'ouverture)

  const consulter = async () => { // Consulte maintenant
    effacerErreurs(champs); // Repart sans erreur
    try { // Tente la consultation
      if (!(await ussd.demanderPermission())) throw new ErreurMetier("Permission « téléphone » refusée : Volako ne peut pas envoyer le code USSD. Autorisez-la dans les paramètres Android de l'application."); // Permission
      const r = await consulterEtEnregistrer(base, ussd, { pin: champs.pin.lire(), forcer: true }); // Consulte avec le code en vigueur (enregistré, pas celui en cours de frappe)
      afficherToast(`Solde enregistré : ${formaterMontant(r.balance)}.`, "succes"); // Confirme
    } catch (erreur) { // Refus ou erreur
      if (erreur instanceof ErreurValidation) { const orphelins = appliquerErreurs(champs, erreur.erreurs); afficherToast(orphelins[0] ?? "Corrigez le champ en rouge.", "erreur"); } // Erreur sous le champ
      else afficherToast(erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur?.message ?? erreur}`, "erreur"); // Message unique
    } finally { champs.pin.ecrire(""); } // Efface toujours le PIN saisi
  }; // Fin de consulter
  zone.append( // Assemble
    enteteEcran("Consultation du solde", "Mobile Money par USSD", { retour: "/reglages" }), // En-tête
    carte(h("h2", { class: "carte-titre" }, "Code USSD"), champs.code.element, boutonPrincipal("Enregistrer le code", enregistrerCode), h("div", { class: "espace-haut" }, boutonPrincipal("Rétablir le code par défaut", retablir))), // Carte du code
    carte(h("h2", { class: "carte-titre" }, "Réponse de l'opérateur"), champs.gabarit.element, champs.essai.element, boutonPrincipal("Essayer ce texte", essayer), h("div", { class: "espace-haut" }, boutonPrincipal("Enregistrer le texte", enregistrerGabarit)), h("div", { class: "espace-haut" }, boutonPrincipal("Rétablir le texte par défaut", retablirGabarit))), // Carte du gabarit
    carte(h("h2", { class: "carte-titre" }, "Carte SIM"), zoneSim), // Carte du choix de SIM
    carte(h("h2", { class: "carte-titre" }, "Consulter maintenant"), alerte({ niveau: "info", message: "Saisissez votre PIN Mobile Money : il sert à cet envoi seulement et n'est pas gardé. Aucune consultation automatique (elle exigerait de garder le PIN)." }), champs.pin.element, boutonPrincipal("Consulter le solde", consulter)), // Carte de la consultation
  ); // Fin de l'assemblage
} // Fin de afficherUssd
