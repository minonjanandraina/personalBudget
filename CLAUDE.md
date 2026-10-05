# Volako — gestion de budget personnel (application Android)

## Contexte

Application **Android (APK)** de gestion de budget personnel en Ariary (Ar), **100 % hors ligne** : base de données locale sur le téléphone, aucun serveur, aucun cloud, aucune connexion requise. Le budget est suivi à partir d'un compte **Orange Money (OM)** : les SMS OM alimentent les transactions et les soldes.

- **Open source** (dépôt public GitHub : `minonjanandraina/personalBudget`).
- **Android uniquement.** iOS n'est pas une cible, ni maintenant ni plus tard (choix de principe : écosystème Apple fermé et commercial).
- Application **mono-utilisateur**, sans compte ni inscription.
- Monnaie : Ariary (Ar), montants **entiers** (jamais de float).
- Langue de l'interface et du code métier : français. Fuseau : `Indian/Antananarivo` (UTC+3, sans heure d'été).

## Profil du développeur et contraintes d'environnement

- Ne code pas lui-même : Claude écrit tout le code, le propriétaire le lit et le valide. Ne connaît que **Python** (JavaScript ~10 %) ; ne connaît ni Java, ni Kotlin, ni Flutter. Doit pouvoir **lire et comprendre** tout le code.
- Édite avec **VS Code**. N'utilise pas Android Studio.
- Environnement de dev restreint (poste d'entreprise) : Wi-Fi/hotspot très limités, Bluetooth et USB inutilisables. Le **seul canal pour transférer l'APK est Google Drive** (téléchargement de l'APK sur le téléphone depuis Drive, puis installation).
- Poste de dev : Windows 11. Pas de dépendance à un émulateur, à WSL ni à une toolchain Android locale. **Python/Kivy ne fonctionne pas** sur ce poste (contraintes WSL).

## Choix technique

**JavaScript + Capacitor** : l'application est écrite comme une page web (HTML, CSS, JavaScript) que Capacitor empaquette dans un APK Android. Seule une petite partie native (SMS, USSD, export de fichiers) est écrite en **Kotlin** dans un plugin Capacitor ; elle est écrite par Claude, courte et commentée ligne par ligne.

Pourquoi ce choix :
- **Kivy/Python écarté** : ne fonctionne pas sur le poste de dev (contraintes WSL).
- **Tout se teste sous Windows, dans le navigateur** (`npm run dev`), sans WSL, sans émulateur, sans téléphone branché : le seul transfert vers le téléphone est l'APK via Google Drive, donc la boucle « modifier → voir le résultat » doit se faire sur le PC.
- **JavaScript** est le langage le plus proche de ce que connaît le propriétaire (Python, JS ~10 %), et le plus lisible avec des commentaires partout. Pas de TypeScript, pas de framework (React, Vue…) : du JavaScript simple en modules.
- **Accès natif Android** (lecture SMS, USSD) possible via un plugin Capacitor en Kotlin ; c'est le point que les solutions « web » pures ne couvrent pas.
- **SQLite locale** via le plugin `@capacitor-community/sqlite` : vraie base SQL sur le téléphone, sans serveur.
- **Build dans le cloud** (GitHub Actions) : pas d'Android Studio ni de SDK Android sur le poste.

Alternatives écartées : Kotlin natif (aucune prévisualisation sans Android Studio/émulateur, inconnu du développeur), Flutter/Dart (inconnu), React Native (plus lourd, nécessite émulateur/téléphone pour tester), Kivy et BeeWare/Flet (Python, ne tournent pas sur le poste ou accès SMS/USSD incertain).

Limites assumées :
- Il faut **Node.js** sur le poste Windows (installation sans droits admin possible en version « zip » — à vérifier sur le poste de la PAMF).
- Le plugin Kotlin (SMS/USSD) ne peut **pas être testé sur le PC** : il n'est vérifiable que sur le téléphone, via l'APK. Il est volontairement minimal, et l'application affiche des messages d'erreur clairs.
- Rendu « application native » obtenu en CSS (grosses tuiles, barre de navigation basse), pas avec des composants natifs.

| Couche | Technologie |
|---|---|
| Langage | JavaScript (modules ES), Kotlin uniquement pour le plugin Android |
| Interface | HTML + CSS personnalisé (mobile first) + JavaScript sans framework |
| Empaquetage Android | Capacitor |
| Base de données | SQLite locale (`@capacitor-community/sqlite` sur Android ; version navigateur pour le développement sous Windows) |
| API Android (SMS, USSD, fichiers) | Plugin Capacitor maison en Kotlin |
| Tests | Vitest (logique métier, sous Windows) |
| Build APK | Gradle, exécuté par **GitHub Actions** (le poste Windows ne compile pas l'APK) |
| Distribution | APK téléchargé depuis GitHub (artefact) → Google Drive → téléphone |

## Chaîne de travail (build et livraison)

1. Développement dans VS Code sous Windows : `npm run dev` ouvre l'application dans le navigateur (avec des **simulateurs** pour SMS/USSD/fichiers).
2. Tests : `npm test`.
3. `git push` → GitHub Actions lance le build Gradle sur Linux et publie l'**APK** (artefact ou Release).
4. Télécharger l'APK, le déposer sur Google Drive, le télécharger depuis le téléphone, l'installer (autoriser les sources inconnues).
5. **Signature** : toujours la **même clé de signature** (stockée dans les secrets GitHub). Une clé différente empêche la mise à jour de l'app et oblige à la désinstaller, ce qui **efface la base locale**. D'où l'importance de la sauvegarde/restauration (voir plus bas).

## Architecture du code

Trois couches, pour que la logique métier se teste sans téléphone :
- `src/core/` : logique métier en **JavaScript pur** (accès base, services d'allocation, contrôles, alertes, parsing SMS). **Aucun appel à Capacitor ni au navigateur.** Entièrement testable avec Vitest sur Windows.
- `src/ui/` : écrans (tableau de bord, budgets, transactions…). N'appelle que `core/` et `platform/`.
- `src/platform/` : adaptateurs Android (lecture des SMS, USSD, export de fichiers). Chaque adaptateur a une **version Android** (plugin Kotlin dans `android-plugin/`) et une **version simulée** pour le navigateur (ex. lit un fichier de SMS d'exemple).

### Interface : choix d'implémentation (sprint 3)
- Pas de framework : les éléments sont fabriqués par `h()` (`src/ui/dom.js`), qui insère toujours le texte comme **texte** (jamais comme HTML) pour empêcher toute injection.
- Navigation par **adresse avec `#`** (`src/ui/routeur.js`) : le bouton Retour d'Android fonctionne sans code supplémentaire. Les écrans sont dans `src/ui/ecrans/`.
- Coque (`src/ui/coque.js`) : zone de contenu + barre d'onglets en bas. Un onglet ou une tuile sans route est grisé « bientôt » jusqu'à ce que l'écran existe.
- Composants réutilisables : `composants.js` (carte, tuile, alerte, bouton, champ avec erreur), `messages.js` (notifications et fenêtre de confirmation), `icones.js` (icônes SVG intégrées, hors ligne), `animations.js` (désactivées si « réduire les animations »).
- Thème clair et sombre automatiques selon le téléphone.
- Saisies : le texte tapé est lu par `analyserMontant` (entiers seulement, espaces entre milliers acceptés, virgule/point/signe refusés). La logique métier lance `ErreurValidation` (message par champ, affiché sous le champ) ou `ErreurMetier` (message unique, affiché en notification) ; l'écran n'a pas à connaître les règles.
- Routes à paramètres (`/budgets/:id`) ; les onglets de la barre du bas restent actifs sur leurs sous-écrans (`prefixes`). Suppressions toujours avec confirmation, et refusées avec un message clair si l'élément est utilisé.
- Tests d'interface : Vitest avec `jsdom` (version 25, compatible avec Node 20.17 du poste de dev).

### Base de données : choix d'implémentation (sprint 2)
- Deux adaptateurs interchangeables dans `src/platform/` (mêmes fonctions `executer`, `requeter`, `transaction`, `fermer`) : `base-capacitor.js` (SQLite du téléphone, plugin `@capacitor-community/sqlite`) et `base-sqljs.js` (sql.js, SQLite en WebAssembly, pour les tests et le navigateur). `base.js` choisit selon l'environnement.
- Schéma et migrations dans `src/core/db/` ; version du schéma gardée dans la table `meta`. On n'édite jamais une migration publiée : on en ajoute une.
- Règles d'intégrité (montants entiers `typeof = 'integer'`, `montant_min` ≤ `montant_max`, `trx_id` unique, une allocation par budget et par période, ligne unique de `parametre_job`…) imposées **par la base elle-même** (CHECK, UNIQUE, clés étrangères `ON DELETE RESTRICT`).
- Dates en texte ISO 8601 : instants en UTC (`2026-10-05T10:30:00.000Z`), jours en `AAAA-MM-JJ`.
- La base du navigateur (développement) est gardée dans le `localStorage` ; elle n'a aucun lien avec celle du téléphone.
- Le fichier de la base sur le téléphone est dans le dossier privé de l'application (à exporter pour la sauvegarde, sprint 8).

## Modèle de données

Tous les enregistrements ont `insert_date` (date d'insertion automatique).

### SoldeOM (balance du compte Orange Money)
Un solde est enregistré à chaque SMS reçu ou à chaque consultation. Vérification possible via USSD (le code sera fourni plus tard).
- `id`
- `datetime` : date/heure du solde (réception du SMS)
- `balance` : montant disponible sur le compte OM
- `insert_date`

### TypeBudget
- `id`
- `code` : auto-généré, format `bdg-001`, unique, jamais réutilisé après suppression
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
- Règles de saisie : `montant_min` ≤ `montant_max` ; `montant_budget` ≤ `montant_max`.

### AllocationBudget (allocation d'un budget pour une période)
- `date_from`, `date_to` (`date_to` ≥ `date_from`)
- `budget` : FK → Budget
- `montant_alloue` : montant effectivement alloué (`montant_budget` + reliquat reporté ; **jamais tronqué** par `montant_max`)
- `insert_date`
- Une seule allocation par budget et par période (`budget` + `date_from` unique).

### Transaction
- `trx_id` : ID de transaction issu du SMS OM ; auto-généré pour une saisie manuelle (SMS non reçu). Unique (évite les doublons à l'import).
- `allocation` : FK → AllocationBudget, **vide** tant qu'une transaction issue d'un SMS n'est pas classée
- `insert_date`
- `date_operation` : date réelle de l'opération (ISO UTC) ; par défaut maintenant, modifiable pour une dépense passée ; pour un SMS, la date du SMS
- `note` : libellé libre facultatif (200 caractères au plus)
- `insert_type` : `manuel` ou `auto` (auto = depuis SMS)
- `debit_credit` : `-1` dépense, `1` alimentation du budget (lors de l'allocation)
- `montant` : toujours > 0, le signe vient de `debit_credit`
- `sms` : texte brut du SMS OM d'origine ; renseigné uniquement si la transaction vient d'un SMS (`insert_type = auto`), vide pour une saisie manuelle
- Classement dans un budget : selon le **code budget présent dans l'objet du SMS** ; sans code reconnu, la transaction reste « non classée » et doit être affectée manuellement.

### ParametreJob (une seule ligne)
- `id`
- `start_day_int` : jour du mois de lancement de l'allocation/réallocation (ex. `20` = tous les 20 du mois), de 1 à 28

## Règles de calcul des soldes et des périodes (décidées au sprint 5)

- **Période d'une allocation** : du jour J au jour J-1 du mois suivant, J = `start_day_int` (ex. J = 20 : du 20 octobre au 19 novembre). La période en cours est celle qui contient la date du jour.
- **Solde d'un budget = solde PAR PÉRIODE** : somme signée (`debit_credit × montant`) des transactions de l'allocation de la période. Le reliquat d'une période est reporté à la suivante par une opération de transfert explicite (-reliquat sur l'ancienne période, +reliquat sur la nouvelle), à écrire au sprint 6.
- **Allocation** : crée (ou complète) l'allocation de la période en cours et une transaction `debit_credit = 1`. `montant_alloue` = total des alimentations de la période. Refusée si solde après allocation < `montant_min`. Un plafond dépassé est signalé, jamais tronqué.
- **Dépense manuelle** : rangée dans l'allocation du budget dont la période contient la `date_operation` ; refusée s'il n'y en a pas, ou si le solde de cette période est inférieur au montant. Date future refusée (5 minutes de tolérance).
- **Modification / suppression** (décidé au sprint 5) : possibles uniquement pour les opérations **manuelles** rattachées à un budget (jamais celles issues d'un SMS, laissées telles que reçues). On modifie le montant, la note et, pour une dépense, la date (une dépense peut ainsi changer de période). Garde-fou : le solde d'une période ne doit jamais devenir négatif (ni en réduisant une allocation, ni en la supprimant tant que des dépenses en dépendent). Supprimer la dernière opération d'une allocation supprime l'allocation vide : le budget redevient « non alloué ».

## Flux fonctionnel

1. **Début** : saisie manuelle du solde initial du compte OM.
2. Création des types de budget.
3. Création des budgets.
4. **Allocation / réallocation** : déclenchée par un bouton et automatiquement au jour `start_day_int` (voir « Planification »). Le reliquat non dépensé est reporté au mois suivant.
   Exemple : budget loisirs = 100 000 Ar, dépenses = 60 000 Ar → 40 000 Ar reportés ; allocation suivante = 100 000 + 40 000.
   Si le total dépasse `montant_max`, l'allocation n'est pas tronquée : le budget est **marqué « solde dépassant le plafond »** et une **réallocation manuelle** est demandée à l'utilisateur (alerte dans l'app).
5. **Alerte seuil min** : le solde restant d'un budget passe sous `solde_alert`.
   **Contrôle des dépenses** : si le solde disponible du budget < montant de la dépense, la transaction est **bloquée** ; une réallocation manuelle est nécessaire avant de pouvoir l'enregistrer.
   **Contrôle des allocations** : une transaction `debit_credit = 1` est refusée si le solde du budget après allocation est < `montant_min`, soit `SUM(transactions du budget, signées par debit_credit) + montant de l'allocation < montant_min`.
6. **Alerte dépense non enregistrée** : écart entre le solde OM et la somme des transactions (allocations + dépenses). **Aucun seuil de tolérance** : tout écart ≠ 0 déclenche l'alerte.

Les alertes sont affichées **dans l'application uniquement** (bandeau/badge sur le tableau de bord).

## Fonctions Android

- **Lecture des SMS OM** : permission `READ_SMS`, lecture de la boîte de réception filtrée sur l'expéditeur Orange Money (nom à confirmer avec les exemples de SMS). Déclenchée à l'ouverture de l'app et par un bouton « Synchroniser ». Le parsing extrait : `trx_id`, montant, débit/crédit, solde après opération, date, code budget éventuel. Chaque SMS crée une `Transaction` (si `trx_id` pas déjà présent) et un `SoldeOM`. L'import est **idempotent** : le relancer ne crée jamais de doublons.
- **Consultation USSD du solde** : via l'API téléphonie d'Android, appelée depuis le plugin Kotlin (permissions `CALL_PHONE` et `READ_PHONE_STATE`). Code USSD à fournir.
- **Planification** : l'application n'a pas de cron. À chaque ouverture, elle vérifie si le jour `start_day_int` du mois est passé sans allocation pour les budgets `autogen_fin_mois`, et la génère (rattrapage). *(À valider : une exécution en arrière-plan sans ouvrir l'app est possible mais plus complexe.)*
- **Sauvegarde / restauration** : export de la base SQLite vers un dossier accessible du téléphone (ex. Téléchargements), nom de fichier daté `db_2026-10-05_14-30-00.sqlite3`, en copiant la base de façon cohérente (jamais pendant une écriture) pour éviter un fichier corrompu. Une fonction de **restauration** depuis un de ces fichiers est prévue (données uniquement locales). Le fichier peut ensuite être copié sur Google Drive à la main.

## Conventions

- **Chaque ligne de code est accompagnée d'un commentaire en français**, car le propriétaire lit le code sans être développeur. Cela vaut pour le JavaScript, le HTML, le CSS, le Kotlin et les fichiers de configuration qui le permettent.
- Mobile first : navigation par grandes tuiles/icônes, zones tactiles ≥ 48 dp.
- Logique métier (allocation, parsing SMS, alertes, contrôles) dans `src/core/`, jamais dans `src/ui/`.
- Tout code spécifique à Android passe par `src/platform/`, avec une version simulée pour le navigateur.
- Tests unitaires (Vitest) obligatoires pour : calcul de réallocation, contrôles d'allocation/dépense, parsing SMS, détection d'écart de solde, idempotence de l'import.
- Dépendances limitées au strict nécessaire (Capacitor, plugin SQLite, Vitest) ; pas de framework front.

## Historique

Un prototype **Django** (sprints 0 à 3 : modèles, interface mobile, CRUD solde/types/budgets/paramètres) a été réalisé avant le changement de cible. Il est archivé dans `legacy_django/` comme **référence fonctionnelle** (règles métier et tests).

## Décisions prises

- **Nom de l'application : Volako.**
- **Identifiant de paquet : `org.minonja.volako`** (proposé par Claude, à confirmer : il ne pourra plus changer une fois l'app installée avec des données).
- **Android 8 (API 26) minimum.**
- **Verrouillage par code PIN : oui** (PIN demandé à l'ouverture ; PIN stocké sous forme de hachage, jamais en clair ; limite d'essais à définir au sprint 11).
- Node.js 20 est installé sur le poste de dev.

## Questions ouvertes

À traiter plus tard :
- Format exact des SMS Orange Money (3–4 exemples anonymisés : dépense, crédit, consultation de solde) → nécessaire avant d'implémenter le parsing.
- Code USSD de consultation du solde.

À décider avant le sprint 11 :
- Exécution automatique en arrière-plan de l'allocation (sinon : rattrapage à l'ouverture, voir « Planification »).
- Que faire si le PIN est oublié (la base étant locale, un oubli ne doit pas rendre les données inaccessibles : réinitialisation via restauration d'une sauvegarde ?).


note de travail:

1- regarde toujours claude.md et met à jour si changement dans le scope (même des changements minim sans précisé dans claude.md)
2- rajout toujours ici les changements que je demande dans le chat (supprime si on revient en arriere)
3- pour les sprints de travails, verifie SPRINTS.md
4- quand tu commences un sprint, met à jour le sprint à 'encours'
5- après avoir terminé un sprint, marque comme terminé le sprint 
6- ne jamais decidé seul si une fonctionnalité n'est pas 100% sure que ça converge avec notre besoins
7- toujours un commentaire sur chaque ligne de code (demandé dans le chat)
8- cible : APK Android uniquement, hors ligne, développé dans VS Code, transfert de l'APK via Google Drive (demandé dans le chat)
9- Kivy/Python écarté (ne marche pas sur le PC) : langage choisi par Claude = JavaScript + Capacitor ; Claude écrit tout le code, le propriétaire lit et valide (demandé dans le chat)
