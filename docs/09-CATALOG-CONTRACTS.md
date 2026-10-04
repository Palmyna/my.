# Socle Catalogue authentifié — Phase 7D.1

Version `0.7.7`. Contrats de lecture livrés localement ; aucune page Pokémon/Extension/Carte, route, renderer Liste/Cartes ni hook React Query dédié. Le panneau Détail Variante garde son contrat détaillé historique.

## Règles communes

`get_catalog_pokemon(p_pokemon_id bigint)`, `get_catalog_set(p_set_id bigint)`, `get_catalog_card(p_card_id bigint)` : scalaire JSONB, STABLE, lecture seule, SECURITY INVOKER, `SET search_path = ''`. EXECUTE réservé à `authenticated`, révoqué de PUBLIC/anon/service_role ; RLS MFA/profil existantes autoritatives. Aucune possession, exemplaire, progression, collection ou partage.

IDs BIGINT JSON : **chaînes décimales** ; `dex_number` et `variant_count` : nombres. Métadonnées absentes : JSON null. Cible NULL, inexistante, RLS invisible ou sans variante éligible : **SQL NULL**, même indisponibilité observable.

Contenu actuel via **le même** `private.canonical_collection_variants` que la création automatique : variante active, FR `confirmed`, taille `standard`, carte et Extension actives. Présence upstream, catégorie, activité Pokémon/série ne sont pas des filtres supplémentaires dans le calcul existant. Les rattachements effectifs ne multiplient pas les variantes ; cartes/variantes MY. actives restent éligibles sans présence upstream.

Pokémon : date effective croissante, NULL dernier, rang naturel de carte puis variante. Extension : rang naturel puis variante. Départages UTF-16 existants conservés. Image d'entrée : `COALESCE(variante.image_url, carte.image_url)`.

Réutilisation INVOKER : USAGE du schéma privé non exposé à PostgREST, EXECUTE des deux helpers canoniques, SELECT **uniquement** sur `catalog_entity_keys.entity_key/source_card_id`. Policy : alias de cartes visibles via RLS `source_cards`, donc MFA/profil requis. Alias de variantes/colonne `variant_id`, journaux et corrections fermés ; aucun grant d'écriture ou accès général aux tables privées. Frontière testée explicitement.

## Pokémon

Header : `pokemon_id`, `dex_number`, `name_fr`, `primary_type`, `secondary_type`, `variant_count`, `variants`.

Entrée variante : `source_card_id`, `variant_id`, `image_url`, `card_name_fr`, `set_id`, `set_name_fr`, `set_name_source`, `set_abbreviation_fr`, `set_abbreviation`, `local_id`, `variant_label`, `effective_release_date`. Ordre Pokémon, compteur égal à la longueur du tableau.

Types PokéAPI de l'espèce, jamais énergie TCG ou forme alternative. Types nullables ; secondaire requiert primaire différent.

## Extension

Header : `set_id`, `name_fr`, `name_source`, `abbreviation_fr`, `abbreviation`, `release_date`, `series`, `logo_url`, `symbol_url`, `variant_count`, `variants`. `series` : `series_id`, `name_fr`, `name_source`.

Variante : `source_card_id`, `variant_id`, `image_url`, `card_name_fr`, `local_id`, `rarity`, `category`, `variant_label`, `effective_release_date`, `pokemon`. Header Extension non répété.

Pokémon léger : `pokemon_id`, `dex_number`, `name_fr`, tri dex puis ID ; tableau vide sans rattachement. Noms fournis pour la future recherche locale. Carte multi-Pokémon : chaque variante apparaît une seule fois.

## Carte source

Header : `source_card_id`, `name_fr`, `local_id`, `rarity`, `category`, `effective_release_date`, `image_url`, `set`, `series`, `pokemon`, `variants`.

`set` : `set_id`, `name_fr`, `name_source`, `abbreviation_fr`, `abbreviation`. `series` : même objet que pour Extension. Pokémon : `pokemon_id`, `dex_number`, `name_fr`, `primary_type`, `secondary_type`, tri dex puis ID.

Variantes françaises éligibles : `variant_id`, `image_url`, `variant_label`, `effective_release_date`, dans leur ordre canonique au sein de l'Extension. Caractéristiques détaillées réservées à `get_variant_detail`.

Image représentative : image propre de carte si présente ; sinon première variante éligible canonique ayant une image. NULL si aucune. Aucun asset fabriqué ou sondé. Le choix représentatif ne change pas le fallback individuel des variantes.

## Frontend

[`src/types/catalog.ts`](../src/types/catalog.ts) : types camelCase et adaptation des seuls arguments BIGINT générés vers string. [`src/services/catalog.ts`](../src/services/catalog.ts) : `getCatalogPokemon`, `getCatalogSet`, `getCatalogCard`, factory injectable, chaque méthode exclusivement via sa RPC.

Zod strict : objets/champs/nullabilité, IDs canoniques bornés BIGINT, dates calendrier, types cohérents, IDs uniques dans les tableaux, compteurs cohérents et cible identique à l'entrée. Aucun cast de payload. Erreurs stables `catalog_unavailable`, `not_authorized`, `unexpected`, aucun message serveur brut. Ordre conservé.

[`formatFrSource`](../src/lib/format-fr-source.ts) : valeurs différentes → `FR (source)`, identiques → une seule, une disponible → celle-ci, aucune → null. Résumés compacts et Détail Variante réutilisent le helper sans changement de présentation.

[`src/types/pokemon.ts`](../src/types/pokemon.ts) : 18 identifiants et libellés FR. [`src/lib/catalog-identity.ts`](../src/lib/catalog-identity.ts) : tonalités MY. claires/sombres, resolver mono-type `principal.light → principal.dark`, double-type `principal.light → secondaire.dark`, accent principal prioritaire. Sans type, Carte ou Extension : ardoise/bleu-gris neutre. Couleurs exclusivement frontend, encore non appliquées aux écrans Catalogue/Collections.

## Migration et validation

[Migration CLI 7D.1](../supabase/migrations/20261004161759_phase7d1_catalog_foundation.sql), local uniquement. Colonnes additives/nullables : anciens lecteurs/écrivains compatibles ; nouveau pipeline exige nouveau référentiel. Déployer schéma avant pipeline/consommateurs. Synchronisation transactionnelle/idempotente ; publication atomique du fichier Pokémon séparée.

Retour arrière en **nouvelle migration** : retirer consommateurs, supprimer trois RPC, policy/grants de clés de cartes et EXECUTE/USAGE ajoutés. Conserver colonnes types/données jusqu'à autorisation de suppression. Ne jamais éditer l'historique appliqué. Aucun rollback ni contraction implicitement prévu ensuite.

[pgTAP](../supabase/tests/database/020_catalog_detail.test.sql) : payloads exacts, ordres, éligibilité, images, BIGINT, droits/indisponibilité et parité de toutes les cibles réelles. [Pipeline sur base peuplée](../scripts/catalog/pokemon-metadata-integration.ts) : changement de type seul, relations/variantes/ordre/structures/hashes/versions/séquences/données utilisateur conservés, retry noop, rollback intégral. Tests unitaires : génération, services, helper et palette. [Rapport final](reports/2026-10-04-PHASE7D1-CATALOG-FOUNDATION.md) : preuves locales et limites.
