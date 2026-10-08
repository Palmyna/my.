# Phase 7E.1 — Contrat serveur de recherche globale

Livraison locale du 6 octobre 2026, version **0.7.12**. Contrat DB autoritatif, service TypeScript et validations livrés. Header toujours visuel ; dropdown et interactions non livrés.

## État initial et inspection

- Branche **dev**, HEAD réel **e94be8bcfddb7cf360d7d782c813086558256cba — DOC checkpoint**.
- Worktree propre : `git status --short` vide. HEAD et branche conservés à la fin ; aucun commit/push.
- `package.json`, racine du lockfile et package racine du lockfile : **0.7.11** initialement.
- **26 fichiers de migration**, tous confirmés appliqués par `migration list --local`, jusqu’à `20261005181925`. La colonne `Remote` de cette commande désigne la DB Local, pas Cloud.
- Instructions `AGENTS.md`, README, sections pertinentes Fonctionnalités/UX/Architecture/Database/Roadmap et [checkpoint documentaire précédent](2026-10-06-PHASE7-DOC-CHECKPOINT.md) inspectés avant conception. Checkpoint conservé comme historique.
- Moteur portable `search-catalog.ts`, trois migrations recherche 6C.2, socle Catalogue 7D.1, identité 7D.5, services/types Catalogue/Collections, tests pgTAP/services, header et générateur de types inspectés.
- Conventions retenues : client Supabase commun, factory de service testable, Zod strict, mapping camelCase, BIGINT décimal canonique signé dans les bornes PostgreSQL via `variantIdString`, erreurs métier assainies, fixtures transactionnelles et IDs explicites.
- CLI installée **2.119.0**, aide locale et documentation Context7 consultées. Changelog public Supabase lu ; aucun changement annoncé applicable aux fonctions/helpers utilisés. Ce téléchargement documentaire n’est pas un accès au projet Cloud.

## Migration et compatibilité

Migration créée par CLI : [`20261006085902_phase7e1_global_search.sql`](../../supabase/migrations/20261006085902_phase7e1_global_search.sql). Un seul `BEGIN`/`COMMIT`, deux nouvelles fonctions, aucun changement de table/donnée. Corps stabilisé et testé dans des transactions annulées avant application par `migration up --local` ; seul ce fichier était en attente. Historique relu ensuite : **27 fichiers / 27 appliqués en Local**.

Ajout compatible avec anciens lecteurs, écrivains, pipeline et RPC d’ajout. Aucune contraction, modification de migration historique ou reset. Retour arrière documenté, non exécuté : retirer consommateurs, puis nouvelle migration supprimant RPC/helper nominal et révoquant uniquement les nouveaux EXECUTE normalize/score ; conserver grants/policy 7D.1 et données. Un échec d’application annule atomiquement les changements ; historique CLI rend application/réessai observable.

## Contrat public et sécurité

```sql
public.search_global_navigation(p_query text) returns jsonb
```

JSONB **scalaire contenant directement un tableau ordonné** de 0 à 10 suggestions. Position autoritative. Aucun score, total, pagination, Variante, `variant_id`, série/bloc ou couleur.

- **STABLE, SECURITY INVOKER, `search_path = ''`**.
- EXECUTE uniquement **authenticated**, hors propriétaire PostgreSQL. PUBLIC, anon et service_role fermés.
- Identité `auth.uid()`, niveau `aal2`, profil requis ; refus explicite `42501 / global_search_not_authorized`.
- Requête brute de **3 à 200 caractères Unicode** (`char_length`), puis normalisation/tokenisation existante, termes utiles uniques conservant leur ordre. Refus `22023 / global_search_invalid_query` ; absence de résultat valide = `[]`.
- RLS catalogue, MFA/profil et visibilité Collections naturellement appliquées par invoker. Aucune collection inaccessible découverte par son nom ; révocation de partage immédiatement effective.
- Réutilisation inchangée de USAGE private, SELECT sur seulement `(entity_key, source_card_id)` et policy `catalog_card_keys_read` introduits en 7D.1. Aucune nouvelle permission de table/écriture.
- Nouveaux EXECUTE authenticated strictement limités à RPC et trois helpers purs privés : `catalog_search_normalize(text)`, `catalog_search_score(text[],integer[],text,integer,text[])`, `navigation_name_score(text,text[])`. Aucun accès aux données dans ces helpers, aucune version publique ; `private` absent des schémas exposés dans la configuration API locale.

## Catégories et payload final

| Ordre | Catégorie / maximum | Matching et candidats |
|---|---|---|
| 1 | Pokémon / 2 | Nom français seul, sans Pokédex ; au moins une Carte/Version Catalogue éligible réellement liée |
| 2 | Extension / 2 | Nom FR seul, fallback nom source si FR absent/vide ; sans abréviation, série ou contenu ; Extension consultable |
| 3 | Collection / 2 | Nom seul ; toutes les personnelles et partagées actuellement visibles via `dashboard_collections` SECURITY INVOKER |
| 4 | Carte / places restantes jusqu’à 10 | Carte source unique ; plusieurs Variantes/relations Pokémon ne multiplient pas les résultats |

Une Carte est éligible si Carte/Extension actives et au moins une Version active, française `confirmed`, taille `standard`. Conditions identiques au lecteur canonique Catalogue 7D.1 ; activité Pokémon/série, origine et présence source ne deviennent pas de filtres supplémentaires. Aucun appel coûteux aux lecteurs complets pour constituer les suggestions.

Champs JSON exacts :

```text
pokemon: kind, pokemon_id, name_fr, dex_number, primary_type, secondary_type
set: kind, set_id, name_fr, name_source, abbreviation_fr, abbreviation
collection: kind, collection_id, name, access, collection_type, target_type,
            target_name, target_primary_type, target_secondary_type
card: kind, source_card_id, name_fr, local_id, set_name_fr,
      set_abbreviation_fr, set_abbreviation
```

BIGINT toujours **chaînes décimales**, y compris au-delà de `Number.MAX_SAFE_INTEGER`. Collection ID UUID. Champs texte catalogue/types absents explicitement NULL, comme les lecteurs existants. `dex_number` entier positif. `access=owned|shared`, `collection_type=free|automatic`, `target_type=pokemon|set|NULL`. Types Pokémon fermés aux 18 identifiants existants, secondaire distinct et primaire requis si secondaire présent.

Identité Collection directement réutilisée, sans requête future additionnelle : shared → free → automatic set → automatic pokemon → fallback. Projection des compteurs inutilisés écartée par PostgreSQL : EXPLAIN de la projection d’identité ne contient ni `collection_items` ni `physical_copies`.

## Ranking et moteur Carte

Normalisation/tokenisation SQL **réutilisée**, sans nouvelle logique frontend : NFKD, casse, accents français, `œ/æ`, apostrophes/tirets, espaces, ponctuation technique utile (`. : / - ♀ ♂`), termes uniques ordonnés et AND multi-termes.

Catégories nominales : helper pur minimal sur leur seul nom normalisé. Exact **120**, mot **60**, préfixe **40**, partiel **15**, somme des termes et bonus de phrase exacte **120**. Numérique traité comme texte normal, notamment nom Extension `151`. Tri score décroissant → nom normalisé collation C → identifiant stable. Quotas limités avant orchestration ; 2/2/2 laisse 4 Cartes, 1/0/1 laisse 8, aucune catégorie nominale laisse 10.

Carte : appel inchangé à `private.catalog_search_score`, mêmes champs et poids 6C.2 : nom Carte 120, Pokémon liés 110, numéro 100, Extension 90, abréviations 85, identifiants 80 ; mot 60/préfixe 40/partiel 15, meilleur match par terme, somme et bonus exact. Numérique : exact simple 200, préfixé/suffixé 160, préfixe numérique 80 ; fractions exigent total officiel, zéros initiaux ignorés. Champs différents peuvent satisfaire différents termes. Aucun nom de série ni label Variante ajouté.

Départage Carte : score décroissant, nom Carte normalisé, nom Extension normalisé, local_id normalisé, identifiant TCGdex/sélecteur, ID source en texte, comparaisons C. Présélection 6C.2 par condition nécessaire numérique/textuelle conservée ; filtre numérique déplacé avant jointures des Pokémon/identités, puis concaténation normalisée et normalisation/scoring détaillés des seuls candidats. Aucun second scoring Carte, extraction frontend ou import du moteur maintenance dans React.

Parité SQL/moteur portable prouvée sur **26 requêtes synthétiques**, ranking final des Cartes après quota nominal ; **98 appels réels `get_catalog_card`** vérifient que les suggestions conduisent vers des Versions consultables. Limites Unicode déjà documentées en 6C.2 conservées : retrait SQL des cinq blocs usuels de marques, classes Unicode PostgreSQL et ordre C UTF-8 pouvant différer de JS hors BMP ; aucun écart français constaté.

## Service TypeScript

[`src/types/global-search.ts`](../../src/types/global-search.ts) définit l’union discriminée `pokemon|set|collection|card`, réutilisant les identités Catalogue et Collection. [`searchGlobalNavigation`](../../src/services/global-search.ts) appelle seulement la nouvelle RPC avec `{ p_query: query }`, sans interpolation, recherche/retri local, chargement complet, `pg` ou adaptateur maintenance.

Zod strict : clés exactes et requises, primitives/nullabilité, BIGINT canonique, types Pokémon, cohérence Collection, catégories ordonnées, maximum 10, quotas 2/2/2, absence de doublons par catégorie/identité. Résultat conservé dans l’ordre serveur et mappé camelCase. Frontend valide type/longueur Unicode ; normalisation et termes utiles restent au serveur.

Erreur dédiée `GlobalSearchError` : `invalid_query|not_authorized|unexpected`. Codes autorisation connus `42501/PGRST301/PGRST302/PGRST303` ; validation seulement sur `22023` et message exact `global_search_invalid_query`. Autres erreurs et rejets transport assainis, aucun parsing libre de message PostgreSQL.

## Mesures de performance

Catalogue Local réel : **19 907 Cartes sources**, **31 904 Variantes**, **19 907 Cartes disposant d’au moins une Version éligible**. Mesures sans fixtures catalogue, avec un seul viewer/profil temporaire en transaction annulée. Rôle authenticated / aal2. Trois passages de `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT public.search_global_navigation($1)`, hors réseau et charge concurrente. Reproductible par `node scripts/test-global-search.js`.

| Requête représentative | Passages finaux (ms) |
|---|---|
| Pokémon `Pikachu` | 517.911 / 556.982 / 533.817 |
| Extension `Légendes` | 602.479 / 532.387 / 568.457 |
| Numéro `028` | 248.449 / 254.853 / 332.697 |
| Fraction `28/73` | 205.047 / 184.233 / 183.474 |
| Terme fréquent `Carte` | 576.392 / 493.892 / 497.606 |
| Multi-termes `Pikachu SLG` | 461.138 / 545.451 / 460.211 |
| Sans résultat `AbsentUnique7e1` | 560.517 / 457.634 / 551.654 |

Avant déplacement du filtre numérique/projection Carte réduite : `028` **448.972 / 499.484 / 447.961 ms**, fraction **389.440 / 394.362 / 360.677 ms** ; nom Pokémon **611.757 / 528.911 / 564.095 ms**. Mesure intermédiaire après optimisation : `028` **252.063 / 257.110 / 255.987 ms**, fraction **216.384 / 204.620 / 196.752 ms**. Gain numérique d’environ moitié, sans changement de règles. Texte reste linéaire, environ 0.46–0.60 s sur ces passages. Aucun SLA inventé ; mesures Local, pas Cloud ni dropdown live. Aucune structure persistante, extension `pg_trgm`, index GIN, full-text ou moteur externe ajouté.

## Validation exécutée

| Vérification | Résultat |
|---|---|
| Prévalidation SQL avant application, transactions annulées | 135 assertions initiales PASS, puis corps optimisé PASS |
| `npm run db:test -- supabase/tests/database/022_global_search.test.sql` final | **138 assertions PASS** |
| `npm test -- src/services/global-search.test.ts` | **38 tests PASS** |
| `node scripts/test-global-search.js` | **26 parités / 98 lecteurs Carte PASS**, mesures ci-dessus, rollback des fixtures |
| `npm run db:test` | **22 fichiers / 1 319 assertions PASS**, y compris ancien contrat 6C.2 et parité canonique 1 213 cibles / 0 divergence |
| `npm run db:lint` | **PASS**, public/private, aucun warning/erreur schéma |
| `npm run db:types` | **PASS**, généré depuis Local, aucune dérive inattendue |
| `npm run build` | **PASS**, TypeScript + Vite |
| `npm run lint` | **PASS**, zéro warning ESLint |
| `npm test`, dernier passage complet | **59 fichiers / 1 713 tests PASS** |
| `git diff --check` | **PASS** |
| Contrôle documentaire/fichiers final | **266 destinations Markdown locales vérifiées**, aucune cible manquante ; whitespace des 18 fichiers, y compris nouveaux, PASS |
| Nettoyage transactionnel final | **0 résidu** utilisateurs, collections, Cartes, Extensions ou Pokémon des fixtures 7E.1 |

Premier passage Vitest simultané aux validations DB/build/lint : **1 712 PASS / 1 échec** de focus dans `AccountDeletion.test.tsx`, cas `authorized_account_required`. Test existant attend le texte avant de vérifier immédiatement le focus posé par effet React. Aucun fichier compte/UI modifié ; suite isolée **18/18 PASS**, puis suite globale relancée seule **1 713/1 713 PASS**. Échec initial consigné, sans le présenter comme PASS ni étendre 7E.1 à ce parcours.

Build : avertissement non bloquant du chunk principal **740.65 kB** après minification. Nouveau service non branché à l’application ; aucun moteur maintenance ajouté au bundle. Aucun test UI de dropdown ni parcours navigateur demandé/exécuté.

Types générés : seul ajout `search_global_navigation: { Args: { p_query: string }; Returns: Json }`. Deux générations identiques, SHA256 **FFCC3EF544EF18FF726E0C41880403DC4DAB253695CA37E67D00FA6EBF9B3151**. Aucun overlay manuel. Version package/lockfile modifiée par `npm version 0.7.12 --no-git-tag-version` ; footer garde sa source automatique.

## Fichiers et état final

Créés : migration 7E.1 ; `supabase/tests/database/022_global_search.test.sql` et `global_search.fixtures.inc` ; `src/types/global-search.ts` ; `src/services/global-search.ts` et test ; `scripts/test-global-search.js` ; ce rapport.

Modifiés : `src/types/database.generated.ts`, test historique `017_catalog_search.test.sql` (seuls grants des helpers purs maintenant nécessaires à invoker), `package.json`, `package-lock.json`, README et références Fonctionnalités/UX/Architecture/Database/Roadmap. Aucun fichier header, route, hook, page, couleur ou donnée métier modifié. Scratch de validation dans `.cache/`, ignoré par Git.

Git final confirmé : **10 fichiers modifiés non indexés + 8 nouveaux fichiers non suivis**, branche dev et HEAD initial inchangés. Aucun commit, push, reset, synchronisation catalogue ou commande projet Cloud.

Migrations : **27 Local**, réellement relues ; **23 Cloud au dernier checkpoint confirmé par le propriétaire**, jusqu’à `20260928083830`, sans nouvel accès distant. Quatre migrations Phase 7 restent locales uniquement. Ne pas interpréter l’affichage fichiers/historique Local 27/27 comme un état Cloud.

## Reste avant intégration UI

7E.1 est limité au contrat et service. Restent en 7E.2 : dropdown, debounce, hook/cycle de requêtes, contrôle des réponses obsolètes, navigation explicite, états chargement/vide/erreur, identité visuelle et interactions clavier/mobile. `AuthenticatedHeader.tsx` reste inchangé et son test historique visuel reste valide. Aucun blocage de contrat identifié ; performance live réelle et réseau restent à observer lors du consommateur UI, sans SLA ajouté.
