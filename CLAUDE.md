# Gestion de Budget personnel

## Contexte

Serveur web Django, lancé avec **Termux** sur téléphone Android, pour gérer un budget personnel en Ariary (Ar). Le budget est suivi à partir d'un compte **Orange Money (OM)** : les SMS OM alimentent automatiquement les transactions et les soldes.

- Application **mono-utilisateur** (un seul compte Django Auth, créé via `createsuperuser`, pas d'inscription).
- Monnaie : Ariary (Ar), montants entiers (`BigIntegerField` ou `DecimalField(decimal_places=0)`, jamais de float).
- Langue de l'interface et du code métier : français. Fuseau : `Indian/Antananarivo`.

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Django (Python), compatible Termux (pas de dépendance nécessitant une compilation lourde) |
| Frontend — interactions | HTMX (appels backend partiels) |
| Frontend — mise en page | Bootstrap + CSS personnalisé |
| Frontend — animations | JavaScript Vanilla |
| Base de données | SQLite |
| Authentification | Django Auth |
| Tâches planifiées | crontab Termux (`termux-job-scheduler`/`crond`) appelant des commandes `manage.py` |
| SMS | Termux:API (`termux-sms-list`) |
| Design | Mobile first, gros icônes façon application native iPhone 17 |

## Modèle de données

Tous les modèles ont `insert_date` (auto, `auto_now_add`).

### SoldeOM (balance du compte Orange Money)
Un solde est enregistré à chaque SMS reçu ou à chaque consultation. Vérification possible via USSD (le code sera fourni dans un autre modèle/document).
- `id`
- `datetime` : date/heure du solde (réception du SMS)
- `balance` : montant disponible sur le compte OM
- `insert_date`

### TypeBudget
- `id`
- `code` : auto-généré, format `bdg-001`, unique
- `name`
- `insert_date`

### Budget
- `name` : ex. écolage, frais scolaires, loisirs…
- `type` : FK → TypeBudget
- `montant_budget` : montant alloué chaque mois
- `montant_max` : plafond du budget
- `montant_min` : solde minimal exigé après une transaction d'allocation (`debit_credit = 1`) ; contrôle de validation à la création (voir « Contrôle des allocations »)
- `solde_alert` : seuil minimal du budget déclenchant une alerte
- `autogen_fin_mois` : booléen ; si vrai, l'allocation est générée automatiquement par le job
- `insert_date`

### AllocationBudget (allocation d'un budget pour une période)
- `date_from`, `date_to`
- `budget` : FK → Budget
- `montant_alloue` : montant effectivement alloué (montant_budget + reliquat reporté, plafonné par `montant_max`)
- `insert_date`

### Transaction
- `trx_id` : ID de transaction issu du SMS OM ; auto-généré pour une saisie manuelle (SMS non reçu). Unique (évite les doublons à l'import).
- `allocation` : FK → AllocationBudget
- `insert_date`
- `insert_type` : `manuel` ou `auto` (auto = depuis SMS)
- `debit_credit` : `-1` dépense, `1` alimentation du budget (lors de l'allocation)
- `montant` : toujours positif, le signe vient de `debit_credit`
- `sms` : texte brut du SMS OM d'origine (`TextField`, nullable/blank) ; renseigné uniquement si la transaction vient d'un SMS (`insert_type = auto`), vide pour une saisie manuelle
- Classement dans un budget : selon le **code budget présent dans l'objet du SMS** ; sans code reconnu, la transaction reste « non classée » et doit être affectée manuellement.

### ParametreJob (une seule ligne)
- `id`
- `start_day_int` : jour du mois de lancement du job d'allocation/réallocation (ex. `20` = tous les 20 du mois)

## Flux fonctionnel

1. **Début** : saisie manuelle du solde initial du compte OM.
2. Création des types de budget.
3. Création des budgets.
4. **Allocation / réallocation** : déclenchée par un bouton et par un job crontab Termux (jour = `start_day_int`). Le reliquat non dépensé est reporté au mois suivant.
   Exemple : budget loisirs = 100 000 Ar, dépenses = 60 000 Ar → 40 000 Ar reportés ; allocation suivante = 100 000 + 40 000.
   Si le total dépasse `montant_max`, l'allocation n'est pas tronquée : le budget est **marqué « solde dépassant le plafond »** et une **réallocation manuelle** est demandée à l'utilisateur (alerte dans l'app).
5. **Alerte seuil min** : le solde restant d'un budget passe sous `solde_alert`.
   **Contrôle des dépenses** : si le solde disponible du budget < montant de la dépense, la transaction est **bloquée** ; une réallocation manuelle est nécessaire avant de pouvoir l'enregistrer.
   **Contrôle des allocations** : une transaction `debit_credit = 1` est refusée si le solde du budget après allocation est < `montant_min`, soit `SUM(transactions du budget, signées par debit_credit) + montant de l'allocation < montant_min`.
6. **Alerte dépense non enregistrée** : écart entre le solde OM et la somme des transactions (allocations + dépenses). **Aucun seuil de tolérance** : tout écart ≠ 0 déclenche l'alerte.

Les alertes sont affichées **dans l'application uniquement** (bandeau/badge sur le tableau de bord).

## Import des SMS (Termux:API)

- Un script Termux planifié par cron lit les SMS OM (`termux-sms-list`) et les envoie à l'application (commande `manage.py` ou endpoint POST protégé par un jeton).
- Le parsing extrait : `trx_id`, montant, type (débit/crédit), solde après opération, date, code budget éventuel dans l'objet.
- Chaque SMS crée une `Transaction` (si pas déjà existante via `trx_id`) et un `SoldeOM`.
- Le job doit être **idempotent** : relancer l'import ne crée jamais de doublons.

## Sauvegarde

Export périodique (cron Termux) de la base SQLite vers le stockage du téléphone, avec un nom de fichier daté, ex. `db_2026-10-05_14-30-00.sqlite3`. Utiliser l'API de sauvegarde SQLite (`.backup` / `sqlite3.Connection.backup`) plutôt qu'une simple copie, pour éviter un fichier corrompu en cours d'écriture. Commande de management prévue : `backup_db`.

## Conventions

- Mobile first : navigation par grandes tuiles/icônes, zones tactiles ≥ 48 px.
- HTMX : retourner des fragments de template (`partials/`) pour les mises à jour partielles.
- Logique métier (allocation, parsing SMS, alertes) dans des modules de service testables, pas dans les vues.
- Les jobs sont des commandes de management Django (`allocate_budgets`, `import_sms`) pour être appelables depuis cron.
- Tests unitaires obligatoires pour : calcul de réallocation, parsing SMS, détection d'écart de solde.

## Questions ouvertes

À traiter plus tard :
- Format exact des SMS Orange Money (3–4 exemples anonymisés : dépense, crédit, consultation de solde) → nécessaire avant d'implémenter le parsing.
- Code USSD de consultation du solde et façon de l'exécuter depuis Termux.


note de travail:

1- regarde toujours claude.md et met à jour si changement dans le scope (même des changements minim sans précisé dans claude.md)
2- rajout toujours ici les changements que je demande dans le chat (supprime si on revient en arriere)
3- pour les sprints de travails, verifie SPRINTS.md
4- quand tu commences un sprint, met à jour le sprint à 'encours'
5- après avoir terminé un sprint, marque comme terminé le sprint 
6- ne jamais decidé seul si une fonctionnalité n'est pas 100% sure que ça converge avec notre besoins