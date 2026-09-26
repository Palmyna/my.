# Fonctionnalités de la V1 de MY.

## Rôle du document

Ce document constitue la source de vérité concernant le comportement fonctionnel général de la première version de **MY.**. Il complète la [vision générale du projet](00-VISION.md) en décrivant les possibilités offertes aux utilisateurs et les règles produit qui les encadrent.

Il ne définit ni le modèle de données, ni l'architecture technique, ni les choix précis d'implémentation ou d'interface. Les sujets explicitement laissés ouverts doivent faire l'objet de cadrages dédiés avant d'être considérés comme décidés.

## Principes fonctionnels

MY. est centré sur la gestion personnelle de collections de cartes Pokémon TCG. Chaque utilisateur dispose de son propre espace et de ses propres données.

La V1 permet principalement de :

- gérer plusieurs collections ;
- créer des collections personnalisées ou automatiques ;
- suivre les cartes possédées et manquantes ;
- gérer plusieurs exemplaires physiques d'une même carte ;
- consulter une collection sous plusieurs vues ;
- rechercher rapidement une carte ou un groupe de cartes dans une collection ;
- naviguer par recherche globale vers les Pokémon, Extensions, collections accessibles et Cartes ;
- explorer le catalogue et choisir ses préférences de vues ;
- partager une collection avec un autre utilisateur en lecture seule.

Ces fonctionnalités doivent rester simples à comprendre et rapides à utiliser.

**État livré à la clôture de Phase 5 :** Dashboard des collections personnelles et partagées avec progression et navigation ; création personnalisée ; consultation de l'overview Collection ; renommage et suppression par le propriétaire. Les collections réellement partagées sont consultables en lecture seule grâce au socle DB/RLS, sans actions propriétaire. Le backend de création automatique est livré ; son parcours utilisateur depuis les pages catalogue reste prévu en Phase 7. La création et la gestion utilisateur des partages restent prévues en Phase 9. Les interactions avec le contenu décrites dans ce document restent à livrer selon la [roadmap](08-ROADMAP.md).

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

Au sein des collections, l'utilisateur doit pouvoir distinguer les types `Personnalisée`, `Automatique · Pokémon` et `Automatique · Extension`, ainsi que la cible automatique lorsque cela est pertinent.

### Mes collections

Cette catégorie regroupe les collections dont l'utilisateur est propriétaire. Il peut :

- créer une collection personnalisée depuis le Dashboard ;
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

Deux types de collections existent, avec des points d'entrée distincts :

- une collection personnalisée se crée depuis le Dashboard : `Créer une collection personnalisée` → Nom → Création ;
- une collection automatique se crée depuis la page catalogue d'un Pokémon ou d'une Extension précise : `Créer ma collection…` → Nom → création automatique. Ce parcours sera livré avec les pages catalogue.

Le Dashboard crée uniquement des collections personnalisées, sans wizard ni sélecteur de cible automatique. Pour une cible automatique déjà possédée, la page catalogue propose `Ouvrir ma collection…`. Une collection reçue en partage ne remplace jamais la collection automatique personnelle de cette cible.

La recherche globale reste un outil de navigation vers ces pages : aucune création directe depuis ses suggestions.

Une collection possède un nom d'au moins **3 caractères utiles après trim**, à la création comme au renommage, pour les collections personnalisées et automatiques. L'interface et PostgreSQL garantissent cette règle. Aucune autre métadonnée ne doit être supposée tant qu'elle n'est pas cadrée.

Le propriétaire peut modifier les informations générales de sa collection et, au minimum, son nom. Le type d'une collection ne doit pas être considéré comme modifiable après sa création sans cadrage spécifique.

## Collections personnalisées

Une collection personnalisée est entièrement construite par son propriétaire. Celui-ci peut :

- ajouter les cartes de son choix ;
- supprimer les cartes ajoutées ;
- modifier librement leur ordre ;
- insérer une carte à n'importe quelle position ;
- organiser la collection selon ses propres critères.

Elle ne dépend d'aucune logique automatique liée à un Pokémon. Elle peut notamment représenter une collection personnelle spécifique, une sélection de cartes favorites, une collection thématique, une wishlist ou un objectif personnel.

La wishlist est seulement un exemple d'usage d'une collection personnalisée et ne constitue pas une fonctionnalité supplémentaire de la V1.

L'ajout manuel, dans une collection personnalisée ou automatique, sélectionne une variante exacte active et confirmée française, dont la carte source et le set sont actifs. Une variante locale MY. reste admissible sans présence dans la source. Le backend 6C.1 permet l'ajout en début ou fin (fin par défaut), puis le déplacement précis par la réorganisation existante. Un doublon est refusé sans conversion ni déplacement. Le retrait manuel conserve les exemplaires physiques et refuse les éléments automatiques. Une perte ultérieure d'éligibilité ne retire ni ne masque les éléments existants. Les interfaces d'ajout et de retrait restent à réaliser.

## Collections automatiques

Une collection automatique possède une cible. Deux types de cible sont proposés dans la V1 : Pokémon et Extension.

Un utilisateur ne peut posséder qu'une seule collection automatique pour une même cible : une par Pokémon et une par Extension. Deux utilisateurs différents peuvent choisir la même cible ; les collections personnalisées ne sont pas concernées. Cette unicité est garantie par PostgreSQL, y compris en cas de créations concurrentes.

Le contenu automatique est généré depuis le catalogue local MY. selon des règles communes et reproductibles. Quel que soit le type de cible, la structure est matérialisée et gérée par MY., l'ordre initial est canonique, les ajouts manuels restent possibles et toute mise à jour structurelle nécessite une validation explicite. Après création, le propriétaire peut librement réordonner tous les éléments, automatiques comme manuels.

### Cible Pokémon

L'utilisateur choisit un Pokémon. MY. constitue la liste des cartes et variantes françaises pertinentes qui lui sont rattachées, principalement au moyen de `dexId` et des corrections locales MY. Une carte représentant plusieurs Pokémon peut appartenir aux collections automatiques de chacun d'eux.

### Cible Extension

L'utilisateur choisit une extension Pokémon TCG précise, par exemple *Légendes Brillantes*, *151*, *Évolutions à Paldea* ou *Tempête Argentée*. MY. constitue la liste de toutes les cartes et variantes françaises pertinentes de ce set.

Une collection automatique par extension ne se limite pas aux cartes de catégorie Pokémon. Elle peut contenir des Pokémon, Dresseurs, Énergies et toute autre catégorie présente dans le set.

Chaque variante française pertinente produit une entrée distincte. L'extension ciblée est un set précis et ne doit pas être confondue avec une série ou un bloc TCGdex.

Une collection automatique par extension calcule sa progression comme les autres collections. Tous ses éléments, automatiques comme manuels, contribuent au total ; une variante contribue au nombre possédé lorsque le propriétaire en possède au moins un exemplaire.

### Structure automatique et ordre personnalisable

L'ordre canonique Pokémon suit la date de parution effective complète de la variante (`YYYY-MM-DD`) croissante, puis le numéro normalisé de sa carte, puis l'ordre stable des variantes d'une même carte. Une variante sortie plus tard peut donc apparaître après une autre carte intermédiaire. L'ordre Extension reste numéro normalisé dans le set, puis ordre stable des variantes, sans critère de date. Le [pipeline](07-CATALOG-SYNC.md) conserve la provenance réelle des dates et utilise le fallback fiable de carte lorsqu'aucune date spécifique n'est connue, puis NULL en dernier. Il implémente le tri naturel et les familles Normal/Holo/Reverse/autres. Seules les variantes standard actives et confirmées françaises sont éligibles ; les Jumbo sont exclues.

Les cartes générées automatiquement constituent la structure de référence de la collection. Elles :

- conservent leur origine automatique et leur rang canonique système (`automatic_rank`) lors d'un déplacement ;
- ne peuvent pas être supprimées manuellement ;
- peuvent être déplacées librement par le propriétaire.

L'ordre canonique initialise la collection ; il reste une référence système, pas une contrainte permanente d'affichage. `sort_position` représente l'ordre réel affiché dans cette collection. Déplacer un élément automatique modifie sa position, jamais son `automatic_rank`, son `origin`, le hash/version canonique ou `automatic_target_states`. Deux collections de même cible/version peuvent ainsi avoir les mêmes éléments automatiques et des positions différentes.

L'utilisateur reste libre de gérer ses données personnelles sur ces cartes : possession, exemplaires, état, grading et notes.

Une carte automatique reste dans la structure même lorsqu'elle n'est pas possédée.

### Cartes ajoutées manuellement

Une collection automatique peut également contenir des cartes ajoutées manuellement. Ces cartes sont fonctionnellement distinctes du contenu automatique.

Le propriétaire peut :

- ajouter une carte manuellement ;
- la déplacer librement dans la collection ;
- l'insérer entre des cartes automatiques ;
- la supprimer.

Un élément manuel conserve `origin = manual` et n'a pas d'`automatic_rank`. Tous les éléments sont librement repositionnables. L'interaction UX exacte, le rééquilibrage de `sort_position` et la concurrence restent ouverts ; la possibilité de déplacer un élément automatique est validée.

### Mise à jour contrôlée

Une collection automatique peut évoluer lorsque le catalogue change pour sa cible Pokémon ou Extension. Elle ne doit jamais être modifiée silencieusement.

Lorsqu'une mise à jour est disponible :

1. l'utilisateur en est informé ;
2. il peut consulter un résumé des changements avant leur application ;
3. il choisit explicitement de mettre à jour la collection.

Le résumé doit permettre de comprendre les changements : variantes ajoutées ou retirées, éléments manuels qui deviendront automatiques et changements d'ordre pertinents. Une évolution peut provenir d'une nouvelle carte, d'une nouvelle variante française, d'une correction TCGdex ou d'une correction locale MY.

Lorsqu'elle est validée, la mise à jour ajoute les nouveaux éléments automatiques, retire ceux devenus non éligibles et actualise les `automatic_rank`. Une conversion manuel → automatique conserve le même `collection_item`, passe `origin` à `automatic`, définit `automatic_rank` et préserve autant que possible `sort_position`, sans doublon. Les autres éléments manuels et les exemplaires physiques sont conservés. La mise à jour préserve autant que possible l'ordre personnalisé de tous les éléments et ne réinitialise pas arbitrairement `sort_position` vers l'ordre canonique. Le placement des nouveaux éléments automatiques et la stratégie de préservation/ancrage des positions restent explicitement ouverts pour la Phase 8 ; aucun algorithme exact d'insertion/fusion n'est fixé.

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

**Livré localement en Phases 4C, 4D.1 et 4D.2 :** le Profil présente, dans l'ordre, **Identité MY.**, **Adresse email**, puis **Sécurité du compte**. L'identité et le changement d'email 4C sont conservés ; la section Sécurité ajoute le changement volontaire du mot de passe et accueille le statut Authenticator comme information secondaire. Les [rapports 4C](reports/2026-09-14-PHASE4C-PROFILE.md) et [4D.1](reports/2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) précisent les validations locales. La [suppression 4D.2](reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md) est intégrée en bas de Profil. Le [checkpoint Cloud final](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) valide les protections serveur et clôture la Phase 4.

### Informations du compte

La page présente au minimum :

- l'adresse email actuelle du compte ;
- l'identifiant public MY., généré automatiquement, unique, immuable et copiable ;
- la date de création du compte, par exemple « Membre depuis le 9 septembre 2026 ».

L'identifiant conserve le format `MY-XXXXX-XXXXX-XXXXX-XXXXX` et n'est jamais modifiable. L'email et la date de création du compte proviennent d'Auth, sans nouvelle donnée dupliquée dans le profil ; leurs sources sont précisées dans le [modèle de données](03-DATA-MODEL.md#utilisateur-et-profil-my). L'affichage en lecture seule et la copie accessible sont définis dans l'[UX](04-UX-UI.md#profil-utilisateur).

### Protection des actions sensibles

L'accès normal à MY. conserve email confirmé, facteur TOTP vérifié et session `aal2`. La décision finale V1 distingue les protections supplémentaires réellement imposées pour chaque action :

- **Mot de passe** : session `aal2` et mot de passe actuel exigé et vérifié par Supabase Auth côté serveur.
- **Email** : session `aal2`, Secure Email Change et confirmation de l'adresse actuelle **et** de la nouvelle adresse.
- **Suppression** : confirmations explicites, mot de passe actuel puis nouveau challenge TOTP frais et opération privilégiée côté serveur contrôlée par MY.

Aucun nouveau TOTP par opération n'est ajouté pour email/mot de passe. La limite native établie lors de la vérification précédente est prise en compte ; aucun booléen, délai ou preuve frontend ne simule cette protection. L'[architecture](05-ARCHITECTURE.md#sécurité-des-actions-de-gestion-du-compte) précise les garanties livrées et les limites de validation locale.

### Modification de l'adresse email

L'utilisateur connecté en `aal2` peut demander une nouvelle adresse depuis Profil, sans saisie de mot de passe ni nouveau challenge TOTP. Supabase Auth exige les confirmations de l'ancienne **et** de la nouvelle adresse. Confirmer une seule adresse, dans l'un ou l'autre ordre, ne finalise pas le changement. L'interface distingue l'adresse courante de la demande en attente.

Si l'ancienne boîte email est inaccessible, l'utilisateur ne peut pas terminer seul ce parcours. Une future procédure manuelle de récupération/support après vérification d'identité devra traiter ce cas ; le contact reste à définir. Secure Email Change reste activé, sans bypass automatique ni endpoint admin exposé au frontend.

L'email reste exclusivement une donnée Auth : aucun champ email n'est créé dans `profiles`. Les capacités et réglages Supabase, notamment la confirmation sur l'ancienne et la nouvelle adresse, sont documentés dans l'[architecture](05-ARCHITECTURE.md#changement-demail-et-de-mot-de-passe).

### Modification volontaire du mot de passe

Un utilisateur connecté en `aal2` peut changer son mot de passe depuis Profil en fournissant son mot de passe actuel, un nouveau mot de passe et sa confirmation. Les trois champs sont requis ; le nouveau mot de passe respecte le minimum existant de 6 caractères, correspond à sa confirmation et diffère de la saisie actuelle. Le formulaire bloque les doubles soumissions, affiche les erreurs Auth traduites et permet de réessayer. Après réussite réelle de `auth.updateUser({ password, current_password })`, il affiche `Mot de passe modifié.` et vide les champs, sans déconnexion. Supabase Auth doit refuser côté serveur l'absence du mot de passe actuel ou une valeur incorrecte ; cette garantie est validée sur Cloud par le [checkpoint 4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md). Aucun nouveau challenge TOTP ni nonce email supplémentaire n'est ajouté. La présence du formulaire livré localement en 4D.1 ne valide pas à elle seule cette protection serveur.

Ce parcours est distinct de `Mot de passe oublié`. La récupération par email déjà livrée reste inchangée pour une personne ayant réellement oublié son mot de passe ; elle conserve ses propres règles de MFA avant réinitialisation, sans exiger le mot de passe oublié.

### Authenticator

La MFA TOTP reste obligatoire pour tous. Dans **Sécurité du compte**, après le formulaire de mot de passe et une séparation subtile, Profil affiche le statut, par exemple `Authenticator configuré`, puis indique directement que toute modification ou tout remplacement nécessite de contacter un administrateur. Aucun bouton, modale ni workflow de gestion de facteur n'est ajouté.

La V1 ne propose aucun remplacement automatique du facteur depuis Profil. Le moyen de contact final reste à choisir : aucun formulaire support, adresse support définitive, ticket ou procédure automatisée supplémentaire n'est défini. La récupération en cas de perte d'Authenticator reste la procédure administrative manuelle existante.

La page livrée affiche directement l'information de contact administratif, sans bouton `Modifier` qui suggérerait une action disponible.

### Suppression définitive du compte

La V1 permet à l'utilisateur de supprimer définitivement son compte MY. Le parcours exige au minimum :

1. une confirmation explicite présentant les conséquences de la suppression ;
2. la saisie du mot de passe actuel et du TOTP actuel, vérifiés côté serveur lors de l'appel final ;
3. une validation finale explicite avant toute destruction.

La suppression efface le profil MY., les préférences, les collections possédées et leurs éléments/partages, les relations donnant à cet utilisateur des accès reçus, ses exemplaires physiques avec leurs notes et informations de grading, puis le compte Supabase Auth. Ses collections partagées deviennent inaccessibles aux destinataires puisqu'elles disparaissent. Retirer ses accès reçus ne supprime pas les collections des autres propriétaires ni leurs autres partages.

Le catalogue global — Pokémon, séries, Extensions, Cartes, Variantes et données de référence associées — et les données appartenant aux autres utilisateurs sont préservés. Le [modèle](03-DATA-MODEL.md#suppression-dun-compte), l'[architecture](05-ARCHITECTURE.md#suppression-du-compte--contraintes-dorchestration) et la [base de données](06-DATABASE.md#suppression-dun-compte) précisent le backend livré et validé localement. La présentation et l'intégration sont livrées localement en [4D.2](reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md). Le succès explicite entraîne la purge Auth/cache et le retour à l'accueil public. Une réponse perdue reste incertaine et invite à se reconnecter pour vérifier l'état du compte.

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
- les éventuelles exigences légales ou rétentions particulières liées à la suppression, à cadrer spécifiquement ;
- le design détaillé du dashboard et des vues ;
- le responsive et l'accessibilité ;
- les détails d'implémentation non figés par l'[architecture technique de la V1](05-ARCHITECTURE.md) ;
- les futures RPC fonctionnelles et les configurations de production de Supabase et Vercel ; les permissions et policies SQL sont définies dans `06-DATABASE.md` ;
- les détails de synchronisation laissés ouverts par le [pipeline catalogue](07-CATALOG-SYNC.md) ;
- les fonctionnalités éventuellement concernées par une offre Premium post-V1, son prix, ses plans, ses limites, sa facturation, une éventuelle période d'essai et son fournisseur de paiement.

Ces éléments ne doivent pas être inventés ou considérés comme décidés avant leur cadrage et leur validation.
