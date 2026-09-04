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

La provenance exacte du nom et des éventuelles autres métadonnées Pokémon reste à définir.

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
- peut être référencée par des collections ;
- peut être associée à zéro, un ou plusieurs exemplaires physiques par utilisateur.

#### Identité d'une variante

Deux variantes réellement distinctes doivent toujours pouvoir être représentées par deux entités différentes. Leur identité peut exploiter les informations pertinentes fournies par TCGdex ou MY., notamment :

- le type ;
- le subtype ;
- la taille ;
- le stamp ;
- le foil ;
- l'identifiant de variante TCGdex ;
- la disponibilité linguistique ;
- les métadonnées locales nécessaires.

#### Disponibilité française

Une variante doit pouvoir être considérée comme disponible en français, non disponible en français ou non déterminée lorsque l'information n'est pas suffisamment fiable. Cet état reste ternaire ; le nom final de ses valeurs et son type SQL ne sont pas encore figés.

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

La conservation d'une raison, d'une date ou d'un historique détaillé peut être ajoutée si elle devient nécessaire. La forme technique de cette traçabilité et le mécanisme d'override ne sont pas imposés par ce document.

### Conservation prudente des données source

Une donnée du catalogue déjà utilisée par une collection, un exemplaire ou une correction ne doit pas disparaître automatiquement parce qu'elle n'est plus fournie par TCGdex.

Le modèle doit permettre de conserver une donnée devenue :

- inactive ;
- obsolète ;
- non éligible à de nouvelles générations automatiques.

Cette conservation protège les collections et exemplaires existants. La stratégie exacte de suppression logique ou physique reste ouverte.

## Utilisateur et profil MY.

L'authentification fournit l'identité technique du compte. Le modèle applicatif associe à cette identité un profil MY. contenant les informations fonctionnelles propres au produit.

Chaque profil doit pouvoir contenir notamment :

- l'identité interne de l'utilisateur ;
- son identifiant public unique de partage ;
- les informations de profil nécessaires à la V1 ;
- d'éventuels paramètres utilisateur futurs.

L'identifiant public de partage est unique et ne doit pas être supposé identique à l'identifiant technique d'authentification. Sa possible modification ultérieure reste à définir.

## Collections

Une collection appartient à exactement un utilisateur. Elle doit pouvoir conserver au minimum :

- son identité ;
- son propriétaire ;
- son nom ;
- son type ;
- ses paramètres fonctionnels ;
- les informations nécessaires à son affichage.

La V1 distingue les collections libres et les collections automatiques. Une collection automatique possède une cible dont le type est soit Pokémon, soit Set.

### Collections libres

Une collection libre ne possède pas de cible automatique. Son propriétaire sélectionne et ordonne librement des variantes existantes dans le catalogue MY.

La V1 ne permet pas de créer une carte personnalisée qui n'existe pas dans le catalogue. Si une carte ou une variante française réelle manque, elle doit être ajoutée ou corrigée dans le catalogue global, et non créée uniquement dans une collection utilisateur.

### Collections automatiques et cibles

Une collection automatique possède exactement un type de cible et une cible compatible avec celui-ci.

Deux cas existent dans la V1 :

- type Pokémon : la collection référence un Pokémon cible et sélectionne les variantes françaises à partir des cartes qui lui sont rattachées ;
- type Set : la collection référence un set cible et sélectionne les variantes françaises de toutes les cartes appartenant à cette extension.

Une collection automatique ne peut pas cibler simultanément un Pokémon et un set. Une cible Set désigne une extension précise, non une série ou un bloc TCGdex.

Une collection par extension peut inclure toutes les catégories présentes dans le set, notamment les Pokémon, Dresseurs, Énergies et autres catégories.

Sa structure est **matérialisée** : les éléments générés sont enregistrés dans la collection. Elle n'est pas recalculée dynamiquement à chaque affichage à partir de l'état courant du catalogue.

Cette matérialisation garantit le processus de mise à jour validé :

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
- suit l'ordre canonique ;
- ne peut pas être supprimé manuellement ;
- ne peut pas être librement réordonné.

Un élément manuel :

- est ajouté par l'utilisateur ;
- référence toujours une variante existante ;
- peut être déplacé ;
- peut être supprimé.

Dans une collection automatique, les éléments manuels peuvent être placés entre les éléments automatiques sans modifier l'ordre relatif de ces derniers.

### Ordre d'une collection

Le modèle doit représenter un ordre stable des éléments :

- dans une collection libre, l'ordre est contrôlé par l'utilisateur ;
- dans une collection automatique, les éléments automatiques suivent l'ordre canonique de MY. et les éléments manuels sont positionnables librement autour d'eux.

La stratégie de positionnement exacte — rangs, ancres, positions relatives ou autre mécanisme — reste ouverte.

### Ordre canonique du catalogue

Les variantes éligibles aux collections automatiques doivent pouvoir être ordonnées de manière stable et déterministe.

Pour une cible Pokémon, cet ordre peut notamment tenir compte de la série, du set, de la date de sortie, du numéro de carte et du type de variante.

Pour une cible Set, il doit pouvoir tenir compte de l'ordre officiel ou local du set, du numéro de carte et de l'ordre stable des variantes d'une même carte.

Le calcul exact de l'ordre canonique n'est pas défini ici. Le modèle doit seulement permettre de le représenter ou de le calculer.

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

Ce résumé peut être calculé à la demande, stocké temporairement ou persisté comme une entité dédiée. Ce choix reste technique et n'est pas fixé ici.

### Application d'une mise à jour

Après validation explicite de l'utilisateur :

- les nouveaux éléments automatiques nécessaires sont ajoutés ;
- leur ordre canonique est appliqué ;
- les éléments automatiques encore éligibles sont conservés ;
- les éléments automatiques devenus non éligibles peuvent être retirés de la collection ;
- un élément manuel devenu automatiquement éligible est converti sans être dupliqué ;
- les autres éléments manuels sont préservés ;
- les exemplaires physiques restent inchangés ;
- les notes et autres informations personnelles restent inchangées.

Une mise à jour du catalogue ou d'une collection ne doit jamais entraîner de perte silencieuse de données personnelles.

## Exemplaires physiques

Un exemplaire physique représente une copie réellement possédée. Il appartient à un utilisateur et référence une variante unique du catalogue.

```text
Utilisateur 1 → N Exemplaires physiques
Exemplaire physique N → 1 Variante
```

### Portée globale au compte

Un exemplaire physique **n'appartient pas à une collection particulière**. Il appartient globalement au compte de l'utilisateur.

Si une même variante apparaît dans plusieurs collections du même utilisateur — par exemple une collection Pokémon, une collection par extension et une collection libre — chacune reflète les mêmes exemplaires physiques. Aucun exemplaire supplémentaire ne doit être créé pour cette raison.

### Plusieurs exemplaires

Un utilisateur peut posséder plusieurs exemplaires physiques d'une même variante. Chaque exemplaire possède sa propre identité : il ne s'agit pas d'un simple champ de quantité.

### Statut possédée ou manquante

Le statut d'une variante dans une collection est dérivé des exemplaires de l'utilisateur :

- elle est **possédée** si au moins un exemplaire correspondant existe ;
- elle est **manquante** si aucun exemplaire correspondant n'existe.

Un état de possession indépendant par collection ne doit pas devenir une source de vérité susceptible de contredire les exemplaires réels. Des optimisations techniques restent possibles à condition de ne pas créer de vérité concurrente.

### Informations propres à un exemplaire

Chaque exemplaire peut conserver :

- son état de conservation ;
- une note personnelle ;
- son statut gradé ou non ;
- sa société de grading ;
- sa note de grading.

Deux exemplaires de la même variante peuvent porter des informations différentes.

La condition et les informations de grading appartiennent à l'exemplaire, jamais à la carte source, à la variante ou à l'élément de collection. Le modèle ne doit pas supposer que toutes les sociétés de grading utilisent la même échelle. La nomenclature des conditions et le format des notes de grading restent ouverts.

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

Retirer un partage supprime l'accès du destinataire sans supprimer la collection, modifier son contenu ou toucher aux exemplaires du propriétaire. Le fonctionnement éventuel d'invitations ou d'acceptation reste ouvert.

## Paramètres de vue et classeur

Des préférences d'affichage peuvent être associées à une collection ou à l'utilisateur, notamment :

- la vue liste, cartes ou classeur ;
- le format de page du classeur ;
- l'organisation continue ou par blocs.

Le niveau exact de persistance reste à définir avec l'UX. Ces préférences ne doivent jamais être confondues avec la structure de la collection : les modifier ne change aucun élément de collection.

La pagination du classeur est dérivée de l'ordre des éléments, du format de page et du mode d'organisation. Il n'est pas nécessaire de persister une entité pour chaque page tant qu'aucun besoin ne le justifie.

En mode par blocs, le calcul doit forcer chaque série ou bloc à commencer sur une nouvelle page.

## Recherche

La recherche interne à une collection utilise les informations du catalogue liées aux variantes présentes dans cette collection. Ces informations peuvent provenir de la carte, de la variante, du set, de la série, de la rareté, du numéro, des noms français et d'autres métadonnées utiles.

La stratégie exacte de recherche et d'indexation reste à définir.

## Suppression et cycle de vie

### Suppression d'une collection

La suppression d'une collection supprime ou désactive les données qui lui sont propres, notamment ses éléments, ses partages et ses paramètres.

Elle ne doit jamais supprimer :

- les cartes du catalogue ;
- les variantes du catalogue ;
- les exemplaires physiques de l'utilisateur.

Les exemplaires existent indépendamment des collections.

### Suppression d'un compte

Le comportement exact de suppression d'un compte sera défini avec l'authentification et les exigences légales.

Les données personnelles exclusivement rattachées à l'utilisateur comprennent notamment son profil, ses collections, ses exemplaires, ses notes et ses partages. Le catalogue global ne dépend pas de la présence d'un utilisateur particulier.

## Données dérivées

Les informations suivantes doivent de préférence être calculées à partir des entités de référence afin d'éviter les contradictions :

- le statut possédée ou manquante à partir des exemplaires ;
- le nombre d'exemplaires à partir des exemplaires physiques ;
- le nombre de variantes d'une collection à partir de ses éléments ;
- la progression d'une collection à partir des variantes possédées ;
- le nombre de pages du classeur à partir de la collection et du format choisi.

Des valeurs mises en cache peuvent être utilisées si nécessaire pour les performances, sans devenir des sources de vérité indépendantes.

### Progression d'une collection

Le modèle calcule la progression en comparant le nombre de variantes possédées au nombre total de variantes présentes dans la collection. Tous les éléments de collection, automatiques comme manuels, contribuent au total. Une variante compte comme possédée dès que le propriétaire de la collection possède au moins un exemplaire correspondant.

## Relations conceptuelles principales

```text
Utilisateur
  ├── 1 → N Collections
  ├── 1 → N Exemplaires physiques
  └── 1 → 1 Profil MY.

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
- une collection libre ne possède pas de cible automatique ;
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

Les contraintes et opérations retenues pour imposer ces invariants sont précisées dans le [schéma PostgreSQL / Supabase](06-DATABASE.md) ; leur SQL final reste à écrire.

## Principes de sécurité futurs

Le modèle doit permettre de mettre en place des règles garantissant que :

- un utilisateur ne modifie que ses propres données ;
- le propriétaire contrôle ses collections ;
- un destinataire partagé n'obtient qu'un accès en lecture ;
- les exemplaires physiques restent privés ;
- les données personnelles d'autrui ne sont accessibles que dans le contexte explicitement partagé ;
- le catalogue global est consultable sans être modifiable par les utilisateurs ordinaires.

Les principes RLS sont définis dans le [schéma PostgreSQL / Supabase](06-DATABASE.md). Le code SQL final des politiques reste à écrire et à tester.

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

- le SQL final des tables, contraintes, index, politiques RLS, fonctions, vues et migrations ;
- le mécanisme de maintien des timestamps et de création du profil ;
- les détails de suppression logique du catalogue et la suppression complète d'un compte ;
- la stratégie de synchronisation TCGdex ;
- la représentation physique finale des corrections, valeurs source et valeurs effectives ;
- l'historique éventuel des corrections ;
- la persistance ou non des résumés de mise à jour ;
- l'algorithme d'ordre canonique ;
- l'algorithme de positionnement des éléments manuels ;
- le comportement exact des éléments manuels lorsqu'un élément automatique est inséré à proximité ;
- la nomenclature des conditions ;
- les sociétés de grading et le format de leurs notes ;
- la source de la liste des Pokémon et de leurs noms ;
- le format et le niveau de persistance des préférences de vue ;
- les éventuels outils d'administration du catalogue ;
- l'implémentation PostgreSQL finale de la recherche ;
- les choix de performance et d'optimisation ;
- les éventuels plans, droits fonctionnels, fonctionnalités Premium, limites gratuites, prix, périodicités, essais et fournisseurs de paiement d'une offre post-V1.

Ces éléments ne doivent pas être considérés comme décidés avant leur cadrage et leur validation.
