// Adaptateur « base de données » pour Android : utilise le vrai SQLite du téléphone via le plugin Capacitor.
// ATTENTION : ce fichier ne peut pas être testé sous Windows ; il n'est vérifiable que dans l'APK sur le téléphone.
// Il offre les mêmes 4 fonctions que base-sqljs.js : executer, requeter, transaction, fermer.

import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite"; // Plugin SQLite pour Capacitor

// Ouvre (ou crée) la base du téléphone. Le fichier se trouve dans le dossier privé de l'application.
export async function ouvrirBaseCapacitor(nomBase = "volako") { // Nom du fichier de base
  const sqlite = new SQLiteConnection(CapacitorSQLite); // Gestionnaire de connexions du plugin
  const existe = (await sqlite.isConnection(nomBase, false)).result; // Vérifie si une connexion à cette base existe déjà
  const db = existe // Réutilise la connexion existante, sinon en crée une
    ? await sqlite.retrieveConnection(nomBase, false) // Récupère la connexion existante
    : await sqlite.createConnection(nomBase, false, "no-encryption", 1, false); // Crée une connexion (sans chiffrement, version 1, écriture permise)
  await db.open(); // Ouvre la base
  await db.execute("PRAGMA foreign_keys = ON;", false); // Demande la vérification des liens entre tables
  const fk = await db.query("PRAGMA foreign_keys;"); // Relit le réglage pour s'assurer qu'il est actif
  const cleEtrangeresActives = Number(Object.values(fk.values?.[0] ?? {})[0]) === 1; // true si actif (affiché dans le diagnostic)
  let enTransaction = false; // Mémorise si une transaction est ouverte

  return { // L'objet « base » utilisé par le reste de l'application
    nom: "SQLite Android", // Nom du moteur (affiché dans l'écran de diagnostic)
    cleEtrangeresActives, // Résultat de la vérification ci-dessus

    async executer(sql, parametres = []) { // Exécute une instruction qui modifie la base
      const resultat = await db.run(sql, parametres, !enTransaction); // Lance l'instruction (le plugin ouvre sa propre transaction sauf si on en a déjà une)
      return { // Renvoie le même format que l'autre adaptateur
        changements: resultat.changes?.changes ?? 0, // Nombre de lignes modifiées
        dernierId: resultat.changes?.lastId ?? null, // Identifiant de la dernière ligne insérée
      }; // Fin du résultat
    }, // Fin de executer

    async requeter(sql, parametres = []) { // Exécute une lecture et renvoie les lignes
      const resultat = await db.query(sql, parametres); // Lance la requête
      return resultat.values ?? []; // Renvoie les lignes (tableau vide s'il n'y en a pas)
    }, // Fin de requeter

    async transaction(travail) { // Exécute « travail » en tout ou rien
      if (enTransaction) return travail(); // Déjà dans une transaction : on continue dedans
      await db.beginTransaction(); // Ouvre la transaction
      enTransaction = true; // Mémorise qu'elle est ouverte
      try { // Tente d'exécuter le travail
        const resultat = await travail(); // Exécute le travail demandé
        await db.commitTransaction(); // Valide tout
        enTransaction = false; // La transaction est fermée
        return resultat; // Renvoie le résultat du travail
      } catch (erreur) { // Si une erreur survient
        await db.rollbackTransaction(); // Annule tout ce qui a été fait dans la transaction
        enTransaction = false; // La transaction est fermée
        throw erreur; // Relance l'erreur pour que l'appelant la voie
      } // Fin du try/catch
    }, // Fin de transaction

    async fermer() { // Ferme la base
      await sqlite.closeConnection(nomBase, false); // Ferme la connexion
    }, // Fin de fermer
  }; // Fin de l'objet base
} // Fin de ouvrirBaseCapacitor
