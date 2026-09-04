# Schéma PostgreSQL / Supabase de la V1 de MY.

## Rôle du document

Ce document constitue la source de vérité concernant le schéma PostgreSQL / Supabase retenu pour la V1 de **MY.**. Il traduit le [modèle de données conceptuel](03-DATA-MODEL.md) en tables principales, identifiants, relations, contraintes, règles de suppression, principes RLS, index et opérations métier.

Il complète la [vision](00-VISION.md), les [fonctionnalités](01-FEATURES.md), la [politique TCGdex](02-TCGDEX.md), les [principes UX/UI](04-UX-UI.md) et l'[architecture technique](05-ARCHITECTURE.md).

Ce document ne constitue ni une migration SQL prête à exécuter, ni le code final des politiques RLS ou des RPC. Les choix explicitement laissés ouverts à la fin du document ne doivent pas être inventés pendant l'implémentation.

## Principes structurants

PostgreSQL via Supabase est la source de vérité persistante de MY. Le modèle sépare strictement :

1. le catalogue global, commun à tous les utilisateurs ;
2. les données utilisateur, dont les collections, exemplaires et partages ;
3. les données techniques ou privilégiées nécessaires à la synchronisation et aux corrections.

```text
TCGdex / cards-database
          ↓
Catalogue global MY.
          ↓
Variantes de catalogue
    ├────────→ Éléments de collection
    └────────→ Exemplaires physiques
```

Une collection et un exemplaire référencent la même variante du catalogue. Les informations descriptives d'une carte ne sont pas dupliquées dans les collections, et les exemplaires ne sont pas rattachés à une collection particulière.

## Organisation des schémas PostgreSQL

Le schéma `auth` reste géré par Supabase.

Le schéma applicatif exposé contient les tables et fonctions nécessaires au fonctionnement normal de MY. Le schéma `public` peut remplir ce rôle, sous réserve de permissions et de politiques RLS adaptées.

Un schéma `private`, ou un périmètre non exposé équivalent, accueille les mécanismes techniques et privilégiés qui ne doivent pas être directement accessibles au frontend, notamment :

- les exécutions de synchronisation ;
- les corrections internes du catalogue ;
- les corrections de rattachement Pokémon ;
- les métadonnées réservées au pipeline ;
- les éventuelles fonctions administratives.

Le frontend ne doit jamais recevoir un accès général à ce périmètre privé.

## Identifiants et dates

### Données utilisateur

Les principales entités utilisateur utilisent des UUID :

- `profiles` ;
- `collections` ;
- `collection_items` ;
- `physical_copies` ;
- `collection_shares`.

Leur génération peut utiliser les mécanismes standards de PostgreSQL et Supabase. Le choix de l'UUID permet notamment de rester cohérent avec `auth.users.id`.

### Catalogue

Les principales entités du catalogue utilisent des identifiants internes compacts de type `BIGINT` avec identité PostgreSQL :

- `pokemon` ;
- `tcg_series` ;
- `tcg_sets` ;
- `source_cards` ;
- `catalog_variants` ;
- `automatic_target_states`.

Les identifiants TCGdex restent des références externes séparées. Ils ne sont pas les clés primaires principales de MY. Ils reçoivent une contrainte d'unicité lorsqu'elle est pertinente pour l'entité concernée.

### Dates techniques

Les timestamps techniques utilisent `TIMESTAMPTZ`. Les tables mutables importantes disposent de `created_at` et `updated_at` lorsque ces champs sont pertinents, avec une valeur initiale correspondant à la date courante. Le mécanisme commun de maintien de `updated_at` sera choisi lors de l'implémentation.

## Vue relationnelle simplifiée

```text
auth.users
    └── 1:1 profiles
          ├── 1:N collections
          │     ├── 1:N collection_items
          │     │     └── N:1 catalog_variants
          │     └── 1:N collection_shares
          └── 1:N physical_copies
                └── N:1 catalog_variants

tcg_series
    └── 1:N tcg_sets
          └── 1:N source_cards
                ├── 1:N catalog_variants
                └── N:N pokemon via card_pokemon

pokemon ── cible possible d'une collection automatique
tcg_sets ─ cible possible d'une collection automatique
```

## Tables principales

### Catalogue applicatif

- `pokemon`
- `tcg_series`
- `tcg_sets`
- `source_cards`
- `catalog_variants`
- `card_pokemon`
- `automatic_target_states`

### Données utilisateur

- `profiles`
- `collections`
- `collection_items`
- `physical_copies`
- `collection_shares`

### Données techniques et privilégiées

- `private.catalog_sync_runs`
- `private.catalog_overrides`
- `private.card_pokemon_overrides`, ou structure privilégiée équivalente
- les seules autres métadonnées démontrées nécessaires par le pipeline catalogue

Cette liste ne doit être étendue que pour répondre à un besoin réel non couvert.

## Catalogue global

### `pokemon`

La table `pokemon` représente les Pokémon utilisables notamment comme cibles de collections automatiques.

| Donnée | Type ou rôle retenu |
|---|---|
| `id` | Identifiant interne `BIGINT` |
| `dex_number` | Numéro du Pokédex national, obligatoire et unique |
| `name_fr` | Nom français |
| `is_active` | État d'activité dans MY. |
| timestamps | Création et mise à jour lorsque pertinentes |

Le numéro du Pokédex national est la référence fonctionnelle principale ; l'ID interne est utilisé par les relations de la base.

### `tcg_series`

La table `tcg_series` représente les séries ou blocs TCGdex, par exemple *Sun & Moon*, *Sword & Shield* ou *Scarlet & Violet*. Une série ou un bloc ne doit jamais être confondu avec une extension précise.

Elle conserve notamment :

- un `id` interne `BIGINT` ;
- un `tcgdex_id`, unique lorsqu'il existe ;
- le nom français et le nom source ;
- un ordre stable ;
- un état actif ;
- les métadonnées source utiles ;
- les timestamps pertinents.

### `tcg_sets`

La table `tcg_sets` représente les extensions ou sets précis, par exemple *Légendes Brillantes*, *151* ou *Évolutions à Paldea*.

Elle conserve notamment :

- un `id` interne `BIGINT` ;
- un `tcgdex_id`, unique lorsqu'il existe ;
- le `series_id` de sa série ou de son bloc ;
- le nom français et le nom source ;
- les abréviations utiles, dont l'abréviation française lorsqu'elle existe ;
- la date de sortie ;
- le nombre officiel de cartes ;
- un ordre stable ;
- les URL du logo et du symbole ;
- un état actif ;
- les métadonnées source et timestamps utiles.

La relation est `tcg_series 1 → N tcg_sets`. Une collection automatique de type Extension référence un set précis, jamais une série ou un bloc.

### `source_cards`

Une ligne de `source_cards` représente une carte de base avant distinction de ses variantes.

Elle conserve notamment :

- un `id` interne `BIGINT` ;
- le `tcgdex_id` externe ;
- le `local_id` ;
- le `set_id` obligatoire ;
- le nom français ;
- la catégorie ;
- la rareté ;
- l'URL de l'image ;
- un ordre normalisé dans le set ;
- la date de mise à jour de la source ;
- la présence actuelle dans la source ;
- l'état actif dans MY. ;
- l'origine TCGdex ou MY. ;
- les timestamps pertinents.

Une carte appartient à exactement un set. Son ordre normalisé doit être stable et ne doit pas reposer uniquement sur un tri textuel naïf de `local_id`. L'algorithme final de calcul reste du ressort du pipeline TCGdex.

La valeur d'origine doit distinguer au minimum une carte issue de TCGdex d'un ajout local MY., sans figer ici le type SQL ou le nom final de l'énumération.

### `catalog_variants`

La table `catalog_variants` est l'unité centrale du catalogue : **une ligne représente une variante collectible distincte**.

Une carte Normal, Reverse, Holo ou munie d'un stamp pertinent produit ainsi des variantes différentes lorsqu'elles existent réellement en français.

La table conserve notamment :

- un `id` interne `BIGINT` ;
- le `source_card_id` obligatoire ;
- l'éventuel identifiant de variante fourni par la source ;
- un `variant_key` stable dans la carte source ;
- un label d'affichage ;
- les propriétés structurées utiles, dont type, subtype, taille, stamp et foil ;
- une éventuelle URL d'image spécifique ;
- la disponibilité française ;
- un ordre stable dans la carte ;
- l'origine TCGdex ou MY. ;
- la présence actuelle dans la source ;
- l'état actif dans MY. ;
- les timestamps pertinents.

L'identité principale d'une variante est son ID interne MY. Elle ne change pas à la suite d'une simple correction de la donnée source.

#### `variant_key`

Chaque variante possède une clé stable à l'intérieur de sa carte source. La contrainte conceptuelle est :

```text
UNIQUE(source_card_id, variant_key)
```

Le mécanisme final de génération de `variant_key` reste ouvert. Cette clé doit néanmoins permettre d'identifier durablement une variante même lorsque TCGdex ne fournit pas un identifiant directement exploitable.

#### Disponibilité française

La disponibilité française distingue au minimum trois états conceptuels :

- confirmée ;
- inconnue ou non déterminée ;
- non disponible.

Le nom final des valeurs et leur type SQL restent ouverts. Un simple booléen n'est pas suffisant, car l'absence d'information ne signifie pas une indisponibilité confirmée.

Une variante est éligible à une génération automatique de la V1 seulement si elle est notamment :

- active ;
- confirmée comme disponible en français ;
- liée à une carte active ;
- liée à un set actif ;
- compatible avec la cible demandée.

Cette éligibilité peut rester dérivée tant qu'aucun besoin ne justifie de la matérialiser.

#### Variantes locales

Une variante française réelle absente de TCGdex peut être ajoutée localement avec une identité MY., une carte source, un `variant_key`, ses métadonnées et une origine locale.

Elle fonctionne ensuite comme toute autre variante dans le catalogue, les collections, les exemplaires, la recherche et les générations automatiques.

### `card_pokemon`

La table `card_pokemon` matérialise la relation plusieurs-à-plusieurs entre `source_cards` et `pokemon`. Une carte peut ne représenter aucun Pokémon, en représenter un ou en représenter plusieurs.

La contrainte principale est :

```text
UNIQUE(card_id, pokemon_id)
```

La relation effective peut aussi conserver les informations techniques strictement utiles à la provenance du rattachement.

### Corrections de rattachement Pokémon

Une structure privilégiée telle que `private.card_pokemon_overrides` permet d'ajouter un rattachement manquant ou d'exclure un rattachement source incorrect. Elle peut distinguer les actions conceptuelles `include` et `exclude`, conserver leur raison et leurs timestamps.

Le résultat effectif doit être déterministe et donner priorité à la correction MY. validée. Le SQL final et la forme physique exacte de cette structure restent ouverts.

### Corrections de champs du catalogue

Une structure privilégiée telle que `private.catalog_overrides` permet de distinguer la valeur source de la correction locale. Elle peut conserver conceptuellement :

- l'entité concernée ;
- son identifiant ;
- le champ corrigé ;
- la valeur de remplacement, potentiellement structurée ;
- la raison ;
- l'état actif de la correction ;
- les timestamps.

TCGdex reste la source principale, mais une correction MY. validée a priorité. La synchronisation ne doit pas l'écraser silencieusement. Toute l'application consomme la valeur effective ; le frontend n'applique pas lui-même les overrides.

Le catalogue ne stocke pas systématiquement le payload JSON complet de chaque entité TCGdex. Il conserve les données utiles au produit, à la synchronisation et à la traçabilité, ainsi que les métadonnées techniques ciblées réellement nécessaires.

### Conservation du catalogue

La disparition d'une donnée dans TCGdex ne déclenche pas sa suppression physique automatique. Le modèle distingue :

- sa présence dans la source ;
- son activité dans MY. ;
- son éligibilité aux futures générations.

Le comportement normal est l'inactivation. Une suppression physique reste exceptionnelle et n'est acceptable que pour une donnée réellement erronée, inutilisée, sans référence utilisateur et sûre à supprimer.

Les références de `collection_items` et `physical_copies` vers `catalog_variants` doivent empêcher la suppression accidentelle d'une variante encore utilisée. Aucune cascade destructive du catalogue vers les données utilisateur n'est admise.

## Profils utilisateur

### `profiles`

La relation avec Supabase Auth est :

```text
auth.users 1 → 1 profiles
```

La clé primaire de `profiles` est le même UUID que `auth.users.id`. La table conserve :

- `id` ;
- `public_id` ;
- les seules informations de profil nécessaires à MY. ;
- les timestamps pertinents.

Elle ne duplique pas le mot de passe, les informations internes Supabase ou les données Auth sans besoin fonctionnel.

### Identifiant public MY.

`public_id` est obligatoire, unique et distinct conceptuellement de l'UUID Auth. Il sert au partage d'une collection. Son format exact n'est pas encore défini ; aucune expression régulière produit ne doit être imposée arbitrairement.

Si le futur format est insensible à la casse, l'unicité devra l'être également. Ce comportement dépend du cadrage final de l'identifiant.

### Création du profil

Un utilisateur Auth valide ne doit pas rester durablement sans profil MY. La création fiable du profil peut reposer sur un trigger, une opération serveur ou un autre mécanisme adapté. Le choix final sera réalisé avec l'implémentation de l'authentification.

## Collections

### `collections`

Une collection appartient à exactement un utilisateur. La table conserve notamment :

| Champ | Rôle |
|---|---|
| `id UUID` | Identité de la collection |
| `owner_id UUID` | Propriétaire unique |
| `name` | Nom de la collection |
| `collection_type` | Collection libre ou automatique |
| `automatic_target_type` | Type de cible d'une collection automatique |
| `target_pokemon_id` | Cible Pokémon éventuelle |
| `target_set_id` | Cible Extension éventuelle |
| `applied_target_version` | Version de structure réellement appliquée |
| timestamps | Création et mise à jour |

`collection_type` distingue les valeurs fonctionnelles `free` et `automatic`. `automatic_target_type` distingue `pokemon` et `set`. Les noms et types SQL définitifs de ces valeurs restent ouverts.

Le type d'une collection est stable après sa création dans la V1.

#### Contraintes de cible

Les invariants suivants doivent être garantis par la base, et pas uniquement par React.

| Cas | Type de cible | Pokémon | Set | Version appliquée |
|---|---|---|---|---|
| Collection libre | Absente | Absent | Absent | Absente |
| Automatique Pokémon | `pokemon` | Obligatoire | Absent | Obligatoire |
| Automatique Extension | `set` | Absent | Obligatoire | Obligatoire |

Une collection automatique possède exactement une cible compatible avec son type. Elle ne peut jamais référencer simultanément un Pokémon et un set.

Aucune contrainte ne doit empêcher un utilisateur de créer plusieurs collections ayant la même cible.

### `collection_items`

Cette table matérialise les variantes présentes dans une collection. Elle conserve notamment :

| Champ | Rôle |
|---|---|
| `id UUID` | Identité de l'élément |
| `collection_id UUID` | Collection parente |
| `variant_id BIGINT` | Variante référencée |
| `origin` | Élément automatique ou manuel |
| `sort_position` | Ordre global matérialisé |
| `automatic_rank` | Rang canonique d'un élément automatique |
| timestamps | Création et mise à jour |

Une variante ne peut apparaître qu'une seule fois dans une collection :

```text
UNIQUE(collection_id, variant_id)
```

L'origine distingue les valeurs fonctionnelles `automatic` et `manual`, sans figer ici le type SQL final.

Dans une collection libre, tous les éléments sont manuels. Dans une collection automatique, les deux origines sont possibles.

#### Ordre

`sort_position` représente l'ordre global affiché. Sa représentation doit permettre autant que possible une insertion entre deux éléments sans réécrire systématiquement toute la collection. L'algorithme de positionnement et de rééquilibrage reste ouvert.

`automatic_rank` conserve l'ordre canonique des éléments automatiques à la dernière génération ou mise à jour appliquée. Il est normalement absent pour un élément manuel.

La base, les permissions ou les opérations métier doivent garantir que :

- un élément automatique ne peut pas être supprimé ou déplacé arbitrairement ;
- son rang n'est pas librement modifiable depuis le frontend ;
- les éléments manuels restent repositionnables ;
- l'ordre relatif des éléments automatiques est préservé ;
- une collection libre ne contient aucun élément automatique.

## Exemplaires physiques

### `physical_copies`

Une ligne représente un exemplaire physique individuel. Elle conserve notamment :

| Champ | Type ou rôle retenu |
|---|---|
| `id` | UUID |
| `user_id` | UUID du propriétaire |
| `variant_id` | `BIGINT` de la variante |
| `condition` | État de conservation |
| `is_graded` | Indication de grading |
| `grading_company` | Société, sous forme textuelle |
| `grading_score` | Note, sous forme textuelle |
| `note` | Note personnelle |
| timestamps | Création et mise à jour |

Un exemplaire appartient à un utilisateur et à une variante. Il ne possède jamais de `collection_id`.

Chaque exemplaire est une ligne distincte. Un champ de quantité ne doit pas remplacer ces lignes, car chaque copie peut avoir son propre état, son grading et sa note.

### Condition et grading

La nomenclature des conditions n'est pas encore validée. `condition` doit rester compatible avec une future liste contrôlée sans figer prématurément un enum définitif.

`grading_company` et `grading_score` restent textuels. Une note de grading ne doit pas être supposée purement numérique.

Lorsque `is_graded` est faux, les champs propres au grading doivent normalement être absents. Lorsque l'exemplaire est gradé, la société et la note ne sont pas encore rendues toutes deux obligatoires tant que le comportement produit exact n'est pas cadré.

### Possession dérivée

Une variante est possédée par un utilisateur lorsqu'au moins une ligne `physical_copies` relie cet utilisateur à cette variante. Elle est manquante dans le cas contraire.

Aucun booléen `owned` indépendant ne constitue une source de vérité. Supprimer le dernier exemplaire fait immédiatement apparaître la variante comme manquante dans toutes les collections concernées, sans modifier leurs `collection_items`.

## Partages

### `collection_shares`

La table conserve notamment :

- un `id` UUID ;
- le `collection_id` ;
- le `recipient_user_id` ;
- `created_at`.

Chaque relation collection-destinataire est unique :

```text
UNIQUE(collection_id, recipient_user_id)
```

Le propriétaire ne peut pas partager sa collection avec lui-même. La V1 ne définit qu'une permission de lecture seule ; aucun champ de rôle, de permission ou `can_edit` n'est nécessaire.

Retirer un partage supprime seulement l'accès du destinataire. Cela ne modifie ni la collection ni les exemplaires du propriétaire.

## Suppressions des données utilisateur

La suppression volontaire d'une collection peut être physique dans la V1. Elle supprime en cascade :

- ses `collection_items` ;
- ses `collection_shares`.

Elle ne supprime jamais les `physical_copies` de son propriétaire.

Retirer un élément manuel supprime uniquement son `collection_item`. Supprimer un exemplaire supprime uniquement la ligne `physical_copies` concernée.

Le comportement complet de suppression d'un compte reste ouvert et devra être défini avec l'authentification et les obligations applicables.

## Progression

La progression utilise **tous les éléments présents dans la collection**, qu'ils soient automatiques ou manuels.

```text
total_count = nombre de collection_items

owned_count = nombre de collection_items dont la variante possède
              au moins un physical_copy pour collections.owner_id
```

Une variante possédée en plusieurs exemplaires compte une seule fois dans le numérateur.

Par exemple, une collection contenant 100 éléments automatiques et 3 ajouts manuels a un total de 103. Si le propriétaire possède 80 de ces variantes, la progression est `80 / 103`.

Pour une collection partagée, la progression reste celle du propriétaire et utilise donc `collections.owner_id`, non l'identité du destinataire qui la consulte.

La progression est dérivée de `collection_items`, `physical_copies` et du propriétaire. Aucun compteur ou booléen de possession dupliqué ne devient une source de vérité. Une vue ou une requête optimisée peut matérialiser la lecture sans changer cette règle.

## Collections automatiques matérialisées et versionnées

### Matérialisation

La structure d'une collection automatique est enregistrée dans `collection_items`. Elle n'est jamais recalculée dynamiquement à chaque consultation.

Cette matérialisation permet de préserver l'état accepté par l'utilisateur et de séparer l'évolution du catalogue de l'application d'une mise à jour à sa collection.

### `automatic_target_states`

Cette table conserve l'état courant de la structure automatique de chaque cible Pokémon ou Set. Elle contient conceptuellement :

- un `id` interne `BIGINT` ;
- le type de cible ;
- l'éventuel `pokemon_id` ;
- l'éventuel `set_id` ;
- la `generation_version` ;
- le `content_hash` ;
- `updated_at`.

Une ligne représente exactement un Pokémon ou un set. La base doit assurer qu'il n'existe qu'un état courant par cible compatible, au moyen de contraintes adaptées sans imposer ici leur syntaxe finale.

### Hash de structure

`content_hash` représente la liste effective et ordonnée des IDs internes de variantes éligibles pour la cible.

Si la liste ou son ordre change, le hash change. Si seule une métadonnée descriptive change, le hash reste identique.

#### Changement de métadonnée

Une correction de nom français, de rareté, d'image, de nom de set ou d'un autre texte d'affichage ne change pas la structure. La nouvelle valeur effective devient visible immédiatement partout grâce à la référence au catalogue : aucune nouvelle version automatique ni validation utilisateur n'est nécessaire.

#### Changement structurel

Une nouvelle variante, un retrait d'éligibilité, un changement de rattachement Pokémon, une nouvelle carte, une correction de disponibilité française, une variante locale ajoutée ou un changement d'ordre canonique modifie la liste ou son ordre.

Le `content_hash` change alors et la `generation_version` de la cible est incrémentée.

### Version appliquée

Chaque collection automatique conserve dans `collections.applied_target_version` la version qu'elle a effectivement appliquée.

Une mise à jour potentielle existe lorsque :

```text
collections.applied_target_version
    < automatic_target_states.generation_version
```

Cette comparaison signale efficacement la disponibilité d'une mise à jour ; elle ne modifie aucune collection.

## Opérations métier des collections automatiques

### Création transactionnelle

Une opération conceptuelle telle que `create_automatic_collection(name, target_type, target_id)` doit :

1. vérifier l'utilisateur et la cible ;
2. créer la collection ;
3. lire l'état courant de la cible ;
4. déterminer les variantes françaises éligibles ;
5. créer les éléments automatiques ;
6. attribuer leurs rangs et positions ;
7. enregistrer la version appliquée.

L'ensemble réussit ou échoue de manière atomique. Le frontend ne doit pas insérer librement lui-même l'ensemble des éléments automatiques.

### Preview de mise à jour

Une opération conceptuelle telle que `preview_collection_update(collection_id)` compare les éléments automatiques matérialisés à la structure actuelle de la cible sans modifier aucune donnée.

Elle doit pouvoir retourner :

- les variantes à ajouter ;
- les variantes automatiques à retirer ;
- les éléments manuels qui deviendront automatiques ;
- les changements d'ordre pertinents ;
- la version appliquée ;
- la version cible actuelle.

### Conversion manuel vers automatique

Lorsqu'une variante ajoutée manuellement devient éligible automatiquement, l'élément existant est converti :

- le même `collection_item` est conservé ;
- son origine devient automatique ;
- un rang automatique lui est attribué ;
- sa position est adaptée à l'ordre canonique ;
- aucun doublon n'est créé ;
- les exemplaires restent inchangés.

Le total de la collection et la possession ne changent pas du seul fait de cette conversion.

### Retrait d'un élément devenu non éligible

La preview doit signaler le retrait d'un élément automatique devenu non éligible. Après validation, son `collection_item` peut être supprimé de la structure automatique.

Aucun `physical_copy` n'est supprimé. Les exemplaires restent globaux au compte et utilisables partout où la variante demeure pertinente.

### Application transactionnelle

Une opération conceptuelle telle que `apply_collection_update(collection_id, expected_target_version)` doit :

1. vérifier l'identité du propriétaire ;
2. vérifier que la collection est automatique ;
3. vérifier la version cible attendue ;
4. recalculer ou valider la structure ;
5. convertir les éléments manuels devenus automatiques ;
6. ajouter les nouveaux éléments ;
7. retirer les éléments automatiques devenus non éligibles ;
8. mettre à jour les rangs automatiques ;
9. préserver autant que possible les positions manuelles ;
10. enregistrer la nouvelle version appliquée.

Toutes les étapes réussissent ou échouent ensemble.

Si la cible évolue entre la preview et la validation, l'opération ne doit pas appliquer silencieusement un résumé obsolète. Elle refuse l'application avec l'ancienne version et permet de demander une nouvelle preview.

### Ajout manuel et réorganisation

L'ajout manuel vérifie côté serveur :

- que l'utilisateur est propriétaire ;
- que la variante existe et est utilisable dans la V1 ;
- qu'elle n'est pas déjà présente dans la collection.

Dans une collection automatique, l'élément ajouté est manuel. Dans une collection libre, tous les éléments le sont.

L'ajout augmente immédiatement le total de progression. Une variante déjà possédée augmente aussi le numérateur.

Tous les éléments d'une collection libre sont réordonnables. Dans une collection automatique, seuls les éléments manuels peuvent être repositionnés librement ; les éléments automatiques conservent leur ordre relatif.

Les nouvelles cartes automatiques rejoignent leur position canonique lors d'une mise à jour. Les éléments manuels doivent être perturbés le moins possible, mais la stratégie exacte d'ancrage reste ouverte.

## Partage par identifiant public

Le frontend ne peut pas parcourir librement tous les profils pour trouver un destinataire.

Une opération limitée telle que `resolve_public_user(public_id)` retourne seulement les informations nécessaires pour confirmer l'identité du destinataire.

Une opération telle que `share_collection(collection_id, public_id)` peut ensuite :

1. vérifier le propriétaire ;
2. résoudre le destinataire ;
3. empêcher le partage vers soi-même ;
4. empêcher les doublons ;
5. créer le partage.

Le code et la signature SQL définitifs de ces opérations restent ouverts.

## Row Level Security

La RLS est obligatoire sur toutes les tables utilisateur exposées par Supabase. Masquer une action dans React n'est jamais une autorisation suffisante. Les permissions d'accès au schéma et les politiques de lignes doivent conjointement respecter le modèle suivant.

| Ressource | Propriétaire ou utilisateur concerné | Destinataire d'un partage | Autre utilisateur |
|---|---|---|---|
| `profiles` | Lecture de son profil et modification des champs autorisés | Pas de parcours général | Aucun parcours général |
| `collections` | Lecture, modification et suppression | Lecture seule de la collection partagée | Aucun accès |
| `collection_items` | Gestion dans les limites fonctionnelles | Lecture seule des éléments partagés | Aucun accès |
| `physical_copies` | Gestion de ses exemplaires | Lecture limitée aux exemplaires du propriétaire et aux variantes présentes dans la collection partagée | Aucun accès |
| `collection_shares` | Gestion des partages de ses collections | Lecture des partages qui lui donnent accès, sans devoir voir les autres destinataires | Aucun accès |
| catalogue | Lecture nécessaire à l'application | Lecture nécessaire à la consultation | Aucune écriture utilisateur |
| schéma privé | Accès privilégié uniquement | Aucun accès | Aucun accès |

Un utilisateur anonyme n'accède pas aux données privées authentifiées. Un processus privilégié peut synchroniser le catalogue depuis un environnement de confiance, sans exposer ses privilèges au navigateur.

Les opérations structurantes peuvent être limitées aux RPC afin que la RLS et les contraintes ne soient pas contournées par une suite d'écritures directes.

### Fonctions privilégiées

`SECURITY DEFINER` ne doit pas être utilisé par défaut. Lorsqu'une fonction en a réellement besoin, elle doit :

- vérifier explicitement `auth.uid()` lorsque l'opération est liée à un utilisateur ;
- limiter strictement son action et ses paramètres ;
- fixer un `search_path` sûr ;
- disposer de droits d'exécution restreints ;
- ne pas devenir un contournement général de la RLS.

Les vues ou fonctions exposées doivent préserver le même périmètre d'accès que les tables sous-jacentes et ne jamais élargir implicitement la visibilité des données. Le SQL final de ces protections sera validé avec les migrations.

## Opérations directes et centralisées

Les opérations simples peuvent être effectuées directement via Supabase lorsque RLS et contraintes suffisent, notamment :

- lire le catalogue ;
- lire une collection autorisée ;
- lire et gérer ses exemplaires ;
- modifier une note ;
- modifier les champs autorisés de son profil ;
- renommer sa collection.

Les opérations touchant plusieurs lignes ou des invariants importants restent centralisées, notamment :

- créer une collection automatique ;
- produire la preview d'une mise à jour ;
- appliquer une mise à jour ;
- effectuer une réorganisation structurelle complexe ;
- partager par identifiant public ;
- éventuellement ajouter ou retirer un élément lorsque l'ordre ou l'origine exigent un contrôle renforcé.

## Vues dérivées

Des vues ou requêtes dédiées peuvent simplifier la lecture sans devenir de nouvelles sources de vérité.

### Possession

Une vue conceptuelle peut agréger `user_id`, `variant_id` et `copy_count` depuis `physical_copies`. Elle sert à déterminer la possession et le nombre d'exemplaires.

### Progression et dashboard

Une vue ou requête peut produire `total_count`, `owned_count` et le pourcentage dérivé pour chaque collection. Le total inclut tous les `collection_items`, y compris les ajouts manuels, et le calcul des exemplaires utilise le propriétaire de la collection.

### Catalogue enrichi

Une vue peut réunir les valeurs effectives nécessaires à l'affichage et à la recherche, à condition de préserver la traçabilité entre source et correction et de ne pas exposer les mécanismes privés.

## Index

Les index doivent répondre aux requêtes réelles ; toutes les colonnes ne sont pas indexées par défaut.

### Catalogue

Les accès suivants doivent disposer d'index ou de contraintes uniques adaptés :

- `pokemon.dex_number` ;
- les identifiants TCGdex uniques pertinents ;
- `tcg_sets.series_id` ;
- `source_cards.set_id` ;
- `source_cards.local_id` ;
- `catalog_variants.source_card_id` ;
- `card_pokemon.pokemon_id` ;
- `card_pokemon.card_id`.

Des index partiels sur les variantes actives et françaises peuvent être ajoutés si les requêtes de génération le justifient.

### Collections

Les accès principaux concernent :

- `collections.owner_id` ;
- `collections.target_pokemon_id` ;
- `collections.target_set_id` ;
- `collection_items.collection_id` ;
- `collection_items.variant_id` ;
- l'ordre composé `(collection_id, sort_position)`.

L'unicité `(collection_id, variant_id)` fournit également un index utile.

### Exemplaires et partages

L'index `(user_id, variant_id)` de `physical_copies` est central pour la possession, le nombre d'exemplaires et la progression.

Les partages nécessitent des accès efficaces par `collection_id` et `recipient_user_id`, en plus de l'unicité `(collection_id, recipient_user_id)`.

## Recherche, classeur et préférences

La recherche de la V1 repose sur PostgreSQL et utilise les informations pertinentes du catalogue : nom, set, série ou bloc, numéro, variante et autres champs validés.

La première implémentation doit rester proportionnée au besoin. `pg_trgm`, les index GIN, des colonnes normalisées ou la recherche full-text ne seront ajoutés que si les mesures le justifient.

Les pages du classeur ne sont pas persistées dans une table `binder_pages`. Elles sont calculées côté frontend à partir des `collection_items`, de leur ordre, du format de page et du mode continu ou par blocs. La hiérarchie variante → carte → set → série permet d'identifier les changements de bloc.

Les préférences de vue, de format de classeur et de mode d'organisation ne justifient pas encore une grande table générique. Leur niveau de persistance reste ouvert.

## Synchronisation TCGdex

### `private.catalog_sync_runs`

Cette table privée peut tracer les exécutions importantes du pipeline catalogue. Elle conserve conceptuellement :

- son identifiant ;
- le début et la fin ;
- le statut ;
- le type et la référence de source ;
- des statistiques ciblées ;
- un résumé d'erreur éventuel.

Elle sert au diagnostic et n'est pas exposée aux utilisateurs. Le nom final de ses statuts et la structure exacte de ses données techniques restent ouverts.

### Atomicité et recalcul des cibles

Une synchronisation ne doit pas laisser le catalogue dans un état intermédiaire incohérent. Ses changements sont regroupés transactionnellement lorsque cela est raisonnablement possible.

Après une modification effective du catalogue, le processus :

1. identifie les cibles Pokémon et Set potentiellement affectées ;
2. recalcule leur liste ordonnée de variantes ;
3. calcule le nouveau `content_hash` ;
4. le compare à l'ancien ;
5. incrémente la version uniquement si la structure a changé.

Une correction purement descriptive ne provoque donc pas de fausse mise à jour de collection.

## Maîtrise du coût et du volume

Le schéma reste compact afin de respecter l'objectif de coût initial très faible et les limites des offres gratuites :

- IDs numériques compacts pour le catalogue ;
- aucune image stockée dans PostgreSQL ;
- aucun payload TCGdex complet conservé systématiquement ;
- aucune duplication des données de carte dans les collections ;
- aucun booléen `owned` concurrent ;
- aucune page de classeur persistée ;
- aucun historique complet sans besoin ;
- aucune table de quantité parallèle aux exemplaires.

Après le premier import complet réel, il faudra mesurer :

- la taille des tables et des index ;
- la taille totale de PostgreSQL ;
- le nombre de cartes et de variantes ;
- le nombre de relations entre cartes et Pokémon ;
- la croissance estimée.

Ces mesures détermineront les optimisations ou évolutions d'offre nécessaires.

## Migrations et versionnement

Le schéma sera créé et modifié au moyen de migrations reproductibles et versionnées dans Git. Les tables, contraintes, fonctions, politiques et index ne doivent pas exister uniquement sous forme de changements manuels dans le dashboard Supabase.

Les migrations définissent la structure. Le catalogue TCGdex complet est alimenté par le pipeline d'import ou de synchronisation et ne doit pas être inséré dans une migration SQL gigantesque.

## Vérifications attendues

### Contraintes et logique métier

Les tests de base devront notamment vérifier :

- l'impossibilité de dupliquer une variante dans une collection ;
- l'impossibilité d'une double cible automatique ;
- l'absence de cible et de version sur une collection libre ;
- la conservation des exemplaires après suppression d'une collection ;
- la conversion manuel vers automatique sans doublon ;
- le retrait automatique sans suppression d'exemplaire ;
- la progression incluant les éléments manuels ;
- la conservation de l'ordre relatif des éléments automatiques.

### RLS

Les scénarios de sécurité doivent couvrir au minimum :

- le propriétaire ;
- un utilisateur tiers non autorisé ;
- le destinataire d'un partage ;
- un utilisateur anonyme ;
- le processus privilégié de synchronisation.

Ils doivent vérifier les droits de lecture et d'écriture, ainsi que l'absence d'accès transversal aux profils, collections et exemplaires.

## Invariants principaux

Le futur SQL et les opérations métier doivent garantir autant que possible que :

- une collection possède exactement un propriétaire ;
- une collection libre n'a ni cible automatique ni version appliquée ;
- une collection automatique possède exactement une cible Pokémon ou Set compatible ;
- une variante apparaît au maximum une fois dans une collection ;
- un élément référence une variante existante ;
- une collection libre ne contient aucun élément automatique ;
- un élément automatique n'est ni supprimable ni déplaçable arbitrairement ;
- un exemplaire appartient à un utilisateur et à une variante, jamais à une collection ;
- chaque exemplaire physique est une ligne distincte ;
- la possession est dérivée des exemplaires ;
- la progression inclut tous les éléments, manuels compris ;
- un partage collection-destinataire est unique ;
- le propriétaire ne se partage pas sa propre collection ;
- le destinataire d'un partage reste en lecture seule ;
- une mise à jour automatique ne supprime jamais les exemplaires ;
- une correction locale validée n'est pas écrasée silencieusement ;
- une donnée catalogue référencée n'est pas supprimée automatiquement.

## Pas de sur-conception

La V1 ne crée pas sans besoin démontré :

- de tables d'abonnement, de plan, de paiement, de facture ou d'entitlement ;
- de champ `is_premium` ;
- d'historique complet des collections ou de journal de chaque action utilisateur ;
- de système de notifications complexe ;
- de commentaires, likes, messages, équipes ou rôles collaboratifs ;
- de marketplace ou de données de prix ;
- de pages de classeur persistées ;
- de cache métier permanent ;
- de table séparée de possession.

La préparation à un éventuel Premium post-V1 repose uniquement sur la centralisation des opérations automatiques. Aucun modèle commercial ni contrôle de droit Premium n'est introduit dans la V1.

## Éléments laissés ouverts

Les sujets suivants restent à définir lors des cadrages ou implémentations concernés :

- le SQL exact des tables et des migrations ;
- les noms finaux de certains enums et leur représentation SQL ;
- la syntaxe exacte et la sensibilité à la casse de `public_id` ;
- la nomenclature des conditions ;
- les sociétés et formats de grading ;
- le mécanisme exact de création du profil ;
- l'algorithme de génération de `variant_key` ;
- l'algorithme exact de l'ordre canonique du catalogue ;
- le type et l'algorithme de `sort_position` ;
- la stratégie d'ancrage des cartes manuelles après une mise à jour ;
- le pipeline précis entre API TCGdex et cards-database ;
- les champs source exacts conservés et les détails des données privées de synchronisation ;
- la stratégie physique exacte de fusion des valeurs source et des overrides ;
- l'implémentation PostgreSQL finale de la recherche et l'utilité mesurée de `pg_trgm` ;
- le SQL final des politiques RLS ;
- le code et les signatures finaux des RPC ;
- les préférences de vue effectivement persistées ;
- la politique de suppression complète d'un compte ;
- la politique opérationnelle de sauvegarde ;
- les besoins futurs éventuels d'historique ;
- le modèle Premium post-V1.

## Synthèse

Le schéma de MY. repose sur une variante définie une fois dans le catalogue, référencée indépendamment par les collections et par les exemplaires physiques. Les exemplaires sont globaux au compte ; la possession et la progression sont dérivées, et tous les éléments de collection, manuels compris, contribuent au total.

Les collections automatiques sont matérialisées et versionnées par cible. Une évolution descriptive du catalogue est visible immédiatement, tandis qu'un changement de structure produit un nouveau hash, une nouvelle version, une preview puis une application explicitement validée et transactionnelle. Une conversion manuel vers automatique évite les doublons, et tout retrait structurel préserve les exemplaires.

La RLS protège les données utilisateur, les écritures du catalogue restent privilégiées, les migrations sont versionnées dans Git et le schéma reste compact pour la phase initiale. Aucun mécanisme Premium ou paiement n'est ajouté à la V1.
