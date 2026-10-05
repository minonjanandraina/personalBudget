// Accès aux fichiers : enregistrer un fichier de sauvegarde (partage vers Google Drive, Fichiers...) et en choisir un à restaurer.
// Sur Android, l'enregistrement passe par la fenêtre de partage du téléphone ; dans le navigateur, c'est un simple téléchargement.
// ATTENTION : la partie Android ne peut pas être testée sous Windows ; elle se vérifie dans l'APK sur le téléphone.
import { Capacitor } from "@capacitor/core"; // Outil Capacitor : permet de savoir si on tourne dans l'APK

// Enregistre un fichier texte. Sur Android : écrit le fichier dans le dossier temporaire de l'application puis ouvre le partage.
export async function enregistrerFichier({ nom, contenu, titre = "Enregistrer le fichier" }) { // Nom du fichier, contenu texte et titre de la fenêtre
  if (Capacitor.isNativePlatform()) { // Sur le téléphone
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem"); // Outil d'accès aux fichiers
    const { Share } = await import("@capacitor/share"); // Outil de partage
    await Filesystem.writeFile({ path: nom, data: contenu, directory: Directory.Cache, encoding: Encoding.UTF8 }); // Écrit le fichier dans le dossier temporaire de l'application
    const { uri } = await Filesystem.getUri({ path: nom, directory: Directory.Cache }); // Adresse du fichier écrit
    await Share.share({ title: titre, dialogTitle: titre, files: [uri] }); // Ouvre la fenêtre de partage (Drive, Fichiers, WhatsApp...)
    return { mode: "partage" }; // Mode utilisé
  } // Fin du cas téléphone
  const blob = new Blob([contenu], { type: "application/json" }); // Navigateur : fichier en mémoire
  const adresse = URL.createObjectURL(blob); // Adresse temporaire du fichier
  const lien = document.createElement("a"); // Lien de téléchargement invisible
  lien.href = adresse; // Adresse du fichier
  lien.download = nom; // Nom proposé au téléchargement
  document.body.append(lien); // Ajoute le lien à la page
  lien.click(); // Lance le téléchargement
  lien.remove(); // Retire le lien
  setTimeout(() => URL.revokeObjectURL(adresse), 1000); // Libère la mémoire un peu plus tard
  return { mode: "telechargement" }; // Mode utilisé
} // Fin de enregistrerFichier

// Ouvre le sélecteur de fichiers du téléphone et renvoie { nom, texte } (ou null si l'utilisateur annule).
export function choisirFichierTexte() { // Aucun paramètre
  return new Promise((resoudre) => { // La promesse se termine quand l'utilisateur choisit ou annule
    const entree = document.createElement("input"); // Champ de choix de fichier invisible
    entree.type = "file"; // Type « fichier » (sans filtre : Drive donne parfois un type de fichier inattendu ; le contenu est vérifié ensuite)
    entree.style.display = "none"; // Invisible
    entree.addEventListener("change", async () => { // Quand un fichier est choisi
      const fichier = entree.files?.[0]; // Fichier choisi
      entree.remove(); // Retire le champ
      if (!fichier) { resoudre(null); return; } // Aucun fichier
      try { resoudre({ nom: fichier.name, texte: await fichier.text() }); } catch { resoudre(null); } // Lit le contenu (null si illisible)
    }); // Fin du cas « choisi »
    entree.addEventListener("cancel", () => { entree.remove(); resoudre(null); }); // Quand l'utilisateur annule
    document.body.append(entree); // Ajoute le champ à la page
    entree.click(); // Ouvre le sélecteur
  }); // Fin de la promesse
} // Fin de choisirFichierTexte
