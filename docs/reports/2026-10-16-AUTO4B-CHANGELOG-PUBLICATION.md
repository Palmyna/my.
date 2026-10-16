# AUTO.4B — Publication sécurisée du changelog Production

Livraison d'outillage sur `dev`, base inspectée `926bcee` (`AUTO.4A`), worktree initial propre. Version applicative **0.8.33 conservée**. Aucun commit/push dans MY., aucune dépendance, migration ou modification des fichiers SQL, RPC ou permissions. AUTO.4C non implémentée ; aucune commande `prod:open` partielle.

## Mécanisme livré

- `publishOpenChangelog` utilise la session AUTO.3, ses relevés, ses écritures atomiques, contrôles d'empreintes/ACL et son verrou `prod-backup.lock`. Le verrou couvre préparation, consentements, publication et relectures ; pas de nouveau système de sessions.
- Le cœur AUTO.4A est extrait en `prepareOpenInSession`, sans changer le comportement de `prepareOpen`. Vérification historique/archive complète une fois par invocation via les mécanismes existants. La fonction `revalidate` refait les observations volatiles après consentement et après contrôles humains : GitHub, release/objets Git/changelog, maintenance, gel/révision, migrations et déploiement/alias. Ancien `ready` insuffisant.
- Publication exclusivement par `connectCloudPublisher` et `publish` PROD.6. Rôle réel, TLS, cluster, ACL et idempotence conservés. Cible PROD.6 existante reliée à la cible de la session ; fichier exact AUTO.4A, hash des octets, clé, hash canonique, version, audience et expiration conservés. Aucun contournement par nouvelle clé.
- Connexion Cloud et publication nécessitent deux consentements explicites distincts, tracés par session/exécution/périmètre/date. Autorisation d'export PROD.4 sans effet ici. La future interface pourra regrouper ces deux demandes sans multiplier les confirmations par connexion technique.
- `connectCloudPublisher` accepte aussi le mot de passe en mémoire ; la CLI existante garde son canal volatil nettoyé. Saisie masquée PROD.6 extraite en fonction PowerShell réutilisable, sans nouvelle commande d'exploitation. `consumeOpenSecrets` retire les canaux volatils avant tout enfant/configuration ; `dispose` nettoie les références et la clé AES, avec les limites habituelles des chaînes JavaScript.
- Un relevé durable précède le SQL possible. Le reçu valide clé/hash/UUID/date sous identité publisher vérifiée. Le reçu SQL n'inclut pas la version : celle-ci est contrôlée dans le fichier et la relecture indépendante.
- Chaque relecture ouvre une nouvelle connexion administrative AUTO.1, TLS/identité vérifiés, transaction strictement en lecture seule. Comparaison du contenu complet normalisé, hash recalculé, auteur, version/audience/expiration, activité et absence de retrait. Recherche clé ou changelog de même version : seconde ligne bloquante. Aucun droit de lecture accordé au publisher.
- Visibilité : preuve opérateur fermée, liée au nouveau challenge (session/exécution/checkpoint/projet/utilisateur/annonce/clé/hash/version/date), attestant une vraie session AAL2 et les RPC `get_notification_center`, `get_notification_unread_count`, `get_notification_content`. Profil/Auth, éligibilité et état individuel sont aussi relus en base. Aucun contexte JWT fabriqué ni RPC utilisateur appelée comme `postgres` ; aucune marque de lecture ou de traitement. Relecture finale et contrôles volatiles après la preuve humaine.

## Interfaces AUTO.4C

- [open-publication.js](../../scripts/production/open-publication.js) : `publishOpenChangelog`, `visibilityEvidenceSchema`, `publicationIsVerified(result, currentRunId)`.
- [publication-api.js](../../scripts/production/publication-api.js) : `consumeOpenSecrets`, `openPublicationAPI`, `readPublishedChangelog`.
- [open-preparation.js](../../scripts/production/open-preparation.js) : `prepareOpenInSession` et sa fonction `revalidate`, `prepareOpen` conservé.
- [release.js](../../scripts/production/release.js) : `readPinnedChangelog`, contrats de préparation existants conservés.
- [secrets.ps1](../../scripts/notifications/secrets.ps1) : import `-LoadFunctionsOnly`, fonction `Read-NotificationPublisherPassword` retournant un `SecureString`.

Le dernier état est `session.open_publication`, format `my-production-open-publication-v1`. Consentements, dispatch, reçu, relectures, challenge/preuve et résultat utilisent les relevés AUTO.3. Chaque résultat conserve `reopen_authorized=false`, `protections_changed=false` et une validité limitée aux observations. `publicationIsVerified` demande l'exécution courante ; aucun résultat historique ne remplace les vérifications qu'AUTO.4C devra refaire avant ses actions.

## Échec et reprise

| Résultat | Sens |
|---|---|
| `verified` | Reçu, annonce actuelle active/exacte/unique, preuve éligible AAL2 et contrôles finaux concordants |
| `not_published` | Aucun dispatch par cette session ; `existence=unobserved` ne prétend pas que la clé est absente du serveur |
| `uncertain` | Requête possible sans confirmation suffisante, interruption, relecture indisponible après reçu, persistance/verrou incertains |
| `existing_ineligible` | Présence/reçu connus, mais preuve manquante, préconditions invalides, conflit, retrait, expiration ou doublon bloquants |

Réponse perdue après transaction : reprise avec même fichier/clé/hash, reçu idempotent du même UUID, nouvelles relectures et nouvelle preuve. Échec réseau avant SQL possible : aucun dispatch ; après marqueur : conservativement incertain. Même clé/contenu différent, annonce retirée/expirée ou seconde annonce : aucun nouvel identifiant ni correction automatique. Une visibilité non démontrée ne devient jamais `verified`.

Interruption : marqueur durable et verrou conservés ; examiner l'état et arrêter les anciens processus/enfants avant retrait manuel du seul verrou exact. Reprise sans nouvelle capture, sans clé de secours et sans changement du binding. Fichier, livraison et utilisateur de vérification épinglés ; changer l'identité exige un examen opérateur de cette session. Maintenance/gel ne sont jamais modifiés, même après erreur.

## Validation exécutée

**183/183 tests Node réussis**, sans skip : **43 AUTO.4B**, **37 AUTO.4A**, **103 régressions** AUTO.3/AUTO.2/maintenance/contrats backup. **111/111 tests de contrats et mocks PROD.6 réussis**, sans skip. TypeScript et lint réussis. Analyse syntaxique PowerShell et import des fonctions seules réussis. `git diff --check` et cohérence package/lockfile/racine `0.8.33` vérifiés ; commande `prod:open` absente.

Après consolidation des contrôles de chemin/octet dans `readPinnedChangelog`, les deux tests concernés (graphe Git isolé et octets épinglés) et le lint du fichier repassent. **246 liens locaux et ancres Markdown** vérifiés sur les documents actualisés et ce rapport.

```powershell
node --test scripts/production/open-publication.test.js scripts/production/open-preparation.test.js scripts/production/backup.test.js scripts/maintenance/vercel.test.js scripts/maintenance/operator.test.js scripts/backup/operator.test.js scripts/backup/native.test.js
npm.cmd test -- --project notifications scripts/notifications/contract.test.ts scripts/notifications/cloud.test.ts --maxWorkers=1
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Script ciblé ajouté : `npm.cmd run prod:publication:test`. Fixtures AUTO.4A partagées, sans importer un fichier de tests pour créer une seconde suite. Réseau HTTP et connexions PostgreSQL réelles explicitement interdits dans les tests AUTO.4B ; sessions/fichiers/ACL temporaires isolés, secrets exclusivement synthétiques. Le test de graphe AUTO.4A crée ses commits uniquement dans un dépôt temporaire jetable.

Couverture : nominal, idempotence, conflit avant/après première relecture, réponse perdue, reprise sans doublon, retrait, expiration, doublon de version sous autre clé, mauvaise version/hash/identité/UUID de reçu, absence de preuve, preuve ancienne/mauvais utilisateur/AAL1, profil absent/utilisateur traité/hors audience, exception d'audience, mutation de l'état individuel, protections ou livraison modifiées avant/après publication, interruption/concurrence, verrou altéré, édition extérieure, ACL élargies, erreurs et champs secrets supplémentaires supprimés des résultats, canaux consommés, cible publisher incohérente, SQL paramétré sans mutation et refus du reformatage des octets épinglés.

## Limites et portée des preuves

**Aucune connexion aux projets Supabase Cloud, Vercel ou GitHub, aucune notification Production, capture, restauration ou réouverture effectuée.** Aucun banc Local ou PostgreSQL réel exécuté. Le nouveau SELECT est couvert par mocks et revue des contrats/migrations du dépôt ; aucune validation d'exécution SQL hébergée revendiquée. Les opérations de chiffrement et les fichiers des tests sont synthétiques, sans données personnelles ni volume de sauvegarde réel.

Les RPC authentifiées restent une **preuve opérateur**, pas un test automatique d'une session réelle. L'opérateur doit utiliser une vraie identité éligible AAL2 et un moyen autorisé de faire uniquement ces lectures. Sans ce contexte sûr, publication présente mais réouverture non admissible. Ni le reçu historique, ni l'accès administratif, ni une assertion de claims ne prouvent la visibilité. Aucun bypass de maintenance/Authentication fourni. Le parcours frontend Production sous maintenance conserve les limites AUTO.4A.

Le dépôt conserve uniquement le changelog historique `0.8.29.json` ; aucun changelog produit inventé pour cette livraison d'outillage. Avant une future sauvegarde/livraison, le fichier de sa version réelle devra être préparé, validé et committé au chemin conventionnel, comme l'exige AUTO.4A. Un fichier manquant bloque la préparation.

Les contrôles cohérents et le verrou coordonnent les outils coopérants ; ils ne créent pas de transaction distribuée GitHub/Vercel/PostgreSQL ni de signature contre un administrateur hostile. Exclusion des writers privilégiés toujours nécessaire. AUTO.4C devra composer l'interface finale et revalider avant de lever les protections dans l'ordre documenté ; cette livraison ne commence pas cette phase.

Documentation opérateur actualisée : [automatisation](../13-PRODUCTION-AUTOMATION.md#auto4b--publication-et-vérification-du-changelog), [notifications](../10-NOTIFICATION-PUBLICATION.md), [publication Production](../11-PUBLICATION-PRODUCTION.md), README et roadmap générale. Rapports historiques conservés.
