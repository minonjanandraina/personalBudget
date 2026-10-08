// Liste des migrations : chaque migration fait évoluer la base d'une version à la suivante.
// RÈGLE : on n'édite JAMAIS une migration déjà publiée ; pour changer la base, on AJOUTE une migration.

// Les montants sont des entiers : typeof(...) = 'integer' refuse toute valeur à virgule (règle « jamais de float »).
// Les dates sont stockées en texte ISO 8601 (UTC pour les instants, AAAA-MM-JJ pour les jours).
import { MODELES_PAR_DEFAUT } from "../modeles-sms-defaut.js"; // Modèles de SMS livrés (insérés par la migration 7)

// Texte SQL entre apostrophes (apostrophes doublées ; les retours à la ligne passent par char(10) car les espaces sont réduits avant l'exécution).
const sqlTexte = (texte) => `'${String(texte).replace(/'/g, "''").replace(/\n/g, "' || char(10) || '")}'`; // Convertit un texte en littéral SQL

export const MIGRATIONS = [ // Tableau des migrations, dans l'ordre
  { // Début de la migration 1 : création de toutes les tables
    version: 1, // Numéro de version de la base après cette migration
    instructions: [ // Liste des instructions SQL, exécutées une par une
      // --- Table du solde du compte Orange Money ---
      `CREATE TABLE solde_om ( -- Un solde à chaque SMS ou consultation
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique, jamais réutilisé
        datetime TEXT NOT NULL, -- Date/heure du solde (réception du SMS)
        balance INTEGER NOT NULL CHECK (typeof(balance) = 'integer' AND balance >= 0), -- Solde en Ar : entier, jamais négatif
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) -- Date d'insertion remplie automatiquement
      )`, // Fin de la table solde_om
      // --- Table des types de budget ---
      `CREATE TABLE type_budget ( -- Liste des types (loisir, scolarité...)
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique, jamais réutilisé
        code TEXT NOT NULL UNIQUE, -- Code généré : bdg-001, bdg-002...
        name TEXT NOT NULL CHECK (length(trim(name)) > 0), -- Nom du type, jamais vide
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) -- Date d'insertion automatique
      )`, // Fin de la table type_budget
      // --- Table des budgets ---
      `CREATE TABLE budget ( -- Les budgets (écolage, loisirs...)
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique
        name TEXT NOT NULL CHECK (length(trim(name)) > 0), -- Nom du budget, jamais vide
        type_id INTEGER NOT NULL REFERENCES type_budget (id) ON DELETE RESTRICT, -- Type du budget ; suppression du type refusée s'il est utilisé
        montant_budget INTEGER NOT NULL CHECK (typeof(montant_budget) = 'integer' AND montant_budget >= 0), -- Montant alloué chaque mois
        montant_max INTEGER NOT NULL CHECK (typeof(montant_max) = 'integer' AND montant_max >= 0), -- Plafond du budget
        montant_min INTEGER NOT NULL DEFAULT 0 CHECK (typeof(montant_min) = 'integer' AND montant_min >= 0), -- Solde minimal exigé après une allocation
        solde_alert INTEGER NOT NULL DEFAULT 0 CHECK (typeof(solde_alert) = 'integer' AND solde_alert >= 0), -- Seuil d'alerte du solde
        autogen_fin_mois INTEGER NOT NULL DEFAULT 0 CHECK (autogen_fin_mois IN (0, 1)), -- 1 = allocation automatique, 0 = non
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Date d'insertion automatique
        CHECK (montant_min <= montant_max), -- Le minimum ne dépasse pas le plafond
        CHECK (montant_budget <= montant_max) -- Le montant mensuel ne dépasse pas le plafond
      )`, // Fin de la table budget
      // --- Table des allocations (un budget pour une période) ---
      `CREATE TABLE allocation_budget ( -- Allocation d'un budget sur une période
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique
        budget_id INTEGER NOT NULL REFERENCES budget (id) ON DELETE RESTRICT, -- Budget concerné ; suppression refusée s'il a des allocations
        date_from TEXT NOT NULL, -- Date de début (AAAA-MM-JJ)
        date_to TEXT NOT NULL, -- Date de fin (AAAA-MM-JJ)
        montant_alloue INTEGER NOT NULL CHECK (typeof(montant_alloue) = 'integer' AND montant_alloue >= 0), -- Montant alloué (jamais tronqué par le plafond)
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Date d'insertion automatique
        CHECK (date_to >= date_from), -- La fin ne précède pas le début
        UNIQUE (budget_id, date_from) -- Une seule allocation par budget et par période
      )`, // Fin de la table allocation_budget
      // --- Table des transactions ---
      `CREATE TABLE transactions ( -- Dépenses et alimentations des budgets
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique
        trx_id TEXT NOT NULL UNIQUE, -- ID de transaction (SMS OM, ou généré en saisie manuelle) ; unique = pas de doublon
        allocation_id INTEGER REFERENCES allocation_budget (id) ON DELETE RESTRICT, -- Allocation ; vide = transaction « non classée »
        insert_type TEXT NOT NULL CHECK (insert_type IN ('manuel', 'auto')), -- manuel ou auto (depuis un SMS)
        debit_credit INTEGER NOT NULL CHECK (debit_credit IN (-1, 1)), -- -1 = dépense, 1 = alimentation du budget
        montant INTEGER NOT NULL CHECK (typeof(montant) = 'integer' AND montant > 0), -- Montant toujours positif, le signe vient de debit_credit
        sms TEXT, -- Texte du SMS d'origine (vide si saisie manuelle)
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Date d'insertion automatique
        CHECK (insert_type = 'auto' OR sms IS NULL) -- Un SMS n'est renseigné que pour une transaction automatique
      )`, // Fin de la table transactions
      // --- Table des paramètres du job (une seule ligne) ---
      `CREATE TABLE parametre_job ( -- Paramètres de l'allocation automatique
        id INTEGER PRIMARY KEY CHECK (id = 1), -- Toujours 1 : une seule ligne possible
        start_day_int INTEGER NOT NULL DEFAULT 20 CHECK (typeof(start_day_int) = 'integer' AND start_day_int BETWEEN 1 AND 28) -- Jour du mois de lancement, de 1 à 28
      )`, // Fin de la table parametre_job
      `INSERT INTO parametre_job (id, start_day_int) VALUES (1, 20)`, // Crée l'unique ligne avec le jour 20 par défaut
      `CREATE TRIGGER parametre_job_pas_de_suppression BEFORE DELETE ON parametre_job -- Avant toute suppression de la ligne unique
        BEGIN SELECT RAISE(ABORT, 'La ligne parametre_job ne peut pas être supprimée'); END`, // Annule la suppression
    ], // Fin des instructions de la migration 1
  }, // Fin de la migration 1
  { // Début de la migration 2 : date de l'opération et note sur les transactions
    version: 2, // Numéro de version de la base après cette migration
    instructions: [ // Liste des instructions SQL (la table est reconstruite car SQLite ne sait pas ajouter une colonne avec une date par défaut)
      `CREATE TABLE transactions_neuf ( -- Nouvelle version de la table des transactions
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique
        trx_id TEXT NOT NULL UNIQUE, -- ID de transaction (SMS OM, ou généré en saisie manuelle)
        allocation_id INTEGER REFERENCES allocation_budget (id) ON DELETE RESTRICT, -- Allocation ; vide = transaction « non classée »
        insert_type TEXT NOT NULL CHECK (insert_type IN ('manuel', 'auto')), -- manuel ou auto (depuis un SMS)
        debit_credit INTEGER NOT NULL CHECK (debit_credit IN (-1, 1)), -- -1 = dépense, 1 = alimentation du budget
        montant INTEGER NOT NULL CHECK (typeof(montant) = 'integer' AND montant > 0), -- Montant toujours positif
        sms TEXT, -- Texte du SMS d'origine (vide si saisie manuelle)
        date_operation TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Date réelle de l'opération (ISO UTC)
        note TEXT CHECK (note IS NULL OR length(note) <= 200), -- Note libre facultative (200 caractères au plus)
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Date d'insertion automatique
        CHECK (insert_type = 'auto' OR sms IS NULL) -- Un SMS n'est renseigné que pour une transaction automatique
      )`, // Fin de la nouvelle table
      `INSERT INTO transactions_neuf (id, trx_id, allocation_id, insert_type, debit_credit, montant, sms, date_operation, insert_date) -- Recopie les transactions existantes
        SELECT id, trx_id, allocation_id, insert_type, debit_credit, montant, sms, insert_date, insert_date FROM transactions`, // Pour les anciennes lignes, la date de l'opération = la date d'insertion
      `DROP TABLE transactions`, // Supprime l'ancienne table
      `ALTER TABLE transactions_neuf RENAME TO transactions`, // La nouvelle table prend le nom définitif
      `CREATE INDEX idx_transactions_allocation ON transactions (allocation_id)`, // Accélère le calcul du solde d'une allocation
      `CREATE INDEX idx_transactions_date ON transactions (date_operation)`, // Accélère le tri par date
    ], // Fin des instructions de la migration 2
  }, // Fin de la migration 2
  { // Début de la migration 3 : nature des transactions (normale, report, transfert)
    version: 3, // Numéro de version de la base après cette migration
    instructions: [ // Liste des instructions SQL
      `ALTER TABLE transactions ADD COLUMN nature TEXT NOT NULL DEFAULT 'normale' CHECK (nature IN ('normale', 'report', 'transfert'))`, // « normale » = saisie de l'utilisateur ; « report » et « transfert » = mouvements générés par l'application (lecture seule)
    ], // Fin des instructions de la migration 3
  }, // Fin de la migration 3
  { // Début de la migration 4 : dépense « déjà comprise dans le solde OM »
    version: 4, // Numéro de version de la base après cette migration
    instructions: [ // Liste des instructions SQL
      `ALTER TABLE transactions ADD COLUMN comprise_dans_solde INTEGER NOT NULL DEFAULT 0 CHECK (comprise_dans_solde IN (0, 1))`, // 1 = dépense oubliée, déjà retirée du solde OM réel saisi ensuite : elle ne doit pas être retirée une seconde fois du solde disponible
    ], // Fin des instructions de la migration 4
  }, // Fin de la migration 4
  { // Début de la migration 5 : SMS Orange Money non compris (à revoir par l'utilisateur)
    version: 5, // Numéro de version de la base après cette migration
    instructions: [ // Liste des instructions SQL
      `CREATE TABLE sms_illisible ( -- SMS Orange Money que l'application n'a pas compris
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique
        date_sms TEXT NOT NULL, -- Date de réception du SMS (ISO UTC)
        texte TEXT NOT NULL, -- Texte du SMS
        ignore INTEGER NOT NULL DEFAULT 0 CHECK (ignore IN (0, 1)), -- 1 = l'utilisateur a choisi de l'ignorer
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Date d'insertion automatique
        UNIQUE (date_sms, texte) -- Un même SMS n'est listé qu'une fois (import répétable sans doublon)
      )`, // Fin de la table sms_illisible
    ], // Fin des instructions de la migration 5
  }, // Fin de la migration 5
  { // Début de la migration 6 : opérations USSD dynamiques et leur attente de confirmation par SMS
    version: 6, // Numéro de version de la base après cette migration
    instructions: [ // Liste des instructions SQL
      `CREATE TABLE operation_ussd ( -- Modèle d'opération lancée par un code USSD (retrait, paiement…)
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique
        nom TEXT NOT NULL UNIQUE CHECK (length(trim(nom)) BETWEEN 1 AND 60), -- Nom affiché, unique
        type TEXT NOT NULL CHECK (type IN ('sortie', 'entree')), -- Sortie = dépense d'un budget ; entrée = argent reçu
        code TEXT NOT NULL CHECK (length(code) BETWEEN 3 AND 100), -- Code USSD avec variables {numero}, {montant}, {pin}
        budget_id INTEGER REFERENCES budget (id) ON DELETE RESTRICT, -- Budget débité (obligatoire pour une sortie)
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Date d'insertion automatique
        CHECK ((type = 'sortie' AND budget_id IS NOT NULL) OR (type = 'entree' AND budget_id IS NULL)) -- Une sortie a un budget, pas une entrée
      )`, // Fin de la table operation_ussd
      `CREATE TABLE ussd_en_attente ( -- Opération USSD envoyée, en attente du SMS de confirmation qui sera classé dans le budget
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique
        operation_id INTEGER REFERENCES operation_ussd (id) ON DELETE SET NULL, -- Modèle utilisé (peut disparaître ensuite)
        operation_nom TEXT NOT NULL, -- Nom du modèle au moment de l'envoi
        numero TEXT, -- Numéro de téléphone utilisé (facultatif)
        montant INTEGER NOT NULL CHECK (typeof(montant) = 'integer' AND montant > 0), -- Montant demandé, entier
        budget_id INTEGER NOT NULL REFERENCES budget (id) ON DELETE CASCADE, -- Budget à débiter
        date_envoi TEXT NOT NULL, -- Instant d'envoi (ISO UTC)
        reponse TEXT, -- Réponse affichée par Orange Money
        statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'classee', 'echec', 'expiree', 'annulee')), -- État
        raison TEXT, -- Explication en cas d'échec
        transaction_id INTEGER REFERENCES transactions (id) ON DELETE SET NULL, -- Dépense classée grâce à cette opération
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) -- Date d'insertion automatique
      )`, // Fin de la table ussd_en_attente
    ], // Fin des instructions de la migration 6
  }, // Fin de la migration 6
  { // Début de la migration 7 : modèles de SMS réglables (reconnaissance dynamique des champs des SMS de l'opérateur)
    version: 7, // Numéro de version de la base après cette migration
    instructions: [ // Liste des instructions SQL
      `CREATE TABLE modele_sms ( -- Modèle de SMS : un gabarit (une ligne par information) qui décrit un type de SMS de l'opérateur
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant automatique
        nom TEXT NOT NULL UNIQUE CHECK (length(trim(nom)) BETWEEN 1 AND 60), -- Nom affiché, unique
        sens TEXT NOT NULL CHECK (sens IN ('debit', 'credit', 'ignorer')), -- Dépense, argent reçu, ou SMS à ignorer
        gabarit TEXT NOT NULL CHECK (length(gabarit) BETWEEN 3 AND 1500), -- Une ligne par information, avec des variables entre accolades
        note TEXT CHECK (note IS NULL OR length(note) <= 200), -- Libellé de la transaction créée (variables permises)
        position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position >= 1), -- Ordre d'essai : le premier modèle qui correspond gagne
        actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)), -- 0 = modèle désactivé
        insert_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) -- Date d'insertion automatique
      )`, // Fin de la table modele_sms
      ...MODELES_PAR_DEFAUT.map((m, i) => `INSERT INTO modele_sms (nom, sens, gabarit, note, position) VALUES (${sqlTexte(m.nom)}, ${sqlTexte(m.sens)}, ${sqlTexte(m.gabarit)}, ${m.note === null ? "NULL" : sqlTexte(m.note)}, ${i + 1})`), // Modèles livrés (formats Orange Money actuels)
    ], // Fin des instructions de la migration 7
  }, // Fin de la migration 7
]; // Fin de la liste des migrations
