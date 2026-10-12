# Phase 8G.2 — RPC et services de notifications

11 octobre 2026 — version **0.8.15**. **8G.2 livrée et validée exclusivement Local ; 8G reste en cours.** Cinq RPC, projection active commune, pagination, compteur global, suivi persistant et services TypeScript stricts. Aucun branchement utilisateur, annonce réelle ou chemin de publication. Arrêt à 8G.2.

## État réel et sources

| Contrôle | Résultat |
|---|---|
| Branche / HEAD initial et final | `dev` / `fb3a2d06a6ac00915a01c21bbf6dce67e829b16a`, inchangés |
| Worktree initial | Propre, aucun changement préexistant |
| Version | Package et deux champs du lock `0.8.14` → `0.8.15` ; dépendances inchangées, comparaison JSON exacte hors version |
| Local | API `127.0.0.1:55321`, PostgreSQL `127.0.0.1:55322`, volume conservé ; CLI 2.120.0 |
| Historique | 45/45 avant, **46/46 après**, une migration additive créée par CLI et appliquée avec `migration up --local` |
| Données réelles | Deux collections, 257 items, trois exemplaires, sept intentions, quatorze reçus, intégralement conservés |
| Fonctions préexistantes | **48 définitions et ACL identiques** avant/après, dont projection 8G.1, contexte/aperçu/application et writers |

Avant modification : `AGENTS.md`, [section 8 de 8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md#8-notifications-et-publication), [réalisation 8G.1](2026-10-11-PHASE8G1-NOTIFICATION-FOUNDATIONS.md), [clôture 8F](2026-10-11-PHASE8F3-CLOSURE.md), Fonctionnalités, Architecture, Modèle, Database et roadmap. Inspection des deux migrations 8G.1, constraints/triggers/ACL/RLS, projection canonique, conventions de services, schémas Zod, cache et fixtures existantes. Skills lean-build, Supabase, Context7 et procédure Local de migration/types appliqués ; changelog Supabase et documentation actuelle CLI/React Query consultés. Aucun agent délégué.

## Migration et modèle commun

[`20261011182146_phase8g2_notification_api.sql`](../../supabase/migrations/20261011182146_phase8g2_notification_api.sql) : un seul BEGIN/COMMIT, trois helpers privés et cinq RPC publiques. Aucun DML de données métier dans la migration, aucune nouvelle table, modification de moteur/writer ou réécriture d'une migration appliquée. Types générés depuis Local par le script existant, cinq déclarations publiques ajoutées seulement.

Helpers privés STABLE INVOKER, `search_path=''`, EXECUTE fermé :

- `notification_caller()` : identité Auth de l'appelant, AAL2, compte Auth et profil obligatoires ; aucun destinataire ou date d'inscription en paramètre public.
- `read_notification_announcements(caller,at)` : publication ≤ horloge, retrait absent, expiration > horloge, inscription **auth.users.created_at** ≤ publication ou `include_new_users`. Joint uniquement le suivi de l'appelant. Inclut `processed_at` pour reconnaître un retry de traitement ; ne charge ni corps ni action de stockage.
- `read_active_notifications(caller,at)` : union de la projection **8G.1 inchangée** et des annonces éligibles non traitées. Définition commune du centre et du compteur ; activité/audience des transitions et du contenu reposent sur les mêmes lecteurs.

Collection automatique contrat 2 propriétaire seulement, clé `collection:<UUID>`, révision/version cible exacte. Libre, legacy, partage reçu, incohérence, absence de delta utile, application et suppression exclus. Nouveau changement repasse non lu par comparaison des versions, sans écriture de diffusion. Annonce/changelog partagé : clé `announcement:<UUID>` commune aux deux catégories, révision `content_hash` immuable. Date du profil sans effet sur l'audience Auth.

Lecteurs publics STABLE : snapshot du statement transmis aux helpers ; centre matérialise une fois les notifications actives pour construire page et total. Compteur utilise cette même projection sans corps. Lectures pures : aucune ligne de suivi créée par centre, compteur ou contenu. Pagination vivante entre statements, conformément à 8A.3 ; rafraîchissement de tête et déduplication entre pages appartiennent au consommateur 8H.

## Formats publics livrés

| RPC | Paramètres / JSONB |
|---|---|
| `get_notification_center` | `p_limit integer default 20`, `p_cursor jsonb default null` → `{items,unread_count:string,next_cursor:objet ou null}` |
| `get_notification_unread_count` | Aucun paramètre → `{unread_count:string}` |
| `get_notification_content` | `p_announcement_id uuid` → item annonce/changelog avec `body:string`, ou NULL sûr |
| `mark_notification_read` | `p_notification_key text`, `p_observed_revision text` → `{outcome:'recorded' ou 'obsolete'}` |
| `process_announcement_notification` | `p_announcement_id uuid`, `p_observed_hash text` → même issue |

Limite NULL → 20, domaine 1–50 ; hors domaine → `22023/notification_input_invalid`. Curseur strict à deux champs `{updated_at,notification_key}`, date ISO avec fuseau et jusqu'à six décimales, clé UUID canonique. Ordre `(updated_at DESC,notification_key COLLATE "C" ASC)`, comparaison par curseur sans OFFSET ; une ligne supplémentaire détermine `next_cursor`, toujours sur le dernier item retourné. `unread_count` global ne dépend ni du curseur ni des 20/50 lignes. Les items d'une page sont uniques par clé.

Champs communs exacts : `notification_key,kind,revision,state,title,updated_at,action`, état seulement `unread/read`.

- Collection : `kind=collection_update`, `collection_id,applied_target_version,target_version`. BIGINT/révision en chaînes décimales positives exactes ; cible strictement supérieure à version appliquée. Action `{kind:'collection_preview',collection_id}`.
- Annonce/changelog : `kind=announcement/changelog`, `announcement_id,app_version,requires_action`. SemVer nullable pour annonce, obligatoire pour changelog. Hash SHA-256 hex minuscule comme révision. Action `{kind:'notification_content',announcement_id}`.

Contenu = variante annonce/changelog plus `body` ; métadonnées d'identité/catégorie/version/lecture/hash présentes. JSON null indifférencié pour inconnu, futur, retiré, expiré, non éligible ou traité. Le corps est du texte brut, conservé tel quel ; rendu comme texte requis en 8H. Actions construites côté serveur, jamais copiées depuis le JSON privé de publication. Aucun auteur opérateur, contexte privé, date Auth, URL arbitraire ou commande exposé.

## Transitions, sécurité et concurrence

Collection : format positif canonique dans BIGINT, observation future → obsolete. Verrou partagé catalogue `771402` **avant** parent FOR UPDATE, puis relecture d'autorisation/profil et de la projection 8G.1. Notification inactive → obsolete sans suivi. Upsert conditionné à `read_target_version < version_observée` ; ni régression ni remise à zéro de date sur retry. **Version 2 vue, version 3 arrivée, lecture de 2 : 3 demeure non lue.** Lecture ne modifie ni parent/révision personnelle, ni aperçu, ni version appliquée ; traitement exclusivement dérivé de 8F.

Annonce : verrou advisory transactionnel par paire appelant/UUID, avant première ligne de suivi également, puis publication FOR SHARE. Cette combinaison sérialise les opérations du même utilisateur sans bloquer les autres utilisateurs de l'annonce ; collisions du hash advisory n'ont qu'un effet de sérialisation supplémentaire. Retrait/suppression attendent le verrou de publication. Après toute attente : profil, activité, audience et hash revalidés, expiration contrôlée avec horloge serveur fraîche.

Lecture : hash exact, annonce active non traitée ; premier `read_at` conservé, aucun `processed_at` effacé. Retry identique n'actualise aucun timestamp. Si traitement concurrent précède lecture, issue obsolete et état traité préservé.

Traitement ordinaire : lecture/traitement atomiques, dates acquises conservées. Répétition encore active/éligible et hash exact → recorded sans modification ; annonce devenue obsolète → obsolete. **`requires_action=true` toujours refusé par `42501/notification_action_unresolved` en 8G.2** : aucun clic, hash ou appel RPC ne vaut action réalisée. Les conditions serveur supportées et leur validation à la publication restent pour 8G.3 ; aucune condition artificielle introduite pour les tests.

Les cinq RPC sont DEFINER, justifiées par accès privé/Auth, `search_path=''`, objets qualifiés, EXECUTE `authenticated` seul après révocation PUBLIC/anon/authenticated/service_role puis grant ciblé. Helpers privés fermés ; tables RLS sans policy ni DML navigateur, schéma private hors Data API. Revalidation d'activité avant toute écriture. Mutations VOLATILE en READ COMMITTED seulement ; snapshots fixes refusés par `25000/notification_isolation_invalid`. Aucun nouveau verrou catalogue après parent, ni accès au suivi d'un autre utilisateur.

## Services et caches préparés

[`types/notifications.ts`](../../src/types/notifications.ts), [`lib/notification-contract.ts`](../../src/lib/notification-contract.ts), [`services/notifications.ts`](../../src/services/notifications.ts) : types dédiés et cinq services avec réponses strictes. Trois discriminants distincts, aucun champ inattendu, UUID minuscules, BIGINT exacts, hashes, dates calendrier/fuseau/microsecondes, SemVer, destinations internes liées à l'identité, unicité/ordre des items, curseur sur dernier item, cohérence du compteur et liaison de réponse aux paramètres.

Dates de pagination comparées à la microseconde, sans perte de précision par Date seul ; versions/révisions conservées en décimales, jamais converties en Number. Erreurs assainies : `invalid_input`, `not_authorized`, `action_unresolved`, `unavailable`, `unexpected`. NULL de contenu conservé. Aucun retry de transport implicite : reprise explicite avec même clé et révision/hash observés, sans acquitter une nouvelle version.

[`notification-query.ts`](../../src/features/notifications/notification-query.ts) : clés viewer-scoped centre avec limite/curseur normalisés, compteur et contenu. Options désactivées, `retry:false`, aucun mount/focus/reconnect/polling/prefetch automatique. Mutations `retry:false`, invalidation des pages/compteur de ce viewer et du contenu concerné, annulation des réponses précédentes puis `refetchType:'none'`. Autres viewers/contenus conservés ; aucun optimisme de confirmation sur erreur.

Points préparés pour 8H : fetch explicite du compteur à session ouverte, centre paginé, lecture pure d'un contenu puis traitement explicite, lecture de collection avec **version de l'aperçu effectivement affiché**, invalidation centre/compteur après application 8F. Aucun point encore branché au header ou au parcours Collection ; `CollectionUpdateDialog`, hooks et protocole de confirmation 8F inchangés.

## Preuves ciblées exécutées

| Validation | Résultat |
|---|---|
| [036 lecteurs](../../supabase/tests/database/036_notification_readers.test.sql) | **60 assertions PASS** : vide, mélange, pagination/timestamps, limites/curseurs, global >50, audience Auth/égalité/+1µs/profil tardif/exception, expiration/retrait/futur/traitement, legacy/libre/partage/delta nul, pureté, ACL/RLS |
| [037 transitions](../../supabase/tests/database/037_notification_transitions.test.sql) | **74 assertions PASS** : première lecture/retry, 2 puis 3, ancien/futur, monotonie/dates, annonces/changelog, traitement/refus action, accès tiers/MFA/profil/anonyme, BIGINT >2^53, application 8F réelle et suppression |
| Stockage/projection existants 034/035 + 036/037 | **Quatre fichiers / 372 assertions PASS** ; seule attente historique de présence des RPC ajustée dans 035 |
| [Décodeurs/transport](../../src/services/notifications.test.ts) et [cache/mutations](../../src/features/notifications/notification-query.test.tsx) | **96 tests PASS** ; champs/actions stricts, erreurs, défauts/paramètres, absence de lecture automatique, annulation des réponses tardives, invalidations viewer-scoped et retry false |
| Services/token/aperçu existants directement concernés | Exécution commune **cinq fichiers / 247 tests PASS**, avec services 8E, apply 8F.2 et cache d'aperçu existants |
| [Intégration Local](../../src/services/notifications.local.test.ts) | **Un test PASS**, SDK/PostgREST/PostgreSQL réels avec JWT/identités synthétiques : cinq RPC, trois catégories, pagination/concordance, suivi exact, cache, quinze refus AAL1/profil absent/anon, refus d'action, private Data API inaccessible |
| [Concurrences nouvelles](../../scripts/test-notification-api-concurrency.ts) | **Neuf scénarios PASS**, trois connexions PostgreSQL réelles et waits observés par `pg_blocking_pids` ; refus repeatable read/serializable sur les deux mutations également vérifié |
| SQL lint public/private | PASS, zéro warning/erreur |
| ACL/RLS et advisors sécurité Local | PASS ; **zéro WARN/ERROR**, sept INFO `rls_enabled_no_policy` attendues sur les stockages privés fermés |
| Types Local reproductibles | Deux générations comparées, hash SHA-256 identique `8FBA623654865589F1ABB6191CC0D0F6A1DC768659A3E6EE91C3A9AB86C935A4` ; aucune édition manuelle |
| Typecheck/build et ESLint ciblé | PASS ; warning Vite existant de bundle >500 kB, hors périmètre |
| Snapshots avant/après | **23 tables complètes** public/private + Auth users, lignes ordonnées/JSONB exact comparées ; identiques. Trois stockages notifications à nouveau vides, aucune fixture résiduelle |
| Version/diff | Package/lock synchronisés sans changement de dépendances ; `git diff --check` PASS |

Concurrences : sync/lecture avec ancienne observation, version plus récente puis observation plus ancienne, application/lecture, lecture puis traitement et ordre inverse, retrait/lecture et retrait/traitement, publication pendant lecture au snapshot, expiration pendant attente de suivi. La barrière advisory du snapshot est **uniquement dans le test**, distincte des verrous de production. Aucun chevauchement simulé présenté comme preuve réelle ; aucune ancienne campagne 8B–8F relancée.

Premiers passages : isolation corrigée pour enlever le second parent **synthétique** volontairement stale d'une ancienne fixture ; comparaison JSON null corrigée dans le test. Typage de filtres QueryClient ajusté et types explicites de traces/états pour ESLint. Remplacements documentaires protégés par assertions puis écrits en UTF-8. Aucun invariant désactivé, donnée personnelle modifiée ou migration historique réécrite pour obtenir les preuves.

## Conservation et arrêt

Snapshots locaux avant/après byte-identiques sur les 23 tables, y compris contenu complet des parents/items/exemplaires, intentions/reçus et catalogue. Deux collections personnelles conservées sans modification automatique ni activation/conversion de contrat. Les annonces publiées dans les preuves sont exclusivement synthétiques, isolées puis nettoyées ; aucune annonce réelle publiée.

Références techniques actualisées dans README, Fonctionnalités, Modèle, Architecture et Database. Roadmap globale déjà **8G en cours**, ordre/périmètre des grandes phases inchangés ; aucune clôture 8G. Retour arrière logiciel futur : fermer consommateurs/révoquer accès par migration additive, conserver états acquis et collections ; aucune contraction ou rollback destructif exécuté.

**8G.3 reste à réaliser** : rôle/fonctions/script de publication, validation stricte de contenu/action/provenance/hash/horodatage et résolution serveur, puis validation globale PostgreSQL/frontend, campagnes générales et navigateur. **8H reste à réaliser** : cloche, panneau, indicateurs et branchements session/contenu/aperçu/application. Aucun email, push, Realtime, Cron, Cloud, Vercel, reset, commit ou push Git. Arrêt strict à 8G.2.
