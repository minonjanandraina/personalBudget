// Écran « Sauvegarde et restauration » : créer un fichier de sauvegarde, restaurer depuis un fichier, annuler une restauration.
import { h } from "../dom.js"; // Fabrication d'éléments
import { enteteEcran, carte, alerte, boutonPrincipal } from "../composants.js"; // Composants
import { afficherToast, confirmer } from "../messages.js"; // Notifications et confirmation
import { aller } from "../routeur.js"; // Navigation
import { afficherDateHeure } from "../../core/dates.js"; // Date lisible
import { ErreurMetier } from "../../core/erreurs.js"; // Erreur de règle de gestion
import { creerTexteSauvegarde, nomFichierSauvegarde, verifierSauvegarde, restaurerSauvegarde, annulerDerniereRestauration, dateCopieAvantRestauration, enregistrerDerniereSauvegarde, lireDerniereSauvegarde, compterDonnees } from "../../core/sauvegarde.js"; // Logique de sauvegarde
import * as fichiersReels from "../../platform/fichiers.js"; // Accès aux fichiers (téléphone ou navigateur)

// Phrase qui décrit le contenu d'une sauvegarde : « 2 budgets, 3 types, 1 solde, 12 opérations ».
export function decrireContenu(nombres) { // Reçoit le nombre de lignes par table
  const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`; // Accorde le mot selon le nombre
  return [pluriel(nombres.budget, "budget", "budgets"), pluriel(nombres.type_budget, "type de budget", "types de budget"), pluriel(nombres.solde_om, "solde Mobile Money", "soldes Mobile Money"), pluriel(nombres.transactions, "opération", "opérations")].join(", "); // Assemble les quatre éléments
} // Fin de decrireContenu

// Dessine l'écran. « fichiers » (facultatif) remplace l'accès aux fichiers : utile aux tests.
export async function afficherSauvegarde(zone, { base, fichiers = fichiersReels }) { // Reçoit la zone, la base et l'accès aux fichiers
  const derniere = await lireDerniereSauvegarde(base); // Date de la dernière sauvegarde créée
  const copieAvant = await dateCopieAvantRestauration(base); // Date de la copie de sécurité d'avant la dernière restauration
  const zoneMessage = h("div", { class: "espace-haut" }); // Zone où s'affiche l'erreur d'un fichier refusé

  const sauvegarder = async () => { // Crée la sauvegarde et propose de l'enregistrer
    try { // Tente la sauvegarde
      const texte = await creerTexteSauvegarde(base); // Contenu du fichier
      const nom = nomFichierSauvegarde(); // Nom daté du fichier
      await fichiers.enregistrerFichier({ nom, contenu: texte, titre: "Sauvegarde Volako" }); // Enregistre ou partage le fichier
      await enregistrerDerniereSauvegarde(base); // Retient la date
      afficherToast(`Sauvegarde créée : ${nom}`, "succes"); // Confirme
      zone.replaceChildren(); // Efface l'écran
      await afficherSauvegarde(zone, { base, fichiers }); // Le redessine avec la nouvelle date
    } catch (erreur) { // En cas de problème
      afficherToast(`La sauvegarde a échoué : ${erreur?.message ?? erreur}`, "erreur"); // Explique
    } // Fin du try/catch
  }; // Fin de sauvegarder

  const restaurer = async () => { // Choisit un fichier, le vérifie, demande confirmation, puis restaure
    zoneMessage.replaceChildren(); // Efface l'éventuelle erreur précédente
    const choix = await fichiers.choisirFichierTexte(); // Ouvre le sélecteur de fichiers
    if (!choix) return; // Annulé : on s'arrête
    let verification; // Résultat de la vérification
    try { // Vérifie le fichier avant toute chose
      verification = await verifierSauvegarde(choix.texte); // Fichier valide ou erreur expliquée
    } catch (erreur) { // Fichier refusé
      zoneMessage.append(alerte({ niveau: "danger", message: `« ${choix.nom} » ne peut pas être restauré. ${erreur.message}` })); // Explique pourquoi
      return; // Rien n'est modifié
    } // Fin du try/catch
    const actuel = await compterDonnees(base); // Contenu actuel de la base
    const { resume } = verification; // Résumé de la sauvegarde choisie
    const ok = await confirmer({ // Demande confirmation (action destructive)
      titre: "Restaurer cette sauvegarde ?", // Titre
      message: `Sauvegarde du ${resume.date ? afficherDateHeure(resume.date) : "date inconnue"}.\nElle contient : ${decrireContenu(resume.nombres)}.\n\nVos données actuelles (${decrireContenu(actuel)}) seront REMPLACÉES. Une copie de sécurité est conservée pour pouvoir annuler.`, // Détail de ce qui va se passer
      libelleOk: "Restaurer", danger: true, // Bouton rouge
    }); // Fin de la confirmation
    if (!ok) return; // Annulé : on s'arrête
    try { // Restaure
      await restaurerSauvegarde(base, choix.texte); // Remplace les données
      afficherToast("Sauvegarde restaurée.", "succes"); // Confirme
      aller("/"); // Retourne à l'accueil (les données ont changé)
    } catch (erreur) { // Restauration refusée : rien n'a changé
      zoneMessage.append(alerte({ niveau: "danger", message: erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur?.message ?? erreur}` })); // Explique
    } // Fin du try/catch
  }; // Fin de restaurer

  const annuler = async () => { // Rétablit les données d'avant la dernière restauration
    const ok = await confirmer({ titre: "Annuler la dernière restauration ?", message: `Les données d'avant la restauration (copie du ${afficherDateHeure(copieAvant)}) seront rétablies. Les données actuelles seront remplacées.`, libelleOk: "Annuler la restauration", danger: true }); // Demande confirmation
    if (!ok) return; // Annulé : on s'arrête
    try { // Rétablit
      await annulerDerniereRestauration(base); // Annule
      afficherToast("Restauration annulée : vos données d'avant sont rétablies.", "succes"); // Confirme
      aller("/"); // Retourne à l'accueil
    } catch (erreur) { // Échec
      zoneMessage.append(alerte({ niveau: "danger", message: erreur instanceof ErreurMetier ? erreur.message : `Erreur : ${erreur?.message ?? erreur}` })); // Explique
    } // Fin du try/catch
  }; // Fin de annuler

  zone.append( // Assemble l'écran
    enteteEcran("Sauvegarde", "Protégez vos données", { retour: "/reglages" }), // En-tête
    carte( // Carte de sauvegarde
      h("h2", { class: "carte-titre" }, "Sauvegarder mes données"), // Titre
      h("p", { class: "ligne-detail info-formulaire" }, "Crée un fichier avec tous vos budgets, soldes et opérations, à envoyer sur Google Drive. Si vous désinstallez l'application, vos données sont effacées : gardez toujours une sauvegarde récente."), // Explication
      h("p", { class: "info-formulaire" }, derniere ? `Dernière sauvegarde créée : ${afficherDateHeure(derniere)}` : "Aucune sauvegarde créée pour l'instant."), // Dernière sauvegarde
      boutonPrincipal("Sauvegarder maintenant", sauvegarder), // Bouton de sauvegarde
    ), // Fin de la carte
    carte( // Carte de restauration
      h("h2", { class: "carte-titre" }, "Restaurer une sauvegarde"), // Titre
      h("p", { class: "ligne-detail info-formulaire" }, "Remplace toutes les données actuelles par celles d'un fichier de sauvegarde (téléchargez-le d'abord depuis Google Drive). Le fichier est vérifié avant toute modification."), // Explication
      boutonPrincipal("Choisir un fichier de sauvegarde", restaurer), // Bouton de restauration
    ), // Fin de la carte
    copieAvant ? carte( // Carte d'annulation (seulement après une restauration)
      h("h2", { class: "carte-titre" }, "Annuler la dernière restauration"), // Titre
      h("p", { class: "ligne-detail info-formulaire" }, `Vos données d'avant la dernière restauration sont conservées (copie du ${afficherDateHeure(copieAvant)}).`), // Explication
      boutonPrincipal("Annuler la dernière restauration", annuler, { danger: true }), // Bouton d'annulation
    ) : null, // Fin de la carte d'annulation
    zoneMessage, // Zone des messages d'erreur
  ); // Fin de l'assemblage
} // Fin de afficherSauvegarde
