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

### Fondation graphique commune — 6F.1

Toute l'application utilise la même fondation graphite sombre et rouge MY., avant et après connexion. Un seul jeu de tokens sémantiques est défini dans `:root` ; les primitives partagées (champs, boutons, liens, focus et feedbacks) l'utilisent directement. Les variantes de composants ne répondent qu'à leur contexte.

| Rôle / token | Valeur |
| --- | --- |
| `--app-bg` | `#0E1014` |
| `--surface` / `--surface-raised` / `--surface-hover` | `#15181D` / `#1C2027` / `#242932` |
| `--border` / `--border-strong` | `#2B3039` / `#3A414C` |
| `--text` / `--text-muted` / `--text-subtle` | `#F5F7FA` / `#A6ADB7` / `#747D89` |
| `--brand` / `--brand-hover` | `#E22B35` / `#DC2731` |
| `--brand-soft` | `rgb(228 43 53 / 12%)` |
| `--on-brand` | `#FFFFFF` |
| `--success` / `--danger` | `#3FB950` / `#FF969B` |
| `--focus` | `var(--brand)` |
| `--overlay` | `rgb(0 0 0 / 72%)` |

Les rouges des boutons sont légèrement assombris par rapport à `#E42B35` pour préserver un contraste supérieur à 4,5:1 avec les petits libellés blancs, y compris au survol. Le rouge reste réservé aux actions principales, au focus et aux accents ponctuels. Les suppressions utilisent une surface graphite avec texte et bordure danger ; leurs libellés explicites restent indispensables.

Les champs et textarea partagent fond, texte, placeholder et focus. Leur bord inférieur utilise `--text-subtle` pour rester identifiable ; ce token n'atténue pas les informations importantes. Le focus conserve un contour net, un halo discret et les couleurs système en mode `forced-colors`. Les transitions courtes respectent `prefers-reduced-motion`.

Le header authentifié conserve logo à gauche, recherche centrale et menu utilisateur à droite, avec le responsive existant. Les shells public/Auth et authentifié partagent le même footer : `Conditions d’utilisation` et, à droite, `© 2026 · MY. · v{version applicative}`. Le copyright est secondaire et lisible, avec retour à la ligne si nécessaire ; la surface `--surface`, la séparation neutre et les espacements existants sont conservés. Sa hauteur suit le contenu, sans recouvrir les contrôles ni le FAB. Dialogs, menus et panneau Version utilisent `--surface-raised` ; leurs structures internes sont conservées. Les feedbacks génériques restent neutres, les erreurs utilisent `--danger` et la confirmation de copie de MY.ID utilise `--success`. Les accents déterministes des collections et les feedbacks de réorganisation sont conservés.

Dashboard et Collection exploitent le contenu du shell jusqu'à **1 520 px**, avec au moins **24 px de marge latérale**. Profil et Paramètres restent limités à **720 px**. Cette fondation ne restructure aucune de ces pages. Les pages publiques et Auth (homepage, connexion, inscription, récupération, confirmations et MFA) changent uniquement de palette : composition, dimensions, responsive, textes, illustration et parcours sont conservés. Le fond blanc du QR MFA reste dédié à sa lisibilité ; il ne constitue pas un second thème.

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

Depuis 6F.2, le titre `Collections` et un compteur discret regroupent les collections personnelles et partagées dans une seule grille adaptative. Le compteur apparaît uniquement après une lecture réussie, au singulier ou au pluriel. L'ordre retourné par l'unique lecture serveur est conservé, sans filtre ni tri supplémentaire. Le Dashboard dispose d'une largeur propre, supérieure à celle des pages Profil et Paramètres.

Sur mobile, le haut de page reste compact (`Collections` et le nombre). La recherche globale du header reste immédiatement disponible au-dessus de la liste ; son fonctionnement et sa structure ne changent pas. Aucune introduction ni hero ne précède les collections.

### Tuiles de collection

Les collections sont principalement présentées sous forme de cartes ou tuiles visuelles. Chaque tuile permet d'identifier au minimum :

- le nom de la collection ;
- son type ;
- son accès explicite `Personnelle` ou `Partagée · Lecture seule` ;
- sa progression sur tablette et desktop.

Dès lors qu'il s'agit d'une collection automatique, la tuile distingue `Automatique · Pokémon` de `Automatique · Extension`, face à `Personnalisée`. Le nom domine et peut revenir à la ligne sans troncature. La cible reste secondaire lorsqu'elle existe ; elle n'est pas répétée si elle est identique au nom.

La même tuile devient une ligne compacte sur mobile : nom, accès, type et cible utile, avec des espacements réduits. Barre de progression, nombres possédés/total et pourcentage y sont masqués, sans second composant ni duplication de données pour les lecteurs d'écran.

Les tuiles utilisent des surfaces sombres subtilement teintées, avec bordure et accent de la même famille chromatique. Une palette frontend sobre couvre corail, ambre, jaune chaud, vert, turquoise, bleu, violet et rose ; l'accent est repris par la progression. La couleur reste secondaire aux libellés et conserve un contraste suffisant. Son attribution est déterministe depuis le type et le nom de cible disponibles, avec repli sur l'identifiant stable de collection, également utilisé pour les collections personnalisées. Aucune table métier de couleurs par Pokémon ni donnée couleur en base n'est nécessaire. Un changement de nom de cible peut donc changer cet accent.

Le trait latéral coloré et la surface légèrement teintée gardent cette identité perceptible, y compris sur mobile, sur la fondation graphite 6F.1. La grille fluide adapte son nombre de colonnes à la largeur disponible.

Les tuiles personnelles et partagées sont entièrement des liens vers `/collections/:collectionId`, sans bouton imbriqué, accessibles au clavier avec un focus coloré visible. Sur les appareils compatibles, le hover renforce légèrement bordure et surface, avec une élévation de 2 px au maximum ; la réduction des mouvements supprime déplacement et transition.

Une seule grille de skeletons accompagne `Chargement des collections…`, avec des lignes compactes sur mobile. Le seul état vide est global : `Aucune collection pour le moment.` Aucun état vide par catégorie n'apparaît. L'erreur reste `Impossible de charger les collections. Veuillez réessayer.`, avec `Réessayer`, sans détail serveur ni compteur. Le feedback après changement de mot de passe est conservé.

### Progression

La progression existante reste directement visible sur tablette et desktop, sous une forme telle que :

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
Dashboard → FAB + → Nom → Création
```

La collection peut être créée vide. L'utilisateur y ajoute ensuite des variantes depuis le catalogue MY.

Le Dashboard propose un seul FAB rouge MY. carré de 56 px, avec un arrondi de 8 px, fixe en bas à droite, y compris sans collection. Lorsque le footer entre dans le viewport, le FAB remonte progressivement pour conserver au-dessus du footer le même espace qu'au-dessus du bas du viewport (24 px sur desktop, 16 px sur mobile, plus la safe area). Il ne recouvre jamais le footer. Son `+` porte le nom accessible `Créer une collection personnalisée`. Les safe areas et un espacement en bas du contenu préservent l'accès à la dernière collection. Le FAB reste sous les dialogs natifs. Il ouvre le dialog existant `Collection personnalisée` avec une courte explication et le champ Nom. Le Dashboard crée uniquement des collections personnalisées ; il ne propose ni choix automatique ni sélecteur Pokémon/Extension. Aucun accès détail fictif n'est présenté.

Le nom est validé avant envoi selon la règle existante, sans modifier la valeur saisie ni ses espaces. Les erreurs de nom apparaissent près du champ ; les erreurs générales restent dans le formulaire, sans détail technique. Pendant la création, un état d'attente empêche les doubles envois et la fermeture du dialog. Aucun nouvel essai automatique n'est effectué.

Annuler ou Échap avant envoi ferme sans confirmation ; le focus revient au déclencheur et la réouverture présente un formulaire vierge. Le dialog place initialement le focus sur le nom, garde le clavier à l'intérieur et rend le fond inerte. Après succès, il se ferme et le Dashboard relit ses collections depuis le serveur, sans navigation vers une page détail. Le FAB affiche `+ → ✓ → +` : une coche verte utilisant `--success` pendant deux secondes remplace le texte de succès visible. Une annonce masquée `Collection créée.` reste accessible via `role="status"`. Réouvrir le dialog remet immédiatement le FAB à `+` ; le timer est nettoyé à la réouverture, au démontage et au changement de compte. Ce feedback demeure local à l'interface, sans nouvel état métier.

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

La page livrée en 5D.1, modernisée en 6F.3, présente l'identité de la collection : nom dominant en `h1`, type (`Personnalisée`, `Automatique · Pokémon` ou `Automatique · Extension`) et cible automatique dans une ligne secondaire, progression compacte et mode d'accès. Elle reprend la famille chromatique de sa tuile, y compris l'état neutre `0 / 0`. Le lien `← Collections` mène toujours à `/dashboard`, dans tous les états. Les collections partagées portent le libellé discret `Partagée · Lecture seule`, avec la progression du propriétaire et sans menu propriétaire. La Phase 5D.2 ajoute le renommage et la suppression des collections personnelles, personnalisées comme automatiques.

L'identité est intégrée directement au fond principal MY., sans grande carte teintée. L'overview compact conserve le nom, les métadonnées secondaires et une progression de largeur contenue, séparés de la recherche par un filet discret. `collectionPresentation()` définit une seule fois `--collection-accent`, `--collection-surface` et `--collection-border` sur le conteneur Collection : overview, progression, FAB, focus contextuel et détail Version héritent du même accent. Le nom peut revenir à la ligne ; son en-tête flexible accueille le bouton contextuel à trois carrés en haut à droite pour le propriétaire, y compris sur mobile.

**Réalisation 6F.3 :** le propriétaire dispose d'un FAB `+`, carré de 56 px avec rayon de 8 px, fixé en bas à droite dans la couleur de sa collection. Le hook commun `useFooterAwareFab` partage avec le Dashboard la mesure du footer, les observations de taille et les événements scroll/resize, avec nettoyage au démontage. L'espacement responsive et les safe areas sont communs ; le FAB remonte au-dessus du footer visible. Une réserve en bas de page permet de dégager la dernière ligne. Le partage n'a aucun FAB.

Le chargement conserve le shell authentifié. Une collection absente, inaccessible, dont le partage a été retiré, ou un identifiant manifestement invalide présente le même état : `Collection indisponible` puis `Cette collection n’existe pas ou vous n’y avez plus accès.` Une erreur temporaire propose `Réessayer`, sans détail serveur. Le titre du document devient `Nom de la collection — MY.` après chargement ; le `h1` persistant reçoit le focus à la navigation, sans le reprendre aux mises à jour asynchrones.

La première liste fonctionnelle est branchée en Phase 6B.3 sous l'overview : poignée dédiée au propriétaire, image compacte, informations et bouton Exemplaires. Le partage conserve uniquement la consultation des exemplaires et notes du propriétaire. Image indisponible/erreur : `card-placeholder.webp` commun ; carte non possédée : image grisée et textes atténués, contrôles actifs, état accessible masqué. Aucun badge visible de possession ni compteur d'exemplaires. La Phase 6C.3 ajoute les repères `Auto` / `Perso` uniquement dans les collections automatiques en Liste et le menu de retrait uniquement sur les éléments personnels du propriétaire. Liste, Cartes et Classeur ainsi que leur sélecteur sont fonctionnels depuis 7B.3, avec préférences du viewer, contenu et ordre autoritatifs communs. Classeur continu livré : pages sombres et pochettes, sans reorder ni actions métier directement sur les pochettes ; les contrôles Paramètres restent futurs. Les 23 migrations Local/Cloud sont alignées après le checkpoint manuel exécuté par le propriétaire. Voir le [statut DB Phase 6](06-DATABASE.md#phase-6--clôture-et-alignement).

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

Livrée en 6D.1 au-dessus du contenu, la barre `Rechercher dans la collection…` partage la toolbar avec le sélecteur Liste/Cartes depuis 7B.2 ; l'ajout est accessible par le FAB propriétaire. La recherche reste présente en partage lecture seule, sans action d'ajout ni mutation propriétaire.

Le filtre est local, immédiat, sans requête réseau : nom français de carte, nom complet d'Extension, abréviations FR/source, noms FR/source de série, numéro et version. Casse, accents, ligatures françaises, espaces et ponctuation courante sont normalisés ; `28/73`, `ASC`, `SL3.5` restent utilisables. Chaque terme doit correspondre à un champ (**AND** multi-champs), sans score ni tri ; l'ordre backend est conservé, y compris après actualisation.

Dès que le champ contient du texte, une croix interne (`aria-label="Effacer la recherche"`) restaure immédiatement la liste complète et rend le focus au champ. Aucun bouton texte sous la liste. Une collection non vide sans résultat affiche exactement `Aucune carte ne correspond à cette recherche.` ; une collection réellement vide conserve son message propre.

Si le filtre masque une partie de la collection, les poignées de réorganisation sont visuellement indisponibles avec l'indication masquée `Effacez la recherche pour réorganiser la collection.`, liée par `aria-describedby`. Aucun message volumineux n'est ajouté au flux. Une recherche correspondant à toutes les cartes ne bloque pas la réorganisation. Effacer rétablit les règles habituelles ; consultation, exemplaires et retrait Perso autorisé restent disponibles.

### Recherche dans le catalogue pour ajouter une carte

La recherche interne filtre uniquement la collection courante. Elle reste distincte de la recherche globale du header (navigation) et de la recherche de sélection utilisée pour ajouter une variante.

La recherche d'ajout livrée couvre carte/Pokémon, numéro/fraction, Extension, abréviations, identifiants pertinents et variante. Casse, accents, ligatures et ponctuation sont normalisés, avec AND multi-termes. **Elle ne recherche pas le nom de série**, contrairement au filtre interne.

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

Depuis 7B.3, Liste, Cartes et Classeur sont disponibles. Le sélecteur iconographique possède labels explicites, cibles de 44 px et état `aria-pressed`. Changer de vue conserve route, recherche et contenu chargé. Chaque choix explicite persiste seulement le dernier mode du viewer. Classeur ajoute directement format et Page [N] / total à sa barre contextuelle.

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

La zone principale de chaque ligne (image, nom, abréviation d'Extension, numéro et version) ouvre le détail contextuel. La poignée de réorganisation, le raccourci Exemplaires et le menu `…` restent des interactions séparées ; la ligne entière n'est pas cliquable.

**Présentation 6F.3 :** lignes légères sans bordure de tableau, rayon discret et survol doux limité à la zone principale. Image compacte intégrée, informations hiérarchisées et actions discrètes ; sur mobile, espaces resserrés et cibles tactiles de 44 px conservées. Les cartes manquantes restent atténuées avec contrôles actifs ; leur état est annoncé par du texte masqué, sans libellé visible Possédée/Manquante dans la liste.

Le reorder conserve ses capteurs souris/tactile/clavier et ses annonces DnD. Seule la poignée de l'item déplacé passe à un indicateur discret d'attente, puis à une coche verte pendant deux secondes après mutation et relectures autoritatives réussies. L'ordre exact du drop est conservé uniquement pour le rendu pendant l'attente, sans écriture optimiste dans le cache ni calcul de positions. La confirmation attend aussi les notifications de lecture vers React pour éviter une frame sur les anciennes props. Une nouvelle séquence autoritative ou une vue filtrée remplace immédiatement cet ordre transitoire ; succès et échec le suppriment. Le backend reste la source d'ordre permanente. Les annonces de déplacement restent dans une zone `aria-live` masquée, sans paragraphe de succès ni pending dans le flux. Le timer est nettoyé au nouveau déplacement, à la navigation et au démontage. Les erreurs sûres restent visibles au-dessus de la liste, dans un bloc qui reste à portée pendant le scroll, avec `Actualiser l’ordre` lorsque nécessaire.

### Vue Cartes

La vue Cartes privilégie les illustrations et affiche les variantes sous forme de grille. Chaque élément doit permettre d'identifier :

- l'image ;
- la variante ;
- l'état possédée ou manquante ;
- les informations essentielles.

Le nombre de colonnes s'adapte à l'écran : pistes d'au moins 168 px sur desktop, proches de 180 px aux largeurs usuelles, et deux colonnes sur mobile jusqu'à 600 px. Image dominante au ratio Liste, aucun cadre ou footer excessif. Sous l'image : `Nom · Abréviation Extension · N°`, puis variante toujours visible (fallback `Variante indisponible` si absente). Textes longs tronqués sur une ligne, contenu complet accessible et en infobulle. Les résultats de recherche compactent la grille selon le même filtre AND et l'ordre relatif backend.

La zone principale ouvre le détail Variante Phase 6 ; Exemplaires et menu `…` restent indépendants, avec menu seulement pour retrait manuel autorisé. En partage, détail et consultation des exemplaires du propriétaire réel restent accessibles sans mutation, menu ni espace de drag.

Le propriétaire déplace depuis une zone superposée aux 44 px hauts de l'image, sans fond, bordure, en-tête ou espace ajouté au repos. L'indicateur apparaît seulement au survol de cette zone, au focus ou pendant déplacement. Les capteurs Phase 6 gèrent souris, appui tactile prolongé (scroll avant appui annulant le drag), Espace/flèches/Échap et annonces accessibles. Après sauvegarde et relectures autoritatives, une coche verte temporaire confirme le déplacement sans toast ni changement de dimensions. Erreurs et récupération restent celles de Liste. Aucun handle si le filtre masque des cartes ; un filtre correspondant à tout le contenu conserve le reorder. Animations réduites selon `prefers-reduced-motion`.

#### Variantes partageant une image

Lorsque plusieurs variantes utilisent la même image TCGdex, elles doivent rester clairement différenciables grâce à une indication visible, par exemple Normal, Reverse, Holo, Staff ou une autre caractéristique pertinente.

Cette différenciation ne doit jamais dépendre uniquement de l'image.

#### Cartes possédées et manquantes

Une carte manquante reste visible et identifiable sans perdre la lisibilité de ses informations, avec image désaturée et atténuée.

Une carte possédée conserve son rendu normal. Les contrôles secondaires restent séparés et ne masquent pas l'illustration.

Le traitement livré réutilise Liste : image désaturée et atténuée, texte atténué, état annoncé par texte masqué sans badge visible. Contrôles utilisables selon les droits ; le rendu normal revient dès que les données de possession autoritatives changent.

### Vue Classeur

La vue Classeur est un élément fort de l'identité de MY. Elle doit évoquer un véritable classeur physique plutôt qu'une simple grille paginée, tout en restant moderne, claire, lisible, pratique et rapide.

#### Pages et formats

Chaque emplacement évoque une pochette sur une page sombre, légèrement contrastée, avec profondeur et transparence discrètes. Formats V1 fonctionnels exactement `2x2`, `3x3`, `4x3` ; défaut `3x3` ; 4, 9, 12 emplacements dérivés. Le popover compact montre grille et libellé de chaque format. Résolution : override viewer + collection → défaut du compte → `3x3` ; retour au défaut supprime l'override. La lecture spécifique n'est activée qu'en Classeur.

Un changement effectif confirmé de format reconstruit toute la pagination depuis le contenu chargé, revient page 1 et efface recherche, occurrence et halo. Aucune modification de structure ou relecture du contenu. Supprimer un override dont le format effectif reste identique conserve le contexte.

Carte possédée : rendu normal. Variante manquante : vraie carte identifiable, désaturée et atténuée, état annoncé dans son nom accessible. Image absente/erreur : WebP commun des cartes. Dernière page partielle : véritables pochettes vides, sans carte ni placeholder. Pour chaque ligne, colonne impaire : pointillés haut/bas/gauche, ouverture à droite ; colonne paire : haut/bas/droite, ouverture à gauche. Aucune bordure fermée systématique.

#### Navigation

La vue affiche clairement :

- la page actuelle ;
- le nombre total de pages ;
- un contrôle précédent ;
- un contrôle suivant.

Desktop/tablette large (960 px et plus) : page 1 seule à droite, ouvertures 2–3, 4–5 ; dernière page paire seule à gauche. Reliure centrale discrète ; deux pages distinctes. Mobile/largeur insuffisante : une seule page, format strictement conservé. La page dimensionne les cartes (2×2 plus grandes, 4×3 plus petites), avec ratio conservé et largeur maximale raisonnable.

Côtés extérieurs : précédent/suivant sans boucle, focus visible et labels annoncés. Flèches clavier seulement quand le Classeur lui-même est focalisé ; jamais depuis recherche, page, popover, carte ou dialogue. Mobile : swipe horizontal, scroll vertical et tap détail préservés. Numéro direct validé (entier de 1 au total réel), valeur invalide restaurée ; desktop N rejoint l'ouverture contenant N. Numéro de page en coin inférieur extérieur selon sa parité. Transitions horizontales/fondu courts, jamais 3D ni bloquants ; `prefers-reduced-motion` conserve le repère sans animation. Collection vide : état vide existant, aucune page artificielle.

#### Organisation continue

Le Classeur V1 est **continu uniquement** : les variantes suivent l'ordre autoritatif de la collection et les pages se remplissent successivement. Aucun regroupement par série, bloc, ère, Extension, Pokémon ou catégorie. Pagination calculée frontend, sans table `binder_pages`.

#### Recherche Classeur

La recherche livrée en 7B.3 réutilise exactement le moteur Collection (normalisation, champs, AND, ordre réel), sans fetch. Les pochettes/pages restent en place : correspondances visibles, autres variantes fortement atténuées, vides inchangées. Nouvelle recherche effective avec résultats : première occurrence et saut unique vers sa page/ouverture, halo doux à l'accent Collection pendant 1,4 s. Navigation libre ensuite. Compteur et flèches d'occurrences sans boucle ; même page : seul le halo change. Aucun résultat : page conservée, toutes les variantes atténuées, état discret, aucune occurrence. Effacement : page conservée, compteur et halo retirés.

## Détail d'une variante

**Réalisation 6E.2 depuis la liste Collection :** le bouton `Voir le détail de {nom}` ouvre un panneau natif modal à droite, large de 620 px au maximum et haut de `100dvh`, avec la collection perceptible derrière le backdrop sombre. Jusqu'à 640 px, le même panneau occupe tout l'écran. Son contenu défile indépendamment ; la croix seule reste accessible en haut à droite, hors du scroll interne et sans en-tête visuel. Aucun changement d'URL, de recherche interne, de résultats ou d'ordre ; le scroll de collection est conservé. Le focus est contenu dans le panneau et rendu au déclencheur encore présent, sans déplacement du scroll. `Escape` ferme le détail ou revient du formulaire à la liste ; pendant une mutation et sa relecture, fermeture et double soumission sont bloquées. Aucune navigation Précédente/Suivante ni swipe.

Le catalogue provient uniquement de `getVariantDetail(variantId)` (6E.1), avec chargement immédiat, erreur sûre et bouton `Réessayer`. Le nom FR (ou `Nom indisponible`), la grande image, la version et les métadonnées disponibles sont affichés sans ID interne. Extension et abréviations combinent les valeurs différentes en `FR (source)` ; la série privilégie le FR. Les valeurs vides sont omises, la taille standard est masquée, les autres valeurs catalogue restent intactes. `Date de sortie` affiche la date effective en français sans décalage de jour ni provenance technique.

**Composition 6F.3 corrigée :** le hero associe image raisonnable, nom visuellement principal, version, Extension et numéro. Le nom réel de la carte nomme aussi le dialogue via un titre masqué, avec le fallback stable `Informations de la carte` pendant le chargement ou sans nom disponible. Aucune barre de titre générique n'est visible. Les métadonnées principales (Extension, abréviation, série, numéro, rareté, catégorie, date de sortie) forment une grille compacte à labels discrets. Le groupe `Caractéristiques` apparaît uniquement avec un sous-type, une finition, un stamp non vide ou une taille non standard ; il peut alors inclure le type une seule fois. Le type seul ne crée aucun groupe. Sur mobile, image réduite et grille lisible conservent l'accès aux exemplaires dans le même scroll interne, fermeture visible et safe areas respectées.

`Mes exemplaires` (propriétaire) ou `Exemplaires` (partage) est intégré directement : liste, notes dépliables, ajout, modification et suppression confirmée restent dans le même panneau, sans modal imbriquée. `Possédée` / `Manquante` dérive des exemplaires relus du propriétaire réel. Le partage n'affiche aucune action d'écriture. Le raccourci Exemplaires de la ligne conserve son dialogue direct. Aucun ajout/retrait structurel de collection n'est proposé dans le détail.

Depuis 6F.3, cette section se distingue du catalogue par l'espace et une surface légère. L'état de possession est compact et conserve toujours son texte explicite. `PhysicalCopiesContent` reste la source commune de consultation et de gestion ; aucun état de possession optimiste supplémentaire n'est introduit.

Liste, Cartes et Classeur Collection réutilisent ce **même détail contextuel**, sans navigation ni fetch dédié au renderer. Les futures fiches Carte catalogue le réutiliseront également. Classeur ne propose aucun reorder, raccourci Exemplaires, menu ou mutation directement sur les pochettes.

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

Le formulaire actuel contient un nom facultatif et un champ `État / note (facultatif)` limité à 750 caractères Unicode. Les espaces et retours à la ligne utiles sont conservés ; une note vide devient `NULL`. Sans nom, la liste affiche `Exemplaire 1`, `Exemplaire 2`… ; sans exemplaire, `Aucun exemplaire.`. Les notes se déplient individuellement, y compris en lecture seule. Aucun champ structuré de grading n'est présent dans ce modèle.

### Suppression d'un exemplaire

La suppression d'un exemplaire doit être clairement distincte du retrait d'une carte d'une collection et de la suppression d'une variante du catalogue.

Supprimer le dernier exemplaire ne retire pas la variante de la collection ; elle redevient simplement manquante.

Les exemplaires demeurent globaux au compte, comme défini dans `03-DATA-MODEL.md`, même lorsqu'une variante est visible dans plusieurs collections.

## Ajout et réorganisation des cartes

### Collection personnalisée

Une collection personnalisée propose une action claire :

`Ajouter une carte`

Livrée en 6C.3, cette action reste disponible à vide pour le propriétaire. Depuis 6F.3, elle utilise le FAB `+` décrit dans l'overview Collection, avec les mêmes états focus/hover et le même parcours. Elle ouvre une modal native unique à deux étapes, distincte de la recherche du header :

1. **Recherche** : champ vide et focalisé à l'ouverture, aucun résultat initial ; temporisation de 300 ms, aucune requête sans lettre/chiffre utile, aucun seuil de trois caractères. États de chargement, erreur avec réessai et résultat vide explicites. Chaque résultat reste un bouton entier activable au clavier, avec image (ou placeholder) de 36 px de large au ratio conservé. Comme la liste Collection, il affiche au plus deux lignes principales : `Nom · Abréviation Extension · Numéro`, puis `Version` uniquement si présente. Les valeurs absentes ne produisent aucun séparateur orphelin ; le numéro reste exactement `local_id`. Les deux abréviations brutes sont exposées séparément : `set_abbreviation_fr` et `set_abbreviation`. La présentation commune affiche `HER (ASC)` si elles diffèrent, la valeur unique si une seule existe ou si elles sont identiques, et aucun segment si les deux sont absentes. Aucune valeur n'est reconstruite depuis le nom du set. Les deux restent recherchables, notamment avec le nom (`Pikachu ASC`). `set_name_fr` reste disponible dans les données, sans ligne principale dédiée. Dans une collection automatique, `Auto` / `Perso` reste discret à côté du titre. Une sélection ne déclenche aucune écriture. `Afficher plus` charge les pages suivantes de 20, concaténées et dédupliquées par ID de variante ; une nouvelle saisie remet les résultats et l'offset à zéro.
2. **Confirmation** : variante sélectionnée, radios `Fin` (défaut) / `Début`, retour aux résultats et bouton `Ajouter à la collection`. Succès confirmé : fermeture et actualisation autoritative du contenu, de l'ordre, de l'overview et du Dashboard. En 6F.3, le FAB passe de `+` à une coche verte pendant deux secondes, puis revient à `+` ; le focus lui est rendu sans déplacer le scroll. `Carte ajoutée.` reste annoncé dans un statut masqué, sans succès visible dans le flux. Le timer est nettoyé au démontage, à la navigation et à une nouvelle action. Un doublon garde la sélection ouverte avec `Cette version est déjà dans votre collection.` Une variante devenue indisponible affiche `Cette version n’est plus disponible.` et permet le retour aux résultats.

Escape/Annuler ferment hors mutation ; Tab reste dans la modal, le focus revient au déclencheur. Une réouverture repart d'un état vierge. Pendant l'écriture, doubles soumissions et réorganisation concurrente sont bloquées. Après conflit ou résultat incertain, un message sûr et une actualisation remplacent toute supposition locale sur le résultat. Aucun exemplaire physique n'est créé pendant l'ajout.

L'interaction exacte de réorganisation reste à cadrer pour desktop et mobile : aucun choix final de drag & drop, poignée, boutons ou geste tactile n'est fixé.

### Collection automatique

Une collection automatique propose également au propriétaire l'action `Ajouter une carte` et le même parcours 6C.3. La variante choisie dans le catalogue devient alors un élément manuel.

Les éléments automatiques et manuels sont tous librement réordonnables par le propriétaire. L'ordre canonique MY. initialise la collection, puis sert de référence système. Les éléments automatiques restent non supprimables manuellement tant qu'ils appartiennent à la structure automatique ; les éléments manuels peuvent être ajoutés, retirés et déplacés librement. La possibilité de déplacer un automatique est validée ; l'interaction UX exacte reste ouverte, comme pour les collections personnalisées.

Chaque ligne d'une collection automatique affiche discrètement `Auto` pour `origin='automatic'` ou `Perso` pour `origin='manual'`, avec un libellé d'origine accessible. Les valeurs DB/code restent `automatic` / `manual`. Aucun indicateur d'origine dans une collection personnalisée.

Le menu `…` des seuls éléments manuels du propriétaire propose `Retirer de la collection`. La confirmation affiche `Retirer cette carte de la collection ?`, puis `Cette carte sera retirée de la collection. Vos exemplaires seront conservés.` et les actions `Annuler` / `Retirer`. Le succès ferme la confirmation et actualise contenu, ordre, overview et Dashboard ; exemplaires et notes restent inchangés. Aucun menu de retrait sur Auto ni en lecture seule, aucun bouton Ajouter dans le partage. Retirer un élément manuel et supprimer un exemplaire physique restent deux actions distinctes.

En 6F.3, la disparition autoritative de la ligne suffit comme feedback visuel après retrait. `Carte retirée. Vos exemplaires sont conservés.` reste annoncé dans une zone de statut masquée. Les erreurs restent visibles et actionnables.

## Mise à jour d'une collection automatique

Une mise à jour disponible doit être clairement visible sans devenir intrusive. Elle peut être signalée sur la tuile du dashboard, dans la collection ou au moyen d'un indicateur ou bandeau discret.

Avant toute application, l'utilisateur ouvre un résumé qui explique les changements, notamment les nouvelles cartes, les nouvelles variantes et les autres ajouts pertinents.

L'action finale est explicite :

`Mettre à jour la collection`

La collection n'est jamais mise à jour silencieusement. L'utilisateur reste maître de l'application et ne doit pas subir plusieurs confirmations successives après qu'un résumé clair lui a été présenté.

La mise à jour préserve autant que possible l'ordre personnalisé des éléments automatiques et manuels, y compris lors d'une conversion manuel → automatique, sans retour arbitraire à l'ordre canonique. Le placement des nouveaux éléments et la stratégie de préservation/ancrage restent à cadrer en Phase 8.

## Partage

Une collection appartenant à l'utilisateur propose une action `Partager`. Le propriétaire saisit l'identifiant public MY. du destinataire et, lorsque possible, l'interface identifie clairement l'utilisateur concerné avant validation.

Après confirmation du propriétaire, le partage est directement actif et la collection apparaît dans la grille unifiée du Dashboard avec le statut `Partagée · Lecture seule`. Il n'existe ni invitation, ni acceptation, ni refus. Le propriétaire peut consulter les personnes ayant accès et retirer un partage ; le destinataire peut retirer son propre accès. Ce retrait conserve la collection, ses éléments et les exemplaires. L'interface de création/gestion des partages et la résolution limitée du destinataire restent prévues en Phase 9.

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

La hiérarchie livrée est **Identité MY. → Adresse email → Sécurité du compte → Zone sensible**. L'action discrète `Supprimer mon compte`, livrée en 4D.2, suit la section Sécurité tout en bas de page.

**Réalisation Phases 4C et 4D.1 :** trois sections sobres — Identité MY., Adresse email, Sécurité du compte — reprennent le shell, Poppins et les styles existants, avec des contours discrets et des espacements réguliers. L'identifiant apparaît sous le libellé `MY.ID`, dans un input texte en lecture seule de hauteur standard, aligné avec le bouton de copie à droite ; les adresses peuvent revenir à la ligne. Les données absentes ont un message explicite, sans valeur de remplacement inventée. Les retours sont accessibles. Le `h1` unique conserve le focus de navigation géré par `AppRoutes`. Les [rapports 4C](reports/2026-09-14-PHASE4C-PROFILE.md) et [4D.1](reports/2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) consignent les contrôles responsive et clavier.

**Modernisation 6F.4 :** le titre `Profil` et son introduction discrète précèdent un contenu centré, limité à 1000 px. Sur desktop, Identité MY. et Adresse email occupent deux colonnes sur des surfaces graphite sobres. La sécurité forme une section distincte : Mot de passe et Authenticator ont leurs propres titres et une séparation fine, sans cartes imbriquées. Les formulaires restent limités à 420 px. Jusqu'à 760 px, les groupes passent en une colonne ; sur mobile, les champs et boutons de formulaire utilisent la largeur disponible. Les actions tactiles ont une hauteur minimale de 44 px. Aucun hero ni raccourci Paramètres n'est ajouté.

Le formulaire email est conservé : validation native de l'adresse, refus de l'adresse courante, désactivation pendant l'envoi, message d'erreur réutilisant Auth et possibilité de réessayer. L'adresse actuelle précède la saisie de la nouvelle adresse et l'explication des deux confirmations. L'attente issue de `user.new_email` reste visible après le rechargement Auth, distincte de l'adresse actuelle, sans supposer quelle confirmation manque. `Changement en attente` et la demande envoyée sont des informations compactes visibles, sans style d'erreur. Les erreurs, feedbacks de mot de passe et états indisponibles restent visibles. La suppression dispose de son action séparée après la sécurité.

### Identité MY.

La page affiche l'email actuel, l'identifiant public MY. et la date de création du compte, par exemple `Membre depuis le 9 septembre 2026`. Cette date provient du compte Supabase Auth, selon le [modèle](03-DATA-MODEL.md#utilisateur-et-profil-my), sans duplication dans le profil.

L'identifiant, généré automatiquement, unique et immuable au format `MY-XXXXX-XXXXX-XXXXX-XXXXX`, apparaît dans un **champ en lecture seule**, avec **à droite un bouton de copie représentant deux feuilles/pages superposées**. Le rôle de cet identifiant de partage reste compréhensible. Le bouton copie directement sa valeur complète dans le presse-papiers.

Le champ possède le libellé exact `MY.ID` et reste sélectionnable ; le bouton carré de 44 px, sur surface graphite avec bordure discrète, est accessible au clavier, avec un focus visible et un nom accessible tel que `Copier l'identifiant MY.`. Après une copie réussie, le bouton affiche une coche avec un accent vert pendant 2,2 secondes, puis retrouve son pictogramme initial. Une région de statut masquée visuellement annonce le succès, sans déplacer le focus ni ajouter de message visuel séparé. Si la copie échoue, le texte d'aide du champ explique le repli par sélection/copie manuelle, également annoncé. La date d'inscription reste secondaire, sous l'identifiant. La couleur n'est jamais le seul indicateur ; les transitions discrètes et l'état pressé respectent la réduction des mouvements.

### Sécurité du compte

Les actions de changement d'email et de mot de passe partent directement de Profil pour un utilisateur autorisé en `aal2`. Leurs contrôles correspondent aux protections natives Supabase : aucun nouveau challenge TOTP propre à l'opération ni étape de ré-authentification frontend artificielle.

- **Email** : saisie de la nouvelle adresse, sans demander mot de passe ou TOTP. L'interface invite à confirmer les liens reçus sur l'ancienne **et** la nouvelle adresse et distingue `user.email` de `user.new_email`. Un seul lien confirmé laisse le changement en attente. Si l'ancienne boîte est inaccessible, une récupération manuelle après vérification d'identité sera nécessaire ; aucun contournement automatique n'est proposé.
- **Mot de passe** : trois champs password requis — `Mot de passe actuel` (`autocomplete=current-password`), `Nouveau mot de passe` et `Confirmer le nouveau mot de passe` (`autocomplete=new-password`). Le nouveau mot de passe suit le minimum existant de 6 caractères, doit correspondre à la confirmation et différer de la saisie actuelle ; cette dernière comparaison ne vérifie pas le secret du compte. Supabase vérifie `current_password` côté serveur, avec garantie validée sur Cloud en [4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md). Pendant la requête, les champs et le bouton `Modifier le mot de passe` sont désactivés, y compris après remontage lié à Auth. Après réussite effective : `Mot de passe modifié.`, champs vidés et session conservée. Les erreurs Auth sont traduites sans texte brut et la saisie reste réutilisable après échec. Aucun nonce email, TOTP supplémentaire ni détournement de `Mot de passe oublié`.
- **Authenticator** : sous-bloc informatif secondaire à côté du formulaire de mot de passe sur desktop, puis dessous sur mobile, avec séparation subtile. Son titre et son statut encadré, par exemple `Authenticator configuré`, sont immédiatement identifiables ; le statut provient uniquement des facteurs vérifiés réels. Il conserve le texte demandant de contacter un administrateur pour le modifier/remplacer. Aucun bouton, modale, remplacement automatique, enrollment, désactivation de la MFA obligatoire ou suppression de facteur depuis Profil.

Le moyen de contact final reste ouvert. Aucun formulaire support, adresse email support définitive, ticket ou procédure automatisée n'est ajouté. La récupération en cas de perte d'Authenticator reste administrative et manuelle.

Le callback `/auth/confirm-email-change` réutilise le traitement Auth existant. Après le premier lien, il affiche une invitation à terminer les deux confirmations, sans annoncer un changement définitif. Après le dernier lien, le service relit l'utilisateur Auth, termine uniquement la session technique du lien et affiche `Adresse email modifiée`, avec retour à la connexion sur la nouvelle adresse. Ce résultat est distinct de la confirmation d'inscription. Aucun paramètre sensible du callback ne reste dans l'URL. Ces écrans minimaux livrés en 4B.2 restent inchangés lors de l'intégration du formulaire Profil en 4C.

### Suppression du compte

Tout en bas de Profil, la section légère `Zone sensible` sépare la suppression du reste du compte : bordure danger discrète, rappel du caractère définitif et bouton `Supprimer mon compte` avec accent rouge mesuré. Aucun gros bloc rouge ni libellé utilisateur `Zone dangereuse` n'est affiché.

Le parcours comporte au minimum, dans cet ordre :

1. une confirmation explicite expliquant le caractère définitif et les conséquences : compte, profil, préférences, collections possédées et leurs éléments/partages, accès reçus et exemplaires physiques supprimés ; les destinataires perdent l'accès aux collections disparues ;
2. la saisie du mot de passe actuel et d'un code Authenticator à six chiffres ; le serveur effectuera la ré-authentification et créera le challenge TOTP lors de l'appel final ;
3. une validation finale explicite avant destruction.

La confirmation distingue les données supprimées du catalogue global et des données d'autrui préservés. Une simple session ouverte ne suffit jamais. Le parcours permet l'annulation avant la validation finale et ne présente la suppression comme réussie qu'après son achèvement effectif.

La présentation 6F.4 conserve les trois étapes et le texte discret visible `Étape X sur 3`. Le dialog graphite est limité à 560 px et à la hauteur disponible, avec scroll interne sur petit écran. `Continuer` et la reconnexion utilisent une action primaire normale ; `Retour` et `Annuler` sont secondaires. Seule l'action finale `Supprimer définitivement mon compte` utilise le style danger. La conséquence concernant les exemplaires suit les données actuelles : `Vos exemplaires physiques, leurs noms et leurs notes seront supprimés.` Aucun champ structuré de gradation n'est mentionné.

La modal native livrée possède un titre et une description accessibles, un focus initial, un fond inerte natif et un bouclage explicite de Tab/Maj+Tab et une restitution du focus au bouton d'ouverture après fermeture. La case de conséquences conditionne Continuer ; les champs password et code à six chiffres acceptent les gestionnaires de mots de passe et le collage. Le bouton final est `Supprimer définitivement mon compte`, sans texte à recopier. Annuler, Retour, Échap et le clic hors modal sont disponibles avant l'envoi. Pendant l'appel final, tous les contrôles, la navigation SPA et le retour navigateur sont bloqués ; quitter/recharger la page déclenche la protection native du navigateur. La modal utilise un scroll interne sur petits écrans.

La [réalisation 4D.2](reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md) branche cette modal au [contrat final](05-ARCHITECTURE.md#suppression-du-compte--contraintes-dorchestration) existant : aucun contrôle d'identité serveur n'est simulé dans React. Un mauvais mot de passe ou TOTP ramène à la saisie avec focus sur le champ concerné et conséquences conservées. Un échec de révocation ou de suppression indique que le compte n'a pas été supprimé et exige une reconnexion. Réseau, timeout et réponse illisible sont présentés comme incertains, sans relance automatique. Seul `{ deleted: true }` provoque la purge Auth/cache et le retour à l'accueil avec confirmation ; un échec du nettoyage SDK secondaire ne transforme pas ce succès en échec.

## Paramètres et préférences de vues

La page Paramètres est accessible depuis le menu utilisateur et distincte de la page Profil. Elle reste volontairement minimale en Phase 6, sans modernisation fonctionnelle. La section **Affichage** prévue en Phase 7 proposera :

| Préférence | Choix |
|---|---|
| Vue catalogue par défaut | Liste, Cartes, Dernier choix utilisé |
| Vue collection par défaut | Liste, Cartes, Classeur, Dernier choix utilisé |
| Format Classeur par défaut | `2x2`, `3x3`, `4x3` ; initialement `3x3` |

Une vue fixe s'applique à chaque nouvelle ouverture. `Dernier choix utilisé` mémorise le dernier mode explicitement sélectionné pour les prochaines consultations. Le choix catalogue est global à Pokémon, Extension et Carte ; le choix de mode collection est global aux collections, sans mémorisation par collection.

Les deux préférences et leurs derniers modes sont persistés pour le compte. Initialement, `Dernier choix utilisé` reprend Liste, jusqu'au premier choix explicite. Les préférences d'un propriétaire ne s'imposent pas au destinataire d'un partage : ce dernier utilise ses propres choix de consultation.

`binder_default_format` est global au compte. Un format explicitement choisi pour une collection devient un override du viewer (utilisateur + collection). Absence = héritage dynamique ; « utiliser le format par défaut » supprime l'override. Résolution : **override → global → `3x3`**. Propriétaire et lecteur autorisé ont leurs préférences indépendantes. Persistance livrée en 7A.3, contrôles Classeur livrés en 7B.3. Paramètres demeure minimal ; thème et réglages Premium restent futurs.

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
- l'apparence exacte des cartes possédées et manquantes ;
- les badges exacts de variantes ;
- les évolutions visuelles ultérieures du classeur, au-delà des pages/pochettes et transitions légères livrées en 7B.3 ;
- les éventuelles animations de cartes ;
- le comportement précis du drag and drop et son alternative mobile ;
- la largeur et le design exacts du panneau latéral ;
- le contenu exact d'une ligne de la vue Liste ;
- le contenu exact d'une tuile de la vue Cartes ;
- les dimensions du header et du champ, l'icône du menu utilisateur et le design final des Paramètres ;
- la palette des suggestions, le mécanisme de couleur Pokémon et les animations du dropdown ;
- les colonnes Liste et tuiles Cartes du catalogue, le choix précis des Cartes spéciales illustratives ;
- le seuil du swipe et les animations précédente/suivante ;
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
