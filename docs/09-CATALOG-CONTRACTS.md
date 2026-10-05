# Socle Catalogue authentifié — Phase 7D.1

Contrats de lecture livrés en `0.7.7` (7D.1). Pokémon (`0.7.8`, 7D.2) et Extension (`0.7.9`, 7D.3) consomment ces contrats avec un socle UI Liste/Cartes commun, sans changement SQL. Carte reste future. Le panneau Détail Variante garde son contrat détaillé historique.

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

Pokémon léger : `pokemon_id`, `dex_number`, `name_fr`, tri dex puis ID ; tableau vide sans rattachement. Depuis 7D.3, noms utilisés pour la recherche locale et IDs pour les liens Pokémon indépendants. Carte multi-Pokémon : chaque variante apparaît une seule fois.

## Carte source

Header : `source_card_id`, `name_fr`, `local_id`, `rarity`, `category`, `effective_release_date`, `image_url`, `set`, `series`, `pokemon`, `variants`.

`set` : `set_id`, `name_fr`, `name_source`, `abbreviation_fr`, `abbreviation`. `series` : même objet que pour Extension. Pokémon : `pokemon_id`, `dex_number`, `name_fr`, `primary_type`, `secondary_type`, tri dex puis ID.

Variantes françaises éligibles : `variant_id`, `image_url`, `variant_label`, `effective_release_date`, dans leur ordre canonique au sein de l'Extension. Caractéristiques détaillées réservées à `get_variant_detail`.

Image représentative : image propre de carte si présente ; sinon première variante éligible canonique ayant une image. NULL si aucune. Aucun asset fabriqué ou sondé. Le choix représentatif ne change pas le fallback individuel des variantes.

## Frontend

[`src/types/catalog.ts`](../src/types/catalog.ts) : types camelCase et adaptation des seuls arguments BIGINT générés vers string. [`src/services/catalog.ts`](../src/services/catalog.ts) : `getCatalogPokemon`, `getCatalogSet`, `getCatalogCard`, factory injectable, chaque méthode exclusivement via sa RPC.

Zod strict : objets/champs/nullabilité, IDs canoniques bornés BIGINT, dates calendrier, types cohérents, IDs uniques dans les tableaux, compteurs cohérents et cible identique à l'entrée. Aucun cast de payload. Erreurs stables `catalog_unavailable`, `not_authorized`, `unexpected`, aucun message serveur brut. Ordre conservé.

[`formatFrSource`](../src/lib/format-fr-source.ts) : valeurs différentes → `FR (source)`, identiques → une seule, une disponible → celle-ci, aucune → null. Résumés compacts et Détail Variante réutilisent le helper sans changement de présentation.

[`src/types/pokemon.ts`](../src/types/pokemon.ts) : 18 identifiants et libellés FR. [`src/lib/catalog-identity.ts`](../src/lib/catalog-identity.ts) : tonalités MY. claires/sombres, resolver mono-type `principal.light → principal.dark`, double-type `principal.light → secondaire.dark`, accent principal prioritaire. Sans type, Carte ou Extension : ardoise/bleu-gris neutre. Couleurs exclusivement frontend, appliquées au Catalogue Pokémon/Extension, sans extraction depuis les images.

## Page Pokémon et socle UI — 7D.2

Route authentifiée `/catalog/pokemon/:pokemonId`, ID interne MY. en chaîne. Query `['catalog', 'pokemon', viewerId, pokemonId]`, exclusivement `getCatalogPokemon` : chargement discret, indisponibilité uniforme et erreur technique avec retry. Le titre de document suit le nom sans refocus. Aucun artwork d'espèce, appel PokéAPI ou pseudo-portrait tiré d'une carte.

Header : Pokédex sur au moins quatre chiffres, nom FR, badges des types FR et compteur `version(s)`. Le resolver 7D.1 fournit tous les accents et le gradient ; voile graphite commun pour le contraste. Mono-type : principal clair vers principal sombre ; double-type : principal clair vers secondaire sombre, badge secondaire distinct. CTA, sélection de vue et focus conservent l'accent principal.

`src/features/catalog/` contient page, toolbar, rendu neutre commun Liste/Cartes, filtre local, hook et action de collection. Les deux vues représentent chaque **Variante** dans l'ordre reçu, sans jointure ni tri frontend. Nom et contexte Extension/numéro restent du texte ; le bouton d'ouverture est un frère des zones textuelles, compatible avec de futurs liens indépendants. Aucun lien ou écran Extension/Carte anticipé. `CardImage` et `formatFrSource` réutilisés ; aucune possession, origine, progression, poignée ou action Collection. Cartes : grille automatique desktop, deux colonnes mobile ; label de Variante permanent.

Filtre local : normaliseur partagé avec Collection, casse/accents/ligatures/espaces tolérés, AND multi-champs (nom Carte, noms FR/source Extension, abréviations FR/source, local ID, label Variante). Aucun appel Supabase pendant la saisie ni changement d'ordre. Recherche conservée entre les vues ; effacement avec focus restauré.

`useCatalogView` et `useCollectionView` partagent `usePreferredView` : query privée 7A.3, résolution à l'ouverture uniquement, Liste de secours, choix immédiat, mutations sérialisées par viewer/domaine, rollback et réconciliation après erreur, réponses tardives abandonnées après changement de ressource/session. Catalogue écrit seulement `lastCatalogView`, global au Catalogue. Fusion par champ confirmé préservée ; modifier le défaut global ne remplace pas une consultation ouverte, y compris après un échec de lecture initial.

Le `VariantDetailPanel` existant reçoit le viewer comme `ownerId`. Ses exemplaires personnels restent confinés au Détail ; une indisponibilité locale du Détail ne démonte pas la page. Dialog natif, focus initial/trap/Esc/bouton et restauration vers l'ouvreur exact conservés.

Lecture CTA `findOwnedAutomaticCollection(viewerId, targetType, targetId)` : SELECT `id` sur `collections`, propriétaire courant + type automatic + type/ID de cible, sous RLS existante. Une collection reçue en partage ne compte jamais. Query `['collections', 'owned-automatic', viewerId, targetType, targetId]` ; aucun CTA supposé pendant chargement ou erreur. Création contextuelle à nom libre initialement vide, validation Unicode existante, dialogue natif partagé. `createAutomatic` reste l'unique écriture métier ; son adaptation BIGINT accepte désormais les chaînes exactes en plus des anciens nombres. `created=true` et `created=false` naviguent vers l'ID autoritatif, sans renommage. Annulation des lectures obsolètes, cache CTA confirmé puis invalidé et invalidation Dashboard exacte du viewer, sans attendre sa relecture pour naviguer. Erreurs traduites en messages naturels.

Déploiement : frontend sur le schéma 7D.1 existant. Retour arrière : retirer route/consommateur Catalogue, conserver les données et contrats SQL ; les anciens appels numériques de création restent compatibles. Aucune migration, contraction ou action Cloud nécessaire. [Rapport 7D.2](reports/2026-10-05-PHASE7D2-POKEMON-CATALOG-UI.md).

## Page Extension et factorisation — 7D.3

Route authentifiée `/catalog/extensions/:setId`, ID interne MY. ; query `['catalog', 'set', viewerId, setId]`, exclusivement `getCatalogSet`. États discrets, indisponibilité uniforme avec retour Dashboard, erreur technique sûre et retry. Titre du document sans refocus.

Header neutre `resolveCatalogIdentity()` : nom FR, nom source distinct seulement, abréviation exclusivement `formatFrSource`, série FR/source disponible, date française UTC si présente et compteur `version(s)`. Logo borné responsive et symbole compact depuis leurs seules URLs, `object-fit: contain`, images décoratives puisque l'identité est textuelle. Médias absents/échoués retirés sans placeholder ni couleur extraite. Aucune carte illustrative ou comptage de cartes distinctes.

`CatalogContent` possède thème, recherche, toolbar, rendu et ouverture du `VariantDetailPanel` communs. `CatalogVariants` accepte les variantes Pokémon et Extension ; contexte Extension transmis depuis le header sans dupliquer les payloads. `CardImage`/placeholder, `formatFrSource`, préférence globale `useCatalogView` et ordre reçu conservés. Deux colonnes Cartes mobile ; aucune possession ou action Collection dans les entrées.

Filtre Extension : nom de carte, numéro/local ID, label de Variante et noms de tous les Pokémon rattachés, AND avec normalisation existante. Aucun nom/abréviation Extension ou série, requête pendant la frappe, score ou retri. Pokémon garde tous ses champs 7D.2. La recherche survit au passage Liste/Cartes.

Chaque Pokémon rattaché est un `Link` indépendant vers `/catalog/pokemon/:pokemonId`, exclusivement l'ID du payload. Liens texte neutres, retour à la ligne mobile ; aucun groupe vide sur Dresseur/Énergie sans rattachement. Bouton Détail et liens sont frères, sans HTML interactif imbriqué ni double ouverture. Détail natif, exemplaires personnels (`ownerId = viewerId`), focus/trap/Esc et restauration exacts inchangés ; aucune navigation 7F.

`CatalogCollectionAction` et `CreateCatalogCollectionDialog` remplacent les deux composants spécifiques Pokémon. Paramètres `targetType: 'pokemon' | 'set'`, `targetId`, `targetName` ; UX Pokémon conservée. Extension utilise `findOwnedAutomaticCollection(viewerId, 'set', setId)` puis `createAutomatic` avec cible `set`, nom libre et validation existante. Partages exclus ; aucun CTA supposé pendant lecture/erreur. `created=true/false` ouvrent l'ID retourné sans renommage ni modification des items ; même réconciliation exacte CTA/Dashboard. Erreurs de cible adaptées à Extension, erreurs de nom sur le champ, aucun message SQL.

Livraison frontend sur contrats 7D.1/7D.2 inchangés ; anciens consommateurs compatibles. Retour arrière : rétablir les consommateurs frontend précédents, conserver contrats SQL et données. Aucun changement DB, migration, synchronisation ou accès Cloud. [Rapport 7D.3](reports/2026-10-05-PHASE7D3-SET-CATALOG-UI.md).

## Migration et validation du socle 7D.1

[Migration CLI 7D.1](../supabase/migrations/20261004161759_phase7d1_catalog_foundation.sql), local uniquement. Colonnes additives/nullables : anciens lecteurs/écrivains compatibles ; nouveau pipeline exige nouveau référentiel. Déployer schéma avant pipeline/consommateurs. Synchronisation transactionnelle/idempotente ; publication atomique du fichier Pokémon séparée.

Retour arrière en **nouvelle migration** : retirer consommateurs, supprimer trois RPC, policy/grants de clés de cartes et EXECUTE/USAGE ajoutés. Conserver colonnes types/données jusqu'à autorisation de suppression. Ne jamais éditer l'historique appliqué. Aucun rollback ni contraction implicitement prévu ensuite.

[pgTAP](../supabase/tests/database/020_catalog_detail.test.sql) : payloads exacts, ordres, éligibilité, images, BIGINT, droits/indisponibilité et parité de toutes les cibles réelles. [Pipeline sur base peuplée](../scripts/catalog/pokemon-metadata-integration.ts) : changement de type seul, relations/variantes/ordre/structures/hashes/versions/séquences/données utilisateur conservés, retry noop, rollback intégral. Tests unitaires : génération, services, helper et palette. [Rapport final](reports/2026-10-04-PHASE7D1-CATALOG-FOUNDATION.md) : preuves locales et limites.
