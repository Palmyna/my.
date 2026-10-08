# Phase 7F.1 — Contrats de navigation Collection

Date : 7 octobre 2026. Version livrée localement : **0.7.18**.

## État initial vérifié

- Branche : `dev`.
- HEAD : `92dfe3485a4956755a1043e7c3667e17db7af30d` (`v0.7.17`).
- `git status --short` : aucune sortie, dépôt propre ; aucun changement préexistant.
- Versions `package.json`, racine `package-lock.json` et `packages[""].version` : `0.7.17`.
- Instructions `AGENTS.md`, contrats/types/services Collection, trois renderers Collection indiqués dans le cadrage, migrations Phase 5 / 6D.1 / 7D.5, tests correspondants et documents Features / UX / Architecture / Database / Roadmap inspectés avant modification.
- CLI Supabase installée : `2.119.0`. Aide CLI et documentation publique Context7 consultées.
- `migration list --local` : **28 fichiers / 28 versions appliquées**, dernière version `20261006120339`.
- Cloud : **23 au dernier checkpoint confirmé par le propriétaire**, jusqu’à `20260928083830`. Aucun contrôle Cloud dans cette étape.

## Migration additive

[20261007085921_phase7f1_navigation_contracts.sql](../../supabase/migrations/20261007085921_phase7f1_navigation_contracts.sql), créée par `supabase migration new phase7f1_navigation_contracts`, puis appliquée par `migration up --local`.

Le fichier final comporte exactement un `BEGIN`, un `COMMIT`, une définition `CREATE OR REPLACE FUNCTION` et une définition `CREATE OR REPLACE VIEW`. Seuls `public.get_collection_content(uuid)` et `public.dashboard_collections` évoluent. Aucune migration historique modifiée, table créée, écriture de données utilisateur, policy modifiée ni nouveau grant.

**Incident d’application corrigé :** le fichier nouvellement rempli contenait deux blocs identiques. Le contrôle avait affiché deux transactions ; l’application aurait dû être bloquée à ce stade. Les deux blocs ont remplacé les mêmes définitions, sans DML, et l’historique a enregistré une seule version. Le doublon a ensuite été retiré du seul fichier nouveau. Lecture de `pg_proc.prosrc` : définition Local strictement conforme au fichier final, après normalisation des fins de ligne. Aucune réparation d’historique, reset ni seconde migration.

## Contenu Collection : 15 clés strictes

Ajouts obligatoires :

- `source_card_id = source_cards.id::text` ;
- `set_id = tcg_sets.id::text`.

Exemple de forme, avec IDs illustratifs :

```json
{
  "collection_item_id": "d1600000-0000-0000-0000-000000000001",
  "variant_id": "123",
  "source_card_id": "456",
  "set_id": "78",
  "origin": "automatic",
  "card_name_fr": "Pikachu",
  "local_id": "58",
  "set_name_fr": "Set de Base",
  "set_abbreviation_fr": "BAS",
  "set_abbreviation": "BS",
  "series_name_fr": "Base",
  "series_name_source": "Base",
  "image_url": "https://example.invalid/card.webp",
  "variant_label": "Normal",
  "owned": true
}
```

Ces deux champs sont issus des jointures existantes, sans jointure ni filtrage supplémentaires. Corps SQL identique à 6D.1 après retrait des deux lignes d’IDs : sélection complète, ordre `sort_position, id`, possession du propriétaire, `COALESCE(image variante, image source)`, valeurs FR/source et items historiques conservés. Collection vide/invisible : `[]`.

## Dashboard / Overview : target_id

Ordre final des colonnes SQL :

```text
collection_id         UUID
name                  TEXT
collection_type       TEXT
access                TEXT
target_type           TEXT nullable
target_name           TEXT nullable
owned_count           BIGINT
total_count           BIGINT
target_primary_type   TEXT nullable
target_secondary_type TEXT nullable
target_id             TEXT nullable
```

`target_id` est ajouté après toutes les colonnes historiques :

| Collection | target_type | target_id |
|---|---|---|
| Libre | NULL | NULL |
| Automatique Pokémon | pokemon | target_pokemon_id::text |
| Automatique Extension | set | target_set_id::text |

Même ID pour propriétaire et destinataire autorisé sous RLS. Nom cible absent reste nullable. Aucun ID de Carte ajouté à la vue.

Définition de vue identique à 7D.5 après retrait du seul CASE `target_id` : progression live du propriétaire, owned/shared, jointures et identité types Pokémon conservées. Aucune couleur stockée ni recalcul des compteurs frontend.

## Sécurité et grants

- RPC : `STABLE`, `SECURITY INVOKER`, `search_path = ''`, retour scalaire JSONB.
- Vue : `security_invoker = true`.
- `CREATE OR REPLACE` conserve ownership et ACL existantes.
- RPC : EXECUTE authentifié existant ; aucun droit PUBLIC / anon / service_role ajouté.
- Vue : SELECT authentifié existant ; aucun droit d’écriture ajouté.
- Aucun `SECURITY DEFINER`, nouveau grant de table, élargissement de policy ou accès privé supplémentaire.
- RLS du caller, restrictions MFA/profil, owned/shared, révocation et partage en lecture seule conservés.
- Les IDs exposés correspondent à des entités Catalogue déjà navigables par le lecteur authentifié autorisé.

## Types et services

[DashboardCollection](../../src/types/collections.ts) ajoute `targetId: string | null`. `CollectionOverview` en hérite automatiquement.

[Service Collections](../../src/services/collections.ts) sélectionne `target_id` en fin des deux SELECT existants. Décodeur strict des onze champs sélectionnés : libre exige type/ID/nom nuls ; automatique exige type Pokémon/Extension et ID texte BIGINT valide. Aucun passage de l’ID par number. La lecture séparée de `collections.owner_id` reste inchangée ; aucune seconde requête Catalogue.

[CollectionContentItem](../../src/types/collection-content.ts) ajoute `sourceCardId: string` et `setId: string`. [Service contenu](../../src/services/collection-content.ts) passe de 13 à 15 clés exactes ; champs absents, inattendus, nulls sur les IDs et IDs numériques sont refusés. Ordre, déduplication, erreurs publiques et auth inchangés.

Helper commun `variantIdString` réutilisé après garde string. Canonicalité signée et bornes PostgreSQL BIGINT vérifiées avec BigInt, jamais number ; fixtures négatives conservées. Correction du helper : rejet explicite des espaces / retours ligne (`trim() !== value`), afin de ne pas accepter un retour ligne final toléré par l’ancre regex `$`. Compatibilité des anciens appels numériques sûrs du helper conservée ; les nouveaux lecteurs refusent tous les nombres.

Fixtures TypeScript des consommateurs adaptés aux champs désormais obligatoires. Aucun composant de production modifié.

## Génération DB

`npm run db:types` exécuté après migration puis lors de la validation finale, exclusivement sur `127.0.0.1:55322`.

Le seul changement de déclarations générées est `dashboard_collections.Row.target_id: string | null`. Signature JSONB de la RPC inchangée. Aucune édition manuelle des types générés et aucun nouvel overlay. Les adaptations lossless existantes des autres contrats BIGINT sont conservées.

## Validation

| Contrôle | Résultat |
|---|---|
| Tests DB ciblés 012 / 015 / 021 | 3 fichiers, **100 assertions**, PASS |
| Services Collections / contenu | 2 fichiers, **245 tests**, PASS |
| HTTP Local contenu | PASS : propriétaire et destinataire, **1 005 items** complets chacun |
| `npm run db:test` | **22 fichiers / 1 438 assertions**, PASS |
| `npm run db:lint` | Aucune erreur schéma public/private |
| `npm run db:types` | Génération Local réussie ; diff limité à target_id |
| `npm test` | **61 fichiers / 1 827 tests**, PASS |
| `npm run build` | Typecheck et Vite, PASS |
| `npm run lint` | PASS, zéro erreur/avertissement ESLint |
| `git diff --check` | PASS |
| Contrôle des nouveaux fichiers | Migration et rapport uniquement ; aucun fichier temporaire |

Tests DB enrichis : IDs Carte/Extension exacts et lossless, texte décimal, 15 clés, ordre/ties, possession du propriétaire, image fallback, séries/abréviations, empty, volume, partage lecture seule et révocation/RLS ; target_id libre/Pokémon/Extension, noms absents, BIGINT hors précision JS, partage, colonne ajoutée en fin. Tests progression, types Pokémon, droits et MFA/profil conservés.

Tests services : targetId pour les deux cibles et NULL libre ; type/ID incohérent, manquant, numérique sûr ou non sûr, vide, non décimal, hors bornes, espaces/retour ligne ; sourceCardId/setId, absence/remplacement par champ inconnu, champs supplémentaires. Anciens cas auth/erreur inchangés.

Preuve HTTP : cap REST direct de 1 000 contrôlé ; RPC propriétaire/destinataire retourne 1 005 objets avec 15 clés et même contenu ordonné, soit 479 283 octets chacun. IDs `-9007199254740995` / `-9007199254740996` exacts sur le wire. Fixtures synthétiques supprimées ; contrôle SQL final : zéro identité `a1600000-*` restante.

Messages non bloquants : jsdom signale deux navigations vers un autre Document ; suite réussie. Vite signale un chunk minifié supérieur à 500 kB ; build réussi, aucun changement de découpage dans ce périmètre.

## État final et limites

- Version package / lock / racine lock : **0.7.17 → 0.7.18** ; aucune dépendance changée.
- Branche et HEAD inchangés : `dev`, `92dfe3485a4956755a1043e7c3667e17db7af30d`.
- Historique réel Local : **29 fichiers / 29 versions appliquées**.
- Dernier Cloud confirmé : **23**, checkpoint propriétaire Phase 6 ; aucune relecture distante ni action Cloud.
- Une seule migration nouvelle ; aucune migration historique modifiée.
- Aucune UI, route, CSS ou interaction de production modifiée. Tuile Dashboard entièrement liée à la Collection ; aucun lien imbriqué.
- Aucun bouton Retour commun ni lien UI 7F.2 ajouté. L’ancien lien Collection vers Dashboard reste inchangé.
- Aucun commit, push, reset, déploiement ni fichier temporaire restant. Les fichiers de travail modifiés sont détaillés ci-dessous.

## Compatibilité / retour arrière

Vue additive compatible avec les anciens lecteurs à sélection explicite. Payload contenu à 15 clés incompatible avec l’ancien décodeur strict à 13 clés : coordonner migration et services lors de tout futur checkpoint. Aucun déploiement mixte compatible revendiqué.

Retour arrière possible via une nouvelle migration restaurant le corps 6D.1 et le décodeur correspondant, sans toucher aux données. Lors d’un rollback frontend, conserver target_id additif. Retirer la colonne demanderait une migration distincte traitant les dépendances ; aucune contraction effectuée ici.

## Travail restant en 7F.2

Bouton commun `← Retour` et liens UI corrects : nom de Carte → `/catalog/cards/:sourceCardId` ; Extension → `/catalog/extensions/:setId` ; entité Pokémon explicite → `/catalog/pokemon/:pokemonId`. Cible automatique selon targetType/targetId : Pokémon ou Extension. Aucun parsing de texte, même pour `Pikachu-ex`.

Surfaces liables indépendantes du Détail, exemplaires, menu et reorder, sans interaction imbriquée ; partage lecture seule autorisé. Dashboard ne doit pas recevoir de lien imbriqué. Précédente / Suivante, swipe entre cartes, séquence de cartes et navigation rapide contextuelle sont abandonnés pour la V1 actuelle ; navigation/pagination Classeur existante indépendante.

## Git final

Aucun fichier staged ; 33 fichiers suivis modifiés, deux nouveaux fichiers (rapport et migration). 308 destinations Markdown relatives vérifiées dans les documents concernés et le rapport.

```text
 M README.md
 M docs/01-FEATURES.md
 M docs/04-UX-UI.md
 M docs/05-ARCHITECTURE.md
 M docs/06-DATABASE.md
 M docs/08-ROADMAP.md
 M docs/09-CATALOG-CONTRACTS.md
 M package-lock.json
 M package.json
 M scripts/test-collection-content-api.js
 M src/app/AppRoutes.test.tsx
 M src/features/collections/CollectionActions.test.tsx
 M src/features/collections/CollectionContentBinder.test.tsx
 M src/features/collections/CollectionContentList.test.tsx
 M src/features/collections/CollectionPage.test.tsx
 M src/features/collections/CollectionViewIntegration.test.tsx
 M src/features/collections/ManualCollectionItems.test.tsx
 M src/features/collections/filter-collection-content.test.ts
 M src/features/dashboard/CreateCollection.test.tsx
 M src/features/dashboard/DashboardPage.test.tsx
 M src/features/dashboard/collection-color.test.ts
 M src/features/physical-copies/physical-copies-query.test.ts
 M src/lib/variant-id.ts
 M src/services/collection-content.test.ts
 M src/services/collection-content.ts
 M src/services/collections.test.ts
 M src/services/collections.ts
 M src/types/collection-content.ts
 M src/types/collections.ts
 M src/types/database.generated.ts
 M supabase/tests/database/012_dashboard_collections.test.sql
 M supabase/tests/database/015_collection_content.test.sql
 M supabase/tests/database/collection_content.fixtures.inc
?? docs/reports/2026-10-07-PHASE7F1-NAVIGATION-CONTRACTS.md
?? supabase/migrations/20261007085921_phase7f1_navigation_contracts.sql
```
