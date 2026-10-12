# Phase 8B.7 — Lecteur v2 et intégration applicative complète

Date : 2026-10-09. Livraison **Local uniquement**, version **0.8.6**. Lecteur v2, décodeurs stricts et intégration des trois writers dans les services/hooks existants livrés. Les nouvelles créations et les quatre collections utilisateur restent **contrat 1**. Activation et validation finale réservées à **8B.8**, après validation de cette livraison.

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `07b761b33c4bed153a8a0aec91247b64613c91cb` | Identique |
| Git | Worktree propre, aucun changement préexistant | 32 fichiers suivis modifiés, 9 nouveaux, rien indexé ; aucun commit/push |
| Application | `0.8.5` | `0.8.6` |
| Node / npm / CLI | `24.20.0` / `12.1.0` / `2.120.0` | Identiques |
| Migrations Local | 35 appliquées | **36/36 appliquées**, dernière `20261009124754` |
| Base / API Local | `127.0.0.1:55322` / `http://127.0.0.1:55321` | Volume conservé, aucun reset |
| Cloud | Dernier checkpoint propriétaire documenté : 29 migrations | Aucun accès ni application ; état distant non revérifié |

Avant modification : lecture de `AGENTS.md`, des rapports 8A.3 et 8B.1 à 8B.6, documentation courante, migrations, lecteurs/writers installés, création libre/automatique, partage, services, caches, hooks et renderers. Documentation courante CLI/Supabase, TanStack Query, Zod, Vitest et agent-browser consultée via Context7. Les créations conservent leurs contrats SQL/services existants.

## Lecteur PostgreSQL

[Migration](../../supabase/migrations/20261009124754_phase8b7_collection_content_v2.sql) créée via CLI (`migration new phase8b7_collection_content_v2`), inspectée pour une seule transaction BEGIN/COMMIT, puis appliquée par `migration up --local` après inventaire Local. Types régénérés par `npm run db:types` ; aucun changement manuel des types générés. Historique Local final vérifié.

```sql
public.get_collection_content_v2(p_collection_id uuid) returns jsonb
```

Une instruction SQL `STABLE SECURITY INVOKER`, `search_path=''`. EXECUTE réservé à authenticated ; aucun droit de table, policy, RLS ou writer modifié. Le parent est lu sous RLS, puis la projection de `get_collection_content` est réutilisée dans le même snapshot SQL. Réutilisation des jointures, de la possession du propriétaire et de l’ordre existants, sans seconde implémentation métier.

Enveloppe exactement `{order_contract_version,personal_revision,items}` : contrat réel **1 ou 2**, révision BIGINT en chaîne décimale canonique. Les items gardent exactement les 15 clés historiques et ajoutent `is_hidden:false`, constante SQL jusqu’à 8C. `sort_position,id` détermine toute la séquence ; ni limite, pagination, filtre, rejeu d’intentions ni mutation à la lecture. Parent invisible → SQL NULL ; parent visible vide → enveloppe avec `items:[]`. Partage : lecture seule, possession du propriétaire.

`get_collection_content` et `get_collection_item_order` restent intacts. Migration installée comparée au corps versionné ; tous les corps/ACL des fonctions préexistantes comparés au snapshot initial, sans divergence.

## Services et frontières TypeScript

- [Types de contenu](../../src/types/collection-content.ts) : item v2, enveloppe et révision personnelle texte. [Schémas communs](../../src/lib/collection-contract.ts) : UUID et BIGINT exacts via le validateur existant `variantIdString`, révision non négative bornée au BIGINT PostgreSQL.
- [Service de contenu](../../src/services/collection-content.ts) : `getCollectionContentV2`, décodeur strict de l’enveloppe et de ses 16 champs par item. Champs manquants/surnuméraires, mauvais types/discriminants, UUID invalides, révisions/IDs non canoniques et doublons d’items/variantes rejetés. SQL NULL devient `collection_unavailable`. Décodeur historique strict conservé ; il refuse le nouveau format.
- [Service d’items](../../src/services/collection-items.ts) : extensions des méthodes existantes `move`, `add`, `remove`, consultation `operationResult` et wrapper `getCollectionOperationResult`. Résultat/reçu à quatre clés strictes ; corrélation UUID d’opération, sujet, outcome et révision historique selon l’action. Ajout/retrait exigent changed et révision +1 ; reorder accepte changed/+1 ou noop/révision identique.
- [Types de mutations](../../src/types/collection-items.ts) : résultat, contexte d’opération discriminé, adaptation limitée aux arguments BIGINT générés comme number et à l’ancre nullable. Révisions et IDs de variantes restent des chaînes à l’appel PostgREST, sans passage par Number. Le reste du client dérive des types réellement générés Local.

Les erreurs v2 associent SQLSTATE et message métier documentés. Conflit de révision, collision d’opération, item/variante indisponible, retrait automatique interdit et besoin de contrat compatible donnent des messages compréhensibles. Un refus PostgreSQL définitif est distingué d’une réponse de transport/protocole absente ou d’un succès JSON malformé pouvant cacher un commit.

## Routage et cycle d’une action

| Action | Parent contrat 1 | Parent contrat 2 |
|---|---|---|
| Déplacement | `reorder_collection_item` | `reorder_collection_item_v2` |
| Ajout manuel | `add_manual_collection_item` | `add_manual_collection_item_v2` |
| Retrait manuel | `remove_manual_collection_item` | `remove_manual_collection_item_v2` |

Le contrat et la révision viennent du contenu autoritatif chargé, au repos, réussi et non invalidé. Aucun choix fondé sur une préférence locale, aucun fallback v1 sur un parent v2. Les créations n’appellent aucun writer v2 et restent contrat 1.

[`useCollectionStructureMutation`](../../src/features/collections/useCollectionStructureMutation.ts) possède les invariants communs et remplace la logique dispersée des hooks manuels/reorder. Un geste v2 nouveau reçoit un UUID neuf et la révision courante. Action clonée, UUID et paramètres exacts sont conservés **avant envoi** dans sessionStorage et une mémoire par QueryClient/viewer/collection. Stockage indisponible avant envoi → writer bloqué ; enregistrement malformé → remplacement de l’opération bloqué. Aucun token, exemplaire ou note conservé dans ce stockage.

Après réponse incertaine, le service consulte une fois le reçu. Reçu historique valide → résultat original, même si révision actuelle/sujet ont changé. Reçu absent, indisponible ou invalide → `operation_uncertain`, requête conservée. Répétition explicite de la même action → même UUID et tous les mêmes paramètres, jamais révision renouvelée. Action différente bloquée tant que l’incertitude demeure. Aucun retry automatique de writer.

La commande de relecture existante peut résoudre le reçu et relire les données sans writer. La validation du reçu est commune au service et à cette récupération. Une consultation NULL ne libère jamais la requête et ne prouve pas qu’une opération en cours ne pourra pas réussir. Conflit définitif → relecture, retour explicite, aucun nouvel envoi à une nouvelle révision. Un geste ultérieur explicite constitue une nouvelle action.

Succès writer seul ne confirme pas l’UI : les lectures autoritatives actives doivent réussir. Relecture échouée → erreur sans confirmation prématurée ; requête conservée. Répétition après succès connu vérifie les lectures sans second writer dans le même runtime. Navigation, changement de compte et déconnexion ne dispatchent pas sous un autre viewer ; reload du même onglet conserve l’opération exacte. La confirmation est supprimée si l’écran ou l’identité ont changé.

## React Query et interfaces

[`collectionContentKey`](../../src/features/collections/collection-query.ts) conserve le préfixe viewer/collection et ajoute `v2` pour isoler l’enveloppe du tableau historique. [`CollectionContentView`](../../src/features/collections/CollectionContentView.tsx) lit cette enveloppe et fournit `items` aux renderers existants. L’invalidation de possession retrouve les variantes dans `content.items` ; cache d’exemplaires indépendant conservé.

Succès ou erreur : annulation des anciennes lectures, invalidation ciblée, relecture contenu/ordre. Ajout/retrait incluent overview/Dashboard ; summaries inactifs restent invalidés pour leur prochain chargement. Clé de mutation commune, verrou synchrone et notifications React Query empêchent doubles gestes et libération DnD avant affichage de l’ordre relu.

Liste/Cartes gardent poignées, souris/tactile/clavier et feedback existants, sans CSS/design changé. Normalisation start/end/before/after, positions et fusion restent PostgreSQL. Recherche textuelle partielle bloque toujours reorder. Recherche/sélection de variante, ajout par défaut en fin, doublons interdits, confirmation de retrait et conservation des copies/notes restent acquis. Lecteurs partagés sans ajout/retrait/reorder. `isHidden=false` n’ajoute aucun filtre ni action. Progression, actualisation et notifications inchangées.

## Validations exécutées

| Preuve | Résultat |
|---|---|
| [pgTAP lecteur v2](../../supabase/tests/database/029_collection_content_v2.test.sql) | **45 assertions PASS** |
| Suite PostgreSQL complète `npm run db:test` | **29 fichiers / 2 897 assertions PASS** |
| `npm run db:lint` | Aucune erreur/alerte de schéma |
| Advisors sécurité Local, `--type security --level info --fail-on warn` | **0 WARN/ERROR**, quatre INFO attendues sur tables privées RLS sans policy |
| Services v2 et hook partagé ciblés | **42 tests PASS**, dont 17 du hook |
| Suite frontend complète finale `npm test -- --maxWorkers=2` | **64 fichiers / 1 945 tests PASS** |
| Typecheck / ESLint / build | PASS ; warning de taille du bundle existant, non bloquant |
| Génération types Local reproductible | SHA-256 identique, octet pour octet |
| Graphes package/lockfile | Identiques après exclusion des trois champs de version |
| Contrats/migrations historiques | Fonctions/ACL identiques ; aucun fichier de migration historique modifié |
| `git diff --check` et contrôle des nouveaux fichiers | PASS |

pgTAP : enveloppe/types/16 clés, parité des 15 historiques, ordre complet et 1 005 items, absence de mutation, révision après vrais writers, collections libres/automatiques/partagées, propriétaire/destinataire/tiers, MFA/profil, révocation, vide/invisible, BIGINT signés et révisions au-delà de MAX_SAFE_INTEGER. L’assertion d’inventaire de la suite 024 a été ajustée pour le lecteur désormais livré ; aucune attente de fusion modifiée.

[Script HTTP et snapshot](../../scripts/test-collection-content-v2-api.ts), exécuté deux fois avec nettoyage : vrai PostgREST, 1 005 items complets, partage/NULL et BIGINT exacts ; trois writers acceptent les chaînes décimales, noop et reçu historique après retrait/retry. **Deux connexions SQL réellement superposées** : lecture bloquée sur gate advisory, changements non engagés d’ordre/révision/possession dans l’autre session, attente prouvée par `pg_blocking_pids`. Après commit du writer et libération, la lecture retourne le snapshot ancien cohérent ; lecture suivante retourne les trois changements engagés ensemble.

Concurrence historique exécutée, sans modifier les scripts SQL/writers :

- `test-relative-order-writer-concurrency.ts` : PASS, quatre connexions, R1 frais, révisions, retries/collisions/noop et refus legacy après attente.
- `test-manual-collection-items-v2-concurrency.ts` : PASS, quatre connexions, ajout/reorder, ordre catalogue/parent, invariant différé au vrai COMMIT.
- `test-manual-collection-removal-v2-concurrency.ts` : PASS, quatre connexions, R3, remove/reorder/add, rollback/retry et intégrité initiale au COMMIT.
- `test-collection-operation-result-concurrency.ts` : PASS, quatre connexions, reçu après attente/commit, NULL après rollback et autorisation recontrôlée.
- `test-collection-reorder-concurrency.ts` et `test-manual-collection-items-concurrency.js` : PASS, contrats legacy et sérialisation.
- `test-automatic-collection-concurrency.ts` : **13 contrôles PASS**, créations legacy inchangées.

TypeScript/React : payloads invalides, routage v1/v2, transport exact, UUID stable malgré révision relue, reçu historique et reçu invalide, conflit sans retry, relecture après succès/erreur, navigation/logout/account/cache clear/reload, indisponibilité/corruption du stockage, composants d’ajout/retrait, reorder clavier réel des composants Liste/Cartes, partage et régressions v1. Tous les tests Collection modifiés passent.

Deux exécutions complètes à concurrence par défaut ont exposé chacune une assertion de focus intermittente dans `AccountDeletion.test.tsx`, fichier/code hors périmètre inchangés. Le fichier isolé passe **18/18** ; une suite complète intermédiaire passe **1 942/1 942** avant les trois dernières assertions de reçu. La suite finale à deux workers passe **1 945/1 945**. Ce constat ne masque aucun échec persistant dans l’intégration Collection.

## Navigateur Local

Session agent-browser isolée, Vite sur `127.0.0.1:5173`, vraie validation Auth Local, sessions AAL2 et facteurs vérifiés de deux comptes synthétiques. Parent libre contrat 2 et trois variantes synthétiques BIGINT ; comptes, catalogue, copies et partage distincts des données utilisateur.

Vérifié : déplacement clavier Liste puis Cartes avec ordre backend relu et confirmation ; recherche/sélection/placement par défaut en fin ; ajout avec simulation d’une réponse **perdue après vrai HTTP 200**. Capture navigateur : un seul `add_manual_collection_item_v2`, UUID conservé, révision `9007199254740998` et variante `9007199254741993` en strings, une consultation de reçu, ajout confirmé sans doublon. Retrait via confirmation existante et message de conservation ; mobile `390×844`, copies et note conservées ; recherche Alpha ne présente plus de poignée DnD. Destinataire : lecture seule, possession propriétaire 1/2, note consultable, absence de mutations de collection/exemplaires. Footer `0.8.6` visible.

Captures et logs locaux non versionnés sous `.cache/phase8b7/`. Browser fermé, serveur Vite lancé pour ces essais arrêté, fixtures et fichiers de session Auth temporaires supprimés. Gestes souris/tactile physiques, panne réseau réelle et fermeture définitive d’onglet non exercés ; aucune preuve Cloud/production. Le DnD de développement a émis un warning transitoire de poignées lors de remounts ; les déplacements observés restent engagés et relus correctement.

## Conservation des données

Comparaison avant/après : toutes les lignes public/private et Auth users/sessions, nombres et MD5 de JSONB triés, ACL tables/colonnes, RLS/policies, vues et corps/ACL des fonctions préexistantes. **Égalité complète** après nettoyage de toutes les fixtures. Nouvelle fonction seule ajoutée.

| Données réelles | Nombre final | MD5 initial = final |
|---|---:|---|
| Collections | 4 | `c56e6bb565e69a361b2efb0c68fadd3e` |
| Items | 660 | `73d33bb3ba435b6daba15008376109c1` |
| Variantes | 31 904 | `340e5ae3aad2633ab1a513538c293b38` |
| Exemplaires | 3 | `1639a715f67e664bff99396b0ce39771` |

Contrôle SQL final : quatre parents contrat 1/révision 0, zéro introduction non NULL, zéro intention et zéro reçu après nettoyage. Aucune conversion, suppression ou mutation des quatre collections utilisateur. Auth réelle, partages, notes, exemplaires, catalogue, positions et versions appliquées préservés.

## Fichiers et suite 8B.8

Nouveaux : migration, pgTAP 029, script HTTP/snapshot, schémas communs, hook partagé et ses tests, tests services v2, helper de fixtures frontend et ce rapport. Modifiés : services/types générés et applicatifs, hooks/caches/consommateur de contenu et de possession, tests des consommateurs existants, assertion d’inventaire 024 et `tsconfig.node.json`. Versions package/lockfile synchronisées sans dépendance mise à jour. Références courantes : README, Fonctionnalités, Modèle, Architecture, Database, Roadmap ; rapports historiques conservés. Roadmap maintenue au niveau macro.

Avant 8B.8 : valider cette intégration et ses limites ; vérifier à nouveau HEAD/worktree/Local ; activer seulement les **nouvelles créations** par contrat serveur, avec journal complet dès tout ajout initial. Prouver création libre/automatique, lecture/mutations v2, retries/reçus, concurrence et droits partagés sur fixtures isolées ; conserver gardes legacy et parents existants contrat 1. Tout déploiement Cloud exige son périmètre distinct, alignement schéma/client et validation explicite. Retour arrière après gestes v2 : conserver données/journal/reçus et rendre ces parents consultatifs si le client compatible est retiré.

Limite de persistance : sessionStorage conserve reload/navigation/logout dans le même onglet ; fermeture définitive de celui-ci ne restaure pas automatiquement sa requête incertaine. Enregistrement corrompu bloque les nouvelles mutations de ce viewer/parent ; aucun effacement arbitraire ni expiration ne remplace l’UUID. Ces limites doivent rester visibles lors de la validation 8B.8.

**Arrêt à 8B.7. Aucun contrat 2 activé pour les créations, aucune migration Cloud, reset, conversion, commit ou push. Aucun masquage, actualisation, notification ou design nouveau.**
