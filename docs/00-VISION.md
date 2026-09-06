# Vision générale de MY.

## Rôle du document

Ce document constitue la source de vérité concernant la vision générale de **MY.**. Il définit la finalité du produit, son positionnement, ses grands principes, son périmètre fonctionnel initial et les limites à respecter lors des futurs cadrages et développements.

Il ne constitue pas une spécification fonctionnelle ou technique détaillée. Les sujets explicitement laissés ouverts doivent être définis dans des documents dédiés avant leur implémentation.

## Définition et besoin

**MY.** est une webapp de gestion de collections de cartes Pokémon TCG. Elle est pensée avant tout comme un **outil de collectionneur** permettant à chaque utilisateur de gérer simplement, visuellement et proprement ses différentes collections.

Le projet répond aux limites d'un suivi manuel réalisé dans des tableurs tels que Google Sheets. Il vise une expérience spécifiquement adaptée à la gestion d'une collection réelle grâce à :

- des données structurées ;
- des informations récupérées automatiquement ;
- les visuels des cartes ;
- plusieurs modes d'affichage ;
- un suivi simple des cartes possédées et manquantes ;
- l'organisation de collections personnalisées ;
- une représentation visuelle proche d'un véritable classeur de cartes.

Dans sa vision initiale, MY. n'est ni un outil de deckbuilding ou de jeu, ni une marketplace, ni une plateforme sociale Pokémon.

Le catalogue de collection porte sur les cartes physiques au format standard. Les cartes Jumbo sont exclues ; le catalogue numérique Pokémon TCG Pocket ne fait pas partie de ce périmètre. La politique française et la normalisation sont précisées dans `02-TCGDEX.md` et `07-CATALOG-SYNC.md`.

## Source de référence Pokémon TCG

MY. s'appuie sur **TCGdex / cards-database** comme source de référence pour les données Pokémon TCG. Cette source fournit à l'application les informations nécessaires pour identifier et représenter les cartes disponibles, afin d'éviter la maintenance manuelle d'une base exhaustive.

La politique d'interprétation de TCGdex, la structure locale et le pipeline de synchronisation sont précisés dans les documents dédiés du dépôt. Les choix d'implémentation qui y restent explicitement ouverts ne doivent pas être inventés.

## Utilisateurs et espace principal

MY. est conçu autour de comptes utilisateurs. Un utilisateur se connecte à son compte pour accéder à ses propres collections et données personnelles.

Après connexion, il accède à un espace principal centré sur un **dashboard de collections**. Ce dashboard permet de :

- consulter ses collections existantes ;
- créer une collection ;
- éditer une collection ;
- supprimer une collection.

Le fonctionnement précis de l'authentification, des sessions, des droits et de la présentation du dashboard relève de cadrages ultérieurs.

## Gestion des collections

Un utilisateur peut gérer plusieurs collections indépendantes. La première version prévoit deux grands types de collections complémentaires.

### Collection libre

Une collection libre est créée sans contenu prédéfini. L'utilisateur peut :

- ajouter les cartes de son choix ;
- choisir librement les cartes présentes ;
- organiser les cartes dans l'ordre souhaité.

Elle peut notamment servir à représenter une collection personnelle spécifique, des cartes favorites, une collection thématique ou un objectif personnel. Aucune logique automatique liée à un Pokémon particulier ne lui est imposée.

### Collection automatique

Une collection automatique est générée à partir d'une cible choisie par l'utilisateur. Deux types de cible sont disponibles dans la V1 :

- un Pokémon ;
- une extension, c'est-à-dire un set Pokémon TCG précis.

Pour une cible Pokémon, MY. rassemble automatiquement les cartes et variantes françaises pertinentes rattachées à ce Pokémon.

Pour une cible Extension, MY. rassemble toutes les cartes et variantes françaises pertinentes du set choisi, y compris les Pokémon, Dresseurs, Énergies et autres catégories présentes dans cette extension.

Dans les deux cas, MY. s'appuie sur son catalogue issu de TCGdex / cards-database, constitue automatiquement la structure et applique un ordre cohérent et stable. Cette automatisation évite à l'utilisateur de rechercher et d'ajouter manuellement chaque variante concernée.

Une extension ou un set précis ne doit pas être confondu avec une série ou un bloc TCGdex, qui regroupe plusieurs sets.

## Suivi des cartes

Pour chaque carte d'une collection, l'utilisateur peut distinguer clairement :

- une carte possédée ;
- une carte manquante.

Il peut également conserver des informations personnelles concernant les cartes possédées, notamment :

- leur état de conservation ;
- une note ou un commentaire personnel ;
- l'indication qu'une carte est gradée ;
- la société de grading ;
- la note obtenue lors du grading.

Des états tels que *Near Mint*, *Excellent*, *Good* ou *Poor* illustrent le besoin, sans constituer à ce stade une nomenclature définitive. Une même variante peut avoir plusieurs exemplaires physiques distincts ; la nomenclature des états et les règles détaillées du grading restent à cadrer.

## Vues d'une collection

Une même collection peut être consultée selon trois vues principales. Ces vues doivent proposer une expérience plus adaptée à des cartes qu'un simple tableau de données.

### Vue liste

La vue liste est compacte. Elle privilégie la lisibilité, la densité d'information et la gestion rapide d'un grand nombre de cartes.

### Vue cartes

La vue cartes met davantage en avant les images afin d'offrir un parcours visuel et agréable de la collection.

### Vue classeur

La vue classeur est un élément important de l'identité de MY. Elle représente la collection comme si les cartes étaient disposées dans les pages d'un classeur physique. Elle aide ainsi l'utilisateur à visualiser l'organisation réelle ou souhaitée de sa collection.

L'utilisateur peut choisir un format de page. Les formats `2 × 2`, `3 × 3` et `4 × 3` sont des exemples envisagés ; la liste définitive reste ouverte. Les cartes sont ensuite présentées page par page selon le format sélectionné.

La navigation, les emplacements vides, l'ordre des cartes, la personnalisation des pages et la représentation des cartes manquantes seront précisés lors des cadrages UX et fonctionnels.

## Profil utilisateur

La première version comprend un profil utilisateur léger, limité aux informations essentielles liées au compte et au profil. Cet espace reste proportionné au besoin principal de gestion de collections personnelles.

Les profils publics complexes et les fonctions de réseau social ne font pas partie de cette vision initiale.

## Principes UX

L'expérience de MY. doit être :

- simple ;
- claire ;
- visuelle ;
- moderne ;
- agréable à utiliser ;
- adaptée aussi bien à quelques cartes qu'à des collections importantes.

L'interface ne doit pas donner l'impression d'utiliser une base de données ou un tableur amélioré. Les fonctionnalités avancées ne doivent pas nuire aux actions principales, qui doivent rester rapides :

- voir ses collections ;
- ouvrir une collection ;
- identifier les cartes manquantes ;
- indiquer qu'une carte est possédée ;
- consulter visuellement sa collection.

## Identité graphique

Une première direction graphique sert de référence au projet.

### Typographie

La police principale est **Poppins**.

### Palette

- `#E42B35`
- `#AF2328`
- `#931F1F`
- `#231A1A`
- `#3C3333`
- `#FFFFFF`

### Orientation visuelle

La direction visuelle repose sur :

- un fond très sombre ;
- différentes nuances de rouge comme couleurs principales et d'accent ;
- du blanc pour les éléments fortement contrastés ;
- une esthétique moderne et relativement minimaliste ;
- une forte présence du branding MY. ;
- des composants simples et lisibles.

Une maquette existante de la page d'accueil sert de référence visuelle. Le logo MY. existe au format SVG et sera fourni lors de la phase d'implémentation concernée. Le design system complet et les règles détaillées des composants seront définis dans un document UX/UI dédié.

## Principes produit

### La collection avant tout

La gestion de collection est la priorité. Toute fonctionnalité doit être évaluée selon sa capacité à aider concrètement le collectionneur.

### Des données fiables et automatisées

L'utilisateur ne doit pas avoir à reconstruire manuellement les informations déjà disponibles dans une base Pokémon structurée. MY. exploite les données existantes lorsque cela est pertinent.

### Liberté et automatisation

MY. permet à la fois de construire librement une collection et d'en automatiser la création lorsqu'une logique objective existe, notamment pour une collection dédiée à un Pokémon ou à une extension précise.

### Une expérience visuelle

Les cartes Pokémon étant des objets visuels et physiques, leurs illustrations et la représentation des collections occupent une place importante dans l'interface.

### La simplicité

MY. doit éviter toute complexité inutile. La première version se concentre sur les besoins principaux avant d'envisager des fonctionnalités secondaires.

## Périmètre fonctionnel initial

La première version comprend au minimum :

- la création d'un compte utilisateur et la connexion ;
- un dashboard de collections ;
- la gestion de plusieurs collections ;
- la création et l'organisation manuelle d'une collection libre ;
- l'ajout de cartes à une collection libre ;
- la création d'une collection automatique ciblant un Pokémon ou une extension ;
- l'exploitation des données de TCGdex / cards-database ;
- l'affichage des images des cartes ;
- le suivi des cartes possédées et manquantes ;
- les informations d'état de conservation ;
- les notes personnelles ;
- une gestion simple du grading ;
- les vues liste, cartes et classeur ;
- le choix du format de page du classeur ;
- une gestion légère du profil utilisateur.

Cette liste définit un périmètre général et non les spécifications détaillées de chaque fonctionnalité.

## Hors périmètre initial

Sauf décision future contraire, les éléments suivants ne font pas partie de la première version :

- le deckbuilding ;
- la simulation de parties Pokémon TCG ;
- la gestion des règles du jeu ;
- une marketplace ;
- l'achat ou la vente de cartes directement dans MY. ;
- un système social avancé ;
- la messagerie entre utilisateurs ;
- les échanges entre utilisateurs ;
- le suivi détaillé des prix du marché ;
- l'estimation financière complète d'une collection ;
- les fonctionnalités communautaires complexes.

Ces possibilités futures ne doivent pas influencer inutilement l'architecture de la première version tant qu'elles ne sont pas cadrées.

## Éléments laissés ouverts

Les sujets suivants devront être traités dans de futurs documents dédiés et ne sont pas définis par la vision générale :

- les détails d'implémentation laissés ouverts par l'[architecture technique de la V1](05-ARCHITECTURE.md) ;
- la configuration détaillée de Vercel et du déploiement ;
- les détails SQL et Supabase volontairement laissés ouverts par le [schéma PostgreSQL / Supabase de la V1](06-DATABASE.md) ;
- le fonctionnement précis de l'authentification ;
- les détails d'implémentation et l'automatisation future laissés ouverts par le [pipeline catalogue](07-CATALOG-SYNC.md) ;
- les règles exactes des variantes de cartes ;
- les détails d'ordre encore ouverts dans la [politique TCGdex](02-TCGDEX.md), notamment l'ordre des variantes et les cas sans date fiable ;
- le comportement détaillé lors de l'apparition d'une nouvelle carte ou variante éligible ;
- le degré de personnalisation d'une collection automatique ;
- la nomenclature exacte des états de conservation ;
- les sociétés et formats de notes de grading pris en charge ;
- le fonctionnement précis des pages du classeur ;
- la liste définitive des formats de pages ;
- l'UX détaillée, y compris les comportements sur mobile, tablette et ordinateur ;
- les règles détaillées du design system.

Ces éléments ne doivent pas être inventés ou considérés comme décidés avant leur cadrage et leur validation.

## Évolution possible après la V1

Après la V1, tout ou partie des fonctionnalités automatiques pourrait éventuellement intégrer une offre **Premium sur abonnement**. Cette possibilité reste une orientation d'évolutivité et non une fonctionnalité actuelle.

Dans la V1, les collections automatiques restent accessibles normalement : aucun abonnement, paiement, écran Premium ou restriction Premium n'est requis. Le prix, les plans, les limites d'un éventuel compte gratuit, les fonctionnalités concernées, la périodicité de facturation, une éventuelle période d'essai et le fournisseur de paiement ne sont pas définis.

## Synthèse

**MY. est une webapp personnelle de gestion de collections Pokémon TCG, pensée pour remplacer les limites d'un suivi manuel dans des tableurs par une expérience structurée, automatisée et visuelle.**

Elle permet de gérer plusieurs collections, libres ou automatiquement constituées autour d'un Pokémon ou d'une extension précise grâce aux données de TCGdex. Elle facilite le suivi des cartes possédées et manquantes, la conservation d'informations personnelles sur les exemplaires possédés et la consultation des collections sous plusieurs formes, dont une vue inspirée d'un classeur physique.

La première version reste centrée sur cette expérience de collection. Les fonctionnalités périphériques ne doivent pas détourner le projet de ce cœur tant qu'il n'est pas solidement défini et réalisé.
