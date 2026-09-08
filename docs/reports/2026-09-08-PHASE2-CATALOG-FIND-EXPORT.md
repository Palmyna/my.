# Phase 2 — Export CSV de catalog:find

Date : 8 septembre 2026. État initial : working tree propre, commit `d35d15763e491f99439a93e2e21ab990c5accf32` (`Update date par variant`).

## Résultat et périmètre

`catalog:find --export` produit une photographie CSV locale de toutes les cartes correspondant à la recherche, avec une ligne par variante standard persistée. Le moteur `search-catalog.ts` reste strictement inchangé : normalisation, tokenisation, matching multi-termes, champs, scoring et classement. Le mode terminal compact conserve son comportement et sa limite.

L'export effectue uniquement des lectures du catalogue local. Aucun importeur CSV, aucune migration, aucune écriture DB ou cloud, aucune modification de l'override Pikachu et aucun développement de Phase 3 ne font partie de cette correction. Aucun commit n'a été créé.

## Fichiers

Créés :

- [scripts/catalog/catalog-find-export.ts](../../scripts/catalog/catalog-find-export.ts) : collecte de toutes les correspondances via le moteur existant, projection CSV, encodage et écriture locale.
- [scripts/catalog/catalog-find-export.test.ts](../../scripts/catalog/catalog-find-export.test.ts) : 21 tests d'export et de compatibilité des sélecteurs.
- [Ce rapport](2026-09-08-PHASE2-CATALOG-FIND-EXPORT.md).

Modifiés :

- [scripts/catalog/catalog-find.ts](../../scripts/catalog/catalog-find.ts) : option `--export`, messages et branche d'export.
- [scripts/catalog/search-catalog-db.ts](../../scripts/catalog/search-catalog-db.ts) : enrichissement des seuls résultats trouvés dans une transaction de lecture cohérente.
- [scripts/catalog/plan.ts](../../scripts/catalog/plan.ts) : corrections ciblées de reconstruction historique nécessaires à la compatibilité des clés exportées.
- [README.md](../../README.md), [guide des overrides](../../data/catalog-overrides/README.md) et [synchronisation catalogue](../07-CATALOG-SYNC.md) : syntaxe, colonnes, sélecteurs et workflow d'audit.

Vérifiés inchangés : moteur de recherche, modèle, application des overrides, migrations, `package.json`, verrou des dépendances, `.gitignore` et [override Pikachu réel](../../data/catalog-overrides/pikachu-sm3.5-28.json). Aucun changement du frontend.

## Utilisation et fichier

```powershell
npm run catalog:find -- "Pikachu Légendes Brillantes" --export
npm run catalog:find -- "Pikachu" --export
```

L'export contient toutes les correspondances, sans plafond de 20 ou de 100. La combinaison `--limit` et `--export` est refusée explicitement avant connexion DB. Sans `--export`, la syntaxe et l'affichage compact restent compatibles.

Les fichiers sont écrits dans `.cache/catalog-exports/`, déjà ignoré par Git. Convention : `catalog-find-<slug>-<empreinte>.csv`. Le slug ASCII de la recherche normalisée est limité à 70 caractères et suivi des dix premiers caractères du SHA-256 de cette recherche normalisée. Le nom est déterministe et compatible Windows ; l'empreinte distingue notamment des ponctuations significatives qui produiraient le même slug. Une nouvelle génération de la même recherche remplace le fichier via une écriture temporaire voisine puis un renommage. Une erreur de remplacement, par exemple un verrou Excel, produit un message explicite.

Aucun résultat : sortie normale, code 0, aucun CSV créé ou remplacé. Le message précise qu'un ancien export éventuel est conservé. Une recherche trouvant des cartes sans variante standard explique aussi l'absence de CSV.

## Architecture et colonnes

La couche maintenance appelle le moteur inchangé par lots de 100 et retire les résultats déjà obtenus avant le lot suivant. Elle ne duplique aucune règle de matching ou de classement. Les cartes conservent l'ordre de pertinence du moteur ; les variantes conservent leur ordre stocké (`sort_order`, clé, ID en départage).

L'accès DB charge la projection de recherche habituelle, puis les variantes standard des seuls IDs retenus, dans la même transaction `REPEATABLE READ READ ONLY`. Les contrôles de connexion locale restent en place. Aucun texte de recherche n'est interpolé dans le SQL. Les variantes inactives ou non confirmées en français restent visibles, conformément au compteur du mode compact.

Le CSV contient exactement huit colonnes :

| Colonne | Contenu |
| --- | --- |
| Card | Sélecteur `tcgdex:...` ou `my:...` de la carte |
| Nom | Nom français persisté ; vide si absent |
| Set | Nom français, sinon identifiant TCGdex du set |
| N° | Numéro local / total officiel, ou numéro local seul |
| Variante | Label persisté, sans reconstruction ; vide si absent |
| Date | `catalog_variants.effective_release_date`, ISO `YYYY-MM-DD` ; vide si NULL |
| Origine date | `date_origin` persisté : `variant`, `card`, `product`, `set`, `override` ou `unknown` |
| Variant Key | Sélecteur utilisable comme `variant.patch.key` avec la colonne Card |

L'encodeur écrit du UTF-8 avec BOM, séparateur `;`, fins de ligne CRLF. Toutes les cellules sont entre guillemets ; les guillemets internes sont doublés. Accents, caractères Pokémon, virgules, points-virgules et retours à la ligne intégrés aux valeurs sont conservés. Aucun préambule `sep=` n'ajoute de ligne aux huit en-têtes.

## Sélecteurs et historique

La priorité de `Variant Key` est :

1. Le sélecteur d'un `variant.patch` actuellement appliqué et relié au même ID par les alias persistés. Cela conserve notamment la clé d'origine après une correction d'identité. Plusieurs candidats sont départagés par ID d'override.
2. L'alias autonome `my:...` d'une variante ajoutée par MY, sans préfixe de carte suivi de `#`.
3. La clé canonique `variant_key` persistée, notamment pour une variante source ou une variante incluse dans `card.add`.

Un ancien alias source sans patch encore appliqué n'est pas préféré à la clé courante. Aucun ID numérique PostgreSQL ne sert de sélecteur exporté. Le CSV décrit l'état DB appliqué ; les corrections JSON doivent rester cohérentes avec cet état. Si un patch existe déjà, modifier ses champs plutôt qu'ajouter une correction contradictoire.

Les tests de compatibilité ont révélé deux problèmes préexistants dans `includeOverrideHistory` : une carte locale pouvait être restaurée avant son `card.add`, puis rejetée comme doublon ; une variante disparue d'une carte encore présente n'était pas restaurée pour un patch. La correction évite les restaurations déjà prévues par les ajouts et réintroduit seulement une variante connue explicitement ciblée. Elle conserve les dates persistées, les identités et les IDs ; une variante restaurée reste absente de la source et inactive. Un sélecteur inconnu reste refusé. Ces adaptations sont limitées à la préparation du pipeline ; aucun sync/apply n'a été exécuté pendant cette tâche.

## Résultats réels locaux

### Pikachu Légendes Brillantes

Commande : `npm run catalog:find -- "Pikachu Légendes Brillantes" --export`.

Résultat : **1 carte, 5 variantes**, toutes avec `Card = tcgdex:sm3.5-28`, `Nom = Pikachu`, `Set = Légendes Brillantes`, `N° = 28/73`.

Fichier : `.cache/catalog-exports/catalog-find-pikachu-legendes-brillantes-e7b8294dbd.csv`.

| Variante | Date | Origine date | Variant Key |
| --- | --- | --- | --- |
| Normal | 2017-10-06 | set | `v1:["normal",null,"standard",[],null]` |
| Holo Cosmos | 2017-10-06 | set | `my:pikachu-sm3.5-28-holo-cosmos-fr` |
| Holo Cracked Ice | 2017-10-06 | set | `my:pikachu-sm3.5-28-holo-cracked-ice-fr` |
| Holo Water Web | 2017-10-06 | set | `my:pikachu-sm3.5-28-holo-water-web-fr` |
| Reverse | 2017-10-06 | set | `my:pikachu-sm3.5-28-reverse-fr` |

Les cinq clés réellement exportées ont été acceptées par `variant.patch`, avec validation du catalogue, contre la carte source exacte déjà en cache et les quatre ajouts du JSON réel inchangé. Cette vérification applique des dates synthétiques uniquement en mémoire, sans connexion DB ni modification d'override. Preuve locale : `.cache/find-export-key-proof.json`.

### Recherche large et cas vide

`npm run catalog:find -- "Pikachu" --export` : **221 cartes, 302 variantes**, fichier `.cache/catalog-exports/catalog-find-pikachu-43999461d2.csv`. Le résultat dépasse bien la limite du terminal et le lot de 100 du moteur.

Les deux fichiers ont été relus indépendamment avec `Import-Csv -Delimiter ';' -Encoding utf8` : huit colonnes exactes, nombres de cartes et de variantes conformes, accents et clés intacts, BOM `239,187,191`. Preuve : `.cache/find-export-csv-proof.json`.

La commande compacte `npm run catalog:find -- "Pikachu Légendes Brillantes"` a conservé son tableau habituel : une carte, cinq variantes, un résultat affiché sur un.

`npm run catalog:find -- "QuelqueChoseQuiNExistePas" --export` : message « Aucun résultat », code 0, aucun fichier créé.

## Tests et validations exécutés

Les tests ciblés couvrent : 235 correspondances sans troncature ni changement d'ordre ou de score ; une ligne par variante ; dates connues/NULL et refus de date invalide ; labels persistés ; huit colonnes ; échappement Unicode, guillemets, séparateurs et retours à la ligne ; noms Windows ; remplacement du fichier ; préservation d'un ancien fichier en cas de résultat vide ; compatibilité CLI ; lecture dans une transaction unique ; clés source, MY, cartes locales et variantes historiques réellement acceptées par les overrides, avec conservation des IDs.

Pendant le développement, la première exécution ciblée a eu 56 succès et trois échecs : une attente d'ordre incorrecte dans le test et les deux problèmes historiques décrits ci-dessus. Après correction, les quatre fichiers ciblés ont passé **121 tests**. Trois cas historiques supplémentaires ont ensuite été ajoutés ; le fichier d'export seul a passé ses **21 tests**.

Une seule passe globale finale, après achèvement du code :

| Validation | Résultat |
| --- | --- |
| `npm test` | **171 tests réussis, 8 fichiers**, 39,92 s |
| `npm run lint` | Réussi, aucun avertissement |
| `npm run build` | Réussi, 123 modules transformés |
| TypeScript | `npm run typecheck` exécuté et réussi une fois par le script `build` ; aucun lancement séparé redondant |

Journaux conservés dans `.cache/find-export-final-test.log`, `.cache/find-export-final-lint.log` et `.cache/find-export-final-build.log`. Aucun code pertinent n'a été modifié après leur succès. Ce rapport réutilise ces preuves ; aucune suite globale n'a été relancée pour sa rédaction.

## Audit de lecture seule et fin de tâche

Le volume Supabase existant a été utilisé sans `db:reset`, sans migration, sans réimport complet et sans synchronisation/apply. Les instantanés `.cache/find-export-before.json` et `.cache/find-export-after.json` sont identiques ; la comparaison a réussi avec `FIND_EXPORT_READ_ONLY_VERIFIED`.

L'audit couvre les lignes du catalogue, les IDs, dates/provenances et timestamps, les relations et alias, les hashes/versions des targets, les séquences d'identité, le journal privé, les overrides, les tables utilisateur et le contenu du fichier d'override réel.

| Entité | Avant = après |
| --- | ---: |
| Pokémon | 1 025 |
| Séries | 18 |
| Sets | 188 |
| Cartes | 19 907 |
| Variantes | 31 904 |
| Mappings | 16 820 |
| Automatic targets | 1 213 |

Les huit runs privés, quatre overrides et quatre alias sont inchangés ; les tables utilisateur restent vides. Les 31 904 IDs de variantes sont préservés, ainsi que les cinq variantes de Pikachu et son JSON réel. Aucune donnée catalogue ou utilisateur n'a été modifiée et aucune écriture cloud n'a été faite.

Arrêt final confirmé par `npm run supabase:stop`, code 0 : `Stopped supabase local development setup.`, projet `my-local`, **`backup: true`**. Le volume local est conservé.

## Workflow de maintenance

`catalog:find --export` → CSV de référence → audit humain → fichier séparé `*_override.csv` contenant seulement les corrections souhaitées → entretien manuel des JSON d'overrides.

Le CSV de référence n'est pas destiné à être modifié puis réimporté automatiquement. Le fichier de corrections constitue une liste de travail humaine ; aucun importeur ni mécanisme d'application automatique n'a été ajouté.
