# AUTO.4C — Orchestrateur final de réouverture Production

Date : **16 octobre 2026**. Branche initiale `dev`, HEAD **`8f982ac396669eb34fdfc1d4ee531b595f5cea90`**, worktree propre. Instructions AGENTS et contrats AUTO.1–4B / PROD.4–6 examinés avant implémentation. Version applicative **0.8.33 conservée**, aucune dépendance ajoutée, aucun commit/push. AUTO.5 non commencé.

## Livraison et API réutilisées

`npm run prod:open` fournit l'entrée Windows [open.ps1](../../scripts/production/open.ps1), puis [open-cli.js](../../scripts/production/open-cli.js) et le cœur [runOpen](../../scripts/production/open.js). Configuration Production AUTO.3 et session `my-production-session-v1` inchangées, aucun second registre. Résumé des identités, source/version et archive ; PR/build/lecteur repris du binding ou saisis avec leurs valeurs réelles. Aucun identifiant déduit d'un ancien build de fermeture.

- **AUTO.4A** : `validateOpenSession`, `prepareOpenInSession`, archive PROD.4/provenances, Git/PR/merge, versions, migrations, build Production et alias, contrats de preuve et revalidation. Le mode interne de reprise attend des états exacts issus d'intentions autorisées ; frontend déjà ouvert exige HTTP ouvert, jamais attestation 503 artificielle. API de préparation seule inchangée, sans mutation.
- **AUTO.4B / PROD.6** : appels directs `publishOpenChangelog`, `openPublicationAPI`, `publicationIsVerified`, publication par rôle dédié, reçu et relectures indépendantes. `revalidatePublishedChangelog` partage les validations de reçu/ligne/activité/audience/unicité/retrait/contenu/hash/version. Preuve opérateur AAL2 neuve avec les trois RPC existantes ; aucune simulation depuis `postgres` ni contexte JWT fabriqué.
- **AUTO.1** : `productionFreeze` extrait le raccord déjà présent dans AUTO.3, sans réimplémenter SQL, TLS ou CAS. Même `parseCommand` / `run`, autorisation explicite `reopen`, cible/système/révision, barrière `771403`, commit puis connexion indépendante et `verify-open`. Adaptateur AUTO.3 conservé.
- **AUTO.2** : `createVercelMaintenance`, `preflight`, `publication`, `setMaintenance('reopen', consent)`. Consentement distinct, checkpoint complet, exclusivité opérateur, relectures ; seule `maintenance_production=false`. Authentication All Deployments conservée, aucun changement Preview/SSO/domaines/déploiements.
- **Windows / PROD.4/6** : extension `Tool=ProductionOpen` du wrapper DPAPI existant, réutilisation `Read-NotificationPublisherPassword`, SecureString/BSTR/canaux volatils/nettoyage. Secrets consommés avant configuration/Git ; aucun secret utilisateur AAL2 collecté. Les chaînes JavaScript ne constituent pas une enclave mémoire.

## Ordre et frontière de concurrence

Connexion explicitement autorisée, préparation et attestation de livraison/récupération, publication explicitement autorisée, reçu/relecture et visibilité AAL2, puis revalidation fraîche. Autorisations Supabase et Vercel distinctes de publication et l'une de l'autre, recueillies avant bascule ; nouvelle revalidation après saisie humaine. Dégel Supabase et relecture/`verify-open`, nouvelle revalidation livraison/annonce, puis maintenance Vercel et relecture. Enfin configuration ouverte/alias, preuve applicative authentifiée, relectures finales et clôture.

AUTO.4B reçoit le contexte gardé AUTO.4C : **aucune libération/reprise du verrou AUTO.3 entre publication et ouverture**. Nonce du verrou, configuration, empreintes de session/relevés et ACL contrôlés. AUTO.2 conserve son propre verrou pendant sa mutation. Consentements et intentions durables précèdent chaque appel pouvant écrire ; les intentions lient session/exécution/livraison/publication, révision exacte et checkpoint fermé. Un ancien résultat `ready`/`verified` ne donne aucun droit d'ouverture.

Les outils coopérants sont sérialisés localement ; ils ne créent pas de transaction distribuée. PostgreSQL conserve son CAS ; Vercel n'en fournit pas ici. Exclusion des autres writers Global Config, opérateurs gel/publisher/retrait, changements de livraison et writers privilégiés/DDL/configuration exigée jusqu'aux relectures finales. Une contradiction avant PATCH bloque. Changement externe entre deux systèmes et propagation mondiale restent des limites explicites, sans promesse atomique.

## Reprise et cycle de session

- Publisher sans réponse : même fichier/octet/clé/hash, reçu idempotent du même UUID, relecture réelle et nouvelle preuve AAL2 ; aucune clé ou annonce de secours.
- Annonce vérifiée, protections fermées : refaire les faits actuels et obtenir les autorisations de réouverture ; résultat historique insuffisant.
- Supabase ouvert seul : intention autorisée et révision exactement suivante requises, checkpoint fermé inchangé. Reprise de l'annonce en lecture seule, puis seule bascule Vercel nécessaire. Aucun second dégel ni dispatch de publication.
- Dégel committé mais relecture perdue : état non attesté, Vercel conservé fermé ; nouvelle connexion/examen à la reprise. Échec de lecture ne signifie pas rollback.
- Vercel ouvert sans accusé durable : intention autorisée et Supabase attendu requis. Examen opérateur des changements ; si checkpoint de retour inconnu, journal fournisseur/exclusivité/absence d'autre changement du store à examiner. Le checkpoint relu après cet examen n'est jamais décrit comme CAS.
- Deux protections ouvertes mais contrôles finaux incomplets : session partielle, états explicites, aucun succès global. Refaire preuves actuelles et contrôles humains, sans mutation de protection ou publication supplémentaire.
- Signal/arrêt forcé : marqueur AUTO.3 conservé, comme marqueur AUTO.2 selon son contrat ; aucune suppression automatique/TTL/kill. Le précontrôle refuse un marqueur AUTO.2 existant. Examen des processus/enfants et marqueurs exacts avant retrait manuel coordonné et `REPRENDRE OUVERTURE`.
- Succès enregistré puis accusé perdu/nouvelle exécution : relectures et preuves contemporaines, aucune nouvelle bascule ni publication. Si l'état distant a changé, arrêt avec état réellement observé.

`session.open_reopening` et les relevés AUTO.3 conservent binding, notification/reçu, autorisations, intentions, observations et références de preuves. Clôture `stage=completed` seulement si deux protections ouvertes et preuve applicative finale, après relectures concordantes. Le chargement contrôle l'existence et la cohérence du relevé final. Un échec de vérification/persistance/verrou empêche la prochaine sauvegarde.

Le prochain `prod:backup` peut créer une nouvelle session après clôture complète, sous le verrou existant. Seul `current.json` est remplacé atomiquement ; dossiers UUID terminés, relevés, archives et références restent conservés. Dossier actif supplémentaire ou pointeur manquant : refus, aucun abandon automatique de session.

## Validation

**225 tests Node réussis** : campagne complète AUTO.4A/B/C **121/121**, complément ciblé dégel avant commit **1/1**, et **103/103 régressions** AUTO.3/AUTO.2/maintenance/contrats backup. Soit **42 tests AUTO.4C**, **37 AUTO.4A**, **43 AUTO.4B**. Diagnostic sûr de concurrence et absence de secrets revérifiés par reprise ciblée du test concerné. **111/111 tests Vitest PROD.6** réussis. Aucun skip. TypeScript et lint réussis, syntaxe PowerShell validée ; **259 liens/ancres Markdown** et `git diff --check` réussis. Versions package/lockfile/racine **0.8.33** concordantes.

```powershell
node --test scripts/production/open.test.js scripts/production/open-preparation.test.js scripts/production/open-publication.test.js
node --test --test-name-pattern='unfreeze fails before commit' scripts/production/open.test.js
node --test --test-name-pattern='unknown errors' scripts/production/open.test.js
node --test scripts/production/backup.test.js scripts/maintenance/vercel.test.js scripts/maintenance/operator.test.js scripts/backup/operator.test.js scripts/backup/native.test.js
npm.cmd test -- --project notifications scripts/notifications/contract.test.ts scripts/notifications/cloud.test.ts --maxWorkers=1
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Intégration isolée du vrai cœur AUTO.4A/B, du publisher PROD.6 et des fichiers/session/ACL, avec fournisseurs/SQL simulés, `fetch` et connexions PostgreSQL réelles interdits. Tests Windows du point d'entrée et du wrapper avec clé DPAPI et mots de passe exclusivement synthétiques dans des dossiers temporaires. Régressions AUTO.2 incluent contradiction avant PATCH, changement limité à Production, relecture, idempotence et erreurs réseau. Aucun banc PostgreSQL réel ou serveur applicatif démarré pour cette campagne.

Couverture AUTO.4C : nominal, consentements distincts refusés, PR/build/version erronés, migration/gel/checkpoint, absence de preuve livraison/récupération/AAL2, réponse publisher perdue, reprise sans doublon, revalidation entre publication et ouverture, dégel seul, relecture perdue, contradiction avant Vercel, retrait de l'annonce après dégel, Vercel ouvert avec accusé perdu, interruption à chaque bascule/verrou retenu, preuve finale absente/historique/mauvais build/champ secret, état distant changé pendant contrôle humain, succès répété, clôture falsifiée, rotation/historique, verrous locaux modifiés, ACL et absence de secrets dans résultats/relevés/arguments.

## Préparation restante et limites réelles

[Configuration/usage détaillés](../13-PRODUCTION-AUTOMATION.md#auto4c--commande-finale-prodopen). Même `MY_PRODUCTION_CONFIG` ; cible PROD.6 existante à `notifications\target.json` à côté, ou chemin absolu permanent non secret `MY_PRODUCTION_PUBLISHER_TARGET`. Configuration AUTO.3/volume/clé/ACL/inventaires complets, droits/secret publisher et lecture GitHub privée si nécessaire restent à établir sur le poste réel. Aucun fichier opérateur réel modifié ici.

Changelog exact de la version à préparer/valider/committer **avant sauvegarde** ; seul `0.8.29.json` historique existe actuellement, aucun faux changelog `0.8.33` ajouté. Moyens autorisés pour RPC AAL2 et HTTP/version réellement servie sous maintenance requis ; si indisponibles, arrêt. La commande ne collecte pas de JWT/cookie ni n'ajoute de bypass. HTTP anonyme 302 vers SSO reste attendu ; disponibilité applicative et parcours Auth/MFA/métier sont des **preuves humaines**, distinctes des lectures automatiques des plans de contrôle.

Vraie sauvegarde et essai PROD.5 adapté, données/séquences/permissions/Auth/MFA/application/externe, durée/perte/étapes manuelles restent requis. L'attestation de prérequis est identifiée comme opérateur ; `restore_proven=false` et `production_recovery_proven=false` demeurent explicites, sans certification machine inventée. Les moteurs/contrats/permissions PROD.2/4/5/6 et l'exception permanente `super_admin` restent inchangés.

**Aucune connexion aux projets Cloud MY., opération Vercel/GitHub réelle, notification Production, sauvegarde/restauration, dégel ou désactivation de maintenance effectuée.** Documentation publique Vercel/Supabase consultée via Context7 ; changelog Supabase et avis PostgreSQL 15.19/17.11 consultés, sans changement d'API ou de schéma fournisseur introduit. Tests isolés ne prouvent ni droits/transport Cloud, ni propagation, ni disponibilité hébergée, ni interruption complète du poste, ni coordination réelle multi-opérateurs. Ces limites devront être éprouvées lors de la première intervention explicitement autorisée. AUTO.5 séparée.

Fichiers : `scripts/production/open.js`, `open-cli.js`, `open-command-api.js`, `open.ps1`, `freeze-api.js`, `open.test.js` ajoutés ; préparation/publication/session, adaptateurs backup/cli et wrapper secrets ajustés, test d'entrée `prod:open` mis à jour. `package.json`, README, roadmap et docs 10/11/12/13 alignés ; rapports historiques conservés. Aucun fichier SQL, migration, frontend ou lockfile modifié.
