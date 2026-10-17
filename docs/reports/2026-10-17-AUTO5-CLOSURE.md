# AUTO.5 — Validation intégrée et clôture de l'automatisation Production

Date : **17 octobre 2026**. Branche `dev`, HEAD **`c639289d206a367435febca38d97088b66a260c4`**, dépôt propre au départ. AGENTS, rapports AUTO.1–4C, contrats et raccords PROD.2/4/5/6 examinés. Version applicative **0.8.33 conservée** ; dépendances, lockfile, SQL, migrations et métier inchangés. Aucun commit/push dans MY. ; commits/merges exclusivement dans les dépôts Git jetables des tests.

**AUTO clôturée sur preuve intégrée synthétique. PROD.7C non commencé.** Aucune connexion aux projets Vercel/Supabase/GitHub MY., notification, capture/restauration ou bascule Production réelle. Documentation publique fournisseur consultée sans accès aux projets. Aucun secret réel lu ou chargé ; fichiers opérateur non secrets relus hors connexion, sans modification.

## Résultat du parcours intégré

Le nouveau [scénario](../../scripts/production/workflow.integration.js), ses [fournisseurs simulés](../../scripts/production/workflow-fixtures.js) et les [tests Windows](../../scripts/production/workflow.windows.test.js) exercent les vraies fonctions `runBackup` et `runOpen`, sans mode de simulation ni bypass ajouté aux commandes opérateur.

| Étapes demandées | Preuve obtenue |
|---|---|
| 1–2 : source `dev` propre, version/changelog, backup | Dépôt Git temporaire réel, packages concordants, changelog synthétique `99.0.1` committé ; vrai orchestrateur et validation du commit |
| 3–5 : fermeture, gel, drainage, sauvegarde | Adaptateur Vercel réel avec transport HTTP simulé ; gel/révision simulés ; vrai `readDrainage`/`requireClosed`, moteur `capture`, snapshot fourni par SQL simulé, chiffrement AES-GCM et `verify` indépendant |
| 6 : session et références | Vrais fichiers protégés, relevés, pointeur, tentatives, références et manifeste chiffré liés à la source/révision ; sept fichiers conservés |
| 7–8 : PR, merge distinct, migrations/build promu | Merge Git classique réel, arbre identique et SHA distinct ; lecteur GitHub et contrôle Vercel build/alias réels avec réponses simulées ; migrations et réussite/promotion attestées synthétiquement |
| 9–12 : `prod:open`, livraison/archive, changelog, AAL2 | Vrais AUTO.4A/B/C, Git local, archive revérifiée, contrat et fonction `publish` PROD.6 ; DB publisher simulée, reçu/relecture et challenge de visibilité ; vraies questions/schémas opérateur avec réponses synthétiques |
| 13–15 : dégel, Vercel, contrôle final | Consentements distincts, dégel simulé avant PATCH Vercel simulé ; relectures fraîches et preuve applicative synthétique ; clôture durable seulement après succès |
| 16 : publication suivante | Second `prod:backup`, nouvel UUID et nouvelle archive, pointeur remplacé ; première session clôturée et hashes de tous ses fichiers d'archive inchangés. Seconde livraison `99.0.2` également ouverte et clôturée |

Projet PostgreSQL de test `aaaaaaaaaaaaaaaaaaaa`, système fictif, identités/permissions simulées et dossiers `%TEMP%\my-auto5-*` ; aucune vraie clé, cible ou session MY. utilisée. Les libellés domaine/référentiel imposés par les contrats existants restent des données transmises aux doubles HTTP en mémoire. `fetch` global et connexions `pg` réelles interdits ; aucun transport ne relaie vers un endpoint externe. Seul `git archive` est démarré, explicitement redirigé vers le dépôt jetable ; les autres commandes Git restent locales.

Les bornes de simulation sont explicites : connexions/SQL fournisseur, inventaire DB, vérification du contrat SQL et outils `pg_dump`/`pg_restore` sont remplacés par fixtures. `identity`, drainage, bornes de séquence, capture/manifestes/chiffrement, déchiffrement authentifié et vérification des fichiers sont exécutés réellement. Le dump contient des données synthétiques au format du fournisseur simulé : **aucune nouvelle preuve d'archive PostgreSQL native, de TLS réel ou de restauration**. Ces contrats ont leurs campagnes historiques distinctes, non refaites sans anomalie.

## Défaut corrigé

Avant correction, une source sans changelog committé valide pouvait être fermée et sauvegardée ; la livraison se retrouvait ensuite bloquée par AUTO.4A. Reproduction intégrée obtenue avec fichier absent et mauvaise version.

`inspectSourceRelease` réutilise maintenant le même contrôle des versions package/lock, des octets committés et du payload PROD.6 pour backup et ouverture. `runBackup` l'appelle avant création/rotation de session et connexion/fermeture d'une nouvelle publication, puis avant nouvelle capture d'une session incomplète. Raccord dans `productionAPI`, sans changement PROD.4/6 ni nouvelle configuration.

Changelog absent, mauvais schéma ou mauvaise version : arrêt sans connexion, protection changée, capture ou session créée. Refus de nouvelle livraison après une clôture : session précédente inchangée. Revérification d'une archive complète : aucun contrôle du changelog d'un `dev` ultérieurement avancé, aucun export supplémentaire. La régression existante exige explicitement cette dernière propriété.

## Tests et validations

**351 tests distincts réussis, aucun skip** :

| Campagne | Résultat |
|---|---|
| Nouveaux tests AUTO.5 | **15** : 9 intégrations et 6 Windows ; campagne complète initiale 14/14, puis dernier cas de schéma invalide ajouté et exécuté seul 1/1 |
| AUTO.3 / AUTO.4A/B/C | **166/166** ; après correction, backup/préparation **81/81** réexécutés, puis backup final **44/44**, sans compter les répétitions dans le total |
| AUTO.2 / maintenance / contrats backup Docker et natif | **59/59** |
| Vitest contrats et sécurité PROD.6 | **111/111** |
| TypeScript / lint | `npm.cmd run typecheck`, `npm.cmd run lint` réussis |
| PowerShell | Parseur Windows : **6 fichiers `.ps1`** sans erreur ; tests d'exécution ci-dessus |
| Documentation / diff / versions | **233 liens/ancres** des cinq documents touchés, `git diff --check`, versions package/lock/racine **0.8.33** concordantes |

Commandes reproductibles :

```powershell
npm.cmd run prod:test:isolated
node --test scripts/production/backup.test.js scripts/production/open-preparation.test.js scripts/production/open-publication.test.js scripts/production/open.test.js
node --test scripts/maintenance/vercel.test.js scripts/maintenance/operator.test.js scripts/backup/operator.test.js scripts/backup/native.test.js
npm.cmd test -- --project notifications scripts/notifications/contract.test.ts scripts/notifications/cloud.test.ts --maxWorkers=1
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

`prod:test:isolated` utilise le mocking de modules de Node **24.20.0** (`--experimental-test-module-mocks`), uniquement dans les tests. Avertissement expérimental attendu, aucune dépendance ni surface opérateur ajoutée. Campagnes lourdes PostgreSQL natif/Docker/restore, Supabase personnel et build hébergé non relancés : aucun moteur/transport/contrat SQL modifié.

## Reprises et frontières critiques

| Frontière | Validation |
|---|---|
| Protection déjà active | Parcours intégré pour chacune des deux protections ; aucun PATCH/révision de fermeture supplémentaire |
| Capture interrompue, vérification indépendante échouée | Archive partielle et marqueur conservés ; nouvelle destination après examen explicite. Archive complète reprise par `verify`, sans nouvel export |
| Git/configuration changés pendant session | Régressions AUTO.3/4A/B : refus, aucune adoption silencieuse de source, fichier, révision ou checkpoint |
| Mauvaise PR/version, changelog absent/incorrect | Régressions AUTO.4A/C ; nouveaux refus précoces du changelog avant backup |
| Changelog déjà publié/conflictuel, réponse perdue | Contrat PROD.6 et régressions AUTO.4B ; reprise intégrée du même UUID/fichier/clé/hash, une seule ligne |
| Preuve AAL2 absente | Annonce éventuellement présente, deux protections restent fermées ; nouvelle preuve contemporaine exigée |
| Dégel réussi, Vercel échoué | État `open/closed`, marqueur AUTO.2 conservé ; après examen du marqueur exact, seul Vercel bascule, aucun second dégel/publish |
| Deux protections ouvertes, contrôle final incomplet | Résultat `incomplete`, aucun faux succès ; mêmes reçus et protections, nouvelles preuves et relectures jusqu'à clôture |
| Nouvelle tentative après succès | Aucun export/publish/PATCH/dégel ; nouveaux `run_id`/preuve finale et lectures réelles, ancien succès insuffisant |
| Archives/historique entre deux publications | Deux cycles complets ; nouvelle session et conservation octet pour octet de la première session clôturée et de son archive |
| Marqueurs abandonnés | Verrou AUTO.3 après interruption et AUTO.2 après échec refusent la suite ; aucune suppression/expiration automatique. Tests retirent seulement leurs propres marqueurs après fin/examen synthétiques |

Les autres tests AUTO.1–4C restent responsables de leurs contrats unitaires ; aucune nouvelle campagne ne prétend les réauditer. Maintenance avant gel, archive vérifiée avant merge de fixture, livraison avant publication, consentements séparés avant dégel/PATCH, gel levé avant maintenance, absence de rollback et conservation à l'échec sont conservés. All Deployments et exception permanente `super_admin` inchangées.

## Commandes Windows et expérience opérateur

Les commandes finales restent exactement :

```text
npm run prod:backup → powershell.exe -NoProfile -File scripts/production/backup.ps1
npm run prod:open   → powershell.exe -NoProfile -File scripts/production/open.ps1
```

Les six nouveaux tests exécutent ces vrais fichiers d'entrée et le wrapper commun DPAPI : configuration permanente hors Git via `MY_PRODUCTION_CONFIG`, clé DPAPI synthétique réellement déchiffrée, chaque prompt secret exigeant `-AsSecureString`, token GitHub facultatif vide accepté, bon script enfant et seulement `--config <chemin>` en arguments. Succès, code enfant 23 et erreur pendant la saisie Vercel contrôlés ; canaux sensibles nettoyés à chaque sortie, aucun secret en arguments/sorties. Le lancement Node est remplacé par une fonction de contrôle dans cette preuve Windows ; l'orchestration Node est éprouvée séparément dans le parcours intégré. Les BSTR restent libérés par `ZeroFreeBSTR` dans le wrapper existant. Aucun test ne prétend effacer toutes les copies des chaînes JavaScript ou traiter un arrêt électrique réel.

La [procédure pratique](../13-PRODUCTION-AUTOMATION.md) commence désormais par quatre moments : avant publication, publication, réouverture, échec. Configuration unique séparée des consentements/preuves nécessaires par livraison ; PR/build/lecteur déjà épinglés repris sans nouvelle saisie. La preuve AAL2 et les trois RPC de lecture, HTTP sous admission Vercel normale et les limites du 302 SSO restent visibles. Aucun cookie/JWT/session utilisateur automatisé ni bypass.

## Seuls prérequis bloquants avant la première sauvegarde Cloud

Lecture actuelle hors connexion : cible Windows PROD.4 et VHDX présents ; **champs permanents de l'évidence valides**, **inventaire externe et références valides**. Aucun retour aux anciens décomptes 9/13, devenus historiques. Ces validations de structure ne prouvent pas chaque déclaration d'inventaire ni sa fraîcheur future.

1. **Configuration et stockage AUTO utilisables.** `D:\MY-operator\production.json` et destination `M:\MY-backups` absents au relevé. Référencer les cibles AUTO.1/AUTO.2/PROD.4, préparer les sessions protégées hors M:, monter le volume approuvé et référencer son numéro de série/chiffrement/absence de synchronisation : aucun relevé conforme AUTO.3 de volume trouvé. ACL de l'espace opérateur, parent de secrets et VHDX encore à examiner pour le contrat strict opérateur/SYSTEM. Raccorder la copie DPAPI et sa récupération indépendante selon les relevés existants ; aucun secret réel consulté ici.
2. **Vraie livraison prête avant backup.** Source `dev` propre/committée, version concordante et vrai changelog de cette version committé. Seul `0.8.29.json` historique existe actuellement ; aucun faux `0.8.33` ajouté.
3. **Intervention Cloud séparément autorisée et preuves contemporaines.** Identité/TLS/droits/contrat sur les cibles exactes, fermeture Vercel authentifiée effective, gel/révision et drainage réels ; exclusion durable des writers privilégiés/DDL/configuration ; consentements connexion, fermeture et export. Le bootstrap du premier build équipé reste conditionnel à l'état réellement servi, selon PROD.7C.1. AUTO.5 n'établit ni n'autorise ces faits.

**Pas des prérequis de capture :** cible/droits publisher (`D:\MY-operator\notifications\target.json` absent au relevé), accès GitHub si privé, moyen de preuve de version servie et client AAL2 sûr, essai PROD.5 de la vraie archive. Ils restent requis avant publication/réouverture, sans être artificiellement ajoutés à la première sauvegarde.

PROD.5 doit encore éprouver cette archive, clients compatibles/serveur/extensions, données/séquences/permissions, Auth/MFA/application/externe, durée/perte et étapes manuelles. Clés Auth de déchiffrement, signature ES256 privée non exportable, validité des sessions et reprovisionnement SMTP/API/Edge gardent leurs limites documentées. Aucun succès AUTO ne devient une garantie de récupération Production : **`restore_proven=false`, `production_recovery_proven=false`**. Sous maintenance, un 503 ne démontre pas la version applicative servie ; sans preuve autorisée, `prod:open` s'arrête. Ces sujets appartiennent à la reprise séparée de PROD.7C, pas à une nouvelle fonctionnalité AUTO.
