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
- naviguer par recherche globale vers les Pokémon, Extensions, collections accessibles et Cartes ;
- explorer le catalogue et choisir ses préférences de vues ;
- partager une collection avec un autre utilisateur en lecture seule.

Ces fonctionnalités doivent rester simples à comprendre et rapides à utiliser.

## Comptes utilisateurs

Un utilisateur peut :

- créer un compte ;
- se connecter ;
- se déconnecter ;
- accéder à son espace personnel ;
- gérer les informations essentielles de son profil.

Le premier facteur V1 est exclusivement **email + mot de passe**, avec **confirmation obligatoire de l'adresse email**. Aucun OAuth (Google, Discord, Apple ou autre), magic link de connexion, compte anonyme ou téléphone n'est proposé. Le lien de confirmation sert à valider l'adresse après signup ; le lien de récupération sert à réinitialiser un mot de passe.

La **MFA TOTP par application Authenticator est obligatoire pour tous**. Après le premier facteur, un compte sans TOTP vérifié doit en enrôler un ; un compte déjà équipé doit répondre au challenge. L'accès à MY. requiert un email confirmé et une session `aal2`, sous contrôle frontend et RLS. SMS, passkeys et recovery codes ne font pas partie de la V1.

Le clic de confirmation après inscription valide l'email, puis MY. termine l'éventuelle session technique créée par le lien. L'utilisateur voit « Adresse email confirmée » et doit se connecter par email/mot de passe avant la MFA. Ce lien n'est jamais une méthode de connexion finale. Le changement d'adresse depuis Profil suit le parcours distinct décrit ci-dessous.

La récupération/réinitialisation du mot de passe impose la MFA **avant** toute saisie du nouveau mot de passe : le lien email ouvre une session technique, puis un challenge TOTP si un facteur vérifié existe, sinon enrollment et vérification. Une fois `aal2` atteint, l'utilisateur peut changer son mot de passe. Après succès, la session actuelle est conservée et l'accès MY. devient disponible ; aucune déconnexion ni nouvelle saisie immédiate du mot de passe n'est imposée. La demande d'email affiche une réponse générique sans confirmer l'existence du compte.

En cas de perte d'Authenticator, la récupération est administrative et manuelle : vérification de l'identité, suppression de l'ancien facteur, révocation des sessions, puis nouvelle connexion email/mot de passe et enrollment TOTP obligatoire. Aucun outil admin ni récupération MFA automatisée n'est intégré à l'application ; la procédure opérateur figure dans l'[architecture](05-ARCHITECTURE.md#récupération-mfa-administrative).

Chaque utilisateur possède un identifiant public unique propre à MY., utilisé notamment pour le partage de collections. Cet identifiant public reste distinct de l'UUID technique fourni par le système d'authentification.

MY. génère automatiquement cet identifiant au format `MY-XXXXX-XXXXX-XXXXX-XXXXX`. Les 20 caractères aléatoires utilisent des lettres majuscules et des chiffres, sans `0`, `O`, `1`, `I` ni `L`. L'utilisateur ne le choisit pas et ne peut pas le modifier. Il est stocké en majuscules ; sa recherche et son unicité sont insensibles à la casse. Sa longueur et sa génération cryptographique rendent sa découverte par devinette déraisonnable. Aucun pseudo ou nom d'affichage supplémentaire n'est défini.

## Dashboard

L'application métier reste authentifiée : Pokémon, Extensions, Cartes et collections ne sont pas accessibles sans session. Seuls la homepage, les parcours d'authentification et les pages légales nécessaires sont publics. Aucun catalogue public n'est prévu en V1.

Le header authentifié permanent donne accès au Dashboard par le logo MY., à la recherche globale et au menu Profil / Paramètres / Déconnexion. Les collections restent le cœur de la gestion personnelle.

Après connexion, l'utilisateur accède à son dashboard, point central d'accès aux collections. Celui-ci distingue clairement au minimum deux catégories, sans imposer encore leur présentation exacte dans l'interface.

Au sein des collections, l'utilisateur doit pouvoir distinguer les types `Libre`, `Automatique · Pokémon` et `Automatique · Extension`, ainsi que la cible automatique lorsque cela est pertinent.

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
- une collection automatique.

Pour une collection automatique, il choisit ensuite un type de cible puis la cible correspondante :

- un Pokémon ;
- une extension, c'est-à-dire un set précis.

Une collection possède un nom d'au moins **3 caractères utiles après trim**, à la création comme au renommage, pour les collections libres et automatiques. L'interface et PostgreSQL garantissent cette règle. Aucune autre métadonnée ne doit être supposée tant qu'elle n'est pas cadrée.

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

## Collections automatiques

Une collection automatique possède une cible. Deux types de cible sont proposés dans la V1 : Pokémon et Extension.

Un utilisateur ne peut posséder qu'une seule collection automatique pour une même cible : une par Pokémon et une par Extension. Deux utilisateurs différents peuvent choisir la même cible ; les collections libres ne sont pas concernées. Cette unicité est garantie par PostgreSQL, y compris en cas de créations concurrentes.

Le contenu automatique est généré depuis le catalogue local MY. selon des règles communes et reproductibles. Quel que soit le type de cible, la structure est matérialisée, les éléments automatiques sont fixes, l'ordre est stable, les ajouts manuels restent possibles et toute mise à jour structurelle nécessite une validation explicite.

### Cible Pokémon

L'utilisateur choisit un Pokémon. MY. constitue la liste des cartes et variantes françaises pertinentes qui lui sont rattachées, principalement au moyen de `dexId` et des corrections locales MY. Une carte représentant plusieurs Pokémon peut appartenir aux collections automatiques de chacun d'eux.

### Cible Extension

L'utilisateur choisit une extension Pokémon TCG précise, par exemple *Légendes Brillantes*, *151*, *Évolutions à Paldea* ou *Tempête Argentée*. MY. constitue la liste de toutes les cartes et variantes françaises pertinentes de ce set.

Une collection automatique par extension ne se limite pas aux cartes de catégorie Pokémon. Elle peut contenir des Pokémon, Dresseurs, Énergies et toute autre catégorie présente dans le set.

Chaque variante française pertinente produit une entrée distincte. L'extension ciblée est un set précis et ne doit pas être confondue avec une série ou un bloc TCGdex.

Une collection automatique par extension calcule sa progression comme les autres collections. Tous ses éléments, automatiques comme manuels, contribuent au total ; une variante contribue au nombre possédé lorsque le propriétaire en possède au moins un exemplaire.

### Structure automatique fixe

L'ordre canonique Pokémon suit la date de parution effective complète de la variante (`YYYY-MM-DD`) croissante, puis le numéro normalisé de sa carte, puis l'ordre stable des variantes d'une même carte. Une variante sortie plus tard peut donc apparaître après une autre carte intermédiaire. L'ordre Extension reste numéro normalisé dans le set, puis ordre stable des variantes, sans critère de date. Le [pipeline](07-CATALOG-SYNC.md) conserve la provenance réelle des dates et utilise le fallback fiable de carte lorsqu'aucune date spécifique n'est connue, puis NULL en dernier. Il implémente le tri naturel et les familles Normal/Holo/Reverse/autres. Seules les variantes standard actives et confirmées françaises sont éligibles ; les Jumbo sont exclues.

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

Une collection automatique peut évoluer lorsque le catalogue change pour sa cible Pokémon ou Extension. Elle ne doit jamais être modifiée silencieusement.

Lorsqu'une mise à jour est disponible :

1. l'utilisateur en est informé ;
2. il peut consulter un résumé des changements avant leur application ;
3. il choisit explicitement de mettre à jour la collection.

Le résumé doit permettre de comprendre les changements : variantes ajoutées ou retirées, éléments manuels qui deviendront automatiques et changements d'ordre pertinents. Une évolution peut provenir d'une nouvelle carte, d'une nouvelle variante française, d'une correction TCGdex ou d'une correction locale MY.

Lorsqu'elle est validée, la mise à jour insère les nouvelles cartes automatiques à leur position correcte, convertit sans doublon les éléments manuels devenus automatiques et retire de la structure les éléments automatiques devenus non éligibles. Elle ne supprime jamais les exemplaires physiques. Les autres cartes manuelles sont préservées sans être perturbées inutilement ; leur logique précise de repositionnement reste ouverte.

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

### Progression

La progression d'une collection utilise tous ses éléments, automatiques comme manuels. Son total correspond au nombre de variantes présentes dans la collection ; son nombre possédé correspond aux variantes pour lesquelles le propriétaire possède au moins un exemplaire. Plusieurs exemplaires d'une même variante ne la font compter qu'une fois.

Une collection partagée affiche la progression de son propriétaire.

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

## Recherche globale et consultation du catalogue

La recherche globale est une navigation par suggestions dynamiques, disponible partout après connexion à partir de **3 caractères**. Il n'existe ni bouton de lancement requis, ni page générale de résultats. Valider le champ ne sélectionne aucun résultat et ne navigue pas ; l'utilisateur choisit explicitement une suggestion. Sur mobile, cette validation ferme seulement le clavier et conserve les suggestions.

| Catégorie, dans l'ordre d'affichage | Champs de correspondance | Maximum |
|---|---|---:|
| Pokémon | Nom français ; numéro Pokédex informatif | 2 |
| Extensions | Nom de l'Extension uniquement | 2 |
| Collections | Nom uniquement, parmi ses collections et celles partagées avec lui | 2 |
| Cartes | Nom, Pokémon liés, numéro, Extension, abréviations, identifiants pertinents et métadonnées textuelles prises en charge par le moteur portable | Places restantes |

Le total ne dépasse jamais **10 suggestions**. Chaque catégorie est triée par pertinence ; les trois premières ne dépassent pas leur quota pour remplir la liste. Le contenu d'une Extension ou d'une collection ne la fait pas correspondre à une recherche sur son nom. Une Carte apparaît une seule fois, indépendamment de ses variantes ; aucune suggestion globale ne cible directement une Variante ou une série/bloc. La recherche Carte conserve normalisation de casse/accents, préfixes, numéros, correspondances multi-champs et classement déterministe du moteur portable existant, détaillé dans [l'architecture](05-ARCHITECTURE.md#recherche-et-requêtes).

Les pages catalogue Pokémon, Extension et Carte sont des pages de consultation. Elles utilisent **Liste / Cartes** ; Classeur reste réservé aux collections.

- **Pokémon** : identité française et Pokédex, nombres de Cartes distinctes et de Variantes, illustration tirée d'une Carte spéciale, puis Cartes uniques classées chronologiquement au niveau Carte.
- **Extension** : identité, série/bloc, date et informations génériques utiles, nombres de Cartes et Variantes, illustration tirée d'une Carte Pokémon spéciale, puis Cartes uniques par numéro naturel croissant.
- **Carte** : informations de Carte, liens vers l'Extension et chacun des Pokémon associés, puis liste de ses Variantes. Une date spécifique de Variante ne remplace pas la date de Carte.

Les pages catalogue n'affichent pas de progression ou statistiques personnelles. Les compteurs reflètent le catalogue réellement affiché et son périmètre français ; le nombre officiel du set demeure une information distincte. Pokémon et Extension proposent **Créer ma collection** en l'absence de collection automatique personnelle correspondante, sinon **Ouvrir ma collection**. Une collection partagée ne remplace pas celle du propriétaire courant.

Cliquer une Carte ouvre sa fiche ; cliquer une Variante ouvre le détail contextuel commun au catalogue et aux collections. Les actions rapides `…` et celles du détail s'adaptent au contexte et aux droits. Retour restaure autant que possible la consultation précédente ; Précédente / Suivante suit la liste d'origine, sans inventer de séquence depuis une simple suggestion. Les interactions précises relèvent de [04-UX-UI.md](04-UX-UI.md).

Cette recherche complète deux outils distincts : la recherche interne filtre la collection actuelle ; la recherche d'ajout permet de sélectionner la **Variante exacte** à ajouter à une collection.

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

Changer de vue ne modifie jamais la structure de la collection. La préférence personnelle persistante définit la vue à l'ouverture, selon les règles de la page Paramètres ci-dessous.

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

Le partage devient immédiatement actif après confirmation du propriétaire et la collection apparaît dans « Collections partagées avec moi ». La V1 ne comporte ni invitation, ni attente, ni acceptation ou refus par le destinataire. La résolution de l'identifiant reste limitée et ne permet jamais de parcourir les profils.

### Accès en lecture seule

Le partage de la V1 est strictement limité à la consultation. Le destinataire peut :

- ouvrir la collection et consulter ses cartes ;
- voir les états de possession ;
- voir les exemplaires, les notes et les informations de grading ;
- utiliser les différentes vues ;
- utiliser la recherche et les autres outils de consultation.

Il ne peut modifier aucune donnée. Le propriétaire reste le seul utilisateur autorisé à modifier la collection.

### Gestion et retrait des partages

Le propriétaire peut consulter la liste des utilisateurs avec lesquels sa collection est partagée et retirer un accès. Le destinataire peut également retirer son propre accès. Dès son retrait, la collection ne doit plus être accessible depuis l'espace du destinataire.

Dans les deux cas, seule la relation de partage est supprimée : la collection, ses éléments et les exemplaires du propriétaire sont conservés. Un partage vers soi-même et un doublon collection-destinataire sont interdits. Les notifications ne font pas partie de cette phase.

## Suppression d'une collection

Seul le propriétaire peut supprimer sa collection. Une confirmation explicite est requise afin d'éviter toute suppression accidentelle.

La suppression retire également l'accès à tous les utilisateurs avec lesquels la collection était partagée. Elle peut supprimer physiquement la collection, ses éléments et ses partages dans la V1, mais ne supprime jamais les exemplaires physiques du propriétaire.

## Profil utilisateur

La route `/profile` devient la page **Profil / gestion du compte** de la V1. Elle reste légère et privée : aucun pseudo, nom d'affichage, avatar, bio, information publique supplémentaire ou fonctionnalité sociale avancée n'est ajouté.

Profil et Paramètres sont deux destinations distinctes du menu `Mon compte`. La page Profil ne contient aucun lien ni raccourci vers Paramètres.

### Informations du compte

La page présente au minimum :

- l'adresse email actuelle du compte ;
- l'identifiant public MY., généré automatiquement, unique, immuable et copiable ;
- la date de création du compte, par exemple « Membre depuis le 9 septembre 2026 ».

L'identifiant conserve le format `MY-XXXXX-XXXXX-XXXXX-XXXXX` et n'est jamais modifiable. L'email et la date de création du compte proviennent d'Auth, sans nouvelle donnée dupliquée dans le profil ; leurs sources sont précisées dans le [modèle de données](03-DATA-MODEL.md#utilisateur-et-profil-my). L'affichage en lecture seule et la copie accessible sont définis dans l'[UX](04-UX-UI.md#profil-utilisateur).

### Ré-authentification des actions sensibles

Pour **chaque changement d'email, changement volontaire de mot de passe ou suppression du compte**, MY. exige une ré-authentification fraîche et complète : vérification du **mot de passe actuel**, puis d'un **nouveau challenge TOTP avec l'Authenticator actuel**. Elle protège notamment une session restée ouverte sur un appareil accessible à quelqu'un d'autre.

Une session déjà `aal2` permet l'accès normal à MY., mais ne suffit jamais à autoriser ces actions. La nouvelle vérification des deux facteurs est requise pour l'opération demandée ; un échec ne l'autorise pas. La méthode technique finale reste ouverte dans l'[architecture](05-ARCHITECTURE.md#ré-authentification-fraîche-des-actions-sensibles), sans mécanisme de mots de passe ou de TOTP maison.

### Modification de l'adresse email

L'utilisateur peut modifier son adresse directement depuis Profil. Après la ré-authentification complète, il saisit la nouvelle adresse ; Supabase Auth gère la demande et ses confirmations sécurisées. Le changement n'est final qu'après les confirmations requises, dont celle de la nouvelle adresse. L'interface distingue la demande en attente de l'adresse réellement devenue courante.

L'email reste exclusivement une donnée Auth : aucun champ email n'est créé dans `profiles`. Les capacités et réglages Supabase, notamment la confirmation sur l'ancienne et la nouvelle adresse, sont documentés dans l'[architecture](05-ARCHITECTURE.md#changement-demail-et-de-mot-de-passe).

### Modification volontaire du mot de passe

Un utilisateur connecté peut changer son mot de passe depuis Profil, après une nouvelle vérification du mot de passe actuel et du TOTP actuel, puis saisie du nouveau mot de passe. Supabase Auth effectue la modification.

Ce parcours est distinct de `Mot de passe oublié`. La récupération par email déjà livrée reste inchangée pour une personne ayant réellement oublié son mot de passe ; elle conserve ses propres règles de MFA avant réinitialisation, sans exiger le mot de passe oublié.

### Authenticator

La MFA TOTP reste obligatoire pour tous. Profil affiche son statut, par exemple `Authenticator configuré`. Une action telle que `Modifier` peut ouvrir uniquement une modale ou un message demandant de contacter MY. pour modifier/remplacer l'Authenticator.

La V1 ne propose aucun remplacement automatique du facteur depuis Profil. Le moyen de contact final reste à choisir : aucun formulaire support, adresse support définitive, ticket ou procédure automatisée supplémentaire n'est défini. La récupération en cas de perte d'Authenticator reste la procédure administrative manuelle existante.

### Suppression définitive du compte

La V1 permet à l'utilisateur de supprimer définitivement son compte MY. Le parcours exige au minimum :

1. une confirmation explicite présentant les conséquences de la suppression ;
2. une ré-authentification complète par mot de passe actuel puis TOTP actuel ;
3. une validation finale explicite avant toute destruction.

La suppression efface le profil MY., les préférences, les collections possédées et leurs éléments/partages, les relations donnant à cet utilisateur des accès reçus, ses exemplaires physiques avec leurs notes et informations de grading, puis le compte Supabase Auth. Ses collections partagées deviennent inaccessibles aux destinataires puisqu'elles disparaissent. Retirer ses accès reçus ne supprime pas les collections des autres propriétaires ni leurs autres partages.

Le catalogue global — Pokémon, séries, Extensions, Cartes, Variantes et données de référence associées — et les données appartenant aux autres utilisateurs sont préservés. Le [modèle](03-DATA-MODEL.md#suppression-dun-compte), l'[architecture](05-ARCHITECTURE.md#suppression-du-compte--contraintes-dorchestration) et la [base de données](06-DATABASE.md#suppression-dun-compte) précisent ce périmètre et les contraintes techniques à traiter avant implémentation.

L'action reste discrète en bas de Profil, selon l'UX documentée. Les éventuelles exigences légales ou rétentions particulières nécessitent un cadrage spécifique ; aucune durée ni exception de conservation n'est décidée ici.

## Paramètres et préférences d'affichage

La page Paramètres, accessible depuis le menu utilisateur, possède une section Affichage avec deux préférences persistantes et indépendantes :

| Préférence | Valeurs fonctionnelles |
|---|---|
| Vue catalogue par défaut | Liste, Cartes, Dernier choix utilisé |
| Vue collection par défaut | Liste, Cartes, Classeur, Dernier choix utilisé |

Une vue fixe s'applique à chaque ouverture du contexte concerné. `Dernier choix utilisé` reprend le dernier mode explicitement sélectionné par l'utilisateur : un choix global pour toutes les pages catalogue, et un autre pour toutes les collections, sans mémorisation par Pokémon, Extension, Carte ou collection. La navigation Retour conserve toutefois la vue de la consultation en cours.

Le stockage initial utilise `Dernier choix utilisé`, avec Liste en l'absence de choix antérieur, conformément à [06-DATABASE.md](06-DATABASE.md). Les préférences sont privées au compte et ne se partagent pas avec une collection. La persistance du format et du mode d'organisation du classeur reste ouverte.

Seules ces préférences de vues sont validées. Thème clair/sombre/système, réglages Premium, pages globales de possession, doublons et statistiques personnelles globales restent hors de cette évolution.

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
- la suppression définitive du compte, avec les deux confirmations et la ré-authentification complète décrites dans Profil ;
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
- le partage public par URL sans authentification ;
- un abonnement Premium, un système de paiement ou une restriction Premium des fonctionnalités automatiques.

Ces possibilités futures ne doivent pas complexifier la V1 tant qu'elles ne sont pas cadrées.

Les collections automatiques sont accessibles normalement dans la V1, sans abonnement ni paiement. Tout ou partie de ces fonctionnalités pourrait éventuellement relever d'une offre Premium après la V1, mais aucune règle commerciale n'est encore définie.

## Éléments laissés ouverts

Les sujets suivants devront être définis dans de futurs documents dédiés ou lors de l'implémentation concernée :

- les détails de base de données laissés ouverts par le [schéma PostgreSQL / Supabase de la V1](06-DATABASE.md) ;
- l'algorithme exact de positionnement, d'insertion et d'ancrage des cartes manuelles, notamment lors d'une mise à jour automatique ;
- les vérifications historiques d'inclusion de certaines variantes rares et les éventuelles évolutions au-delà des règles V1 du pipeline ;
- la classification des blocs et des ères ;
- les enrichissements futurs au-delà des données TCGdex exploitées en Phase 2 ;
- la fréquence de vérification des mises à jour ;
- le contenu précis du résumé et le fonctionnement des notifications de mise à jour ;
- la nomenclature définitive des états de conservation ;
- les sociétés de grading et leurs formats de notes ;
- la liste définitive des champs utilisés par la recherche ;
- le comportement exact de la recherche dans la vue classeur ;
- la résolution limitée d'un identifiant public et l'interface de confirmation du destinataire ;
- le moyen de contact final pour modifier/remplacer l'Authenticator ;
- les textes UX définitifs des modales et le design détaillé du Profil, dont le périmètre fonctionnel est cadré ;
- la méthode technique finale de ré-authentification fraîche et le workflow SQL/RPC exact de suppression du compte ;
- les éventuelles exigences légales ou rétentions particulières liées à la suppression, à cadrer spécifiquement ;
- le design détaillé du dashboard et des vues ;
- le responsive et l'accessibilité ;
- les détails d'implémentation non figés par l'[architecture technique de la V1](05-ARCHITECTURE.md) ;
- les futures RPC fonctionnelles et les configurations de production de Supabase et Vercel ; les permissions et policies SQL sont définies dans `06-DATABASE.md` ;
- les détails de synchronisation laissés ouverts par le [pipeline catalogue](07-CATALOG-SYNC.md) ;
- les fonctionnalités éventuellement concernées par une offre Premium post-V1, son prix, ses plans, ses limites, sa facturation, une éventuelle période d'essai et son fournisseur de paiement.

Ces éléments ne doivent pas être inventés ou considérés comme décidés avant leur cadrage et leur validation.
