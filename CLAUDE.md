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
- `src/platform/` : adaptateurs Android (lecture des SMS, USSD, export de fichiers). Chaque adaptateur a une **version Android** (plugin Kotlin dans `android/app/src/main/java/org/minonja/volako/`) et une **version simulée** pour le navigateur (ex. `sms.js` lit les SMS d'exemple de `sms-exemples.js`).

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

### SmsIllisible (table `sms_illisible`, migration 5)
SMS Orange Money que l'application n'a pas compris : `date_sms`, `texte`, `ignore` (0/1), unique sur (`date_sms`, `texte`). Listés pour revue ; « Ignorer » les masque définitivement. Incluse dans la sauvegarde JSON (les sauvegardes d'avant la version 5 restent restaurables).

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
- `comprise_dans_solde` : `0` ou `1` ; `1` pour une dépense oubliée rattrapée après un solde OM réel (case « Déjà comprise dans mon dernier solde OM ») : elle diminue le budget mais n'est **pas retirée une seconde fois** du solde OM disponible. La dépense garde sa vraie date.
- `nature` : `normale` (saisie de l'utilisateur ou SMS), `report` ou `transfert` (mouvements générés par l'application, en **lecture seule**)
- `insert_type` : `manuel` ou `auto` (auto = depuis SMS)
- `debit_credit` : `-1` dépense, `1` alimentation du budget (lors de l'allocation)
- `montant` : toujours > 0, le signe vient de `debit_credit`
- `sms` : texte brut du SMS OM d'origine ; renseigné uniquement si la transaction vient d'un SMS (`insert_type = auto`), vide pour une saisie manuelle
- Classement dans un budget (décidé au sprint 9) : **les SMS Orange Money ne contiennent pas le budget** (le « Motif » du SMS est générique, pas celui saisi par l'utilisateur). Toute transaction issue d'un SMS arrive donc « non classée » et l'utilisateur la **classe à la main** (écran SMS, ou bouton dans Opérations). Classer = même contrôle qu'une dépense manuelle (allocation couvrant la date de la dépense, solde suffisant). On peut la remettre « à classer ». Une dépense SMS n'est jamais modifiée ni supprimée.

### OperationUssd (table `operation_ussd`, migration 6) — sprint 11
Modèle d'opération lancée par code USSD : `nom` (unique, 60 caractères au plus), `type` (`sortie` = débite un budget ; `entree` = argent reçu), `code` (avec les variables `{numero}`, `{montant}`, `{pin}`), `budget_id` (obligatoire pour une sortie, interdit pour une entrée). Incluse dans la sauvegarde JSON.

### UssdEnAttente (table `ussd_en_attente`, migration 6) — sprint 11
Sortie USSD envoyée, en attente de son SMS : `operation_nom`, `numero`, `montant`, `budget_id`, `date_envoi`, `reponse`, `statut` (`en_attente`, `classee`, `echec`, `expiree`, `annulee`), `raison`, `transaction_id`. Incluse dans la sauvegarde JSON.

### ParametreJob (une seule ligne)
- `id`
- `start_day_int` : jour du mois de lancement de l'allocation/réallocation (ex. `20` = tous les 20 du mois), de 1 à 28

## Règles de calcul des soldes et des périodes (décidées au sprint 5)

- **Période d'une allocation** : du jour J au jour J-1 du mois suivant, J = `start_day_int` (ex. J = 20 : du 20 octobre au 19 novembre). La période en cours est celle qui contient la date du jour.
- **Solde d'un budget = solde PAR PÉRIODE** : somme signée (`debit_credit × montant`) des transactions de l'allocation de la période. Le reliquat d'une période est reporté à la suivante par une opération de transfert explicite (-reliquat sur l'ancienne période, +reliquat sur la nouvelle), à écrire au sprint 6.
- **Allocation** : crée (ou complète) l'allocation de la période en cours et une transaction `debit_credit = 1`. `montant_alloue` = total des alimentations de la période. Refusée si solde après allocation < `montant_min`. Un plafond dépassé est signalé, jamais tronqué.
- **Dépense manuelle** : rangée dans l'allocation du budget dont la période contient la `date_operation` ; refusée s'il n'y en a pas, ou si le solde de cette période est inférieur au montant. Date future refusée (5 minutes de tolérance).
- **Modification / suppression** (décidé au sprint 5) : possibles uniquement pour les opérations **manuelles** rattachées à un budget (jamais celles issues d'un SMS, laissées telles que reçues). On modifie le montant, la note et, pour une dépense, la date (une dépense peut ainsi changer de période). Garde-fou : le solde d'une période ne doit jamais devenir négatif (ni en réduisant une allocation, ni en la supprimant tant que des dépenses en dépendent). Supprimer la dernière opération d'une allocation supprime l'allocation vide : le budget redevient « non alloué ».
- **Report du reliquat** (décidé au sprint 6) : « Lancer l'allocation de la période » (bouton, tous les budgets ; le lancement automatique du sprint 11 ne traitera que les budgets `autogen_fin_mois`). Pour chaque budget : (1) le solde positif de **chaque période terminée** est reporté sur la période en cours par **deux lignes visibles et en lecture seule** (`nature = report`) : une sortie sur l'ancienne période (qui retombe à 0) et une entrée sur la nouvelle ; (2) si le budget n'a pas d'allocation sur la période en cours et que `montant_budget` > 0, l'allocation mensuelle est créée (refusée si le solde final serait < `montant_min`) ; `montant_alloue` = total des entrées (reports + allocations). Un plafond dépassé est signalé, jamais tronqué. **Idempotent** : relancer ne crée rien (les anciennes périodes sont à 0). Une dépense ne peut plus être saisie sur une période dont le solde est à 0 ; si une dépense ancienne est supprimée, son montant réapparaît et sera reporté au prochain lancement.
- **Réallocation manuelle = transfert entre deux budgets** pour la période en cours : sortie sur la source, entrée sur la destination (`nature = transfert`, lignes liées, lecture seule ; un transfert se défait par un transfert inverse). Refusé si la source n'a pas le solde, ou si le solde de la destination resterait sous son `montant_min`. Le formulaire propose l'excédent du plafond comme montant quand la source le dépasse.
- Dans le résumé d'un budget, « dépensé » ne compte que les dépenses normales ; les transferts sortants sont affichés à part (« Transféré »).
- **Solde OM disponible** (décidé au sprint 6) = dernier solde OM saisi (ou reçu par SMS) **moins les dépenses normales datées après lui** (une dépense issue d'un SMS à la même seconde que le solde est déjà comprise dedans ; une saisie manuelle à la même seconde est retirée). Une allocation ne le diminue pas ; une dépense le diminue ; un nouveau solde saisi remplace le calcul. Les reports et transferts ne le touchent pas.
- **Solde réservé dans les budgets** = total des allocations − total des dépenses = somme des soldes de tous les budgets. Au toucher sur l'accueil, il se détaille par budget : alloué (net des reports et transferts) − dépensé.
- **Libre à allouer** = solde OM disponible − solde réservé. **Règle** : une allocation (manuelle, augmentation d'une allocation, ou allocation mensuelle d'un lancement) est refusée si elle dépasse le libre à allouer ; message avec les chiffres. **Sans aucun solde OM saisi, toute allocation est bloquée** (message + lien vers la saisie du solde) ; un simple report de reliquat reste possible. **Lancement de la période = tout ou rien** : si l'argent frais demandé (somme des allocations mensuelles à créer) dépasse le libre, rien n'est écrit et le message indique le demandé, le libre et ce qui manque. Une dépense ne change pas le libre (elle diminue à la fois le solde OM et le budget). Un libre négatif (solde réel tombé sous le réservé) signale une dépense probablement non enregistrée (alerte formalisée au sprint 7). **Rattrapage d'une dépense oubliée** (décidé au sprint 6) : pour résorber cet écart, on enregistre la dépense en cochant « Déjà comprise dans mon dernier solde OM » (case visible seulement s'il existe un solde OM, aide affichée quand un écart existe) ; sans la case, la dépense serait retirée deux fois du solde disponible et l'écart resterait. Modifiable ensuite dans le formulaire de modification ; mention « Déjà comprise dans le solde OM » dans la liste des opérations.

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

**Alertes (sprint 7)** — calculées par `src/core/alertes.js`, **sans aucune tolérance** (le moindre écart déclenche), affichées sur l'accueil avec un lien d'action chacune, et comptées dans un badge rouge sur l'onglet Accueil :
1. **Écart de solde** (niveau danger) : libre à allouer < 0, c.-à-d. solde OM disponible < total réservé dans les budgets → « une dépense n'a peut-être pas été enregistrée » (action : enregistrer une dépense). Un libre **positif** n'est pas une alerte (c'est de l'argent encore à allouer).
2. **Seuil d'alerte** (danger) : solde de la période en cours d'un budget **strictement inférieur** à `solde_alert` (action : allouer ce budget). Un budget non alloué sur la période ne déclenche rien ; un seuil à 0 ne déclenche jamais.
3. **Plafond dépassé** (attention) : solde **strictement supérieur** à `montant_max`, avec l'excédent (action : transférer l'excédent).
4. **Aucun solde OM saisi** (attention) : tant qu'aucun solde n'existe (action : saisir le solde).
Ordre d'affichage : écart, seuils, plafonds, solde manquant.

## Fonctions Android

- **Lecture des SMS OM** (sprint 9) : permission `READ_SMS`, lecture de la boîte de réception filtrée sur l'expéditeur (`address LIKE %OrangeMoney%` ; nom réglable dans l'écran SMS, à confirmer sur le téléphone). Déclenchée à l'ouverture de l'app (**seulement si la permission est déjà accordée**, sans demande surprise ; jamais dans le navigateur) et par le bouton « Synchroniser » (qui demande la permission). Plugin Kotlin `SmsOmPlugin.kt` (enregistré dans `MainActivity.java`), parser JavaScript `src/core/sms-om.js`, import `src/core/import-sms.js`. L'import est **idempotent** : le relancer ne crée jamais de doublons (`trx_id` unique, SMS non compris dédoublonnés).
  - Seuls les SMS **postérieurs au solde initial** (plus ancien SoldeOM) sont importés : les plus anciens sont déjà dans ce solde. Sans solde initial, la synchronisation est refusée avec un message.
  - SMS **de débit** reconnus (exemples réels reçus) : transfert (« Trans Id »), retrait, remboursement de prêt. **SMS ignorés** (décidé) : mouvements avec le compte épargne (dans les deux sens, virement programmé compris, identifiant « Ref »), prêt crédité (« TrID »), dépôt d'argent. Un SMS ignoré ne crée **aucune transaction** mais son **solde OM est conservé** (à vérifier avec le propriétaire : sans lui, le solde disponible serait faux jusqu'au SMS suivant) ; il n'est jamais listé « non compris ». Au passage de l'import, une dépense « à classer » créée avant par un SMS désormais ignoré est retirée (jamais une dépense déjà classée dans un budget). Autres SMS de crédit (argent reçu d'un tiers) : **pas encore** vus, listés « non compris » en attendant un exemple.
  - **Frais** (décidé) : une seule transaction dont le `montant` = montant + frais (total réellement débité) ; la note rappelle « dont X Ar de frais ». Note automatique : « Transfert vers PAMF 5969657 », « Retrait auprès du 03… », « Remboursement de prêt ».
  - **Centimes** (décidé) : les montants du SMS sont convertis en entiers (« jamais de float ») : un **solde** est arrondi à l'entier **inférieur** (5916.47 → 5916), une **sortie** à l'entier supérieur (prudence). Le SMS brut garde les centimes.
  - Chaque SMS compris crée une `Transaction` (`insert_type = auto`, `debit_credit = -1`, `sms` = texte brut, `date_operation` = date du SMS, **sans allocation**) et, s'il contient un solde OM, un `SoldeOM` à la même date (« Nouveau solde epargne » n'est pas le solde OM).
  - Alertes ajoutées (sprint 9, en fin de liste) : « dépenses SMS à classer » (tant qu'elles ne sont pas classées, elles diminuent le libre à allouer) et « SMS non compris » (une opération a peut-être été manquée).
- **Synchronisation automatique** (sprint 10, décidé : notification) : `SmsOmReceiver.kt` (permissions `RECEIVE_SMS` et `POST_NOTIFICATIONS`) affiche une notification à l'arrivée d'un SMS OM, app fermée ; il n'écrit rien en base, l'import se fait à l'ouverture. L'import est aussi relancé à chaque retour sur l'app (au plus toutes les 30 s). L'expéditeur est mémorisé côté natif (SharedPreferences) lors de chaque synchronisation. Import complet en arrière-plan écarté.
- **Consultation USSD du solde** (sprint 10, code livré, à vérifier sur le téléphone) : API téléphonie d'Android (`sendUssdRequest`) depuis le plugin Kotlin `UssdOmPlugin.kt` (permission `CALL_PHONE`, demandée à la première consultation ; `READ_PHONE_STATE` retirée au sprint 11, inutile). **Code USSD : `#144*5*3*PIN*`** ; l'application envoie `#144*5*3*PIN*#` (« # » final ajouté, à vérifier ; un seul endroit : `UssdOm.code()`). Réponse type : « Le solde de votre compte est de 202316 AR. Achetez du crédit via OM… » → analysée par `src/core/ussd-om.js` puis enregistrée en `SoldeOM` par `src/core/ussd-solde.js`.
  - **PIN OM** : réglable dans l'écran « Consultation du solde » ; chiffré AES-256 par le coffre Android (`CoffrePin.kt`), gardé dans les réglages natifs privés, **hors base et hors sauvegarde JSON** (la tâche d'arrière-plan doit pouvoir le relire sans accès à la base). Usage personnel : chiffrement réversible, pas de hachage.
  - **Consultation toutes les heures, les deux modes** : application ouverte (vérification toutes les 5 min, consultation si la dernière a plus de 55 min) et arrière-plan (WorkManager, `ConsultationWorker.kt`, toutes les heures, sans garantie d'Android). L'arrière-plan n'écrit pas en base : il met la réponse en attente, enregistrée à l'ouverture suivante. Solde identique au dernier et sans dépense depuis : pas ré-enregistré.
  - **Sécurité** : une réponse qui n'est pas un solde (PIN refusé…) arrête aussitôt la consultation automatique (jamais de PIN faux répété, risque de blocage du compte OM) et prévient l'utilisateur.
- **Planification** (sprint 11, décidé : à l'ouverture seulement) : l'application n'a pas de cron. À chaque ouverture et retour sur l'app, `src/core/allocation-auto.js` crée l'allocation de la période en cours et reporte les reliquats pour les budgets `autogen_fin_mois` (rattrapage si le jour `start_day_int` est passé sans ouverture). Idempotent, tout ou rien pour l'argent frais ; un refus (sans solde OM, libre insuffisant, `montant_min`) est expliqué par un message, rien n'est écrit. Pas d'exécution en arrière-plan.
- **Opérations USSD dynamiques** (sprint 11, code livré) : l'utilisateur crée des modèles (nom, type, code à variables `{numero}`, `{montant}`, `{pin}`, budget à débiter) puis les lance (écran « Opérations USSD », tuile d'accueil). Autorisation : **PIN de verrouillage de l'application** (verrouillage obligatoire) ; `{pin}` = PIN Orange Money, inséré **côté Android** (`UssdOmPlugin.envoyerCode`, liste blanche de caractères), jamais visible de JavaScript ni affiché. Une sortie est **en attente** de son SMS : à l'import (`rapprocherEnAttente`, `src/core/ussd-en-attente.js`), le SMS de débit non classé de même montant (frais exclus ou compris), reçu dans les 24 h, est classé seul dans le budget (mêmes contrôles qu'une dépense manuelle ; sinon il reste « à classer » avec la raison). Contrôle avant envoi : allocation couvrant aujourd'hui et solde suffisant, comme une dépense manuelle. **Limite** : une seule requête USSD par envoi (pas de réponse à un menu de confirmation).
- **Verrouillage par PIN** (sprint 11, code livré) : PIN de 4 à 8 chiffres, gardé en **empreinte salée** (SHA-256 répété 10 000 fois) dans `meta` (`verrou_*`), jamais en clair ; demandé au démarrage et au retour après plus d'une minute (`src/core/verrou.js`, `src/ui/ecrans/verrou.js`). **Essais** : 4 échecs libres, puis blocage de 30 s / 1 min / 5 min / 30 min, jamais d'effacement. **PIN oublié** : code de secours `XXXX-XXXX-XXXX` affiché une seule fois à l'activation (empreinte seule gardée, renouvelé à chaque usage). Verrou d'**accès à l'écran** : la base n'est pas chiffrée. Les clés `verrou_*` (et `sms_expediteur`) ne sont pas dans la sauvegarde JSON et sont **conservées** à la restauration.
- **Sauvegarde / restauration** (sprint 8) : fichier **texte JSON** `volako_AAAA-MM-JJ_HH-MM-SS.json` (et non une copie du fichier `.sqlite3`, qu'on ne peut ni tester sous Windows ni lire de façon sûre sur Android). Il contient toutes les tables, les compteurs de numérotation (aucun identifiant ni code `bdg-xxx` supprimé n'est jamais réutilisé après restauration), la version du schéma et une **empreinte SHA-256** qui détecte un fichier abîmé ou modifié. Création en une seule transaction (copie cohérente). Sur Android, le fichier est écrit dans le cache de l'app puis envoyé par la **fenêtre de partage** du téléphone (Google Drive, Fichiers…) ; la restauration passe par le sélecteur de fichiers (Drive compris). **Restauration tout ou rien** : fichier vérifié (format, version, tables, empreinte, colonnes connues — jamais de SQL tiré du fichier), confirmation avec le contenu de la sauvegarde et celui des données actuelles, copie de sécurité des données actuelles conservée (bouton « Annuler la dernière restauration »), tables recréées à la version de la sauvegarde puis migrées (une ancienne sauvegarde reste restaurable), liens entre tables vérifiés ; au moindre échec, rien n'est modifié. Une sauvegarde d'une version plus récente de l'application est refusée avec un message.

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
- **Verrouillage par code PIN : oui** (PIN demandé à l'ouverture ; PIN stocké sous forme d'empreinte, jamais en clair ; essais et code de secours décidés au sprint 11, voir « Fonctions Android »).
- Node.js 20 est installé sur le poste de dev.

## Questions ouvertes

À traiter plus tard :
- SMS Orange Money de **crédit d'un tiers** (argent reçu d'une autre personne) : exemple nécessaire pour les reconnaître (débits gérés ; épargne, prêt crédité et dépôt ignorés).
- Nom exact de l'expéditeur des SMS (supposé « OrangeMoney », réglable) : à confirmer sur le téléphone.
- Doublon manuel/SMS : une dépense saisie à la main puis reçue aussi par SMS apparaît deux fois (la dépense SMS reste à classer). Pas de rapprochement automatique pour l'instant : ne pas saisir à la main ce qu'un SMS apportera.
- Sprint 8 (sauvegarde/restauration) : en attente, ne fonctionne pas sur le téléphone ; cause à diagnostiquer.

À décider :
- Retirer la permission `INTERNET` (ajoutée par défaut par Capacitor, inutile : l'application n'utilise aucun réseau) pour que « 100 % hors ligne » soit vrai au niveau d'Android ; à vérifier sur le téléphone après le retrait.


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

10- sprint 8 (sauvegarde) mis en attente (pending) car il ne fonctionne pas sur le téléphone ; sprint 9 (SMS) commencé (demandé dans le chat)
11- USSD de consultation du solde : #144*5*3*PIN* ; PIN OM réglable dans l'app ; consultation toutes les heures (sprint 10, demandé dans le chat)
12- les SMS OM ne contiennent pas la raison de la transaction saisie par l'utilisateur : classement manuel dans un budget (demandé dans le chat)
13- PIN OM chiffré (usage personnel) et consultation USSD toutes les heures en les deux modes : application ouverte + arrière-plan (demandé dans le chat)
14- sprint 9 terminé ; sprint 10 commencé avec la synchronisation automatique par notification à l'arrivée d'un SMS OM (demandé dans le chat)
15- ignorer les SMS d'épargne (compte epargne, virement programmé), de prêt crédité et de dépôt : aucune transaction (demandé dans le chat)
16- sprint 14 créé : mise à jour de l'application par Obtainium (Release GitHub), distincte de l'allocation automatique du sprint 11 (demandé dans le chat)
17- sprint 11 : allocation automatique à l'ouverture seulement ; verrou PIN avec attente croissante (30 s, 1 min, 5 min, 30 min) et code de secours (demandé dans le chat)
19- codes USSD dynamiques : `{numero}` peut être répété (retrait : `#144*1*2*{numero}*{numero}*{montant}*{pin}#`, saisi une seule fois) ou absent (remboursement de prêt : `#144*4*1*1*{montant}*{pin}#`) ; aide et aperçu des saisies demandées dans le formulaire (demandé dans le chat)
20- types et budgets par défaut (8 types, 9 budgets, allocation automatique oui, `src/core/valeurs-par-defaut.js`) installés une seule fois à la première ouverture, seulement si la base est vierge ; jamais recréés ensuite (demandé dans le chat)
18- opérations USSD dynamiques : PIN de l'app pour autoriser, variables {numero}/{montant}/{pin} dans le code, dépense classée par le SMS de confirmation, entrée = code seulement (demandé dans le chat)
