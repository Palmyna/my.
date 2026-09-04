# Expérience utilisateur et interface de MY.

## Rôle du document

Ce document constitue la source de vérité concernant les principes UX/UI de la V1 de **MY.**. Il définit l'expérience générale, les écrans et parcours essentiels, la navigation, les vues de collection, les comportements responsive et la direction visuelle que les futures implémentations doivent respecter.

Il complète la [vision](00-VISION.md), les [fonctionnalités de la V1](01-FEATURES.md), la [politique d'intégration de TCGdex](02-TCGDEX.md) et le [modèle de données conceptuel](03-DATA-MODEL.md). Il ne constitue ni une maquette pixel-perfect, ni un design system complet, ni une spécification de composants frontend.

## Objectif général de l'expérience

MY. doit donner l'impression d'utiliser une application de collection moderne et visuelle, et non une base de données ou un tableur amélioré.

L'expérience doit être :

- simple ;
- rapide ;
- claire ;
- visuelle ;
- moderne ;
- agréable ;
- cohérente ;
- adaptée aux petites comme aux grandes collections.

Les actions principales doivent demander peu d'étapes. L'utilisateur doit pouvoir rapidement :

- ouvrir une collection ;
- rechercher une carte ;
- distinguer les cartes possédées et manquantes ;
- consulter et gérer ses exemplaires ;
- ajouter une carte ;
- changer de vue ;
- naviguer dans le classeur ;
- consulter les mises à jour disponibles ;
- partager une collection.

## Identité graphique

### Palette

- `#E42B35`
- `#AF2328`
- `#931F1F`
- `#231A1A`
- `#3C3333`
- `#FFFFFF`

### Typographie

La typographie principale est **Poppins**.

### Direction visuelle

L'interface privilégie :

- un fond très sombre ;
- les rouges comme couleur de marque et accents ;
- le blanc pour les textes et contrastes importants ;
- des surfaces légèrement différenciées pour séparer les contenus ;
- une esthétique moderne et minimaliste ;
- des formes et composants simples ;
- des coins éventuellement arrondis ;
- peu de décoration inutile ;
- une hiérarchie visuelle forte ;
- une place importante accordée aux cartes Pokémon.

MY. doit rester identifiable sans que la marque surcharge chaque écran. Le logo SVG existant sera fourni lors de la phase d'implémentation concernée ; ce document n'en définit ni une création ni un remplacement.

## Responsive

La V1 est responsive. Sa conception est prioritairement pensée pour le desktop et la tablette, formats particulièrement adaptés aux grandes collections, aux grilles de cartes et à la vue classeur.

Le mobile reste pleinement utilisable et bénéficie de véritables adaptations. Il ne doit pas être une simple version desktop compressée.

Les adaptations peuvent notamment concerner :

- la disposition et le nombre de colonnes ;
- les panneaux latéraux ;
- les menus et la navigation ;
- les formulaires ;
- les contrôles tactiles ;
- les vues de détail ;
- la vue classeur.

### Desktop

Le desktop exploite l'espace disponible pour proposer davantage de colonnes, un affichage plus dense, une navigation rapide, un classeur plus grand et un détail latéral lorsque pertinent. Les contenus textuels ne doivent pas être étirés inutilement sur toute la largeur.

### Tablette

La tablette est un format particulièrement important pour les grilles, la consultation visuelle et surtout la vue classeur. Celle-ci doit être pensée avec une attention particulière pour cet usage.

### Mobile

Sur mobile, le nombre de cartes par ligne diminue, les contrôles peuvent être regroupés, le détail peut occuper tout l'écran et les actions essentielles doivent rester accessibles au tactile. La navigation dans le classeur doit demeurer utilisable.

Les breakpoints et adaptations détaillées restent à définir.

## Homepage publique et authentification

### Homepage

Avant authentification, la homepage reste volontairement simple. Elle utilise un fond sombre, rend le logo ou la marque MY. clairement visible, conserve l'identité rouge et blanche et présente peu de contenu.

Ses actions principales sont :

- `Sign Up` ;
- `Log In`.

Son rôle est de présenter immédiatement MY., permettre la création d'un compte et donner accès à la connexion. Elle ne doit pas devenir une landing page marketing complexe dans la V1.

### Authentification

Les écrans d'inscription et de connexion respectent la même identité visuelle et restent simples. L'utilisateur ne doit pas rencontrer une interface complexe avant d'accéder à ses collections.

Le parcours général est :

```text
Homepage → Sign Up / Log In → Authentification → Dashboard
```

La récupération de mot de passe, la validation d'adresse e-mail et les autres mécanismes précis dépendent du futur système d'authentification.

## Navigation après connexion

La navigation générale doit rester légère. MY. ne doit pas utiliser une grande sidebar permanente sans besoin futur clairement identifié.

La structure privilégie :

- la marque ou le logo MY. ;
- un accès au dashboard ;
- un accès au profil ou au compte ;
- les actions contextuelles de l'écran courant.

Une barre supérieure discrète peut porter ces éléments, sans occuper inutilement la hauteur. Les cartes, listes et pages de classeur doivent conserver le maximum d'espace et rester le contenu dominant.

## Dashboard

Le dashboard est le point central après connexion. Il permet de comprendre immédiatement quelles collections appartiennent à l'utilisateur, lesquelles lui sont partagées, leur progression et comment créer une nouvelle collection.

Il distingue clairement :

- `Mes collections` ;
- `Collections partagées avec moi`.

Cette séparation peut prendre la forme d'onglets, de sections ou d'un autre mécanisme simple. Le choix précis reste ouvert, mais la distinction doit être immédiate.

### Tuiles de collection

Les collections sont principalement présentées sous forme de cartes ou tuiles visuelles. Chaque tuile permet d'identifier au minimum :

- le nom de la collection ;
- son type ;
- sa progression ;
- l'accès à la collection.

Dès lors qu'il s'agit d'une collection automatique, la tuile doit pouvoir distinguer `Automatique · Pokémon` de `Automatique · Extension`. La cible peut également être indiquée lorsque pertinent, par exemple `Pokémon · Pikachu` ou `Extension · Légendes Brillantes`.

D'autres informations peuvent être ajoutées seulement si elles restent utiles et peu encombrantes.

### Progression

La progression est directement visible sur le dashboard, sous une forme conceptuelle telle que :

```text
82 / 120
68 %
```

Un indicateur graphique léger peut accompagner ces valeurs. Sa forme exacte reste à définir.

Une collection partagée affiche la progression réelle de son propriétaire et doit être identifiable comme partagée en lecture seule.

## Création d'une collection

Le parcours de création reste court et évite tout wizard complexe.

### Collection libre

```text
Nouvelle collection → Collection libre → Nom → Création
```

La collection peut être créée vide. L'utilisateur y ajoute ensuite des variantes depuis le catalogue MY.

### Collection automatique

```text
Nouvelle collection
  → Collection automatique
  → Pokémon ou Extension
  → Choix de la cible
  → Nom
  → Création
```

L'ordre exact entre le nom et le choix de la cible peut être adapté, mais le parcours doit rester court.

Pour une cible Pokémon, une recherche ou sélection rapide permet de choisir le Pokémon et de confirmer clairement la cible avant la création.

Pour une cible Extension, une recherche ou sélection permet de choisir un set précis dans le catalogue MY. Les résultats doivent pouvoir identifier l'extension à l'aide des informations disponibles, notamment :

- son nom français ;
- sa série ou son bloc ;
- sa date de sortie ;
- son logo ou son symbole lorsqu'il existe.

L'interface doit employer de préférence le terme `Extension` et éviter de confondre ce set précis avec sa série ou son bloc TCGdex. MY. génère ensuite la structure depuis son catalogue local.

Les deux types doivent être expliqués en quelques mots afin que leur différence soit immédiatement compréhensible.

Dans la V1, toutes les collections automatiques sont accessibles sans abonnement. Aucun écran Premium, checkout ou parcours de paiement ne doit être introduit.

## Page principale d'une collection

Une collection dispose d'une page principale commune à ses trois vues. Elle donne facilement accès à :

- son nom ;
- sa progression ;
- la recherche interne ;
- le changement de vue ;
- les actions de collection ;
- le partage ;
- les paramètres ;
- une éventuelle mise à jour disponible ;
- le contenu de la collection.

Les actions secondaires peuvent être regroupées afin que la barre d'outils ne devienne pas excessivement chargée. Passer d'une vue à une autre ne doit pas donner l'impression de charger une expérience sans rapport avec la précédente.

## Recherche

### Recherche interne à une collection

La recherche interne est immédiatement accessible depuis la page de collection. Elle accepte un terme libre et filtre rapidement la collection actuelle, notamment à partir de recherches telles que `Pikachu`, `Légendes Brillantes`, `28/73`, `Reverse`, `Promo` ou `Soleil et Lune`.

Lorsqu'un filtre est actif, l'utilisateur doit comprendre :

- qu'un filtre est appliqué ;
- quelle recherche est active ;
- comment revenir à la collection complète.

Un résultat vide doit indiquer clairement qu'aucune carte ne correspond, permettre d'effacer facilement le filtre et ne jamais laisser croire que la collection a été modifiée.

### Recherche dans le catalogue pour ajouter une carte

La recherche interne ne doit pas être confondue avec la recherche dans le catalogue global MY. utilisée pour ajouter une carte.

Les résultats du catalogue doivent permettre d'identifier clairement :

- l'image lorsqu'elle existe ;
- le nom ;
- le set ;
- le numéro ;
- la variante.

L'utilisateur sélectionne la **variante exacte** à ajouter. La V1 ne permet d'ajouter que des variantes existantes dans le catalogue MY.

Conformément au périmètre de la V1, ce catalogue et ces ajouts concernent les cartes et variantes disponibles en français.

## Vues d'une collection

Les trois vues de la V1 sont :

- Liste ;
- Cartes ;
- Classeur.

Le changement de vue doit être direct et rapide. Il ne modifie jamais la structure de la collection.

Une variante manquante reste présente dans la collection et demeure visible dans les vues pertinentes ; son absence d'exemplaire ne la retire jamais de la structure.

### Vue Liste

La vue Liste privilégie la densité, la lisibilité, la rapidité, la recherche et les grandes collections. Elle peut notamment présenter :

- le nom ;
- le numéro ;
- le set ;
- la variante ;
- l'état possédée ou manquante ;
- le nombre d'exemplaires.

La composition exacte des colonnes reste ouverte.

Cliquer sur une ligne ouvre le détail de la variante sans obliger l'utilisateur à quitter la collection ni à perdre inutilement sa position.

### Vue Cartes

La vue Cartes privilégie les illustrations et affiche les variantes sous forme de grille. Chaque élément doit permettre d'identifier :

- l'image ;
- la variante ;
- l'état possédée ou manquante ;
- les informations essentielles.

Le nombre de colonnes s'adapte à l'écran.

#### Variantes partageant une image

Lorsque plusieurs variantes utilisent la même image TCGdex, elles doivent rester clairement différenciables grâce à une indication visible, par exemple Normal, Reverse, Holo, Staff ou une autre caractéristique pertinente.

Cette différenciation ne doit jamais dépendre uniquement de l'image.

#### Cartes possédées et manquantes

Une carte manquante reste visible et identifiable sans perdre la lisibilité de ses informations. Elle peut être atténuée, assombrie, désaturée, marquée par un badge ou recevoir un autre traitement cohérent.

Une carte possédée doit être immédiatement reconnaissable, éventuellement grâce à son état, au nombre d'exemplaires ou à un indicateur discret. Les indicateurs ne doivent pas masquer excessivement l'illustration.

Le traitement visuel exact reste ouvert.

### Vue Classeur

La vue Classeur est un élément fort de l'identité de MY. Elle doit évoquer un véritable classeur physique plutôt qu'une simple grille paginée, tout en restant moderne, claire, lisible, pratique et rapide.

#### Pages et formats

Chaque emplacement correspond à une variante de la collection et doit évoquer une pochette de classeur. Le format de page est sélectionnable ; `2 × 2`, `3 × 3` et `4 × 3` sont des exemples envisagés.

Changer de format modifie uniquement la pagination et l'affichage. La structure de la collection reste inchangée.

Une carte manquante conserve toujours son emplacement. L'utilisateur doit comprendre qu'une carte est attendue et laquelle, par exemple au moyen d'une représentation atténuée ou fantôme. Le design exact reste ouvert.

#### Navigation

La vue affiche clairement :

- la page actuelle ;
- le nombre total de pages ;
- un contrôle précédent ;
- un contrôle suivant.

Les grandes collections doivent pouvoir bénéficier d'une navigation plus rapide — numéro de page, sélecteur, accès par bloc ou mécanisme équivalent — afin d'éviter de nombreuses actions successives. Le choix exact reste ouvert.

#### Organisation continue

En mode continu, les variantes suivent l'ordre de la collection et les pages se remplissent successivement, sans rupture volontaire entre les blocs.

#### Organisation par blocs ou séries

En mode par blocs ou séries, chaque nouveau bloc commence obligatoirement sur une nouvelle page. Les emplacements inutilisés à la fin du bloc précédent restent libres.

Le bloc actuellement consulté doit être identifiable et cette information peut contribuer à la navigation rapide.

## Détail d'une variante

Cliquer sur une variante depuis la vue Liste, Cartes ou Classeur ouvre son détail sans faire perdre inutilement le contexte ni la position dans la collection.

Le détail peut notamment afficher :

- l'image ;
- le nom ;
- le set ;
- le numéro ;
- la variante ;
- l'état de possession ;
- les exemplaires ;
- les actions liées aux exemplaires.

Sur desktop et, lorsque pertinent, sur tablette large, un panneau latéral ou une interaction équivalente doit être privilégié afin de garder la collection visible. Sur mobile ou petit écran, le détail peut devenir une modal plein écran, une vue contextuelle ou une autre présentation adaptée. Son contenu fonctionnel reste identique.

## Gestion des exemplaires physiques

La gestion des exemplaires se fait principalement depuis le détail de la variante. L'utilisateur peut :

- consulter chaque exemplaire ;
- ajouter un exemplaire ;
- modifier un exemplaire ;
- supprimer un exemplaire.

Chaque exemplaire est consultable et éditable séparément. Cette gestion ne doit pas être réduite à un simple champ de quantité.

### Variante sans exemplaire

Une variante manquante présente une action claire :

`Ajouter un exemplaire`

L'ajout du premier exemplaire fait automatiquement passer la variante de manquante à possédée. Aucun bouton séparé ne doit permettre de modifier manuellement un booléen de possession.

### Informations d'un exemplaire

Le formulaire peut permettre de saisir :

- la condition ;
- le statut gradé ou non ;
- la société de grading ;
- la note de grading ;
- une note personnelle.

L'interface suit le principe de **progressive disclosure** : elle révèle les champs seulement lorsqu'ils deviennent pertinents. Par exemple, la société et la note de grading n'ont pas besoin d'être affichées pour un exemplaire déclaré non gradé.

### Suppression d'un exemplaire

La suppression d'un exemplaire doit être clairement distincte du retrait d'une carte d'une collection et de la suppression d'une variante du catalogue.

Supprimer le dernier exemplaire ne retire pas la variante de la collection ; elle redevient simplement manquante.

Les exemplaires demeurent globaux au compte, comme défini dans `03-DATA-MODEL.md`, même lorsqu'une variante est visible dans plusieurs collections.

## Ajout et réorganisation des cartes

### Collection libre

Une collection libre propose une action claire :

`Ajouter une carte`

Cette action ouvre la recherche du catalogue global. L'utilisateur sélectionne une variante existante et peut ensuite organiser librement les éléments.

Le drag and drop est une possibilité naturelle sur desktop. Une alternative adaptée au mobile doit être prévue si cette interaction n'est pas suffisante.

### Collection automatique

Une collection automatique peut également proposer l'action `Ajouter une carte`. La variante choisie dans le catalogue devient alors un élément manuel.

Les éléments automatiques ne sont ni réordonnables ni supprimables manuellement. Les éléments manuels peuvent être repositionnés ou retirés sans modifier l'ordre relatif des éléments automatiques.

Lorsque nécessaire pour comprendre les actions disponibles, l'origine manuelle d'un élément doit être identifiable de manière discrète, sans surcharger toute la collection.

Retirer un élément manuel de la collection et supprimer un exemplaire physique sont deux actions distinctes que l'interface ne doit pas confondre.

## Mise à jour d'une collection automatique

Une mise à jour disponible doit être clairement visible sans devenir intrusive. Elle peut être signalée sur la tuile du dashboard, dans la collection ou au moyen d'un indicateur ou bandeau discret.

Avant toute application, l'utilisateur ouvre un résumé qui explique les changements, notamment les nouvelles cartes, les nouvelles variantes et les autres ajouts pertinents.

L'action finale est explicite :

`Mettre à jour la collection`

La collection n'est jamais mise à jour silencieusement. L'utilisateur reste maître de l'application et ne doit pas subir plusieurs confirmations successives après qu'un résumé clair lui a été présenté.

## Partage

Une collection appartenant à l'utilisateur propose une action `Partager`. Le propriétaire saisit l'identifiant public MY. du destinataire et, lorsque possible, l'interface identifie clairement l'utilisateur concerné avant validation.

Le propriétaire peut consulter les personnes ayant accès à la collection et retirer un partage. Les mécanismes précis d'invitation ou d'acceptation restent à définir.

### Expérience en lecture seule

Une collection partagée conserve les principaux outils de consultation :

- les vues Liste, Cartes et Classeur ;
- la recherche ;
- le détail des variantes ;
- les informations partagées du propriétaire, notamment ses exemplaires.

Elle reste strictement en lecture seule. L'interface doit :

- indiquer clairement que la collection est partagée et non modifiable ;
- masquer ou retirer les actions d'édition inutilisables lorsque pertinent ;
- éviter une accumulation de boutons désactivés.

## Profil utilisateur

Le profil reste léger. Il permet notamment de :

- consulter les informations essentielles du compte ;
- consulter l'identifiant public de partage ;
- copier facilement cet identifiant ;
- accéder aux paramètres nécessaires.

Le rôle de l'identifiant doit être compréhensible. Son format exact reste ouvert. Les fonctionnalités sociales avancées ne font pas partie de la V1.

## États de l'interface

### États vides

Les états vides doivent guider l'utilisateur :

- sans collection, proposer `Créer ma première collection` ;
- dans une collection libre vide, fournir une courte explication et proposer `Ajouter une carte` ;
- sans partage reçu, afficher un état simple et clair.

### Chargement

L'interface prévoit des états cohérents de chargement, de chargement partiel et d'action en cours pour les collections, le catalogue, les images et les actions utilisateur. Elle doit éviter les écrans blancs et l'impression de blocage.

### Erreurs

Les messages d'erreur doivent être compréhensibles et éviter les détails techniques bruts. Ils peuvent notamment expliquer qu'une collection n'a pas pu être chargée, qu'un exemplaire n'a pas pu être ajouté, qu'un utilisateur est introuvable ou qu'une mise à jour est temporairement impossible.

Lorsque possible, l'utilisateur doit pouvoir réessayer.

### Feedback après action

Les actions importantes fournissent un retour immédiat et discret, par exemple après la création d'une collection, l'ajout d'une carte ou d'un exemplaire, la création d'un partage ou l'application d'une mise à jour.

Le feedback ne doit pas interrompre inutilement le parcours.

## Confirmations et actions destructrices

Les confirmations sont réservées aux actions réellement sensibles, notamment la suppression d'une collection, le retrait d'un partage et les autres opérations destructrices importantes.

Les actions courantes ne doivent pas être ralenties par des confirmations inutiles. Les actions destructrices doivent être visuellement distinctes des actions normales et placées de manière à éviter les déclenchements accidentels.

## Cohérence et performance perçue

Une même action — ajouter, modifier, supprimer, partager, rechercher ou revenir — doit conserver un comportement et une représentation cohérents dans l'application. Une icône seule doit être évitée lorsque son sens n'est pas suffisamment évident.

MY. doit donner une impression de fluidité, y compris avec de grandes collections. L'expérience évite autant que possible :

- les rechargements complets inutiles ;
- les écrans blancs ;
- les changements de page pour chaque petite action ;
- les interruptions inutiles du contexte.

Les interactions locales doivent sembler immédiates lorsque cela est techniquement possible. Les choix techniques de performance restent hors de ce document.

## Accessibilité

L'interface respecte les principes d'accessibilité de base suivants :

- maintenir un contraste suffisant ;
- ne pas dépendre uniquement de la couleur ;
- rendre les états compréhensibles sans hover ;
- proposer des contrôles utilisables au tactile ;
- rendre possession, absence et lecture seule compréhensibles autrement que par la couleur.

Ce document ne constitue pas un audit WCAG complet.

## Principes de design à préserver

- **Collection first** : les collections restent au centre de l'expérience.
- **Visual first** : les illustrations de cartes occupent une place importante.
- **Simplicité** : les actions fréquentes demandent peu d'étapes.
- **Contexte conservé** : consulter une variante ne fait pas perdre inutilement la position dans la collection.
- **Lecture immédiate** : progression, possession et variantes sont rapidement compréhensibles.
- **Peu de chrome** : l'interface autour des cartes reste discrète.
- **Responsive réel** : desktop, tablette et mobile sont réellement pris en charge.

## Éléments laissés ouverts

Les sujets suivants seront définis lors du design détaillé ou de l'implémentation :

- les wireframes et maquettes pixel-perfect ;
- les dimensions, espacements, tailles typographiques et rayons exacts ;
- le design précis des boutons, formulaires et tuiles du dashboard ;
- la représentation graphique exacte de la progression ;
- l'apparence exacte des cartes possédées et manquantes ;
- les badges exacts de variantes ;
- le design, la texture éventuelle et les animations du classeur ;
- les éventuelles animations de cartes ;
- le comportement précis du drag and drop et son alternative mobile ;
- la largeur et le design exacts du panneau latéral ;
- le contenu exact d'une ligne de la vue Liste ;
- le contenu exact d'une tuile de la vue Cartes ;
- la persistance de la vue choisie, du format de classeur et du mode continu ou par blocs ;
- le traitement exact d'une recherche dans la vue Classeur ;
- le mécanisme de navigation rapide dans les grandes collections ;
- le design du résumé de mise à jour ;
- le design des états de chargement et des notifications ;
- le système d'icônes ;
- les breakpoints et adaptations responsive détaillées ;
- le design system complet ;
- les composants frontend et la bibliothèque UI éventuelle ;
- l'organisation détaillée du frontend et son implémentation technique ;
- le moteur de recherche et les détails techniques de performance.

Ces éléments ne doivent pas être considérés comme décidés avant leur cadrage et leur validation.
