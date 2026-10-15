# PROD.2 — Gel sécurisé des écritures métier Supabase

Date : **13 octobre 2026**. Version livrée : **`0.8.25`**.

## Résultat et frontière de preuve

**Gel des écritures ordinaires implémenté et démontré sur Supabase Local.** Deux migrations additives, état privé persistant désactivé à l'installation, contrôle fondé sur l'identité PostgreSQL de connexion, gardes de tables/RPC et barrière transactionnelle. Publication/retrait par le publisher réel, lectures, récupération des reçus et reprise après réouverture sont préservés.

**Aucune installation ou validation Cloud.** Aucun changement de configuration Production, déploiement, commit ou push. PROD.1 et code frontend/Edge existants ne sont pas modifiés. Le workflow Production complet reste non opérationnel tant que ses autres blocs et ses validations hébergées ne sont pas acquis.

## État initial et documents examinés

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `ceb3cf97ce5ba110867f2d28696eff4eff6e0f1a` | Identique |
| Git | `git status --short` vide | 9 fichiers suivis modifiés, 5 nouveaux fichiers ; aucun fichier étranger |
| Version package/lock/racine du lock | `0.8.24` | `0.8.25` |
| Migrations réellement appliquées Local | 48, dernière `20261011191625` | 50, dernière `20261013135415` |
| Runtime DB/CLI | PostgreSQL 17.6 / Supabase CLI 2.120.0 | Identiques |
| État de gel | Absent | Installé, `frozen=false` après nettoyage |

Lectures : `AGENTS.md`, architecture, base de données, publication Production, publication des notifications, migrations des Phases 1–8, ACL/RLS/triggers/fonctions du catalogue PostgreSQL Local, services frontend, pipeline catalogue, handler/index/tests de `delete-account` et fixtures existantes. Inventaire réel initial : **14 tables public, 8 privées, six séquences catalogue, une vue dashboard et 59 fonctions public/private**. Le nouveau singleton porte les tables public/private à 23 et les fonctions à 63.

Une recherche des corps de fonctions mutateurs identifie exactement **11 writers publics**, les deux triggers métier Auth et les deux fonctions publisher privées. Les helpers de contraintes et de timestamps affectent la ligne/transaction de leurs writers ; aucun autre lecteur actuel ne réalise un INSERT/UPDATE/DELETE métier. Les contrôles historiques ne remplacent pas cette lecture du catalogue actuel.

## Matrice exhaustive des tables et écritures

Dans les lignes ci-dessous, **T** désigne le trigger commun `BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE FOR EACH STATEMENT`. **G** désigne la garde RPC d'entrée avant catalogue/parent et avant noop/rejeu. Tous les triggers métier, contraintes, droits de colonnes et politiques existants continuent à s'appliquer.

Identités réelles : PostgREST se connecte comme `authenticator`, puis `SET ROLE anon/authenticated/service_role`. Une RPC `SECURITY DEFINER` exécute avec `current_user=postgres`, mais conserve `session_user=authenticator`. Auth se connecte comme `supabase_auth_admin` ; ses triggers MY. prennent les droits du definer, sans changer cette identité de connexion. Le pipeline actuel se connecte directement en opérateur PostgreSQL. Le publisher dispose de son LOGIN propre, sans appartenance supérieure.

| Relation | Chemins réels | Identité et contrôle pendant gel |
|---|---|---|
| `public.pokemon` | Import/corrections catalogue, INSERT/UPDATE/DELETE ; séquence associée | T ; opérateur SQL autorisé ; service_role refusé ; utilisateurs lecture seule |
| `public.tcg_series` | Idem séries | T, même frontière |
| `public.tcg_sets` | Idem sets | T, même frontière |
| `public.source_cards` | Idem cartes | T, même frontière |
| `public.catalog_variants` | Idem variantes, activation/ordre/metadata | T, même frontière |
| `public.card_pokemon` | Rattachements indirects du pipeline | T, même frontière |
| `public.automatic_target_states` | Versions/hash recalculés par pipeline | T, même frontière ; verrou catalogue `771402` conservé |
| `private.catalog_entity_keys` | Résolution/stockage de clés du pipeline | T, aucun droit API ; opérateur SQL seulement |
| `private.catalog_overrides` | Corrections administratives | T, même frontière |
| `private.catalog_sync_runs` | Historique technique des imports | T, même frontière |
| `public.profiles` | Trigger de création Auth, nettoyage avant destruction Auth, administration | T + garde Auth ; session Auth refusée, definer postgres ne contourne pas le gel |
| `public.collections` | Création libre directe, rename/delete, création automatique RPC, révision/version, destruction du compte | T + G writers ; authenticated/service_role/Auth refusés ; opérateur direct autorisé |
| `public.collection_items` | RPC add/remove/reorder/hide/apply, cascades parent/compte | T + G ; aucun DML utilisateur direct accordé ; mutations privilégiées utilisateur refusées |
| `public.physical_copies` | DML direct création/édition nom/note/état/suppression ; suppression compte | T ; authenticator sous utilisateur ou service_role refusé |
| `public.collection_shares` | DELETE owner/destinataire ; administration ; nettoyage des deux sens de partage | T ; DELETE utilisateur et destructions indirectes refusés ; Phase 9 création/édition utilisateur non livrées |
| `public.user_preferences` | INSERT/UPDATE ciblés du service de préférences ; cascade profil | T ; accès ordinary/service_role refusés ; grants de colonnes conservés |
| `public.collection_view_preferences` | INSERT/UPDATE/DELETE override viewer ; cascades collection/profil | T ; refus ; contrôle d'accès à la collection conservé |
| `private.collection_order_intents` | Writers structurels/apply, cascades collection/compte, validations différées | T + G amont ; session utilisateur refusée malgré definer ; journal inchangé |
| `private.collection_operation_receipts` | Writers idempotents, y compris noop ; cascade parent | T + G amont ; refus de nouveaux reçus et replays writers ; lecteur historique autorisé |
| `private.collection_notification_reads` | `mark_notification_read` pour collection ; cascade parent | T + G ; état utilisateur refusé |
| `private.notification_announcement_states` | Lecture explicite/traitement via deux RPC, cascades profil/annonce | T + G ; état utilisateur refusé, aucune exception publisher |
| `private.notification_announcements` | Publication/retrait via deux fonctions privées, administration | T ; exception **INSERT/UPDATE seulement**, `session_user=my_notification_publisher` ; aucune ACL nouvelle ; autres sessions service/utilisateur refusées |
| `private.business_write_freeze` | Singleton d'administration ajouté ici | Pas de T : ACL/RLS sans policy ; seules identités opérateur directes ; fonctions INVOKER + vérification session_user |

Les six séquences ne sont pas un chemin d'édition métier exposé au frontend : seuls opérateurs et service_role ont l'USAGE catalogue nécessaire. Les DML de tables sont gardés avant l'évaluation des valeurs par ligne. Une invocation SQL privilégiée directe de `nextval` reste une opération technique à coordonner ; le gel n'est pas un arrêt global de PostgreSQL ni de toutes ses fonctions système.

### RPC publiques mutatrices : 11 fonctions

| RPC | Écritures/effets | Contrôle |
|---|---|---|
| `create_automatic_collection` | Parent/items, retrieval idempotent existant | G puis T ; même l'appel qui retrouverait un parent existant est refusé |
| `add_manual_collection_item` | Ajout/rebalance contrat legacy | G + T ; garde contrat 2 conservée |
| `remove_manual_collection_item` | Retrait legacy | G + T |
| `reorder_collection_item` | Positions/rebalance legacy | G + T |
| `add_manual_collection_item_v2` | Item/intention/révision/reçu | G + T |
| `remove_manual_collection_item_v2` | Retrait/révision/reçu | G + T |
| `reorder_collection_item_v2` | Ordre/intention/révision/reçu, noop | G + T |
| `set_collection_item_hidden` | Masque/révision/reçu, noop | G + T |
| `apply_collection_update` | Plan/token, items/journal/révision/version/reçu | G + T |
| `mark_notification_read` | État sparse collection/annonce | G + T ; aucun succès obsolete/recorded pendant gel pour un appel autorisé |
| `process_announcement_notification` | read/processed atomique | G + T |

Les **15 RPC lecteurs** sont conservées : `get_catalog_card`, `get_catalog_pokemon`, `get_catalog_set`, `get_collection_content`, `get_collection_content_v2`, `get_collection_item_order`, `get_collection_operation_result`, `get_collection_update_status`, `preview_collection_update`, `get_notification_center`, `get_notification_content`, `get_notification_unread_count`, `get_variant_detail`, `search_catalog_variants_for_add`, `search_global_navigation`. DML SELECT direct, vue dashboard `security_invoker` et prédicats RLS restent sous leurs permissions existantes.

`get_collection_operation_result` et les lecteurs de contexte d'actualisation sont VOLATILE et prennent des verrous de parent/cataloque : **aucune mutation logique**, mais un verrou peut retarder un writer. Une preview n'enregistre aucun consentement/reçu et n'applique rien. Lire un contenu de notification ne le marque pas automatiquement lu. Les écritures physiques internes dues aux locks/MVCC ne sont pas des écritures métier MY.

### Auth, Edge et autres accès

| Chemin | Point réel de contrôle | Résultat pendant gel |
|---|---|---|
| Signup / création Auth Admin | Statement BEFORE INSERT `auth.users`, puis trigger profil dans même transaction | Refus atomique ; aucun compte/profil partiel ; Auth Local retourne 500 générique `Database error` |
| Destruction physique Auth Admin | Statement BEFORE DELETE `auth.users`, avant nettoyage MY. | Refus même sans profil ; rollback transactionnel Auth et métier |
| Edge `delete-account` | Mot de passe/TOTP frais et révocation existants, puis Auth Admin DELETE gardé | 503 `deletion_failed`, pas `{deleted:true}` ; compte et données conservés, révocation globale déjà faite conservée |
| Login / MFA / refresh / signout | Auth natif, aucune mutation MY. actuelle | Autorisés selon contrôles Auth existants ; sécurité des sessions préservée |
| Email/password/user_metadata/confirmation | UPDATE Auth sans trigger d'édition MY. | Restent possibles selon protections natives ; aucune exception SQL acquise par métadonnée |
| Soft deletion administrative Auth | UPDATE interne Auth, pas le parcours MY. (`false` imposé par Edge) | Hors gel métier ; aucun nettoyage MY. ; à exclure/coordonner avant publication/backup |
| REST service_role | BYPASSRLS mais T, connexion authenticator | Refus d'écriture MY., aucun droit de bascule ; service_role ne devient pas opérateur |
| SQL operator direct | session_user postgres/supabase_admin, droits préexistants | Migration/import/administration explicitement autorisés ; à coordonner avant backup |
| Publisher direct | LOGIN réel, fonctions privées publication/retrait, T borné à annonces | Autorisé, idempotence et permissions minimales conservées |
| SQL ordinaire / contexte falsifié | Grants + session_user + T/G ; role/JWT/GUC non autoritatifs | Impossible de changer l'état, usurper postgres, désactiver trigger ou `session_replication_role` |
| Storage / Realtime | Aucun writer métier actuel identifié via ces services | Pas de couverture autonome de données internes ; futur chemin métier à inventorier avant livraison |

Les cascades FK sur toutes les tables métier rencontrent T ; les triggers de timestamps/ID/contraintes/deferred validations restent attachés à leurs writers. Les deux triggers métier Auth historiques et leurs permissions sont conservés. RLS seule n'est utilisée comme garantie ni pour service_role ni pour definer. La limite soft deletion/UPDATE Auth est explicite et ne constitue aucun bypass du parcours ordinaire MY. recensé. Un arrêt global d'Auth exigerait un chantier fournisseur/opérationnel distinct ; il n'est pas implémenté arbitrairement ici.

## Architecture, migrations et permissions

- [20261013133423](../../supabase/migrations/20261013133423_prod2_business_write_freeze.sql) : singleton, quatre fonctions privées, 22 guards de tables, une garde Auth et définitions des 11 writers existants avec seulement garde d'entrée/propagation `PT503`.
- [20261013135415](../../supabase/migrations/20261013135415_prod2_freeze_admission_barrier.sql) : admission partagée/exclusive `771403`, en conservant la lecture de ligne `FOR SHARE`.

Le verrou de ligne seul permettait une nouvelle admission compatible pendant l'attente d'un UPDATE. La preuve de concurrence a motivé la seconde migration : la barrière advisory empêche ce passage et draine les writers admis avant fermeture. Aucun fichier des 48 migrations historiques n'a été réécrit. Chaque nouvelle migration possède BEGIN/COMMIT ; un préfixe de deux fichiers n'est pas atomique globalement.

Nouvelles fonctions : `private.set_business_write_freeze(boolean)` et `private.get_business_write_freeze()` INVOKER, EXECUTE réservé postgres/supabase_admin, contrôle session_user explicite ; `private.require_business_writes_open()` et `private.guard_business_write_freeze()` DEFINER owner postgres, `search_path=''`, aucun EXECUTE des rôles API/Auth/publisher. Aucun rôle/member créé. Nouvelle table privée RLS sans policy et droits expressément révoqués. Aucune extension de droits sur les tables métier ou pour le publisher.

Les CREATE OR REPLACE des RPC préservent owner, signature, défauts d'arguments, attributs et ACL. La comparaison des corps initiaux et finaux en retirant seulement les deux ajouts PROD.2 vérifie la conservation des règles métier. Types Supabase régénérés depuis Local : **aucun diff public généré**, aucun edit manuel. Version synchronisée par `npm version 0.8.25 --no-git-tag-version`.

Gel fermé : SQL `PT503/business_writes_frozen`, REST HTTP 503 sans succès trompeur. Singleton absent : `PT503/business_write_freeze_unavailable`. Les handlers d'erreurs Phase 8 propagent PT503 au lieu de masquer le refus en erreur générique. Les autres conflits, checks AAL2/propriété, erreurs de validation et réponses 409 restent inchangés après ouverture.

## Transactions et reprise

Écriture ordinaire : partagé transactionnel `771403`, singleton `FOR SHARE`, puis verrous métier. Bascule : exclusif transactionnel `771403`, UPDATE du singleton. Les transactions déjà admises doivent committer/rollback avant obtention de l'exclusif et commit du gel. Une transaction commencée avant, mais encore non admise, attend puis lit l'état fermé. Les snapshots RR/SERIALIZABLE anciens échouent `40001` à la lecture verrouillée ; aucune confiance dans un ancien false.

**Borne effective : commit réussi de la transaction de bascule**, puis relecture indépendante. Le retour d'une fonction dans une transaction ouverte n'est pas cette borne. Timeouts/deadlocks/erreurs annulent la transaction ; réponse incertaine impose inspection/relecture, pas annonce de succès. Les assertions de concurrence observent `pg_blocking_pids`, pas un sommeil supposé suffisant. Le timeout de 100 ms utilisé dans un scénario injecte un échec ; ce n'est aucun délai opérateur de sécurité.

Réception réseau tardive d'une écriture déjà committée ne signifie pas une nouvelle écriture après le gel. Les exceptions SQL/publisher et Auth interne ne sont pas drainées : coordonner opérateurs/jobs et garantir le snapshot cohérent du futur backup. Lecteurs à verrous et anciennes transactions SQL combinant plusieurs actions peuvent retarder la bascule ; diagnostiquer les locks et traiter un éventuel deadlock par rollback/reprise. Aucun kill ou délai arbitraire automatique.

UUID, requête/token exacts et reçus restent inchangés. Les replays writers sont refusés pendant fermeture ; `get_collection_operation_result` reste disponible. Après réouverture, le même UUID/token retourne le reçu exact, même après une réponse perdue ; aucune deuxième allocation/révision. Un reçu absent n'autorise aucun nouvel UUID, et le gel ne remplace pas un consentement à une preview fraîche.

## Tests et données

| Validation finale | Résultat |
|---|---|
| `npm run db:test` | **39 fichiers, 3 873 assertions passées**, dont 83 PROD.2 ; parité canonique 1 213 cibles, 0 divergence |
| `node scripts/test-business-write-freeze.js` | **13 scénarios passés ; 98 refus SQL, 78 refus REST**, plus refus Auth natifs et Edge réel |
| Suite Vitest standard `--maxWorkers=2` | **79 fichiers / 2 482 tests passés**, 6 fichiers / 10 tests Local explicitement ignorés sans opt-in |
| Suites Local réelles Phase 8 avec opt-in | **6 fichiers / 10 tests passés** ; services hide/status/preview/apply/notifications/actions et publisher réel, `--maxWorkers=1` |
| Intégrations DB Phase 8 complémentaires | **3 scripts réussis** : apply concurrency, notification API concurrency, apply HTTP API ; **18 groupes PASS** |
| `npm run db:lint` | 0 warning/erreur public/private |
| Advisors security Local | **8 INFO** RLS sans policy sur tables privées intentionnellement fermées, **0 WARN / 0 ERROR** ; nouveau singleton inclus |
| Build et lint applicatifs | Réussis ; avertissement de chunk Vite >500 kB préexistant, aucune configuration changée |
| Régénération types / diff / JSON package | Types publics inchangés ; diff check et trois versions cohérentes |

La nouvelle intégration utilise de **vraies connexions authenticator** et un definer synthétique borné à du DML zéro ligne. Les 66 tests INSERT/UPDATE/DELETE couvrent toutes les tables MY. ; les 24 tentatives SQL couvrent les trois rôles API, changement de session/role/état, contrôle de fonction, trigger et réplication. Le definer ne reçoit aucun SQL libre, ne peut toucher ni singleton ni Auth, et est supprimé après test. Les appels service_role REST testent 42 DML sur les 14 tables public. Anciens JWT, JWT signés avec rôle falsifié, mauvaise signature, métadonnées, headers et upsert sont réellement envoyés à PostgREST.

Les quinze lecteurs RPC sont comparés avant/après fermeture à résultat identique. Un compte natif synthétique est créé, password et MFA vérifiés avant gel ; son JWT existant reçoit 503 en écriture. Signup et création admin sont refusés avec 500 DB ; login, password modifié avec current_password correct, demande de changement email, user_metadata, MFA et refresh continuent. La demande email n'est pas une preuve de double confirmation finalisée. Hard delete Auth est refusé. Edge complète password/TOTP frais et révocation puis retourne 503 sans destruction ; après réouverture, le même compte se reconnecte/MFA et sa destruction Edge retourne 200 `{deleted:true}`.

Le publisher reçoit un secret SCRAM éphémère uniquement après vérification de l'absence de credential initial. Aucun secret en fichier/log/argument CLI ; seulement son vérificateur en SQL. Publication, rejeu exact et retrait réussissent pendant gel, DML direct et bascule restent interdits. Le secret est remis à NULL, les publications synthétiques et comptes sont supprimés. Ne pas lancer ce provisionnement sur un publisher Local déjà configuré.

Fixtures réutilisées : plage réservée Phase 8 `a250…/c250…/d250…/e250…`, catalogue négatif `-950xx` et BIGINT exact `9007199254740997`, mutex synthétique `830011`, helpers install/cleanup existants. Aucun reset, suppression/recréation du volume ou reconstruction d'une ancienne ligne personnelle. La nouvelle intégration compare toutes les empreintes métier, six compteurs de séquences et ACL avant/après à égalité exacte. Une comparaison supplémentaire couvre les 22 tables et comptes initiaux sur toute l'intervention : données identiques, mais les anciennes suites pgTAP consomment des valeurs de séquences malgré leurs rollbacks. Aucune remise en arrière n'est effectuée.

| Séquence catalogue | Compteur initial | Final | Avance des deux passages de la suite pgTAP |
|---|---:|---:|---:|
| `automatic_target_states_id_seq` | `1645` | `1659` | `14` |
| `catalog_variants_id_seq` | `31994` | `31996` | `2` |
| `pokemon_id_seq` | `1229` | `1235` | `6` |
| `source_cards_id_seq` | `20054` | `20058` | `4` |
| `tcg_series_id_seq` | `108` | `110` | `2` |
| `tcg_sets_id_seq` | `278` | `280` | `2` |

Le premier passage complet a signalé l'inventaire privé du test 001, qui attendait huit tables ; celui-ci a été adapté au singleton supplémentaire. Le second passage complet passe. Les INSERT historiques utilisant les identités par défaut, même refusés par des contraintes ou finalement rollbackés, expliquent ces réservations non transactionnelles. Définitions, droits et identifiants des lignes existantes sont conservés. Ces écarts créent seulement des trous de séquence ; les réinitialiser introduirait un risque inutile de réutilisation d'identifiants.

État personnel initial conservé : **1 compte/profil**, **2 collections**, **257 items**, **3 exemplaires**, **1 préférence globale**, **1 override**, **7 intentions**, **14 reçus**, **0 partages/états de notification/annonces**. Catalogue : 1 025 Pokémon, 18 séries, 188 sets, 19 907 cartes, 31 904 variantes, 16 820 rattachements, 1 213 états de cible ; quatre clés, quatre overrides et neuf runs privés. Les fichiers de preuve temporaires hors dépôt ne contiennent que des empreintes ou définitions SQL, pas les données Auth/les secrets.

Les services Auth peuvent conserver des audit logs techniques de fixtures ; le test ne supprime pas globalement les journaux gérés par Supabase. Les données métier et les comptes initiaux sont inchangés. Aucun test navigateur supplémentaire nécessaire pour cette frontière SQL ; les tests REST/Auth/Edge sont des appels directs réels, pas des retours frontend simulés.

## Fichiers livrés et exploitation

Deux migrations, nouveau test pgTAP 039, adaptation de l'inventaire du test 001, [intégration Local](../../scripts/test-business-write-freeze.js), documentation 05/06/08/10/11 et README, ce rapport, package/lock. Pas de changement de middleware/config Vercel, config Supabase, handler Edge, src frontend ni règles Phase 8. Aucun mot de passe opérateur ou credential Cloud créé.

Pour rejouer l'intégration : stack MY. Local démarrée, gel ouvert, publisher sans credential à conserver et `delete-account` servi via `npx supabase functions serve delete-account`. Puis `node scripts/test-business-write-freeze.js`. Exécuter cette suite seule : elle ferme les écritures Local temporairement et utilise les fixtures réservées. Éviter un build/typecheck simultané qui peut provoquer un reload du serveur Edge Local ; un reload a produit 502 dans un essai intermédiaire, puis le scénario final sans reload a démontré 503/200 attendus.

[Activation/relecture/locks/réouverture et prérequis Cloud](../11-PUBLICATION-PRODUCTION.md#prod2--gel-backend-supabase). La première installation Cloud nécessite autorisation distincte, fenêtre contrôlée, backup/reprise, vérification des propriétaires/roles/grants/RPC historiques et identité réelle des services. Installer les deux migrations, vérifier les 23 triggers (22 MY. + Auth), les onze guards RPC et le singleton ouvert, puis réaliser une campagne isolée de fermeture/reprise et publisher/TLS. Aucun script Local de secrets/fixtures ne doit être dirigé vers Cloud.

Limites restantes : Cloud non installé/vérifié ; fermeture globale Auth non promise ; soft deletion administrative et écritures techniques à coordonner ; snapshot de backup/restauration et contrôles opérateur hébergés encore distincts ; administrateurs SQL de confiance capables de changer leur propre sécurité ; nouvelles tables/RPC à raccorder au contrat. Aucun chemin ordinaire actuel identifié ne reste capable d'écrire des données MY. pendant le gel effectif.

## Sources officielles vérifiées

Context7 a été résolu avant requêtes Supabase, PostgreSQL 17 et PostgREST ; changelog Supabase consulté le 13 octobre, aide de la CLI 2.120.0 examinée avant commandes Local.

- [PostgreSQL : session_user/current_user](https://www.postgresql.org/docs/17/functions-info.html), [SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html), [SET SESSION AUTHORIZATION](https://www.postgresql.org/docs/17/sql-set-session-authorization.html).
- [PostgreSQL : verrous](https://www.postgresql.org/docs/17/explicit-locking.html), [fonctions advisory](https://www.postgresql.org/docs/17/functions-admin.html), [isolation et SELECT FOR SHARE sur ancien snapshot](https://www.postgresql.org/docs/17/transaction-iso.html).
- [PostgreSQL : triggers de statement et zéro ligne](https://www.postgresql.org/docs/17/sql-createtrigger.html), [comportements des triggers](https://www.postgresql.org/docs/17/trigger-definition.html).
- [Supabase : triggers de profils et transaction Auth](https://supabase.com/docs/guides/auth/managing-user-data), [BYPASSRLS service_role](https://supabase.com/docs/guides/api/api-keys), [sécurité Data API](https://supabase.com/docs/guides/api/securing-your-api), [changelog](https://supabase.com/changelog).
- [PostgREST : erreurs SQLSTATE PTxyz et HTTP](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes).

Ces sources étayent les mécanismes. Les résultats chiffrés ci-dessus proviennent du backend Local actuel ; aucune documentation ou mémoire historique n'est présentée comme preuve Cloud.
