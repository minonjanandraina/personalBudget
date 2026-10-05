# Plan de sprints — Gestion de Budget (application Android)

Référence fonctionnelle : [CLAUDE.md](CLAUDE.md). Technologie : JavaScript + Capacitor, plugin Kotlin pour SMS/USSD, APK construit par GitHub Actions.
Statuts : à faire · EN COURS · ✅ TERMINÉ.

Règles pour tous les sprints : un commentaire en français sur chaque ligne de code ; logique métier dans `src/core/` avec tests Vitest ; chaque sprint finit par une démo (navigateur et/ou APK) et des tests verts.

Dépendances externes :
- Exemples de SMS Orange Money → avant le sprint 9.
- Code USSD de consultation du solde → avant le sprint 10.
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

## Sprint 4 — Solde OM, types de budget, budgets, paramètres — EN COURS
- Saisie manuelle du solde initial OM et historique.
- Création, modification, suppression des types et des budgets (suppression refusée si utilisé).
- Écran paramètres : jour de lancement de l'allocation (1 à 28).
- Tests des règles de saisie.

**Livrable** : flux 1 à 3 de CLAUDE.md utilisable.

## Sprint 5 — Allocations et transactions manuelles
- Service d'allocation (période, transactions `debit_credit = 1`).
- Saisie manuelle des transactions (génération du `trx_id`, `insert_type = manuel`).
- Contrôles : dépense bloquée si solde du budget < dépense ; allocation refusée si solde après allocation < `montant_min`.
- Solde par budget, liste des transactions filtrable.
- Tests unitaires des contrôles.

**Livrable** : allocation et dépenses manuelles avec blocages.

## Sprint 6 — Réallocation de fin de période
- Reliquat reporté au mois suivant (montant budget + reliquat, jamais tronqué).
- Marquage « solde dépassant le plafond » + écran de réallocation manuelle.
- Bouton d'allocation/réallocation, idempotent (relancer ne duplique pas).
- Tests : exemple 100 000 / 60 000 → 40 000 reportés, dépassement de plafond, idempotence.

**Livrable** : cycle mensuel complet déclenchable par bouton.

## Sprint 7 — Alertes
- Seuil min (`solde_alert`), plafond dépassé, écart solde OM vs transactions (aucune tolérance).
- Affichage sur le tableau de bord (dans l'app uniquement).
- Tests unitaires de chaque alerte.

**Livrable** : flux 5 et 6 de CLAUDE.md opérationnels.

## Sprint 8 — Sauvegarde et restauration
- Export de la base vers un dossier du téléphone, fichier daté `db_YYYY-MM-DD_HH-MM-SS.sqlite3`, copie cohérente.
- Restauration depuis un fichier choisi, avec confirmation et vérification du fichier.
- Test réel : désinstallation/réinstallation puis restauration.

**Livrable** : les données ne sont plus perdues en cas de changement de clé ou de téléphone.

## Sprint 9 — Lecture et import des SMS Orange Money *(dépend des exemples de SMS)*
- Plugin Kotlin : permission `READ_SMS`, lecture de la boîte de réception filtrée sur l'expéditeur OM.
- Parser (JavaScript, `core`) : `trx_id`, montant, débit/crédit, solde après opération, date, code budget.
- Import à l'ouverture et par bouton « Synchroniser » ; idempotent via `trx_id` ; création Transaction (champ `sms` rempli) + SoldeOM.
- Transactions sans code reconnu → « non classées » + écran d'affectation manuelle ; SMS illisibles listés pour revue.
- Version simulée (fichier de SMS d'exemple) pour le navigateur ; tests du parsing sur les SMS réels anonymisés.

**Livrable** : les SMS OM alimentent transactions et soldes (vérifié sur le téléphone).

## Sprint 10 — Consultation USSD du solde *(dépend du code USSD)*
- Plugin Kotlin : exécution de l'USSD (API 26+), permissions `CALL_PHONE` et `READ_PHONE_STATE`.
- Bouton « Consulter le solde » → nouveau SoldeOM ; messages d'erreur clairs (permission refusée, réseau absent).
- Version simulée pour le navigateur.

**Livrable** : solde OM vérifiable à la demande.

## Sprint 11 — Planification et sécurité
- Rattrapage à l'ouverture : allocation automatique des budgets `autogen_fin_mois` si le jour `start_day_int` est passé (décision en suspens : exécution en arrière-plan).
- Code PIN de verrouillage (décidé : oui) : saisie à la création, demande à l'ouverture, hachage, limite d'essais, procédure en cas d'oubli.
- Revue des permissions demandées (minimum nécessaire).

**Livrable** : l'application se met à jour toute seule à l'ouverture.

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
