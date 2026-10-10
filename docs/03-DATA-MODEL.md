# Modèle de données conceptuel de MY.

## Rôle du document

Ce document constitue la source de vérité concernant le modèle de données conceptuel de **MY.**. Il traduit en entités, responsabilités et relations les décisions définies dans la [vision](00-VISION.md), les [fonctionnalités de la V1](01-FEATURES.md) et la [politique d'intégration de TCGdex](02-TCGDEX.md).

Il ne constitue pas un schéma SQL définitif. La traduction PostgreSQL / Supabase retenue est définie dans le [document de base de données](06-DATABASE.md), tandis que le SQL final des migrations et les choix explicitement laissés ouverts restent hors du présent document.

## Organisation générale

Le modèle sépare trois niveaux :

1. le catalogue Pokémon TCG global, commun à tous les utilisateurs ;
2. les collections et préférences propres à chaque utilisateur ;
3. les exemplaires physiques réellement possédés par chaque utilisateur.

```text
TCGdex
   ↓
Catalogue global MY.
   ↓
Variantes de catalogue
   ├──────────→ Collections utilisateur
   └──────────→ Exemplaires physiques
                       ↑
                  Utilisateur
```

Les données personnelles sont isolées par utilisateur. Une collection référence des variantes du catalogue, tandis que les exemplaires physiques décrivent la possession réelle indépendamment des collections.

## Identifiants internes et externes

Les principales entités possèdent une identité interne stable propre à MY. Les identifiants provenant de TCGdex sont conservés comme références externes, sans être nécessairement les identifiants techniques principaux du modèle.

Une même entité peut donc porter :

- un identifiant interne MY. ;
- un ou plusieurs identifiants TCGdex ou externes.

Cette séparation permet de gérer les corrections locales, de préserver les relations lorsque la source évolue et de limiter la dépendance à la structure d'identification de TCGdex. Le schéma de la V1 utilise des UUID pour les principales entités utilisateur et des `BIGINT` internes pour le catalogue.

## Catalogue global

Le catalogue global regroupe les Pokémon, séries, sets, cartes sources, variantes, rattachements aux Pokémon, données TCGdex et corrections MY. Pour la V1, seules les cartes et variantes réellement disponibles en français sont éligibles aux générations automatiques.

### Pokémon

MY. représente de manière structurée les Pokémon pouvant servir de cible à une collection automatique. Le numéro du Pokédex national constitue leur référence fonctionnelle principale.

Cette représentation relie un Pokémon :

- aux cartes qui le représentent ;
- aux collections automatiques dont il est la cible.

La Phase 2 crée les Pokémon à partir des `dexId` effectifs après corrections. Leur nom français et leurs types proviennent du référentiel local versionné `pokemon-reference.json`, généré manuellement depuis PokéAPI : `pokemon-species` pour l'ID et le nom de langue `fr`, puis la ressource Pokémon de l'unique variété `is_default` pour les types ordonnés par `slot`. MY. représente l'espèce Pokédex, sans appliquer les types d'une forme alternative visible sur une carte. Le pipeline n'appelle jamais cette API et n'extrait aucun nom de carte, suffixe ou forme. Un dex absent du référentiel conserve le Pokémon avec `name_fr`, `primary_type` et `secondary_type` à `NULL` et un diagnostic. Les deux types TEXT nullables sont limités aux 18 identifiants PokéAPI ; le secondaire requiert un primaire différent. Aucune couleur n'est persistée.

Le rapprochement par `dex_number` conserve l'ID interne. Le nom versionné fait autorité sur le nom précédent, y compris pour une ligne inactive ; une correction de nom ou de type ne change ni les rattachements ni les IDs ordonnés, hashes ou versions des cibles automatiques. La [procédure de maintenance](../data/pokemon/README.md) distingue génération manuelle du fichier et synchronisation du catalogue.

### Séries ou blocs

Une série ou un bloc regroupe plusieurs sets. Cette entité doit pouvoir conserver son identité MY., son identifiant TCGdex, son nom utilisé par MY. et les informations nécessaires à son ordre chronologique.

### Sets

Chaque set appartient à une série. Il doit pouvoir conserver les informations utiles à MY., notamment :

- son identité interne et son identifiant TCGdex ;
- son nom français et, si nécessaire, son nom source ;
- son numéro ou son abréviation ;
- son abréviation française lorsqu'elle existe ;
- sa date de sortie ;
- son nombre officiel de cartes ;
- sa série ;
- une image, un logo ou un symbole lorsque nécessaire.

Un set peut également être la cible d'une collection automatique par extension. Dans ce contexte, il représente une extension précise et ne doit pas être confondu avec la série ou le bloc auquel il appartient.

### Cartes sources

Une carte source représente la carte de base provenant de TCGdex, avant la distinction de ses variantes de collection. Elle appartient à un set et peut notamment conserver :

- son identité interne MY. ;
- son identifiant TCGdex et son `localId` ;
- son nom français ;
- son set ;
- son image ;
- sa rareté et sa catégorie ;
- une date ou information de mise à jour de la source ;
- une date de parution résolue servant de fallback aux variantes, nullable si aucune date fiable n'est connue, selon la priorité carte, produit/coffret fiable, set FR/global et les corrections MY. ;
- les autres métadonnées utiles à MY.

Les données de gameplay inutiles à la V1 ne doivent pas être conservées sans besoin produit.

### Relation entre cartes et Pokémon

Une carte peut représenter un, plusieurs ou aucun Pokémon. Les cartes et les Pokémon entretiennent donc une relation plusieurs-à-plusieurs.

Cette relation est principalement alimentée par `dexId`. Une carte représentant plusieurs Pokémon peut ainsi être éligible à plusieurs collections automatiques.

Le rattachement doit pouvoir être corrigé localement afin d'ajouter un Pokémon manquant, retirer un rattachement incorrect ou compléter une carte dont le `dexId` est absent. Le résultat effectif utilisé par MY. doit rester traçable.

### Variantes de catalogue

La **variante de catalogue est l'unité fondamentale de collection dans MY.** Une carte source possède une ou plusieurs variantes, par exemple Normal, Reverse, Holo ou toute autre variante pertinente.

Chaque variante :

- possède sa propre identité interne MY. ;
- appartient à une seule carte source ;
- représente une entrée distincte du catalogue ;
- porte sa propre date effective nullable et la provenance réelle de cette date ;
- peut être référencée par des collections ;
- peut être associée à zéro, un ou plusieurs exemplaires physiques par utilisateur.

#### Date effective d'une variante

Une variante peut sortir plus tard que la carte de base. Sa date effective utilise une date spécifique fiable si elle est connue, sinon la date résolue de sa carte, sinon `NULL`. L'héritage conserve la provenance de la carte : `card`, `product`, `set`, `override` ou `unknown`. `variant` désigne uniquement une date spécifique issue d'une source fiable ; une correction explicite porte `override`. Aucune date approximative n'est inventée. Le modèle persistant conserve cette valeur et sa provenance sur la variante.

Les variantes historiques conservent leurs dates persistées. Une correction de date ne crée pas une nouvelle variante et ne modifie pas son identité.

La lecture autonome du détail Variante (6E.1) restitue `effective_release_date` et `date_origin` tels que persistés, sans recalcul. Son ID `BIGINT` est sérialisé en texte décimal ; ses stamps restent un tableau dans l'ordre stocké. Les métadonnées carte, extension et série sont indépendantes des collections et des exemplaires. Les valeurs absentes restent nulles ; seule l'image applique le fallback variante puis carte. L'inactivité, l'absence de la source ou la disponibilité française ne filtrent pas ce détail.

#### Identité d'une variante

Deux variantes réellement distinctes doivent toujours pouvoir être représentées par deux entités différentes. Leur identité peut exploiter les informations pertinentes fournies par TCGdex ou MY., notamment :

- le type ;
- le subtype ;
- la taille ;
- les stamps multiples normalisés ;
- le foil.

La langue, les traductions, les labels, les dates et les liens tiers ne sont pas identitaires. La clé canonique V1 et la référence source sont distinctes, comme défini dans `07-CATALOG-SYNC.md`. Les Jumbo sont exclues.

#### Disponibilité française

Une variante doit pouvoir être considérée comme disponible en français, non disponible en français ou non déterminée lorsque l'information n'est pas suffisamment fiable. Cet état reste ternaire ; la Phase 1 utilise `confirmed`, `unavailable` et `unknown` en `TEXT + CHECK`, conformément à `06-DATABASE.md`.

Une variante qui n'est pas confirmée comme française ne doit pas entrer automatiquement dans les collections de la V1.

#### Variantes corrigées ou ajoutées localement

MY. peut corriger une variante existante, compléter ses informations, ajouter une variante réelle manquante dans TCGdex ou rectifier sa disponibilité française.

Une variante ajoutée localement reste liée autant que possible à sa carte source et doit pouvoir être identifiée comme une correction ou une extension MY.

### Valeurs source et corrections locales

Le modèle distingue conceptuellement :

- la valeur provenant de TCGdex ;
- l'éventuelle correction locale ;
- la valeur effective utilisée par MY.

Une synchronisation ne doit jamais écraser silencieusement une correction locale validée. Les données importantes doivent pouvoir être identifiées comme provenant directement de TCGdex, corrigées localement ou ajoutées localement.

Dans la V1, les corrections MY. sont versionnées dans Git puis appliquées par le pipeline catalogue. Les structures privées de PostgreSQL peuvent refléter leur état appliqué sans remplacer les fichiers versionnés. Les fichiers JSON stricts de `data/catalog-overrides/` sont appliqués avant validation ; les tables privées conservent leur provenance et les aliases nécessaires aux identités locales/corrigées.

### Conservation prudente des données source

Une donnée du catalogue déjà utilisée par une collection, un exemplaire ou une correction ne doit pas disparaître automatiquement parce qu'elle n'est plus fournie par TCGdex.

Le modèle doit permettre de conserver une donnée devenue :

- inactive ;
- obsolète ;
- non éligible à de nouvelles générations automatiques.

Cette conservation protège les collections et exemplaires existants. Le pipeline conserve les lignes et IDs ; les entités disparues deviennent normalement absentes de la source et inactives, sans supprimer les références utilisateur.

## Utilisateur et profil MY.

L'authentification fournit l'identité technique du compte. Le modèle applicatif associe à cette identité un profil MY. contenant les informations fonctionnelles propres au produit.

Le profil conserve l'identité applicative nécessaire à la V1 :

- l'identité interne de l'utilisateur ;
- son identifiant public unique de partage ;
- ses timestamps techniques.

La page Profil rassemble des données de deux sources, sans les fusionner dans `profiles` :

| Information présentée | Source de vérité |
|---|---|
| Email actuel | Utilisateur Supabase Auth (`user.email`) |
| Demande d'email en attente | Supabase Auth (`user.new_email`, absent ou vide sans demande) |
| Identifiant public MY. | Profil MY. (`profiles.public_id`) |
| Date de création du compte | Supabase Auth (`auth.users.created_at`, exposé comme `user.created_at`) |
| Statut Authenticator | Facteur TOTP vérifié géré par Supabase Auth |

La date « Membre depuis… » utilise la création du **compte Auth**, et non `profiles.created_at`, qui date la création de la ligne applicative et peut être postérieur en cas de backfill. Aucun champ de date d'inscription supplémentaire ni champ email n'est ajouté dans `profiles`. Aucun pseudo, nom d'affichage, avatar, bio ou autre information publique n'est prévu.

Les préférences de vues appartiennent à une entité dédiée liée au profil, décrite ci-dessous ; elles ne transforment pas le profil en stockage générique de paramètres.

L'identifiant public de partage est distinct de l'UUID Auth, généré automatiquement par MY. et immuable. Il suit le format `MY-XXXXX-XXXXX-XXXXX-XXXXX`, avec 20 caractères aléatoires cryptographiques, sans `0`, `O`, `1`, `I` ni `L`. Sa forme stockée est en majuscules ; sa recherche et son unicité ignorent la casse. Aucun pseudo supplémentaire n'est créé. Depuis la Phase 3A, un trigger PostgreSQL crée le profil dans la transaction d'insertion `auth.users`, avec le même UUID et la génération SQL existante ; le frontend ne crée ni profil ni identifiant public.

Les comptes utilisent email/mot de passe, email confirmé obligatoire et MFA TOTP obligatoire. Auth conserve les facteurs, secrets et niveaux AAL ; le profil ne duplique aucune de ces données. Sa présence dès le signup n'accorde aucun accès applicatif : la session doit atteindre `aal2` et respecter les policies métier. Les préférences restent créées à leur première sauvegarde, sans création au signup.

## Collections

Une collection appartient à exactement un utilisateur. Elle doit pouvoir conserver au minimum :

- son identité ;
- son propriétaire ;
- son nom ;
- son type ;
- ses paramètres fonctionnels ;
- les informations nécessaires à son affichage.

La V1 distingue les collections personnalisées et les collections automatiques. Une collection automatique possède une cible dont le type est soit Pokémon, soit Set.

Le nom de toute collection comporte au moins **3 caractères utiles après trim**, à la création et au renommage.

### Collections personnalisées

Une collection personnalisée ne possède pas de cible automatique. Son propriétaire sélectionne et ordonne librement des variantes existantes dans le catalogue MY.

La V1 ne permet pas de créer une carte personnalisée qui n'existe pas dans le catalogue. Si une carte ou une variante française réelle manque, elle doit être ajoutée ou corrigée dans le catalogue global, et non créée uniquement dans une collection utilisateur.

### Collections automatiques et cibles

Une collection automatique possède exactement un type de cible et une cible compatible avec celui-ci.

Deux cas existent dans la V1 :

- type Pokémon : la collection référence un Pokémon cible et sélectionne les variantes françaises à partir des cartes qui lui sont rattachées ;
- type Set : la collection référence un set cible et sélectionne les variantes françaises de toutes les cartes appartenant à cette extension.

Une collection automatique ne peut pas cibler simultanément un Pokémon et un set. Une cible Set désigne une extension précise, non une série ou un bloc TCGdex.

Le couple propriétaire + cible est unique pour chaque type automatique : au maximum une collection Pokémon par propriétaire/Pokémon et une collection Extension par propriétaire/Set. Cette règle ne concerne pas les collections personnalisées et n'empêche pas deux propriétaires de choisir la même cible.

Une collection par extension peut inclure toutes les catégories présentes dans le set, notamment les Pokémon, Dresseurs, Énergies et autres catégories.

Sa structure est **matérialisée** : les éléments générés sont enregistrés dans la collection. Elle n'est pas recalculée dynamiquement à chaque affichage à partir de l'état courant du catalogue.

Cette matérialisation rend possible le processus de mise à jour validé pour la Phase 8, encore non implémenté :

1. la collection est générée avec l'état courant du catalogue ;
2. ses éléments automatiques sont enregistrés ;
3. le catalogue évolue ultérieurement ;
4. MY. détecte une différence ;
5. l'utilisateur consulte un résumé ;
6. l'utilisateur valide la mise à jour ;
7. la structure de la collection est mise à jour.

## Éléments de collection

Une collection contient des éléments de collection. Chaque élément matérialise la présence d'une variante du catalogue dans une collection donnée.

```text
Collection 1 → N Éléments de collection
Élément de collection N → 1 Variante
```

### Unicité d'une variante

Une même variante ne doit apparaître qu'une seule fois dans une même collection. Le nombre d'exemplaires possédés n'est jamais représenté par la répétition de l'élément de collection.

### Origine automatique ou manuelle

Chaque élément doit être identifiable comme automatique ou manuel.

Un élément automatique :

- est généré par MY. ;
- conserve `origin = automatic` et son rang canonique système `automatic_rank` lors d'un déplacement ;
- ne peut pas être supprimé manuellement ;
- peut être librement réordonné par le propriétaire, tout en restant structurellement géré par MY.

Un élément manuel :

- est ajouté par l'utilisateur, avec `origin = manual` et sans `automatic_rank` ;
- référence toujours une variante existante ;
- peut être déplacé ;
- peut être supprimé.

Dans une collection automatique, le propriétaire peut réordonner tous les éléments, automatiques comme manuels.

### Ordre d'une collection

Le modèle doit représenter un ordre stable des éléments :

- dans une collection personnalisée, l'ordre est contrôlé par l'utilisateur ;
- dans une collection automatique, l'ordre canonique de MY. initialise la collection ; tous les éléments sont ensuite positionnables librement.

`automatic_rank` est le rang canonique système ; `sort_position` est l'ordre réel affiché dans cette collection. Un déplacement automatique ne modifie que `sort_position`, jamais `automatic_rank`, `origin`, le hash/version canonique ou `automatic_target_states`. Deux collections de même cible/version peuvent contenir les mêmes éléments automatiques avec des `sort_position` différents.

La Phase 1 représente l'ordre matérialisé par des positions numériques fractionnaires exactes, décrites dans `06-DATABASE.md`. Les primitives 6A.3 et 6C.1 calculent les positions en PostgreSQL et sérialisent réorganisation, ajout et retrait par verrou de la collection. Un ajout manuel accepte `start` ou `end` (défaut), avec rééquilibrage si nécessaire ; le retrait ne compacte pas l'ordre.

**Modèle Phase 8 validé ; stockage 8B.1 et [calcul interne 8B.2](reports/2026-10-08-PHASE8B2-RELATIVE-ORDER-ENGINE.md) livrés Local, déplacement v2 backend livré en 8B.3 ajout manuel avec invariant initial en 8B.4 et retrait/cycle de vie R3 en 8B.5 ; actualisation future :** reconstruire le canonique cible puis rejouer toutes les intentions personnelles avant/ancre ou fin dans leur chronologie, placements initiaux manuels compris. Les [décisions R1–R4 validées](01-FEATURES.md#réordonnancement-relatif--décisions-phase-8) imposent contexte historique complet au moment du geste, immuable ; gestes filtrés résolus dans l'ordre complet ; nouvel UUID après retrait réel, identité conservée lors d'une conversion ; aucun nouveau geste pour annulation, absence d'effet ou retry. Masqués inclus dans le calcul.

La [conception 8A.3](reports/2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md#4-modèle-persistant-projeté) est validée. [8B.1](reports/2026-10-08-PHASE8B1-RELATIVE-ORDER-FOUNDATIONS.md) livre Local les colonnes de révision personnelle (défaut zéro), contrat (défaut 2 depuis 8B.8, anciennes lignes inchangées), introduction nullable et les tables privées de journal/reçus. [8B.3](reports/2026-10-08-PHASE8B3-REORDER-WRITER-V2.md) alimente journal et reçus pour les déplacements v2 sous verrou parent : R1 produit côté serveur, une révision par permutation modifiée, no-op avec reçu seul et retry sans écriture. [8B.4](reports/2026-10-09-PHASE8B4-MANUAL-ADD-V2.md) enregistre atomiquement chaque ajout manuel v2 avec introduction positive, intention initiale unique à cette séquence et reçu. Contrainte différée en fin de transaction ; introduction et intention restent obligatoires et inchangées après conversion. Legacy exempt, sans reconstruction historique. [8B.5](reports/2026-10-09-PHASE8B5-MANUAL-REMOVAL-V2.md) retire atomiquement le manuel et toutes ses intentions propres par cascade du sujet ; révision +1 et reçu remove conservant l’ancien UUID. Références historiques des autres sujets et reçus antérieurs restent intacts. Réajout de même variante : nouvel UUID, nouveau placement initial, aucune intention ancienne restaurée ni référence historique rattachée par variante ; aucune intention ancienne n’est reconstruite ; les nouvelles créations sont v2 depuis 8B.8. [Consultation sécurisée 8B.6](reports/2026-10-09-PHASE8B6-OPERATION-RESULT.md) livrée Local : `get_collection_operation_result` retourne le résultat historique enregistré après autorisation actuelle, sans mutation. Trois writers v2 et reprise backend complète ; NULL ne permet pas de changer l’UUID d’une requête incertaine. [Intégration 8B.7](reports/2026-10-09-PHASE8B7-APPLICATION-INTEGRATION.md) livrée Local en `0.8.6` : lecteur v2 et services/hooks communs aux contrats 1/2, routage des trois writers et récupération des opérations incertaines. Depuis l’[activation 8B.8](reports/2026-10-10-PHASE8B8-CLOSURE.md), les nouvelles créations sont contrat 2/révision zéro ; les collections existantes restent contrat 1. 8B et 8C sont terminées et validées Local ; interface de masquage et filtres livrés en 8D. `sort_position` reste l'unique ordre lu ; rangs appliqués et journal servent à reconstruire une actualisation, sans lecteur parallèle ni déduction des anciennes intentions. Les références d'ancre/successeurs peuvent survivre comme UUID historiques dans les intentions d'autres sujets vivants ; les intentions propres d'un sujet retiré sont supprimées. Les collections historiques sont des tests legacy recréables, sans récupération des anciens déplacements ni destruction pendant 8A.

### Masquage d'un élément — backend livré en 8C

Le masquage persistant appartient à l'élément de collection, uniquement automatique dans une collection automatique ; il n'appartient ni à la Variante du catalogue, ni à l'exemplaire, ni au viewer. Seul le propriétaire le modifie en contrat 2. Origine, positions, exemplaires et notes sont inchangés. Un automatique conservé garde son masquage ; un nouvel automatique ou un manuel converti est visible par défaut. [8C](reports/2026-10-10-PHASE8C-CLOSURE.md) livre Local `collection_items.is_hidden boolean not null default false`, CHECK d'origine, invariant parent et RPC avec révision/reçu atomiques. Aucune table de masquage séparée. Les deux comptes de progression excluent les automatiques masqués ; manuels toujours inclus, possession du contenu inchangée. Interface et filtres livrés en 8D, sans évolution du modèle ; actualisation toujours future.

### Ordre canonique du catalogue

Les variantes éligibles aux collections automatiques doivent pouvoir être ordonnées de manière stable et déterministe.

Pour une cible Pokémon, cet ordre suit la date de parution effective complète de la variante croissante (`NULL` en dernier), puis le numéro normalisé de la carte, puis l'ordre stable des variantes d'une même carte. Les variantes d'une carte peuvent donc être séparées par celles d'une autre carte sortie entre leurs dates respectives.

Pour une cible Set, il suit le numéro normalisé dans le set, puis l'ordre stable des variantes d'une même carte. Le numéro ne suit pas un tri textuel naïf.

La [politique TCGdex](02-TCGDEX.md) et le [pipeline](07-CATALOG-SYNC.md) fixent le rang naturel des numéros, les familles de variantes et les dates inconnues en dernier. Les départages canoniques complètent ces priorités sans les modifier.

## État et mise à jour des collections automatiques

### État de génération

Une collection automatique conserve la version de structure qu'elle a réellement appliquée. Un état courant par cible Pokémon ou Set associe une version de génération à un hash de la liste ordonnée des variantes éligibles, conformément au [schéma PostgreSQL / Supabase](06-DATABASE.md).

### Détection des changements

MY. doit pouvoir construire l'ensemble courant des variantes françaises éligibles pour la cible de la collection et le comparer aux éléments automatiques matérialisés.

Selon le type de cible, cet ensemble provient des cartes rattachées au Pokémon ou de toutes les cartes appartenant au set ciblé.

Cette comparaison peut détecter notamment :

- une nouvelle carte ;
- une nouvelle variante ;
- une variante corrigée devenue éligible ;
- une autre évolution pertinente.

La détection seule ne modifie jamais la collection.

### Résumé de mise à jour

Le modèle doit permettre d'identifier précisément les changements proposés afin de présenter un résumé avant leur application.

8A.3 recommande un résumé calculé à la demande, sans table de previews : ajouts, retraits, conversions, changements de rang et séquence finale complète. Un token lie version appliquée, version/hash cible, révision personnelle et empreinte du plan. Aperçu et application partagent le même calcul autoritatif ; changement pertinent depuis l'aperçu → refus et nouvel aperçu. Les nouveaux UUID sont alloués à l'application, les items nouveaux étant identifiés par variante dans le plan. [Formats projetés](reports/2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md#6-détection-aperçu-et-application).

### Application d'une mise à jour

Après validation explicite de l'utilisateur :

- les nouveaux éléments automatiques nécessaires sont ajoutés ;
- leurs `automatic_rank` sont mis à jour, en préservant autant que possible l'ordre personnalisé sans réinitialisation arbitraire de `sort_position` vers l'ordre canonique ;
- les éléments automatiques encore éligibles sont conservés ;
- les éléments automatiques devenus non éligibles sont retirés de la collection ;
- un élément manuel devenu automatiquement éligible conserve le même `collection_item`, passe à `origin = automatic`, reçoit son `automatic_rank` et conserve ses intentions de placement rejouées, sans doublon ; sa position numérique peut être rematérialisée ;
- les autres éléments manuels sont préservés ;
- les exemplaires physiques restent inchangés ;
- les notes et autres informations personnelles restent inchangées.

Une mise à jour du catalogue ou d'une collection ne doit jamais entraîner de perte silencieuse de données personnelles.

## Notifications — modèle conceptuel Phase 8

**Projet, non implémenté.** Distinguer le contenu publié ou l'événement de collection de son suivi individuel par utilisateur : non lu, lu non traité, traité. Le badge dérive des non lues actives ; le centre exclut les traitées et les obsolètes. Une collection possède au plus une notification active pour son propriétaire ; de nouveaux changements actualisent celle-ci et réinitialisent sa lecture.

Les annonces/changelogs concernent les comptes déjà inscrits à leur publication, y compris déconnectés. Pas de réception automatique des contenus anciens à l'inscription, sauf annonce importante encore d'actualité. 8A.3 recommande événements de collection dérivés des versions, une ligne de lecture par collection à la demande, contenu d'annonce partagé et suivi individuel créé seulement à la lecture/au traitement. Éligibilité par date d'inscription serveur, exception nouveaux inscrits explicite tant que l'annonce reste active ; retrait/expiration rendent obsolète. Pas de diffusion écrivant chez tous les utilisateurs. Le [cycle de vie métier](01-FEATURES.md#centre-de-notifications--décisions-phase-8) et les [contrats projetés](06-DATABASE.md#contrats-projetés-phase-8--non-implémentés) font référence ; aucune de ces structures n'est livrée.

## Exemplaires physiques

Un exemplaire physique représente une copie réellement possédée. Il appartient à un utilisateur et référence une variante unique du catalogue.

```text
Utilisateur 1 → N Exemplaires physiques
Exemplaire physique N → 1 Variante
```

### Portée globale au compte

Un exemplaire physique **n'appartient pas à une collection particulière**. Il appartient globalement au compte de l'utilisateur.

Si une même variante apparaît dans plusieurs collections du même utilisateur — par exemple une collection Pokémon, une collection par extension et une collection personnalisée — chacune reflète les mêmes exemplaires physiques. Aucun exemplaire supplémentaire ne doit être créé pour cette raison.

### Plusieurs exemplaires

Un utilisateur peut posséder plusieurs exemplaires physiques d'une même variante. Chaque exemplaire possède sa propre identité : il ne s'agit pas d'un simple champ de quantité.

### Statut possédée ou manquante

Le statut d'une variante dans une collection est dérivé des exemplaires de l'utilisateur :

- elle est **possédée** si au moins un exemplaire correspondant existe ;
- elle est **manquante** si aucun exemplaire correspondant n'existe.

Un état de possession indépendant par collection ne doit pas devenir une source de vérité susceptible de contredire les exemplaires réels. Des optimisations techniques restent possibles à condition de ne pas créer de vérité concurrente.

### Informations propres à un exemplaire

Chaque exemplaire peut conserver :

- un nom personnalisé facultatif ;
- un état / note personnel facultatif, en texte libre multiligne, limité à 750 caractères Unicode.

Deux exemplaires de la même variante peuvent porter des informations différentes.

Depuis 6A.2, aucun champ structuré de condition ou de grading n'est actif. Une information de conservation ou de grading peut être écrite librement dans la note, sans parsing ni nomenclature métier. Ces métadonnées appartiennent à l'exemplaire, jamais à la carte source, à la variante ou à l'élément de collection.

Un nom vide devient `NULL` ; l'affichage sans nom utilise `Exemplaire N`, recalculé selon l'ordre des exemplaires, sans persister ce libellé. Une note vide ou composée uniquement d'espaces blancs devient `NULL`. Les espaces et retours à la ligne d'un texte utile sont conservés.

Les notes personnelles appartiennent également à l'utilisateur. Elles peuvent décrire un défaut, une provenance, un achat, un rangement ou tout commentaire personnel.

### Suppression d'un exemplaire

Supprimer un exemplaire signifie que l'utilisateur indique ne plus posséder cette copie physique. Cette opération :

- ne supprime ni la variante du catalogue ni les éléments de collection qui la référencent ;
- ne modifie pas les autres exemplaires ;
- fait passer la variante à l'état manquant si aucun autre exemplaire ne subsiste.

## Partages de collections

Un partage relie une collection à un utilisateur destinataire. Le propriétaire est déjà porté par la collection.

```text
Collection 1 → N Partages
Partage N → 1 Utilisateur destinataire
```

La V1 ne propose qu'une permission de partage : la **lecture seule**. Aucun système complexe de rôles collaboratifs n'est requis, même si le modèle peut rester extensible pour de futures permissions sans les implémenter maintenant.

Pour une même collection, la relation avec un destinataire doit être unique. Le propriétaire ne doit pas se partager sa propre collection.

L'existence d'un partage représente directement un accès actif dès confirmation du propriétaire. Aucun statut, invitation, acceptation ou refus n'est prévu. Le propriétaire et le destinataire peuvent chacun supprimer cette relation ; cela retire uniquement l'accès, sans supprimer la collection, ses éléments ou les exemplaires du propriétaire. La résolution limitée d'un identifiant public sera implémentée avec la fonctionnalité de partage.

## Paramètres de vue et classeur

Une entité **Préférences utilisateur**, liée à exactement un profil, conserve la vue catalogue par défaut (Liste, Cartes, Dernier choix utilisé), la vue collection par défaut (Liste, Cartes, Classeur, Dernier choix utilisé) et `binder_default_format`. Formats V1 exactement `2x2`, `3x3`, `4x3` ; défaut `3x3`. Un profil possède au maximum une ligne de préférences ; une ligne absente équivaut aux valeurs initiales documentées dans [06-DATABASE.md](06-DATABASE.md), sans création au signup.

Chaque préférence distingue le choix d'ouverture du dernier mode réellement sélectionné. Ces deux derniers modes sont persistants et indépendants, globaux respectivement au catalogue et aux collections, sans relation avec une page ou une cible particulière. Une vue fixe s'applique à l'ouverture ; `Dernier choix utilisé` reprend le mode mémorisé. Le stockage initial choisit ce dernier comportement, avec Liste comme mode initial.

Seul l'utilisateur concerné lit et modifie ses préférences. Un partage de collection n'y donne aucun accès. L'entité dédiée `collection_view_preferences` conserve seulement les overrides explicites de format, uniques par **utilisateur + collection**. Le viewer doit être propriétaire ou destinataire actuellement autorisé ; les préférences du lecteur et du propriétaire restent indépendantes. Ces données référencent le profil et la collection et disparaissent par cascade avec eux. Aucun réglage de thème ou Premium n'est ajouté. Modifier l'affichage ne change aucun élément de collection.

Le format effectif suit **override utilisateur + collection → `binder_default_format` global → `3x3`**. Absence d'override = héritage dynamique ; aucune copie du défaut dans chaque collection. Retour au défaut = suppression de l'override.

Le Classeur V1 est **continu uniquement**, selon l'ordre autoritatif des éléments, sans regroupement par série, bloc, ère, Extension, Pokémon ou catégorie. Nombre d'emplacements dérivé du format, pagination calculée frontend : aucune entité/table `binder_pages`, aucun champ d'organisation.

## Recherche

La recherche interne à une collection utilise les informations du catalogue liées aux variantes présentes dans cette collection. Ces informations peuvent provenir de la carte, de la variante, du set, de la série, de la rareté, du numéro, des noms français et d'autres métadonnées utiles.

La recherche globale de navigation, livrée en 7E.1/7E.2, utilise quatre entités existantes : Pokémon par nom français, Set par nom, collections accessibles par nom et Cartes sources par les champs pris en charge par le moteur portable. Elle retourne une Carte source unique, jamais directement une Variante. Les variantes restent l'unité collectible des collections et des exemplaires ; la recherche d'ajout sélectionne une variante exacte. Aucun nouvel objet persistant de résultat de recherche n'est nécessaire. Toutes les collections actuellement accessibles au viewer sont candidates : personnelles ou reçues en partage. La Phase 9 crée, gère et retire les accès ; elle n'est pas requise pour lire ou rechercher un partage déjà actif.

La RPC `search_global_navigation(text)` fournit une projection limitée à dix suggestions sous Auth/MFA/RLS ; les règles portables de normalisation, tokenisation, matching, score et tri de `scripts/catalog/search-catalog.ts` servent de socle pour les Cartes. Contrat, quotas et grants : [schéma PostgreSQL / Supabase](06-DATABASE.md#recherche-globale-de-navigation--contrat-7e1).

Les pages Pokémon et Extension livrées présentent une entrée par **Variante**, sans regroupement sous des Cartes uniques. Elles réutilisent le même univers et le même ordre canonique backend que la génération automatique : date effective de Variante puis numéro naturel et ordre de Variante pour Pokémon ; numéro naturel puis Variante pour Extension. La fiche Carte source présente séparément ses Versions. Ces consultations ne matérialisent aucune nouvelle collection ou structure automatique.

## Suppression et cycle de vie

### Suppression d'une collection

La suppression d'une collection supprime ou désactive les données qui lui sont propres, notamment ses éléments, ses partages et ses paramètres.

Elle ne doit jamais supprimer :

- les cartes du catalogue ;
- les variantes du catalogue ;
- les exemplaires physiques de l'utilisateur.

Les exemplaires existent indépendamment des collections.

### Suppression d'un compte

La Phase 4 fixe la suppression **définitive** du compte Auth et de ses données applicatives, après les confirmations et la ré-authentification fraîche mot de passe + TOTP définies dans les [fonctionnalités](01-FEATURES.md#suppression-définitive-du-compte).

Le périmètre comprend :

- le profil MY. et ses préférences ;
- toutes les collections possédées, avec leurs éléments et partages ;
- les relations de partage dont l'utilisateur est destinataire, qui lui donnaient accès aux collections d'autres propriétaires ;
- tous ses exemplaires physiques, y compris hors collection, avec leurs notes et informations propres ;
- l'identité Supabase Auth.

Les destinataires perdent l'accès aux collections supprimées. Les collections reçues appartiennent à autrui : seule la relation avec le compte supprimé disparaît, jamais ces collections, leurs éléments, leurs exemplaires ou les autres partages. La suppression des exemplaires du compte est propre à cette opération ; supprimer une collection seule continue à les conserver.

Le catalogue global, ses Pokémon, séries, Extensions, Cartes, Variantes et références associées sont préservés, ainsi que toutes les données des autres utilisateurs hors des relations de partage devenues sans objet. Aucune suppression ne remonte des données personnelles vers le catalogue.

Les dépendances physiques et l'orchestration livrée localement sont définies dans [06-DATABASE.md](06-DATABASE.md#suppression-dun-compte) et [05-ARCHITECTURE.md](05-ARCHITECTURE.md#suppression-du-compte--contraintes-dorchestration). Une Edge Function vérifie l'identité et les deux facteurs frais ; le nettoyage applicatif rejoint la transaction de suppression Auth via un trigger privé, sans nouvelle table ni changement des FK. Les éventuelles exigences légales/rétentions particulières restent ouvertes.

## Données dérivées

Les informations suivantes doivent de préférence être calculées à partir des entités de référence afin d'éviter les contradictions :

- le statut possédée ou manquante à partir des exemplaires ;
- le nombre d'exemplaires à partir des exemplaires physiques ;
- le nombre de variantes d'une collection à partir de ses éléments ;
- la progression d'une collection à partir des variantes possédées ;
- le nombre de pages du classeur à partir de la collection et du format choisi.

Des valeurs mises en cache peuvent être utilisées si nécessaire pour les performances, sans devenir des sources de vérité indépendantes.

### Comptages catalogue Pokémon et Extension

`variant_count` compte les Variantes réellement retournées par les contrats Pokémon/Extension et s'affiche comme nombre de `carte(s)` depuis 7E.3.4. Il égale la longueur du tableau, sans multiplication par les rattachements Pokémon ni comptage de Cartes sources distinctes. Aucun `card_count` n'est fourni ni utilisé comme compteur principal dans ces listings. La fiche Carte compte ses `version(s)` depuis son tableau de Variantes.

Ces valeurs sont dérivées du catalogue, sans nouvelle source de vérité persistée. `tcg_sets.official_card_count` conserve le total officiel de Cartes du set, distinct du compteur du listing MY. Ces compteurs ne mesurent aucune possession ou progression personnelle.

### Progression d'une collection

Le modèle livré calcule la progression en comparant le nombre de variantes possédées au nombre total de variantes présentes, manuelles comprises. Une variante compte comme possédée dès que le propriétaire possède au moins un exemplaire correspondant. **Depuis 8C**, les automatiques masqués sont exclus des deux comptes, même possédés ; les manuels restent inclus. Même règle au Dashboard, dans Collection et en partage, quel que soit le filtre affiché. Le statut de possession reste dérivé des exemplaires ; le masquage ne l'efface pas.

## Relations conceptuelles principales

```text
Utilisateur
  ├── 1 → N Collections
  ├── 1 → N Exemplaires physiques
  └── 1 → 1 Profil MY.
                └── 1 → 0..1 Préférences utilisateur

Série 1 → N Sets
Set 1 → N Cartes sources
Carte source 1 → N Variantes
Carte source N ↔ N Pokémon

Collection 1 → N Éléments de collection
Élément de collection N → 1 Variante

Collection automatique → exactement une cible compatible
  ├── Pokémon cible
  └── Set cible

Exemplaire physique N → 1 Variante

Collection 1 → N Partages
Partage N → 1 Utilisateur destinataire
```

## Invariants conceptuels

Le futur modèle technique doit permettre de garantir autant que possible que :

- une collection possède exactement un propriétaire ;
- son nom contient au moins 3 caractères utiles après trim ;
- un propriétaire possède au maximum une collection automatique pour une même cible Pokémon ou Set ;
- les préférences de vues sont uniques par profil, privées et limitées aux valeurs autorisées ;
- une collection personnalisée ne possède pas de cible automatique ;
- une collection automatique possède exactement un type de cible ;
- une collection automatique de type Pokémon possède un Pokémon cible ;
- une collection automatique de type Set possède un set cible ;
- une collection automatique ne possède pas simultanément un Pokémon cible et un set cible ;
- un élément de collection référence une variante existante ;
- une même variante n'est pas dupliquée dans une même collection ;
- un exemplaire appartient à un utilisateur ;
- un exemplaire référence une seule variante ;
- une variante appartient à une carte source ;
- une carte source appartient à un set ;
- un set appartient à une série ;
- un partage référence un destinataire différent du propriétaire ;
- un même partage collection-destinataire n'est pas dupliqué ;
- les éléments automatiques et manuels restent fonctionnellement distinguables ;
- les éléments automatiques ne sont pas modifiables comme des éléments manuels ;
- les corrections locales ne sont pas écrasées silencieusement par TCGdex.

Les contraintes implémentées en Phase 1 et les opérations fonctionnelles restant à réaliser sont distinguées dans le [schéma PostgreSQL / Supabase](06-DATABASE.md).

## Principes de sécurité futurs

Le modèle doit permettre de mettre en place des règles garantissant que :

- un utilisateur ne modifie que ses propres données ;
- le propriétaire contrôle ses collections ;
- un destinataire partagé n'obtient qu'un accès en lecture ;
- les exemplaires physiques restent privés ;
- les données personnelles d'autrui ne sont accessibles que dans le contexte explicitement partagé ;
- le catalogue global est consultable sans être modifiable par les utilisateurs ordinaires.

Les permissions et policies RLS du socle Phase 1 sont définies dans le [schéma PostgreSQL / Supabase](06-DATABASE.md), versionnées par migrations et vérifiées par des tests PostgreSQL.

## Évolutivité

Le modèle doit pouvoir évoluer ultérieurement vers :

- plusieurs langues ;
- de nouveaux types de collections ;
- de nouvelles métadonnées d'exemplaires ;
- de nouvelles variantes ;
- des fonctionnalités sociales supplémentaires ;
- d'autres permissions de partage ;
- des données de prix ;
- des informations d'achat ;
- des emplacements physiques de rangement ;
- un éventuel système futur de droits fonctionnels permettant d'accompagner une offre Premium.

Ces possibilités ne doivent pas être implémentées prématurément dans la V1.

Dans la V1, aucune donnée d'abonnement, de facturation, de paiement, de quota ou de rôle Premium n'est nécessaire. Les collections automatiques restent accessibles sans abonnement. La possibilité d'une offre Premium après la V1 impose seulement de ne pas rendre une future gestion de droits inutilement difficile. Une version future pourrait conceptuellement recourir à un plan, un entitlement, une permission fonctionnelle ou un mécanisme équivalent, sans qu'aucun de ces choix soit arrêté ou implémenté maintenant.

## Éléments laissés ouverts

Les sujets suivants restent à cadrer ou à décider lors de l'implémentation, dans les limites du [schéma PostgreSQL / Supabase](06-DATABASE.md) :

- les futures fonctions métier, vues et extensions du socle SQL de Phase 1 ;
- les éventuelles exigences légales/rétentions particulières liées à la suppression, sans remettre en question le périmètre fonctionnel validé ;
- les détails d'implémentation laissés ouverts par le [pipeline catalogue](07-CATALOG-SYNC.md) ;
- l'historique éventuel des corrections ;
- les APIs futures d’aperçu/application d’actualisation et de notifications selon 8A.3 ; le socle d’ordre relatif 8B et le masquage/progression 8C sont livrés Local, ainsi que l’interface et les filtres 8D ; contrat 2 activé pour les nouveaux parents ;
- les éventuels outils d'administration du catalogue ;
- l'implémentation PostgreSQL finale de la recherche ;
- les choix de performance et d'optimisation ;
- les éventuels plans, droits fonctionnels, fonctionnalités Premium, limites gratuites, prix, périodicités, essais et fournisseurs de paiement d'une offre post-V1.

Ces éléments ne doivent pas être considérés comme décidés avant leur cadrage et leur validation.
