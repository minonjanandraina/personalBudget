# Plan de sprints — Gestion de Budget

Référence fonctionnelle : [CLAUDE.md](CLAUDE.md). Chaque sprint se termine par une démo sur Termux et des tests verts.

Dépendances externes (à fournir avant le sprint concerné) :
- Exemples de SMS Orange Money → **avant le sprint 7**.
- Code USSD de consultation du solde → **avant le sprint 8**.

---

## Sprint 0 — Initialisation du projet ✅ TERMINÉ
- Environnement Termux : Python, pip, venv, installation de Django (sans dépendance à compilation lourde).
- Création du projet Django et des apps (`core`, `budgets`, `transactions`, `sms`).
- Settings : SQLite, fuseau `Indian/Antananarivo`, langue `fr`, fichiers statiques.
- Dépôt git, `.gitignore`, `requirements.txt`, README de lancement (`runserver 0.0.0.0`).
- Compte unique via `createsuperuser`.

**Livrable** : serveur qui démarre sur Termux et page d'accueil accessible depuis le téléphone.

## Sprint 1 — Modèles de données et administration ✅ TERMINÉ
- Modèles : SoldeOM, TypeBudget (code auto `bdg-001`), Budget, AllocationBudget, Transaction (avec `sms`, `trx_id` unique, auto-génération pour saisie manuelle), ParametreJob (ligne unique).
- Migrations, contraintes (montants entiers, `montant` positif, `debit_credit` ∈ {-1, 1}).
- Enregistrement dans l'admin Django pour vérifier le modèle.
- Tests unitaires des modèles (code auto, unicité, ligne unique ParametreJob).

**Livrable** : base créée, modèles manipulables via l'admin.

## Sprint 2 — Socle UI mobile first et authentification ✅ TERMINÉ
- Base de templates : Bootstrap, CSS personnalisé, navigation par grandes tuiles/icônes (style iPhone), zones tactiles ≥ 48 px.
- HTMX intégré, convention `partials/`.
- Login/logout Django Auth, toutes les vues protégées (`login_required`).
- Tableau de bord vide (structure des tuiles : solde OM, budgets, alertes).
- Animations JS vanilla de base (transitions, feedback tactile).

**Livrable** : connexion, navigation et tableau de bord squelette.

## Sprint 3 — Solde OM, types de budget et budgets (CRUD)
- Saisie manuelle du solde initial OM + historique des soldes.
- CRUD TypeBudget et Budget (formulaires HTMX, validation).
- Écran paramètres : `start_day_int` (ParametreJob).
- Tests des vues et formulaires.

**Livrable** : flux 1 à 3 de CLAUDE.md utilisable.

## Sprint 4 — Allocations et transactions manuelles
- Service d'allocation (période `date_from`/`date_to`, création des transactions `debit_credit = 1`).
- Saisie manuelle des transactions (génération du `trx_id`, `insert_type = manuel`).
- Règles de contrôle :
  - dépense bloquée si solde du budget < montant de la dépense ;
  - allocation refusée si `SUM(transactions du budget) + allocation < montant_min`.
- Calcul du solde par budget, liste des transactions filtrable.
- Tests unitaires des règles de contrôle.

**Livrable** : allocation et dépenses manuelles fonctionnelles, avec blocages.

## Sprint 5 — Réallocation de fin de période
- Service de réallocation : reliquat reporté au mois suivant (montant budget + reliquat).
- Marquage « solde dépassant le plafond » si le total > `montant_max` + écran de réallocation manuelle.
- Bouton d'allocation/réallocation dans l'UI.
- Commande de management `allocate_budgets` (budgets `autogen_fin_mois`, jour = `start_day_int`), idempotente.
- Tests : exemple 100 000 / 60 000 → 40 000 reportés, dépassement de plafond, idempotence.

**Livrable** : cycle mensuel complet, déclenchable par bouton et par commande.

## Sprint 6 — Alertes
- Alerte seuil min : solde du budget < `solde_alert`.
- Alerte plafond dépassé (réallocation manuelle requise).
- Alerte dépense non enregistrée : écart ≠ 0 entre solde OM et somme des transactions (aucune tolérance).
- Bandeaux/badges sur le tableau de bord (dans l'app uniquement), rafraîchissement HTMX.
- Tests unitaires de chaque alerte.

**Livrable** : flux 5 et 6 de CLAUDE.md opérationnels.

## Sprint 7 — Import des SMS Orange Money *(dépend des exemples de SMS)*
- Parser SMS : `trx_id`, montant, débit/crédit, solde après opération, date, code budget dans l'objet.
- Commande `import_sms` : lecture via `termux-sms-list`, création Transaction (`insert_type = auto`, champ `sms` renseigné) + SoldeOM.
- Idempotence via `trx_id` ; transactions sans code reconnu → « non classées » + écran d'affectation manuelle.
- Gestion des SMS illisibles (journalisation, écran de revue).
- Tests unitaires du parsing sur les exemples réels anonymisés.

**Livrable** : les SMS OM alimentent automatiquement transactions et soldes.

## Sprint 8 — Consultation USSD du solde *(dépend du code USSD)*
- Exécution de la consultation USSD depuis Termux et enregistrement d'un SoldeOM.
- Bouton « Consulter le solde » dans l'UI.
- Tests avec USSD simulé (mock).

**Livrable** : solde OM vérifiable à la demande.

## Sprint 9 — Planification, sauvegarde et exploitation
- Crontab Termux : `import_sms`, `allocate_budgets`, `backup_db`.
- Commande `backup_db` : sauvegarde SQLite (API backup) vers le stockage du téléphone, nom daté `db_YYYY-MM-DD_HH-MM-SS.sqlite3`, rotation éventuelle.
- Script de démarrage du serveur au lancement de Termux (`termux-wake-lock`, Termux:Boot).
- Documentation d'installation et d'exploitation.

**Livrable** : l'application tourne seule sur le téléphone.

## Sprint 10 — Finition UI et durcissement
- Polissage mobile : animations, états vides, messages d'erreur, accessibilité.
- Sécurité : `DEBUG=False`, `ALLOWED_HOSTS`, clé secrète hors dépôt, protection CSRF sur les fragments HTMX.
- Performance sur téléphone (requêtes N+1, pagination des transactions).

**Livrable** : application stable et utilisable au quotidien.

## Sprint 11 — Tests de non-régression et recette
- Consolidation de la suite de tests (unitaires + intégration) : allocation, réallocation, contrôles, alertes, import SMS, sauvegarde.
- Scénario de bout en bout : solde initial → types → budgets → allocation → dépenses (manuelles + SMS) → alertes → réallocation → sauvegarde.
- Jeu de données de démonstration (fixtures) et exécution complète sur Termux.
- Correction des anomalies, checklist de recette, tag de version `v1.0`.

**Livrable** : version 1.0 validée, suite de non-régression rejouable à chaque modification.
