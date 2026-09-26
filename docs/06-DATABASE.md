# Schéma PostgreSQL / Supabase de la V1 de MY.

## Rôle du document

Ce document constitue la source de vérité concernant le schéma PostgreSQL / Supabase retenu pour la V1 de **MY.**. Il traduit le [modèle de données conceptuel](03-DATA-MODEL.md) en tables principales, identifiants, relations, contraintes, règles de suppression, principes RLS, index et opérations métier.

Il complète la [vision](00-VISION.md), les [fonctionnalités](01-FEATURES.md), la [politique TCGdex](02-TCGDEX.md), les [principes UX/UI](04-UX-UI.md) et l'[architecture technique](05-ARCHITECTURE.md).

Le socle stable est implémenté dans les [migrations versionnées](../supabase/migrations/) et vérifié avec pgTAP sur Supabase local. Les onze migrations jusqu'à la Phase 5 sont validées localement et déployées dans Supabase Cloud. Ce document distingue les opérations livrées des opérations utilisateur futures. Les choix explicitement laissés ouverts à la fin du document ne doivent pas être inventés.

## Socle SQL de Phase 1

| Migration | Responsabilité |
|---|---|
| [20260906082312_phase1_schema.sql](../supabase/migrations/20260906082312_phase1_schema.sql) | 12 tables, schéma privé, extensions utiles, contraintes, index, triggers techniques, RLS activée explicitement et fermeture des privilèges par défaut |
| [20260906082313_phase1_security.sql](../supabase/migrations/20260906082313_phase1_security.sql) | Permissions de table et de colonne, policies RLS, prédicat privé de propriété |
| [20260906082314_harden_rls_auto_enable.sql](../supabase/migrations/20260906082314_harden_rls_auto_enable.sql) | Révocation conditionnelle des droits d'appel API sur Automatic RLS, sans désactiver son event trigger |

La Phase 1 est terminée et déployée dans Supabase cloud. La Phase 2 est également terminée : [20260906155043_phase2_catalog_pipeline.sql](../supabase/migrations/20260906155043_phase2_catalog_pipeline.sql) et [20260908083516_phase2_variant_release_dates.sql](../supabase/migrations/20260908083516_phase2_variant_release_dates.sql) y sont présentes, soit les **cinq migrations des Phases 1 et 2**. Le catalogue Phase 2 y a été chargé et vérifié selon la validation du propriétaire consignée dans le [README](../README.md#état-du-projet). Les tables utilisateur étaient encore vides lors de cette validation. Le pipeline reste local/protégé ; cette restriction ne décrit pas la localisation du catalogue résultant.

La migration pipeline apporte les stamps multiples et trois tables privées, sans modifier les migrations précédentes. À l'issue de la Phase 2, les RPC utilisateur et le frontend métier restaient à développer ; la création automatique et le premier périmètre Collections sont désormais livrés en Phase 5.

La migration de dates de variantes, créée avec la CLI, ajoute la date effective et sa provenance aux variantes. Elle conserve les IDs et backfille la valeur depuis les cartes. Faute de provenance historique persistée sur les cartes, le backfill utilise honnêtement `unknown`, même lorsque la date est connue ; la synchronisation suivante recalcule les provenances correctes. Elle fonctionne aussi lors d'une reconstruction complète depuis les migrations. Le catalogue cloud validé ne comporte aucune date de Variante NULL ni nom français Pokémon manquant ; `sm3.5-28` possède cinq variantes après override.

## Préparation SQL avant Phase 3

La migration [20260909124950_pre_phase3_collection_preferences.sql](../supabase/migrations/20260909124950_pre_phase3_collection_preferences.sql) ajoute l'unicité des collections automatiques par propriétaire/cible, le nom d'au moins 3 caractères utiles après trim et `user_preferences` avec RLS. Elle est **déjà déployée dans Supabase cloud**, selon le propriétaire, ce qui portait alors le total à **six migrations cloud**. L'ancienne indication « locale uniquement » était obsolète. Ces six migrations restent immuables et ne sont pas redéployées en 3A.

Elle n'écrit aucune donnée catalogue, ne refond pas `physical_copies` et n'ouvre aucune RPC de création automatique. Les contraintes s'appliquent aussi aux lignes existantes : un nom trop court ou un doublon provoque un échec transactionnel, sans renommage, suppression ou fusion automatique. Les tests couvrent les invariants et droits ; les types frontend sont régénérés depuis le schéma local final. Aucun mécanisme Auth, signup ou création automatique de profil n'est ajouté.

## Phase 3A — Auth et identité

La migration [20260909184529_phase3a_auth_identity.sql](../supabase/migrations/20260909184529_phase3a_auth_identity.sql), créée par `supabase migration new phase3a_auth_identity`, ajoute le trigger Auth/profil, le rattrapage des profils manquants et les restrictions MFA. Elle est déployée et validée **localement et dans Supabase cloud**, portant le total à **sept migrations cloud**. La validation du propriétaire confirme le trigger Auth/profil, les 13 policies `require_mfa`, les 31 904 variantes intactes, l'absence d'utilisateur/profil/préférence parasite et de nouveau problème de sécurité bloquant. Elle ne modifie aucune donnée catalogue, colonne Auth gérée par Supabase, grant métier ni ancienne migration ; elle ajoute un trigger sur `auth.users` et une fonction dans `private`.

La V1 utilise email/mot de passe, email confirmé obligatoire et TOTP obligatoire. La configuration Auth et la [procédure de récupération administrative](05-ARCHITECTURE.md#récupération-mfa-administrative) sont définies dans l'architecture. La présence d'un profil n'accorde pas l'accès : toutes les données applicatives nécessitent `aal2`.

La **Phase 4 est terminée**. Les [protections des actions du compte](05-ARCHITECTURE.md#sécurité-des-actions-de-gestion-du-compte) distinguent email/mot de passe gérés par Auth et suppression renforcée côté serveur MY. La migration [20260914102414_phase4b3_account_deletion.sql](../supabase/migrations/20260914102414_phase4b3_account_deletion.sql) ajoute le trigger privé de nettoyage et les restrictions RLS contre les JWT d'un compte supprimé, sans table ni FK supplémentaire. Elle est appliquée localement et dans le Cloud, soit **huit migrations**. Les [Phases 4D.1](reports/2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) et [4D.2](reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md) livrent les formulaires password et suppression sans évolution SQL. Le [checkpoint 4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) valide réellement les refus `current_password`, le recovery, la MFA, la fonction de suppression, le nettoyage des données propres et les lectures vides avec un ancien JWT. Aucun schéma, migration, RLS, type ou réglage Cloud n'est modifié pendant ce checkpoint.

## Phase 5 — Collections

Les trois migrations suivantes sont présentes dans le dépôt, validées localement et déployées sur Supabase Cloud :

| Migration | Responsabilité |
|---|---|
| [20260920134607_phase5_canonical_collection_structure.sql](../supabase/migrations/20260920134607_phase5_canonical_collection_structure.sql) | Calcul canonique PostgreSQL interne, ordres et rangs des variantes éligibles |
| [20260920140934_phase5_create_automatic_collection.sql](../supabase/migrations/20260920140934_phase5_create_automatic_collection.sql) | RPC de création automatique atomique, contrôle de l'état/version et du hash, gestion des créations concurrentes |
| [20260920194903_phase5_dashboard_collections.sql](../supabase/migrations/20260920194903_phase5_dashboard_collections.sql) | Lecture Dashboard/overview, accès owned/shared et progression du propriétaire sous RLS |

Le propriétaire confirme le déploiement manuel et l'alignement des historiques Local/Remote jusqu'à `20260920194903`, soit onze migrations au total. L'audit 5E.1 valide la reconstruction locale sans diff, la parité canonique et les tests DB/concurrence. Le [rapport de clôture](reports/2026-09-23-PHASE5-CLOSURE.md) conserve ces résultats ; aucun nouveau contrôle ni changement Cloud n'est effectué en 5E.2.

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
- `user_preferences`, dont la clé est l'UUID du profil ;
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

Les timestamps techniques utilisent `TIMESTAMPTZ`, avec `now()` à la création. Le trigger commun `private.set_updated_at()` impose `statement_timestamp()` à chaque mise à jour ; il fonctionne en `SECURITY INVOKER`, avec `search_path = ''`, sans droit d'appel direct pour les rôles API. `card_pokemon` ne possède pas de timestamps ; `collection_shares` conserve seulement `created_at` ; `automatic_target_states` conserve seulement `updated_at`. Les autres tables possèdent les deux timestamps.

Les UUID des entités utilisateur indépendantes utilisent `gen_random_uuid()`. L'UUID du profil provient exclusivement d'Auth ; `user_preferences.user_id` réutilise cet UUID, sans nouvelle identité. Les IDs numériques utilisent `BIGINT GENERATED ALWAYS AS IDENTITY`.

## Vue relationnelle simplifiée

```text
auth.users
    └── 1:1 profiles
          ├── 1:0..1 user_preferences
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
- `user_preferences`
- `collections`
- `collection_items`
- `physical_copies`
- `collection_shares`

### Données techniques et privilégiées

La migration Phase 2 crée trois tables dans `private` :

- `catalog_sync_runs` : UUID, début/fin, statut, repository, SHA/date du commit, hash des overrides, version du pipeline, statistiques JSON et erreur ;
- `catalog_overrides` : ID Git, raison, action, cible, valeurs source/effective JSON, redondance, état appliqué et FK du dernier run ; les mappings utilisent cette même table ;
- `catalog_entity_keys` : clé durable, FK vers exactement une carte ou variante, pour les ajouts locaux et variantes corrigées. Les aliases persistent afin de préserver les IDs après retrait ou réactivation.

La RLS est activée explicitement sur les trois tables, sans policy ni grant API. PUBLIC, anon, authenticated et service_role n’ont ni USAGE du schéma privé ni droits sur ses tables/séquences. Le pipeline utilise la connexion PostgreSQL locale privilégiée ; aucune fonction SECURITY DEFINER supplémentaire n’est créée. Les FK techniques sont indexées et restrictives.

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

`name_fr` reste nullable et reçoit le nom du référentiel d'espèces français versionné, généré manuellement depuis PokéAPI. Le rapprochement par `dex_number` préserve `id` ; un numéro absent du fichier donne `NULL` et un diagnostic. Cet enrichissement descriptif ne modifie aucune structure de cible. Son empreinte est conservée dans le JSON du journal privé existant, sans migration ni colonne supplémentaire ; voir le [pipeline](07-CATALOG-SYNC.md).

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
- `effective_release_date DATE`, date complète nullable résolue pour le fallback des variantes ;
- la date de mise à jour de la source ;
- la présence actuelle dans la source ;
- l'état actif dans MY. ;
- l'origine TCGdex ou MY. ;
- les timestamps pertinents.

Une carte appartient à exactement un set. Son ordre normalisé doit être stable et ne doit pas reposer uniquement sur un tri textuel naïf de `local_id`. L'algorithme final de calcul reste du ressort du pipeline TCGdex.

La valeur `origin` utilise `TEXT + CHECK` avec `tcgdex` et `my`. `source_present` est obligatoire et distinct de `is_active` ; une origine ne suffit pas à déterminer la présence actuelle dans la source.

La date de carte suit carte, produit/coffret fiable, set FR/global, avec priorité finale aux overrides. Sans date fiable : `NULL`. Elle sert de fallback ; le classement Pokémon utilise désormais la date persistée de chaque variante. Le snapshot inspecté ne fournit pas de dates propres ou de produits exploitables ; le pipeline utilise les dates des sets sans inventer de précision historique.

`normalized_number BIGINT` représente une clé numérique d'ordre du numéro, nullable avant normalisation. `sort_order BIGINT` conserve les ordres techniques des séries, sets et variantes ; ces colonnes peuvent rester nulles avant le pipeline. Le pipeline Phase 2 remplit les rangs naturels intra-set et les rangs de variantes selon `07-CATALOG-SYNC.md`. Les données descriptives facultatives restent nullables, afin de ne pas fabriquer de noms, dates, images ou raretés manquants.

### `catalog_variants`

La table `catalog_variants` est l'unité centrale du catalogue : **une ligne représente une variante collectible distincte**.

Une carte Normal, Reverse, Holo ou munie d'un stamp pertinent produit ainsi des variantes différentes lorsqu'elles existent réellement en français.

La table conserve notamment :

- un `id` interne `BIGINT` ;
- le `source_card_id` obligatoire ;
- l'éventuel identifiant de variante fourni par la source ;
- un `variant_key` stable dans la carte source ;
- un label d'affichage ;
- les propriétés structurées type, subtype, taille, `stamp TEXT[] NOT NULL DEFAULT '{}'` et foil ;
- une éventuelle URL d'image spécifique ;
- `effective_release_date DATE NULL`, date effective propre à la variante ;
- `date_origin TEXT NOT NULL DEFAULT 'unknown'`, contraint à `variant`, `card`, `product`, `set`, `override` ou `unknown` ;
- la disponibilité française ;
- un ordre stable dans la carte ;
- l'origine TCGdex ou MY. ;
- la présence actuelle dans la source ;
- l'état actif dans MY. ;
- les timestamps pertinents.

L'identité principale d'une variante est son ID interne MY. Elle ne change pas à la suite d'une simple correction de la donnée source.

Une variante peut sortir après la carte de base. Elle utilise sa date spécifique fiable, sinon la date déjà résolue de la carte, sinon `NULL`. La provenance réelle est conservée lors du fallback : une date héritée du set reste `set`, pas `variant`. La provenance `unknown` signifie que l'origine n'est pas connue, notamment pour une valeur historique migrée ; elle n'impose donc pas une date NULL. La correction explicite d'une date utilise `override`, et `variant.patch` avec `date:null` restaure le fallback de carte. Le pipeline préserve les dates persistées des variantes absentes/historiques lorsqu'il les reconstruit depuis PostgreSQL.

#### `variant_key`

Chaque variante possède une clé stable à l'intérieur de sa carte source. La contrainte conceptuelle est :

```text
UNIQUE(source_card_id, variant_key)
```

La clé V1 est `v1:` suivi du JSON `[type, subtype|null, taille standard, stamps triés, foil|null]`. Langue, label, date, provenance de date et tiers sont exclus de l’identité. Une correction de date conserve la clé et l'ID. La migration des stamps convertit chaque ancien stamp scalaire en tableau singleton et NULL en tableau vide, sans perte. Les tableaux ne peuvent pas contenir NULL ; le pipeline trie et déduplique les stamps avant persistance.

#### Disponibilité française

La disponibilité française distingue au minimum trois états conceptuels :

- confirmée ;
- inconnue ou non déterminée ;
- non disponible.

La Phase 1 utilise `french_availability TEXT + CHECK` avec `confirmed`, `unknown` et `unavailable`, et `unknown` par défaut. L'absence d'information ne signifie pas une indisponibilité confirmée.

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

`private.catalog_overrides` trace aussi `mapping.include` et `mapping.exclude`, leur raison et leurs valeurs avant/après. La table effective `card_pokemon` est produite après ces actions Git prioritaires ; aucune table de corrections parallèle n’est nécessaire. `cameoDexIds` n’alimente pas ces relations en V1.

### Corrections de champs du catalogue

`private.catalog_overrides` distingue la valeur source de la valeur effective. Chaque action conserve :

- l'entité concernée ;
- son identifiant ;
- le champ corrigé ;
- la valeur de remplacement, potentiellement structurée ;
- la raison ;
- l'état actif de la correction ;
- les timestamps.

TCGdex reste la source principale, mais une correction MY. validée a priorité. Dans la V1, ces corrections ont pour source de vérité des fichiers versionnés dans Git ; la structure privée reflète leur état effectivement appliqué. La synchronisation ne doit pas les écraser silencieusement. Toute l'application consomme la valeur effective ; le frontend n'applique pas lui-même les overrides.

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
- `created_at` et `updated_at`, timestamps techniques de la ligne applicative.

La page Profil lit l'email courant via `user.email` et la date de création du compte via `user.created_at`, exposés par Supabase Auth. La source de cette date est **`auth.users.created_at`** ; `profiles.created_at` date seulement l'insertion du profil et peut différer lors d'un backfill. Il ne faut ni remplacer sa valeur historique, ni ajouter une seconde date d'inscription. Les [sources des informations du Profil](03-DATA-MODEL.md#utilisateur-et-profil-my) distinguent les données Auth de `profiles.public_id`.

Aucun email, mot de passe, secret/statut MFA dupliqué, pseudo, nom d'affichage, avatar ou bio n'est ajouté dans `profiles`. Le client consulte son utilisateur via Auth, sans accès SQL direct à `auth.users`. Les changements d'email et de mot de passe restent gérés par Auth selon les [contraintes de Phase 4](05-ARCHITECTURE.md#changement-demail-et-de-mot-de-passe).

### Identifiant public MY.

`public_id` est obligatoire, généré automatiquement par MY., non choisi par l'utilisateur, immuable et distinct de l'UUID Auth. Il sert principalement au partage d'une collection.

Son format est `MY-XXXXX-XXXXX-XXXXX-XXXXX`, par exemple `MY-7K4P9-M2Q8X-RVH6T-C3N5D`. Les 20 caractères aléatoires appartiennent à l'alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, qui exclut `0`, `O`, `1`, `I` et `L`.

Le trigger `private.set_profile_public_id()` utilise `extensions.gen_random_bytes()` de `pgcrypto`. Il rejette les octets supérieurs ou égaux à 248 avant réduction modulo 31 pour éviter un biais de distribution. Le domaine représente environ 99 bits d'entropie. Toute insertion de profil sans identifiant reçoit automatiquement une valeur ; une valeur fournie explicitement est refusée.

Le type `extensions.citext` et une contrainte `UNIQUE` assurent l'égalité et l'unicité insensibles à la casse. Le `CHECK` de format travaille sur la conversion `TEXT` avec collation `C` et impose les majuscules. Le trigger compare aussi l'ancienne et la nouvelle valeur en `TEXT` : une modification, même de casse ou vers `NULL`, est refusée. Les rôles API utilisateur ne reçoivent aucun droit d'écriture sur `profiles`.

En cas de collision cryptographique exceptionnellement improbable, la contrainte unique refuse l'insertion ; le créateur de profil Auth retente alors la génération, avec cinq tentatives maximum. Toute autre violation est immédiatement propagée. Aucun pseudo, nom d'affichage ou champ Auth dupliqué n'est ajouté.

### Création du profil

Depuis 3A, `auth_user_created_profile`, trigger `AFTER INSERT` sur `auth.users`, appelle `private.create_profile_for_auth_user()`. Cette fonction `SECURITY DEFINER`, avec `search_path` vide, insère uniquement `profiles.id = NEW.id`. Elle n'accepte aucun paramètre client et ne lit aucune métadonnée. Le trigger existant `profiles_public_id` génère l'identifiant ; aucune génération React ni insertion de secours frontend n'est ajoutée.

Le helper est dans le schéma non exposé `private`, sans `EXECUTE` pour PUBLIC, `anon`, `authenticated`, `service_role` ou `supabase_auth_admin`. PostgreSQL l'exécute comme trigger ; Auth peut créer son utilisateur avec ses droits habituels. La création Auth et celle du profil sont atomiques : si le profil échoue, le signup est annulé. Seule une violation de `profiles_public_id_key` est retentée, au maximum cinq fois, puis l'erreur est propagée.

La migration verrouille brièvement les écritures sur `auth.users` pour installer le trigger et backfiller les identités existantes sans profil dans une transaction. Les profils existants, leurs IDs publics et leurs timestamps sont conservés. Le backfill réutilise également le générateur, avec reprise limitée sur la même collision. Aucune préférence n'est créée d'avance.

La FK `profiles.id → auth.users.id` conserve `ON DELETE RESTRICT`. Le socle 3A crée le profil ; la suppression complète est désormais prise en charge par le [trigger et l'orchestration dédiés](#suppression-dun-compte) de Phase 4. La suppression administrative d'un facteur MFA ne touche ni le profil ni ses données.

## Préférences utilisateur

### `user_preferences`

Une petite table dédiée conserve les seules préférences de vues validées. Elle suit la convention existante **TEXT + CHECK**, avec colonnes explicites plutôt qu'un JSON libre, un système clé/valeur ou des enums PostgreSQL. Quelques préférences futures pourront être ajoutées par migration sans transformer `profiles` en fourre-tout.

| Champ | Valeurs / rôle | Défaut |
|---|---|---|
| `user_id UUID` | PK et FK vers `profiles.id`, `ON DELETE CASCADE` | `auth.uid()` |
| `catalog_default_view TEXT NOT NULL` | `list`, `cards`, `last_used` | `last_used` |
| `collection_default_view TEXT NOT NULL` | `list`, `cards`, `binder`, `last_used` | `last_used` |
| `last_catalog_view TEXT NOT NULL` | `list`, `cards` | `list` |
| `last_collection_view TEXT NOT NULL` | `list`, `cards`, `binder` | `list` |
| `created_at`, `updated_at TIMESTAMPTZ` | Timestamps techniques ; trigger commun `private.set_updated_at()` | `now()` à l'insertion |

Les valeurs fonctionnelles sont Liste / Cartes / Classeur / Dernier choix utilisé. Les deux champs `last_*` sont nécessaires pour donner un sens persistant à `last_used` ; ils conservent le dernier mode **explicitement choisi**, même si la préférence d'ouverture est fixe. Le dernier mode catalogue est commun aux pages Pokémon, Extension et Carte ; le dernier mode collection est commun aux collections. Aucun état par page ou cible n'est ajouté.

À une nouvelle ouverture, la future interface utilise la vue fixe choisie ou le champ `last_*` correspondant. Une ligne absente équivaut aux mêmes valeurs initiales : `last_used`, avec Liste initialement. La première sauvegarde peut créer la ligne ; aucune création anticipée au signup ni backfill des profils n'est effectué. Un upsert ciblant `user_id` est possible sous RLS en limitant sa mise à jour aux quatre champs de vues. Le retour dans une consultation restaure son contexte, sans écraser son état avec ces défauts.

La PK indexe également la FK et le filtre de propriété. Supprimer un profil supprime sa seule ligne de préférences dépendante ; cela ne définit aucun workflow de suppression de compte et ne change pas la FK restrictive Auth/profil. Aucun thème, préférence Premium, format de classeur ou mode continu/par blocs n'est stocké par cette migration.

### Permissions et RLS

La RLS est explicitement activée. Les policies `SELECT`, `INSERT` et `UPDATE` sont limitées à `authenticated` et à `user_id = (select auth.uid())`. `UPDATE` possède `USING` et `WITH CHECK`. Un partage de collection n'accorde aucun accès aux préférences du propriétaire.

Les grants autorisent la lecture de sa ligne, l'insertion de `user_id` et des quatre champs de vues, puis la modification des seuls champs de vues. Le choix explicite de `user_id` à l'insertion est contrôlé par RLS ; son transfert et la falsification des timestamps sont interdits par les grants de colonnes. Aucune suppression directe n'est accordée au client. `anon` et `PUBLIC` n'ont aucun accès ; `service_role` conserve uniquement les droits CRUD de maintenance, comme les autres tables utilisateur. Aucun nouveau helper `SECURITY DEFINER` ni RPC n'est créé.

Ce contrôle associe [grants et RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). La nouvelle table porte le total à 13 tables applicatives `public` et 3 tables privées en local, toutes avec RLS.

## Collections

### `collections`

Une collection appartient à exactement un utilisateur. La table conserve notamment :

| Champ | Rôle |
|---|---|
| `id UUID` | Identité de la collection |
| `owner_id UUID` | Propriétaire unique |
| `name` | Nom de la collection |
| `collection_type` | Collection personnalisée ou automatique |
| `automatic_target_type` | Type de cible d'une collection automatique |
| `target_pokemon_id` | Cible Pokémon éventuelle |
| `target_set_id` | Cible Extension éventuelle |
| `applied_target_version` | Version de structure réellement appliquée |
| timestamps | Création et mise à jour |

`collection_type` utilise `free` (collection personnalisée dans l'interface) et `automatic`. `automatic_target_type` utilise `pokemon` et `set`. Ces valeurs sont représentées par `TEXT + CHECK`, comme les origines et la disponibilité française, pour faciliter les migrations d'une jeune application sans enum PostgreSQL figé.

Le type d'une collection est stable après sa création dans la V1.

`collections_name_check` exige désormais `char_length(btrim(name, espaces_de_bord)) >= 3`. L'ensemble des espaces de bord correspond au trim JavaScript (espaces, tabulations, sauts de ligne et espaces Unicode concernés). Le contrôle compte les caractères, pas les octets UTF-8 ; il ne réécrit pas le nom stocké et conserve les espaces internes. Il s'applique aux créations et renommages de collections personnalisées comme automatiques ; `NOT NULL` reste en place.

#### Contraintes de cible

Les invariants suivants doivent être garantis par la base, et pas uniquement par React.

| Cas | Type de cible | Pokémon | Set | Version appliquée |
|---|---|---|---|---|
| Collection personnalisée | Absente | Absent | Absent | Absente |
| Automatique Pokémon | `pokemon` | Obligatoire | Absent | Obligatoire |
| Automatique Extension | `set` | Absent | Obligatoire | Obligatoire |

Une collection automatique possède exactement une cible compatible avec son type. Elle ne peut jamais référencer simultanément un Pokémon et un set.

Un propriétaire possède **au maximum une collection automatique par cible**. Deux [index uniques partiels PostgreSQL](https://www.postgresql.org/docs/current/indexes-partial.html) garantissent :

- `collections_owner_pokemon_unique` sur `(owner_id, target_pokemon_id)` lorsque `collection_type = 'automatic' AND automatic_target_type = 'pokemon'` ;
- `collections_owner_set_unique` sur `(owner_id, target_set_id)` lorsque `collection_type = 'automatic' AND automatic_target_type = 'set'`.

`collections_target_check` reste inchangée et garantit notamment les cibles non nulles compatibles couvertes par ces index. L'unicité s'applique aussi en concurrence et lors de mises à jour privilégiées. Les collections personnalisées sont exclues ; des propriétaires différents peuvent utiliser la même cible. Aucun nom de collection unique n'est imposé.

### `collection_items`

Cette table matérialise les variantes présentes dans une collection. Elle conserve notamment :

| Champ | Rôle |
|---|---|
| `id UUID` | Identité de l'élément |
| `collection_id UUID` | Collection parente |
| `variant_id BIGINT` | Variante référencée |
| `origin` | Élément automatique ou manuel |
| `sort_position` | Ordre réel affiché dans cette collection, pour tous les éléments |
| `automatic_rank` | Rang canonique système d'un élément automatique |
| timestamps | Création et mise à jour |

Une variante ne peut apparaître qu'une seule fois dans une collection :

```text
UNIQUE(collection_id, variant_id)
```

L'origine utilise `TEXT + CHECK` avec `automatic` et `manual`.

Dans une collection personnalisée, tous les éléments sont manuels. Dans une collection automatique, les deux origines sont possibles.

#### Ordre

`sort_position NUMERIC(40,20)` représente l'ordre réel affiché dans cette collection pour tous les éléments, avec une arithmétique décimale exacte. Les positions négatives sont possibles, `NaN` est interdit et les égalités de position sont départagées par l'UUID de l'élément : `ORDER BY sort_position, id`. L'index suit ce même ordre. La Phase 6A.3 prépare le déplacement contrôlé par midpoint, avec rééquilibrage de la collection et sérialisation des déplacements, décrits ci-dessous. Aucun calcul de position en flottant JavaScript. L'insertion/fusion lors des futures mises à jour reste à cadrer en Phase 8.

`automatic_rank BIGINT` conserve l'ordre canonique des éléments automatiques à la dernière génération ou mise à jour appliquée. Il est obligatoire et strictement positif pour un élément automatique, absent pour un élément manuel. Un trigger interdit l'origine automatique dans une collection personnalisée, y compris lors d'un changement de parent.

Cet ordre canonique est distinct de `sort_position`. Pour Pokémon : date de parution effective de la variante croissante (`NULL` en dernier), numéro normalisé, ordre stable des variantes de la carte. Pour Extension : numéro normalisé dans le set, ordre stable des variantes, sans critère de date. Les départages techniques ne peuvent pas modifier ces priorités. Les algorithmes précis sont implémentés en Phase 2 et définis dans `07-CATALOG-SYNC.md`. Le hash ne contient que les IDs ordonnés : une date sans déplacement ne modifie ni hash ni version ; une date seule ne modifie jamais la cible Set.

À la création, `sort_position` initialise l'affichage dans l'ordre canonique. Après création, cet ordre est une référence système, pas une contrainte permanente d'affichage. Un déplacement d'élément automatique modifie `sort_position`, jamais `automatic_rank`, `origin`, le hash/version canonique, la version appliquée ou `automatic_target_states`. Deux collections de même cible/version peuvent donc posséder les mêmes éléments automatiques avec des `sort_position` différents.

L'inspection des migrations versionnées confirme que `sort_position` existe et est obligatoire pour tous les `collection_items`, tandis que `automatic_rank` est distinct. Aucun `CHECK` ni trigger n'impose leur égalité ou n'interdit de déplacer un automatique. Le trigger de parent interdit seulement l'origine automatique dans une collection personnalisée. Les écritures directes sur les éléments restent fermées au rôle `authenticated` ; les RPC 6A.3 et 6C.1 ont été testées par installation locale temporaire, sans application durable des migrations correspondantes.

La base, les permissions ou les opérations métier doivent garantir que :

- un élément automatique reste structurellement géré par MY. et non supprimable manuellement tant qu'il appartient à cette structure ;
- son rang canonique n'est pas librement modifiable depuis le frontend ;
- tous les éléments, automatiques comme manuels, sont librement repositionnables par le propriétaire ;
- un élément manuel conserve `origin = manual` et aucun `automatic_rank` lors d'un déplacement ;
- une collection personnalisée ne contient aucun élément automatique.

### Mutations manuelles — contrat 6C.1

La [migration 6C.1](../supabase/migrations/20260926070705_phase6c1_manual_collection_items.sql) ajoute uniquement deux RPC métier :

```sql
public.add_manual_collection_item(
  p_collection_id uuid, p_variant_id bigint, p_placement text DEFAULT 'end'
) RETURNS uuid
public.remove_manual_collection_item(
  p_collection_id uuid, p_collection_item_id uuid
) RETURNS void
```

L'ajout retourne l'UUID du nouvel item. Le futur client doit transmettre `p_variant_id` en chaîne décimale, sans conversion en `Number` ; PostgreSQL conserve exactement le `BIGINT` reçu. Aucun propriétaire, origine, rang, position numérique ni ancre fourni par le client. `SECURITY DEFINER` est nécessaire pour ces écritures contrôlées : `search_path` vide, contrôle explicite `auth.uid()`, `aal2`, profil MY. présent, puis propriété du parent. Seul `authenticated` reçoit `EXECUTE` ; aucun grant `PUBLIC`, `anon` ou `service_role`, aucun changement de RLS/grants de tables. Le partage reste strictement en lecture seule. Parent privé, absent ou inaccessible : même erreur.

**Ajout.** Dans une collection personnalisée ou automatique, créer exactement un item `origin = 'manual'`, `automatic_rank IS NULL`, avec la variante demandée. Un item déjà présent, manuel ou automatique, provoque `already_present` avant toute modification, même si sa variante est devenue inéligible. La contrainte `UNIQUE(collection_id, variant_id)` reste l'arbitre final ; `ON CONFLICT` ciblé transforme une collision concurrente en la même erreur, sans exposer un nom de contrainte. Tout échec annule aussi un éventuel rééquilibrage.

Un nouvel ajout exige variante existante et active, `french_availability = 'confirmed'`, carte source active et set actif. La vérification utilise un même snapshot de lecture du catalogue après verrouillage du parent. Aucun filtre `source_present`, origine TCGdex, format standard ou cible automatique supplémentaire : les variantes locales MY. sont admissibles. Cette vérification ne concerne que l'ajout ; une modification ultérieure du catalogue ne retire, ne convertit et ne masque aucun item existant.

**Placement.** Uniquement `start` ou `end`, défaut `end` ; `NULL`, `before`, `after` et toute autre valeur sont refusés. Collection vide : position exacte `1`. Sinon : minimum moins `1` ou maximum plus `1`, calculés en `NUMERIC` PostgreSQL puis stockés en `NUMERIC(40,20)`. Ordre autoritatif `sort_position, id`. En présence d'égalités héritées ou de dépassement numérique, rééquilibrer les anciens items de cette seule collection en `1…N` selon cet ordre, puis insérer à `0` ou `N+1`. Le reorder 6A.3 conserve les déplacements précis ultérieurs ; aucun helper partagé ni refactor de sa migration.

**Retrait.** L'item doit appartenir au parent autorisé et avoir `origin = 'manual'`. Un automatique produit une erreur dédiée ; un mauvais item produit `manual_item_unavailable`. Seul le `collection_item` demandé est supprimé, sans compaction ni modification des autres positions. Retenter un retrait déjà réussi retourne `manual_item_unavailable`. Exemplaires physiques, catalogue, autres collections, origine/rang des items restants, cible/version appliquée et `automatic_target_states` restent intacts. Les triggers `updated_at` des items restent actifs lors d'un rééquilibrage.

**Concurrence.** Même `collections ... FOR UPDATE` que 6A.3, acquis avant lecture des items et conservé jusqu'à fin de transaction. Ajouts, retraits, reorder et suppression du parent se sérialisent par collection ; aucun verrou global. Les instructions suivantes relisent l'état engagé après attente sous `READ COMMITTED`. `REPEATABLE READ`/`SERIALIZABLE` sont refusés ; les conflits de sérialisation, deadlocks et délais de verrou sont normalisés. Le client devra rafraîchir puis éventuellement relancer une transaction complète, sans retry aveugle après résultat réseau incertain. La création automatique Phase 5 écrit un nouveau parent non encore visible ; elle ne modifie aucun parent existant. Les futurs writers structurels doivent suivre le même verrou.

| SQLSTATE | Message stable | Mapping futur |
| --- | --- | --- |
| `42501` | `collection_action_unavailable` | Session/MFA/profil/propriété ou parent indisponible |
| `22023` | `manual_item_invalid_placement` | Placement invalide |
| `P0002` | `manual_variant_unavailable` | Variante absente ou inéligible |
| `23505` | `already_present` | Variante déjà présente, toute origine |
| `P0002` | `manual_item_unavailable` | Item absent ou hors collection |
| `23514` | `automatic_item_removal_forbidden` | Retrait manuel d'un automatique interdit |
| `40001` | `collection_structure_conflict` | Actualisation/reprise transactionnelle nécessaire |
| `XX000` | `manual_item_unexpected` | Erreur interne assainie |

Le mapping TypeScript futur doit reconnaître ces couples code/message, jamais analyser un message PostgreSQL arbitraire. Les refus avant entrée en fonction (grant, UUID/BIGINT mal formé) et erreurs de transport/annulation restent des erreurs de protocole à traiter génériquement.

**Statut local au 26 septembre 2026.** Historique réel appliqué jusqu'à `20260923150456` (6A.1). 6A.2 reste non appliquée : elle supprime des colonnes d'exemplaires, donc aucun `migration up` global ni reset pendant 6C.1. Les seules fonctions additives 6A.3, 6B.1 et 6C.1 ont été installées temporairement pour validation, puis retirées ; historique des migrations inchangé, aucune activation durable, aucun accès/déploiement Cloud. Une future application suivra l'ordre des migrations après traitement explicite de 6A.2. Les types générés restent inchangés jusqu'à cette application.

**Preuves.** [pgTAP 6C.1](../supabase/tests/database/016_manual_collection_items.test.sql) : 78 assertions réussies (droits, variantes, positions, doublons, retrait, préservation et erreurs). Tests 6A.3/6B.1 également réussis ; ajustement de syntaxe `VALUES` dans le test 6A.3 pour compatibilité pgTAP, sans changement de migration. [Test concurrent dédié](../scripts/test-manual-collection-items-concurrency.js) : attente réelle observée via `pg_blocking_pids`, ajouts distincts/identiques, add/reorder et remove/reorder dans les deux ordres, suppression du parent, indépendance d'une autre collection, rejet des snapshots fixes, rollback et nettoyage des fixtures. Le script concurrent 6A.3 et le lint SQL passent également. Exécuter `node scripts/test-database.js supabase/tests/database/016_manual_collection_items.test.sql` et `node scripts/test-manual-collection-items-concurrency.js` sur une base locale disposant de ces fonctions ; les scripts n'appliquent aucune migration.

La régression DB complète ne passe pas sur ce schéma local : `001_schema` attend la limite de note 6A.2 ; `013_physical_copies` attend ses suppressions de colonnes et rencontre aussi une erreur de collation pgTAP. Ces limites sont conservées visibles, sans appliquer la migration destructive pour obtenir un résultat vert. Les autres fichiers DB exécutés passent. Aucun frontend, service React Query, recherche ou UI d'ajout/retrait développé.

Migration atomique et additive, anciens lecteurs/reorder compatibles. Avant commit, rollback intégral ; après déploiement, retour arrière par nouvelle migration supprimant uniquement ces deux RPC une fois leurs consommateurs retirés. Les items déjà ajoutés restent valides et ne doivent pas être effacés pour retirer l'API.

### Lecture du contenu — contrat 6B.1 préparé

La [migration 6B.1](../supabase/migrations/20260924185335_phase6b1_collection_content.sql) est créée mais **non appliquée**. `public.get_collection_content(p_collection_id UUID)` renvoie un **JSONB scalaire contenant un tableau**, en une instruction SQL `STABLE`, sans écriture. Ordre, métadonnées et possession utilisent le même snapshot de lecture. L'ordre du tableau est exactement `collection_items.sort_position, collection_items.id`, identique à `get_collection_item_order` en 6A.3 ; aucune position n'est transmise au frontend.

Chaque objet expose uniquement :

| Champ | Type JSON | Source / règle |
| --- | --- | --- |
| `collection_item_id` | string UUID | `collection_items.id`, directement utilisable par les primitives de reorder |
| `variant_id` | string décimale | `collection_items.variant_id`, sérialisation sans perte du `BIGINT` pour JavaScript |
| `origin` | string | `collection_items.origin` : `manual` ou `automatic`, donnée technique sans libellé UX |
| `card_name_fr` | string ou null | `source_cards.name_fr` |
| `local_id` | string ou null | Numéro original `source_cards.local_id`, sans normalisation d'affichage |
| `set_name_fr` | string ou null | `tcg_sets.name_fr`, Extension précise, jamais sa série |
| `image_url` | string ou null | `COALESCE(catalog_variants.image_url, source_cards.image_url)` |
| `variant_label` | string ou null | `catalog_variants.label` exact, y compris corrections et stamps |
| `owned` | boolean | Au moins un exemplaire pour `collections.owner_id + collection_items.variant_id` |

Le pipeline persiste déjà l'image variante avec fallback source (`scripts/catalog/plan.ts`). Le contrat réutilise ces valeurs sans reconstruire d'URL : les images TCGdex persistées sont normalement en `high.webp`, une image spécifique conserve son URL et sa résolution, deux valeurs absentes donnent `null`. Aucun remplacement métier, sondage CDN, recalcul de label ou d'identité. Les métadonnées absentes restent nulles. Tous les items visibles sont conservés, manuels et automatiques, même si leur variante est devenue inactive ou inéligible à une nouvelle génération ; les FK et jointures vers des clés uniques évitent les doublons.

`variant_id` suffit à identifier la Variante pour un futur détail : pas d'ID source additionnel. Le nom d'Extension suffit ici ; les abréviations ne sont pas ajoutées sans besoin immédiat. Aucun `sort_position`, `automatic_rank`, compteur d'exemplaires, hash/version, timestamp ou détail de pipeline n'est exposé.

**Sécurité et partage.** Fonction `SECURITY INVOKER`, `search_path` vide, `EXECUTE` accordé seulement à `authenticated` (aucun grant à `PUBLIC`, `anon` ou `service_role`). Les RLS existantes imposent `aal2`, profil MY. présent et propriétaire ou destinataire d'un partage existant. Un partage actif correspond à la présence de sa ligne `collection_shares` ; sa suppression révoque l'accès. Aucun grant de table ni policy n'est changé. La lecture partagée existante des `physical_copies` est conservée. `owned` est un `EXISTS` calculé à chaque lecture pour le **propriétaire**, jamais pour le lecteur : A possède/B non donne `true` à B ; A non/B possède donne `false`. Plusieurs copies ne dupliquent pas l'item.

Collection vide, inexistante, inaccessible, identifiant null, identité/MFA/profil insuffisant sous rôle `authenticated` : `[]`, sans révéler l'existence d'une collection privée, comme le lecteur d'ordre 6A.3. `anon` reçoit un refus de permission d'exécution. Le service 6B.2 conserve cette distinction entre contenu vide et disponibilité du parent selon le contrat de lecture du parent ; `[]` seul n'atteste pas l'accès.

**Volume.** Un tableau JSONB scalaire représente une seule valeur REST : `max_rows = 1000` ne découpe pas ses éléments. Pas de pagination ni de lectures successives susceptibles de diverger. Les jointures sont faites en base ; `EXISTS` utilise la paire indexée `(user_id, variant_id)`, sans N+1 réseau. Taille de réponse, mémoire d'agrégation/validation et temps de traitement croissent avec le nombre d'items ; le tableau complet est matérialisé, sans promesse de volume illimité. Une limite de ressources produit une erreur, pas une réponse volontairement tronquée. Aucune mesure de performances n'est revendiquée avant exécution. Le service 6B.2 valide un tableau de neuf champs et conserve les IDs décimaux comme chaînes, sans reconstruire l'ordre.

Le test [pgTAP](../supabase/tests/database/015_collection_content.test.sql), sa [fixture commune](../supabase/tests/database/collection_content.fixtures.inc) et le [test HTTP local](../scripts/test-collection-content-api.js) couvrent accès/RLS, contenu exact, ordre/ties, nulls, images, possession partagée, IDs hors précision JavaScript et 1005 éléments. pgTAP a été exécuté avec succès lors de la validation temporaire 6C.1 ; le test HTTP reste non exécuté. Celui-ci vérifie d'abord que la lecture REST directe est réellement limitée à 1000, puis exige les 1005 IDs ordonnés dans la RPC propriétaire et partagée ; il rapporte taille/durée et nettoie ses fixtures synthétiques. Il se lance explicitement avec `node scripts/test-collection-content-api.js` uniquement après application manuelle autorisée des migrations et disponibilité du cache de schéma REST ; il n'applique rien et ne modifie aucune configuration.

Contrat additif : anciens lecteurs/écritures inchangés. Une migration de retrait pourra supprimer uniquement cette fonction après retrait de ses consommateurs, sans restauration de données. Service/types/overlays préparés en 6B.2, affichage branché en 6B.3 ; aucun type Supabase généré n'est modifié.

### Première liste fonctionnelle — Phase 6B.3

`CollectionPage` monte `CollectionContentLoader`, puis `CollectionContentList`, uniquement après un overview valide sous session autorisée. Le chargement différé isole notamment le DnD du bundle initial ; son échec conserve l'overview et propose de recharger la page. La query `collectionContentKey(viewerId, collectionId)` appelle `getCollectionContent` : chargement, erreur assainie avec retry, tableau vide valide et contenu. L'ordre affiché reste exactement celui du tableau backend, sans tri ni état optimiste local. Une erreur d'overview masque immédiatement contenu/modal et annule/purge les caches de contenu, d'ordre et d'exemplaires du viewer concernés ; les changements Auth conservent leur purge globale existante.

La vue `dashboard_collections` n'expose pas le propriétaire. Le service d'overview complète sa lecture par `collections.select('owner_id').eq('id', collectionId).maybeSingle()`, autorisée par le grant SELECT et `collections_read` existants. Zéro ligne reste une collection indisponible ; aucun fallback vers le viewer. Cette donnée appartient à `CollectionOverview`, jamais à chaque ligne de contenu. Aucun contrat DB supplémentaire ni changement RLS.

`CollectionContentRow` rend l'image compacte inchangée ou un placeholder SVG neutre, le nom français avec fallback, extension/numéro et variante facultatifs. `owned` provient exclusivement du backend : image grisée/atténuée et textes légèrement atténués si false, contrôles actifs et statut visuellement masqué. Aucun origin, compteur d'exemplaires, badge de possession ou menu de ligne vide. Le partage ne monte aucun DnD interactif.

Le bouton Exemplaires ouvre `PhysicalCopiesDialog` avec le propriétaire réel et le `variantId` décimal exact : gestion complète pour le propriétaire, noms/notes consultables sans écriture en partage. Dialog, clés et service acceptent les chaînes BIGINT. Les anciens nombres restent acceptés uniquement si `Number.isSafeInteger`, puis convertis en chaîne ; aucun passage chaîne → nombre. `PhysicalCopiesDatabase` adapte seulement les types du chemin REST, sans modifier les types générés. Les filtres incluent toujours propriétaire et variante ; les inserts reçoivent une chaîne décimale. Les tests contrôlent l'URL et le corps JSON sérialisés avec `9007199254740995`.

Après création/suppression confirmée d'un exemplaire, 6B.2 invalide les contenus du viewer contenant la variante (ou sans donnée), les overviews et le Dashboard. L'édition nom/note rafraîchit uniquement les exemplaires. Aucun recalcul frontend de possession. Le retrait de cette intégration frontend ne nécessite aucune restauration de données ; conserver l'adaptation BIGINT tant que des consommateurs transmettent des chaînes.

Aucune migration créée ni appliquée en 6B.3 ; les preuves de cette étape restent frontend et transport simulé. Le statut local et les validations DB ultérieures figurent dans le contrat 6C.1 ci-dessus ; la validation HTTP reste à exécuter. Les autres fonctionnalités Phase 6 et les vues Phase 7 restent hors périmètre.

## Exemplaires physiques

### `physical_copies`

Une ligne représente un exemplaire physique individuel. Modèle prévu après application manuelle de la migration 6A.2 :

| Champ | Type ou rôle retenu |
|---|---|
| `id` | UUID |
| `user_id` | UUID du propriétaire |
| `variant_id` | `BIGINT` de la variante |
| `name` | Nom personnalisé facultatif (`TEXT` nullable, Phase 6A.1) |
| `note` | État / note facultatif (`TEXT` nullable, au plus 750 caractères) |
| timestamps | Création et mise à jour |

Un exemplaire appartient à un utilisateur et à une variante. Il ne possède jamais de `collection_id`.

Chaque exemplaire est une ligne distincte. Un champ de quantité ne doit pas remplacer ces lignes, car chaque copie peut avoir son propre nom et sa propre note.

En Phase 6A.1, le nom vide est enregistré à `NULL`. Sans nom personnalisé, l’UI affiche `Exemplaire N`, recalculé selon `created_at`, puis `id`, sans persister ce libellé ni un ordre manuel. L’ajout explicite crée un seul exemplaire ; supprimer le dernier conserve les éléments de collection.

### État / note — Phase 6A.2 préparée

La note est un texte libre multiligne, sans interprétation métier, enum ni parsing. Le service refuse plus de 750 caractères Unicode avant envoi ; une chaîne vide ou uniquement composée d'espaces blancs devient `NULL`. Le texte utile, ses espaces et ses retours à la ligne sont conservés. L'UI propose un champ facultatif et un compteur, puis une icône document dépliant la note en lecture seule sous la ligne. Un destinataire autorisé dispose de cette lecture, sans actions d'édition ou de suppression.

La [migration 6A.2](../supabase/migrations/20260923191714_phase6a2_physical_copy_note.sql), créée mais volontairement non appliquée, supprime `condition`, `is_graded`, `grading_company`, `grading_score`, leur contrainte et les grants de colonnes associés. Elle conserve `name`, `note`, les identifiants, timestamps, index, triggers et policies RLS. `physical_copies_note_length_check` impose `char_length(note) <= 750`, avec `NULL` autorisé. Aucune donnée n'est tronquée : une note existante trop longue fera échouer la transaction entière.

Le workflow reporte l'application des migrations Phase 6 et les tests DB correspondants. Les tests SQL sont adaptés au schéma attendu, sans preuve d'exécution 6A.2. Le générateur du dépôt introspecte la DB locale : `database.generated.ts` reste inchangé et contient encore les quatre anciennes colonnes ; sa régénération réelle attendra l'application manuelle. Le service sélectionne explicitement `id`, `name`, `note`, `created_at`, déjà typés, sans utiliser les anciennes colonnes. Une compilation réussie ne prouve donc pas l'application du nouveau schéma.

Avant validation de la transaction, un rollback conserve les données. Après application, récupérer les métadonnées supprimées nécessite une sauvegarde et une nouvelle migration corrective ; les migrations historiques restent immuables. Cette préparation ne clôture ni 6A.2 globalement ni la Phase 6.

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

La ligne représente directement un partage actif dès confirmation du propriétaire. Aucun statut, invitation, acceptation ou refus n'existe dans la V1.

Le propriétaire et le destinataire peuvent chacun supprimer la ligne de partage. Cela conserve la collection, ses éléments et les exemplaires. Un trigger interdit le partage vers le propriétaire et verrouille la collection lors de la vérification ; une modification privilégiée du propriétaire ne peut pas non plus créer un partage vers soi-même. La création depuis `public_id` attend la fonctionnalité dédiée.

## Suppressions des données utilisateur

La suppression volontaire d'une collection peut être physique dans la V1. Elle supprime en cascade :

- ses `collection_items` ;
- ses `collection_shares`.

Elle ne supprime jamais les `physical_copies` de son propriétaire.

Retirer un élément manuel supprime uniquement son `collection_item`. Supprimer un exemplaire supprime uniquement la ligne `physical_copies` concernée.

### Suppression d'un compte

La Phase 4 valide l'effacement définitif du compte et de toutes les données applicatives qui lui appartiennent. Cette opération exige les confirmations et la nouvelle vérification **mot de passe actuel + TOTP actuel** définies dans les [fonctionnalités](01-FEATURES.md#suppression-définitive-du-compte). Une session `aal2` existante n'est pas suffisante. Aucun droit de suppression directe de `profiles` ou de `user_preferences` n'est ouvert au navigateur par ce cadrage.

Les dépendances suivantes existent dans la [migration de schéma Phase 1](../supabase/migrations/20260906082312_phase1_schema.sql) et la [migration des préférences](../supabase/migrations/20260909124950_pre_phase3_collection_preferences.sql) :

| FK actuelle | Règle `ON DELETE` | Conséquence pour le compte supprimé |
|---|---|---|
| `profiles.id → auth.users.id` | `RESTRICT` | Le profil doit être traité avant l'effacement Auth avec le schéma actuel |
| `collections.owner_id → profiles.id` | `RESTRICT` | Les collections possédées doivent être supprimées avant le profil |
| `physical_copies.user_id → profiles.id` | `RESTRICT` | Tous les exemplaires du compte doivent être supprimés, même hors collection |
| `collection_shares.recipient_user_id → profiles.id` | `RESTRICT` | Les relations donnant les accès reçus doivent être supprimées avant le profil |
| `user_preferences.user_id → profiles.id` | `CASCADE` | La suppression du profil supprime ses préférences |
| `collection_items.collection_id → collections.id` | `CASCADE` | La suppression d'une collection possédée supprime tous ses éléments |
| `collection_shares.collection_id → collections.id` | `CASCADE` | La suppression d'une collection possédée supprime tous ses partages |

Il faut donc couvrir les deux sens du partage : collections possédées partagées à autrui, et relations dont le compte supprimé est destinataire. Supprimer un accès reçu conserve la collection de l'autre propriétaire, ses éléments, ses exemplaires et ses autres destinataires. Les collections possédées supprimées deviennent inaccessibles à leurs destinataires.

Les noms et notes disparaissent avec les `physical_copies` du compte. Aucun exemplaire d'autrui n'est visé, même s'il référence la même Variante. La suppression d'une collection seule continue à conserver les exemplaires ; seule la suppression complète du compte les efface tous.

**Préservation obligatoire :** aucune suppression dans `pokemon`, `tcg_series`, `tcg_sets`, `source_cards`, `catalog_variants`, `card_pokemon`, `automatic_target_states` ou les tables privées du pipeline. Les FK d'éléments/exemplaires vers les Variantes et de collections vers leurs cibles ne justifient aucune suppression du catalogue. Les données des autres comptes sont préservées, hors les seules relations de partage devenues sans objet.

L'[Edge Function dédiée](05-ARCHITECTURE.md#suppression-du-compte--contraintes-dorchestration) vérifie la session initiale, refait l'authentification mot de passe et un nouveau challenge/vérification TOTP sur la même identité, exige la confirmation finale, puis révoque les sessions et appelle Auth Admin en suppression physique. Aucun UUID cible libre, secret privilégié ou nettoyage SQL n'est envoyé au navigateur.

Le trigger `auth_user_deleting_account`, `BEFORE DELETE ON auth.users`, appelle `private.delete_account_data_for_auth_user()`. Cette fonction sans argument utilise uniquement `OLD.id`. Elle verrouille le profil avec `FOR UPDATE`, retire les partages reçus, supprime les collections possédées (cascades éléments/partages), les exemplaires, puis le profil (cascade préférences). Les index FK existants couvrent ces recherches. Les FK restent inchangées et continuent à refuser les références orphelines ; le verrou du parent fait attendre les nouvelles références concurrentes.

Le nettoyage et la suppression Auth font partie de **la même transaction**. Aucune RPC publique ni transaction de nettoyage séparée n'est nécessaire. Une FK bloquante lors du dernier DELETE restaure également les collections, éléments, partages et exemplaires déjà traités ; ce cas est testé via pgTAP et via le véritable Auth Admin. Une suppression privilégiée répétée ne modifie plus rien. L'Edge Function refuse le JWT d'un utilisateur déjà supprimé. En cas d'échec SQL, la révocation préalable des sessions reste effective : l'utilisateur peut se reconnecter et recommencer une vérification complète. Les courses ou deadlocks SQL échouent sans destruction partielle.

La fonction de trigger est `SECURITY DEFINER` avec `search_path = ''` et aucun `EXECUTE` pour PUBLIC, anon, authenticated, service_role ou supabase_auth_admin. Son identité vient du DELETE Auth privilégié, comme l'identité du trigger de création vient d'Auth ; elle ne dépend pas d'un `auth.uid()` administratif absent. Les rôles navigateur ne peuvent supprimer ni `auth.users` ni `profiles` et ne peuvent appeler le trigger. Les administrateurs Auth demeurent des opérateurs de confiance : une suppression physique administrative déclenche le même nettoyage.

Le [rapport local](reports/2026-09-14-PHASE4B3-ACCOUNT-DELETION.md) consigne les preuves d'atomicité, de préservation des autres comptes et du catalogue. Le [checkpoint Cloud 4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) vérifie l'intégration réelle Auth + migration + fonction et la préservation des empreintes des données existantes, sans rejouer toute la matrice pgTAP. Les exigences légales/rétentions particulières restent ouvertes à un cadrage spécifique, sans durée ou exception ajoutée ici. Aucune migration historique n'est modifiée.

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

### Lecture Dashboard

La [migration Dashboard](../supabase/migrations/20260920194903_phase5_dashboard_collections.sql) livre la vue publique `dashboard_collections`, avec `security_invoker = true` et uniquement un grant `SELECT` à `authenticated`. Elle expose `collection_id UUID`, `name TEXT`, `collection_type TEXT`, `access TEXT`, `target_type TEXT`, `target_name TEXT`, `owned_count BIGINT` et `total_count BIGINT`. Le [service Collections](../src/services/collections.ts) les transforme en champs métier camelCase en une lecture, sans N+1 frontend. Aucun ordre de présentation n'est imposé.

`access` vaut `owned` si `collections.owner_id = auth.uid()`, sinon `shared` pour une collection visible par les policies de partage existantes. Les cibles automatiques utilisent exclusivement `pokemon.name_fr` ou `tcg_sets.name_fr` ; les noms absents restent `NULL`. Une collection personnalisée n'a ni type ni nom de cible. Un set désigne l'Extension précise, jamais sa série.

Une agrégation par collection compte tous ses `collection_items`, manuels et automatiques. Un `EXISTS` sur `physical_copies`, contraint par la variante de l'item et `user_id = collections.owner_id`, compte chaque item possédé au plus une fois. Les copies du destinataire n'influencent donc pas la progression partagée. Une collection vide renvoie `0 / 0` ; les valeurs sont recalculées à chaque lecture, sans compteur stocké.

Les RLS permettent déjà cette vue invoker : `collections_read` expose les collections personnelles et réellement partagées, `collection_items_read` leurs éléments, et `physical_copies_read` seulement les copies du propriétaire pertinentes pour les collections reçues, en plus des copies personnelles. Aucun élargissement des policies ni nouveau `SECURITY DEFINER` n'est nécessaire. Les restrictions `require_mfa` et `require_my_profile` des tables sources continuent de s'appliquer, y compris aux cibles catalogue ; `anon` n'a aucun droit sur la vue. Le résumé n'expose ni identifiant de propriétaire ni détail d'exemplaire et n'ajoute aucune capacité d'écriture ou de partage.

La [suite Dashboard](../supabase/tests/database/012_dashboard_collections.test.sql) vérifie les rôles propriétaire/destinataire/tiers/anon, les restrictions MFA/profil, les cibles, les collections vides, les copies multiples, la progression partagée et le retrait d'accès. Ses fixtures dédiées sont intégralement annulées par `ROLLBACK`.

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

Une ligne représente exactement un Pokémon ou un set compatible avec `target_type`, garanti par un `CHECK`. Deux contraintes `UNIQUE` sur les cibles nullables assurent un seul état courant par Pokémon et par set. `generation_version BIGINT` est obligatoire et strictement positive. `content_hash TEXT` est obligatoire et non vide, sans longueur ou algorithme de digest imposé. Aucun état fictif ni calcul de structure n'est créé en Phase 1.

### Hash de structure

`content_hash` représente la liste effective et ordonnée des IDs internes de variantes éligibles pour la cible.

Le pipeline calcule SHA-256 sur le JSON compact de la liste ordonnée des IDs internes, sérialisés comme chaînes décimales. La version initiale vaut 1 ; elle augmente de 1 uniquement si le hash change. Si seule une métadonnée descriptive change sans modifier cet ordre, hash, version et timestamp restent identiques.

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

### Calcul canonique PostgreSQL interne

La [migration du calcul canonique](../supabase/migrations/20260920134607_phase5_canonical_collection_structure.sql) définit `private.canonical_collection_variants(p_target_type TEXT, p_target_id BIGINT) RETURNS TABLE (variant_id BIGINT, automatic_rank BIGINT)`. Elle renvoie les variantes dans l'ordre canonique avec des rangs continus `1…N`, en lecture seule, sans créer ni modifier de collection ou d'état de cible.

Elle reproduit [le pipeline catalogue](../scripts/catalog/plan.ts) à partir du catalogue effectif persisté : variante active, `size = 'standard'`, disponibilité française `confirmed`, carte et set actifs. `source_present`, la catégorie de carte et l'activité du Pokémon ou de la série n'ajoutent aucun filtre. Une cible Pokémon utilise `card_pokemon`, sans multiplier les variantes des cartes multi-Pokémon ; une cible `set` désigne un set précis et inclut toutes les catégories.

L'ordre Pokémon utilise `catalog_variants.effective_release_date ASC NULLS LAST`, puis `source_cards.normalized_number`, `catalog_variants.sort_order`, la clé canonique de carte et `variant_key`. L'ordre Set reprend ces critères sans date. Les rangs sont ceux matérialisés par le pipeline ; la clé de carte est `tcgdex:<tcgdex_id>` ou l'alias local `my:<id-override>` conservé dans `private.catalog_entity_keys`. Le helper interne `private.catalog_utf16_sort_key(TEXT)` reproduit les départages lexicographiques UTF-16 de `model.ts`, indépendamment de la collation PostgreSQL. Le calcul suppose un catalogue construit par le pipeline, avec ses rangs et clés persistés.

Contrat des arguments : une cible existante sans variante éligible renvoie zéro ligne ; un type autre que `pokemon`/`set`, un type `NULL` ou un ID `NULL` lève `22023` ; un ID inexistant pour le type demandé lève `P0002`. Le helper est `STABLE`, `SECURITY INVOKER`, avec `search_path = ''` et références qualifiées. Les deux fonctions restent internes : aucun droit d'exécution pour `PUBLIC`, `anon`, `authenticated` ou `service_role`, aucun nouveau droit d'écriture utilisateur. Une future opération métier contrôlée devra assurer sa propre autorisation et sa cohérence transactionnelle.

La [suite SQL canonique](../supabase/tests/database/010_canonical_collection_structure.test.sql) couvre éligibilité, ordres, départages, cas limites et privilèges avec des fixtures annulées par `ROLLBACK`. Avant ces fixtures, elle contrôle **tous** les `automatic_target_states` présents : sérialisation compacte des IDs ordonnés comme chaînes décimales, UTF-8, SHA-256, comparaison à `content_hash`. Le nombre de cibles est dynamique et le résultat attendu est zéro divergence, y compris pour les structures vides (`[]`).

## Opérations métier des collections automatiques

### Création transactionnelle

La [migration de création automatique](../supabase/migrations/20260920140934_phase5_create_automatic_collection.sql) définit la RPC `public.create_automatic_collection(p_name TEXT, p_target_type TEXT, p_target_id BIGINT) RETURNS TABLE (collection_id UUID, created BOOLEAN)`. Elle retourne exactement une ligne : UUID créé et `true`, ou UUID de la collection personnelle existante et `false`. Le client fournit uniquement le nom, le type `pokemon`/`set` et l'ID interne de cible.

La fonction est `VOLATILE`, `SECURITY DEFINER`, avec `search_path = ''`. Elle vérifie explicitement `auth.uid()`, `auth.jwt()->>'aal' = 'aal2'` et l'existence du profil MY. ; elle ne dépend pas de la RLS qu'elle peut contourner. Seul `authenticated` reçoit `EXECUTE`, sans nouveau droit direct sur les items ou les champs protégés des collections. Le propriétaire, le type de collection, la version, les variantes et les positions sont déterminés côté PostgreSQL.

Avant toute lecture de cible, d'état ou de structure catalogue, la RPC prend `pg_advisory_xact_lock_shared(771402)`. Le pipeline prend le verrou exclusif correspondant : une sync attend les créations actives, et une création attend la fin d'une sync. Plusieurs créations peuvent détenir le verrou partagé ensemble ; il est conservé jusqu'à la fin de la transaction appelante.

La RPC recherche d'abord la collection automatique du propriétaire pour cette cible. Si elle existe, elle la retourne sans modifier aucun champ ni item, même si le nouveau nom est invalide, si l'état catalogue manque ou diverge, ou si la structure actuelle est vide. Les contrôles d'identité restent obligatoires.

Pour une création, la cible doit exister et posséder un `automatic_target_states`. Sous le verrou partagé, la RPC lit sa version et son hash, appelle le helper canonique une seule fois et matérialise ses IDs ordonnés. Elle calcule SHA-256 du JSON compact UTF-8 de ces IDs sous forme de chaînes décimales, puis exige l'égalité avec `content_hash`. Une nouvelle structure vide est refusée. Le nom est soumis aux contraintes PostgreSQL existantes (`NOT NULL`, au moins trois caractères utiles après trim), sans nouvelle normalisation ni modification de la valeur stockée.

Le parent reçoit `collection_type = 'automatic'`, la cible et `applied_target_version` issue de l'état. Chaque ID vérifié devient un item `origin = 'automatic'`, avec `automatic_rank = rang canonique` et `sort_position = rang canonique::NUMERIC(40,20)`. Cette égalité initialise l'ordre ; elle n'impose aucune égalité permanente entre les deux champs. Toute erreur, même pendant l'insertion des items, annule le parent et tous ses items.

Les index uniques propriétaire+cible existants arbitrent la concurrence via `INSERT ... ON CONFLICT DO NOTHING`. À `READ COMMITTED`, le perdant relit le gagnant dans une instruction distincte, puis renvoie son UUID avec `created = false` ; aucune mise à jour factice ne renomme le gagnant ou ne remplace ses items. La recherche verrouille la ligne existante contre la suppression jusqu'à la fin de la transaction ; une suppression entre le conflit et la relecture entraîne une nouvelle tentative. Les éventuelles erreurs de sérialisation sous un niveau d'isolation supérieur relèvent du retry transactionnel PostgreSQL habituel.

Les erreurs métier spécifiques sont identifiées par leur message stable et leur SQLSTATE :

| Message | SQLSTATE | Cas |
|---|---|---|
| `automatic_target_state_missing` | `P0002` | Cible existante sans état de génération |
| `automatic_target_hash_mismatch` | `23514` | Hash stocké différent de la structure canonique |
| `automatic_collection_empty` | `23514` | Nouvelle collection sans variante éligible |

Les arguments, contraintes de nom, cible inexistante et refus d'autorisation utilisent les codes PostgreSQL standards. La [suite SQL de création](../supabase/tests/database/011_create_automatic_collection.test.sql) couvre ces contrats et injecte une erreur après insertion du parent et du premier item pour prouver le rollback. Le [test multi-connexion local](../scripts/test-automatic-collection-concurrency.ts), lancé par `npm run db:test:concurrency`, fait attendre deux appels simultanés derrière une sync, observe le conflit réel d'unicité, contrôle une création indépendante par un autre propriétaire et vérifie l'attente inverse de la sync. Ses fixtures sont supprimées explicitement en fin de test ; la suite pgTAP annule les siennes par `ROLLBACK`.

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
- son `origin` devient `automatic` ;
- son `automatic_rank` est défini selon le rang canonique système ;
- son `sort_position` est préservé autant que possible ;
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
9. préserver autant que possible l'ordre personnalisé de tous les éléments, automatiques et manuels, sans réinitialiser arbitrairement `sort_position` vers l'ordre canonique ;
10. enregistrer la nouvelle version appliquée.

Toutes les étapes réussissent ou échouent ensemble.

Si la cible évolue entre la preview et la validation, l'opération ne doit pas appliquer silencieusement un résumé obsolète. Elle refuse l'application avec l'ancienne version et permet de demander une nouvelle preview.

### Ajout manuel et réorganisation

L'ajout manuel vérifie côté serveur :

- que l'utilisateur est propriétaire ;
- que la variante existe et est utilisable dans la V1 ;
- qu'elle n'est pas déjà présente dans la collection.

Dans une collection automatique, l'élément ajouté est manuel. Dans une collection personnalisée, tous les éléments le sont.

L'ajout augmente immédiatement le total de progression. Une variante déjà possédée augmente aussi le numérateur.

Tous les éléments d'une collection personnalisée ou automatique sont librement réordonnables par le propriétaire. Un déplacement modifie `sort_position`, sans modifier `origin`, `automatic_rank`, le hash/version canonique, la version appliquée ou `automatic_target_states`. Les automatiques restent non supprimables manuellement ; les manuels peuvent être ajoutés, retirés et déplacés librement.

Les mises à jour actualisent les rangs canoniques tout en préservant autant que possible l'ordre personnalisé. Le placement d'un nouvel élément automatique dans cet ordre et la stratégie de préservation/ancrage des positions restent explicitement ouverts pour la Phase 8, sans algorithme exact d'insertion/fusion fixé. La possibilité de déplacer un automatique est définitivement validée.

#### Réorganisation 6A.3 — migration et primitives préparées

La [migration 6A.3](../supabase/migrations/20260923195220_phase6a3_reorder_collection_item.sql) est créée mais **non appliquée**. Elle ajoute deux contrats, sans changer les tables, les RLS ni les grants d'écriture directe :

- `get_collection_item_order(p_collection_id uuid) → uuid[]` : lecture `SECURITY INVOKER`, RLS existantes, IDs triés par `sort_position, id` dans un seul snapshot. Un tableau unique évite la limite de lignes REST et les incohérences de pagination. Aucun chargement détaillé des variantes ni exposition des positions.
- `reorder_collection_item(p_collection_id uuid, p_item_id uuid, p_placement text, p_anchor_id uuid DEFAULT NULL) → void` : `start`/`end` sans référence, ou `before`/`after` avec une référence distincte. L'item et la référence doivent appartenir à cette collection. Aucun paramètre propriétaire, position, origine ou rang canonique.

La mutation est `SECURITY DEFINER`, avec `search_path` vide et contrôle explicite de `auth.uid()`, `aal2`, du profil présent et de la propriété. Les deux fonctions sont exécutables uniquement par `authenticated`, sans grant `PUBLIC`, `anon` ou `service_role`. Le destinataire autorisé conserve la lecture de l'ordre ; il ne peut pas le modifier.

Un verrou `FOR UPDATE` sur le parent, conservé jusqu'à la fin de la transaction, sérialise les reorders d'une même collection et sa suppression. Après attente, les voisins sont relus sous `READ COMMITTED`, isolation habituelle de PostgREST. Une isolation à snapshot fixe est refusée avec `40001` avant écriture. Deux collections différentes ne partagent pas de verrou global. Les futures opérations structurelles devront respecter ce même verrou avant de changer les items ; aucune synchronisation temps réel n'est ajoutée.

Le serveur retire logiquement l'item de l'ordre courant puis l'insère à la destination demandée. Entre voisins, il arrondit leur midpoint à 20 décimales et vérifie les inégalités strictes ; aux extrémités, il utilise la position voisine moins/plus 1. Si cette position n'est pas représentable sans collision ou dépassement de `NUMERIC(40,20)`, ou si des positions héritées sont déjà égales, il rééquilibre **cette seule collection** en positions `1…N`, dans l'ordre logique exact demandé. Les égalités héritées utilisent l'UUID comme départage. Un déplacement déjà réalisé est sans effet, sauf réparation de positions égales. Les erreurs annulent toute la mutation ; les triggers `updated_at` existants restent actifs. Aucun item ni variante n'est créé/supprimé, aucun champ automatique ni parent n'est modifié.

Le service `collection-items` expose la lecture des IDs et un déplacement métier. Codes publics : `not_authorized`, `item_unavailable`, `order_conflict`, `unexpected`, sans texte SQL/PostgREST. Le hook `useCollectionItemReorder` conserve `collectionItemOrderKey(viewerId, collectionId)` comme lecture technique de l'ordre. Il bloque les autres déplacements pendant la sauvegarde et invalide/refetch cette clé ainsi que `collectionContentKey(viewerId, collectionId)` après succès **ou erreur**. Depuis 6B.3, le tableau de contenu est la source de l'ordre visible. Aucun cache optimiste, aucun rafraîchissement des compteurs du Dashboard. Un échec de lecture masque l'ordre caché et bloque la réorganisation jusqu'à actualisation réussie.

`CollectionItemReorderList` reçoit les IDs/libellés ordonnés, `renderItem`, `availability`, `onMove` et le feedback du hook. Non monté en 6A.3, il est désormais composé par la liste propriétaire 6B.3 avec les IDs et lignes issus du contenu, sans recréer un état d'ordre local. La dépendance épinglée `@hello-pangea/dnd@18.0.1`, compatible React 19, fournit les capteurs éprouvés pour listes : poignée dédiée de 44 px, souris, appui tactile prolongé avec annulation du geste si scroll avant activation, clavier Espace/flèches/Espace et Échap. Instructions et annonces sont en français. Les autres actions de ligne ne déclenchent pas le déplacement. Une disponibilité `{ enabled: false, reason }` couvre notamment la lecture seule et le futur filtre actif ; la raison reste accessible au focus. Aucun mode global d'édition, bouton de sauvegarde d'ordre ou reset.

Les types générés restent inchangés : le complément explicite `PendingCollectionReorderDatabase` décrit uniquement ces RPC attendues, sans prétendre que la DB les expose déjà. Après application manuelle, régénérer réellement les types et retirer ce complément. Le test pgTAP `014_collection_reorder.test.sql` et `scripts/test-collection-reorder-concurrency.ts` ont été exécutés avec succès sur installation locale temporaire lors de 6C.1 ; le second utilise des fixtures synthétiques et vérifie l'attente réelle de deux connexions, l'indépendance d'une autre collection, l'atomicité et le rollback. Il exige une base locale disposant des fonctions ; il n'applique aucune migration. Un rollback du déploiement peut supprimer les deux fonctions par une nouvelle migration ; les positions stockées restent valides. Cette préparation ne clôture pas la Phase 6.

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
| `profiles` | Lecture de son profil uniquement ; aucune édition utilisateur | Pas de parcours général | Aucun parcours général |
| `user_preferences` | Lecture et sauvegarde de ses seules préférences | Aucun accès aux préférences du propriétaire | Aucun accès |
| `collections` | Lecture, modification et suppression | Lecture seule de la collection partagée | Aucun accès |
| `collection_items` | Gestion dans les limites fonctionnelles | Lecture seule des éléments partagés | Aucun accès |
| `physical_copies` | Gestion de ses exemplaires | Lecture limitée aux exemplaires du propriétaire et aux variantes présentes dans la collection partagée | Aucun accès |
| `collection_shares` | Gestion des partages de ses collections | Lecture des partages qui lui donnent accès, sans devoir voir les autres destinataires | Aucun accès |
| catalogue | Lecture nécessaire à l'application | Lecture nécessaire à la consultation | Aucune écriture utilisateur |
| schéma privé | Accès privilégié uniquement | Aucun accès | Aucun accès |

Un utilisateur anonyme n'accède pas aux données privées authentifiées. Un processus privilégié peut synchroniser le catalogue depuis un environnement de confiance, sans exposer ses privilèges au navigateur.

Les opérations structurantes peuvent être limitées aux RPC afin que la RLS et les contraintes ne soient pas contournées par une suite d'écritures directes.

### Permissions effectivement accordées

La matrice précédente décrit la cible fonctionnelle V1. Le socle SQL accorde actuellement les accès suivants, tous soumis à `aal2` pour `authenticated` :

| Ressource | Accès direct `authenticated` |
|---|---|
| Catalogue et états de cible | `SELECT` uniquement, policies de lecture authentifiée |
| Profil | Lecture de sa propre ligne uniquement ; aucune insertion, modification ou suppression |
| Préférences (complément avant Phase 3) | Lecture/insertion de sa ligne et modification des quatre champs de vues, sans transfert ni suppression directe |
| Collections | Lecture si propriétaire ou destinataire ; insertion des seuls champs `name` et `collection_type`, limitée à `free` ; modification du seul `name` ; suppression par propriétaire |
| Éléments | Lecture des collections accessibles ; aucune écriture directe, même pour le propriétaire |
| Exemplaires | Lecture de ses lignes ou des seules variantes du propriétaire présentes dans une collection effectivement partagée ; insertion et édition des champs autorisés ; suppression de ses propres lignes |
| Partages | Lecture par propriétaire ou destinataire concerné ; suppression par l'un ou l'autre ; aucune insertion ou modification directe |

Les insertions de collections et d'exemplaires attribuent le propriétaire depuis `auth.uid()`. Les grants de colonnes ne permettent de modifier ni les propriétaires, ni les IDs, ni les versions ou cibles automatiques, ni les timestamps techniques. Les policies `UPDATE` comprennent à la fois `USING` et `WITH CHECK`. Les contraintes et triggers restent applicables aux écritures privilégiées.

`anon` n'a aucun grant applicatif, y compris sur le catalogue. Les privilèges par défaut des nouveaux objets créés par `postgres` sont fermés ; les migrations futures devront accorder explicitement leurs droits. Les 12 tables Phase 1, les 3 tables privées Phase 2 et la nouvelle table de préférences activent la RLS explicitement. `service_role`, réservé à un environnement de confiance, reçoit `SELECT / INSERT / UPDATE / DELETE` sur les tables applicatives et l'usage des seules séquences catalogue nécessaires, sans grant applicatif `TRUNCATE`, `TRIGGER` ou `CREATE`.

Le helper RLS `SECURITY DEFINER` `private.owns_collection(uuid)` renvoie uniquement si `auth.uid()` est propriétaire de la collection donnée, sans paramètre d'identité utilisateur. Il évite la récursion des policies entre collections et partages. Son `search_path` est vide et son `EXECUTE` est accordé uniquement à `authenticated` pour l'évaluation des policies par référence résolue. Aucun `USAGE` général sur `private` n'est accordé aux rôles API ; le helper ne constitue pas une RPC exposée. Depuis 3A, le trigger de création du profil est également `SECURITY DEFINER`, sans droit d'appel direct. Les autres fonctions techniques restent `SECURITY INVOKER`, sans droits d'appel API.

### Restriction MFA de Phase 3A

Chaque table applicative `public` porte une policy `require_mfa AS RESTRICTIVE FOR ALL TO authenticated`, avec `USING` **et** `WITH CHECK` sur `(select auth.jwt()->>'aal') = 'aal2'`. Cela couvre `pokemon`, `tcg_series`, `tcg_sets`, `source_cards`, `catalog_variants`, `card_pokemon`, `automatic_target_states`, `profiles`, `collections`, `collection_items`, `physical_copies`, `collection_shares` et `user_preferences`.

Cette restriction s'ajoute par **ET** aux policies métier permissives existantes, selon le [mécanisme MFA/RLS Supabase](https://supabase.com/docs/guides/auth/auth-mfa#database). `aal1`, claim absent ou autre valeur : lectures invisibles, insertions refusées, mises à jour/suppressions sans ligne accessible. `aal2` n'accorde pas de droit supplémentaire : propriété, partage en lecture seule et restrictions de colonnes continuent à s'appliquer. Les appels Auth d'enrollment/challenge restent disponibles à `aal1`.

Le claim `aal2` exprime le niveau de session ; les policies MFA/propriété existantes restent inchangées. Les mutations natives Auth suivent les [protections du compte](05-ARCHITECTURE.md#sécurité-des-actions-de-gestion-du-compte) : mot de passe actuel exigé côté Auth pour le changement volontaire, double confirmation Secure Email Change pour l'email. Leur contrôle ne relève pas d'une RPC ou d'une policy applicative. Le TOTP frais est imposé par l'Edge Function de suppression ; aucune table de preuve ou permission temporaire n'est ajoutée.

La suppression ajoute `require_my_profile AS RESTRICTIVE FOR ALL TO authenticated` aux mêmes 13 tables. `USING` et `WITH CHECK` appellent `(select private.has_my_profile())` : un test stable, sans argument, de la présence du profil de `auth.uid()`. Son `SECURITY DEFINER` évite une récursion RLS et son `search_path` est vide. Seul authenticated reçoit `EXECUTE`, sans `USAGE` général du schéma privé, suivant le modèle du prédicat de propriété existant. Après suppression du profil, un JWT `aal2` résiduel ne peut plus lire les données ni écrire, y compris dans le catalogue. Ce prédicat ne constitue pas une vérification générale de révocation par `session_id` pour les comptes qui existent encore.

`service_role` conserve ses grants et `BYPASSRLS`. Le pipeline PostgreSQL privilégié et les trois tables privées restent inchangés ; aucune fonction privilégiée n'est exposée dans `public`. Toute future table ou RPC devra préserver cette frontière, notamment une RPC `SECURITY DEFINER` qui contournerait normalement la RLS. Les JWT déjà émis restent soumis à leur expiration après une révocation administrative ; voir la procédure opérateur.

### Automatic RLS existant

La migration de durcissement vérifie `to_regprocedure('public.rls_auto_enable()')`. Si la fonction existe, elle retire `EXECUTE` à `PUBLIC`, `anon`, `authenticated` et `service_role`. Si elle est absente, la migration ne fait rien. Elle ne supprime, ne remplace et ne désactive ni la fonction ni l'event trigger. Un test local rejoue cette migration avec une fonction absente puis un event trigger synthétique actif, et vérifie qu'il continue d'activer la RLS.

### Fonctions privilégiées

`SECURITY DEFINER` ne doit pas être utilisé par défaut. Lorsqu'une fonction en a réellement besoin, elle doit :

- vérifier explicitement `auth.uid()` lorsque l'opération est liée à un utilisateur appelant ; pour un trigger interne Auth sans droit d'appel, tirer l'identité exclusivement de `NEW.id`/`OLD.id` ;
- limiter strictement son action et ses paramètres ;
- fixer un `search_path` sûr ;
- disposer de droits d'exécution restreints ;
- ne pas devenir un contournement général de la RLS.

Les futures vues ou fonctions exposées doivent préserver le même périmètre d'accès que les tables sous-jacentes et ne jamais élargir implicitement la visibilité des données. Aucune vue ou RPC fonctionnelle n'est créée en Phase 1.

## Opérations directes et centralisées

Les opérations simples peuvent être effectuées directement via Supabase lorsque RLS et contraintes suffisent, notamment :

- lire le catalogue ;
- lire une collection autorisée ;
- lire et gérer ses exemplaires ;
- modifier une note ;
- consulter son profil, sans champ éditable dans la V1 ;
- renommer sa collection.

Les opérations touchant plusieurs lignes ou des invariants importants restent centralisées, notamment :

- créer une collection automatique ;
- produire la preview d'une mise à jour ;
- appliquer une mise à jour ;
- effectuer une réorganisation structurelle complexe ;
- partager par identifiant public ;
- supprimer définitivement son compte, avec les contraintes de ré-authentification et d'orchestration définies ci-dessus ;
- éventuellement ajouter ou retirer un élément lorsque l'ordre ou l'origine exigent un contrôle renforcé.

## Vues dérivées

Des vues ou requêtes dédiées peuvent simplifier la lecture sans devenir de nouvelles sources de vérité.

### Possession

Une vue conceptuelle peut agréger `user_id`, `variant_id` et `copy_count` depuis `physical_copies`. Elle sert à déterminer la possession et le nombre d'exemplaires.

### Progression et dashboard

Une vue ou requête peut produire `total_count`, `owned_count` et le pourcentage dérivé pour chaque collection. Le total inclut tous les `collection_items`, y compris les ajouts manuels, et le calcul des exemplaires utilise le propriétaire de la collection.

### Catalogue enrichi

Une vue peut réunir les valeurs effectives nécessaires à l'affichage et à la recherche, à condition de préserver la traçabilité entre source et correction et de ne pas exposer les mécanismes privés.

Pour Pokémon/Extension, `card_count` est le nombre de `source_cards` distinctes réellement affichées et `variant_count` le nombre de variantes correspondantes selon le même périmètre catalogue. Les agrégations doivent éviter de multiplier les variantes par les liens `card_pokemon`. `tcg_sets.official_card_count` reste le nombre officiel, distinct du total MY. Aucun compteur persistant, vue ou RPC supplémentaire n'est ajouté avant que les requêtes de lecture le justifient. Toute future vue exposée doit respecter Auth/RLS et les droits des tables sous-jacentes.

## Index

Les index doivent répondre aux requêtes réelles ; toutes les colonnes ne sont pas indexées par défaut.

### Catalogue

Les accès suivants doivent disposer d'index ou de contraintes uniques adaptés :

- `pokemon.dex_number` ;
- les identifiants TCGdex uniques pertinents ;
- `tcg_sets.series_id` ;
- `source_cards.set_id` ;
- `source_cards.local_id` ;
- `(effective_release_date, normalized_number, id)` sur `source_cards`, index historique Phase 1 conservé ; le tri Pokémon Phase 2 utilise les dates de variantes dans le plan TypeScript ;
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

Les deux index uniques partiels propriétaire/cible automatique complètent ces accès. La PK `user_preferences(user_id)` suffit pour les lectures et modifications de préférences par propriétaire.

### Exemplaires et partages

L'index `(user_id, variant_id)` de `physical_copies` est central pour la possession, le nombre d'exemplaires et la progression.

Les partages nécessitent des accès efficaces par `collection_id` et `recipient_user_id`, en plus de l'unicité `(collection_id, recipient_user_id)`.

## Recherche, classeur et préférences

L'accès aux données des recherches de la V1 repose sur Supabase/PostgreSQL sous Auth/RLS. La recherche globale retourne des Cartes sources uniques, jamais des Variantes ; Pokémon utilise le nom français, Extension et Collection leur nom uniquement. La recherche interne filtre les variantes de la collection accessible ; la recherche d'ajout sélectionne la Variante exacte. La logique Carte portable de `scripts/catalog/search-catalog.ts` reste le socle de normalisation, tokenisation, matching, score et tri ; `search-catalog-db.ts` avec `pg` reste réservé à la maintenance locale.

La première implémentation doit rester proportionnée au besoin. `pg_trgm`, les index GIN, des colonnes normalisées ou la recherche full-text ne seront ajoutés que si les mesures le justifient.

Les pages du classeur ne sont pas persistées dans une table `binder_pages`. Elles sont calculées côté frontend à partir des `collection_items`, de leur ordre, du format de page et du mode continu ou par blocs. La hiérarchie variante → carte → set → série permet d'identifier les changements de bloc.

Les deux préférences de vues et leurs derniers modes sont persistés dans `user_preferences`. Le format de classeur et son mode d'organisation restent ouverts quant à leur persistance. Aucun stockage générique de réglages n'est ajouté.

## Synchronisation TCGdex

La source, les transformations et les procédures de synchronisation sont définies dans le [pipeline catalogue](07-CATALOG-SYNC.md). Le présent document en fixe uniquement les structures PostgreSQL et les contraintes associées.

### `private.catalog_sync_runs`

Cette table privée trace chaque apply, y compris un noop. Elle conserve :

- son identifiant ;
- le début et la fin ;
- le statut ;
- le dépôt source et le commit SHA du snapshot `cards-database` ;
- des statistiques ciblées ;
- un résumé d'erreur éventuel.

Statuts : running, success, failed. Le SHA source comporte 40 caractères hexadécimaux, le hash des overrides 64. Le run conserve également la date du commit et la version du pipeline. Le dry-run ne crée aucune ligne technique. Un échec de validation laisse la base intacte ; une erreur pendant apply annule le catalogue et peut produire ensuite un journal failed.

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

Le socle Phase 1 est créé par les migrations reproductibles versionnées dans Git ; ses évolutions suivent le même mécanisme. Les tables, contraintes, fonctions, politiques et index ne doivent pas exister uniquement sous forme de changements manuels dans le dashboard Supabase.

Les migrations définissent la structure. Le catalogue TCGdex complet est alimenté par le pipeline d'import ou de synchronisation et ne doit pas être inséré dans une migration SQL gigantesque.

## Vérifications attendues

Les suites [de tests PostgreSQL](../supabase/tests/database/) de Phase 1 couvrent la structure, les contraintes, les suppressions, les droits de table et de colonne, la RLS et Automatic RLS. `npm run db:test` exécute pgTAP via la CLI installée. Les fixtures synthétiques sont créées dans des transactions annulées, avec propriétaire, deux destinataires, tiers et rôle anonyme. Les suites suivantes couvrent également le calcul canonique, la création automatique et la progression Dashboard livrés. Les scénarios de conversion, mise à jour et ancrage restent à tester lors de leur implémentation.

### Contraintes et logique métier

Les tests de base devront notamment vérifier :

- l'unicité automatique propriétaire/Pokémon et propriétaire/Extension, sans limiter les propriétaires différents ou les collections personnalisées ;
- le minimum de 3 caractères utiles après trim pour tous les noms de collections ;
- les valeurs autorisées des préférences, leur lecture et modification par le propriétaire et leur isolation RLS ;
- l'impossibilité de dupliquer une variante dans une collection ;
- l'impossibilité d'une double cible automatique ;
- l'absence de cible et de version sur une collection personnalisée ;
- la conservation des exemplaires après suppression d'une collection ;
- la suppression complète du seul compte visé, y compris exemplaires hors collection, préférences et partages dans les deux sens, avec préservation du catalogue et des données d'autrui ;
- la conversion manuel vers automatique sur le même `collection_item`, sans doublon, avec `origin = automatic`, `automatic_rank` défini et `sort_position` préservé autant que possible ;
- le retrait automatique sans suppression d'exemplaire ;
- la progression incluant les éléments manuels ;
- l'initialisation dans l'ordre canonique Pokémon ou Extension ;
- la réorganisation par le propriétaire des éléments automatiques et manuels via `sort_position`, sans changement d'origine, de rang canonique, de hash/version canonique, de version appliquée ni d'`automatic_target_states` ;
- des collections de même cible/version avec les mêmes éléments automatiques et des positions différentes ;
- l'interdiction de suppression manuelle d'un élément automatique ;
- la mise à jour des `automatic_rank` et la préservation autant que possible de l'ordre personnalisé, sans réinitialisation arbitraire des positions ; les scénarios précis d'insertion/ancrage seront définis après le cadrage Phase 8.

### RLS

Les scénarios de sécurité doivent couvrir au minimum :

- le propriétaire ;
- un utilisateur tiers non autorisé ;
- le destinataire d'un partage ;
- un utilisateur anonyme ;
- le processus privilégié de synchronisation.

Ils doivent vérifier les droits de lecture et d'écriture, ainsi que l'absence d'accès transversal aux profils, collections et exemplaires.

Les vérifications de Phase 4 distinguent : refus serveur du changement volontaire sans mot de passe actuel ou avec une valeur incorrecte ; changement d'email final uniquement après les deux confirmations, dans chaque ordre ; maintien du recovery sans ancien mot de passe ; et suppression avec refus d'une simple session `aal2`, échec de chaque facteur et erreurs/reprises. Le [rapport email/mot de passe](reports/2026-09-13-PHASE4B2-ACCOUNT-AUTH.md) reste historique. Les [tests de suppression](../supabase/tests/database/009_account_deletion.test.sql) et le [script d'intégration](../scripts/test-account-deletion.js) couvrent le backend réellement livré, ses privilèges, rollback, partages dans les deux sens et JWT résiduels ; leurs résultats figurent dans le [rapport de réalisation](reports/2026-09-14-PHASE4B3-ACCOUNT-DELETION.md).

## Invariants principaux

Le futur SQL et les opérations métier doivent garantir autant que possible que :

- une collection possède exactement un propriétaire ;
- son nom contient au moins 3 caractères utiles après trim ;
- une seule collection automatique existe par propriétaire et cible Pokémon ou Set ;
- les préférences sont uniques par profil, contrôlées et privées au propriétaire ;
- une collection personnalisée n'a ni cible automatique ni version appliquée ;
- une collection automatique possède exactement une cible Pokémon ou Set compatible ;
- une variante apparaît au maximum une fois dans une collection ;
- un élément référence une variante existante ;
- une collection personnalisée ne contient aucun élément automatique ;
- un élément automatique est librement déplaçable par le propriétaire, mais reste non supprimable manuellement tant qu'il appartient à la structure automatique ;
- un déplacement modifie `sort_position` sans modifier `automatic_rank`, `origin`, le hash/version canonique, la version appliquée ou `automatic_target_states` ;
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

- les migrations complémentaires nécessaires aux futures fonctionnalités ;
- pour la Phase 8, le placement d'un nouvel élément automatique dans un ordre personnalisé et la stratégie de préservation/ancrage des positions de tous les éléments ;
- l'implémentation PostgreSQL finale de la recherche et l'utilité mesurée de `pg_trgm` ;
- les évolutions des policies nécessaires aux futures opérations ;
- le code et les signatures finaux des RPC ;
- la persistance du format du classeur et du mode continu/par blocs ;
- les éventuelles exigences légales/rétentions particulières liées à la suppression ;
- la politique opérationnelle de sauvegarde ;
- les besoins futurs éventuels d'historique ;
- le modèle Premium post-V1.

## Synthèse

Le schéma de MY. repose sur une variante définie une fois dans le catalogue, référencée indépendamment par les collections et par les exemplaires physiques. Les exemplaires sont globaux au compte ; la possession et la progression sont dérivées, et tous les éléments de collection, manuels compris, contribuent au total.

Les collections automatiques sont matérialisées et versionnées par cible. Une évolution descriptive du catalogue est visible immédiatement, tandis qu'un changement de structure produit un nouveau hash, une nouvelle version, une preview puis une application explicitement validée et transactionnelle. Une conversion manuel vers automatique évite les doublons, et tout retrait structurel préserve les exemplaires.

La RLS protège les données utilisateur, les écritures du catalogue restent privilégiées, les migrations sont versionnées dans Git et le schéma reste compact pour la phase initiale. Aucun mécanisme Premium ou paiement n'est ajouté à la V1.
