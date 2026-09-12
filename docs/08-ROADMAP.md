# Roadmap de MY.

## Rôle du document

Ce document constitue la source de vérité concernant la **roadmap globale de MY.** : l'état, l'ordre et le périmètre des grandes phases du projet, jusqu'à la V1 puis au-delà.

La roadmap reste volontairement **macro**. Chaque phase représente un ensemble fonctionnel cohérent. Le découpage opérationnel est défini au moment de sa réalisation ; les sous-phases de développement ne sont pas documentées ici.

Elle permet de voir ce qui est terminé, la prochaine étape et les orientations futures, sans remplacer les spécifications détaillées :

- [Vision générale](00-VISION.md) et [fonctionnalités](01-FEATURES.md) pour les décisions produit ;
- [Modèle de données](03-DATA-MODEL.md) et [UX/UI](04-UX-UI.md) pour les règles de données et d'interaction ;
- [Architecture](05-ARCHITECTURE.md), [base de données](06-DATABASE.md) et [pipeline catalogue](07-CATALOG-SYNC.md) pour les décisions techniques ;
- [README](../README.md) et [rapports de réalisation](reports/) pour l'état du dépôt et les validations effectuées.

Ces références spécialisées priment sur les résumés de cette roadmap pour les règles détaillées. Une phase **planifiée** indique un ordre de réalisation retenu, sans signifier que tous ses choix sont cadrés ni fixer de date de livraison. Une piste après V1 ne constitue pas un engagement d'implémentation.

## État actuel

**Les Phases 0 à 3 sont terminées et validées. La Phase 4 — Profil et gestion du compte est cadrée fonctionnellement et prête pour implémentation.** Son cadrage documentaire est intégré aux références ; aucune implémentation de Phase 4 n'a encore commencé.

| Grandes phases | Statut |
|---|---|
| 0 à 2 — Fondations, base de données et catalogue | Terminées |
| 3 — Authentification et socle applicatif authentifié | Terminée |
| 4 — Profil et gestion du compte | Cadrée fonctionnellement — prête pour implémentation |
| 5 — Dashboard, création et gestion des collections | Planifiée |
| 6 — Cœur fonctionnel des collections | Planifiée |
| 7 — Vues, catalogue, recherche globale et préférences | Planifiée |
| 8 — Mise à jour des collections automatiques | Planifiée |
| 9 — Partage des collections | Planifiée |
| 10 — Finalisation V1 et mise en production | Planifiée |

Le socle SQL, le catalogue et le socle Auth sont déployés et validés dans Supabase cloud ; les écrans Auth et le shell sont validés localement. Le détail des migrations et des validations reste dans le README et les rapports.

**Développement et tests utilisent Supabase local uniquement. Supabase cloud est réservé à la future production avec Vercel.** Aucun déploiement Vercel n'est en place. Les URLs de production seront configurées lors de la mise en production ; aucune URL `localhost` ou `127.0.0.1` ne doit être ajoutée au cloud.

## Roadmap V1

### Phases 0 à 2 — Fondations, base de données et catalogue

**Statut : TERMINÉES**

Ces phases ont établi le socle technique et de données de MY. :

- cadrage de l'architecture et initialisation React / TypeScript / Vite ;
- Supabase, PostgreSQL, schéma applicatif, droits et RLS ;
- modèle des collections, des variantes et des exemplaires physiques ;
- catalogue Pokémon local alimenté par TCGdex, avec corrections locales versionnées ;
- variantes françaises éligibles au format standard, rattachements Pokémon et dates de sortie ;
- préparation des collections automatiques, de leurs contraintes et du stockage des préférences de vues.

Les opérations métier utilisateur et leurs interfaces ne sont pas livrées par ce seul socle. Le catalogue exclut les cartes Jumbo et Pokémon TCG Pocket, conformément aux références produit et catalogue.

### Phase 3 — Authentification et socle applicatif authentifié

**Statut : TERMINÉE**

Cette phase fournit les parcours d'authentification et la structure commune aux futures pages métier :

- inscription par email et mot de passe uniquement, avec confirmation obligatoire de l'adresse email ;
- connexion, déconnexion, restauration et gestion de session ;
- récupération et réinitialisation du mot de passe, avec MFA avant la saisie du nouveau mot de passe ;
- MFA TOTP obligatoire par application Authenticator et accès MY. réservé aux sessions `aal2` ;
- création automatique du profil MY. et de son identifiant public unique et immuable ;
- pages publiques/Auth, routes protégées et contrôles d'accès frontend et base de données ;
- shell authentifié, header permanent et menu Profil / Paramètres / Déconnexion ;
- pages minimales `/dashboard`, `/profile` et `/settings`, avec finitions responsive et accessibilité.

La recherche du header est encore un champ visuel sans requête ni suggestion. Les pages authentifiées restent minimales : le vrai Dashboard, le contenu du Profil et les Paramètres fonctionnels relèvent des phases suivantes.

### Phase 4 — Profil et gestion du compte

**Statut : CADRÉE FONCTIONNELLEMENT — PRÊTE POUR IMPLÉMENTATION**

L'objectif est de terminer le bloc utilisateur/compte après l'authentification, avant de construire le Dashboard et la gestion des collections.

Transformer `/profile` en page légère de Profil / gestion du compte :

- email actuel, identifiant public MY. immuable et copiable, date de création du compte ;
- changement d'email et changement volontaire de mot de passe ;
- statut Authenticator et information de contact pour son remplacement, sans workflow automatique ;
- suppression définitive du compte et de ses données propres, avec préservation du catalogue et des données d'autrui ;
- nouvelle ré-authentification mot de passe actuel + TOTP actuel pour chacune des trois actions sensibles, même avec une session déjà `aal2`, et confirmations renforcées pour la suppression.

Les [fonctionnalités](01-FEATURES.md#profil-utilisateur), l'[UX](04-UX-UI.md#profil-utilisateur), le [modèle](03-DATA-MODEL.md#utilisateur-et-profil-my), l'[architecture](05-ARCHITECTURE.md#profil-et-gestion-du-compte--cible-phase-4) et la [base de données](06-DATABASE.md#suppression-dun-compte) portent le cadrage validé et ses contraintes. Les parcours Auth et la récupération administrative MFA déjà livrés restent acquis.

Profil et Paramètres restent deux destinations distinctes de `Mon compte`, sans raccourci vers Paramètres dans Profil. L'interface des préférences de vues reste prévue en Phase 7. Aucun profil social n'est ajouté.

Le moyen de contact final, les textes UX et détails visuels, la méthode technique de ré-authentification, le workflow SQL/RPC exact de suppression et les éventuelles exigences légales/rétentions particulières restent explicitement ouverts dans leurs références. Le périmètre fonctionnel est validé ; les garanties techniques doivent être résolues avant leur implémentation. La phase n'est pas encore livrée et la Phase 5 n'a pas commencé.

### Phase 5 — Dashboard, création et gestion des collections

**Statut : PLANIFIÉE**

Transformer le Dashboard minimal en point central d'accès aux collections :

- présentation de `Mes collections`, avec nom, type, progression et accès à chaque collection ;
- distinction prévue avec `Collections partagées avec moi` ;
- création d'une collection libre ou automatique ciblant un Pokémon ou une Extension précise ;
- sélection de la cible et validation du nom, avec au moins 3 caractères utiles après trim ;
- respect de l'unicité d'une collection automatique par propriétaire et cible, avec ouverture de l'existante ;
- création automatique autoritative et transactionnelle depuis le catalogue MY. ;
- renommage, suppression et ouverture d'une collection ;
- première structure de page collection pour accueillir les interactions suivantes.

La suppression d'une collection conserve les exemplaires physiques. Le détail des interactions avec son contenu arrive en Phase 6.

La distinction des collections reçues est anticipée dans le Dashboard ; leur accès effectif et le parcours de partage seront livrés en Phase 9. Les collections partagées resteront distinctes de celles dont l'utilisateur est propriétaire.

### Phase 6 — Cœur fonctionnel des collections

**Statut : PLANIFIÉE**

Rendre les collections utilisables pour suivre les variantes et les exemplaires possédés :

- consultation des éléments automatiques et manuels ;
- recherche et ajout d'une variante exacte du catalogue ;
- suppression et réorganisation des éléments manuels, sans modifier l'ordre relatif des éléments automatiques ;
- suivi possédée/manquante et gestion de plusieurs exemplaires physiques par variante ;
- état de conservation, notes personnelles et informations de grading par exemplaire ;
- recherche interne à la collection ;
- calcul de progression sur tous ses éléments, automatiques et manuels ;
- détail contextuel Variante commun aux collections et, ensuite, au catalogue ;
- actions adaptées aux droits, avec écritures réservées au propriétaire.

Les exemplaires physiques sont **globaux au compte**, associés à une variante et non à une collection particulière. La possession est dérivée de leur existence : afficher une variante dans plusieurs collections ne duplique pas les exemplaires.

Les éléments automatiques ne sont pas librement supprimables ou réordonnables. La nomenclature des états, les règles détaillées de grading et les mécanismes de positionnement manuel encore ouverts devront être précisés dans les références concernées.

### Phase 7 — Vues, catalogue, recherche globale et préférences

**Statut : PLANIFIÉE**

Compléter les modes de consultation et la navigation dans les collections et le catalogue authentifié.

#### Collections

- vues Liste, Cartes et Classeur ;
- formats de pages et organisation du classeur selon le cadrage à compléter ;
- représentation des variantes possédées et manquantes, sans supprimer les emplacements manquants du classeur.

Classeur reste réservé aux collections. La liste définitive des formats et la persistance du format et de l'organisation restent ouvertes.

#### Catalogue

- pages Pokémon, Extension et Carte, en vues Liste / Cartes ;
- consultation des Cartes distinctes puis de leurs Variantes, selon les ordres définis dans les références ;
- depuis Pokémon ou Extension, création ou ouverture de la collection automatique personnelle correspondante.

Ces pages présentent le catalogue sans progression ni statistiques personnelles. Une collection partagée ne remplace pas la collection personnelle correspondant à une cible.

#### Recherche globale

Rendre fonctionnel le champ permanent du header selon le cadrage validé :

- suggestions à partir de 3 caractères, avec un maximum de 10 résultats ;
- catégories Pokémon, Extensions, Collections et Cartes, avec les quotas et critères documentés ;
- sélection explicite d'une suggestion pour naviguer ;
- aucune page générale de résultats ni sélection automatique à la validation du champ.

La recherche globale reste distincte du filtre interne à une collection et de la recherche d'ajout d'une variante exacte. Les collections partagées accessibles seront intégrées à ses résultats lors de la Phase 9.

#### Navigation

- détail Variante commun au catalogue et aux collections, avec actions adaptées au contexte ;
- retour conservant autant que possible la consultation précédente ;
- navigation Précédente / Suivante suivant l'ordre réel de la liste d'origine ;
- interactions adaptées au mobile, sans inventer de séquence pour une arrivée sans liste d'origine.

#### Paramètres

Transformer `/settings` en page fonctionnelle pour les **deux préférences de vues persistantes déjà définies** : vue catalogue par défaut et vue collection par défaut, avec leur dernier mode utilisé indépendant. Aucun autre réglage n'est validé par cette phase ; la persistance des choix propres au classeur reste à cadrer.

### Phase 8 — Mise à jour des collections automatiques

**Statut : PLANIFIÉE**

Permettre au propriétaire d'actualiser une collection lorsque la structure de sa cible évolue dans le catalogue :

- détection par version de cible et signalement d'une mise à jour disponible ;
- aperçu des ajouts, retraits, conversions d'éléments manuels en automatiques et changements d'ordre ;
- application après validation explicite de l'utilisateur ;
- opération autoritative et atomique, avec contrôle de la version présentée ;
- absence de doublons lors des conversions et préservation des exemplaires physiques ;
- conservation des éléments restant manuels et prise en compte de leurs positions.

La synchronisation du catalogue ne modifie jamais silencieusement la structure d'une collection. Si la cible change après l'aperçu, un résumé actualisé est nécessaire avant application.

La stratégie précise de maintien des positions et d'ancrage des éléments manuels reste à cadrer ; cette roadmap ne la fixe pas.

### Phase 9 — Partage des collections

**Statut : PLANIFIÉE**

Permettre le partage en lecture seule avec un autre utilisateur MY. :

- recherche limitée d'un destinataire par son identifiant public MY., sans annuaire de profils ;
- identification du destinataire et confirmation par le propriétaire ;
- création et retrait des accès, sans doublon ni partage à soi-même ;
- consultation des collections reçues dans le Dashboard et intégration aux résultats de recherche accessibles ;
- consultation des variantes, de la progression et des exemplaires du propriétaire, avec les vues et outils de lecture ;
- restrictions cohérentes dans l'interface et via RLS.

Le partage est actif dès confirmation du propriétaire : aucune invitation, acceptation ou demande préalable n'est prévue. Le propriétaire peut révoquer l'accès et le destinataire peut retirer son propre accès. Aucun de ces retraits ne supprime la collection ni les exemplaires.

Aucune édition collaborative ni diffusion par lien public n'est ajoutée à la V1. Les notifications de partage restent non cadrées.

### Phase 10 — Finalisation V1 et mise en production

**Statut : PLANIFIÉE**

Stabiliser l'ensemble de la V1 et préparer son utilisation en production :

- cohérence responsive et accessibilité des parcours complets ;
- états de chargement, vides et d'erreur ;
- validation de la sécurité, des droits et des parcours de bout en bout ;
- performances, requêtes et taille des bundles, avec découpage si pertinent ;
- nettoyage et documentation finale ;
- configuration Vercel et accès direct aux routes de la SPA ;
- configuration des environnements de production et vérification Supabase Auth ;
- Site URL et Redirect URLs de production pour confirmation email et récupération du mot de passe ;
- configuration de l'envoi réel des emails, dont SMTP, et vérification des parcours ;
- déploiement puis contrôles en production.

Le développement et les tests restent locaux avant cette étape. Les URLs de production ne sont ni inventées à l'avance ni remplacées par des URLs localhost dans Supabase cloud.

La V1 conserve son périmètre de gestion de collections Pokémon TCG : aucun paiement ou abonnement Premium n'est requis, et les collections automatiques restent accessibles normalement.

## Après la V1 — Roadmap moyen terme

Cette section accueillera les évolutions retenues après la sortie de la V1. **Aucune version après V1 ni fonctionnalité de moyen terme n'est actuellement engagée ou planifiée.**

Elle pourra ensuite distinguer la consolidation de la V1, des versions intermédiaires et d'éventuelles évolutions majeures. Leurs noms, leur contenu, leur ordre et leurs échéances seront ajoutés après validation, en fonction des usages réels.

Les thèmes suivants restent des **pistes exploratoires non validées** :

- améliorations issues des retours utilisateurs et nouveaux outils de gestion de collection ;
- statistiques, personnalisation ou nouveaux modes d'exploration ;
- enrichissement du catalogue ;
- outils autour des doubles, échanges ou fonctionnalités sociales ;
- éventuelle offre Premium, si un modèle payant est cadré et retenu.

Cette liste n'intègre aucun de ces sujets à la V1 et ne lève pas ses exclusions. Une piste ne devient une phase planifiée qu'après clarification de son besoin, de son périmètre et de sa priorité dans les documents concernés. Aucun prix, plan, quota ou fournisseur de paiement n'est défini pour un éventuel Premium.

## Vision long terme

MY. est conçu pour évoluer au-delà de sa première version, tout en gardant la gestion des collections au centre du produit.

La V1 établit un catalogue Pokémon TCG fiable, des variantes identifiées distinctement, des collections libres ou automatiques et des données personnelles cohérentes à l'échelle du compte.

Les orientations à long terme seront précisées selon :

- les besoins et retours des utilisateurs ;
- la qualité et la disponibilité des données ;
- la simplicité et la valeur réelle des fonctionnalités ;
- les contraintes de performance, de maintenance et de coût ;
- la viabilité d'un éventuel modèle économique.

Cette section réserve une place à une vision durable ; elle ne promet ni extension de périmètre ni transformation du produit avant cadrage et validation.

## Règles de maintenance de la roadmap

La roadmap doit être mise à jour lorsqu'une grande phase commence ou se termine, lorsque son ordre ou son périmètre change, ou lorsqu'une évolution après V1 est validée.

- Conserver les phases terminées avec leur statut et un résumé fidèle des acquis.
- Indiquer clairement la phase en cours ou la prochaine phase, sans présenter un cadrage à venir comme déjà réalisé.
- Répercuter les déplacements de périmètre entre phases et leurs dépendances, sans dupliquer une livraison.
- Distinguer décisions validées, phases planifiées et pistes ouvertes ; ne pas transformer une idée en engagement.
- Faire valider et documenter toute évolution du périmètre V1 dans les références produit avant de la considérer comme acquise dans la roadmap.
- Maintenir le [README](../README.md) cohérent avec les changements d'état et d'ordre des grandes phases.
- Garder les spécifications détaillées dans leurs documents de référence et les preuves de réalisation dans les rapports datés. Ces rapports décrivent un état historique ; cette roadmap indique la progression actuelle.
- Ne pas transformer ce document en journal d'implémentation, liste de tâches Codex ou catalogue de sous-phases opérationnelles.
- Faire évoluer les sections moyen et long terme au fil des décisions validées, sans supprimer l'historique des grandes phases achevées.
