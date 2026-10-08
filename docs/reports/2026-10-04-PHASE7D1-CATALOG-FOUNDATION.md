# Phase 7D.1 — Socle Catalogue + types Pokémon

Livraison locale du 4 octobre 2026, version **0.7.7**. Backend, référentiel et domaine frontend livrés. Aucune page Catalogue Pokémon/Extension/Carte, route, vue Liste/Cartes ni hook React Query dédié.

## État initial et final du dépôt

- Branche initiale et finale : `dev`.
- HEAD initial et final : `8f9ec1c66228b6dc01245010f4974eb0b0c5a631` — `v0.7.6`.
- Working tree initial propre ; final modifié, fichiers nouveaux non suivis, aucun staging.
- Versions initiales `package.json` / `package-lock.json` : `0.7.6` ; finales : `0.7.7`. Injection Vite/footer conservée.
- Historique initial : 24 migrations présentes et appliquées localement ; final : **25/25 concordantes**.
- Inspection préalable : instructions, architecture, modèle SQL/RLS/MFA/profil, pipeline Pokémon/Catalogue, calcul canonique, RPC Détail Variante, services/décodeurs, composants et tests concernés. Documentation Supabase, PokéAPI et Zod consultée via Context7.

## Migration et contrats backend

Migration créée via la CLI puis appliquée **uniquement localement** : [`20261004161759_phase7d1_catalog_foundation.sql`](../../supabase/migrations/20261004161759_phase7d1_catalog_foundation.sql).

`public.pokemon.primary_type` et `secondary_type` : TEXT nullables ; CHECK des 18 identifiants autorisés, secondaire interdit sans primaire, types distincts. Aucune couleur en DB.

RPC ajoutées : `get_catalog_pokemon(bigint)`, `get_catalog_set(bigint)`, `get_catalog_card(bigint)`. JSONB, STABLE, SECURITY INVOKER, `SET search_path = ''`, EXECUTE authentifié explicite. IDs BIGINT sérialisés en chaînes ; aucune donnée personnelle. Cible inexistante, invisible ou sans variante éligible : SQL NULL.

Les trois lecteurs réutilisent **`private.canonical_collection_variants`**, sans modifier son corps : même univers et même ordre que les nouvelles collections automatiques. Disponibilité FR confirmée, variante standard active, carte et Extension actives. Images individuelles : fallback variante/carte ; image représentative Carte : carte puis première variante éligible canonique avec image.

Permissions minimales ajoutées pour cette réutilisation INVOKER : USAGE du schéma privé non exposé par l'API, EXECUTE des deux helpers, SELECT limité aux colonnes de clés de cartes. Nouvelle policy limitée aux cartes visibles sous RLS existante ; alias de variantes, audits/corrections et écritures restent fermés. MFA/profil respectés, aucune élévation de privilège. Payloads détaillés dans les [contrats Catalogue](../09-CATALOG-CONTRACTS.md).

## Référentiel Pokémon et synchronisation contrôlée

[`pokemon-reference.json`](../../data/pokemon/pokemon-reference.json) remplace `pokemon-fr.json` : `dex_number → { name_fr, types }`. La commande manuelle `pokemon:update` conserve les noms via `pokemon-species`, suit exactement l'unique variété `is_default`, vérifie ses ressources/IDs et ordonne les types par slot.

Validation stricte : 1 ou 2 types distincts autorisés, nom FR obligatoire, défaut unique, ressources cohérentes. URLs contrôlées, redirections refusées, timeouts/retries/concurrence bornés, attente des requêtes en cours et publication atomique conservés. Échec : ancien fichier intact. Pipeline et frontend ne contactent jamais PokéAPI ; génération indépendante de PostgreSQL.

Résultat : **1 025 espèces/noms/types principaux**, **499 mono-types**, **526 doubles types**, **18 types représentés**, **1 551 affectations de types**. Aucun nom ou type manquant, aucune nouvelle anomalie Pokémon. Deux générations réelles produisent les mêmes octets ; validation, sérialisation et hash indépendants de la mise en page vérifiés.

Hash canonique SHA-256, couvrant nom et types ordonnés :

```text
b4370983bd398b23863001bbe5ad76f49f54c7d8c7afe0786d6c9683f38d7268
```

Le dernier import local réussi a fourni le snapshot TCGdex **`1c30c50253756bafecf0f065fc377f77016ad12f`**, explicitement réutilisé pour le dry-run et l'application. Aucun passage à un snapshot plus récent.

Diff examiné puis appliqué : **uniquement 1 025 lignes de métadonnées Pokémon modifiées**. Aucune création/suppression Catalogue ; 18 séries, 188 Extensions, 19 907 cartes, 31 904 variantes et 16 820 rattachements conservés. **1 213 cibles automatiques inchangées**, ordres, hashes structurels et `generation_version` compris. Audit final : toutes les autres lignes Catalogue et toutes les lignes utilisateur identiques à la baseline.

Diagnostics TCGdex préexistants conservés : 9 chemins d'Extension incohérents, 9 variantes source répétées, 32 numéros atypiques, 2 Extensions françaises vides, 4 noms FR d'Extension absents. Aucun de ces diagnostics n'a été corrigé dans cette étape.

Preuves locales ignorées par Git : `.cache/catalog-reports/2026-10-04T16-41-12-902Z-dry-run.json`, `.cache/catalog-reports/2026-10-04T16-47-54-347Z-apply.json`, `.cache/phase7d1-baseline.json` et `.cache/phase7d1-audit.mjs`.

## Socle frontend et factorisations

- [`src/types/catalog.ts`](../../src/types/catalog.ts) et [`src/services/catalog.ts`](../../src/services/catalog.ts) : trois contrats/services, décodage Zod strict sans cast de payload, IDs string, dates/types/nullabilité/identités/compteurs/unicité validés. Erreurs stables `catalog_unavailable`, `not_authorized`, `unexpected`.
- [`src/lib/format-fr-source.ts`](../../src/lib/format-fr-source.ts) : helper unique FR/source, repris par `CompactVariantSummary` et `VariantDetailPanel`, comportement visuel préservé. Valeurs différentes → `FR (source)` ; identiques → une valeur ; aucune → null.
- [`src/types/pokemon.ts`](../../src/types/pokemon.ts) : type fermé et libellés français des 18 types. [`src/lib/catalog-identity.ts`](../../src/lib/catalog-identity.ts) : palette MY. profonde, tonalités claires/sombres, gradient mono-type ou double-type, accents principal/secondaire, identité neutre ardoise/bleu-gris. Tokens non appliqués aux pages ou Collections.
- [`src/types/database.generated.ts`](../../src/types/database.generated.ts) : régénéré depuis le schéma local, sans édition manuelle.
- Tests dédiés des services, du helper et du resolver ; [`020_catalog_detail.test.sql`](../../supabase/tests/database/020_catalog_detail.test.sql) et [`pokemon-metadata-integration.ts`](../../scripts/catalog/pokemon-metadata-integration.ts) pour les preuves DB et pipeline.

Documentation impactée alignée : README, référentiel Pokémon, TCGdex, modèle, architecture, base, synchronisation, roadmap et nouveaux contrats. Rapport historique Phase 2 annoté comme archive ; mesures historiques conservées.

## Validations exécutées

| Contrôle | Résultat final |
|---|---|
| `npm test -- --maxWorkers=4` | PASS — 53 fichiers / 1 458 tests |
| Projet Catalogue ciblé | PASS — 5 fichiers / 186 tests, inclus dans la suite globale |
| Régressions services/helper/Détail Variante ciblées | PASS — 102 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS ; avertissement non bloquant de taille du bundle, 691,33 kB |
| `npm run db:test` | PASS — 20 fichiers / 1 166 assertions |
| Nouvelles RPC pgTAP | PASS — 94 assertions, incluses dans la suite DB ; payloads, ordres, éligibilité, images, BIGINT, droits, MFA/profil et indisponibilité |
| Parité Catalogue/canonique réelle | PASS — 1 213 cibles, aucune divergence |
| `npm run db:lint` | PASS — aucune erreur de schéma |
| `npm run db:types` | PASS — deux générations locales ; nouvelles colonnes et RPC présentes |
| Historique des migrations local | PASS — 25/25 concordantes |
| Génération/validation/reproductibilité du référentiel | PASS — deux générations réelles identiques ; hash canonique indépendant de la présentation |
| Dry-run puis synchronisation locale au SHA conservé | PASS — uniquement les métadonnées de 1 025 Pokémon |
| `npm run catalog:test:pokemon:db` | PASS — changement de type seul sur DB peuplée, application transactionnelle, retry sans diff, rollback intégral |
| Invariance du test de type seul | PASS — relations, variantes, ordres, structures, hashes, versions, séquences et données utilisateur inchangés |
| Audit final contre baseline | PASS — toutes les lignes Catalogue hors Pokémon et données utilisateur identiques |
| Versions package/lockfile et `git diff --check` | PASS |

Le test historique `catalog:test:db` exige une base vide/reset : **non exécuté sur la base locale peuplée**. Aucun reset effectué. Le nouveau test d'intégration transactionnel couvre précisément l'invariance des métadonnées Pokémon demandée ici. Aucune preuve navigateur ou HTTP/TOTP de bout en bout revendiquée.

Incident d'application initial corrigé : bloc SQL accidentellement dupliqué, première exécution sans inscription d'historique. Après vérification de zéro donnée de type, seuls les ajouts 7D.1 ont été retirés, le fichier dédupliqué puis appliqué proprement. Historique final enregistré ; aucune migration historique modifiée. Blocages de télémétrie CLI hors sandbox résolus par exécution autorisée des commandes locales.

## Limites et suite

**Aucune opération Supabase Cloud, aucun commit, aucun push, aucun reset.** Branche/HEAD inchangés, changements non indexés.

7D.1 s'arrête au socle. Pages Pokémon/Extension/Carte, routes, vues Liste/Cartes et hooks dédiés restent à implémenter en 7D.2 et étapes suivantes. Le test d'import sur base vide reste à exécuter dans un environnement isolé prévu pour ce scénario ; aucune suppression des données locales n'est nécessaire à cette livraison. Optimisation du bundle hors périmètre.
