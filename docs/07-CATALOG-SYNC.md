# Pipeline catalogue et synchronisation TCGdex de MY.

## Rôle et état

Ce document est la référence du pipeline V1. Il applique la [politique TCGdex](02-TCGDEX.md), le [modèle](03-DATA-MODEL.md) et le [schéma SQL](06-DATABASE.md). La Phase 2 implémente le pipeline et le premier catalogue **sur Supabase local**. Son déploiement cloud reste séparé. La Phase 1 est déjà déployée dans le cloud, selon la validation du propriétaire.

```text
Snapshot Git exact → lecture TypeScript → normalisation FR → overrides JSON Git
→ validation + référentiel local des noms FR → plan PostgreSQL → dry-run → application transactionnelle
→ catalogue et structures automatiques hashées/versionnées → rapport
```

Le même code assure import initial et synchronisations. Il ne modifie aucun profil, collection, élément, exemplaire, note ou partage. Les collections conservent leur version appliquée jusqu'à une future preview puis validation explicite. Les RPC et interfaces correspondantes restent hors Phase 2.

## Code et commandes

Le pipeline réside dans [`scripts/catalog/`](../scripts/catalog/), hors React. Node 24 exécute directement le TypeScript effaçable. `pg` assure la connexion PostgreSQL directe ; Zod valide les données ; le compilateur TypeScript déjà installé lit les AST sans exécuter les modules upstream. Aucun runtime `tsx` supplémentaire n'est nécessaire.

| Modules | Responsabilité |
|---|---|
| `snapshot.ts`, `reader.ts` | Cache Git, SHA, checkout détaché, lecture des littéraux et relations |
| `normalize.ts`, `variants.ts`, `order.ts` | Champs utiles, FR, variantes, dates, images et rangs |
| `overrides.ts` | Schéma strict, fusion prioritaire et provenance |
| `pokemon-reference.ts` | Validation du JSON local des noms d'espèces, lookup et empreinte canonique |
| `pokemon-update.ts` | Commande manuelle PokéAPI indépendante, jamais importée par la synchronisation |
| `database.ts`, `plan.ts` | Connexion, état existant, identités, diff et structures |
| `apply.ts` | Réservation des IDs, écritures batchées et traces |
| `report.ts`, `cli.ts` | Commandes, transaction, rapport et erreurs |
| `catalog.test.ts`, `integration.ts`, `fixtures.ts` | Tests unitaires et intégration annulée |
| `variant-dates.test.ts` | Fallback, overrides datés, historique, identité, ordres et versions |
| `pokemon.test.ts` | Référentiel, génération HTTP simulée, erreurs et invariance des structures |
| `search-catalog.ts` | Contrat métier portable, normalisation, matching, score et tri |
| `search-catalog-db.ts`, `catalog-find.ts` | Projection PostgreSQL locale en lecture seule et présentation terminal |
| `search-catalog.test.ts` | Recherche, adaptateur de lecture, erreurs et CLI simulée |

```sh
npm run supabase:start
npm run catalog:validate -- --snapshot <SHA_COMPLET>
npm run catalog:sync -- --snapshot <SHA_COMPLET> --dry-run
npm run catalog:sync -- --snapshot <SHA_COMPLET> --apply
npm run supabase:stop
```

`catalog:sync` sans flag est un dry-run. Sans `--snapshot`, HEAD distant est résolu une fois puis figé. Le SHA explicite comporte 40 caractères hexadécimaux minuscules ; s'il est déjà en cache, aucun fetch n'est nécessaire. Les options inconnues/contradictoires sont refusées. `catalog:validate` effectue aussi le rapprochement en lecture avec la base locale, nécessaire pour les corrections d'entités historiques.

Seul PostgreSQL local est accepté : loopback `127.0.0.1`, `localhost` ou `::1`, port `55322`, base `postgres`, migration Phase 2 présente. La connexion provient du statut JSON Supabase capturé en mémoire. La variable privée `CATALOG_DATABASE_URL` peut la remplacer, avec les mêmes restrictions et sans paramètres URL. Aucun secret n'est codé, affiché ou injecté dans React. Toutes les bases distantes sont refusées ; le mode remote reste à implémenter séparément.

## Snapshot et lecture

La recherche de maintenance décrite plus bas lit le catalogue PostgreSQL existant ; elle ne passe pas par cette étape de snapshot.

La source des cartes, variantes et rattachements est [`tcgdex/cards-database`](https://github.com/tcgdex/cards-database). REST TCGdex reste réservé aux diagnostics. Le seul complément autorisé est le référentiel versionné des noms français d'espèces, généré manuellement depuis PokéAPI ; la synchronisation ne contacte jamais PokéAPI et ne fusionne aucune API de prix ou d'assets.

Le clone/fetch peu profond est conservé dans `.cache/tcgdex/cards-database/`, ignoré par Git. L'origine et la propreté sont vérifiées avant checkout détaché. `.cache/tcgdex/pipeline.lock` empêche deux processus de changer simultanément le snapshot. Après un arrêt brutal, vérifier l'absence de run actif avant de retirer un verrou périmé. Le dataset TCGdex complet n'est pas versionné dans MY. Le petit mapping complet des noms d'espèces l'est dans `data/pokemon/pokemon-fr.json`.

La référence inspectée est `1c30c50253756bafecf0f065fc377f77016ad12f`, datée `2026-09-06T11:03:48+01:00` : `interfaces.d.ts`, `cardUtil.ts`, `variantUtil.ts`, `setUtil.ts`, `translationUtil.ts` et les données réelles. La licence MIT du code dérivé accompagne le pipeline dans `TCGDEX-LICENSE.txt`.

Le lecteur parcourt `data/`. Un nom `name.fr` non vide confirme la carte française. Les sets nommés en français sont conservés, même vides, ainsi que les sets référencés par une carte française. Les autres sets étrangers sont exclus. La relation explicite `card.set`, puis `set.serie`, prime sur le dossier ; une divergence est signalée. Le nom français manquant d'un set reste `NULL`.

La série numérique `tcgp` (Pokémon TCG Pocket) est exclue du périmètre physique et comptée séparément. Le set technique `jumbo` est exclu. Les sets français vides sont diagnostiqués.

Seuls les littéraux des champs utiles sont interprétés. Un import hors du répertoire de données, un champ dupliqué ou une expression exécutable dans un champ lu provoque une erreur. Les champs gameplay sont ignorés. Catégorie, rareté et labels utilisent les traductions du même snapshot, avec fallback sur la valeur source. Aucun `git log` unitaire par carte : `source_updated_at` reste `NULL` faute de valeur source fiable disponible.

Les fichiers, clés et départages sont triés explicitement sans locale système. La date du run appartient uniquement au journal technique.

## Variantes et français

Les objets détaillés et les booléens legacy sont convertis vers un modèle interne commun.

| Déclaration sur une carte française | Résultat |
|---|---|
| `languages` contient `fr` | `confirmed` |
| `languages` existe et exclut `fr`, même vide | `unavailable` |
| `languages` absent | `confirmed` : sémantique TCGdex « toutes les langues » |
| Variante legacy déclarée | `confirmed` |
| Définition absente | Normal standard, valeur par défaut du convertisseur TCGdex |
| Ambiguïté | Diagnostic ; un override peut imposer `unknown` |

Legacy : `normal` est vrai par défaut, `holo`/`reverse` faux ; `firstEdition` ajoute le stamp aux finitions déclarées, `wPromo` ajoute la Normal W. `preRelease` seul ne précise pas la finition : diagnostic sans fabrication d'une combinaison. Les formes inconnues/contradictoires bloquent. Les répétitions dont toutes les valeurs normalisées sont identiques sont regroupées et comptées ; aucun doublon ne subsiste après validation.

Une taille absente vaut `standard`. Toute variante `jumbo` est comptée puis écartée avant catalogue collectible, rangs et structures. Un ajout local Jumbo est refusé. Une ligne historique absente du catalogue souhaité reste stockée inactive.

### Identité V1

```text
v1:JSON.stringify([type, subtype|null, "standard", stamps_triés_sans_doublon, foil|null])
```

Exemple : `v1:["holo",null,"standard",["pre-release","staff"],"cosmos"]`.

Les propriétés utilisent les valeurs canoniques upstream. Les stamps sont triés indépendamment de la locale. Label, langue, image, date, provenance de date, tiers et prix ne participent jamais à l'identité. `UNIQUE(source_card_id, variant_key)` reste en place. Une correction de date conserve l'identité, la clé source et l'ID existant.

Pour les variantes détaillées, `source_variant_id` reproduit l'identifiant du `variantUtil.ts` inspecté : valeurs anglaises, taille explicite, clés triées, hash entier base 31 rendu en base 36. Il reste distinct de la clé MY. Pour le legacy, il vaut `NULL` ; `generated` n'est jamais stocké.

### Ordre

Ordre macro : Normal, Normal avec stamps ; Holo, Holo avec stamps, Holo avec foil, Holo avec foil/stamps ; les quatre groupes Reverse équivalents ; autres types. Poké Ball précède Master Ball. Aux niveaux égaux, type, foil canonique, stamps, subtype et identité départagent de façon déterministe. Aucun ordre officiel des futures valeurs n'est inventé.

Le rang positif intra-carte est stocké dans `sort_order`, y compris pour les variantes standard non confirmées. L'éligibilité est filtrée ensuite.

## Numéros, dates, images et Pokémon

Le tri naturel reconnaît `préfixe lettres + entier + suffixe lettres`, avec entier `BigInt`. La numérotation principale précède les groupes préfixés, classés canoniquement puis naturellement. Exemple : `1, 2, 2A, 3, 10`, puis groupes GG/SV/TG. La forme originale départage `1`/`001`. Les autres formes (`!`, `%3F`, lettres Zarbi, `ONE`/`TWO`/`THREE`/`FOUR`) produisent un diagnostic et un fallback canonique après les formats reconnus. Le rang positif intra-set est matérialisé dans `normalized_number`.

Une date fiable est une date calendrier complète `YYYY-MM-DD`. Un objet linguistique fournit uniquement sa date `fr` ; une date globale scalaire est acceptée. Une date étrangère n'est pas choisie arbitrairement dans un objet sans FR.

La carte résout son fallback selon date propre de carte, produit/coffret fiable, set FR/global ; un override de carte peut le remplacer. **La date effective utilisée pour le classement appartient à chaque variante** : date spécifique fiable, sinon `card.date` avec `card.dateOrigin`, sinon `NULL`. Une variante peut sortir après la carte de base ; les autres variantes ne sont pas déplacées arbitrairement avec elle. La valeur et la provenance sont persistées dans `catalog_variants.effective_release_date` et `date_origin`.

Le type `Variant` contient `date: string | null` et `dateOrigin: 'variant' | 'card' | 'product' | 'set' | 'override' | 'unknown'`. La validation réutilise `z.iso.date()`. Une date héritée conserve sa provenance réelle ; elle n'est jamais présentée comme spécifique à la variante. Le snapshot inspecté (`interfaces.d.ts`, `variant_detailed`, booléens legacy et compilateur de variantes) ne fournit pas de date propre de variante ni de lien produit daté exploitable. Les cartes importées utilisent actuellement le fallback set, transmis à leurs variantes. Les provenances `variant` et `product` restent prévues sans source artificielle. Sans date fiable : `NULL`, après toutes les dates connues dans le tri Pokémon. Le diagnostic existant au niveau carte reste suffisant ; aucun diagnostic par variante n'est généré pour ce cas.

Les URL suivent le compilateur source : carte `https://assets.tcgdex.net/fr/<serie>/<set>/<localId>/high.webp`, logo FR, symbole `univ`. Les segments déjà encodés comme `%3F` ne sont pas encodés deux fois. Les variantes partagent normalement l'image principale ; un override peut la remplacer. Ces URL déterministes ne garantissent pas l'existence de l'asset : aucun index CDN mutable, téléchargement ou sondage HTTP ne décide de la structure. Le futur frontend devra gérer les images manquantes. Un compteur d'URL non nulles n'est pas un audit HTTP.

Les Pokémon proviennent des `dexId` effectifs après overrides : entiers positifs, sans doublons. Plusieurs dex créent plusieurs relations. `cameoDexIds` est ignoré pour les cibles et compté séparément. Aucun nom de carte, suffixe ou forme ne sert à deviner un nom Pokémon.

### Référentiel des noms français

`npm run pokemon:update` génère manuellement le mapping complet `dex_number → nom FR` depuis la liste paginée PokéAPI `pokemon-species` et ses ressources par ID. Seule l'entrée `names[].language.name === "fr"` est retenue, avec sa typographie exacte. Le [guide de maintenance](../data/pokemon/README.md) décrit les endpoints, six requêtes simultanées maximum, les timeouts/retries limités et la publication atomique après validation complète. Un échec ou une espèce sans nom FR laisse l'ancien fichier intact.

Avant tout accès DB, la CLI charge une seule fois `data/pokemon/pokemon-fr.json` via `loadPokemonReference`. Le schéma Zod refuse les formes/champs inattendus, clés non canoniques, numéros invalides et noms nuls/vides ; le contrôle des clés JSON détecte aussi les doublons échappés. Le générateur réseau n'est jamais importé ni appelé par la synchronisation. Aucun appel PokéAPI ou fallback implicite ne se produit si le fichier manque ou est invalide : l'exécution échoue sans écriture DB.

Le plan utilise ce mapping comme autorité pour `pokemon.name_fr`, en conservant `pokemon.id` par `dex_number`, y compris sur les lignes historiques inactives. Un numéro absent donne `NULL` et le diagnostic `pokemon-name-missing` ; le Pokémon reste présent et le total apparaît dans `catalogue.pokemon_without_name` et en console. Les noms de cartes et formes ne sont jamais consultés pour ce lookup.

Le hash SHA-256 du mapping canonique validé (clés triées lexicalement sans locale, JSON sans espaces, noms inchangés) est exposé dans `pokemon_reference.hash`, avec le nombre d'entrées, et enregistré dans le JSON existant `private.catalog_sync_runs.report` lors de l'apply. Un rapport d'échec local inclut l'empreinte si le fichier a pu être validé. Aucune migration n'est nécessaire.

Le déterminisme dépend désormais du snapshot TCGdex, du référentiel local, des overrides et du code ; l'état initial de PostgreSQL fixe les IDs déjà attribués. Un changement de nom seul modifie uniquement les métadonnées du Pokémon. Les listes de variantes, hashes et `generation_version` des cibles restent inchangés.

## Overrides Git

Les fichiers `*.json` directement dans [`data/catalog-overrides/`](../data/catalog-overrides/) contiennent des tableaux d'actions. Le [guide et les exemples](../data/catalog-overrides/README.md) complètent le schéma Zod strict de `overrides.ts`. Le fichier initial est vide : aucun correctif réel n'est inventé.

Chaque action possède un ID durable et une raison non vide. Actions : `card.patch`, `card.add`, `variant.patch`, `variant.add`, `mapping.include`, `mapping.exclude`. Les patches portent uniquement sur les noms, catégorie, rareté, image, date, propriétés de variante, disponibilité et activité autorisés. Une carte locale reçoit `my:<id-override>`, sans faux ID TCGdex. Une variante source est ciblée par sa clé originale ; une variante ajoutée séparément par `my:<id-override>`.

Ordre de dépendance : ajouts de cartes, ajouts de variantes, patches/rattachements ; chaque groupe est trié par ID. Deux corrections du même champ ou rattachement sont refusées. Sont également bloquants : JSON invalide, action/champ inconnu, ID dupliqué, cible inconnue, set manquant, date/dex invalide, Jumbo, doublon ou conflit d'identité final. Une entité absente du snapshot mais connue de PostgreSQL peut être ciblée si son set est encore reconnu ; carte et variantes repartent inactives et doivent être maintenues explicitement.

`variant.add` accepte une date ISO facultative : absente, elle hérite de la carte ; présente, elle définit une date d'origine `override`. `variant.patch` accepte `date` : une date complète impose `override`, `date:null` retire la correction spécifique et rétablit la date/provenance de la carte. L'absence du champ dans un patch conserve la date en cours. Les variantes déclarées dans `card.add` suivent les mêmes règles. Les fallbacks des variantes courantes ou ajoutées sont finalisés après tous les patches de carte, indépendamment de l'ordre lexical des IDs d'override ; les dates spécifiques sont conservées.

Les variantes historiques reconstruites depuis la DB conservent leur date et provenance persistées, même lors d'un patch descriptif. Les variantes absentes du snapshot, y compris celles d'une carte toujours présente, conservent également ces colonnes lors de leur désactivation. Un `date:null` explicite sur une variante historique demande le fallback de sa carte, dont la provenance reste `unknown` si elle n'est pas historiquement connue.

Un patch égal à sa valeur source est signalé comme redondant sans être supprimé. `private.catalog_overrides` conserve valeurs source/effectives ciblées, raison, redondance, état appliqué et dernier run. Les mappings utilisent cette même table. Git demeure l'autorité ; le frontend ne fusionne rien. Retirer un override désactive sa trace ; les ajouts locaux retirés deviennent inactifs sans suppression.

Le hash des corrections est le SHA-256 du JSON canonique des actions validées triées par ID : clés d'objet triées, tableaux conservés. Les espaces des fichiers ne créent pas de version sémantique.

## Diff, identités et transaction

Rapprochement : Pokémon par dex, séries/sets/cartes par ID TCGdex, variantes par carte et clé. Des aliases privés, créés seulement pour les ajouts locaux et variantes corrigées, préservent les IDs après correction, retrait ou réactivation. Ils sont conservés avec FK restrictives, sans exposition API.

Le plan distingue créations, modifications, réactivations, disparitions, désactivations, inchangés et différences de mappings. Les doublons sont vérifiés aussi contre les lignes historiques inactives. Aucun truncate ni remplacement global. Une disparition conserve la ligne, normalement `source_present=false`, `is_active=false`. Une donnée locale peut être `origin=my`, absente de la source et active. Corriger une entité TCGdex ne change pas automatiquement son origine.

Le dry-run utilise `REPEATABLE READ READ ONLY` : aucun run, alias ou écriture, aucun `nextval`. Les IDs nouveaux sont prédits depuis les séquences lues afin de calculer les mêmes structures/hashes que l'apply sur le même état.

L'apply verrouille le pipeline et les tables catalogue/techniques, relit l'état puis valide le plan avant toute écriture. Il réserve les vrais IDs avec `nextval`, vérifie les prédictions puis insère via `OVERRIDING SYSTEM VALUE`. Une concurrence sur les séquences provoque un échec explicite. Les séquences PostgreSQL ne sont pas transactionnelles : un échec peut laisser des trous, sans catalogue partiellement importé. Un noop ne réserve aucun ID.

Les lignes modifiées sont écrites par lots de 1 000, avec paramètres JSON et types SQL ; les mappings sont appliqués en différences. Catalogue, mappings, aliases, corrections et états partagent une transaction. Une erreur annule les données ; un journal technique `failed` peut être ajouté après rollback. Une erreur de parsing/validation ne produit aucune écriture DB. Les statuts `running`/`success` sont enregistrés dans la transaction de réussite, avec statistiques compactes ; le fichier local conserve les détails.

## Structures et versionnement

Éligibilité : variante standard, active, `confirmed`, carte et set actifs. La cible Pokémon nécessite le rattachement effectif ; la cible Set inclut toutes les catégories.

Ordre Pokémon : **date effective de variante** croissante, `NULL` strictement en dernier, rang de numéro de carte, rang de variante, clé de carte, identité de variante. Ordre Set inchangé : les mêmes critères sans date. Les départages techniques ne changent pas ces priorités. Ainsi A Normal (2020-01-01), A Promo (2021-01-01) et B Normal (2020-06-01) donnent A Normal → B Normal → A Promo pour Pokémon, tandis que le set conserve A Normal → A Promo → B Normal si A précède B par numéro.

Le hash est exactement `SHA-256(UTF-8(JSON.stringify(ids)))`, avec les IDs internes de variantes sous forme de chaînes décimales, dans leur ordre final. Exemple : `["12","47","103"]`. Les métadonnées n'entrent pas directement dans le hash ; une date agit seulement si elle change l'ordre.

Chaque set pertinent reçoit un état, même vide ; chaque Pokémon avec variante éligible reçoit un état. Un ancien état peut devenir vide. Version initiale `1`, puis `+1` uniquement si le hash diffère. Sinon hash, version, ID et timestamp restent inchangés. Une seconde application identique n'a aucun effet fonctionnel ; seul le journal peut évoluer.

## Rapports et validation

Le résumé console affiche snapshot, empreinte du référentiel des noms et noms manquants, volumes, FR, Jumbo, diff, mappings, overrides, dates, cibles, diagnostics, durée et résultat. Le JSON complet dans `.cache/catalog-reports/` inclut listes ordonnées par cible et hash du plan. Les rapports sont ignorés par Git ; aucune sortie de pilote, chaîne de connexion ou secret n'est recopiée.

`variant_dates` compte les six provenances (`variant`, `card`, `product`, `set`, `override`, `unknown`) sur l'état final complet, variantes historiques retenues comprises. `catalogue.variants_without_date` compte les dates effectives NULL. Les compteurs `dates` existants restent ceux des cartes. Ces compteurs sont affichés en console et enregistrés dans le rapport du run ; zéro est conservé pour les provenances non utilisées.

La [migration de date de variante](../supabase/migrations/20260908083516_phase2_variant_release_dates.sql) doit être appliquée localement avant ce pipeline avec `supabase migration up --local`, sans reset du volume existant. Elle copie les dates de cartes avec provenance `unknown`, faute de provenance historique persistée, puis le pipeline recalcule les valeurs. Le [rapport dédié](reports/2026-09-08-PHASE2-VARIANT-DATES.md) conserve les preuves de migration, de reconstruction en base shadow et des applications locales.

Les tests couvrent unités Vitest, intégration complète sur dataset synthétique hors ligne et schéma/RLS pgTAP. L'intégration vérifie notamment les IDs, corrections, données locales, disparitions/rétablissements, hashes, versions, conservation des données utilisateur et rollback après erreur SQL tardive.

```sh
npm ci
npm run supabase:start
npm run db:reset
npm run db:test
npm run db:lint
npm run catalog:test:db
npm run db:types
npm run typecheck
npm run build
npm run lint
npm test
npm run db:reset
npm run catalog:sync -- --snapshot <SHA_COMPLET> --dry-run
# Lire le rapport, puis :
npm run catalog:sync -- --snapshot <SHA_COMPLET> --apply
npm run catalog:sync -- --snapshot <SHA_COMPLET> --apply
npm run supabase:stop
```

`db:reset` détruit exclusivement les données locales ; il n'est pas nécessaire à une synchronisation normale. L'intégration attend une base sans catalogue réel et annule toutes les fixtures. Les tests peuvent consommer des séquences malgré rollback, d'où le reset avant la mesure reproductible du premier import. L'arrêt normal conserve le volume importé.

## Recherche de maintenance `catalog:find`

```sh
npm run catalog:find -- "Pikachu Légendes Brillantes"
npm run catalog:find -- "Pikachu 28"
npm run catalog:find -- "Raichu GX"
npm run catalog:find -- "Évoli Promo" --limit 10
```

La CLI reçoit une seule chaîne libre entre guillemets. Elle affiche **Card**, nom de carte, Pokémon liés, set, numéro et nombre de variantes. **Card** contient directement `tcgdex:<tcgdex_id>` ou l'alias réel `my:<id-override>` d'une carte locale. La colonne nom distingue notamment les suffixes GX/ex et les Dresseurs sans Pokémon rattaché. Un nom manquant reste `—` ; un Pokémon sans nom est identifié par son dex, un set sans nom par son ID source. Le numéro affiche le `local_id` original et le total officiel du set lorsqu'il existe. Aucune traduction ou relation n'est inventée.

### Séparation du moteur, de la lecture et du terminal

- `search-catalog.ts` est pur et sans import Node/SQL/CLI. Il expose `normalizeSearchText`, `tokenizeSearchQuery` et `searchCatalog(entries, query, { limit })`.
- `search-catalog-db.ts` réutilise `connect()` et tous ses garde-fous locaux. Une seule projection SQL récupère les champs utiles ; les rattachements Pokémon et les nombres de variantes sont agrégés séparément pour éviter leur multiplication. Les Pokémon sont ordonnés par dex. Les cartes inactives restent recherchables pour la maintenance, avec leur état signalé dans la sortie. Toutes les variantes standard stockées sont comptées, quel que soit leur état d'activité ou de disponibilité ; les Jumbo sont exclues.
- `catalog-find.ts` gère les arguments, erreurs, limites et colonnes terminal. La logique de matching n'y réside pas.

`CatalogSearchEntry` contient `id` interne sous forme de chaîne, `card` copiable, `tcgdexId` nullable, `name` français nullable, `localId`, `isActive`, `variantCount`, les Pokémon `{ dexNumber, name }` réellement rattachés, et le set `{ tcgdexId, name, abbreviation, abbreviationFr, officialCardCount }`. Les champs nullable conservent l'absence source. Le résultat contient la requête, les termes normalisés, le total avant limite et les résultats `{ entry, score, matches }` ; chaque correspondance indique terme, champ, type et poids. La stratégie pourra évoluer derrière ce contrat sans dépendre du terminal.

### Normalisation et pertinence

La comparaison utilise Unicode NFKD, suppression des marques combinatoires, minuscules, conversion des ligatures `œ/æ`, uniformisation des apostrophes/tirets typographiques, trim et espaces normalisés. Les valeurs originales ne sont jamais modifiées. La tokenisation sépare espaces et ponctuation courante, conserve les points/deux-points/tirets/slash des IDs et numéros, retire les tokens sans lettre/chiffre et déduplique les termes.

Tous les termes doivent avoir une correspondance sur **la même carte**, mais peuvent utiliser des champs distincts ou plusieurs Pokémon liés. Les champs sont : nom carte, noms Pokémon, nom set, numéro local, abréviations FR/source, ID TCGdex, cible copiable et ID du set. Une correspondance du nom de carte reste une correspondance textuelle : elle ne crée jamais un rattachement Pokémon. Un terme peut aussi correspondre au nom du set ; par exemple « Pikachu » peut retrouver des cartes du Kit du dresseur Pikachu Libre, avec leurs vrais Pokémon affichés.

Pour chaque terme textuel, seule la meilleure correspondance est retenue :

| Correspondance | Poids |
|---|---:|
| Champ exact : nom carte | 120 |
| Champ exact : nom Pokémon | 110 |
| Champ exact : numéro/local ID alphanumérique | 100 |
| Champ exact : nom set | 90 |
| Champ exact : abréviation | 85 |
| Champ exact : identifiant | 80 |
| Mot entier à l'intérieur d'un champ | 60 |
| Préfixe du champ ou d'un mot | 40 |
| Sous-chaîne | 15 |

Un terme entièrement numérique est recherché uniquement dans le numéro local, jamais dans un texte, un ID technique ou le total du set pris isolément. Les zéros initiaux n'empêchent pas une correspondance. Numéro exact sans préfixe/suffixe : 200 ; composante exacte d'un numéro comme `TG028` ou `28A` : 160 ; préfixe numérique comme `28` pour `280` ou `SWSH285` : 80. `128` ne correspond pas à `28`. Une fraction comme `28/73` exige aussi le total officiel 73 et un numéro exact, sans élargissement par préfixe.

Le score additionne les meilleures correspondances de tous les termes, plus au maximum un bonus de champ exact pour la requête normalisée complète (mêmes poids que le tableau). À égalité : nom carte normalisé, nom set normalisé, numéro local normalisé, ID TCGdex ou alias, puis ID interne. Les départages sont lexicaux et indépendants de la locale et de l'ordre SQL. Aucun ordre de retour SQL implicite ne détermine la pertinence.

### Limites, erreurs et lecture seule

Par défaut, 20 résultats sont affichés avec le total ; `--limit` accepte un entier de 1 à 100. Aucun résultat donne un message explicite et un code de sortie `0`. Une recherche vide, sans terme utile, plusieurs chaînes séparées ou des options invalides donnent l'usage et un code `1`, avant toute connexion DB.

Si Supabase local est indisponible ou sa configuration refusée, la CLI propose `npm run supabase:start` et rappelle la restriction au loopback `55322/postgres`. Une erreur de lecture/validation du catalogue est distinguée d'une absence de résultats. Les erreurs de pilote, stacks, secrets, valeurs d'environnement et chaînes de connexion ne sont jamais recopiés.

La projection est lue dans une transaction `REPEATABLE READ READ ONLY`, avec timeout SQL de 15 secondes, puis rollback et fermeture de la connexion. La requête libre n'est jamais interpolée dans le SQL. Aucun run, override, alias, séquence, donnée catalogue ou utilisateur n'est écrit. Aucun accès cloud, appel PokéAPI, lecture du snapshot TCGdex ou synchronisation implicite.

Cette CLI charge la projection complète dans son processus local, adaptée au catalogue actuel d'environ 20 000 cartes. Cela ne constitue pas la stratégie du futur navigateur, qui devra recevoir des données filtrées et paginées. Aucune infrastructure, extension, migration, API/RPC ou UI de recherche n'est ajoutée. Les [preuves locales](reports/2026-09-07-PHASE2-CATALOG-FIND.md) mesurent le temps du moteur et comparent intégralement l'état avant/après.

## Points restant ouverts

Restent à cadrer : déploiement/opt-in distant, cadence, CI, automatisation, seuils d'alerte, vérification historique de variantes rares, dates de promotions/coffrets absentes de la source, politique éventuelle des cameos, interface de maintenance et traitement visuel des images manquantes. La source et la maintenance manuelle des noms français d'espèces sont désormais cadrées et implémentées.

Auth, frontend métier, recherche UI, notifications et opérations de collections restent des phases ultérieures. Langage, cache, JSON/Zod, identité, stamps, FR, Jumbo, numéros, dates inconnues, ordre, transaction, dry-run, hash et version sont désormais implémentés et testés.
