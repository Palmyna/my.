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

La récupération affiche une réponse générique à la demande d'email. Le lien ouvre le parcours MFA, avec enrollment si aucun facteur n'est vérifié, sinon challenge. Le formulaire du nouveau mot de passe n'apparaît qu'après `aal2`. Après succès, la session est conservée et le dashboard temporaire affiche « Mot de passe modifié. Vous êtes connecté. ».

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

Si l'utilisateur ne possède pas de collection automatique pour la cible, l'action propose `Créer ma collection…`. Si elle existe, l'action devient `Ouvrir ma collection…`. Une seule collection automatique est autorisée par propriétaire et cible. Une collection reçue en partage ne compte pas comme une collection personnelle de cette cible.

### Page Carte

La partie haute présente l'image, le nom français, le numéro, l'Extension cliquable, la série/bloc, la rareté, la catégorie, la date de Carte et **tous les Pokémon associés**, chacun cliquable vers sa page. Une Carte multi-Pokémon permet donc de naviguer vers chacun d'eux. La provenance brute des dates et les identifiants internes restent hors de l'affichage courant sans intérêt utilisateur.

La partie basse présente les **Variantes de cette Carte**, en Liste ou Cartes, avec les caractéristiques nécessaires pour les distinguer : type, subtype, foil, stamps et date effective si pertinente. Une date spécifique de Variante ne remplace jamais artificiellement la date de Carte en partie haute. Cliquer une Variante ouvre le détail contextuel commun décrit plus bas, sans nouvelle fiche complète distincte.

### Actions rapides et navigation contextuelle

Le clic principal sur une Carte ouvre sa fiche. Un menu secondaire à trois carrés peut proposer les actions rapides pertinentes, comme ajouter à une collection ou ajouter un exemplaire, sans devenir un menu général. L'action doit identifier la Variante exacte lorsque nécessaire ; elle ne choisit pas arbitrairement une Variante derrière une Carte.

La fiche Carte préserve son contexte d'arrivée. **Retour** restaure autant que possible la même page, la vue, les filtres, le scroll et le contexte de navigation. Ce retour dans une consultation en cours ne réapplique pas une préférence d'ouverture au détriment de l'état précédent.

**Précédente / Suivante** suit la liste d'origine : ordre des Cartes Pokémon, ordre naturel de l'Extension ou ordre réel de la collection. Une arrivée par suggestion globale ou accès direct sans véritable liste ordonnée ne fabrique aucune séquence précédente/suivante.

Sur mobile, le swipe horizontal est prévu pour cette même navigation lorsqu'elle existe. Son seuil évite une navigation involontaire pendant le scroll ; sens, seuil et animation légère restent des choix d'implémentation cohérents avec les conventions retenues.

## Dashboard

Le dashboard est le point central après connexion. Il permet de comprendre immédiatement quelles collections appartiennent à l'utilisateur, lesquelles lui sont partagées, leur progression et comment créer une nouvelle collection.

Il distingue clairement :

- `Mes collections` ;
- `Collections partagées avec moi`.

La première interface de consultation les présente en deux sections distinctes, chacune avec son état vide, dans une grille adaptative. Le Dashboard dispose d'une largeur propre, supérieure à celle des pages Profil et Paramètres.

### Tuiles de collection

Les collections sont principalement présentées sous forme de cartes ou tuiles visuelles. Chaque tuile permet d'identifier au minimum :

- le nom de la collection ;
- son type ;
- sa progression ;
- l'accès à la collection.

Dès lors qu'il s'agit d'une collection automatique, la tuile doit pouvoir distinguer `Automatique · Pokémon` de `Automatique · Extension`. La cible peut également être indiquée lorsque pertinent, par exemple `Pokémon · Pikachu` ou `Extension · Légendes Brillantes`.

D'autres informations peuvent être ajoutées seulement si elles restent utiles et peu encombrantes.

Les tuiles utilisent des surfaces sombres subtilement teintées, avec bordure et accent de la même famille chromatique. Une palette frontend sobre couvre corail, ambre, jaune chaud, vert, turquoise, bleu, violet et rose ; l'accent est repris par la progression. La couleur reste secondaire aux libellés et conserve un contraste suffisant. Son attribution est déterministe depuis le type et le nom de cible disponibles, avec repli sur l'identifiant stable de collection, également utilisé pour les collections personnalisées. Aucune table métier de couleurs par Pokémon ni donnée couleur en base n'est nécessaire. Un changement de nom de cible peut donc changer cet accent.

Les tuiles personnelles et partagées sont des liens vers `/collections/:collectionId`, accessibles au clavier avec un focus visible. Le hover reste discret et les transitions respectent la réduction des mouvements. Le chargement et les erreurs restent intégrés au Dashboard, avec un nouvel essai explicite en cas d'échec ; le feedback après changement de mot de passe est conservé.

### Progression

La progression est directement visible sur le dashboard, sous une forme conceptuelle telle que :

```text
82 / 120
68 %
```

Une barre discrète accompagne ces valeurs, avec un pourcentage arrondi à l'entier le plus proche. Pour une collection vide, `0 / 0` est accompagné de `Collection vide`, sans pourcentage artificiel.

Une collection partagée affiche la progression réelle de son propriétaire et doit être identifiable comme partagée en lecture seule.

## Création d'une collection

Le parcours de création reste court et évite tout wizard complexe.

Le nom d'une collection personnalisée ou automatique exige au moins **3 caractères utiles après trim** ; la même validation s'applique au renommage. Une cible automatique déjà possédée conduit à l'ouverture de sa collection existante. PostgreSQL garantit ces invariants indépendamment de l'interface.

### Collection personnalisée

```text
Dashboard → Créer une collection personnalisée → Nom → Création
```

La collection peut être créée vide. L'utilisateur y ajoute ensuite des variantes depuis le catalogue MY.

Le Dashboard propose un seul CTA principal `Créer une collection personnalisée`, près de son titre, y compris sans collection. Il ouvre un dialog neutre `Collection personnalisée` avec une courte explication et le champ Nom. Le Dashboard crée uniquement des collections personnalisées ; il ne propose ni choix automatique ni sélecteur Pokémon/Extension. Aucun accès détail fictif n'est présenté.

Le nom est validé avant envoi selon la règle existante, sans modifier la valeur saisie ni ses espaces. Les erreurs de nom apparaissent près du champ ; les erreurs générales restent dans le formulaire, sans détail technique. Pendant la création, un état d'attente empêche les doubles envois et la fermeture du dialog. Aucun nouvel essai automatique n'est effectué.

Annuler ou Échap avant envoi ferme sans confirmation ; le focus revient au déclencheur et la réouverture présente un formulaire vierge. Le dialog place initialement le focus sur le nom, garde le clavier à l'intérieur et rend le fond inerte. Après succès, il se ferme, affiche `Collection créée.` et le Dashboard relit ses collections depuis le serveur, sans navigation vers une page détail.

### Collection automatique

```text
Recherche / navigation catalogue
  → Page Pokémon ou page d'une Extension précise
  → Créer ma collection…
  → Nom
  → Création automatique
```

Ce parcours sera livré avec les pages catalogue Pokémon et Extension. La cible est celle de la page consultée ; aucun wizard automatique n'est proposé depuis le Dashboard. Si la collection personnelle existe déjà, l'action devient `Ouvrir ma collection…`, sans nouvelle création ni saisie de nom. Une collection partagée ne remplace jamais cette collection personnelle.

La recherche globale ne fait que naviguer vers la page catalogue : elle ne crée aucune collection depuis ses suggestions. Les informations de la page identifient le Pokémon ou l'Extension précise avant l'action de création.

L'interface doit employer de préférence le terme `Extension` et éviter de confondre ce set précis avec sa série ou son bloc TCGdex. MY. génère ensuite la structure depuis son catalogue local.

Les deux types doivent être expliqués en quelques mots afin que leur différence soit immédiatement compréhensible.

Dans la V1, toutes les collections automatiques sont accessibles sans abonnement. Aucun écran Premium, checkout ou parcours de paiement ne doit être introduit.

## Page principale d'une collection

La page livrée en 5D.1 présente l'identité de la collection : nom en `h1`, type (`Personnalisée`, `Automatique · Pokémon` ou `Automatique · Extension`), cible automatique lorsqu'elle est disponible, progression et mode d'accès. Elle reprend la famille chromatique de sa tuile et la même présentation de progression, y compris l'état neutre `0 / 0`. Le lien `Retour au Dashboard` reste disponible dans tous les états. Les collections partagées portent le libellé `Partagée · Lecture seule`, avec la progression du propriétaire et sans menu propriétaire. La Phase 5D.2 ajoute le renommage et la suppression des collections personnelles, personnalisées comme automatiques.

L'identité est intégrée directement au fond principal MY., sans grande carte teintée ni encadrement de l'overview. La couleur déterministe reste un accent sur le type, certains badges et la large barre de progression. Le nom peut revenir à la ligne ; son en-tête flexible accueille le bouton contextuel à trois carrés en haut à droite pour le propriétaire, y compris sur mobile.

Le chargement conserve le shell authentifié. Une collection absente, inaccessible, dont le partage a été retiré, ou un identifiant manifestement invalide présente le même état : `Collection indisponible` puis `Cette collection n’existe pas ou vous n’y avez plus accès.` Une erreur temporaire propose `Réessayer`, sans détail serveur. Le titre du document devient `Nom de la collection — MY.` après chargement ; le `h1` persistant reçoit le focus à la navigation, sans le reprendre aux mises à jour asynchrones.

La première liste fonctionnelle est branchée en Phase 6B.3 sous l'overview : poignée dédiée au propriétaire, image compacte, informations et bouton Exemplaires. Le partage conserve uniquement la consultation des exemplaires et notes du propriétaire. Image manquante : placeholder graphique neutre ; carte non possédée : image grisée et textes atténués, contrôles actifs, état accessible masqué. Aucun badge visible de possession, compteur d'exemplaires, origine ou menu de ligne vide. Les vues Liste/Cartes/Classeur complètes et leurs préférences restent prévues en Phase 7. Les migrations Phase 6 restent non appliquées.

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

Le pattern de bouton contextuel compact est réutilisable pour les Collections, Cartes, Variantes et autres actions contextuelles. Son contour extérieur peut être arrondi ; son icône décorative comporte trois carrés identiques sans aucun arrondi, alignés horizontalement, régulièrement espacés et centrés dans le bouton, en rappel de la géométrie du logo MY. Le bouton reste discret au repos ; le survol, le focus visible et l'état ouvert reprennent subtilement l'accent de la collection sur les carrés, la bordure et un fond léger, sans halo.

Une action principale importante reste directement visible si nécessaire ; les actions secondaires ou contextuelles sont regroupées dans ce menu, selon les droits et le contexte. Le menu propriétaire livré propose `Renommer`, puis `Supprimer la collection` séparé visuellement. `Partager` reste futur et n'est pas affiché. Les actions non destructives propres à une collection peuvent reprendre sa couleur d'accent pour leur bordure, hover ou focus. Les actions destructives restent visuellement distinctes et utilisent toujours le langage danger indépendant de cet accent.

Le bouton est nommé `Actions de la collection` pour les technologies d'assistance. Le panneau utilise des boutons natifs dans l'ordre du document, place le focus sur `Renommer`, se ferme avec Échap ou au clic extérieur et restitue le focus au déclencheur. Quitter le panneau au clavier le ferme également. Les dialogs natifs reprennent le fond modal inerte, la boucle de tabulation, le scroll mobile et la restitution du focus ; Annuler et Échap fonctionnent avant envoi. Pendant la mutation, les contrôles et la fermeture sont verrouillés, sans double soumission ni retry automatique.

Le dialog de renommage préremplit le nom et réutilise la règle des trois caractères utiles, sans altérer la valeur envoyée. Après confirmation, le nom et le titre du document sont mis à jour immédiatement, puis relus du serveur ; le Dashboard est synchronisé. La confirmation de suppression explique que la collection, ses éléments et ses partages disparaissent, que les destinataires perdent leur accès et que les exemplaires physiques du propriétaire sont conservés. Elle ne demande ni mot de passe, ni TOTP, ni texte à recopier. Le succès confirmé ramène au Dashboard. Un résultat inattendu reste présenté comme incertain : `La suppression n’a pas pu être confirmée. Vérifiez vos collections avant de réessayer.` Une collection devenue inaccessible bascule vers l'état indisponible commun, sans détail serveur.

Passer d'une vue à une autre ne doit pas donner l'impression de charger une expérience sans rapport avec la précédente.

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

### Collection personnalisée

Une collection personnalisée propose une action claire :

`Ajouter une carte`

Cette action ouvre la recherche de sélection dans le catalogue, distincte de celle du header. L'utilisateur sélectionne une variante existante et peut ensuite organiser librement les éléments.

L'interaction exacte de réorganisation reste à cadrer pour desktop et mobile : aucun choix final de drag & drop, poignée, boutons ou geste tactile n'est fixé.

### Collection automatique

Une collection automatique peut également proposer l'action `Ajouter une carte`. La variante choisie dans le catalogue devient alors un élément manuel.

Les éléments automatiques et manuels sont tous librement réordonnables par le propriétaire. L'ordre canonique MY. initialise la collection, puis sert de référence système. Les éléments automatiques restent non supprimables manuellement tant qu'ils appartiennent à la structure automatique ; les éléments manuels peuvent être ajoutés, retirés et déplacés librement. La possibilité de déplacer un automatique est validée ; l'interaction UX exacte reste ouverte, comme pour les collections personnalisées.

Lorsque nécessaire pour comprendre les actions disponibles, l'origine manuelle d'un élément doit être identifiable de manière discrète, sans surcharger toute la collection.

Retirer un élément manuel de la collection et supprimer un exemplaire physique sont deux actions distinctes que l'interface ne doit pas confondre.

## Mise à jour d'une collection automatique

Une mise à jour disponible doit être clairement visible sans devenir intrusive. Elle peut être signalée sur la tuile du dashboard, dans la collection ou au moyen d'un indicateur ou bandeau discret.

Avant toute application, l'utilisateur ouvre un résumé qui explique les changements, notamment les nouvelles cartes, les nouvelles variantes et les autres ajouts pertinents.

L'action finale est explicite :

`Mettre à jour la collection`

La collection n'est jamais mise à jour silencieusement. L'utilisateur reste maître de l'application et ne doit pas subir plusieurs confirmations successives après qu'un résumé clair lui a été présenté.

La mise à jour préserve autant que possible l'ordre personnalisé des éléments automatiques et manuels, y compris lors d'une conversion manuel → automatique, sans retour arbitraire à l'ordre canonique. Le placement des nouveaux éléments et la stratégie de préservation/ancrage restent à cadrer en Phase 8.

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

La route `/profile` devient l'unique page **Profil / gestion du compte** de la V1. Elle reste légère, sobre, moderne et cohérente avec la direction visuelle de MY. Elle n'ajoute aucun pseudo, nom d'affichage, avatar, bio, information publique supplémentaire ou fonction sociale avancée.

Profil et Paramètres restent deux destinations distinctes du menu `Mon compte`. **Aucun lien ni raccourci vers Paramètres ne figure dans la page Profil.**

La hiérarchie livrée est **Identité MY. → Adresse email → Sécurité du compte**. L'action discrète `Supprimer mon compte`, livrée en 4D.2, suit la section Sécurité tout en bas de page.

**Réalisation Phases 4C et 4D.1 :** trois sections sobres — Identité MY., Adresse email, Sécurité du compte — reprennent le shell, Poppins et les styles existants, avec des contours discrets et des espacements réguliers. L'identifiant apparaît sous le libellé `MY.ID`, dans un input texte en lecture seule de hauteur standard, aligné avec le bouton de copie à droite ; les adresses peuvent revenir à la ligne. Les données absentes ont un message explicite, sans valeur de remplacement inventée. Les retours sont accessibles. Le `h1` unique conserve le focus de navigation géré par `AppRoutes`. Les [rapports 4C](reports/2026-09-14-PHASE4C-PROFILE.md) et [4D.1](reports/2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) consignent les contrôles responsive et clavier.

Le formulaire email est conservé : validation native de l'adresse, refus de l'adresse courante, désactivation pendant l'envoi, message d'erreur réutilisant Auth et possibilité de réessayer. L'attente issue de `user.new_email` reste visible après le rechargement Auth, distincte de l'adresse actuelle, sans supposer quelle confirmation manque. La section Sécurité présente le formulaire de mot de passe comme action principale, suivi d'une séparation fine et de l'information Authenticator, sans carte imbriquée ni bouton administratif. La suppression dispose de son action séparée après cette section.

### Identité MY.

La page affiche l'email actuel, l'identifiant public MY. et la date de création du compte, par exemple `Membre depuis le 9 septembre 2026`. Cette date provient du compte Supabase Auth, selon le [modèle](03-DATA-MODEL.md#utilisateur-et-profil-my), sans duplication dans le profil.

L'identifiant, généré automatiquement, unique et immuable au format `MY-XXXXX-XXXXX-XXXXX-XXXXX`, apparaît dans un **champ en lecture seule**, avec **à droite un bouton de copie représentant deux feuilles/pages superposées**. Le rôle de cet identifiant de partage reste compréhensible. Le bouton copie directement sa valeur complète dans le presse-papiers.

Le champ possède un libellé et reste sélectionnable ; le bouton est accessible au clavier, avec un focus visible et un nom accessible tel que `Copier l'identifiant MY.`. Après une copie réussie, le bouton affiche une coche sur fond vert pendant 2,2 secondes, puis retrouve son pictogramme initial. Une région de statut masquée visuellement annonce le succès, sans déplacer le focus ni ajouter de message visuel séparé. Si la copie échoue, le texte d'aide du champ explique le repli par sélection/copie manuelle, également annoncé. La couleur n'est jamais le seul indicateur ; les transitions discrètes et l'état pressé respectent la réduction des mouvements.

### Sécurité du compte

Les actions de changement d'email et de mot de passe partent directement de Profil pour un utilisateur autorisé en `aal2`. Leurs contrôles correspondent aux protections natives Supabase : aucun nouveau challenge TOTP propre à l'opération ni étape de ré-authentification frontend artificielle.

- **Email** : saisie de la nouvelle adresse, sans demander mot de passe ou TOTP. L'interface invite à confirmer les liens reçus sur l'ancienne **et** la nouvelle adresse et distingue `user.email` de `user.new_email`. Un seul lien confirmé laisse le changement en attente. Si l'ancienne boîte est inaccessible, une récupération manuelle après vérification d'identité sera nécessaire ; aucun contournement automatique n'est proposé.
- **Mot de passe** : trois champs password requis — `Mot de passe actuel` (`autocomplete=current-password`), `Nouveau mot de passe` et `Confirmer le nouveau mot de passe` (`autocomplete=new-password`). Le nouveau mot de passe suit le minimum existant de 6 caractères, doit correspondre à la confirmation et différer de la saisie actuelle ; cette dernière comparaison ne vérifie pas le secret du compte. Supabase vérifie `current_password` côté serveur, avec garantie validée sur Cloud en [4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md). Pendant la requête, les champs et le bouton `Modifier le mot de passe` sont désactivés, y compris après remontage lié à Auth. Après réussite effective : `Mot de passe modifié.`, champs vidés et session conservée. Les erreurs Auth sont traduites sans texte brut et la saisie reste réutilisable après échec. Aucun nonce email, TOTP supplémentaire ni détournement de `Mot de passe oublié`.
- **Authenticator** : sous-bloc informatif secondaire sous le formulaire de mot de passe, avec séparation subtile. Il affiche le statut, par exemple `Authenticator configuré`, et le texte demandant de contacter un administrateur pour le modifier/remplacer. Aucun bouton, modale, remplacement automatique, enrollment, désactivation de la MFA obligatoire ou suppression de facteur depuis Profil.

Le moyen de contact final reste ouvert. Aucun formulaire support, adresse email support définitive, ticket ou procédure automatisée n'est ajouté. La récupération en cas de perte d'Authenticator reste administrative et manuelle.

Le callback `/auth/confirm-email-change` réutilise le traitement Auth existant. Après le premier lien, il affiche une invitation à terminer les deux confirmations, sans annoncer un changement définitif. Après le dernier lien, le service relit l'utilisateur Auth, termine uniquement la session technique du lien et affiche `Adresse email modifiée`, avec retour à la connexion sur la nouvelle adresse. Ce résultat est distinct de la confirmation d'inscription. Aucun paramètre sensible du callback ne reste dans l'URL. Ces écrans minimaux livrés en 4B.2 restent inchangés lors de l'intégration du formulaire Profil en 4C.

### Suppression du compte

Tout en bas de Profil, un lien ou une action sobre telle que `Supprimer mon compte` permet la suppression définitive. Une couleur d'alerte peut être utilisée avec un libellé explicite. **Aucun gros bloc ni libellé utilisateur `Zone dangereuse` n'est affiché** ; ce terme peut uniquement rester interne si utile.

Le parcours comporte au minimum, dans cet ordre :

1. une confirmation explicite expliquant le caractère définitif et les conséquences : compte, profil, préférences, collections possédées et leurs éléments/partages, accès reçus et exemplaires physiques supprimés ; les destinataires perdent l'accès aux collections disparues ;
2. la saisie du mot de passe actuel et d'un code Authenticator à six chiffres ; le serveur effectuera la ré-authentification et créera le challenge TOTP lors de l'appel final ;
3. une validation finale explicite avant destruction.

La confirmation distingue les données supprimées du catalogue global et des données d'autrui préservés. Une simple session ouverte ne suffit jamais. Le parcours permet l'annulation avant la validation finale et ne présente la suppression comme réussie qu'après son achèvement effectif.

La modal native livrée possède un titre et une description accessibles, un focus initial, un fond inerte natif et un bouclage explicite de Tab/Maj+Tab et une restitution du focus au bouton d'ouverture après fermeture. La case de conséquences conditionne Continuer ; les champs password et code à six chiffres acceptent les gestionnaires de mots de passe et le collage. Le bouton final est `Supprimer définitivement mon compte`, sans texte à recopier. Annuler, Retour, Échap et le clic hors modal sont disponibles avant l'envoi. Pendant l'appel final, tous les contrôles, la navigation SPA et le retour navigateur sont bloqués ; quitter/recharger la page déclenche la protection native du navigateur. La modal utilise un scroll interne sur petits écrans.

La [réalisation 4D.2](reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md) branche cette modal au [contrat final](05-ARCHITECTURE.md#suppression-du-compte--contraintes-dorchestration) existant : aucun contrôle d'identité serveur n'est simulé dans React. Un mauvais mot de passe ou TOTP ramène à la saisie avec focus sur le champ concerné et conséquences conservées. Un échec de révocation ou de suppression indique que le compte n'a pas été supprimé et exige une reconnexion. Réseau, timeout et réponse illisible sont présentés comme incertains, sans relance automatique. Seul `{ deleted: true }` provoque la purge Auth/cache et le retour à l'accueil avec confirmation ; un échec du nettoyage SDK secondaire ne transforme pas ce succès en échec.

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

- sans collection, conserver le CTA unique `Créer une collection personnalisée` du Dashboard ;
- dans une collection personnalisée vide, fournir une courte explication et proposer `Ajouter une carte` ;
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

Les confirmations sont réservées aux actions réellement sensibles, notamment la suppression d'une collection, le retrait d'un partage et la suppression du compte. Cette dernière suit le parcours renforcé défini dans [Profil](#suppression-du-compte), avec confirmation des conséquences, ré-authentification complète et validation finale.

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
- les textes définitifs des modales du Profil, ses intitulés de groupes et ses détails visuels, dans le respect des parcours validés ;
- le moyen de contact final pour demander un remplacement d'Authenticator et la forme exacte de son message d'information ;
- les dimensions, espacements, tailles typographiques et rayons exacts ;
- le design précis des boutons et formulaires de création du dashboard ;
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
