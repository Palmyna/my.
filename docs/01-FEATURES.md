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

**État livré à la clôture de Phase 6 :** Dashboard en grille unifiée personnelle/partagée, FAB de création personnalisée, overview et contenu Collection autoritatif, renommage/suppression propriétaire, exemplaires physiques, possession/progression, réorganisation, recherche interne locale, recherche catalogue d'ajout et ajout/retrait manuel, détail Variante contextuel avec exemplaires intégrés. Les collections réellement partagées permettent la consultation du contenu, la recherche interne, le détail et les exemplaires du propriétaire en lecture seule, sans actions de mutation. La modernisation UI harmonise graphite, accent rouge MY., actions et icônes ; le Profil conserve MY.ID/copie, email, mot de passe, Authenticator et suppression du compte. Paramètres était minimal à la clôture de Phase 6 ; ses trois réglages Affichage sont désormais fonctionnels. Le backend de création automatique est livré ; son parcours catalogue et la recherche globale restent en Phase 7, en cours avec les préférences, les trois vues Collection et les réglages Affichage livrés. Mise à jour automatique et gestion utilisateur des partages restent en Phases 8 et 9. Voir la [roadmap](08-ROADMAP.md) et le [rapport de clôture](reports/2026-09-30-PHASE6-CLOSURE.md).

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

### Collections personnelles

Cette catégorie regroupe les collections dont l'utilisateur est propriétaire. Il peut :

- créer une collection personnalisée depuis le Dashboard ;
- ouvrir une collection ;
- modifier les informations générales d'une collection ;
- supprimer une collection.

### Collections partagées

Cette catégorie regroupe les collections que d'autres utilisateurs ont partagées avec l'utilisateur courant. Elles sont accessibles uniquement en consultation.

Le destinataire ne peut pas :

- modifier les cartes ou leur ordre ;
- modifier les états de possession ;
- modifier les exemplaires, leurs noms ou leurs états / notes ;
- supprimer la collection ;
- modifier ses paramètres.

Le Dashboard livré présente une grille unifiée, avec statut explicite `Personnelle` ou `Partagée · Lecture seule`.

## Création et informations générales d'une collection

Deux types de collections existent, avec des points d'entrée distincts :

- une collection personnalisée se crée depuis le Dashboard : `Créer une collection personnalisée` → Nom → Création ;
- une collection automatique se crée depuis la page catalogue d'un Pokémon ou d'une Extension précise : `Créer ma collection…` → Nom → création automatique. Parcours Pokémon livré en 7D.2 et Extension en 7D.3, via les mêmes composants.

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

L'ajout manuel, dans une collection personnalisée ou automatique, sélectionne une variante exacte active et confirmée française, dont la carte source et le set sont actifs. Une variante locale MY. reste admissible sans présence dans la source. Le backend 6C.1 permet l'ajout en début ou fin (fin par défaut), puis le déplacement précis par la réorganisation existante. Un doublon est refusé sans conversion ni déplacement. Le retrait manuel conserve les exemplaires physiques et refuse les éléments automatiques. Une perte ultérieure d'éligibilité ne retire ni ne masque les éléments existants. Les interfaces d'ajout et de retrait sont livrées en 6C.3 : action propriétaire disponible même à vide, recherche → sélection → position → confirmation dans une modal unique, puis retrait confirmé des seuls éléments manuels. En Liste, les collections automatiques affichent les repères secondaires `Auto` / `Perso` ; les collections personnalisées n'affichent aucun repère d'origine. Le partage reste en lecture seule, sans ces actions de mutation.

La Phase 6C.2 livre la recherche catalogue serveur et son service applicatif pour sélectionner cette Variante exacte : plusieurs variantes d'une carte donnent plusieurs résultats. La recherche reste indépendante de la collection, y compris pour les variantes déjà présentes ; `already_present` reste autoritatif à l'écriture 6C.1. Elle couvre carte/Pokémon, numéro/fraction, Extension, abréviations, identifiants pertinents et variante, avec normalisation de casse, accents, ligatures et ponctuation et AND multi-termes. **Le nom de série n'est pas recherché.** Elle est distincte de la recherche globale et du filtre interne. L'interface 6C.3 temporise la saisie de 300 ms, sans seuil de trois caractères, et propose `Afficher plus` par pages de 20 variantes. Voir le [contrat 6C.2](06-DATABASE.md#recherche-catalogue-pour-ajout--contrat-6c2).

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

L'utilisateur reste libre de gérer ses exemplaires sur ces cartes, leurs noms et leurs états / notes. La possession reste dérivée des exemplaires.

Une carte automatique reste dans la structure même lorsqu'elle n'est pas possédée.

### Cartes ajoutées manuellement

Une collection automatique peut également contenir des cartes ajoutées manuellement. Ces cartes sont fonctionnellement distinctes du contenu automatique.

Le propriétaire peut :

- ajouter une carte manuellement ;
- la déplacer librement dans la collection ;
- l'insérer entre des cartes automatiques ;
- la supprimer.

Un élément manuel conserve `origin = manual` et n'a pas d'`automatic_rank`. Tous les éléments sont librement repositionnables. La réorganisation livrée accepte début/fin/avant/après, par souris, tactile ou clavier ; le backend calcule midpoint/rééquilibrage et sérialise les déplacements. L'ordre visuel transitoire pendant la sauvegarde et les relectures évite le snap-back ; le frontend ne devient jamais une source permanente de vérité.

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

- nom personnalisé facultatif ;
- état / note facultatif en texte libre multiligne.

Les exemplaires d'une même carte peuvent avoir des informations différentes.

Depuis 6A.2, aucun champ structuré de condition ou de grading n'est actif. Ces informations peuvent être notées librement, sans nomenclature, parsing ni échelle imposée. Sans nom personnalisé, l'affichage utilise `Exemplaire N`, recalculé selon l'ordre des exemplaires, sans stocker ce libellé.

#### Notes personnelles

Une note ou un commentaire libre peut être associé à chaque exemplaire. Il peut notamment décrire un défaut visible, l'origine de la carte, une information d'achat, son rangement physique ou tout autre commentaire personnel.

La note est limitée à 750 caractères Unicode. Un texte vide ou uniquement composé d'espaces blancs devient `NULL` ; les espaces et retours à la ligne utiles sont conservés.

## Recherche globale et consultation du catalogue

**Phase 7 en cours :** Pokémon (7D.2), Extension (7D.3) et Carte (7D.4, `0.7.10`) livrés sur le socle UI Catalogue commun et les contrats 7D.1. Recherche globale encore future. Les recherches d'ajout et interne Phase 6 sont déjà livrées.

La recherche globale est une navigation par suggestions dynamiques, disponible partout après connexion à partir de **3 caractères**. Il n'existe ni bouton de lancement requis, ni page générale de résultats. Valider le champ ne sélectionne aucun résultat et ne navigue pas ; l'utilisateur choisit explicitement une suggestion. Sur mobile, cette validation ferme seulement le clavier et conserve les suggestions.

| Catégorie, dans l'ordre d'affichage | Champs de correspondance | Maximum |
|---|---|---:|
| Pokémon | Nom français ; numéro Pokédex informatif | 2 |
| Extensions | Nom de l'Extension uniquement | 2 |
| Collections | Nom uniquement, parmi ses collections et celles partagées avec lui | 2 |
| Cartes | Nom, Pokémon liés, numéro, Extension, abréviations, identifiants pertinents et métadonnées textuelles prises en charge par le moteur portable | Places restantes |

Le total ne dépasse jamais **10 suggestions**. Chaque catégorie est triée par pertinence ; les trois premières ne dépassent pas leur quota pour remplir la liste. Le contenu d'une Extension ou d'une collection ne la fait pas correspondre à une recherche sur son nom. Une Carte apparaît une seule fois, indépendamment de ses variantes ; aucune suggestion globale ne cible directement une Variante ou une série/bloc. La recherche Carte conserve normalisation de casse/accents, préfixes, numéros, correspondances multi-champs et classement déterministe du moteur portable existant, détaillé dans [l'architecture](05-ARCHITECTURE.md#recherche-et-requêtes).

Les pages catalogue Pokémon, Extension et Carte sont des pages de consultation. Elles utilisent **Liste / Cartes** ; Classeur reste réservé aux collections.

- **Pokémon (livré)** : identité française et Pokédex, types et gradient contextuel, nombre de versions, aucune illustration d'espèce ; Variantes en ordre canonique RPC, filtre local AND, Liste/Cartes, Détail Variante existant et création/ouverture automatique personnelle.
- **Extension (livrée)** : identité teal/turquoise, nom FR/source distinct, abréviation commune, série/date disponibles, nombre de versions et logo/symbole optionnels ; Variantes en ordre canonique, recherche locale incluant les Pokémon rattachés, Liste/Cartes et Détail communs, liens indépendants vers chaque Pokémon et création/ouverture automatique personnelle.
- **Carte (livrée)** : fiche de carte source avec identité Extension teal/turquoise, image représentative fournie par le contrat et placeholder commun, nom/contexte FR/source/numéro, métadonnées disponibles et liens Extension/Pokémon par IDs internes. Section Versions, ordre backend, Liste/Cartes avec préférence globale, sans recherche locale ni CTA Collection. Chaque Version montre image et label, date seulement si distincte de la Carte ; les caractéristiques détaillées restent dans le Détail Variante.

Les pages catalogue n'affichent pas de progression ou statistiques personnelles. Les compteurs reflètent le catalogue réellement affiché et son périmètre français ; le nombre officiel du set demeure une information distincte. Pokémon et Extension proposent **Créer ma collection** en l'absence de collection automatique personnelle correspondante, sinon **Ouvrir ma collection**. Une collection partagée ne remplace pas celle du propriétaire courant.

Le clic principal sur une Version ouvre le Détail Variante commun, avec exemplaires personnels uniquement dans ce panneau. Les liens indépendants du nom de Carte depuis Pokémon/Extension ouvrent `/catalog/cards/:cardId` ; le contexte Extension depuis Pokémon ouvre `/catalog/extensions/:setId`. Aucun contrôle interactif imbriqué ni double ouverture. Retour navigateur standard à ce stade ; navigation contextuelle avancée réservée à 7F. Les interactions précises relèvent de [04-UX-UI.md](04-UX-UI.md).

Cette recherche complète deux outils distincts : la recherche interne filtre la collection actuelle ; la recherche d'ajout permet de sélectionner la **Variante exacte** à ajouter à une collection.

## Recherche interne

Livrée en 6D.1 dans la liste Collection, la recherche filtre immédiatement le tableau déjà chargé par `get_collection_content`, pour le propriétaire comme en partage lecture seule. Aucun appel réseau, pagination ou délai de saisie n'est ajouté.

Champs recherchés lorsqu'ils existent : `cardNameFr`, `setNameFr`, `setAbbreviationFr`, `setAbbreviation`, `seriesNameFr`, `seriesNameSource`, `localId`, `variantLabel`. Casse, accents, ligatures françaises, espaces multiples et ponctuation courante sont normalisés ; les séparateurs utiles de `28/73` et `SL3.5` sont conservés.

Les termes suivent une logique **AND** : chaque terme doit correspondre à au moins un champ, éventuellement différent des autres termes (`Pikachu Reverse ASC`, `Soleil Lune Pikachu`). Aucun score ni tri : l'ordre backend reste intact. Après ajout/retrait et actualisation existante, la requête courante filtre le nouveau tableau.

La croix dans le champ efface la recherche, conserve le focus et restaure immédiatement la collection complète. La réorganisation est désactivée uniquement lorsque le filtre masque des cartes ; consultation, exemplaires et retrait personnel restent accessibles selon les droits existants.

Cette recherche est strictement un filtre interne à la collection consultée. Elle ne constitue pas une recherche globale dans l'ensemble du catalogue Pokémon.

La recherche fonctionne dans les trois vues Collection depuis 7B.3. Liste/Cartes affichent seulement les correspondances. Classeur garde toutes les positions/pages : correspondances visibles, autres variantes fortement atténuées, pochettes vides inchangées. Nouvelle recherche effective avec résultat : saut unique à la première occurrence dans l'ordre réel, puis navigation libre. Compteur et flèches parcourent les occurrences sans boucle, avec halo bref sur la pochette courante. Aucun résultat ou effacement : page conservée ; effacement retire compteur et halo.

## Vues d'une collection

Liste, Cartes et Classeur sont fonctionnelles depuis 7B.3. Le sélecteur compact propose les trois vues dans la toolbar.

Les trois vues de la V1 présentent la même collection et les mêmes données :

- vue liste ;
- vue cartes ;
- vue classeur.

Changer de vue conserve route, recherche et contenu chargé, sans refetch lié au renderer. Les trois vues partagent ordre backend, possession, droits et détail Variante Phase 6. Le dernier choix explicite est enregistré dans `last_collection_view` du viewer connecté, y compris en partage ; `collection_default_view` reste inchangée. `binder` ouvre le Classeur.

### Vue liste

La vue liste privilégie la densité d'information. Elle est adaptée à la consultation rapide, à la recherche, à la gestion de grandes collections et à l'identification des cartes possédées ou manquantes.

La composition exacte des colonnes et des informations affichées relève du cadrage UX.

### Vue cartes

La vue cartes présente les cartes sous forme de grille ou de tuiles mettant leur image en avant. Elle permet d'identifier facilement la carte, son état de possession et les informations essentielles liées à la collection.

Chaque tuile conserve image, nom, abréviation d'Extension, numéro et variante visible. URL et placeholder sont ceux de Liste. La grille adapte le nombre de colonnes, avec deux colonnes sur mobile ; les résultats de recherche se compactent selon l'ordre relatif backend. Les cartes manquantes restent désaturées et atténuées, avec état accessible masqué et contrôles utilisables.

Le propriétaire réorganise depuis une zone haute invisible au repos, révélée uniquement au survol de cette zone ou au focus. Capteurs souris/tactile/clavier, primitives backend et relectures Phase 6 sont réutilisés ; une coche verte temporaire confirme les lectures autoritatives réussies. Filtre masquant des éléments et partage lecture seule : aucune poignée ni réorganisation. Détail, Exemplaires et retrait manuel gardent leurs droits existants.

### Vue classeur

La vue classeur représente la collection comme un classeur physique. Elle affiche toujours l'intégralité de sa structure, que les cartes soient possédées ou manquantes.

Carte possédée : rendu normal. Carte manquante : image identifiable, désaturée et atténuée, état accessible. Pochette réellement vide : aucune carte ni placeholder. Les cartes sans image ou après erreur de chargement utilisent `card-placeholder.webp`, comme Liste, Cartes, détail Variante et ajout.

#### Formats de pages

Les formats V1 fonctionnels sont exactement `2x2`, `3x3`, `4x3` (4, 9, 12 emplacements), défaut initial `3x3`. Le popover de la barre Classeur résout override viewer + collection → défaut global → `3x3`. « Utiliser le format par défaut » supprime l'override. Un changement effectif confirmé reconstruit les pages depuis le contenu chargé, revient page 1 et efface recherche, occurrence et halo, sans refetch du contenu.

#### Organisation continue

Le Classeur V1 est **continu uniquement** : les variantes suivent l'ordre autoritatif de la collection et remplissent successivement les pages. Aucun regroupement par série, bloc, ère, Extension, Pokémon ou catégorie. La pagination est calculée frontend ; aucune table `binder_pages`, aucun mode d'organisation persisté.

#### Navigation

La navigation entre les pages doit être simple. L'utilisateur doit pouvoir comprendre rapidement :

- la page actuellement affichée ;
- le nombre total de pages de la collection.

Desktop/tablette large : page 1 seule à droite, puis 2–3, 4–5 ; dernière page paire seule à gauche. Mobile/largeur insuffisante : une page exacte, sans modifier le format. Côtés, clavier contextualisé, swipe mobile et numéro de page naviguent sans boucle. Clic/tap sur carte : détail Variante existant, également en partage lecture seule. Aucun reorder, Exemplaires, menu ou mutation directement sur les pochettes.

## Partage d'une collection

Le propriétaire peut partager une collection avec un autre utilisateur MY. depuis la collection concernée. Il utilise pour cela l'identifiant public unique du destinataire, qui doit être clairement identifié avant ou pendant la validation du partage.

Le partage devient immédiatement actif après confirmation du propriétaire et la collection apparaît dans la grille unifiée du Dashboard, avec le statut `Partagée · Lecture seule`. La V1 ne comporte ni invitation, ni attente, ni acceptation ou refus par le destinataire. La résolution de l'identifiant reste limitée et ne permet jamais de parcourir les profils. Ce parcours de création de partage reste prévu en Phase 9 ; la consultation partagée est déjà livrée.

### Accès en lecture seule

Le partage de la V1 est strictement limité à la consultation. Le destinataire peut :

- ouvrir la collection et consulter ses cartes ;
- voir les états de possession ;
- voir les exemplaires du propriétaire, leurs noms et leurs états / notes ;
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

La suppression efface le profil MY., les préférences, les collections possédées et leurs éléments/partages, les relations donnant à cet utilisateur des accès reçus, ses exemplaires physiques avec leurs noms et états / notes, puis le compte Supabase Auth. Ses collections partagées deviennent inaccessibles aux destinataires puisqu'elles disparaissent. Retirer ses accès reçus ne supprime pas les collections des autres propriétaires ni leurs autres partages.

Le catalogue global — Pokémon, séries, Extensions, Cartes, Variantes et données de référence associées — et les données appartenant aux autres utilisateurs sont préservés. Le [modèle](03-DATA-MODEL.md#suppression-dun-compte), l'[architecture](05-ARCHITECTURE.md#suppression-du-compte--contraintes-dorchestration) et la [base de données](06-DATABASE.md#suppression-dun-compte) précisent le backend livré et validé localement. La présentation et l'intégration sont livrées localement en [4D.2](reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md). Le succès explicite entraîne la purge Auth/cache et le retour à l'accueil public. Une réponse perdue reste incertaine et invite à se reconnecter pour vérifier l'état du compte.

L'action reste discrète en bas de Profil, selon l'UX documentée. Les éventuelles exigences légales ou rétentions particulières nécessitent un cadrage spécifique ; aucune durée ni exception de conservation n'est décidée ici.

## Paramètres et préférences d'affichage

`/settings` livre la section **Affichage** depuis 7C.1 (version `0.7.6`), sur la persistance 7A.3 et les vues Collection/contrôles Classeur 7B.3. Les trois pages Catalogue utilisent cette préférence globale d'ouverture.

La page Paramètres, accessible depuis le menu utilisateur, propose ces trois préférences persistantes et indépendantes :

| Préférence | Valeurs fonctionnelles |
|---|---|
| Vue catalogue par défaut | Liste, Cartes, Dernier choix utilisé |
| Vue collection par défaut | Liste, Cartes, Classeur, Dernier choix utilisé |
| Format Classeur par défaut | `2x2`, `3x3`, `4x3` ; initialement `3x3` |

Une vue fixe s'applique à chaque ouverture du contexte concerné. `Dernier choix utilisé` reprend le dernier mode explicitement sélectionné par l'utilisateur : un choix global pour toutes les pages catalogue, et un autre pour toutes les collections, sans mémorisation par Pokémon, Extension, Carte ou collection. La navigation Retour conserve toutefois la vue de la consultation en cours.

Le stockage initial utilise `Dernier choix utilisé`, avec Liste en l'absence de choix antérieur, conformément à [06-DATABASE.md](06-DATABASE.md). `last_collection_view` mémorise uniquement le dernier mode explicitement choisi, global aux collections ; aucun mode de vue par collection.

`binder_default_format` appartient au compte. Seul un override explicite du viewer pour une collection est enregistré dans `collection_view_preferences` (utilisateur + collection). Absence d'override = héritage dynamique du défaut global, sans le copier dans chaque collection. Revenir à « utiliser le format par défaut » supprime l'override. Résolution : **override → défaut global → `3x3`**. Propriétaire et lecteur autorisé ont des préférences indépendantes ; un partage métier en lecture seule permet de gérer sa propre préférence d'affichage sans modifier la collection ni accéder à celles du propriétaire.

Seules ces préférences de vues et de format sont validées. Thème clair/sombre/système, réglages Premium, pages globales de possession, doublons et statistiques personnelles globales restent hors de cette évolution.

Chaque changement est enregistré immédiatement, sans bouton global ni toast de succès. Modifier un défaut de vue ne modifie aucun dernier mode choisi, ni la vue d'une collection déjà ouverte. Le défaut Classeur s'applique immédiatement aux collections qui en héritent, sans toucher aux overrides. Pendant le chargement, les trois contrôles restent visibles, désactivés et sans sélection fictive ; une erreur propose Réessayer. Une sauvegarde désactive seulement son réglage, conserve la valeur confirmée jusqu'à la réponse serveur et présente une erreur locale si la modification n'est pas confirmée.

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
- la liste définitive des champs utilisés par la recherche ;
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
