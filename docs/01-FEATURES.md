# Fonctionnalités de la V1 de MY.

## Rôle du document

Ce document constitue la source de vérité concernant le comportement fonctionnel général de la première version de **MY.**. Il complète la [vision générale du projet](00-VISION.md) en décrivant les possibilités offertes aux utilisateurs et les règles produit qui les encadrent.

Il ne définit ni le modèle de données, ni l'architecture technique, ni les choix précis d'implémentation ou d'interface. Les sujets explicitement laissés ouverts doivent faire l'objet de cadrages dédiés avant d'être considérés comme décidés.

## Principes fonctionnels

MY. est centré sur la gestion personnelle de collections de cartes Pokémon TCG. Chaque utilisateur dispose de son propre espace et de ses propres données.

La V1 permet principalement de :

- gérer plusieurs collections ;
- créer des collections libres ou automatiques ;
- suivre les cartes possédées et manquantes ;
- gérer plusieurs exemplaires physiques d'une même carte ;
- consulter une collection sous plusieurs vues ;
- rechercher rapidement une carte ou un groupe de cartes dans une collection ;
- partager une collection avec un autre utilisateur en lecture seule.

Ces fonctionnalités doivent rester simples à comprendre et rapides à utiliser.

## Comptes utilisateurs

Un utilisateur peut :

- créer un compte ;
- se connecter ;
- se déconnecter ;
- accéder à son espace personnel ;
- gérer les informations essentielles de son profil.

Chaque utilisateur possède un identifiant public unique propre à MY., utilisé notamment pour le partage de collections. Cet identifiant public ne doit pas être confondu par principe avec l'identifiant technique interne du système d'authentification ; leur relation reste à définir.

## Dashboard

Après connexion, l'utilisateur accède à son dashboard, point central d'accès aux collections. Celui-ci distingue clairement au minimum deux catégories, sans imposer encore leur présentation exacte dans l'interface.

### Mes collections

Cette catégorie regroupe les collections dont l'utilisateur est propriétaire. Il peut :

- créer une collection ;
- ouvrir une collection ;
- modifier les informations générales d'une collection ;
- supprimer une collection.

### Collections partagées avec moi

Cette catégorie regroupe les collections que d'autres utilisateurs ont partagées avec l'utilisateur courant. Elles sont accessibles uniquement en consultation.

Le destinataire ne peut pas :

- modifier les cartes ou leur ordre ;
- modifier les états de possession ;
- modifier les exemplaires, les notes ou les informations de grading ;
- supprimer la collection ;
- modifier ses paramètres.

Le choix entre des onglets, des sections ou une navigation dédiée relève du cadrage UX.

## Création et informations générales d'une collection

Lors de la création d'une collection, l'utilisateur choisit entre deux types :

- une collection libre ;
- une collection automatique basée sur un Pokémon.

Une collection possède au minimum un nom. Aucune autre métadonnée ne doit être supposée tant qu'elle n'est pas cadrée.

Le propriétaire peut modifier les informations générales de sa collection et, au minimum, son nom. Le type d'une collection ne doit pas être considéré comme modifiable après sa création sans cadrage spécifique.

## Collections libres

Une collection libre est entièrement construite par son propriétaire. Celui-ci peut :

- ajouter les cartes de son choix ;
- supprimer les cartes ajoutées ;
- modifier librement leur ordre ;
- insérer une carte à n'importe quelle position ;
- organiser la collection selon ses propres critères.

Elle ne dépend d'aucune logique automatique liée à un Pokémon. Elle peut notamment représenter une collection personnelle spécifique, une sélection de cartes favorites, une collection thématique, une wishlist ou un objectif personnel.

La wishlist est seulement un exemple d'usage d'une collection libre et ne constitue pas une fonctionnalité supplémentaire de la V1.

## Collections automatiques basées sur un Pokémon

Une collection automatique est créée à partir d'un Pokémon choisi par l'utilisateur. MY. constitue alors la liste de référence correspondante à partir des données de **TCGdex / cards-database**.

Le contenu automatique est généré selon des règles communes et reproductibles. Les règles exactes de sélection, de variantes et d'ordre seront définies séparément.

### Structure automatique fixe

Les cartes générées automatiquement constituent la structure de référence de la collection. Elles :

- conservent l'ordre défini par MY. ;
- ne peuvent pas être supprimées manuellement ;
- ne peuvent pas être déplacées librement.

L'utilisateur reste libre de gérer ses données personnelles sur ces cartes : possession, exemplaires, état, grading et notes.

Une carte automatique reste dans la structure même lorsqu'elle n'est pas possédée.

### Cartes ajoutées manuellement

Une collection automatique peut également contenir des cartes ajoutées manuellement. Ces cartes sont fonctionnellement distinctes du contenu automatique.

Le propriétaire peut :

- ajouter une carte manuellement ;
- la déplacer librement dans la collection ;
- l'insérer entre des cartes automatiques ;
- la supprimer.

Les déplacements de cartes manuelles ne modifient jamais l'ordre relatif des cartes automatiques. Le mécanisme technique de positionnement n'est pas défini par ce document.

### Mise à jour contrôlée

Une collection automatique peut évoluer lorsque de nouvelles cartes deviennent disponibles dans la source de données. Elle ne doit jamais être modifiée silencieusement.

Lorsqu'une mise à jour est disponible :

1. l'utilisateur en est informé ;
2. il peut consulter un résumé des changements avant leur application ;
3. il choisit explicitement de mettre à jour la collection.

Le résumé doit permettre de comprendre les changements et notamment d'identifier les nouvelles cartes qui seront ajoutées. Les autres types de changements provenant de la source restent à cadrer.

Lorsqu'elle est validée, la mise à jour insère les nouvelles cartes automatiques à leur position correcte dans l'ordre de référence, sans perturber inutilement les cartes manuelles existantes. La logique précise de repositionnement de ces cartes manuelles reste ouverte.

## Cartes de référence et exemplaires physiques

### Carte de référence unique

Une carte de référence n'apparaît qu'une seule fois dans la structure d'une collection. La possession réelle est représentée séparément par les exemplaires physiques enregistrés par l'utilisateur.

Une carte peut ainsi posséder :

- zéro exemplaire ;
- un exemplaire ;
- plusieurs exemplaires.

Même en présence de plusieurs exemplaires physiques, la carte demeure une entrée unique dans la structure de la collection.

### État possédée ou manquante

Une carte est considérée comme :

- **possédée** dès qu'au moins un exemplaire est enregistré ;
- **manquante** lorsqu'aucun exemplaire n'est enregistré.

L'interface doit distinguer clairement ces deux états sans exposer la structure technique sous-jacente.

### Informations propres à chaque exemplaire

Chaque exemplaire peut conserver ses propres informations :

- état de conservation ;
- note ou commentaire personnel ;
- indication qu'il est gradé ;
- société de grading ;
- note de grading.

Les exemplaires d'une même carte peuvent avoir des informations différentes.

#### État de conservation

Un état de conservation peut être indiqué pour une carte non gradée. Des valeurs comme *Near Mint*, *Excellent*, *Good*, *Played* ou *Poor* illustrent le besoin, mais ne constituent pas une nomenclature définitive.

#### Grading

Un exemplaire peut être déclaré gradé. L'utilisateur peut alors renseigner la société de grading et la note obtenue. L'interface ne doit pas supposer que toutes les sociétés utilisent la même échelle.

Les sociétés prises en charge et les formats de notes restent à définir.

#### Notes personnelles

Une note ou un commentaire libre peut être associé à chaque exemplaire. Il peut notamment décrire un défaut visible, l'origine de la carte, une information d'achat, son rangement physique ou tout autre commentaire personnel.

La longueur maximale et le format précis de ces notes ne sont pas encore définis.

## Recherche interne

Chaque collection dispose d'une barre de recherche permettant de saisir un terme libre et de filtrer immédiatement les cartes de la collection actuelle.

La recherche peut exploiter plusieurs informations pertinentes lorsqu'elles sont disponibles, notamment :

- le nom de la carte ;
- le nom de la série ;
- le nom du set ;
- le bloc ou l'ère ;
- le numéro de carte ;
- les identifiants ou autres informations textuelles pertinentes ;
- les métadonnées utiles provenant de TCGdex.

La liste technique définitive des champs recherchés n'est pas figée.

Cette recherche est strictement un filtre interne à la collection consultée. Elle ne constitue pas une recherche globale dans l'ensemble du catalogue Pokémon.

La recherche fonctionne dans les vues liste, cartes et classeur. Les vues liste et cartes n'affichent que les résultats correspondants. Dans la vue classeur, les résultats doivent rester consultables de manière cohérente, mais le traitement visuel des emplacements non correspondants reste à définir.

## Vues d'une collection

Les trois vues de la V1 présentent la même collection et les mêmes données :

- vue liste ;
- vue cartes ;
- vue classeur.

Changer de vue ne modifie jamais la structure de la collection. Le choix de la vue peut être mémorisé pour améliorer l'expérience, mais son niveau exact de persistance reste à définir.

### Vue liste

La vue liste privilégie la densité d'information. Elle est adaptée à la consultation rapide, à la recherche, à la gestion de grandes collections et à l'identification des cartes possédées ou manquantes.

La composition exacte des colonnes et des informations affichées relève du cadrage UX.

### Vue cartes

La vue cartes présente les cartes sous forme de grille ou de tuiles mettant leur image en avant. Elle permet d'identifier facilement la carte, son état de possession et les informations essentielles liées à la collection.

Le niveau de détail visible directement sur chaque carte relève du cadrage UX.

### Vue classeur

La vue classeur représente la collection comme un classeur physique. Elle affiche toujours l'intégralité de sa structure, que les cartes soient possédées ou manquantes.

Une carte manquante conserve son emplacement et doit rester identifiable. La vue ne compacte jamais automatiquement la collection pour ne montrer que les cartes possédées. La représentation visuelle exacte d'un emplacement manquant reste à définir.

#### Formats de pages

L'utilisateur choisit un format qui détermine le nombre d'emplacements disponibles sur chaque page. Les formats `2 × 2`, `3 × 3` et `4 × 3` sont envisagés à titre d'exemples ; la liste définitive reste ouverte.

#### Organisation continue

En mode continu, les cartes sont présentées successivement selon l'ordre de la collection. Les pages se remplissent sans rupture volontaire entre les groupes, dans la limite du nombre d'emplacements du format choisi.

#### Organisation par blocs ou ères

La collection peut également être organisée par blocs ou ères du Pokémon TCG, par exemple *Soleil et Lune*, *Épée et Bouclier* ou *Écarlate et Violet*.

Dans ce mode, chaque bloc commence obligatoirement sur une nouvelle page. Si la dernière page du bloc précédent n'est pas pleine, ses emplacements restants demeurent libres et le bloc suivant commence tout de même sur la page suivante.

La classification exacte des blocs et des ères dépendra des données disponibles et sera cadrée avec l'intégration de TCGdex.

#### Navigation

La navigation entre les pages doit être simple. L'utilisateur doit pouvoir comprendre rapidement :

- la page actuellement affichée ;
- le nombre total de pages de la collection ;
- le bloc ou le groupe affiché lorsque l'organisation par blocs est active.

Le comportement détaillé de navigation relève du cadrage UX.

## Partage d'une collection

Le propriétaire peut partager une collection avec un autre utilisateur MY. depuis la collection concernée. Il utilise pour cela l'identifiant public unique du destinataire, qui doit être clairement identifié avant ou pendant la validation du partage.

### Accès en lecture seule

Le partage de la V1 est strictement limité à la consultation. Le destinataire peut :

- ouvrir la collection et consulter ses cartes ;
- voir les états de possession ;
- voir les exemplaires, les notes et les informations de grading ;
- utiliser les différentes vues ;
- utiliser la recherche et les autres outils de consultation.

Il ne peut modifier aucune donnée. Le propriétaire reste le seul utilisateur autorisé à modifier la collection.

### Gestion et retrait des partages

Le propriétaire peut consulter la liste des utilisateurs avec lesquels sa collection est partagée et retirer un accès. Dès son retrait, la collection ne doit plus être accessible depuis l'espace du destinataire.

Le recours à une invitation, à une acceptation explicite ou à des notifications détaillées de partage reste à définir.

## Suppression d'une collection

Seul le propriétaire peut supprimer sa collection. Une confirmation explicite est requise afin d'éviter toute suppression accidentelle.

La suppression retire également l'accès à tous les utilisateurs avec lesquels la collection était partagée. Le comportement technique de suppression ou d'archivage des données reste à définir.

## Profil utilisateur

Le profil utilisateur de la V1 reste léger. Il permet de gérer au minimum :

- les informations essentielles du compte ;
- l'identifiant public utilisé pour le partage ;
- les paramètres de base nécessaires au fonctionnement de MY.

La gestion détaillée du profil et les fonctionnalités sociales avancées ne font pas partie de ce document.

## Principes UX fonctionnels

Les interactions principales doivent rester rapides, en particulier pour :

- ouvrir une collection ;
- rechercher une carte ;
- indiquer qu'une carte est possédée ;
- ajouter un exemplaire ;
- modifier l'état d'un exemplaire ;
- naviguer entre les vues ;
- consulter les cartes manquantes.

Les fonctionnalités avancées ne doivent pas rendre ces actions inutilement complexes. L'utilisateur ne doit pas avoir l'impression de manipuler une base de données.

### Actions sensibles

Une confirmation explicite est requise pour les opérations sensibles ou destructrices, notamment :

- la suppression d'une collection ;
- le retrait d'un partage lorsqu'il risque d'interrompre un accès en cours ;
- les futures opérations destructrices.

Les actions courantes et réversibles ne doivent pas être surchargées de confirmations inutiles.

## Fonctionnalités hors périmètre de la V1

Les fonctionnalités suivantes ne font pas partie de la V1 :

- le deckbuilding et le gameplay Pokémon TCG ;
- une marketplace ;
- l'achat ou la vente de cartes ;
- la messagerie et les échanges structurés entre utilisateurs ;
- les profils sociaux publics avancés ;
- les likes et commentaires publics ;
- le suivi complet des prix et l'estimation financière d'une collection ;
- l'historique complet de toutes les modifications ;
- la gestion d'équipes ou de groupes d'utilisateurs ;
- les permissions d'édition collaborative ;
- le partage public par URL sans authentification.

Ces possibilités futures ne doivent pas complexifier la V1 tant qu'elles ne sont pas cadrées.

## Éléments laissés ouverts

Les sujets suivants devront être définis dans de futurs documents dédiés :

- le modèle de données précis ;
- la structure technique des cartes de référence et des exemplaires ;
- la gestion technique des positions ;
- la logique exacte d'insertion des cartes manuelles entre les cartes automatiques ;
- le comportement des cartes manuelles lors d'une mise à jour automatique ;
- les règles exactes d'inclusion, les variantes prises en charge et l'ordre automatique des collections basées sur un Pokémon ;
- la classification des blocs et des ères ;
- les données exactes exploitées depuis TCGdex ;
- la fréquence de vérification des mises à jour ;
- le contenu précis du résumé et le fonctionnement des notifications de mise à jour ;
- la nomenclature définitive des états de conservation ;
- les sociétés de grading et leurs formats de notes ;
- la liste définitive des champs utilisés par la recherche ;
- le comportement exact de la recherche dans la vue classeur ;
- le comportement du partage avant l'accès, notamment une éventuelle invitation ou acceptation ;
- la gestion détaillée du profil ;
- le design détaillé du dashboard et des vues ;
- le responsive et l'accessibilité ;
- l'architecture technique et la stack ;
- Supabase, Netlify, l'authentification, la sécurité et les stratégies d'accès aux données ;
- la stratégie de synchronisation avec TCGdex.

Ces éléments ne doivent pas être inventés ou considérés comme décidés avant leur cadrage et leur validation.

