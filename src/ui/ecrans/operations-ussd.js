// Écrans des opérations USSD dynamiques : liste (modèles et envois en attente), création/modification d'un modèle, lancement d'une opération.
import { h, vider } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonLien, boutonIcone, boutonPrincipal, champ, choix, tuilePlate, selecteurVisuel } from "../composants.js"; // Composants
import { icone } from "../icones.js"; // Icônes
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { soumettre, lireMontant, effacerErreurs, appliquerErreurs } from "../formulaire.js"; // Enregistrement de formulaire
import { ErreurMetier, ErreurValidation } from "../../core/erreurs.js"; // Erreurs expliquées
import { formaterMontant } from "../../core/format.js"; // Affichage des montants
import { afficherDateHeure } from "../../core/dates.js"; // Affichage des dates
import { listerBudgets } from "../../core/budgets.js"; // Budgets
import { creerOperation, modifierOperation, supprimerOperation, listerOperations, lireOperation, lancerOperation, controlerSortie, erreurNumero, erreurPinMm, variablesDuCode, resumeSaisies, TYPES, ICONES_OPERATION, COULEURS_OPERATION, ICONE_PAR_DEFAUT, COULEUR_PAR_DEFAUT } from "../../core/operations-ussd.js"; // Logique métier
import { listerEnAttente, annulerEnAttente } from "../../core/ussd-en-attente.js"; // Envois en attente de leur SMS
import * as ussdPlateforme from "../../platform/ussd.js"; // Accès USSD (téléphone ou simulation)

const masquer = (code) => String(code).replaceAll("{pin}", "••••"); // Code sans PIN visible
const LIBELLE_STATUT = { en_attente: "En attente du SMS", classee: "Classée dans le budget", echec: "À classer à la main", expiree: "Abandonnée (pas de SMS)", annulee: "Annulée" }; // Texte de chaque état

// Liste des modèles et des envois récents.
export async function afficherOperationsUssd(zone, { base }) { // Reçoit la zone et la base
  const modeles = await listerOperations(base); // Modèles
  const envois = await listerEnAttente(base); // Envois récents
  zone.append(enteteEcran("Opérations USSD", "Retrait, paiement… en un geste", { retour: "/" }), boutonLien("Nouvelle opération", "/operations-ussd/nouveau", "ajouter")); // En-tête et bouton d'ajout
  if (modeles.length === 0) zone.append(h("div", { class: "espace-haut" }, alerte({ niveau: "info", message: "Aucune opération. Créez-en une : nom, type, code USSD avec {numero}, {montant} et {pin}, et le budget à débiter." }))); // Liste vide
  if (modeles.length > 0) zone.append(h("div", { class: "mosaique espace-haut" }, ...modeles.map((m) => h("div", { class: "tuile-plate-cellule" }, // Mosaïque : une tuile par opération, avec l'icône et la couleur choisies
    tuilePlate({ libelle: m.nom, nomIcone: m.icone, couleur: m.couleur, route: `/operations-ussd/lancer/${m.id}` }), // Toucher la tuile lance l'opération
    boutonIcone({ nomIcone: "modifier", libelle: `Modifier ${m.nom}`, route: `/operations-ussd/${m.id}` }), // Petit bouton modifier dans le coin
  )))); // Fin de la mosaïque
  if (envois.length === 0) return; // Pas d'envoi à montrer
  zone.append(h("h2", { class: "section-titre" }, "Envois récents")); // Titre
  const recharger = async () => { vider(zone); await afficherOperationsUssd(zone, { base }); }; // Redessine l'écran
  for (const e of envois) { // Pour chaque envoi
    zone.append(h("div", { class: "carte apparition" }, // Une carte par envoi
      h("div", { class: "ligne ligne-sans-carte" }, // Ligne texte + montant
        h("div", { class: "ligne-texte" }, // Bloc de texte
          h("div", { class: "ligne-titre" }, e.operationNom), // Nom du modèle
          h("div", { class: "ligne-detail" }, `${afficherDateHeure(e.dateEnvoi)} · ${LIBELLE_STATUT[e.statut] ?? e.statut}`), // Date et état
          e.raison ? h("div", { class: "ligne-detail" }, e.raison) : null, // Explication éventuelle
        ), // Fin du bloc de texte
        h("div", { class: "ligne-montant montant-moins" }, `−${formaterMontant(e.montant)}`), // Montant
      ), // Fin de la ligne
      e.statut === "en_attente" ? h("div", { class: "espace-haut" }, boutonPrincipal("Annuler cet envoi", async () => { // Annulation
        if (!(await confirmer({ titre: "Annuler cet envoi ?", message: "À faire seulement si l'opération a échoué chez Mobile Money. Le SMS ne sera plus classé automatiquement.", libelleOk: "Annuler l'envoi", danger: true }))) return; // Confirmation
        try { await annulerEnAttente(base, e.id); } catch (erreur) { afficherToast(erreur.message, "erreur"); } // Annule
        await recharger(); // Redessine
      })) : null, // Fin du bouton
    )); // Fin de la carte
  } // Fin de la boucle
} // Fin de afficherOperationsUssd

// Formulaire de création (sans paramètre) ou de modification (params.id) d'un modèle.
export async function afficherFormulaireOperationUssd(zone, { base, params = {} }) { // Reçoit la zone, la base et les paramètres de route
  const id = params.id === undefined ? null : Number(params.id); // Identifiant si on modifie
  const existant = id === null ? null : await lireOperation(base, id); // Modèle à modifier
  zone.append(enteteEcran(id === null ? "Nouvelle opération" : "Modifier l'opération", null, { retour: "/operations-ussd" })); // En-tête
  if (id !== null && !existant) { zone.append(alerte({ niveau: "danger", message: "Cette opération n'existe plus." })); return; } // Introuvable
  const budgets = await listerBudgets(base); // Budgets disponibles
  const champs = { // Champs du formulaire
    nom: champ({ id: "ussd-nom", libelle: "Nom de l'opération", valeur: existant?.nom ?? "", aide: "Ex. Retrait Mobile Money, Paiement marchand" }), // Nom
    type: choix({ id: "ussd-type", libelle: "Type", valeur: existant?.type ?? "sortie", options: TYPES.map((t) => ({ valeur: t.valeur, libelle: t.libelle })) }), // Sortie ou entrée
    code: champ({ id: "ussd-code", libelle: "Code USSD", valeur: existant?.code ?? "", inputmode: "text", aide: "{numero} : numéro saisi à chaque envoi (à écrire autant de fois que le code le demande, p. ex. retrait : #144*1*2*{numero}*{numero}*{montant}*{pin}#) ; sans {numero} si le parcours n'en a pas besoin (p. ex. remboursement de prêt : #144*4*1*1*{montant}*{pin}#). {montant} : montant saisi (obligatoire pour une sortie). {pin} : votre PIN Mobile Money, demandé à chaque envoi (jamais enregistré, jamais affiché)." }), // Code
    icone: selecteurVisuel({ id: "ussd-icone", libelle: "Icône", valeur: existant?.icone ?? ICONE_PAR_DEFAUT, options: ICONES_OPERATION.map((i) => ({ valeur: i.valeur, libelle: i.libelle, contenu: icone(i.valeur, 24) })) }), // Icône de la tuile
    couleur: selecteurVisuel({ id: "ussd-couleur", libelle: "Couleur", valeur: existant?.couleur ?? COULEUR_PAR_DEFAUT, options: COULEURS_OPERATION.map((c) => ({ valeur: c.valeur, libelle: c.libelle, classe: `fond-${c.valeur}`, contenu: h("span", { class: "choix-visuel-pastille" }) })) }), // Couleur de la pastille
    budgetId: choix({ id: "ussd-budget", libelle: "Budget à débiter (sortie)", valeur: existant?.budgetId === null || existant === null ? "" : String(existant.budgetId), options: [{ valeur: "", libelle: "— Aucun —" }, ...budgets.map((b) => ({ valeur: b.id, libelle: b.name }))] }), // Budget
  }; // Fin des champs
  const apercu = h("p", { class: "ligne-detail" }, resumeSaisies(existant?.code ?? "")); // Aperçu de ce que l'écran de lancement demandera
  champs.code.element.querySelector("input").addEventListener("input", () => { apercu.textContent = resumeSaisies(champs.code.lire()); }); // Met l'aperçu à jour à chaque frappe
  const enregistrer = () => { // Enregistre
    const donnees = { nom: champs.nom.lire(), type: champs.type.lire(), code: champs.code.lire(), budgetId: Number(champs.budgetId.lire()) || null, icone: champs.icone.lire(), couleur: champs.couleur.lire() }; // Rassemble les valeurs
    return soumettre({ champs, action: () => (id === null ? creerOperation(base, donnees) : modifierOperation(base, id, donnees)), messageSucces: id === null ? "Opération créée." : "Opération modifiée.", routeSucces: "/operations-ussd" }); // Création ou modification
  }; // Fin de enregistrer
  const supprimer = async () => { // Suppression
    if (!(await confirmer({ titre: "Supprimer cette opération ?", message: `« ${existant.nom} » sera supprimée définitivement.`, libelleOk: "Supprimer", danger: true }))) return; // Confirmation
    await soumettre({ champs: {}, action: () => supprimerOperation(base, id), messageSucces: "Opération supprimée.", routeSucces: "/operations-ussd" }); // Supprime (refusé si en attente)
  }; // Fin de supprimer
  zone.append(carte(champs.nom.element, champs.type.element, champs.code.element, apercu, champs.budgetId.element, champs.icone.element, champs.couleur.element, boutonPrincipal("Enregistrer", enregistrer), existant ? h("div", { class: "espace-haut" }, boutonPrincipal("Supprimer", supprimer, { danger: true })) : null)); // Carte du formulaire
} // Fin de afficherFormulaireOperationUssd

// Écran de lancement d'une opération (params.id = modèle), en étapes : une information à la fois, le nom de l'opération reste affiché en haut.
// Étapes : numéro de téléphone (si le code l'utilise), montant (idem), PIN Mobile Money (idem), puis récapitulatif et envoi. Aucun PIN de l'application n'est demandé.
export async function afficherLancerOperationUssd(zone, { base, params = {}, ussd = ussdPlateforme }) { // Reçoit la zone, la base, les paramètres et l'accès USSD
  const operation = await lireOperation(base, Number(params.id)); // Modèle
  zone.append(enteteEcran(operation?.nom ?? "Opération", "Envoyer le code USSD", { retour: "/operations-ussd" })); // En-tête : le nom de l'opération reste visible pendant toutes les étapes
  if (!operation) { zone.append(alerte({ niveau: "danger", message: "Cette opération n'existe plus." })); return; } // Introuvable
  const sousTitre = zone.querySelector(".sous-titre"); // Ligne qui indique l'étape en cours
  const variables = variablesDuCode(operation.code); // Variables à saisir
  const valeurs = { montant: null }; // Montant lu à l'étape du montant
  const champs = {}; // Champs de saisie (un par étape)
  if (variables.includes("numero")) champs.numero = champ({ id: "lancer-numero", libelle: "Numéro de téléphone", inputmode: "numeric", aide: "Chiffres seulement, sans +" }); // Numéro
  if (variables.includes("montant")) champs.montant = champ({ id: "lancer-montant", libelle: "Montant (Ar)", inputmode: "numeric" }); // Montant
  if (variables.includes("pin")) champs.pinMm = champ({ id: "lancer-pin-mm", libelle: "PIN Mobile Money", type: "password", inputmode: "numeric", aide: "Demandé à chaque envoi ; jamais enregistré." }); // PIN Mobile Money (inséré dans le code, jamais gardé)
  const etapes = [...Object.keys(champs).map((nom) => ({ nom, titre: champs[nom].element.querySelector("label").textContent })), { nom: "recap", titre: "Vérification" }]; // Une étape par information, puis le récapitulatif
  let rang = 0; // Étape affichée
  const zoneEtape = h("div", {}); // Contenu de l'étape
  const progression = h("div", { class: "progression", "aria-hidden": "true" }, h("div", { class: "progression-barre" })); // Barre d'avancement
  const zoneResultat = h("div", {}); // Réponse de Mobile Money

  const valeurNumero = () => champs.numero?.lire() ?? ""; // Numéro saisi
  const messageErreur = (erreur) => erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur?.message ?? erreur}`; // Texte d'une erreur inattendue

  // Contrôle l'étape en cours. Renvoie vrai si on peut passer à la suivante.
  const controlerEtape = async (etape) => { // Reçoit l'étape
    const c = champs[etape.nom]; // Champ de l'étape
    c.effacerErreur(); // Repart sans erreur
    if (etape.nom === "numero") { const e = erreurNumero(c.lire()); if (e) { c.afficherErreur(e); return false; } return true; } // Numéro valide ?
    if (etape.nom === "montant") { // Montant
      const m = lireMontant(c); // Lit le montant (affiche l'erreur de format)
      if (m === null) return false; // Illisible
      if (!(m > 0)) { c.afficherErreur("Saisissez un montant supérieur à 0."); return false; } // Nul
      try { await controlerSortie(base, operation.id, m); } catch (erreur) { // Allocation et solde du budget (pour une sortie)
        if (erreur instanceof ErreurValidation) c.afficherErreur(Object.values(erreur.erreurs)[0]); else afficherToast(messageErreur(erreur), "erreur"); // Message sous le champ ou notification
        return false; // Bloqué
      } // Fin du contrôle du budget
      valeurs.montant = m; // Garde le montant
      return true; // Valide
    } // Fin du montant
    const e = erreurPinMm(c.lire()); // PIN Mobile Money
    if (e) { c.afficherErreur(e); return false; } // Format invalide
    return true; // Valide
  }; // Fin de controlerEtape

  const envoyer = async () => { // Envoie le code (dernière étape)
    try { // Tente l'envoi
      if (!(await ussd.demanderPermission())) throw new ErreurMetier("Permission « téléphone » refusée : autorisez-la dans les paramètres Android de l'application."); // Permission
      const { texte, enAttente } = await lancerOperation(base, ussd, operation.id, { numero: valeurNumero(), montant: valeurs.montant, pinMm: champs.pinMm?.lire() ?? "" }); // Envoie
      champs.pinMm?.ecrire(""); // Efface le PIN saisi
      vider(zoneEtape); progression.hidden = true; sousTitre.textContent = "Terminé"; // Fin du parcours
      zoneResultat.append(carte(h("h2", { class: "carte-titre" }, "Réponse de Mobile Money"), h("p", {}, texte), h("p", { class: "ligne-detail" }, enAttente ? "La dépense sera enregistrée dans le budget dès que le SMS de confirmation sera importé." : "Aucune dépense enregistrée (opération d'entrée)."), boutonLien("Retour aux opérations", "/operations-ussd", "telephone"))); // Montre la réponse
      afficherToast("Code envoyé.", "succes"); // Confirme
    } catch (erreur) { // Refus ou erreur
      if (erreur instanceof ErreurValidation) { // Champ refusé : on revient à son étape
        const nom = Object.keys(erreur.erreurs).find((n) => champs[n]); // Premier champ concerné
        if (nom) { rang = etapes.findIndex((e) => e.nom === nom); dessiner(); champs[nom].afficherErreur(erreur.erreurs[nom]); return; } // Réaffiche l'étape avec l'erreur
      } // Fin du retour à l'étape
      afficherToast(erreur instanceof ErreurValidation ? Object.values(erreur.erreurs)[0] : messageErreur(erreur), "erreur"); // Message unique
    } // Fin du try/catch
  }; // Fin de envoyer

  const suivant = async () => { if (await controlerEtape(etapes[rang])) { rang += 1; dessiner(); } }; // Passe à l'étape suivante si l'étape est valide
  const precedent = () => { rang -= 1; dessiner(); }; // Revient à l'étape précédente (les saisies sont conservées)

  function dessiner() { // Affiche l'étape en cours
    const etape = etapes[rang]; // Étape à afficher
    sousTitre.textContent = `Étape ${rang + 1} sur ${etapes.length} · ${etape.titre}`; // Où en est-on
    progression.firstChild.style.width = `${Math.round(((rang + 1) / etapes.length) * 100)}%`; // Avancement
    vider(zoneEtape); // Efface l'étape précédente
    if (etape.nom === "recap") { // Récapitulatif avant l'envoi
      const prep = { code: operation.code.replaceAll("{numero}", valeurNumero().replace(/[\s.-]/g, "")).replaceAll("{montant}", String(valeurs.montant ?? "")).replaceAll("{pin}", "••••") }; // Code avec le PIN masqué
      zoneEtape.append(carte( // Carte du récapitulatif
        h("h2", { class: "carte-titre" }, "Vérifiez avant d'envoyer"), // Titre
        champs.numero ? h("p", {}, `Numéro : ${valeurNumero()}`) : null, // Numéro
        champs.montant ? h("p", {}, `Montant : ${formaterMontant(valeurs.montant)}`) : null, // Montant
        operation.type === "sortie" ? h("p", {}, `Budget débité : « ${operation.budgetNom} »`) : null, // Budget
        h("p", { class: "ligne-detail" }, `Code : ${prep.code}`), // Code (PIN masqué)
        h("p", { class: "ligne-detail" }, "Une opération envoyée ne peut pas être annulée depuis Volako."), // Avertissement
        boutonPrincipal("Envoyer", envoyer), // Envoi
        rang > 0 ? h("div", { class: "espace-haut" }, boutonPrincipal("Précédent", precedent)) : null, // Retour
      )); // Fin de la carte
      return; // Rien d'autre
    } // Fin du récapitulatif
    const c = champs[etape.nom]; // Champ de l'étape
    zoneEtape.append(carte(c.element, boutonPrincipal("Suivant", suivant), rang > 0 ? h("div", { class: "espace-haut" }, boutonPrincipal("Précédent", precedent)) : null)); // Un seul champ, puis Suivant / Précédent
    const saisie = c.element.querySelector("input"); // Zone de saisie
    saisie.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); suivant(); } }; // La touche Entrée passe à la suite
    try { saisie.focus({ preventScroll: true }); } catch { /* le focus est un confort, pas une obligation */ } // Place le curseur dans le champ
  } // Fin de dessiner

  zone.append(progression, zoneEtape, zoneResultat); // Assemble
  dessiner(); // Première étape
} // Fin de afficherLancerOperationUssd
