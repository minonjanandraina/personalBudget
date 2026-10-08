# Plan de sprints — Gestion de Budget (application Android)

Référence fonctionnelle : [CLAUDE.md](CLAUDE.md). Technologie : JavaScript + Capacitor, plugin Kotlin pour SMS/USSD, APK construit par GitHub Actions.
Statuts : à faire · EN COURS · EN ATTENTE (pending) · ✅ TERMINÉ.

Règles pour tous les sprints : un commentaire en français sur chaque ligne de code ; logique métier dans `src/core/` avec tests Vitest ; chaque sprint finit par une démo (navigateur et/ou APK) et des tests verts.

Dépendances externes :
- Exemples de SMS Orange Money → reçus (sprint 9) ; SMS d'épargne, de prêt crédité et de dépôt **ignorés** (aucune transaction, solde OM conservé) ; il manque encore un exemple de SMS de **crédit** d'un tiers (argent reçu).
- Code USSD de consultation du solde → reçu : `#144*5*3*PIN*` (sprint 10).
- Réponse sur Node.js sur le poste de dev → avant le sprint 0.

Historique : le prototype Django (anciens sprints 0 à 3) est archivé dans [legacy_django/](legacy_django/) et sert de référence pour les règles métier.

---

## Sprint 0 — Initialisation du projet ✅ TERMINÉ
- Vérifier/installer Node.js sur le poste (voir question ouverte de CLAUDE.md).
- Création du projet : Vite (serveur de développement navigateur), Capacitor, Vitest.
- Arborescence `src/core`, `src/ui`, `src/platform`, `android-plugin/`.
- Un écran d'accueil minimal affiché dans le navigateur (`npm run dev`) et un test Vitest qui passe.

**Livrable** : `npm run dev` et `npm test` fonctionnent sous Windows.

## Sprint 1 — Pipeline APK de bout en bout (réduction du risque) ✅ TERMINÉ
- Ajout du projet Android généré par Capacitor.
- Clé de signature créée une fois, stockée dans les secrets GitHub (sauvegarde de la clé documentée).
- Workflow GitHub Actions : build Gradle → APK signé publié en artefact.
- Test réel : APK « Bonjour » téléchargé, passé par Google Drive, installé sur le téléphone, mise à jour par-dessus sans perte de données.

**Livrable** : l'application affichant un écran de base s'installe et se met à jour sur le téléphone. C'est le sprint le plus risqué : on le fait en premier.

## Sprint 2 — Base de données et modèles (`core`) ✅ TERMINÉ
- Schéma SQLite : SoldeOM, TypeBudget (code `bdg-001` auto), Budget, AllocationBudget, Transaction, ParametreJob (ligne unique).
- Contraintes : montants entiers, `montant` > 0, `debit_credit` ∈ {-1, 1}, `trx_id` unique, une allocation par budget et par période, règles `montant_min` ≤ `montant_max` et `montant_budget` ≤ `montant_max`.
- Migrations versionnées (évolution du schéma sans perdre les données).
- Adaptateur base : SQLite du téléphone (plugin) et version navigateur pour le développement.
- Tests Vitest sur chaque règle.

**Livrable** : base créée et manipulable depuis le navigateur et depuis l'APK.

## Sprint 3 — Socle UI mobile first ✅ TERMINÉ
- Structure des écrans, navigation par barre basse, grosses tuiles/icônes, zones tactiles ≥ 48 dp.
- Tableau de bord squelette : solde OM, zone d'alertes, tuiles.
- Composants communs : cartes, formulaires, messages d'erreur, confirmations.
- Animations CSS/JS légères (désactivées si « réduire les animations »).

**Livrable** : navigation fluide sur le navigateur et sur le téléphone.

## Sprint 4 — Solde OM, types de budget, budgets, paramètres ✅ TERMINÉ
- Saisie manuelle du solde initial OM et historique.
- Création, modification, suppression des types et des budgets (suppression refusée si utilisé).
- Écran paramètres : jour de lancement de l'allocation (1 à 28).
- Tests des règles de saisie.

**Livrable** : flux 1 à 3 de CLAUDE.md utilisable.

## Sprint 5 — Allocations et transactions manuelles ✅ TERMINÉ
- Service d'allocation (période, transactions `debit_credit = 1`).
- Saisie manuelle des transactions (génération du `trx_id`, `insert_type = manuel`).
- Contrôles : dépense bloquée si solde du budget < dépense ; allocation refusée si solde après allocation < `montant_min`.
- Solde par budget (par période), liste des transactions filtrable.
- Modification et suppression des opérations manuelles, avec garde-fous sur le solde.
- Tests unitaires des contrôles.

**Livrable** : allocation et dépenses manuelles avec blocages.

## Sprint 6 — Réallocation de fin de période ✅ TERMINÉ
- Reliquat reporté au mois suivant (montant budget + reliquat, jamais tronqué).
- Marquage « solde dépassant le plafond » + écran de réallocation manuelle.
- Bouton d'allocation/réallocation, idempotent (relancer ne duplique pas).
- Tests : exemple 100 000 / 60 000 → 40 000 reportés, dépassement de plafond, idempotence.
- Solde OM disponible (dernier solde − dépenses suivantes), solde réservé détaillé par budget, libre à allouer ; allocations bornées par le libre ; lancement « tout ou rien » ; allocation bloquée sans solde OM.

**Livrable** : cycle mensuel complet déclenchable par bouton.

## Sprint 7 — Alertes ✅ TERMINÉ
- Seuil min (`solde_alert`), plafond dépassé, écart solde OM vs réservé (aucune tolérance), aucun solde OM saisi.
- Affichage sur le tableau de bord (dans l'app uniquement), avec un lien d'action par alerte et un badge sur l'onglet Accueil.
- Tests unitaires de chaque alerte.

**Livrable** : flux 5 et 6 de CLAUDE.md opérationnels.

## Sprint 8 — Sauvegarde et restauration — EN ATTENTE (pending : ne fonctionne pas sur le téléphone, à reprendre plus tard)
- Sauvegarde en fichier JSON daté `volako_AAAA-MM-JJ_HH-MM-SS.json` (copie cohérente, empreinte SHA-256), envoyée par la fenêtre de partage du téléphone (Google Drive…).
- Restauration depuis un fichier choisi : vérification du fichier, confirmation avec le détail, tout ou rien, copie de sécurité et annulation possible.
- Test réel : désinstallation/réinstallation puis restauration.

**Livrable** : les données ne sont plus perdues en cas de changement de clé ou de téléphone.

## Sprint 9 — Lecture et import des SMS Orange Money — TERMINÉ (code livré ; lecture réelle sur téléphone à confirmer au sprint 10)
- Plugin Kotlin (`SmsMmPlugin.kt`) : permission `READ_SMS`, lecture de la boîte de réception filtrée sur l'expéditeur OM (réglable dans l'écran SMS).
- Parser (JavaScript, `core`) : `trx_id`, montant, frais, solde après opération, type. **Les SMS ne contiennent pas le budget** (le « motif » n'est pas celui saisi par l'utilisateur) : aucune classification automatique, toute transaction SMS arrive « non classée ». Un SMS « virement vers l'épargne » n'a pas de solde OM.
- Import à l'ouverture (si la permission est déjà accordée) et par bouton « Synchroniser » ; idempotent via `trx_id` ; création Transaction (champ `sms` rempli, montant = total débité, frais compris) + SoldeOM (centimes arrondis à l'entier inférieur). Seuls les SMS postérieurs au solde initial saisi sont importés.
- Écran « SMS Orange Money » : transactions à classer (affectation manuelle à un budget), SMS non compris listés pour revue (migration 5, table `sms_illisible`) ; alertes correspondantes.
- Version simulée (SMS d'exemple) pour le navigateur ; tests du parsing sur les SMS réels.

**Livrable** : les SMS OM alimentent transactions et soldes (vérifié sur le téléphone).

## Sprint 10 — Synchronisation automatique et consultation USSD du solde ✅ TERMINÉ
- **Synchronisation automatique des SMS** (décidé : notification à l'arrivée d'un SMS) : récepteur Kotlin `SmsMmReceiver.kt` (permission `RECEIVE_SMS`, + `POST_NOTIFICATIONS` sur Android 13+) ; il affiche « Nouvelle opération Orange Money » même app fermée, **sans rien écrire en base** (le parser et la base restent en JavaScript). L'import se fait à l'ouverture suivante ; l'expéditeur réglé dans l'écran SMS est mémorisé côté natif à chaque synchronisation. Fait en plus : l'import se relance aussi à chaque retour sur l'application (au plus toutes les 30 s ; l'écran n'est réaffiché que s'il n'a pas de formulaire ouvert). Écarté : import complet en arrière-plan (parser et base à dupliquer en Kotlin). *À vérifier sur le téléphone.*
- Fait : analyse de la réponse USSD (`src/core/ussd-om.js`, testée) → solde entier.
- Code USSD reçu : `#144*5*3*PIN*` (PIN = code secret Orange Money). Le code envoyé est `#144*5*3*PIN*#` (le « # » final est ajouté : **à vérifier sur le téléphone**, un seul endroit à corriger : `UssdOm.code()`). Réponse : « Le solde de votre compte est de 202316 AR. Achetez du crédit via OM… ».
- **PIN OM** (décidé : chiffré, usage personnel) : réglable dans l'écran « Consultation du solde » ; chiffré AES-256 par le coffre Android (`CoffrePin.kt`) et gardé dans les réglages privés natifs, **pas dans la base ni dans la sauvegarde JSON** (le PIN doit rester lisible par la tâche d'arrière-plan, qui n'a pas accès à la base ; une copie dans la base n'apporterait rien et se retrouverait dans les sauvegardes). Écart avec la demande « dans la base » : à confirmer.
- **Consultation toutes les heures, les deux modes** (décidé) : application ouverte (vérification toutes les 5 min, consultation si la dernière date de plus de 55 min) et arrière-plan (WorkManager, `ConsultationWorker.kt`, 1 h). L'arrière-plan n'écrit pas en base : il met la réponse en attente et l'application l'enregistre à l'ouverture (`importerReponsesEnAttente`). Un solde identique au dernier, sans dépense depuis, n'est pas ré-enregistré.
- **Sécurité** : si la réponse n'est pas un solde (PIN refusé…), la consultation automatique s'arrête aussitôt (jamais de PIN faux répété) et l'utilisateur en est prévenu (notification + message).
- Plugin Kotlin `UssdOmPlugin.kt` : USSD par `TelephonyManager.sendUssdRequest` (API 26+), permissions `CALL_PHONE` et `READ_PHONE_STATE`, demandées seulement à la première consultation.
- Écran « Consultation du solde » (réglages) : PIN, « Consulter le solde », activer/arrêter l'automatique ; version simulée pour le navigateur.
- Fait : analyse de la réponse (`ussd-om.js`), enregistrement et consultation automatique (`ussd-solde.js`), tests. **À vérifier sur le téléphone** (USSD, arrière-plan, notification).

**Livrable** : solde OM vérifiable à la demande.

## Sprint 11 — Planification et sécurité ✅ TERMINÉ (code livré ; vérification sur téléphone à faire)
- **Allocation automatique à l'ouverture** (décidé : à l'ouverture seulement, pas en arrière-plan) : `src/core/allocation-auto.js` lance `lancerAllocationPeriode(..., { seulementAuto: true })` à l'ouverture et à chaque retour sur l'application. Idempotent (relancer ne change rien) ; si le jour J est passé sans ouverture, la période manquée est rattrapée (avec report des reliquats). Tout ou rien pour l'argent frais : sans solde OM ou si le libre à allouer est insuffisant, rien n'est écrit et un message explique pourquoi. Un budget automatique créé en cours de période est alloué à la prochaine ouverture.
- **Verrouillage par PIN** (décidé : oui) : écran « Réglages > Verrouillage par PIN » (activer, changer, désactiver). PIN de 4 à 8 chiffres, gardé sous forme d'**empreinte salée** (SHA-256 répété 10 000 fois), jamais en clair, dans la table `meta` (clés `verrou_*`, absentes de la sauvegarde JSON ; **conservées** lors d'une restauration). Demandé au démarrage et au retour sur l'application après plus d'une minute (fenêtre plein écran). C'est un verrou d'accès à l'écran : la base n'est pas chiffrée.
- **Essais** (décidé : attente croissante) : 4 échecs libres, puis blocage de 30 s (5e échec), 1 min (6e), 5 min (7e), 30 min (8e et suivants). Jamais d'effacement des données. Le compteur est commun au PIN et au code de secours.
- **PIN oublié** (décidé : code de secours) : à l'activation, un code `XXXX-XXXX-XXXX` est affiché **une seule fois** à noter sur papier ; il permet de redéfinir le PIN sans perte. Chaque utilisation fabrique un nouveau code ; régénérable avec le PIN.
- **Revue des permissions** : `READ_SMS` (lecture des SMS OM), `RECEIVE_SMS` (notification), `POST_NOTIFICATIONS` (notification, Android 13+), `CALL_PHONE` (USSD) — toutes utilisées. `READ_PHONE_STATE` **retirée** (inutile pour `sendUssdRequest`, seul `CALL_PHONE` est requis). `INTERNET` (ajoutée par défaut par Capacitor) : **à décider** — l'application n'a besoin d'aucun réseau ; la retirer rendrait « 100 % hors ligne » vrai au niveau d'Android, mais ne peut se vérifier que sur le téléphone.

**Livrable** : les allocations du mois se font toutes seules à l'ouverture et l'application est protégée par un PIN (mise à jour des **données** ; la mise à jour de l'**application** est le sprint 14).


## Sprint 11 suite — Opérations USSD dynamiques ✅ TERMINÉ (code livré ; vérification sur téléphone à faire)
Demande du propriétaire (conservée) :
- Je veux des opérations dynamiques, cad que je veux avoir la possibilité de creer une opération qui est possible d'etre une opération de credit(alimentation de compte) de débit(dépense) assigné a un code ussd et un budget à débiter :
  1. création de l'opération dans paramètres, spécifier type (opération in ou out), code ussd. Ex. « Opération de retrait Orange Money » : `#144*8*8*Numéro téléphone*PIN#` ; « Opération de paiement marchand » : `#144*6*1*Numéro téléphone*PIN#`.
  2. faire une opération : clic sur l'opération → saisie du numéro de téléphone → validation par PIN (PIN de l'application) → envoi.

Décisions (chat) :
- **PIN** : le PIN de **verrouillage de l'application** autorise l'envoi (le verrouillage doit être activé, sinon l'envoi est refusé avec un lien d'activation) ; le **PIN Orange Money** (enregistré chiffré, sprint 10) remplace `{pin}` dans le code **côté Android** : il ne passe jamais par JavaScript.
- **Montant** : variables dans le code — `{numero}`, `{montant}`, `{pin}`, ex. `#144*8*8*{numero}*{montant}*{pin}#`. Une sortie doit contenir `{montant}` (il sert à débiter le budget).
- **Enregistrement** : à l'envoi d'une sortie, rien n'est écrit dans le budget ; l'envoi est « en attente ». Quand le SMS de confirmation est importé (même montant, frais exclus ou compris, reçu moins de 24 h après l'envoi), la dépense est **classée automatiquement** dans le budget de l'opération (mêmes contrôles qu'une dépense manuelle ; si refusé, elle reste « à classer » et l'échec est expliqué). Sans SMS sous 24 h : abandonnée ; annulation manuelle possible.
- **Entrée** : le code est seulement envoyé (le solde OM se met à jour par SMS ou consultation).

Réalisé : migration 6 (tables `operation_ussd`, `ussd_en_attente`, incluses dans la sauvegarde JSON) ; `src/core/operations-ussd.js` et `ussd-en-attente.js` ; plugin Kotlin `envoyerCode` (liste blanche : chiffres, `*`, `#`, `{pin}`) ; écrans « Opérations USSD » (tuile d'accueil) : liste + envois récents, création/modification, lancement avec confirmation (code affiché PIN masqué). Un budget utilisé par un modèle ne peut pas être supprimé.
**Limite connue** : l'API Android n'envoie qu'**une** requête USSD par appel. Si Orange Money répond par un menu demandant une confirmation (« 1 pour confirmer »), l'application ne peut pas répondre ; à vérifier sur le téléphone avec un vrai retrait.

## Sprint 12 — Finition
- Polissage mobile : états vides, messages d'erreur, accessibilité, performances sur téléphone modeste.
- Icône et nom de l'application, écran de démarrage.
- Documentation d'installation (Drive → téléphone) et d'exploitation.

**Livrable** : application utilisable au quotidien.

## Sprint 13 — Tests de non-régression et recette
- Suite Vitest complète : allocation, réallocation, contrôles, alertes, parsing SMS, import idempotent, sauvegarde/restauration.
- Scénario de bout en bout : solde initial → types → budgets → allocation → dépenses (manuelles + SMS) → alertes → réallocation → sauvegarde.
- Exécution automatique des tests dans GitHub Actions à chaque push.
- Checklist de recette sur téléphone, correction des anomalies, version `v1.0`.

**Livrable** : version 1.0 validée, non-régression rejouable à chaque modification.

## Sprint 14 — Mise à jour de l'application (Obtainium)
Nouvelles versions de l'APK sur le téléphone, **sans toucher aux données** (même identifiant `org.minonja.volako`, même clé de signature : la base locale est conservée). Aucun code réseau dans Volako, qui reste 100 % hors ligne.
- Workflow GitHub Actions : publier l'APK dans une **Release GitHub** publique (permission d'écriture sur le contenu du dépôt), avec un numéro de version qui augmente (`v0.1.N`, déjà fourni par le numéro d'exécution). **Décision en attente** : une Release à chaque push sur `main`, ou seulement quand le propriétaire le décide (tag ou lancement manuel — recommandé).
- Installer **Obtainium** sur le téléphone (F-Droid ou GitHub) et lui donner le dépôt `minonjanandraina/personalBudget` ; il reconnaît Volako déjà installée.
- Prérequis téléphone (Infinix, XOS) : autoriser les sources inconnues pour Obtainium, désactiver l'optimisation de batterie et autoriser son démarrage automatique, Internet (4G/Wi-Fi), décider du comportement de Play Protect (permission SMS) ; confirmation d'installation demandée à chaque mise à jour.
- Documentation (CLAUDE.md, README) : remplacer la chaîne « GitHub → Google Drive → téléphone » par « Release GitHub → Obtainium » (Drive reste possible en secours).

**Livrable** : une nouvelle version publiée est proposée puis installée par-dessus l'ancienne, base de données intacte.

## Sprint 15 — Renommage « Orange Money / OM » → « Mobile Money » (tout opérateur) ✅ TERMINÉ
Objectif général (demande du propriétaire) : adapter l'application à **tout opérateur** Mobile Money, **un seul opérateur à la fois**. Les sprints 15, 16 et 17 se suivent dans cet ordre.
- Textes affichés, aides, messages, notifications : « Orange Money », « OM » → « Mobile Money » (ou « MM » seulement si la place manque).
- Code : fichiers, fonctions, variables, plugins Kotlin (`sms-mm.js`, `ussd-om.js`, `SmsMmPlugin`, `UssdOm`…) renommés avec « mm » / « mobile-money » ; commentaires mis à jour ; tests adaptés.
- **Base de données inchangée** (décidé) : aucun nom de table ni de colonne ne change (`solde_om`…), aucune migration, les anciennes sauvegardes JSON restent restaurables. Clés de la table `meta` conservées.
- Valeurs par défaut (expéditeur « OrangeMoney », code USSD de solde, modèles) inchangées à ce stade : elles deviennent des réglages aux sprints 16 et 17.
- CLAUDE.md : renommage dans toute la documentation (sauf mentions historiques et noms de tables).

**Livrable** : plus aucune mention d'Orange Money dans l'interface ; tests verts ; sauvegardes existantes toujours restaurables.

## Sprint 16 — USSD de consultation du solde dynamique + choix de la SIM
- **Réponse USSD par gabarit** : le texte de la réponse est analysé par un gabarit réglable avec la variable `{solde}` (ex. `Le solde de votre compte est de {solde} AR`), à la place du parser écrit en dur. Le gabarit actuel est le réglage par défaut. Gabarit stocké dans `meta` (comme `ussd_code_solde`), conservé à la restauration. Une réponse qui ne correspond pas au gabarit est expliquée sans rien enregistrer et sans répéter le PIN.
- Le **code USSD** reste réglable (déjà fait) ; l'écran de réglage regroupe code + gabarit de réponse + aperçu d'essai du gabarit sur un texte d'exemple.
- **Choix de la SIM** (décidé : oui) : permission `READ_PHONE_STATE` remise (demandée au moment du choix) ; plugin Kotlin qui liste les SIM actives (`SubscriptionManager` : emplacement 1 ou 2, nom de l'opérateur) ; la SIM choisie est mémorisée (identifiant + emplacement, revérifié à chaque envoi) et utilisée via `createForSubscriptionId` pour la consultation du solde **et** les opérations USSD. Une seule SIM ou aucun choix fait : SIM par défaut du téléphone. Si la SIM choisie a disparu : message clair, aucun envoi.
- Version simulée pour le navigateur (liste de SIM d'exemple). Le choix de SIM n'est vérifiable que sur le téléphone.
- Tests Vitest : gabarit de réponse (formats, centimes, échec), conservation des réglages à la restauration.

**Livrable** : solde consultable avec le code et la réponse de n'importe quel opérateur, sur la SIM de son choix.

## Sprint 17 — Modèles de SMS dynamiques (reconnaissance des champs)
- **Modèles de SMS** (table dédiée, migration 7, incluse dans la sauvegarde JSON ; anciennes sauvegardes restaurables) : un gabarit par type de SMS, avec les variables `{montant_debit}`, `{montant_credit}`, `{ref_trx}`, `{date_trx}`, `{numero_source}`, `{numero_destination}` et, en plus (décidé) `{frais}` et `{solde}`. Le gabarit est converti en expression régulière **par le code** : l'utilisateur n'écrit jamais de regex.
- Chaque modèle précise son **sens** : débit (crée une dépense à classer), crédit (argent reçu, désormais gérable), ou à ignorer (solde conservé, aucune transaction) ; et un **libellé de note** (ex. « Transfert vers {numero_destination} »). Règles conservées : frais compris dans le montant, centimes arrondis (solde vers le bas, sortie vers le haut), `ref_trx` unique contre les doublons, import idempotent.
- **Modèles par défaut** = les formats Orange Money actuels (transfert, retrait, remboursement de prêt, ignorés : épargne, prêt crédité, dépôt), installés une seule fois comme les budgets par défaut ; le parser en dur disparaît.
- **Expéditeur réglable** par opérateur (déjà réglable dans l'écran SMS) et nom du service affiché.
- Écran « Modèles de SMS » : liste, création/modification, **essai** d'un SMS d'exemple collé avec les champs reconnus affichés, avertissement si un modèle est trop vague. Un SMS non compris peut servir de point de départ à un nouveau modèle.
- `{date_trx}` : format de date réglable dans le modèle, sinon date de réception du SMS.
- Tests Vitest : chaque variable, gabarits invalides, modèles qui se chevauchent (ordre/priorité), idempotence de l'import, anciens SMS Orange Money toujours reconnus (non-régression).

**Livrable** : l'utilisateur adapte l'application aux SMS de son opérateur sans toucher au code.
