# Phase 8B.1 — Fondations PostgreSQL du réordonnancement relatif

Date : **8 octobre 2026**. Version applicative : **0.8.0**.

## Résultat et périmètre

**Stockage préparatoire livré et validé sur Supabase Local uniquement.** Aucune nouvelle fonctionnalité utilisateur activée. Collections existantes et nouvelles toujours en **contrat 1** ; créations, ajout/retrait/reorder et lecteurs v1 inchangés. Pas de calcul de fusion/rejeu, RPC v2, masquage, actualisation, notification, composant React ou service applicatif nouveau.

Références de conception validées par le propriétaire : [8A.2](2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md) et [8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md). Ces rapports historiques restent inchangés. Consignes `AGENTS.md`, migrations de schéma/sécurité, création canonique, writers 6A.3/6C.1 et lecteurs finaux 7F.1 inspectés avant modification.

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `1c5f4d55da81ece65a020a3fc729a5b83e4ed216` | Identique ; aucun commit |
| Git | Arbre propre, aucun fichier staged/préexistant modifié | 10 fichiers suivis modifiés, 3 nouveaux fichiers non suivis ; aucun fichier staged |
| Versions package / lockfile / racine du lock | `0.7.21` / `0.7.21` / `0.7.21` | `0.8.0` / `0.8.0` / `0.8.0` |
| Outillage réel | Node `24.20.0`, npm `12.1.0`, CLI Supabase `2.120.0` | Identique ; dépendances, engines et packageManager inchangés |
| Supabase Local | Stack arrêtée ; volume `supabase_db_my-local` présent | Redémarrage depuis volume conservé, base `127.0.0.1:55322/postgres` |
| Migrations Local | 29 fichiers / 29 appliquées, jusqu’à `20261007085921` | 30 fichiers / 30 appliquées, jusqu’à `20261008153458` |
| Cloud | Dernier checkpoint propriétaire : 29 jusqu’à `20261007085921` | Aucun accès ni application Cloud pendant 8B.1 ; statut distant non revérifié |

`migration list --local` compare le dépôt à la base Local : sa colonne `Remote` ne constitue pas une preuve Cloud. Aucun reset, arrêt avec suppression de volume, suppression/recréation de collection existante, commit, tag, push ou déploiement.

## Migration et intégrité

Créée avec la CLI installée :

```sh
node node_modules/supabase/dist/supabase.js migration new phase8b1_relative_order_foundations
```

Fichier : [20261008153458_phase8b1_relative_order_foundations.sql](../../supabase/migrations/20261008153458_phase8b1_relative_order_foundations.sql). Une seule transaction `BEGIN` / `COMMIT`, aucune modification des 29 migrations historiques ni de fonction métier existante.

| Structure | Ajouts |
|---|---|
| `public.collections` | `personal_revision BIGINT NOT NULL DEFAULT 0`, CHECK ≥ 0 ; `order_contract_version SMALLINT NOT NULL DEFAULT 1`, CHECK IN (1,2) |
| `public.collection_items` | `introduced_revision BIGINT NULL`, CHECK > 0 si renseignée ; UNIQUE `(collection_id,id)` pour la FK composite du sujet |
| `private.collection_order_intents` | UUID collection/opération/sujet, séquence BIGINT positive, `kind manual_add/move`, `destination before/end`, ancre UUID nullable, suffixe UUID[] obligatoire, date TIMESTAMPTZ obligatoire/default `now()` ; PK `(collection_id,sequence)`, UNIQUE `(collection_id,operation_id)` |
| Relations du journal | FK collection cascade ; FK composite `(collection_id,subject_item_id)` vers `collection_items(collection_id,id)` cascade ; index `(collection_id,subject_item_id)` |
| `private.collection_operation_receipts` | PK `(collection_id,operation_id)`, FK collection cascade ; `kind move/add/remove/hide/apply`, empreinte SHA-256 texte hexadécimal minuscule de 64 caractères, révision BIGINT ≥ 0, résultat JSONB objet obligatoire, date TIMESTAMPTZ obligatoire/default `now()` |

Avant exige une ancre distincte du sujet ; fin exige ancre NULL et suffixe vide. Suffixe unidimensionnel d’indices depuis 1, sans NULL, doublon, sujet ni ancre. Une fonction SQL privée pure valide ces propriétés : une sous-requête `unnest` ne peut pas être placée directement dans un CHECK PostgreSQL. Aucun accès aux tables vivantes dans ce validateur.

Ancre et suffixe sont des **références historiques sans FK** vers les éléments. Leur absence actuelle est légitime. Un trigger privé d’intégrité interdit toute modification effective d’une intention acceptée, y compris l’ordre du suffixe, l’ancre et la chronologie. Il ne traite aucun geste métier. Supprimer une ancre/un successeur conserve les références des autres sujets vivants ; supprimer le sujet cascade toutes ses propres intentions. Les reçus restent indépendants des sujets et conservés jusqu’à suppression du parent. Même UUID d’opération autorisé dans deux collections distinctes.

Pas de `is_hidden`, allocation automatique de séquence, contrainte initiale manuelle différée, liaison obligatoire intention/reçu ou validation transactionnelle des références à l’acceptation. Ces garanties métier devront accompagner les writers v2 ; les imposer maintenant invaliderait les historiques et writers v1. Les révisions positives et le mode 2 sont représentables au niveau du schéma, mais aucun chemin utilisateur ou création ne les active.

Premier essai de migration annulé pour collision entre un nom automatique de CHECK et le nom explicite de destination. Nom explicite corrigé en `collection_order_intents_placement_check` avant application réussie. Rollback vérifié : zéro nouvelle colonne/table/entrée d’historique et empreintes historiques identiques. Aucun objet partiellement appliqué conservé.

## Sécurité et compatibilité

- `private` absent des schémas exposés par l’API ; génération TypeScript limitée à `public` selon la procédure existante.
- Deux nouvelles tables avec RLS activée, aucune policy et tous privilèges révoqués à PUBLIC, anon, authenticated et service_role. Aucune modification des grants existants, notamment des droits limités de création/renommage de collection.
- Helpers internes `SECURITY INVOKER`, `search_path=''`, EXECUTE révoqué aux mêmes rôles. Aucun nouveau `SECURITY DEFINER` ni RPC.
- Refus SQL réel de lecture privée pour anonyme, propriétaire, destinataire partagé, tiers et service_role malgré BYPASSRLS. Matrice des sept privilèges de table vérifiée sur les trois rôles API. Avec grant SELECT temporaire dans la transaction de test, RLS retourne zéro ligne au propriétaire ; grant annulé ensuite.
- Aucun INSERT/UPDATE utilisateur sur nouvelles révisions, mode ou introduction. Écritures directes d’items toujours fermées. Contrôles MFA/profil/propriété et lecteurs invoker existants conservés.
- Ajout legacy garde `introduced_revision=NULL`, aucun nouveau journal ou reçu ; reorder ne touche pas `personal_revision`. Créations automatique et libre testées en contrat 1/révision zéro. Retrait garde positions des autres éléments et exemplaires physiques.

## Preuve de conservation des données

Avant application, snapshot en lecture seule de **toutes les tables applicatives `public` et des tables privées préexistantes** : nombres de lignes et MD5 des lignes JSONB triées. Comparaison après migration et après tests, en retirant uniquement les trois colonnes ajoutées de la projection comparative. ACL des tables/colonnes préexistantes, policies RLS, définitions/ACL des fonctions et définitions/ACL/options des vues comparées également.

| Donnée réelle Local | Nombre inchangé | Empreinte inchangée |
|---|---|---|
| Collections | 4 | `b5ee073edc6dbd3678534215df1c677e` |
| Éléments | 660 | `2c066c71df9dd2d01d6de0de13107893` |
| Variantes catalogue | 31 904 | `340e5ae3aad2633ab1a513538c293b38` |
| Exemplaires | 3 | `1639a715f67e664bff99396b0ce39771` |

Identités, positions, origines, rangs, versions appliquées, notes, dates et partages existants préservés ; tables privées neuves vides. Les 4 parents réels restent contrat 1/révision zéro ; les 660 introductions sont NULL. Fixtures synthétiques des suites DB limitées à des transactions **ROLLBACK**, distinctes des collections utilisateur existantes.

## Tests et contrôles exécutés

| Contrôle | Résultat final |
|---|---|
| [023_relative_order_foundations.test.sql](../../supabase/tests/database/023_relative_order_foundations.test.sql) | **PASS — 221 assertions** |
| [001_schema.test.sql](../../supabase/tests/database/001_schema.test.sql), ciblé | **PASS — 110 assertions** ; inventaire privé étendu aux cinq tables, collation explicite pour comparaison |
| `npm run db:test` | **PASS — 23 fichiers / 1 659 assertions**, dont writers et lecteurs v1 existants |
| Parité canonique intégrée à la suite DB | **1 213 cibles, zéro divergence** |
| `npm run db:lint` | **PASS**, `public,private`, aucun avertissement ni erreur |
| `supabase db advisors --local --type security --level info --fail-on warn` | **PASS**, zéro WARN/ERROR ; quatre INFO `rls_enabled_no_policy` attendues sur `catalog_overrides`, `catalog_sync_runs`, journal et reçus privés fermés |
| `npm run db:types` | **PASS**, génération depuis schéma Local appliqué, aucune édition manuelle |
| Cohérence/reproductibilité des types | AST : seuls trois nouveaux champs et marqueurs générés `ComputedFields: never` ; nouvelle génération CLI normalisée identique octet par octet ; pas de schéma privé ni RPC v2 générés |
| Vitest services Collections/items/manuels/contenu | **PASS — 4 fichiers / 304 tests** |
| `npm run build` | **PASS**, inclut typecheck ; warning connu bundle >500 kB, aucune optimisation hors périmètre |
| `npm run lint` | **PASS** |
| Package/lock | **PASS** : seuls version package, version globale et version racine du lock changent ; graphe des dépendances inchangé |
| Conservation après migration/tests | **PASS** : données historiques, droits, policies, fonctions et vues identiques |
| Historique migrations | **PASS — 30/30 Local**, aucun fichier en attente |
| `git diff --check`, périmètre, nouveaux fichiers et liens documentaires | **PASS** — 13 fichiers autorisés, 336 destinations locales et 72 ancres valides ; whitespace des trois fichiers nouveaux vérifié séparément |

Suite 023 : types/defaults/nullabilité, révisions positives/non négatives et limites BIGINT, unicités par parent, FK composite interdisant sujet hors collection, relations cascade, destinations, formes et contenu du suffixe, immutabilité, objets JSON/empreintes, permissions et défense RLS. Retrait d’ancre et de plusieurs replis conserve le contexte exact ; retrait/réintroduction renouvelle UUID sans héritage ; retrait du sujet nettoie ses intentions répétées sans supprimer les reçus. Lecture d’ordre/contenu et créations v1 vérifiées après expansion.

Erreurs de fixtures/signatures pgTAP corrigées avant résultats finaux : surcharge sans description interprétait le schéma comme table ; variante sans `size='standard'` donnait une cible canonique vide ; comparaison d’inventaire exigeait collation explicite. Aucun changement métier destiné à contourner ces erreurs.

Non exécutés : suite Vitest complète/UI/navigateur (aucun écran ou comportement frontend changé ; services ciblés, typecheck/build/lint exécutés), test multi-connexion (aucun verrou/writer modifié ni writer v2 livré), intégration de synchronisation catalogue (pipeline inchangé), reconstruction shadow `db diff` (migration additive/historique, intégrité et schéma appliqué vérifiés directement). Aucun test d’algorithme/idempotence métier v2 : mécanismes absents par périmètre. Aucun test Cloud ni reset, conformément aux limites.

## Fichiers et documentation

Trois nouveaux fichiers : migration 8B.1, suite pgTAP 023 et ce rapport. Dix fichiers suivis modifiés : `package.json`, `package-lock.json`, types générés, assertion d’inventaire SQL 001 et six références courantes :

- [README](../../README.md) : version, état Local/Cloud et commandes/tests courants.
- [Fonctionnalités](../01-FEATURES.md) : conception validée, stockage seul livré, actualisation toujours future.
- [Modèle](../03-DATA-MODEL.md) : persistance préparée, aucune alimentation ni fusion activées.
- [Architecture](../05-ARCHITECTURE.md) : propriétaires des responsabilités et coexistence avec v1.
- [Database](../06-DATABASE.md#phase-8b1--fondations-postgresql-locales) : colonnes, relations, contraintes, sécurité et frontière stockage/contrats futurs.
- [Roadmap](../08-ROADMAP.md) : Phase 8 en développement, aucune nouvelle fonctionnalité utilisateur ; reste macro.

Rapports 8A.2/8A.3, composants React, filtres, vues, services, configuration Supabase et outillage préservés. Scripts de vérification temporaires et empreintes dans `.cache/phase8b1/`, ignoré par Git ; aucun secret ni donnée de ligne dans le rapport.

## Suite du bloc 8B — à valider avant 8B.2

Restent à développer selon 8A.3 : calcul relatif PostgreSQL commun et preuves algorithmiques 8A.2 ; writers v2 avec normalisation de geste et capture historique sous verrou parent ; allocation/révision et invariant manuel initial ; reçus idempotents et conflits d’UUID ; gardes des writers legacy avant toute activation ; lecteurs/services v2 distincts et transport BIGINT strict. L’ordre exact et le périmètre de 8B.2 doivent suivre sa demande validée ; aucune activation de création v2 n’est implicite dans ce rapport.

`is_hidden` appartient à 8C ; actualisation et notifications restent leurs blocs futurs. Retour arrière 8B.1 : conserver stockage préparatoire et defaults legacy ; aucune suppression de colonnes, tables ou collections. **Arrêt à 8B.1. Validation propriétaire attendue avant toute autre intervention.**
