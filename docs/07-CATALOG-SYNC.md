# Pipeline catalogue et synchronisation TCGdex de MY.

## Rôle et état

Ce document est la référence du pipeline V1. Il applique la [politique TCGdex](02-TCGDEX.md), le [modèle](03-DATA-MODEL.md) et le [schéma SQL](06-DATABASE.md). La Phase 2 implémente le pipeline et le premier catalogue **sur Supabase local**. Son déploiement cloud reste séparé. La Phase 1 est déjà déployée dans le cloud, selon la validation du propriétaire.

```text
Snapshot Git exact → lecture TypeScript → normalisation FR → overrides JSON Git
→ validation → plan PostgreSQL → dry-run → application transactionnelle
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
| `database.ts`, `plan.ts` | Connexion, état existant, identités, diff et structures |
| `apply.ts` | Réservation des IDs, écritures batchées et traces |
| `report.ts`, `cli.ts` | Commandes, transaction, rapport et erreurs |
| `catalog.test.ts`, `integration.ts`, `fixtures.ts` | Tests unitaires et intégration annulée |

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

La seule source automatique est [`tcgdex/cards-database`](https://github.com/tcgdex/cards-database). REST reste réservé aux diagnostics ; aucune API de Pokémon, prix ou assets ne complète silencieusement le dataset.

Le clone/fetch peu profond est conservé dans `.cache/tcgdex/cards-database/`, ignoré par Git. L'origine et la propreté sont vérifiées avant checkout détaché. `.cache/tcgdex/pipeline.lock` empêche deux processus de changer simultanément le snapshot. Après un arrêt brutal, vérifier l'absence de run actif avant de retirer un verrou périmé. Aucun dataset complet n'est versionné dans MY.

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

Les propriétés utilisent les valeurs canoniques upstream. Les stamps sont triés indépendamment de la locale. Label, langue, image, tiers et prix ne participent jamais à l'identité. `UNIQUE(source_card_id, variant_key)` reste en place.

Pour les variantes détaillées, `source_variant_id` reproduit l'identifiant du `variantUtil.ts` inspecté : valeurs anglaises, taille explicite, clés triées, hash entier base 31 rendu en base 36. Il reste distinct de la clé MY. Pour le legacy, il vaut `NULL` ; `generated` n'est jamais stocké.

### Ordre

Ordre macro : Normal, Normal avec stamps ; Holo, Holo avec stamps, Holo avec foil, Holo avec foil/stamps ; les quatre groupes Reverse équivalents ; autres types. Poké Ball précède Master Ball. Aux niveaux égaux, type, foil canonique, stamps, subtype et identité départagent de façon déterministe. Aucun ordre officiel des futures valeurs n'est inventé.

Le rang positif intra-carte est stocké dans `sort_order`, y compris pour les variantes standard non confirmées. L'éligibilité est filtrée ensuite.

## Numéros, dates, images et Pokémon

Le tri naturel reconnaît `préfixe lettres + entier + suffixe lettres`, avec entier `BigInt`. La numérotation principale précède les groupes préfixés, classés canoniquement puis naturellement. Exemple : `1, 2, 2A, 3, 10`, puis groupes GG/SV/TG. La forme originale départage `1`/`001`. Les autres formes (`!`, `%3F`, lettres Zarbi, `ONE`/`TWO`/`THREE`/`FOUR`) produisent un diagnostic et un fallback canonique après les formats reconnus. Le rang positif intra-set est matérialisé dans `normalized_number`.

Une date fiable est une date calendrier complète `YYYY-MM-DD`. Un objet linguistique fournit uniquement sa date `fr` ; une date globale scalaire est acceptée. Une date étrangère n'est pas choisie arbitrairement dans un objet sans FR.

Priorité : date propre de carte, produit/coffret fiable, set FR/global ; un override peut tout remplacer. Le snapshot inspecté ne fournit pas de date propre ni de relation produit datée exploitable pour les cartes importées : toutes utilisent le fallback set. La fonction de priorité teste le niveau produit, mais aucun champ produit hypothétique ni recherche externe n'est inventé. Les dates promotionnelles précises peuvent être corrigées par un override documenté. Sans date fiable : `NULL`, diagnostic et placement après les cartes datées dans l'ordre Pokémon.

Les URL suivent le compilateur source : carte `https://assets.tcgdex.net/fr/<serie>/<set>/<localId>/high.webp`, logo FR, symbole `univ`. Les segments déjà encodés comme `%3F` ne sont pas encodés deux fois. Les variantes partagent normalement l'image principale ; un override peut la remplacer. Ces URL déterministes ne garantissent pas l'existence de l'asset : aucun index CDN mutable, téléchargement ou sondage HTTP ne décide de la structure. Le futur frontend devra gérer les images manquantes. Un compteur d'URL non nulles n'est pas un audit HTTP.

Les Pokémon proviennent des `dexId` effectifs après overrides : entiers positifs, sans doublons. Plusieurs dex créent plusieurs relations. `cameoDexIds` est ignoré pour les cibles et compté séparément. Aucun nom de carte, suffixe ou forme ne sert à deviner un nom Pokémon. `pokemon.name_fr` peut rester `NULL` ; les noms absents sont comptés. Leur source fiable reste à cadrer.

## Overrides Git

Les fichiers `*.json` directement dans [`data/catalog-overrides/`](../data/catalog-overrides/) contiennent des tableaux d'actions. Le [guide et les exemples](../data/catalog-overrides/README.md) complètent le schéma Zod strict de `overrides.ts`. Le fichier initial est vide : aucun correctif réel n'est inventé.

Chaque action possède un ID durable et une raison non vide. Actions : `card.patch`, `card.add`, `variant.patch`, `variant.add`, `mapping.include`, `mapping.exclude`. Les patches portent uniquement sur les noms, catégorie, rareté, image, date, propriétés de variante, disponibilité et activité autorisés. Une carte locale reçoit `my:<id-override>`, sans faux ID TCGdex. Une variante source est ciblée par sa clé originale ; une variante ajoutée séparément par `my:<id-override>`.

Ordre de dépendance : ajouts de cartes, ajouts de variantes, patches/rattachements ; chaque groupe est trié par ID. Deux corrections du même champ ou rattachement sont refusées. Sont également bloquants : JSON invalide, action/champ inconnu, ID dupliqué, cible inconnue, set manquant, date/dex invalide, Jumbo, doublon ou conflit d'identité final. Une entité absente du snapshot mais connue de PostgreSQL peut être ciblée si son set est encore reconnu ; carte et variantes repartent inactives et doivent être maintenues explicitement.

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

Ordre Pokémon : date croissante, `NULL` en dernier, rang de numéro, rang de variante, clé de carte, identité de variante. Ordre Set : les mêmes critères sans date. Les départages techniques ne changent pas ces priorités.

Le hash est exactement `SHA-256(UTF-8(JSON.stringify(ids)))`, avec les IDs internes de variantes sous forme de chaînes décimales, dans leur ordre final. Exemple : `["12","47","103"]`. Les métadonnées n'entrent pas directement dans le hash ; une date agit seulement si elle change l'ordre.

Chaque set pertinent reçoit un état, même vide ; chaque Pokémon avec variante éligible reçoit un état. Un ancien état peut devenir vide. Version initiale `1`, puis `+1` uniquement si le hash diffère. Sinon hash, version, ID et timestamp restent inchangés. Une seconde application identique n'a aucun effet fonctionnel ; seul le journal peut évoluer.

## Rapports et validation

Le résumé console affiche snapshot, volumes, FR, Jumbo, diff, mappings, overrides, dates, cibles, diagnostics, durée et résultat. Le JSON complet dans `.cache/catalog-reports/` inclut listes ordonnées par cible et hash du plan. Les rapports sont ignorés par Git ; aucune sortie de pilote, chaîne de connexion ou secret n'est recopiée.

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

## Points restant ouverts

Restent à cadrer : déploiement/opt-in distant, cadence, CI, automatisation, seuils d'alerte, vérification historique de variantes rares, dates de promotions/coffrets absentes de la source, noms Pokémon, politique éventuelle des cameos, interface de maintenance et traitement visuel des images manquantes.

Auth, frontend métier, recherche UI, notifications et opérations de collections restent des phases ultérieures. Langage, cache, JSON/Zod, identité, stamps, FR, Jumbo, numéros, dates inconnues, ordre, transaction, dry-run, hash et version sont désormais implémentés et testés.
