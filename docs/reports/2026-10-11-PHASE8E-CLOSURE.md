# Phase 8E — Détection et aperçu des actualisations

Date : **11 octobre 2026**. Version : **0.8.10**. **8E livrée et validée exclusivement Local.** Détection autoritative, aperçu pur via moteur 8B.2, plan/token déterministes, services/décodeurs/contrats React Query, composant consultatif et preuves SQL/concurrence/SDK/navigateur livrés. **Aucune application d’actualisation**, notification, publication ou entrée utilisateur permanente. Arrêt à 8E ; 8F/8G/8H non commencées, aucun commit ni push.

## État réel et limite du repère historique

| Contrôle | Initial / final |
|---|---|
| Branche / HEAD | `dev` / `e76fdacf993c8c5e2394f79fcd5b6f5fbeb3e107`, inchangés |
| Git initial | Propre, aucun changement préexistant à préserver |
| Application | `0.8.9` → **`0.8.10`**, package/lock synchronisés |
| Node / npm / CLI | `24.20.0` / `12.1.0` / `2.120.0`, inchangés |
| PostgreSQL / API | Supabase Local conservé, DB `127.0.0.1:55322`, API `http://127.0.0.1:55321` |
| Migrations | 40 initiales → **42 appliquées Local** |
| Collections réellement présentes | **2**, identiques avant/après |
| Éléments réellement présents | **257**, identiques avant/après |
| Exemplaires/notes | **3**, identiques avant/après |
| Journal / reçus réels | **7 / 14**, identiques avant/après |

**Écart signalé avant modification : les quatre collections / 660 éléments cités dans la demande et les anciens rapports ne sont plus présents dans cette base initiale.** La preuve actuelle porte sur les **2 collections / 257 éléments réellement trouvés**, y compris leurs masquages, journal et reçus existants. Aucune restauration, conversion, suppression ou reconstitution implicite des anciennes collections. Les quatre anciennes collections ne peuvent pas être déclarées revérifiées par cette campagne.

Lecture avant édition : `AGENTS.md`, conception 8A.3 (section 6), clôtures 8B/8C/8D, documents Fonctionnalités/Modèle/UX/Architecture/Database/Pipeline Catalogue, moteur/types/tests R1–R4, canonique/états/hash, journal/introductions, sync/verrou exclusif, lecteurs/writers, RLS/grants, services/caches et composants partagés. Mémoire utilisée pour localiser le moteur, puis contrats et état actuel vérifiés dans le dépôt/Local. Skills migration, Supabase, Context7 et agent-browser utilisés. Docs CLI/TanStack Query/Zod récupérées via Context7, changelog Supabase consulté ; aucune mise à niveau de dépendance/outillage.

## Migrations et calcul autoritatif

1. [20261011065009_phase8e_collection_update_preview.sql](../../supabase/migrations/20261011065009_phase8e_collection_update_preview.sql) : type de contexte privé, lecteur verrouillé/vérifié, plan et hash privés, deux RPC publiques. Aucun stockage métier ajouté, aucun backfill.
2. [20261011070549_phase8e_context_conflict_guard.sql](../../supabase/migrations/20261011070549_phase8e_context_conflict_guard.sql) : correction additive après SQL lint. Le helper de conflit lève toujours une erreur, mais `plpgsql_check` ne déduisait pas cette terminaison et signalait un chemin sans RETURN. Garde RAISE explicite après le helper, comportement inchangé ; aucune migration appliquée réécrite.

Fichiers créés par `supabase migration new`, inspectés puis `migration list --local` / `migration up --local`. Chaque migration contient un seul BEGIN/COMMIT. Types régénérés depuis le schéma réellement appliqué, reproductibles byte à byte. Aucun reset, accès Cloud, déploiement Vercel, commit ou push. L’historique « remote » affiché avec `--local` désigne Local ; aucune preuve Cloud produite.

```sql
public.get_collection_update_status(p_collection_id uuid) returns jsonb
public.preview_collection_update(p_collection_id uuid) returns jsonb
```

Statut exact : `{collection_id,order_contract_version,applied_target_version,target_version,target_hash,update_available}`. Propriétaire automatique AAL2/profil, **legacy lisible**, sans proposition d’application v2. Aperçu exact : `{collection_id,token,update_available,target_empty,added,removed,converted,rank_changes,final_order}` ; propriétaire automatique **contrat 2 uniquement**.

| Entrée de plan | Format exact |
|---|---|
| `added` | `{variant_id:string,automatic_rank:string}` |
| `removed`, `converted` | `{collection_item_id:UUID,variant_id:string,automatic_rank:string}` |
| `rank_changes` | `{collection_item_id:UUID,variant_id:string,previous_rank:string,next_rank:string}` |
| `final_order` | `{collection_item_id:UUID/null,variant_id:string,origin:manual/automatic,automatic_rank:string/null,is_hidden:boolean}` |
| `token` | `{contract_version:1,applied_target_version:string,target_version:string,target_hash:string,personal_revision:string,plan_hash:string}` |

Tous les BIGINT sont transportés en chaînes décimales exactes. Retraits par ancien rang, autres deltas par rang cible ; ordre final strictement issu du moteur. Champs et catégories uniques/disjoints ; nouveaux automatiques sans UUID, conversions sur le même UUID. Contrat de calcul/token **1**, contrat d’ordre du parent **2** : valeurs distinctes par responsabilité.

Contexte unique sous READ COMMITTED : Auth/AAL2/profil, verrou catalogue partagé **771402 avant parent FOR UPDATE**, puis relecture autoritative après attente. Canonique cible matérialisé une fois et vérifié par le hash du JSON compact des IDs ordonnés ; ancien canonique reconstitué par les automatiques actuels et leurs `automatic_rank`. Aucun usage de `sort_position` pour la détection. Version supérieure candidate seulement : liste identique après retour du catalogue → false sans avancer la version appliquée. Description seule → aucun changement structurel. Cible/état absent, version régressée, hash faux, rangs impossibles, univers différent sous version égale et histoire incohérente sont refusés sans détail interne exposé.

`private.collection_update_plan` réutilise **le véritable moteur 8B.2 inchangé**, avec tous les items/masques/introductions et **toutes** les intentions vivantes triées par séquence. Il retire uniquement la trace interne de replay du payload public. R1 : contexte historique immuable ; R2 : masqués inclus ; R3 : conversion conserve identité/intentions, retrait ignore les intentions propres, autres références historiques intactes ; R4 : chronologie complète, aucun geste ajouté. Automatique conservé garde son masque ; nouveau/converti visible. Cible vide : tous les retraits, manuels survivants, parent conservé ; création d’un nouveau parent vide toujours refusée.

## Empreinte et pureté

SHA-256 sur UTF-8 du **texte JSONB PostgreSQL d’un tuple positionnel versionné** : marqueur `my.collection-update-plan`, format 1, UUID parent, tuples des ajouts, retraits, conversions, changements de rang et ordre final. Ordre de champs et tableaux fixé, BIGINT en chaînes, UUID PostgreSQL canoniques, masques booléens, absences NULL. Identités existantes et ajouts par variante inclus ; labels, copies, notes, timestamps et UUID futurs exclus. [Sérialisation exacte et invariants](../06-DATABASE.md#sérialisation-du-token-de-confirmation-format-1), golden indépendant Node crypto vérifié par pgTAP.

Même structure → même plan/hash. Version/hash cible ou révision personnelle différents → token différent ; nouvelles intentions → calcul intégral refait. Aucun délai arbitraire ni table de previews. 8F devra réutiliser ce contexte/plan, recalculer et comparer **les six champs**, puis autoriser l’application dans sa propre transaction. Token sans pouvoir d’autorisation et sans nouvelle API writer.

Lecteurs sans INSERT/UPDATE/DELETE métier, allocation UUID/position, ajout d’intention/révision, reçu d’application, modification de version appliquée ou acquittement de notification. Verrous seuls autorisés. Snapshots SQL de toutes les lignes métier avant/après séries de statuts/aperçus, déterminisme répété et inspection des définitions vérifient cette pureté. Sync catalogue et writers validés inchangés ; exemplaires/notes jamais touchés par l’aperçu.

## Sécurité et concurrence

RPC VOLATILE SECURITY DEFINER, `search_path=''`, tables qualifiées, EXECUTE authenticated seul ; helpers/types privés fermés aux rôles API. Erreurs publiques assainies : disponibilité/droits 42501, inéligibilité/legacy/incohérence 23514, conflit 40001 (HTTP 409 via helper 8B.8), erreur interne XX000. Services exposent codes stables sans texte SQL privé. Propriétaire AAL2 accepté ; profil absent, AAL1, destinataire partagé, tiers, anonyme, service_role, parent libre et aperçu legacy refusés. Statut legacy reste autorisé au propriétaire.

[Concurrence 8E](../../scripts/test-collection-update-concurrency.ts) : **quatre connexions PostgreSQL réelles**, attentes observées par `pg_blocking_pids`, transactions superposées et relecture engagée. Catalogue exclusif concurrent → aperçu attend avant parent ; writer parent-only reste possible pendant cette attente. Reorder, hide, ajout et retrait manuels → aperçu attend parent, lit nouvelle révision et état engagés ; autre collection indépendante non bloquée. Pureté après attente comparée aux lignes engagées. Transfert de propriété/suppression synthétique pendant attente → refus actuel. READ COMMITTED exigé, REPEATABLE READ/SERIALIZABLE refusés, timeout réel assaini.

Chevauchement à trois transactions : reorder tient parent, aperçu tient catalogue partagé et attend parent, sync attend catalogue exclusif. Commit du writer libère aperçu, puis sync ; aucune inversion ni deadlock. Sens aperçu → ajout également exercé : attente parent puis refus d’éligibilité après attente, sans écriture. Suppressions/transferts de test exclusivement sur parents synthétiques réservés ; zéro conversion ou suppression de collection utilisateur.

## Services, cache et composant

[Services/décodeurs](../../src/services/collection-update.ts), [types](../../src/types/collection-update.ts) : `getCollectionUpdateStatus` / `previewCollectionUpdate`, retours stricts, liaison au parent demandé, UUID/BIGINT/hash/versions/format, champs supplémentaires, doublons, rangs et classifications contradictoires refusés. BIGINT au-delà de MAX_SAFE_INTEGER conservés. Aucun retry writer, DML direct ou API d’application ajouté.

[Contrats React Query](../../src/features/collections/collection-update-query.ts) : clés viewer/collection, options désactivées par défaut, refetch explicite seulement ; pas de polling, focus/reconnexion/prefetch ni cache de notifications. Mutations structurelles existantes invalident statut/aperçu **sans refetch** et annulent une lecture en cours ; relectures métier historiques conservées. Invalidations réutilisables par 8F avec contenu/ordre/overview/Dashboard, sans implémenter 8F. Le futur parcours doit fournir un contenu complet frais et les métadonnées des variantes, traiter la péremption de son aperçu et autoriser la consultation propriétaire.

[CollectionUpdatePreview](../../src/features/collections/CollectionUpdatePreview.tsx) est pure présentation : résumés et listes, conversion existante/nouvel automatique distingués, variantes précises via `CompactVariantSummary` partagé et métadonnées catalogue, rangs en langage lisible et positions déduites du tableau actuel, ordre complet backend dans disclosure natif. Manuels/masqués inclus sans filtre ni fusion React. États chargement/erreur/indisponibilité/cible vide/aucun delta ; retry consultatif, focus du titre fourni au caller, clavier et responsive MY. Aucun bouton d’application, entrée Dashboard, cloche, lecture ou acquittement interne.

## Preuves exécutées

| Validation | Résultat final |
|---|---|
| pgTAP 032 ciblé / inclus dans DB complète | **134 assertions PASS** |
| DB complète | **32 fichiers / 3 219 assertions PASS** |
| Frontend/services/outils complets | **68 fichiers / 2 070 tests PASS**, deux tests Local opt-in exclus par défaut |
| Intégration 8E opt-in | **1 test PASS**, vraie chaîne SDK/PostgREST/PostgreSQL et composant React |
| Compatibilité intégration 8C opt-in | **1 test PASS**, masquage et relectures existants après extension des invalidations |
| Concurrence 8E | PASS, quatre connexions réelles et attentes observées |
| Build/typecheck / ESLint | PASS ; warning existant de bundle >500 kB conservé |
| SQL lint public/private | PASS, aucun warning final |
| Advisors sécurité Local | **0 WARN/ERROR**, quatre INFO privées RLS sans policy attendues |
| Types générés reproductibles | PASS, byte à byte |
| Dépendances/outillage package/lock | Identiques à HEAD hors trois champs de version |
| Browser Chromium isolé | Desktop `1280×900`, mobile `390×844`, clavier/focus, état vide/aucun delta/chargement/erreur/indisponibilité ; pas d’overflow horizontal |
| Axe navigateur | **0 violation, 0 incomplete**, 33 règles PASS |
| Données, ACL tables/colonnes, fonctions préexistantes | 23 tables et 38 fonctions préexistantes identiques avant/après |
| `git diff --check` / liens locaux des documents modifiés | PASS ; 449 liens/ancres sur 9 documents |

SQL compare les **36 scénarios 8A.2**, A/B et contre-exemples S08/S35 compris, sur des données réelles synthétiques, au moteur 8B.2 installé ; aucune nouvelle logique de replay dans les attentes. Adaptateur limité aux types et au namespace de fixtures. Autres cas : Pokémon/Extension, retour de structure, descriptif seul, conversion/ajout/retrait/rang/masque, manuel hors canonique, cible vide avec/sans manuels, R1 complet, exactitude BIGINT/version/révision, déterminisme et refus d’incohérences.

Intégration Local : client SDK réel et QueryClient réel, seuls factory client/Auth synthétiques injectés. JWT AAL2 synthétiques signés pour fixtures ; aucun parcours d’enrôlement/challenge MFA prétendu exercé. Consultation explicite seulement, droits HTTP réels, métadonnées catalogue par lecteur existant, rendu conversion/vide, trace limitée aux RPC de lecture, aucun appel d’application/notification/writer lors d’un aperçu. Browser de présentation séparé : plan/métadonnées de fixtures frontend dans `.cache/phase8e/`, pas un nouveau parcours Auth définitif ni une preuve navigateur de backend authentifié.

Corrections de validation nécessaires : assertions anciennes 023/025 lisaient journal/reçus globaux et 031 supposait tous les items réels visibles. Elles sont désormais bornées aux fixtures synthétiques ; les réels 7 intentions/14 reçus/masques sont préservés. Assertion 024 interdisant encore preview publique actualisée pour conserver l’interdiction moteur public/apply. Attentes frontend d’invalidation 4 → 6, deux caches consultatifs supplémentaires. Le harness React Query a été corrigé pour suivre les propriétés réactives du résultat ; aucun changement produit motivé par ce défaut de test. Échec initial de fixtures (taille non renseignée, cible considérée vide) et commande advisors `warning` au lieu de `warn` corrigés ; seules campagnes finales PASS constituent les preuves.

## Conservation, retour arrière et limites

Snapshots avant toute migration et après nettoyage : **23 tables public/private/Auth** (19 tables métier/private plus users/sessions/facteurs/challenges), comptes et empreintes JSON ordonnées identiques ; tables/colonnes ACL et définitions/ACL de toutes fonctions préexistantes identiques. Nouveau type/helpers/lecteurs uniquement. Toutes les fixtures HTTP/concurrence engagées ont été supprimées, fixtures SQL sous rollback. Aucun résidu synthétique, changement de catalogue réel, copie/note, profil, partage, intention/reçu réel ou timestamp métier.

| Lignes réelles | Avant = après | MD5 JSON ordonné |
|---|---:|---|
| Collections | **2** | `e45c561f5c63af3811766f3fc52c4261` |
| Items | **257** | `ec9db28fc8623c75ae27167ee1a67345` |
| Exemplaires/notes | **3** | `1665790cd21295f3f5c2b3cd9100e423` |
| Variantes catalogue | **31 904** | Identique, snapshot Local conservé |
| Intentions / reçus | **7 / 14** | Identiques, snapshot Local conservé |

Retour arrière logiciel : fermer callers ou révoquer EXECUTE des RPC par migration additive ; garder types/helpers tant que des callers dépendent d’eux, journal/reçus/masques/données et gardes v1/v2. Aucun writer legacy remis sur v2, aucune contraction exécutée.

README et documents 01/03/04/05/06/07/08 synchronisés ; roadmap reste macro, 8E terminée et 8F prochaine étape non commencée. Rapports historiques conservés. Artefacts de validation ignorés dans `.cache/phase8e/` : snapshots, logs, harness isolé, captures, résultat axe et hash golden.

Dernière garde de fixtures (états réservés supplémentaires libres) validée par typecheck, ESLint et nouvelle exécution de l’intégration 8E opt-in, tous PASS. Compatibilité 8C opt-in également PASS. Snapshot final repris après ces nettoyages ; navigateur isolé et serveur Vite de test fermés, Supabase Local laissé actif.

Limites : Cloud/Vercel, application transactionnelle, notifications, expiration inexistante, futur parcours de confirmation, matériel tactile physique et nouveau parcours MFA non exercés. Aucun résultat 8F/8G/8H inféré. Les sept autres scripts historiques de concurrence et scripts API historiques ne sont pas attribués à cette campagne ; moteur/writers préexistants inchangés, DB complète et concurrence 8E interopérant avec eux exécutées. L’écart initial 4/660 → 2/257 est documenté, sans inventer sa cause ni une preuve de conservation de lignes absentes.

**8E clôturée Local. Plan/token prêts pour vérification future en 8F, sans application ni notification. Aucun commit ni push.**
