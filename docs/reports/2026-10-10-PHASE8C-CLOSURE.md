# Phase 8C — Masquage persistant et progression autoritative

Date : **10 octobre 2026**. Version : **0.8.8**. **8C terminée et validée exclusivement Local.** Persistance, invariants, mutation sécurisée, révision/reçu idempotents, contenu v2, progression commune et services/hooks livrés. **8D prête à démarrer, non commencée** : aucun bouton œil, filtre de masquage, compactage, rendu ou DnD modifié. Actualisation et notifications restent futures.

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `5fc385e5cbfb200236cc567feca14729f9692843` | Identique |
| Git | Propre, aucun changement préexistant | 23 fichiers suivis modifiés, sept nouveaux, rien indexé ; aucun commit/push |
| Application | `0.8.7` | **`0.8.8`**, package et lock synchronisés |
| Node / npm / CLI Supabase | `24.20.0` / `12.1.0` / `2.120.0` | Inchangés |
| PostgreSQL Local | `17.6`, port `55322` | Volume conservé |
| API Local | `http://127.0.0.1:55321` | PostgREST réel utilisé |
| Migrations Local | 39 appliquées | **40/40**, dernière `20261010140428` |
| Collections historiques | Quatre, contrat 1 / révision 0 | Identiques, aucune conversion |

Avant modification : `AGENTS.md`, [contrats 8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), [clôture 8B](2026-10-10-PHASE8B8-CLOSURE.md), documents Fonctionnalités/Modèle/UX/Architecture/Database/Roadmap pertinents. Inspection des migrations, vue actuelle à onze colonnes, lecteurs, writers, receipts, révisions, moteur, services, hooks, caches, droits et conventions de tests. Mémoire 8B utilisée pour localiser les mécanismes, puis état réel revérifié. Documentation CLI/PostgreSQL/Supabase JS consultée via Context7 ; changelog Supabase consulté, aucune mise à niveau effectuée.

Aucun accès Supabase Cloud ou Vercel, déploiement, reset, commit ou push. Le dernier checkpoint Cloud reste celui communiqué antérieurement par le propriétaire ; il n'a pas été revérifié. La colonne « remote » de `migration list --local` désigne l'historique de **Local**, pas une preuve Cloud.

## Migration et invariants

[20261010140428_phase8c_persistent_hiding.sql](../../supabase/migrations/20261010140428_phase8c_persistent_hiding.sql), créée par `supabase migration new`, inspectée puis appliquée par `migration up --local`. Une seule transaction `BEGIN`/`COMMIT`, aucun backfill de contrat ni modification des lignes historiques.

- `collection_items.is_hidden boolean not null default false` ; CHECK `NOT is_hidden OR origin='automatic'`.
- Trigger parent existant prolongé dans `private.check_collection_item` ; automatique masqué seulement dans parent automatique, manuel toujours visible. Type parent déjà immuable, y compris en maintenance privilégiée.
- Conversion manuel → automatique avec `is_hidden=true` refusée ; conversion visible conserve UUID, introduction et intentions. Nouveaux items visibles par défaut.
- Moteur pur 8B.2 inchangé : projection depuis le booléen réel, automatique conservé garde son état, nouveau/converti visible. Aucun parcours d'actualisation développé.
- Aucun index booléen isolé, table de masquage ou position visible persistée. Grants/RLS conservés ; aucune écriture directe supplémentaire accordée au navigateur.

Premier essai de migration rejeté : définition de vue issue de 7D.5 omettait `target_id` ajouté en 7F.1. PostgreSQL a annulé toute la transaction. Fichier encore non appliqué corrigé pour conserver les onze colonnes, puis application réussie. Aucun historique appliqué modifié. Vérifications finales confirment conservation des données et droits.

## RPC et idempotence

```sql
public.set_collection_item_hidden(
  p_collection_id uuid,
  p_collection_item_id uuid,
  p_is_hidden boolean,
  p_expected_revision bigint,
  p_operation_id uuid
) returns jsonb
```

VOLATILE SECURITY DEFINER, `search_path=''`, aucune valeur par défaut/overload, EXECUTE authenticated seul. Authentification, AAL2, profil, READ COMMITTED, verrou parent autoritatif puis relecture de propriété/contrat/type. Parent automatique contrat 2 et item automatique du même parent obligatoires. Aucun verrou catalogue.

Empreinte SHA-256 du tuple JSONB canonique `[nom RPC, parent, item, booléen, révision attendue texte]`. Même magasin privé et même protocole que les writers v2. Reçu `kind='hide'` : retry identique retourne le résultat historique avant comparaison de révision courante ; paramètres différents avec même UUID refusés. Une révision obsolète refuse toute mutation. Autorisation actuelle reste requise pour tout retry et toute consultation de reçu.

| Cas | Mutation | Révision | Reçu |
|---|---|---|---|
| État différent | `is_hidden` seul champ métier de l'item modifié | +1 exactement | `changed` |
| Même état demandé | Aucune écriture d'item | Identique | `noop` |
| Retry identique | Aucune | Résultat historique | Reçu existant |
| Échec | Rollback complet | Restaurée | Aucun succès engagé |

Résultat exact : `operation_id`, `outcome`, `personal_revision` décimal texte, `collection_item_id`. BIGINT au-delà de MAX_SAFE_INTEGER et limite maximale sans effet testés ; overflow effectif sanitizé et rollback. Aucune intention, modification de position/rang/origine/introduction, suppression, copie, note ou donnée catalogue. Les triggers techniques existants continuent de mettre à jour `updated_at` lors des véritables UPDATE.

Conventions d'erreurs conservées : indisponibilité `42501`, requête invalide `22023`, item indisponible `P0002`, UUID conflict `23505`, legacy/inéligibilité `23514`, erreur interne sûre `XX000`. Nouveau code métier `collection_item_hidden_invalid` pour manuel/parent libre. Conflit `40001 / collection_structure_conflict` en SQL direct ; helper privé 8B.8 réutilisé pour **HTTP 409** avec même code/message, sans boucle de retry PostgREST. HTTP réel et seuil de retour <3 secondes vérifiés.

## Contenu et progression

Lecteur v1 inchangé. Lecteur v2 conserve enveloppe trois clés, **16 clés exactes par item**, quinze valeurs historiques, ordre complet `sort_position,id`, possession du propriétaire et droits invoker/RLS. Jointure sur identité d'item pour ajouter le booléen persisté à la projection historique, dans le même snapshot SQL. Retourne **toutes les cartes**, masquées comprises. `owned=true` reste vrai sur une automatique masquée possédée. Parent invisible → SQL NULL ; visible vide → `items:[]`. Partages restent consultatifs.

Vue `dashboard_collections` : onze colonnes, types, ACL et `security_invoker` conservés. Prédicat unique sous les deux agrégats : `NOT (origin='automatic' AND is_hidden)`. Numérateur par EXISTS d'au moins un exemplaire de `collections.owner_id`, plusieurs exemplaires comptent une fois. Dashboard et overview utilisent leurs services existants sur cette vue ; destinataire lit la progression du propriétaire. Aucun compteur React alternatif.

Fixture principale : trois automatiques, deux manuels ; deux copies d'une même automatique possédée, une copie d'un manuel, une copie du destinataire sur une automatique manquante pour le propriétaire.

| État | Progression propriétaire / partage |
|---|---|
| Tout visible | **2/5** |
| Automatique possédée masquée | **1/4** |
| Automatique manquante également masquée | **1/3** |
| Trois automatiques masquées, manuels présents | **1/2** |
| Manuels retirés, trois automatiques masquées conservées | **0/0**, contenu complet de trois items |
| Automatique possédée réaffichée ensuite | **1/1** |

Le booléen `owned` reste indépendant de ces comptes. Recherche et futurs filtres ne participent pas à la progression. Aucun texte/design ajouté au cas `0/0` ; présentation à finaliser en 8D.

## Services et hooks

`setCollectionItemHidden` / `createCollectionItemsService.setHidden` étendent [collection-items.ts](../../src/services/collection-items.ts) ; validation UUID/booléen/révision, transport BIGINT chaîne via adaptation étroite des types générés, retour MutationResult strict. `changed` et `noop` valident exactement révision et identité ; erreurs définitives séparées des réponses incertaines. Réponse perdue ou succès malformé → même récupération de reçu que les writers précédents.

Action `hide` dans [useCollectionStructureMutation](../../src/features/collections/useCollectionStructureMutation.ts), sans consommateur visuel. Même stockage sessionStorage/WeakMap, UUID et paramètres exacts avant dispatch, mêmes frontières viewer/parent et occupation commune. Legacy refusé avant writer. Retry ne change ni UUID, ni état demandé, ni révision. Reçu absent/invalide retient l'opération ; action inverse/différente bloquée tant que l'incertitude subsiste. Reload/nav/cache clear, autorisation et fin d'action suivent les mécanismes communs.

Relecture autoritative obligatoire ; invalidations ciblées contenu, ordre, overview et Dashboard du viewer/parent. Lectures actives rechargées avant confirmation ; résumés inactifs invalidés pour prochaine consultation. Autres parents/viewers et caches de copies conservés. Décodeur v2 accepte le booléen réel et refuse un manuel masqué ; décodeur v1 strict inchangé.

Types Supabase générés réellement depuis Local et reproductibilité byte à byte vérifiée. Extension TypeScript `allowImportingTsExtensions` sous `noEmit` permet aux tests d'intégration frontend d'importer les helpers Local existants ; scripts de fixtures/concurrence ajoutés au typecheck Node. Aucun changement de dépendance ou version d'outillage.

## Preuves exécutées

| Validation | Résultat |
|---|---|
| [pgTAP 031](../../supabase/tests/database/031_collection_item_hidden.test.sql) ciblé final | **141 assertions PASS** |
| Suite DB complète `npm run db:test` | **31 fichiers / 3 085 assertions PASS** |
| Services/contenu/hook structurel ciblés | **3 fichiers / 197 tests PASS** |
| Suite frontend/outils `npm test -- --maxWorkers=2` | **64 fichiers / 1 964 tests PASS**, un fichier/test Local opt-in sauté par défaut |
| [Intégration Local réelle](../../src/services/collection-hidden.local.test.tsx) opt-in | **1 test PASS**, exécuté séparément avec `MY_SUPABASE_LOCAL_TEST=1` |
| Huit scripts de concurrence | PASS, connexions PostgreSQL indépendantes, attentes observées |
| Deux scripts PostgREST historiques | PASS, activation v1/v2 et lecteur v2/snapshot |
| SQL lint public/private | PASS, aucun warning |
| Advisors sécurité Local | **0 WARN/ERROR**, quatre INFO attendues pour tables privées RLS sans policy |
| Génération des types et reproductibilité | PASS |
| Build/typecheck | PASS ; avertissement existant de bundle >500 kB, aucun travail de bundle engagé |
| ESLint / `git diff --check` | PASS |
| Conservation données / privilèges | PASS, snapshots détaillés ci-dessous |

Les assertions anciennes 023/024/029 qui interdisaient encore colonne/API 8C ont été mises à jour ; les garanties d'ordre, moteur et lecture qu'elles entourent restent vérifiées. Rapports historiques inchangés.

### Concurrence réelle

[Script masquage](../../scripts/test-collection-item-hidden-concurrency.ts) : quatre connexions PostgreSQL, attentes observées par `pg_blocking_pids`, aucune succession simple présentée comme concurrence. UUID identique simultané ; hide/reorder/add/remove dans les deux directions ; révision fraîche ou obsolète après attente ; deux collections automatiques indépendantes ; visibilité atomique avant/après commit ; rollback avec retry en attente ; no-op sans incrément ; timeout réel ; refus REPEATABLE READ/SERIALIZABLE. Verrou exclusif catalogue tenu ailleurs sans bloquer masquage, aucun advisory lock du writer. Consultation attend commit et retrouve résultat exact ; ownership et existence relues après attente réelle. Journal/R1 incluant masqués et UUID manuel ensuite retiré conservés, placement initial d'un ajout concurrent conservé.

Sept scripts antérieurs redéroulés : création automatique, reorder v1, ajout/retrait v1, reorder v2, ajout v2, retrait v2 et consultation de reçu. Ils couvrent notamment autorisations, attentes, idempotence, invariants différés au COMMIT et préservation des données. Tous PASS et fixtures supprimées.

### Intégration et sécurité

Test opt-in : hook React Query réel sous jsdom → vrais services → SDK Supabase → PostgREST Local → PostgreSQL/RLS. Seuls contexte Auth et factory du client sont injectés. Résumés Dashboard/overview actifs relus après hide, propriété/partage comparés. JWT AAL2 synthétiques signés pour fixtures uniquement ; aucun parcours d'enrôlement/challenge MFA prétendu exécuté.

Perte de réponse simulée après vrai commit HTTP : réponse du writer jetée, récupération réelle du reçu, exactement **un** appel writer, état/revision/progression relus. Refus stale HTTP 409 avec payload `40001`, collision UUID, manuel/libre/legacy, tiers, partagé, AAL1, profil absent, anonyme, parent absent et DML direct interdits. Révocation du partage rend contenu/overview invisibles. pgTAP ajoute requêtes NULL, invariants parent/origine, MAX BIGINT, failpoint avant reçu avec témoin non transactionnel et snapshot du rollback complet.

Scripts [activation](../../scripts/test-order-contract-activation-api.ts) et [contenu v2](../../scripts/test-collection-content-v2-api.ts) PASS : créations contrat 2, legacy intact, exactitude BIGINT, progression/possession partagée, lecteur 1 005 items/16 clés, snapshot superposé et retries des writers antérieurs compatibles.

## Conservation des données

Snapshots avant schéma et après toutes les premières campagnes : **19 tables public/private**, toutes lignes comparées par empreinte JSON ordonnée et compte. Seule nouvelle colonne `is_hidden` exclue de la comparaison historique ; vérification supplémentaire que toutes les lignes historiques restent false. **332 entrées ACL/RLS existantes identiques** (tables, colonnes antérieures, fonctions). Une seule nouvelle fonction publique, EXECUTE restreint ; nouvelle colonne sans INSERT/UPDATE navigateur.

| Données réelles | Avant = après | Empreinte historique identique |
|---|---|---|
| Collections | **4**, toutes contrat 1 / révision 0 | `7602096575a71bc0084f61eb410d8fe3` |
| Items | **660**, tous visibles | `f4511cb145ffce2612ee986a80206869` |
| Exemplaires et notes | **3** | `1665790cd21295f3f5c2b3cd9100e423` |
| Variantes catalogue | **31 904** | `fe2e2b842b90cbd197fa4dd2bd1c156b` |
| Intentions / reçus réels | **0 / 0** | Inchangés |

Profils, préférences, partages, catalogue et tables privées également identiques. Tests SQL sous rollback ; tests HTTP/concurrence sur fixtures synthétiques engagées isolées, inventaire des IDs avant installation, nettoyage atomique et zéro résidu. Aucun utilisateur réel utilisé pour les mutations. Vérification finale d'intégrité redéroulée après la dernière intégration.

## Documentation, retour arrière et arrêt

Version package/lock `0.8.8`, dépendances et outillage identiques à HEAD. README, Fonctionnalités, Modèle, UX, Architecture, Database et Roadmap actualisés pour distinguer backend 8C livré, nouvelles créations déjà contrat 2, interface/filtres 8D futurs et actualisation/notifications futures. Rapports 8A/8B conservés.

Retour arrière logiciel futur : retirer/fermer la nouvelle mutation par révocation EXECUTE dans une migration additive. Conserver booléens, révisions, reçus, journal, lecteurs/progression cohérents et gardes legacy. Ne jamais remettre un writer v1 sur un parent v2. Aucune contraction ou opération destructive exécutée.

**8C clôturée Local, garanties essentielles démontrées. 8D préparée par contrats/services/hooks, non commencée.** Aucun test de nouvelle interface ou geste masquage en navigateur, aucune panne réseau physique, aucun checkpoint Cloud/Vercel ; ces actions n'ont pas été exécutées.
