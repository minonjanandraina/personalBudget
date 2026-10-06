// Verrouillage par PIN : fenêtre de déverrouillage (au démarrage et au retour sur l'application) et écran de réglage.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonPrincipal, champ } from "../composants.js"; // Composants
import { afficherToast } from "../messages.js"; // Notifications
import { ErreurMetier, ErreurValidation } from "../../core/erreurs.js"; // Erreurs expliquées
import { verrouActif, verifierPin, activerVerrou, changerPin, desactiverVerrou, regenererCodeSecours, reinitialiserAvecCodeSecours, secondesDeBlocage, formaterDuree } from "../../core/verrou.js"; // Logique métier

export const DELAI_VERROU_MS = 60 * 1000; // Au retour sur l'application après plus d'une minute, le PIN est redemandé

// Texte d'une erreur (message de la règle de gestion, ou erreur technique).
const message = (e) => (e instanceof ErreurMetier || e instanceof ErreurValidation ? e.message : `Erreur : ${e?.message ?? e}`); // Message à montrer

// Appuie sur Entrée dans un champ = touche le bouton.
function entreeValide(un, action) { // Reçoit le champ et la fonction
  un.element.querySelector("input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") action(); }); // Écoute la touche Entrée
} // Fin de entreeValide

// Affiche le code de secours à noter, et attend que l'utilisateur confirme l'avoir noté.
function afficherCodeSecours(contenu, code, titre) { // Reçoit la zone, le code et le titre
  return new Promise((resoudre) => { // Terminée quand l'utilisateur confirme
    vider(contenu); // Efface la zone
    contenu.append(carte( // Carte du code
      h("h2", { class: "carte-titre" }, titre), // Titre
      h("p", { class: "ligne-detail" }, "Notez ce code sur papier, à part du téléphone. Il est affiché UNE seule fois. Il permettra de redéfinir le PIN si vous l'oubliez, sans rien perdre."), // Explication
      h("p", { class: "code-secours", "aria-label": "Code de secours" }, code), // Le code en gros
      boutonPrincipal("J'ai noté mon code", () => resoudre()), // Confirmation
    )); // Fin de la carte
  }); // Fin de la promesse
} // Fin de afficherCodeSecours

// Fenêtre plein écran de déverrouillage. Renvoie une promesse qui se termine quand le PIN est bon (ou réinitialisé avec le code de secours).
export function demanderDeverrouillage(base, { parent = document.body, maintenant = () => new Date() } = {}) { // Reçoit la base et les options
  return new Promise((resoudre) => { // Terminée au déverrouillage
    const fond = h("div", { class: "verrou", role: "dialog", "aria-modal": "true", "aria-label": "Application verrouillée" }); // Fond plein écran opaque
    const contenu = h("div", { class: "verrou-boite" }); // Boîte centrée
    fond.append(contenu); // Place la boîte
    parent.append(fond); // Affiche par-dessus toute l'application
    const finir = () => { fond.remove(); resoudre(); }; // Retire la fenêtre et rend la main

    const dessinerPin = async () => { // Écran « entrez votre PIN »
      vider(contenu); // Efface
      const champPin = champ({ id: "verrou-pin", libelle: "PIN", type: "password", inputmode: "numeric" }); // Saisie du PIN
      const valider = async () => { // Vérifie le PIN
        champPin.effacerErreur(); // Repart sans erreur
        try { await verifierPin(base, champPin.lire(), maintenant()); finir(); } catch (e) { champPin.afficherErreur(message(e)); champPin.ecrire(""); } // Bon : ouvre ; mauvais : explique
      }; // Fin de valider
      entreeValide(champPin, valider); // Entrée valide
      contenu.append( // Assemble
        h("h1", { class: "titre" }, "Volako"), // Nom
        h("p", { class: "ligne-detail" }, "Application verrouillée. Entrez votre PIN."), // Consigne
        champPin.element, // Champ
        boutonPrincipal("Déverrouiller", valider), // Bouton
        h("div", { class: "espace-haut" }, h("button", { class: "bouton-texte", type: "button", onclick: dessinerSecours }, "PIN oublié ?")), // Lien vers le code de secours
      ); // Fin de l'assemblage
      const reste = await secondesDeBlocage(base, maintenant()); // Blocage en cours ?
      if (reste > 0) champPin.afficherErreur(`Trop d'essais. Réessayez dans ${formaterDuree(reste)}.`); // Prévient dès l'ouverture
      champPin.element.querySelector("input")?.focus(); // Place le curseur
    }; // Fin de dessinerPin

    const dessinerSecours = () => { // Écran « code de secours »
      vider(contenu); // Efface
      const champCode = champ({ id: "verrou-code", libelle: "Code de secours", aide: "Format XXXX-XXXX-XXXX, noté lors de l'activation du verrouillage." }); // Code
      const champNouveau = champ({ id: "verrou-nouveau", libelle: "Nouveau PIN", type: "password", inputmode: "numeric", aide: "4 à 8 chiffres" }); // Nouveau PIN
      const valider = async () => { // Réinitialise
        champCode.effacerErreur(); champNouveau.effacerErreur(); // Repart sans erreur
        try { // Tente la réinitialisation
          const nouveauCode = await reinitialiserAvecCodeSecours(base, champCode.lire(), champNouveau.lire(), undefined, maintenant()); // Nouveau PIN + nouveau code de secours
          await afficherCodeSecours(contenu, nouveauCode, "Nouveau code de secours"); // L'ancien code est périmé : montre le nouveau
          finir(); // Déverrouille
        } catch (e) { // Échec
          if (e instanceof ErreurValidation && e.erreurs.nouveauPin) champNouveau.afficherErreur(e.erreurs.nouveauPin); // Format du PIN
          else champCode.afficherErreur(message(e)); // Mauvais code ou blocage
        } // Fin du try/catch
      }; // Fin de valider
      contenu.append( // Assemble
        h("h1", { class: "titre" }, "PIN oublié"), // Titre
        champCode.element, champNouveau.element, // Champs
        boutonPrincipal("Redéfinir le PIN", valider), // Bouton
        h("div", { class: "espace-haut" }, h("button", { class: "bouton-texte", type: "button", onclick: dessinerPin }, "Retour")), // Retour
      ); // Fin de l'assemblage
    }; // Fin de dessinerSecours

    dessinerPin(); // Premier écran
  }); // Fin de la promesse
} // Fin de demanderDeverrouillage

// Écran de réglage du verrouillage (Réglages > Verrouillage par PIN).
export async function afficherReglageVerrou(zone, { base }) { // Reçoit la zone et la base
  const contenu = h("div", {}); // Zone redessinée après chaque action
  zone.append(enteteEcran("Verrouillage par PIN", "Protège l'accès à l'application", { retour: "/reglages" }), contenu); // En-tête et contenu
  const dessiner = async () => { // Redessine selon l'état
    const actif = await verrouActif(base); // Verrou activé ?
    vider(contenu); // Efface
    const action = (champs, travail) => async () => { // Exécute une action avec affichage des erreurs sous les champs
      Object.values(champs).forEach((c) => c.effacerErreur()); // Repart sans erreur
      try { await travail(); } catch (e) { // Échec
        if (e instanceof ErreurValidation) { for (const [nom, texte] of Object.entries(e.erreurs)) (champs[nom] ?? Object.values(champs)[0]).afficherErreur(texte); } // Erreurs par champ
        else (champs.pin ?? Object.values(champs)[0]).afficherErreur(message(e)); // Erreur unique sur le champ du PIN
      } // Fin du try/catch
    }; // Fin de action
    if (!actif) { // Verrou non activé
      const champs = { pin: champ({ id: "verrou-new", libelle: "Choisir un PIN", type: "password", inputmode: "numeric", aide: "4 à 8 chiffres" }), confirmation: champ({ id: "verrou-conf", libelle: "Confirmer le PIN", type: "password", inputmode: "numeric" }) }; // Champs
      const activer = action(champs, async () => { // Active le verrou
        if (champs.pin.lire() !== champs.confirmation.lire()) throw new ErreurValidation({ confirmation: "Les deux PIN sont différents." }); // Contrôle de confirmation
        const code = await activerVerrou(base, champs.pin.lire()); // Active et récupère le code de secours
        await afficherCodeSecours(contenu, code, "Verrouillage activé : code de secours"); // Montre le code
        afficherToast("Verrouillage activé.", "succes"); // Confirme
        await dessiner(); // Redessine
      }); // Fin de activer
      contenu.append(alerte({ niveau: "info", message: "Le PIN sera demandé à l'ouverture de Volako et quand vous y revenez après plus d'une minute. Il protège l'écran, pas le fichier de la base." }), carte(champs.pin.element, champs.confirmation.element, boutonPrincipal("Activer le verrouillage", activer))); // Carte d'activation
      return; // Fin pour l'état « non activé »
    } // Fin de l'état « non activé »
    const ch = { // Champs des trois actions
      ancien: champ({ id: "verrou-ancien", libelle: "PIN actuel", type: "password", inputmode: "numeric" }), // Pour changer
      nouveauPin: champ({ id: "verrou-nouveau2", libelle: "Nouveau PIN", type: "password", inputmode: "numeric", aide: "4 à 8 chiffres" }), // Nouveau
      pinCode: champ({ id: "verrou-pin-code", libelle: "PIN actuel", type: "password", inputmode: "numeric" }), // Pour le code de secours
      pinOff: champ({ id: "verrou-pin-off", libelle: "PIN actuel", type: "password", inputmode: "numeric" }), // Pour désactiver
    }; // Fin des champs
    const changer = action({ pin: ch.ancien, nouveauPin: ch.nouveauPin }, async () => { await changerPin(base, ch.ancien.lire(), ch.nouveauPin.lire()); afficherToast("PIN changé.", "succes"); await dessiner(); }); // Change le PIN
    const nouveauCode = action({ pin: ch.pinCode }, async () => { const code = await regenererCodeSecours(base, ch.pinCode.lire()); await afficherCodeSecours(contenu, code, "Nouveau code de secours"); await dessiner(); }); // Nouveau code de secours
    const desactiver = action({ pin: ch.pinOff }, async () => { await desactiverVerrou(base, ch.pinOff.lire()); afficherToast("Verrouillage désactivé.", "succes"); await dessiner(); }); // Désactive
    contenu.append( // Assemble
      alerte({ niveau: "ok", message: "Verrouillage activé." }), // État
      carte(h("h2", { class: "carte-titre" }, "Changer le PIN"), ch.ancien.element, ch.nouveauPin.element, boutonPrincipal("Changer le PIN", changer)), // Changer
      carte(h("h2", { class: "carte-titre" }, "Code de secours"), h("p", { class: "ligne-detail" }, "Fabrique un nouveau code de secours ; l'ancien ne marchera plus."), ch.pinCode.element, boutonPrincipal("Nouveau code de secours", nouveauCode)), // Code de secours
      carte(h("h2", { class: "carte-titre" }, "Désactiver"), ch.pinOff.element, boutonPrincipal("Désactiver le verrouillage", desactiver, { danger: true })), // Désactiver
    ); // Fin de l'assemblage
  }; // Fin de dessiner
  await dessiner(); // Premier affichage
} // Fin de afficherReglageVerrou
