// Adaptateur « base de données » basé sur sql.js (SQLite compilé en WebAssembly).
// Sert aux tests sous Windows et au développement dans le navigateur ; sur le téléphone, c'est base-capacitor.js.
// Les deux adaptateurs offrent exactement les mêmes 4 fonctions : executer, requeter, transaction, fermer.

// Ouvre une base en mémoire (ou à partir d'octets déjà enregistrés).
export async function ouvrirBaseSqlJs({ octets = null, localiserFichier = null, apresEcriture = null } = {}) { // Options facultatives
  const initSqlJs = (await import("sql.js")).default; // Charge la bibliothèque sql.js au moment où on en a besoin
  const SQL = await initSqlJs(localiserFichier ? { locateFile: localiserFichier } : {}); // Démarre le moteur (en navigateur : indique où est le fichier .wasm)
  const db = new SQL.Database(octets ?? undefined); // Crée la base (vide, ou à partir des octets sauvegardés)
  db.run("PRAGMA foreign_keys = ON;"); // Active la vérification des liens entre tables (désactivée par défaut)
  let enTransaction = false; // Mémorise si une transaction est ouverte

  const prevenir = async () => { // Appelée après chaque écriture terminée
    if (apresEcriture && !enTransaction) await apresEcriture(db.export()); // Donne une copie de la base à sauvegarder (navigateur)
  }; // Fin de prevenir

  return { // L'objet « base » utilisé par le reste de l'application
    nom: "sql.js", // Nom du moteur (affiché dans l'écran de diagnostic)
    cleEtrangeresActives: db.exec("PRAGMA foreign_keys")[0].values[0][0] === 1, // Vérifie que les liens entre tables sont bien contrôlés

    async executer(sql, parametres = []) { // Exécute une instruction qui modifie la base
      db.run(sql, parametres); // Lance l'instruction avec ses paramètres
      const changements = db.getRowsModified(); // Nombre de lignes modifiées
      const dernierId = db.exec("SELECT last_insert_rowid()")[0].values[0][0]; // Identifiant de la dernière ligne insérée
      await prevenir(); // Sauvegarde si nécessaire
      return { changements, dernierId }; // Renvoie le résultat
    }, // Fin de executer

    async requeter(sql, parametres = []) { // Exécute une lecture et renvoie les lignes
      const instruction = db.prepare(sql); // Prépare la requête
      try { // Garantit la libération de la requête même en cas d'erreur
        instruction.bind(parametres); // Associe les paramètres
        const lignes = []; // Tableau des résultats
        while (instruction.step()) lignes.push(instruction.getAsObject()); // Ajoute chaque ligne sous forme d'objet {colonne: valeur}
        return lignes; // Renvoie les lignes
      } finally { // Dans tous les cas
        instruction.free(); // Libère la mémoire de la requête
      } // Fin du try
    }, // Fin de requeter

    async transaction(travail) { // Exécute « travail » en tout ou rien
      if (enTransaction) return travail(); // Déjà dans une transaction : on continue dedans
      db.run("BEGIN"); // Ouvre la transaction
      enTransaction = true; // Mémorise qu'elle est ouverte
      try { // Tente d'exécuter le travail
        const resultat = await travail(); // Exécute le travail demandé
        db.run("COMMIT"); // Valide tout
        enTransaction = false; // La transaction est fermée
        await prevenir(); // Sauvegarde si nécessaire
        return resultat; // Renvoie le résultat du travail
      } catch (erreur) { // Si une erreur survient
        db.run("ROLLBACK"); // Annule tout ce qui a été fait dans la transaction
        enTransaction = false; // La transaction est fermée
        throw erreur; // Relance l'erreur pour que l'appelant la voie
      } // Fin du try/catch
    }, // Fin de transaction

    async fermer() { // Ferme la base
      db.close(); // Libère la mémoire
    }, // Fin de fermer
  }; // Fin de l'objet base
} // Fin de ouvrirBaseSqlJs
