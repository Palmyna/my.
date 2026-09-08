# Phase 2 — Date effective et provenance par variante

Correction réalisée le **8 septembre 2026**, depuis le working tree propre du dépôt `Palmyna/my.` au commit `91919eeda1348ec886f109bec977374e0e96503d` (« Add npm find »).

**Résultat : date effective propre à chaque variante, provenance persistée, overrides datés, classement Pokémon corrigé, 31 904 IDs préservés et catalogue local migré sans perte.** Aucun reset, accès cloud en écriture, changement de l'override Pikachu ou commit. Supabase local a été arrêté avec conservation du volume.

## Migration et données persistantes

La CLI Supabase installée (`2.116.0`) a créé le fichier avec :

```powershell
supabase migration new phase2_variant_release_dates
```

Migration : [20260908083516_phase2_variant_release_dates.sql](../../supabase/migrations/20260908083516_phase2_variant_release_dates.sql). Les quatre migrations antérieures sont inchangées. La procédure suit la [documentation officielle des migrations Supabase](https://supabase.com/docs/guides/deployment/database-migrations).

Ajouts à `public.catalog_variants` :

```sql
effective_release_date DATE NULL
date_origin TEXT NOT NULL DEFAULT 'unknown'
CHECK (date_origin IN ('variant', 'card', 'product', 'set', 'override', 'unknown'))
```

La contrainte nommée est `catalog_variants_date_origin_check`. Les commentaires SQL expliquent le fallback et la distinction entre provenance inconnue et date inconnue. Les IDs, clés, contraintes identitaires, RLS et index existants restent en place.

Le backfill copie `source_cards.effective_release_date`. La provenance historique n'étant pas persistée sur les cartes, il utilise `unknown`, même pour une date connue. Il ne prétend pas que cette date est propre à la variante ni qu'elle venait nécessairement de la carte. La synchronisation recalcule ensuite la provenance réelle. Les timestamps techniques des variantes mises à jour évoluent normalement ; les données métier antérieures sont conservées.

## Calcul, modèle et source inspectée

Règle effective : **date spécifique fiable de variante, sinon date effective déjà résolue de la carte avec sa provenance réelle, sinon NULL**. Aucune date partielle, approximative ou déduite d'un nom de produit n'est inventée.

Le [modèle TypeScript](../../scripts/catalog/model.ts) conserve toutes les propriétés identitaires et ajoute :

```ts
interface Variant extends Properties {
  date: string | null
  dateOrigin: 'variant' | 'card' | 'product' | 'set' | 'override' | 'unknown'
  // Les autres champs existants restent inchangés.
}
```

La validation des dates réutilise `z.iso.date()`. La provenance possède un enum Zod commun ; le type de provenance de carte exclut `variant`. `variantKey`, `type`, `subtype`, `size`, `stamp`, `foil` et l'identifiant source ne contiennent jamais la date. Changer uniquement une date conserve l'identité, la clé et l'ID PostgreSQL.

Le snapshot déjà en cache a été conservé :

```text
1c30c50253756bafecf0f065fc377f77016ad12f
```

L'inspection porte sur les interfaces `variant_detailed` et legacy, ainsi que `server/compiler/utils/variantUtil.ts` de TCGdex. Ces définitions n'offrent pas de date de variante ni de relation produit datée exploitable. La normalisation actuelle transmet donc la date résolue de carte à chaque variante source. Les provenances `variant` et `product` restent prévues dans le modèle sans utilisation artificielle. Les dates de toutes les cartes du catalogue réel proviennent ici du set.

Les noms français et le snapshot ne sont pas régénérés. Aucun nouveau fetch ni enrichissement externe n'est nécessaire à la synchronisation au SHA déjà disponible.

## Overrides et historique

| Action | Champ date | Comportement |
| --- | --- | --- |
| `variant.add` | absent | Héritage de la date de carte et de sa provenance |
| `variant.add` | date ISO complète | Date spécifique corrigée, provenance `override` |
| `variant.patch` | absent | Cette action ne corrige pas la date |
| `variant.patch` | date ISO complète | Date spécifique corrigée, provenance `override` |
| `variant.patch` | `null` | Retrait de la correction spécifique, retour au fallback de carte |

Pour un ajout, `date:null` n'est pas accepté : l'absence du champ exprime le fallback. Les variantes déclarées dans `card.add` suivent les mêmes règles d'ajout.

Le suivi des variantes qui héritent d'une date est indépendant de la provenance : une carte corrigée peut elle-même avoir une provenance `override`. Le fallback final tient compte de tous les patches de carte, même si l'ajout de variante ou le patch `date:null` est traité auparavant. Une date spécifique n'est pas remplacée par une correction de carte.

Les variantes absentes d'un snapshot sont conservées inactives avec leurs dates persistées, y compris lorsqu'une autre variante de leur carte demeure présente. La reconstruction d'une carte historique pour un override relit `effective_release_date` et `date_origin` de chacune de ses variantes. Un patch descriptif ne remplace pas leur date historique. Un `date:null` explicite demande le fallback de carte ; la provenance historique de cette carte reste `unknown` si elle n'est pas connue.

Le fichier réel [pikachu-sm3.5-28.json](../../data/catalog-overrides/pikachu-sm3.5-28.json) reste **strictement inchangé**. Les quatre overrides existants, sans date, restent valides et héritent de la date de carte. Leur empreinte SHA-256 des octets est inchangée :

```text
5929bbf775c251d4261db35a4b8e11dca22a2ba7e38167ee3701be96e6be32ce
```

## Classement et versions

Pour Pokémon :

```text
date effective de variante, NULL strictement après les dates connues
→ rang du numéro de carte
→ rang de variante
→ clé de carte
→ identité de variante
```

Le test explicite utilise A Normal au 2020-01-01, B Normal au 2020-06-01 et A Promo au 2021-01-01. Le résultat est **A Normal → B Normal → A Promo**. Les dates NULL sont placées après toute date connue, y compris `9999-12-31`, avec les départages stables existants.

Pour Set, l'ordre reste **numéro de carte → rang de variante → départages existants**, sans date. Sur les mêmes données, il conserve A Normal → A Promo → B Normal lorsque le numéro de A précède celui de B.

`content_hash` reste exclusivement le hash de la liste ordonnée des IDs de variantes. Une date modifiée sans déplacement conserve hash et version ; un déplacement Pokémon change le hash et incrémente la version de 1. Une modification de date seule ne change jamais la cible Set. Les tests vérifient également le noop suivant une correction.

## Résultats locaux

Le volume local existant a été démarré sans reset. Un audit de référence a été réalisé avant migration, puis comparé après migration, dry-run, premier et second apply.

| Étape | Résultat |
| --- | --- |
| `supabase migration up --local` | Nouvelle migration appliquée avec succès sur les 31 904 variantes existantes |
| Contrôle du backfill | 0 différence avec la date de carte ; 31 904 provenances `unknown` ; 0 date NULL |
| `supabase db diff --local --schema public,private` | Reconstruction des cinq migrations en base shadow ; aucun écart de schéma |
| Dry-run au SHA conservé | 31 904 modifications de provenance prévues ; aucune création, suppression ou modification de cible |
| Premier apply | 31 904 variantes passées à la provenance réelle `set` ; 1 213 cibles inchangées |
| Second apply | Noop fonctionnel : 0 création, 0 modification, 0 changement de mapping ou de cible |

La reconstruction en base shadow n'a ni réinitialisé ni réimporté le catalogue du volume existant. Le dry-run n'a modifié aucune donnée ; les comparaisons des audits le confirment. Les deux applications réutilisent le même snapshot, le même référentiel français et les mêmes quatre overrides.

| Volume | Avant et après |
| --- | ---: |
| Pokémon | 1 025 |
| Séries | 18 |
| Sets | 188 |
| Cartes | 19 907 |
| Variantes | 31 904 |
| Mappings carte/Pokémon | 16 820 |
| Automatic targets | 1 213 |

**Les 31 904 variant IDs et leurs clés sont préservés.** Les audits vérifient également les autres IDs, séquences, aliases, mappings, métadonnées de variantes hors dates/timestamp de modification, autres tables catalogue complètes et données utilisateur. Les 1 213 états de cible, y compris hashes, versions et timestamps, restent identiques sur le catalogue réel. Après le second apply, l'empreinte complète du catalogue, timestamps compris, est identique à celle du premier apply. Le journal technique peut évoluer normalement.

### Provenances finales

Les compteurs JSON `variant_dates` portent sur toutes les variantes de l'état persistant final, historiques comprises. Les compteurs existants `dates` restent ceux des cartes. Aucun diagnostic individuel par variante n'est ajouté.

| Provenance | Variantes |
| --- | ---: |
| `variant` | 0 |
| `card` | 0 |
| `product` | 0 |
| `set` | 31 904 |
| `override` | 0 |
| `unknown` | 0 |

`catalogue.variants_without_date` : **0**. Zéro provenance `override` est attendu : les ajouts Pikachu n'apportent pas de date spécifique, même si les variantes elles-mêmes ont une origine MY.

### Pikachu 28/73 — Légendes Brillantes

`tcgdex:sm3.5-28` conserve exactement **5 variantes** :

| ID | Variante | Date effective | Provenance |
| --- | --- | --- | --- |
| 15495 | Normal | 2017-10-06 | `set` |
| 31901 | Holo Cosmos | 2017-10-06 | `set` |
| 31902 | Holo Cracked Ice | 2017-10-06 | `set` |
| 31903 | Holo Water Web | 2017-10-06 | `set` |
| 31904 | Reverse | 2017-10-06 | `set` |

Ces dates sont des fallbacks de carte issus du set, pas une affirmation de sortie simultanée de toutes les variantes. Une future preuve fiable pourra dater spécifiquement une variante avec un override dédié, sans changer son ID.

## Tests réellement exécutés

Pendant le développement :

```powershell
vitest run --project catalog scripts/catalog/variant-dates.test.ts scripts/catalog/catalog.test.ts
supabase test db supabase/tests/database/005_variant_dates.test.sql --local
```

- Vitest ciblé : **62 tests réussis**, dont **25 nouveaux tests** de dates. La première passe a révélé trois échecs dus à la copie de l'objet carte complet dans une variante ajoutée ; la projection a été restreinte aux deux champs de date, puis la seconde passe ciblée a réussi.
- SQL ciblé : **18 assertions réussies**. Colonnes, nullabilité, défaut honnête, six provenances, refus des valeurs invalides, date calendrier, stabilité de clé/ID. Fixtures annulées, IDs négatifs explicites sans consommation des séquences locales.
- Contrôle de reconstruction : les cinq migrations appliquées avec succès en base shadow, diff `public,private` vide.
- Types Supabase : régénérés par `npm run db:types`, seulement six déclarations ajoutées pour les deux colonnes dans Row/Insert/Update.

La couverture ciblée inclut fallback carte/set/produit/inconnu, dates invalides, ajouts et patches datés, `date:null`, coexistence de dates héritées et spécifiques, ordre des overrides, identité et ID, intercalation chronologique, stabilité Set, hashes/versions, dates historiques et compteurs.

Une seule passe globale finale après le dernier changement de code :

| Commande | Résultat |
| --- | --- |
| `npm test` | **150 tests réussis**, 7 fichiers |
| `npm run lint` | Réussi, zéro avertissement |
| `npm run build` | Réussi ; exécute `npm run typecheck`, puis Vite |
| `npm run typecheck` inclus dans le build | Réussi ; aucune exécution indépendante redondante |

Aucune suite globale n'a été répétée après succès. Les autres anciennes suites SQL et l'intégration nécessitant une base vide n'ont pas été rejouées. Les preuves conservées ont été utilisées pour cette restitution, sans relancer de grosses validations. Le contrôle final de liens Markdown et `git diff --check` complète la vérification documentaire.

## Preuves locales conservées

Fichiers de travail ignorés par Git, sous `.cache/` :

- `variant-dates-audit.mjs` et les cinq audits `variant-dates-before.json`, `variant-dates-after-migration.json`, `variant-dates-after-dry.json`, `variant-dates-after-first.json`, `variant-dates-after-second.json` ;
- `variant-dates-shadow.log`, `variant-dates-dry.log`, `variant-dates-first.log`, `variant-dates-second.log` ;
- `variant-dates-final-test.log`, `variant-dates-final-lint.log`, `variant-dates-final-build.log` ;
- rapports complets `catalog-reports/2026-09-08T08-45-00-167Z-dry-run.json`, `catalog-reports/2026-09-08T08-48-21-869Z-apply.json`, `catalog-reports/2026-09-08T08-59-49-850Z-apply.json`.

## Fichiers livrés et périmètre

Créés :

- [Nouvelle migration](../../supabase/migrations/20260908083516_phase2_variant_release_dates.sql)
- [Tests TypeScript des dates](../../scripts/catalog/variant-dates.test.ts)
- [Tests SQL des dates](../../supabase/tests/database/005_variant_dates.test.sql)
- [Ce rapport](2026-09-08-PHASE2-VARIANT-DATES.md)

Modifiés, code et types :

- [model.ts](../../scripts/catalog/model.ts)
- [normalize.ts](../../scripts/catalog/normalize.ts)
- [variants.ts](../../scripts/catalog/variants.ts)
- [overrides.ts](../../scripts/catalog/overrides.ts)
- [plan.ts](../../scripts/catalog/plan.ts)
- [report.ts](../../scripts/catalog/report.ts)
- [catalog.test.ts](../../scripts/catalog/catalog.test.ts)
- [database.generated.ts](../../src/types/database.generated.ts)

Documentation synchronisée :

- [README](../../README.md)
- [Fonctionnalités](../01-FEATURES.md) et [politique TCGdex](../02-TCGDEX.md), dont les phrases d'ordre devaient aussi être corrigées
- [Modèle conceptuel](../03-DATA-MODEL.md)
- [Architecture](../05-ARCHITECTURE.md)
- [Schéma SQL](../06-DATABASE.md)
- [Pipeline](../07-CATALOG-SYNC.md)
- [Guide des overrides](../../data/catalog-overrides/README.md)

Vérifiés sans modification : quatre migrations antérieures, `variantKey` et priorités de propriétés identitaires, `order.ts` (rang des variantes et ordre Set), JSON Pikachu et autres données versionnées, moteur/CLI `catalog:find`, référentiel des noms, frontend, configuration Supabase, scripts npm et lockfile. Les rapports historiques restent historiques. Aucun autre fichier suivi n'est modifié.

**Aucune écriture Supabase cloud. Aucune modification des données utilisateur. La Phase 3 n'a pas commencé. Aucun commit automatique.**

Supabase local, démarré pour cette tâche, a été arrêté avec `npm run supabase:stop`. La CLI a confirmé `project_id_filter: my-local`, `backup: true` et l'arrêt réussi. **Le volume contient le catalogue migré et est conservé.**
