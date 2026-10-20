# Réflexion — plusieurs comptes (2 Mobile Money + plusieurs banques)

> Document de réflexion, **rien n'est décidé ni codé**. Il sert à choisir avant d'ouvrir un sprint.
> Date : 2026-10-20.

## 1. Réponse courte

**Oui, cela demande de la réflexion**, parce que ça touche le cœur du modèle : aujourd'hui toute l'application suppose **un seul compte** (un seul flux de `SoldeMM`, un seul « solde Mobile Money disponible », un seul expéditeur de SMS, un seul code USSD de solde).

Mais c'est faisable **sans tout casser**, si on introduit une notion de **« Compte »** et qu'on rattache à elle les soldes et les transactions. Le point délicat n'est pas la technique, c'est une **décision de principe** (voir §4) : *les budgets sont-ils alimentés par tous les comptes ensemble, ou chaque budget est-il lié à un compte ?*

## 2. Ce qui est supposé « un seul compte » aujourd'hui

| Élément | Hypothèse actuelle | Effet avec plusieurs comptes |
|---|---|---|
| `solde_om` | un solde par SMS/consultation, sans compte | on ne sait plus à quel compte appartient un solde |
| Solde disponible | dernier solde − dépenses normales postérieures | à calculer **par compte**, puis à additionner |
| Libre à allouer | solde disponible − réservé | devient « total de tous les comptes − réservé » (ou par compte, selon §4) |
| Alerte « écart de solde » | un seul écart | un écart **par compte** (sinon une erreur sur un compte masque l'autre) |
| Import SMS | un expéditeur (`sms_expediteur`), modèles `modele_sms` communs | un expéditeur et des modèles **par compte** |
| USSD solde | un code, une SIM (`ussd_code_solde`, `ussd_sim`) | un code et une SIM **par compte Mobile Money** |
| Transactions | `allocation` + `trx_id`, pas de compte | il faut savoir **de quel compte** l'argent est sorti |
| Sauvegarde | tables connues | ajouter la table `compte` (+ migration, compatibilité des anciennes sauvegardes) |

## 3. Proposition de modèle : une table `compte`

```
compte
  id
  nom                 -- « Orange Money », « Mvola », « BOA », « BNI »…
  type                -- 'mobile_money' | 'banque'
  mode_solde          -- 'sms' (solde lu dans les SMS) | 'manuel' (saisi à la main)
  expediteur_sms      -- nom de l'expéditeur des SMS (vide si manuel)
  ussd_code_solde     -- facultatif, comptes Mobile Money seulement
  ussd_sim            -- facultatif
  actif               -- 0/1 (un compte fermé est archivé, jamais supprimé s'il a un historique)
  insert_date
```

Rattachements :
- `solde_om` → ajouter `compte_id` (les soldes existants vont au compte créé par la migration, « Mobile Money »).
- `transactions` → ajouter `compte_id` (idem : tout l'existant va au compte par défaut).
- `modele_sms` → ajouter `compte_id` (un modèle décrit le SMS **d'un** compte) ; les modèles livrés vont au compte par défaut.
- `operation_ussd` → ajouter `compte_id` (une opération USSD est lancée depuis **un** compte Mobile Money).
- Les noms de table `solde_om` / `operations_om` restent (règle de nommage du sprint 15) : on ajoute seulement une colonne.

### Deux façons d'alimenter les soldes

1. **Compte avec SMS** (Mobile Money, et banques qui envoient un SMS par transaction) : même mécanique qu'aujourd'hui — expéditeur + modèles de SMS → `Transaction` à classer + `SoldeMM` conservé. **C'est la solution à privilégier** : aucune saisie.
2. **Compte manuel** (banque sans SMS) : l'utilisateur saisit **le solde** de temps en temps. Conséquence importante : sans SMS, les **dépenses ne sont pas connues une à une**. Il y a alors deux sous-cas :
   - il saisit aussi ses dépenses à la main (comme une dépense manuelle, rattachée au compte) ;
   - ou il ne saisit **que le solde**, et l'écart avec le solde précédent est une **dépense globale « non détaillée »** à classer ou à ignorer.

## 4. La vraie question à trancher : comment l'argent des comptes alimente les budgets ?

**Option A — « Pot commun » (recommandée pour démarrer).**
Les budgets restent comme aujourd'hui, indépendants des comptes. *Libre à allouer = total des soldes de tous les comptes − réservé.* Une dépense choisit seulement **de quel compte elle sort** (pour tenir à jour le solde de ce compte), et diminue le budget comme avant.
- ✅ Changement minimal : budgets, allocations, reports, transferts, tableau de bord **ne changent pas**.
- ✅ Correspond à « mon argent, tous comptes confondus, réparti en budgets ».
- ⚠️ Une dépense « loisirs » peut sortir de n'importe quel compte : c'est voulu, mais l'allocation ne garantit pas que *le bon compte* contient l'argent (ex. budget « écolage » alloué alors que l'argent est sur la banque, et on paie par Mobile Money). L'alerte « écart » par compte (§5) couvre ce risque en partie.

**Option B — Budget lié à un compte.**
Chaque budget a un compte d'origine ; *libre à allouer* se calcule **par compte**.
- ✅ Plus précis : on sait que l'écolage est dans la banque.
- ❌ Beaucoup plus lourd : transferts entre budgets de comptes différents (= virement réel ?), reports, alertes, tableau de bord, tout est à multiplier par compte.
- ❌ Complexité forte pour un usage mono-utilisateur.

**Option C — Transferts entre comptes seulement.**
Ajouter A + un « virement entre comptes » (ex. banque → Mobile Money) : sortie d'un compte, entrée dans l'autre, **sans toucher aux budgets** (l'argent total ne change pas). Utile en pratique (on recharge son Mobile Money depuis la banque), et peu coûteux : deux lignes liées comme les transferts de budgets. À prévoir dès le départ pour ne pas fausser les soldes.

**Recommandation : A + C.** B seulement si le besoin « ce budget doit venir de ce compte » est confirmé.

## 5. Conséquences sur les règles existantes (avec l'option A + C)

- **Solde disponible d'un compte** = dernier solde du compte − dépenses normales de ce compte datées après lui (même règle qu'aujourd'hui, appliquée par compte). **Disponible total** = somme des comptes actifs.
- **Libre à allouer** = disponible total − réservé. Le blocage « sans aucun solde, toute allocation est refusée » devient : « **aucun** compte n'a de solde ». À discuter : faut-il un solde sur **chaque** compte actif ? (plus sûr, mais pénible si un compte est vide ou oublié.)
- **Alerte écart** : un écart par compte, avec le nom du compte. Mais attention : avec le pot commun, le « réservé » est global, donc l'écart ne peut se calculer qu'**au total** (disponible total < réservé), pas par compte. L'alerte par compte devient : « le solde saisi/reçu pour ce compte est plus bas que prévu par les dépenses connues » — c'est un autre calcul (solde attendu = ancien solde − dépenses ; comparé au nouveau solde reçu). **À préciser avant de coder.**
- **Dépense** : on ajoute le compte (par défaut : le dernier utilisé ; pour un SMS : le compte de l'expéditeur, connu automatiquement).
- **Classement d'une dépense SMS** : inchangé (à la main dans un budget), le compte est déjà connu.
- **Comptes manuels (banque sans SMS)** : rappel périodique « solde de la banque non mis à jour depuis N jours » (nouvelle alerte), sinon le disponible total est faux sans qu'on le voie.
- **PIN** : le PIN Mobile Money reste demandé à chaque consultation ; avec 2 comptes Mobile Money, le code USSD et la SIM sont ceux **du compte choisi**.
- **Tableau de bord** : « solde Mobile Money » devient « solde par compte » + total ; courbe d'évolution : une courbe par compte (ou un total). Les budgets ne changent pas.

## 6. Cas particulier : les banques

- **Banque avec SMS par transaction** : traitée exactement comme un compte Mobile Money (expéditeur + modèles). Seule différence : les gabarits de SMS propres à la banque (le sprint 17 le permet déjà : 8 variables, sens débit / crédit / ignorer). **Il faudra un vrai SMS de chaque banque** pour écrire les modèles — comme pour Orange Money.
- **Banque sans SMS** : saisie manuelle du solde (§3, cas 2). Pas d'USSD en général.
- **Banque avec SMS seulement sur certaines opérations** (cas fréquent : carte oui, virement non) : le solde reçu corrige le calcul, l'écart révèle ce qui manque — c'est le comportement actuel de l'alerte d'écart, donc bien adapté.
- **Virements Mobile Money ↔ banque** : si la banque envoie un SMS pour la sortie et Mobile Money un SMS pour l'entrée, il faut les reconnaître comme **un virement entre comptes** et non comme une dépense + un crédit. Piste : un modèle de sens `virement` (à discuter) ; sinon l'utilisateur ignore le côté qu'il ne veut pas compter.

## 7. Risques et points d'attention

1. **Même SMS reçu par deux comptes ?** Non : l'expéditeur identifie le compte. Mais deux comptes de **même opérateur** (2 numéros Orange Money) ont le **même expéditeur** → le SMS ne dit pas toujours quel numéro. À vérifier sur de vrais SMS ; sinon désigner le compte par le **numéro** présent dans le SMS, ou une saisie manuelle du compte au classement.
2. **2 SIM** : l'Android sait envoyer l'USSD par SIM choisie (déjà fait au sprint 16), mais lire les SMS de chaque SIM peut demander de distinguer la boîte (`sub_id`). À tester sur le téléphone.
3. **Sauvegarde / restauration** (sprint 8 encore en attente) : toute nouvelle table doit y entrer ; une sauvegarde d'avant la migration reçoit un compte par défaut.
4. **Migration** : créer le compte « Mobile Money » par défaut, y rattacher tout l'existant, **sans rien perdre**. Réversible uniquement par sauvegarde (rappel : une clé de signature différente efface la base).
5. **Taille du chantier** : tables, import SMS, USSD, solde, alertes, tableau de bord, sauvegarde, écrans. À découper en sprints (§8), pas en un seul.

## 8. Découpage possible (si on valide A + C)

1. **Sprint A — Socle « Compte »** : table `compte`, migration (compte par défaut), colonne `compte_id` partout, écran de gestion des comptes (créer, renommer, archiver). L'application se comporte comme avant avec 1 compte.
2. **Sprint B — Soldes par compte** : solde disponible par compte + total, libre à allouer sur le total, saisie manuelle du solde d'un compte, rappel « solde ancien » pour les comptes manuels.
3. **Sprint C — SMS et USSD par compte** : expéditeur, modèles et code USSD/SIM par compte ; import qui rattache chaque SMS au bon compte.
4. **Sprint D — Virements entre comptes** + alertes d'écart par compte.
5. **Sprint E — Tableau de bord** par compte + sauvegarde (vérifier l'inclusion).

Chaque sprint laisse l'application utilisable.

## 9. Questions à te poser avant de décider

1. Les budgets sont-ils alimentés par **l'ensemble de ton argent** (option A), ou certains budgets doivent-ils venir d'un compte précis (option B) ?
2. Combien de comptes au total, et lesquels ont des **SMS à chaque transaction** ? (Peux-tu fournir un SMS réel de chaque banque / du 2ᵉ Mobile Money, numéros masqués ?)
3. Les **2 comptes Mobile Money** : deux opérateurs différents (Orange + Mvola, expéditeurs différents) ou deux numéros du même opérateur ? Une ou deux SIM dans le téléphone ?
4. Pour une banque **sans SMS** : préfères-tu saisir seulement le solde (l'écart = dépense non détaillée) ou aussi chaque dépense ?
5. Fais-tu des **virements entre tes comptes** (banque → Mobile Money) ? Si oui, souvent ?
6. Veux-tu **un solde obligatoire pour chaque compte** avant d'autoriser une allocation, ou seulement au moins un ?

## 10. Prochaine étape suggérée

Répondre aux questions 1, 2 et 3 (les plus structurantes). Ensuite : mise à jour de `CLAUDE.md` et `SPRINTS.md` avec les sprints retenus, puis démarrage du sprint A.
