# Phase 7E.3.1 — Contrats de présentation et identité Carte

Livraison **Local uniquement**, 6 octobre 2026, version **0.7.14**. Contrats recherche globale et Détail Variante enrichis ; aucune correction visuelle. Harmonisation réservée à **7E.3.2**. Aucun accès au projet Cloud, reset, synchronisation catalogue, commit ou push.

## État initial réel

- Branche `dev`, HEAD `8cbaff77187918239eaef9c72037d563ab28f9a8`, commit `v0.7.13` ; branche/HEAD conservés.
- `git status --short` vide, aucun fichier indexé ou changement préalable.
- `package.json` et deux versions racine du lockfile : `0.7.13`.
- CLI installé `2.119.0`. `migration list --local` : **27 fichiers / 27 migrations appliquées**, dernière `20261006085902`.
- Cloud : **23 au dernier checkpoint confirmé par le propriétaire**, jusqu’à `20260928083830` ; état historique, aucune relecture distante.
- AGENTS.md, README, docs 01/04/05/06/08/09, rapports 7E.1/7E.2, migrations 6E.1/7D.1/7E.1 et lecteur canonique, types/services/tests et consommateurs visuels indiqués inspectés. Conventions du générateur et adaptations BIGINT relues.
- Documentation CLI courante consultée via Context7 ; changelog public Supabase lu. Échecs initiaux de télémétrie CLI hors workspace et lecture réseau dans le sandbox résolus par exécution autorisée hors sandbox. Ces lectures publiques ne constituent aucun accès au projet Cloud.

## Migration, ownership et compatibilité

Créée par `supabase migration new phase7e31_presentation_contracts` :

[`20261006120339_phase7e31_presentation_contracts.sql`](../../supabase/migrations/20261006120339_phase7e31_presentation_contracts.sql).

Un `BEGIN`/`COMMIT`, exactement deux `CREATE OR REPLACE FUNCTION`, aucune autre DDL, table, colonne, politique, grant, couleur ou écriture. Prévalidation dans une transaction annulée : images/Pokémon identiques à `get_catalog_card`, ACLs et attributs de sécurité identiques avant/après. Application normale par `migration up --local`, puis historique relu : **28 fichiers / 28 migrations Local**. Cinq migrations Phase 7 locales ; Cloud reste 23 au dernier checkpoint confirmé, sans nouvel accès.

Signatures externes conservées :

```sql
public.search_global_navigation(p_query text) returns jsonb
public.get_variant_detail(p_variant_id bigint) returns jsonb
```

Les writers métier, données persistées et lecteurs Catalogue gardent leur comportement. `get_catalog_card` et toutes les migrations historiques restent inchangés. Les anciens décodeurs stricts de recherche/Détail Variante refusent les nouveaux champs : une future livraison doit coordonner RPC et services, sans annoncer une compatibilité entre versions strictes. Aucun rollout Cloud dans cette étape.

Retour arrière : nouvelle migration restaurant les corps 7E.1/6E.1 avec les services précédents, sans toucher aux données ni retirer les ACLs. Migration transactionnelle et remplacements rejouables ; aucune contraction exécutée.

## Recherche globale : payload avant/après

| Catégorie | Clés exactes avant | Ajouts 7E.3.1 |
|---|---|---|
| Extension | `kind`, `set_id`, `name_fr`, `name_source`, `abbreviation_fr`, `abbreviation` | `logo_url` |
| Carte | `kind`, `source_card_id`, `name_fr`, `local_id`, `set_name_fr`, `set_abbreviation_fr`, `set_abbreviation` | `image_url`, `pokemon` |

Extension : `logo_url = tcg_sets.logo_url`, chaîne ou NULL explicite, aucun fallback SQL. Carte : `image_url` chaîne ou NULL, selon la règle exacte de `get_catalog_card` :

1. image de `source_cards` si non NULL ;
2. première image non NULL d’une Version Catalogue éligible dans `private.canonical_collection_variants('set', set_id)`, tri `automatic_rank` ;
3. NULL si aucune image disponible.

Pas de choix arbitraire de Variante, d’éligibilité différente ou d’appel frontend supplémentaire par suggestion. La projection d’image intervient après la sélection des ≤10 Cartes. Le parcours Pokémon de matching conserve `array_agg(name_fr)` et agrège les lignes de métadonnées dans la même jointure ; JSON construit seulement pour les Cartes retenues. Aucun deuxième parcours indépendant des rattachements pour construire leur payload.

Exemple de structure Pokémon commune, identique au Catalogue Carte :

```json
{
  "pokemon": [
    {
      "pokemon_id": "25",
      "dex_number": 25,
      "name_fr": "Pikachu",
      "primary_type": "electric",
      "secondary_type": null
    }
  ]
}
```

Tous les Pokémon réellement liés à la Carte source, triés par `dex_number` puis ID BIGINT numérique. Sans rattachement : `[]`, y compris Dresseur/Énergie. Noms/types absents : NULL, aucune identité inventée. Les cinq clés sont obligatoires ; types parmi les 18 identifiants existants ; secondaire exige un primaire différent.

Seuil 3–200 caractères Unicode, normalisation, AND, ranking, poids/champs de matching, départages, quotas 2/2/2 puis places Carte restantes, catégories/ordre et maximum 10 conservés. Noms Pokémon déjà recherchés inchangés ; nouveaux IDs/types, images et logos ne participent pas au matching/ranking. Aucun `variant_id`, score, total, série ou couleur ajouté.

## Détail Variante

**20 → 23 clés**, sans supprimer ni changer la signification d’une clé historique :

```text
variant_id, source_card_id, set_id, pokemon, image_url,
card_name_fr, local_id, rarity, category,
set_name_fr, set_name_source, set_abbreviation_fr, set_abbreviation,
series_name_fr, series_name_source,
variant_label, variant_type, variant_subtype, variant_size, variant_foil, variant_stamps,
effective_release_date, date_origin
```

`source_card_id = source_cards.id::text`, `set_id = tcg_sets.id::text`, Pokémon issus des relations réelles de cette Carte source, même structure/ordre que ci-dessus. Image Variante puis Carte conservée, distincte de l’image représentative de recherche. Stamps conservés dans leur ordre stocké, avec répétitions. Date/provenance persistées, aucun recalcul. Variantes historiques/inactives/source absente/FR unknown ou unavailable toujours lisibles selon RLS existante. Aucune possession ni donnée personnelle.

## Sécurité et types frontend

Deux RPC toujours `STABLE`, `SECURITY INVOKER`, `search_path = ''`. ACLs conservées par `CREATE OR REPLACE`, vérifiées avant/après et par pgTAP : EXECUTE non-owner uniquement `authenticated`, jamais PUBLIC/anon/service_role. Auth, MFA `aal2`, profil et RLS Catalogue/Collections conservés. Aucun SECURITY DEFINER ni accès général privé ajouté ; permissions canoniques 7D.1 réutilisées. Les métadonnées nouvelles sont déjà lisibles par les lecteurs Catalogue authentifiés.

- `src/types/global-search.ts` : Extension `logoUrl: string | null` ; Carte `imageUrl: string | null`, `pokemon: CatalogPokemonMetadata[]`.
- `src/types/variant-detail.ts` : `sourceCardId: string`, `setId: string`, `pokemon: CatalogPokemonMetadata[]`.
- Services recherche et Détail Variante : mapping strict, clés exactes/obligatoires, erreurs existantes assainies ; Détail valide exactement 23 clés.
- Nouveau `src/services/catalog-pokemon.ts` : schéma Zod strict et validation d’unicité Pokémon partagés par Catalogue, recherche et Détail Variante. `catalog.ts` réutilise ce schéma, sans changer sa RPC/payload.
- Rejet des BIGINT numériques/non canoniques/hors plage, types inconnus, secondaire orphelin ou identique au primaire, Pokémon dupliqués, champ supplémentaire/absent, objet mal formé. Ordre reçu conservé.
- Types générés deux fois par `npm run db:types` depuis Local : **aucun diff de contenu** dans `database.generated.ts`, attendu car deux signatures JSONB inchangées. Aucun overlay nouveau ; adaptations existantes des arguments BIGINT conservées.
- Quatre fixtures de tests UI complétées uniquement pour satisfaire les nouveaux types ; aucune assertion ou implémentation visuelle changée.

## Performance Local

Catalogue réel inchangé : **19 907 Cartes sources, 31 904 Variantes, 19 907 Cartes éligibles**. Script `node scripts/test-global-search.js`, viewer/profil temporaire, rôle authenticated/aal2, trois `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` par recherche, fixtures et viewer annulés. Mesures serveur, hors réseau et charge concurrente ; aucune preuve de latence UI ou Cloud.

| Recherche | Baseline 7E.1 actuelle (ms, 3 passages) | Après 7E.3.1 (ms, 3 passages) |
|---|---|---|
| Pikachu | 529.272 / 493.816 / 514.474 | 504.267 / 525.659 / 538.612 |
| Légendes | 533.311 / 526.738 / 549.182 | 579.796 / 581.837 / 617.648 |
| 028 | 250.467 / 259.772 / 249.742 | 264.536 / 258.922 / 251.314 |
| 28/73 | 198.415 / 191.813 / 180.130 | 196.937 / 190.851 / 195.113 |
| Carte | 462.188 / 498.721 / 461.056 | 521.108 / 535.033 / 500.038 |
| Pikachu SLG | 476.755 / 485.350 / 506.822 | 500.946 / 525.745 / 477.643 |
| AbsentUnique7e1 | 468.600 / 489.335 / 531.737 | 467.048 / 478.063 / 488.067 |

Comparaison complémentaire alternée avant/après, même session/transaction annulée, trois passages par version : anciennes clés et ordre strictement égaux après retrait des seuls champs ajoutés. Corps 7E.1 temporairement restauré, puis corps courant ; rollback final restaure automatiquement le schéma appliqué.

| Recherche | Avant alterné (ms) | Après alterné (ms) | Médianes avant → après |
|---|---|---|---|
| Pikachu | 535.119 / 538.159 / 515.147 | 565.235 / 522.872 / 545.542 | 535.119 → 545.542 (+1.9 %) |
| Légendes | 626.304 / 517.746 / 518.555 | 580.349 / 544.951 / 562.229 | 518.555 → 562.229 (+8.4 %) |
| 28/73 | 184.012 / 230.114 / 185.219 | 189.306 / 189.215 / 205.595 | 185.219 → 189.306 (+2.2 %) |
| Pikachu SLG | 515.805 / 459.506 / 487.101 | 537.060 / 512.108 / 498.199 | 487.101 → 512.108 (+5.1 %) |
| AbsentUnique7e1 | 495.604 / 460.733 / 486.382 | 578.173 / 523.033 / 488.825 | 486.382 → 523.033 (+7.5 %) |

Un échantillon alterné Légendes mal encodé lors du transfert PowerShell a été écarté, puis rejoué avec Unicode vérifié ; seules les valeurs corrigées figurent ci-dessus. Surcoût modéré et variabilité Local, aucune régression majeure observée. Pas de SLA nouveau, pg_trgm, GIN, full-text, cache persistant ou projection stockée. Latence texte reste de l’ordre de la demi-seconde ; cette limite actuelle n’est pas présentée comme une mesure UI.

## Validation exécutée

| Contrôle | Résultat |
|---|---|
| Prévalidation SQL transactionnelle | PASS : deux RPC, ACLs/attributs identiques, alignement image/Pokémon Catalogue |
| DB ciblés `018_variant_detail` + `022_global_search` | **2 fichiers / 290 assertions PASS** |
| Services `global-search`, `variant-detail`, `catalog` | **3 fichiers / 267 tests PASS** |
| Script parité/performance | **26 recherches / 98 lecteurs Carte, images et Pokémon PASS** ; rollback |
| `npm run db:test` | **22 fichiers / 1 430 assertions PASS** ; 1 213 cibles canoniques, 0 divergence |
| `npm run db:lint` | PASS, public/private, aucun warning/erreur |
| `npm run db:types` | PASS, génération réelle Local, aucune dérive de contenu |
| `npm test` final | **60 fichiers / 1 783 tests PASS**, suite globale exécutée seule |
| `npm run build` final en 0.7.14 | PASS, TypeScript + Vite, 372 modules |
| `npm run lint` final | PASS, zéro warning/erreur ESLint |
| `git diff --check` | PASS ; whitespace également vérifié sur les trois fichiers nouveaux |
| Audit documentaire et de périmètre | PASS, 291 destinations Markdown locales existantes ; migration unique, historiques/UI/CSS/routes/hooks/identité intacts |

Build conserve l’avertissement Vite non bloquant du chunk principal **750.80 kB** minifié (>500 kB), déjà présent avant cette étape ; découpage hors périmètre. Aucun contrôle requis en échec.

Les assertions historiques critiques 7E.1 restent actives : matching, ranking, quotas, IDs, catégories, unicité Carte source, exclusions et sécurité. Tests nouveaux : logo exact/NULL/non matching ; images source/canonique/NULL et exclusion Version inéligible ; Pokémon complets/vides/ordonnés avec types et BIGINT texte ; Détail exact 23 clés, IDs > MAX_SAFE_INTEGER, métadonnées et caractéristiques historiques conservées, grants et RLS inchangés.

Les tests TypeScript couvrent nouveaux champs, images/logo NULL, Pokémon vide/multiple et types simples/doubles/manquants, les 18 types, BIGINT sûrs en chaînes et limites signées, objets/clés stricts et erreurs autorisation/transport assainies. Aucun test d’utilisation visuelle nouvelle requis ou exécuté.

## Fichiers et périmètre final

Créés : migration 7E.3.1, `src/services/catalog-pokemon.ts`, ce rapport.

Modifiés : types/services/tests global-search et variant-detail ; `src/services/catalog.ts` pour le schéma commun ; fixtures typées `GlobalSearch.test.tsx`, `VariantDetailPanel.test.tsx`, `CollectionContentBinder.test.tsx`, `CollectionContentList.test.tsx` ; tests DB 018/022 et `global_search.fixtures.inc` ; `scripts/test-global-search.js` ; package.json/lockfile ; README et docs 01/04/05/06/08/09.

Version modifiée par `npm version 0.7.14 --no-git-tag-version`, sans changement de dépendance. Footer garde sa source automatique. `catalog-identity.ts`, composants visuels, CSS, routes, hooks et `get_catalog_card` inchangés ; migrations historiques intactes. Aucun fichier temporaire créé pour la livraison ; includes du runner supprimés après tests. Aucun commit/push.

Git final : **dev**, HEAD initial inchangé, **24 fichiers suivis modifiés + 3 nouveaux fichiers non suivis, 0 indexé**. Types générés sans diff de contenu. Les trois fichiers nouveaux sont exactement migration, schéma Pokémon commun et rapport. Toutes les modifications appartiennent à 7E.3.1 ; version package/lockfile **0.7.14**.

## Réservé à 7E.3.2

Identité Carte validée : un Pokémon avec métadonnées suffisantes → identité complète principal + secondaire éventuel ; plusieurs Pokémon avec exactement le même couple → identité complète commune ; sinon exactement un type exploitable commun à tous → identité simple ; sinon métadonnées insuffisantes/ambiguës ou zéro Pokémon → fallback Carte. Ne jamais prendre arbitrairement le premier Pokémon. Fallback fixe distinct du teal Extension, rouge MY. et indigo Partagé ; teinte et `resolveCardIdentity` à réaliser frontend en 7E.3.2, avec la palette commune.

Restent en 7E.3.2 : liens sans soulignement permanent/hover, nouvelle identité Carte, miniatures Carte/logos Extension et gestion absence/échec, layout dropdown, vues Cartes Catalogue harmonisées avec Collection, `Pokémon associés` → `Pokémon`, structure/liens/CSS du Détail Variante alignés sur la fiche Carte avec ses caractéristiques propres. **L’interface n’applique encore aucun de ces changements à la fin de 7E.3.1.**
