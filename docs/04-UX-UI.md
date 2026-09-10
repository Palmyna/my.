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

MY. doit rester identifiable sans que la marque surcharge chaque écran. Le logo SVG existant `src/assets/brand/my-logo.svg` est utilisé sans modification par les écrans Auth 3B.

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

La Phase 3B fournit la homepage, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm-email`, `/auth/mfa/enroll` et `/auth/mfa/challenge`. `/dashboard` affiche uniquement la réussite de l'authentification, l'identifiant MY. chargé et la déconnexion ; le shell authentifié et les collections restent hors 3B.

Après inscription, un écran invite à consulter les emails et permet un renvoi générique. Le lien confirme l'adresse puis termine sa session technique : « Adresse email confirmée » propose de se connecter par email/mot de passe, avant enrollment ou challenge TOTP.

La récupération affiche une réponse générique à la demande d'email. Le lien ouvre le parcours MFA, avec enrollment si aucun facteur n'est vérifié, sinon challenge. Le formulaire du nouveau mot de passe n'apparaît qu'après `aal2`. Après succès, la session est conservée et le dashboard temporaire affiche « Mot de passe modifié. Vous restez connecté. ».

Les écrans utilisent Poppins, la palette sombre/rouge/blanc, des labels explicites, un focus visible et des contrôles adaptés au mobile. Le QR et la clé manuelle restent dans l'écran d'enrollment, sans persistance. Une configuration abandonnée peut être recommencée ; seuls les facteurs TOTP non vérifiés sont remplacés. Les erreurs et liens expirés offrent une reprise, sans contenu privé pendant la résolution de session.

Sans session, seuls la homepage, les parcours nécessaires à l'authentification et les pages légales nécessaires sont accessibles. Le footer donne notamment accès aux pages légales applicables (mentions légales, confidentialité/RGPD, cookies, droits d'auteur, conditions générales lorsque nécessaires). Le catalogue, les Pokémon, les Extensions, les Cartes et les collections restent authentifiés ; aucun parcours catalogue public n'est prévu.

## Navigation après connexion

Le header authentifié est léger, permanent et accessible dans toute l'application. Il comporte trois zones :

- **à gauche** : le logo MY., toujours visible, retourne au Dashboard ; aucun lien Dashboard supplémentaire n'est nécessaire ;
- **au centre** : la recherche globale persistante, outil de navigation disponible depuis chaque écran authentifié ;
- **à droite** : un menu utilisateur compact donnant accès à Profil, Paramètres et Déconnexion.

MY. n'utilise pas de grande sidebar permanente. Les actions contextuelles restent proches du contenu concerné. La hauteur du header, la largeur du champ et l'icône exacte du menu restent des choix de design détaillé. Cartes, listes et classeurs conservent l'espace principal.

## Recherche globale du header

### Saisie et choix explicite

La recherche agit comme un menu dynamique de navigation. Une même saisie interroge toutes les catégories sans sélection préalable. Avant **3 caractères saisis**, aucune recherche n'est déclenchée ; à partir de ce seuil, les suggestions se mettent à jour en direct.

Il n'existe aucune action classique « lancer la recherche » ni page générale de résultats. Valider directement le champ ne navigue pas, ne choisit pas la première suggestion et n'en sélectionne aucune automatiquement. L'utilisateur active explicitement une suggestion.

Sur mobile, valider depuis le clavier virtuel ferme le clavier, conserve les suggestions et ne navigue pas. Le résultat voulu reste accessible au toucher. Sans correspondance, le dropdown reste ouvert avec un état simple tel que `Aucun résultat pour « xyz »`.

### Catégories et nombre de suggestions

| Ordre | Catégorie | Recherche | Maximum |
|---:|---|---|---:|
| 1 | Pokémon | Nom français ; Pokédex affichable en complément | 2 |
| 2 | Extensions | Nom de l'Extension uniquement | 2 |
| 3 | Collections | Nom uniquement, collections personnelles et partagées accessibles | 2 |
| 4 | Cartes | Champs catalogue du moteur portable, plusieurs termes pouvant correspondre à des champs différents | Places restantes |

Le dropdown affiche au maximum **10 suggestions**, par pertinence dans chaque catégorie. Une catégorie absente laisse ses places aux Cartes ; Pokémon, Extensions et Collections ne dépassent jamais deux résultats chacune. Avec 2 + 2 + 2 suggestions, il reste 4 places Carte ; avec 1 + 0 + 1, il en reste 8.

Le contenu d'une Extension ou d'une collection ne détermine pas sa correspondance. Une série/bloc n'est pas une catégorie de résultat. Les Cartes sont uniques : `Pikachu · 28/73 · Légendes Brillantes` est un résultat Carte, dont les variantes seront consultées dans la fiche. Aucune Variante n'est proposée directement dans cette recherche.

### Lignes et accessibilité

Chaque suggestion constitue directement une ligne interactive, sans sections intermédiaires à titres non cliquables. Les lignes restent modernes, aérées et sobres : information principale à gauche, **catégorie explicite à droite**, information secondaire seulement si utile, fond subtilement teinté et bordure ou accent de la même famille chromatique. Les états hover, focus et tactiles sont lisibles.

Les catégories disposent de repères chromatiques ; une couleur évoquant le Pokémon peut être utilisée si le contraste le permet. La palette et la méthode de choix restent ouvertes, sans donnée métier couleur à maintenir manuellement pour chaque Pokémon. La couleur n'est jamais le seul repère. Le dropdown ne dépend pas de miniatures ou de logos obligatoires.

Depuis le champ, `Tab` entre dans les suggestions ; les tabulations suivantes les parcourent. Une suggestion ayant le focus s'active par le comportement clavier standard approprié. Le focus doit être visible, les contrastes suffisants et les zones tactiles confortables.

## Pages catalogue

### Structure commune et neutralité

Les pages Pokémon, Extension et Carte partagent un langage visuel : une partie haute présentant illustration, informations et actions pertinentes, puis une partie basse avec sélecteur **Liste / Cartes** et contenu associé. La vue **Classeur est réservée aux collections**.

Ces pages sont informatives. Elles n'affichent pas de progression personnelle, pourcentage de complétion, total possédé ou statistiques personnelles. Les collections restent le cœur de la gestion personnelle ; de futures pages « Mes cartes », doublons ou statistiques globales ne sont pas ajoutées par ce cadrage. Le détail contextuel Variante permet les actions de possession autorisées sans transformer les en-têtes catalogue en tableaux de progression.

### Page Pokémon

La partie haute présente le nom français, le numéro Pokédex, le nombre de **Cartes distinctes**, le nombre de **Variantes correspondantes**, une Carte spéciale illustrative du Pokémon et l'action Créer/Ouvrir sa collection automatique.

L'illustration provient d'une Carte réelle de ce Pokémon, choisie pour son intérêt visuel plutôt qu'une carte commune basique. Elle est choisie à l'ouverture et reste stable pendant toute la consultation, y compris lors des rerenders ; une visite ultérieure peut en présenter une autre.

La partie basse affiche les Cartes liées au Pokémon, chacune une seule fois, en Liste ou Cartes, par ordre chronologique au niveau **Carte** selon sa date pertinente. Les variantes restent regroupées dans la fiche Carte : cette liste ne reproduit pas le tri par date de chaque Variante d'une collection automatique Pokémon.

### Page Extension

La partie haute présente le nom, la série/bloc, la date de sortie, les abréviations ou informations génériques pertinentes, les nombres de Cartes distinctes et de Variantes, une illustration et l'action Créer/Ouvrir sa collection automatique.

L'illustration privilégie une **Carte Pokémon spéciale de l'Extension**, plutôt qu'une Énergie, un Objet ou une carte générique lorsqu'une Carte Pokémon spéciale pertinente existe. Elle est choisie à l'ouverture, stable pendant la consultation et peut changer lors d'une autre visite.

La partie basse affiche chaque Carte une seule fois, en Liste ou Cartes, par **numéro naturel croissant**, selon l'ordre normalisé du catalogue MY. Cliquer une Carte ouvre sa fiche.

### Compteurs et action de collection automatique

Pour Pokémon comme Extension, `card_count` correspond aux Cartes distinctes réellement concernées par la liste et `variant_count` aux Variantes correspondantes selon le même périmètre catalogue. Ces nombres dérivés ne mesurent aucune possession. Le nombre officiel du set peut être présenté séparément si utile ; il ne remplace pas automatiquement le nombre réel de Cartes MY.

Si l'utilisateur ne possède pas de collection automatique pour la cible, l'action propose `Créer ma collection…`. Si elle existe, l'action devient `Ouvrir ma collection…`. La règle d'une seule collection automatique par propriétaire et cible s'applique aussi depuis le Dashboard. Une collection reçue en partage ne compte pas comme une collection personnelle de cette cible.

### Page Carte

La partie haute présente l'image, le nom français, le numéro, l'Extension cliquable, la série/bloc, la rareté, la catégorie, la date de Carte et **tous les Pokémon associés**, chacun cliquable vers sa page. Une Carte multi-Pokémon permet donc de naviguer vers chacun d'eux. La provenance brute des dates et les identifiants internes restent hors de l'affichage courant sans intérêt utilisateur.

La partie basse présente les **Variantes de cette Carte**, en Liste ou Cartes, avec les caractéristiques nécessaires pour les distinguer : type, subtype, foil, stamps et date effective si pertinente. Une date spécifique de Variante ne remplace jamais artificiellement la date de Carte en partie haute. Cliquer une Variante ouvre le détail contextuel commun décrit plus bas, sans nouvelle fiche complète distincte.

### Actions rapides et navigation contextuelle

Le clic principal sur une Carte ouvre sa fiche. Un menu secondaire `…` peut proposer les actions rapides pertinentes, comme ajouter à une collection ou ajouter un exemplaire, sans devenir un menu général. L'action doit identifier la Variante exacte lorsque nécessaire ; elle ne choisit pas arbitrairement une Variante derrière une Carte.

La fiche Carte préserve son contexte d'arrivée. **Retour** restaure autant que possible la même page, la vue, les filtres, le scroll et le contexte de navigation. Ce retour dans une consultation en cours ne réapplique pas une préférence d'ouverture au détriment de l'état précédent.

**Précédente / Suivante** suit la liste d'origine : ordre des Cartes Pokémon, ordre naturel de l'Extension ou ordre réel de la collection. Une arrivée par suggestion globale ou accès direct sans véritable liste ordonnée ne fabrique aucune séquence précédente/suivante.

Sur mobile, le swipe horizontal est prévu pour cette même navigation lorsqu'elle existe. Son seuil évite une navigation involontaire pendant le scroll ; sens, seuil et animation légère restent des choix d'implémentation cohérents avec les conventions retenues.

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

Le nom, libre ou automatique, exige au moins **3 caractères utiles après trim** ; la même validation s'applique au renommage. Une cible automatique déjà possédée conduit à l'ouverture de sa collection existante. PostgreSQL garantit ces invariants indépendamment de l'interface.

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

La recherche interne filtre uniquement la collection courante. Elle reste distincte de la recherche globale du header (navigation) et de la recherche de sélection utilisée pour ajouter une variante.

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

La vue à l'ouverture suit la préférence personnelle définie dans Paramètres. Un changement explicite de vue actualise le dernier choix collection, indépendamment du dernier choix catalogue.

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

Cliquer sur une variante depuis une collection (Liste, Cartes ou Classeur) ou depuis une fiche Carte catalogue ouvre le **même détail contextuel**, sans perdre inutilement le contexte ni la position d'origine.

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

Les actions s'adaptent au contexte : ajouter un exemplaire, gérer ses exemplaires ou ajouter la Variante à une collection lorsque pertinent. Depuis une collection où la Variante est déjà présente, un bouton générique d'ajout ne doit pas occuper artificiellement la même place principale que dans le catalogue. Le contexte partagé demeure en lecture seule et montre les informations du propriétaire autorisées, sans actions d'édition redondantes ou désactivées en masse. Les exemplaires restent liés à l'utilisateur et à la Variante, même hors de toute collection.

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

Cette action ouvre la recherche de sélection dans le catalogue, distincte de celle du header. L'utilisateur sélectionne une variante existante et peut ensuite organiser librement les éléments.

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

Après confirmation du propriétaire, le partage est directement actif et la collection apparaît dans « Collections partagées avec moi ». Il n'existe ni invitation, ni acceptation, ni refus. Le propriétaire peut consulter les personnes ayant accès et retirer un partage ; le destinataire peut retirer son propre accès. Ce retrait conserve la collection, ses éléments et les exemplaires. L'interface détaillée et la résolution limitée du destinataire seront implémentées ultérieurement.

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
- rejoindre la page Paramètres, distincte du Profil.

Le rôle de l'identifiant doit être compréhensible. MY. le génère au format `MY-XXXXX-XXXXX-XXXXX-XXXXX` ; il est consultable et copiable, sans choix ni modification par l'utilisateur. Les fonctionnalités sociales avancées ne font pas partie de la V1.

## Paramètres et préférences de vues

La page Paramètres est accessible depuis le menu utilisateur et distincte de la page Profil. Sa section **Affichage** propose :

| Préférence | Choix |
|---|---|
| Vue catalogue par défaut | Liste, Cartes, Dernier choix utilisé |
| Vue collection par défaut | Liste, Cartes, Classeur, Dernier choix utilisé |

Une vue fixe s'applique à chaque nouvelle ouverture. `Dernier choix utilisé` mémorise le dernier mode explicitement sélectionné pour les prochaines consultations. Le choix catalogue est global à Pokémon, Extension et Carte ; le choix collection est global aux collections. Il n'y a pas de préférence par page, entité ou collection.

Les deux préférences et leurs derniers modes sont persistés pour le compte. Initialement, `Dernier choix utilisé` reprend Liste, jusqu'au premier choix explicite. Les préférences d'un propriétaire ne s'imposent pas au destinataire d'un partage : ce dernier utilise ses propres choix de consultation.

Le format du classeur et le mode continu/par blocs restent ouverts quant à leur persistance. Le thème clair/sombre/système et les réglages Premium sont seulement des possibilités futures ; ils ne sont pas ajoutés. Le design final des Paramètres reste à définir.

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
- assurer la navigation au clavier et un focus visible, notamment dans les suggestions ;
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
- la persistance du format de classeur et du mode continu ou par blocs ;
- les dimensions du header et du champ, l'icône du menu utilisateur et le design final des Paramètres ;
- la palette des suggestions, le mécanisme de couleur Pokémon et les animations du dropdown ;
- les colonnes Liste et tuiles Cartes du catalogue, le choix précis des Cartes spéciales illustratives ;
- le seuil du swipe et les animations précédente/suivante ;
- le traitement exact d'une recherche dans la vue Classeur ;
- le mécanisme de navigation rapide dans les grandes collections ;
- le design du résumé de mise à jour ;
- le design des états de chargement et des notifications ;
- le système d'icônes ;
- les breakpoints et adaptations responsive détaillées ;
- le design system complet ;
- les composants frontend et la bibliothèque UI éventuelle ;
- l'organisation détaillée du frontend et son implémentation technique ;
- la stratégie de requêtes, cache et debounce ; le socle métier portable de recherche Carte existe déjà.

Ces éléments ne doivent pas être considérés comme décidés avant leur cadrage et leur validation.
