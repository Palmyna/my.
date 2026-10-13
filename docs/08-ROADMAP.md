# Roadmap de MY.

## Rôle du document

Ce document constitue la source de vérité concernant la **roadmap globale de MY.** : l'état, l'ordre et le périmètre des grandes phases du projet, jusqu'à la V1 puis au-delà.

La roadmap reste volontairement **macro**. Chaque phase représente un ensemble fonctionnel cohérent. Le découpage opérationnel est défini au moment de sa réalisation ; les blocs réalisés de Phase 8 ci-dessous résument ses dépendances, sans constituer un journal de sous-phases de développement.

Elle permet de voir ce qui est terminé, la prochaine étape et les orientations futures, sans remplacer les spécifications détaillées :

- [Vision générale](00-VISION.md) et [fonctionnalités](01-FEATURES.md) pour les décisions produit ;
- [Modèle de données](03-DATA-MODEL.md) et [UX/UI](04-UX-UI.md) pour les règles de données et d'interaction ;
- [Architecture](05-ARCHITECTURE.md), [base de données](06-DATABASE.md) et [pipeline catalogue](07-CATALOG-SYNC.md) pour les décisions techniques ;
- [README](../README.md) et [rapports de réalisation](reports/) pour l'état du dépôt et les validations effectuées.

Ces références spécialisées priment sur les résumés de cette roadmap pour les règles détaillées. Une phase **planifiée** indique un ordre de réalisation retenu, sans signifier que tous ses choix sont cadrés ni fixer de date de livraison. Une piste après V1 ne constitue pas un engagement d'implémentation.

## État actuel

**Phases 0 à 8 terminées. Version applicative actuelle du dépôt `0.8.28`.** Phase 8 livre ordre relatif et reprise idempotente, masquage/progression, filtres communs, aperçu/application explicitement confirmés et centre interne de notifications. Validation finale Local et checkpoint manuel Cloud acquis ; 48 migrations de chaque côté, dont 19 Phase 8, à la [clôture historique 8I.2 en `0.8.21`](reports/2026-10-12-PHASE8I2-CLOSURE.md). Production React/Vite désormais déployée sur `my.collectrealm.com` en HTTPS selon le propriétaire ; aucun test complet de compte réel Production encore réalisé. **Préparation du workflow Production en cours, maintenance frontend, gel backend et coordination opérateur livrés avec preuves Local ; outillage de sauvegarde PROD.4 et restauration PROD.5 éprouvés sur PostgreSQL synthétique isolé, avec sécurité/métier et Auth/TOTP, sans sauvegarde ni preuve de récupération Cloud ; contrôles Preview partiels fournis par le propriétaire, validations hébergées complètes et autres mécanismes restant à réaliser.** [État actuel et procédure de référence](11-PUBLICATION-PRODUCTION.md). Partages existants consultables en lecture seule ; gestion complète réservée à Phase 9.

| Grandes phases | Statut |
|---|---|
| 0 à 2 — Fondations, base de données et catalogue | Terminées |
| 3 — Authentification et socle applicatif authentifié | Terminée |
| 4 — Profil et gestion du compte | Terminée |
| 5 — Dashboard, création et gestion des collections | Terminée |
| 6 — Cœur fonctionnel des collections | Terminée |
| 7 — Vues, catalogue, recherche globale et préférences | Terminée |
| 8 — Actualisation, masquage et notifications | Terminée |
| Préparation du workflow Production après Phase 8 | En cours ; cadrage documentaire formalisé, réalisation et validation restantes |
| 9 — Partage des collections | Planifiée |
| 10 — Finalisation, qualité et stabilisation V1 | Planifiée |

Le socle SQL, le catalogue et les migrations jusqu’à la Phase 8 sont présents dans Supabase Cloud. Checkpoint manuel puis contrôles directs en lecture seule fournis par le propriétaire : **48 migrations, aucun écart d’historique signalé**, dernière `20261011191625` ; rôle publisher contrôlé et `delete-account` active. Les validations Local, le catalogue Cloud, les advisors et les limites sont distingués dans le [rapport de clôture](reports/2026-10-12-PHASE8I2-CLOSURE.md). Aucun accès Cloud en 8I.2.

**Développement et tests courants sur Supabase Local ; checkpoints Cloud ponctuels autorisés avec fixtures temporaires.** `main` est désormais branche GitHub par défaut et Production, `dev` reste développement. Selon le propriétaire : Production Vercel automatique depuis `main`, Previews depuis `dev`, Vercel Authentication sur tous les déploiements, variables Supabase Production seulement ; intégration GitHub Supabase connectée mais déploiement Production automatique désactivé. URLs Auth du domaine définitif et Resend configurés ; aucune URL localhost à ajouter au Cloud. [Provenance et limites](11-PUBLICATION-PRODUCTION.md#état-connu-et-provenance).

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

À l'issue de Phase 3, la recherche du header était un champ visuel sans requête ni suggestion et les pages authentifiées étaient minimales. Dashboard, Profil, Paramètres et recherche globale ont été livrés dans les phases suivantes, désormais terminées.

### Phase 4 — Profil et gestion du compte

**Statut : TERMINÉE**

L'objectif est de terminer le bloc utilisateur/compte après l'authentification, avant de construire le Dashboard et la gestion des collections.

Transformer `/profile` en page légère de Profil / gestion du compte :

- email actuel, identifiant public MY. immuable et copiable, date de création du compte ;
- changement d'email et changement volontaire de mot de passe ;
- statut Authenticator et information de contact pour son remplacement, sans workflow automatique ;
- suppression définitive du compte et de ses données propres, avec préservation du catalogue et des données d'autrui ;
- session `aal2` et mot de passe actuel exigé par Auth pour le changement volontaire de mot de passe ;
- session `aal2` et double confirmation des adresses par Secure Email Change ;
- mot de passe actuel, TOTP frais, confirmations renforcées et opération serveur contrôlée pour la suppression.

Les [fonctionnalités](01-FEATURES.md#profil-utilisateur), l'[UX](04-UX-UI.md#profil-utilisateur), le [modèle](03-DATA-MODEL.md#utilisateur-et-profil-my), l'[architecture](05-ARCHITECTURE.md#profil-et-gestion-du-compte--cible-phase-4) et la [base de données](06-DATABASE.md#suppression-dun-compte) portent le cadrage validé et ses contraintes. Les parcours Auth et la récupération administrative MFA déjà livrés restent acquis.

Profil et Paramètres restent deux destinations distinctes de `Mon compte`, sans raccourci vers Paramètres dans Profil. À la clôture de Phase 4, l’interface des préférences de vues relevait de la Phase 7 ; elle est désormais livrée. Aucun profil social n'est ajouté.

Le moyen de contact final et les éventuelles exigences légales/rétentions particulières restent ouverts dans leurs références. Les parcours Profil et leurs protections sont livrés et validés, avec leurs preuves locales et Cloud consignées dans le [rapport de clôture](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md).

### Phase 5 — Dashboard, création et gestion des collections

**Statut : TERMINÉE**

Le Dashboard est le point central d'accès aux collections. Sont livrés :

- collections personnelles et partagées, désormais présentées dans une grille unifiée modernisée en Phase 6, avec nom, type, progression et accès explicite `Personnelle` ou `Partagée · Lecture seule` ;
- création d'une collection personnalisée depuis le Dashboard ;
- validation du nom, avec au moins 3 caractères utiles après trim ;
- respect de l'unicité d'une collection automatique par propriétaire et cible, avec retour de l'existante par le backend ;
- backend de création automatique autoritative et transactionnelle depuis le catalogue MY. : calcul canonique PostgreSQL, état/version de cible, parité validée et création concurrente via la RPC `create_automatic_collection(...)` et le service `createAutomatic()` ;
- renommage, suppression et ouverture d'une collection ;
- page `/collections/:collectionId` : overview, type/cible, progression, accès direct, états de chargement/erreur/indisponibilité et actions réservées au propriétaire, avec dialogs et navigation clavier accessibles.

La suppression d'une collection conserve les exemplaires physiques. Les interactions avec son contenu sont livrées en Phase 6.

Le Dashboard ne propose aucun sélecteur Pokémon/Extension ni parcours de création automatique. L'UX de création/ouverture automatique depuis les pages catalogue relève de la Phase 7 ; son backend reste une réalisation de Phase 5.

Le socle DB/RLS et les interfaces Dashboard/Collection permettent déjà de consulter une collection réellement partagée, sans action propriétaire. La création et la gestion utilisateur des partages restent prévues en Phase 9. Les collections partagées restent distinctes de celles dont l'utilisateur est propriétaire.

### Phase 6 — Cœur fonctionnel des collections

**Statut : TERMINÉE**

Les collections permettent désormais de suivre les variantes et les exemplaires possédés :

- plusieurs exemplaires physiques par variante, globaux au compte, avec nom facultatif, fallback dynamique `Exemplaire N` et note libre nullable de 750 caractères maximum ; CRUD propriétaire, lecture seule en partage et possession dérivée, sans grading structuré actif ;
- réorganisation de tous les éléments par souris, tactile ou clavier, avec placements début/fin/avant/après, backend autoritatif, midpoint et rééquilibrage ; ordre visuel transitoire pendant la sauvegarde et les relectures, sans vérité permanente frontend ;
- contenu réel autoritatif, éléments automatiques/manuels, ordre backend, possession/progression, manquantes atténuées et images avec fallback, en accès propriétaire ou partage lecture seule ;
- recherche catalogue, sélection d'une variante exacte, confirmation, ajout début/fin sans doublon et retrait manuel conservant les exemplaires ; recherche normalisée en AND sur carte/Pokémon, numéro/fraction, Extension, abréviations, identifiants et variante, **sans recherche du nom de série** ;
- recherche interne côté client sur le contenu déjà chargé : carte, Extension, abréviations, série, numéro et variante, avec normalisation et AND multi-termes ; ordre conservé, reorder désactivé seulement si le filtre masque des éléments ;
- détail Variante autonome via `get_variant_detail`, y compris historique/inactif, métadonnées/dates/stamps et fallback image ; panneau latéral desktop ou plein écran mobile sans route dédiée, exemplaires intégrés et droits propriétaire/partage ; croix seule en haut à droite, aucun header générique visible ; depuis 7E.3.2, `Caractéristiques` affiche aussi le Type seul ;
- modernisation UI : fondation graphite globale, accent rouge MY., public/Auth harmonisés, Dashboard en grille unifiée et FAB de création, Collection et FAB contextuel, reorder plus fluide, détail Variante et Profil modernisés, actions/icônes harmonisées. Le contrat métier du Profil reste inchangé ; Paramètres était volontairement minimal à la clôture de Phase 6.

Les éléments automatiques restent non supprimables manuellement ; leur déplacement ne modifie ni origine ni rang canonique. Les exemplaires ne sont jamais dupliqués entre collections.

Phase 6 terminée et validée après l'audit technique exécuté par Codex et le checkpoint Supabase Cloud exécuté manuellement par le propriétaire. À ce checkpoint historique, Local/Remote : **23/23 migrations**, dont 12 Phase 6, alignées jusqu'à `20260928083830`, sans migration restante au dry-run final. Le [rapport de clôture](reports/2026-09-30-PHASE6-CLOSURE.md) conserve ces preuves. Bundle principal d'environ 680,01 kB, absence du nom de série dans la recherche d'ajout et Paramètres minimal étaient non bloquants à cette clôture ; Phase 7+ était hors de son périmètre. Les Paramètres fonctionnels sont désormais livrés en Phase 7.

### Phase 7 — Vues, catalogue, recherche globale et préférences

**Statut : TERMINÉE ET VALIDÉE**

Le socle Phase 7 comprend version applicative/footer et préférences 7A.3. Depuis 7B.3, Liste, Cartes et Classeur Collection sont fonctionnels avec sélecteur, préférences du viewer, dernier choix explicite sauvegardé, recherche conservée et contenu/ordre autoritatifs communs. Liste/Cartes conservent le reorder propriétaire ; Classeur est continu et consultatif. Paramètres livre désormais les trois réglages Affichage : défaut catalogue, défaut collection et format Classeur global, avec sauvegardes indépendantes et overrides conservés. Version **0.7.21**, conservée pendant la clôture. Le socle Catalogue dispose désormais des types Pokémon, de trois contrats de lecture authentifiée, de services/décodeurs stricts et de son identité couleur frontend. La page Pokémon authentifiée est livrée avec identité par types, recherche locale, vues neutres Liste/Cartes, Détail Variante et création/ouverture automatique personnelle. La page Extension est livrée avec identité teal/turquoise, logo/symbole, socle Catalogue partagé, liens Pokémon et CTA automatique factorisé. Carte est livrée avec fiche à identité Pokémon/fallback ambre depuis 7E.3.2, image représentative, liens Extension/Pokémon et Versions Liste/Cartes sans recherche ni CTA Collection. Les liens internes des trois niveaux sont actifs. Identité couleur Catalogue/Collections finalisée : palette Pokémon unique, Extensions teal, personnalisées rouge MY., partagées indigo prioritaire ; métadonnées types disponibles dans Dashboard sous RLS. Socle serveur de recherche globale livré en 7E.1 : RPC autoritative et service TypeScript strict. Recherche globale du header fonctionnelle en 7E.2 : debounce, suggestions, états, identité 7D.5 et navigation explicite. Contrats de présentation enrichis en 7E.3.1 (`0.7.14`) : logo Extension, image représentative et Pokémon Carte dans la recherche ; IDs Carte/Extension et Pokémon dans le Détail Variante. Harmonisation frontend livrée en 7E.3.2 (`0.7.15`) : liens sans soulignement au repos, hover textuel souligné, identité Carte Pokémon/fallback ambre `#C9A34A`, miniatures Carte/logos Extension, trois vues Cartes Catalogue alignées sur Collection, libellé `Pokémon` et métadonnées communes fiche Carte/Détail Variante. Cohérence visuelle et vocabulaire Catalogue finalisés en 7E.3.4 (`0.7.17`) : métadonnées communes sans divergence, listes et progression harmonisées, compteurs Pokémon/Extension en cartes et fiche Carte en versions. Navigation simplifiée livrée en 7F.2 (`0.7.19`) : `← Retour` partagé et liens Carte/Extension/Pokémon par IDs. **7F terminée.**

Modes de consultation et navigation livrés dans les collections et le catalogue authentifié. Audit technique, checkpoint Cloud manuel et clôture validés. Outillage courant : Node.js 24.20.0, npm 12.1.0, Supabase CLI 2.120.0. Badges Auto/Perso supprimés en `0.7.20` ; `item.origin` et retrait réservé aux éléments manuels autorisés conservés.

#### Collections

- vues Liste, Cartes et Classeur ;
- formats de pages `2x2`, `3x3`, `4x3` et organisation continue uniquement ;
- représentation des variantes possédées et manquantes, sans supprimer les emplacements manquants du classeur.

Classeur livré, réservé aux collections, **continu uniquement**. Formats `2x2`, `3x3`, `4x3`, défaut `3x3` ; global du compte et override viewer + collection, retour au défaut par suppression. Livre desktop/tablette large, page unique mobile, pagination frontend sans table `binder_pages`. Recherche non destructive avec occurrences et halo ; absence de résultat/effacement conserve la page. Placeholder commun des cartes `card-placeholder.webp`. Aucun regroupement série/bloc/ère, reorder ou action métier sur les pochettes. Aucun changement DB ni accès Cloud en 7B.3.

#### Catalogue

- pages Pokémon, Extension et Carte, en vues Liste / Cartes ;
- trois pages livrées : Variantes dans leur ordre canonique, socle partagé et liens internes Pokémon / Extension / Carte ; Carte présente une fiche de référence et toutes ses Versions sans recherche locale ;
- depuis les pages Pokémon ou Extension, actions `Créer ma collection…` / `Ouvrir ma collection…` pour la collection automatique personnelle correspondante.

Ces pages présentent le catalogue sans progression ni statistiques personnelles. Une collection partagée ne remplace pas la collection personnelle correspondant à une cible.

#### Recherche globale

Contrat DB autoritatif et service TypeScript livrés localement en 7E.1. Intégration du champ permanent livrée en 7E.2 (`0.7.13`) :

- suggestions à partir de 3 caractères, avec un maximum de 10 résultats ;
- catégories Pokémon, Extensions, Collections et Cartes, avec les quotas et critères documentés ;
- sélection explicite d'une suggestion pour naviguer ;
- aucune page générale de résultats ni sélection automatique à la validation du champ.

La recherche globale reste distincte du filtre interne à une collection et de la recherche d'ajout d'une variante exacte. Dès la Phase 7, elle doit pouvoir retourner toutes les collections actuellement accessibles au viewer, personnelles ou reçues en partage. La Phase 9 est responsable du parcours utilisateur de création, gestion et retrait des partages ; elle n’est pas nécessaire pour lire ou rechercher un partage déjà existant.

Un Pokémon lié avec métadonnées suffisantes → identité complète, type principal + secondaire éventuel. Plusieurs Pokémon avec exactement le même couple principal/secondaire → identité complète commune ; sinon exactement un type exploitable commun à tous → identité simple de ce type ; sinon fallback Carte. Aucun Pokémon, ambiguïté ou métadonnées insuffisantes → fallback Carte, sans sélectionner le premier Pokémon. Fallback Carte frontend **#C9A34A** (ambre/or doux), distinct du teal Extension, rouge MY. et indigo Partagé ; `resolveCardIdentity` livré en 7E.3.2 dans `catalog-identity.ts`, partagé par fiche Carte et suggestions Carte. Logique centralisée avec la palette Pokémon existante, aucune couleur SQL. Liens, miniatures/logo, vues Cartes Catalogue et structure du Détail Variante harmonisés en 7E.3.2, frontend uniquement. [Rapport UI](reports/2026-10-06-PHASE7E3-2-UI-HARMONIZATION.md). [Preuve des contrats 7E.3.1](reports/2026-10-06-PHASE7E3-1-PRESENTATION-CONTRACTS.md).

#### Navigation

Le Détail Variante commun est livré. Contrats nécessaires aux liens Collection livrés localement en 7F.1 (`0.7.18`) : IDs Carte/Extension et cible automatique, sans changement visuel.

7F terminée en `0.7.19` : bouton partagé `← Retour` sur Collection et les trois Catalogues via historique réel, exploitable après refresh, fallback Dashboard sans entrée MY. précédente ; liens Carte/Extension/Pokémon déterminés par type d’entité et ID du contrat. Aucune restauration métier personnalisée. Collection Liste/Cartes et partage lecture seule autorisé : surface Détail et contrôles indépendants ; cible automatique liée selon son type. La tuile Dashboard reste son lien entier vers la Collection, sans interaction imbriquée.

Précédente / Suivante, swipe entre cartes, séquence de navigation et navigation rapide contextuelle sont abandonnés pour la V1 actuelle. Aucun ordre contextuel de navigation n’est préparé ; la pagination Classeur existante reste indépendante.

#### Paramètres

`/settings` est fonctionnelle : section Affichage cohérente avec Profil, vue catalogue/collection par défaut et format Classeur global. Sauvegarde immédiate par réglage, chargement/erreur/retry et contrôles accessibles responsive. Les derniers modes restent indépendants, la vue d'une collection ouverte reste conservée et le format global s'applique aux héritiers sans toucher aux overrides viewer + collection. Aucun autre réglage validé par cette phase.

### Phase 8 — Actualisation, masquage et notifications

**Statut : TERMINÉE**

8A.1 consigne les décisions métier ; l’[algorithme 8A.2](reports/2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md) et ses arbitrages R1–R4, puis la [conception technique 8A.3](reports/2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), sont validés. **8B terminée et validée Local** : persistance, moteur PostgreSQL, journal, writers, reçus, lecteur et intégration applicative livrés ; contrat 2 actif pour les nouvelles créations, contrat 1 conservé pour les anciennes. [Clôture 8B](reports/2026-10-10-PHASE8B8-CLOSURE.md). **8C terminée et validée Local** : masquage persistant, progression autoritative et services/hooks livrés. [Clôture 8C](reports/2026-10-10-PHASE8C-CLOSURE.md). **8D terminée et validée Local** : actions Liste/Cartes, filtres communs, reorder R2 et Classeur compacté. [Clôture 8D](reports/2026-10-10-PHASE8D-CLOSURE.md). **8E terminée et validée Local** : détection autoritative, aperçu pur, plan/token de confirmation et composant de consultation réutilisable. [Clôture 8E](reports/2026-10-11-PHASE8E-CLOSURE.md). **8F terminée et validée Local** : application transactionnelle, services/reprise et parcours explicitement confirmé livrés. [Clôture 8F](reports/2026-10-11-PHASE8F3-CLOSURE.md). **Backend notifications 8G terminé et validé Local** : fondations/projection, API/transitions et publication terminal sécurisée. [Clôture 8G](reports/2026-10-11-PHASE8G3-CLOSURE.md). **Centre de notifications 8H terminé et validé Local** : cloche, pagination, consultation, lecture/traitement, aperçu/application et reprise raccordés. [Clôture 8H.3](reports/2026-10-12-PHASE8H3-CLOSURE.md) en `0.8.19`, preuves navigateur desktop/tablette/mobile ; contrôles axe incomplets explicitement conservés. **Audit 8I.1 conservé ; checkpoint Cloud manuel terminé et clôture officielle 8I.2 en `0.8.21`, GO pour Phase 8.** [Rapport de clôture](reports/2026-10-12-PHASE8I2-CLOSURE.md). Migrations backend présentes Cloud selon le checkpoint fourni ; application désormais déployée sur Vercel selon le propriétaire, campagne complète de compte réel Production encore à réaliser. Voir la [procédure Production actuelle](11-PUBLICATION-PRODUCTION.md).

Trois fonctionnalités livrées et validées Local : actualisation contrôlée des collections automatiques, masquage des cartes automatiques et centre de notifications interne.

Permettre au propriétaire d'actualiser une collection lorsque la structure canonique de sa cible Pokémon ou Extension évolue :

- détection par version de cible et signalement d'une mise à jour disponible ;
- aperçu des ajouts, retraits, conversions d'éléments manuels en automatiques et changements d'ordre ;
- application après validation explicite de l'utilisateur ;
- opération autoritative et atomique, avec contrôle de la version présentée et de la concurrence ;
- absence de doublons lors des conversions et préservation des exemplaires physiques ;
- actualisation des rangs canoniques et préservation autant que possible de l'ordre personnalisé des éléments automatiques et manuels, sans réinitialisation arbitraire des positions vers l'ordre canonique.

La synchronisation du catalogue ne modifie jamais silencieusement la structure d'une collection. Si la cible change après l'aperçu, un résumé actualisé est nécessaire avant application.

Principe relatif validé : reconstruire le nouvel ordre canonique puis réappliquer chronologiquement toutes les personnalisations. Relations avant/ancre ou fin, ajouts manuels compris. R1 fixe le contexte complet immuable au geste ; R2 résout les gestes filtrés dans l'ordre complet sans déplacer implicitement les masqués ; R3 renouvelle l'identité après retrait réel et la conserve à la conversion ; R4 exclut gestes sans effet/doublons techniques et garde le placement initial manuel. [Règles et exemples A/B](01-FEATURES.md#réordonnancement-relatif--décisions-phase-8). 8A.3 recommande journal/révision/reçus privés, ordre affiché unique via `sort_position`, token d'aperçu et application atomique. Collections historiques de test legacy, recréation acceptée sans récupération des anciens gestes ; aucune destruction pendant 8A.

Masquage persistant réservé au propriétaire et aux éléments automatiques des collections automatiques. Exclusion des deux comptes de progression, manuels inclus, dans Dashboard/Collection/partage quel que soit le filtre. `Non masquées` par défaut / `Toutes` dans les trois vues ; œil seulement Liste/Cartes propriétaire. Classeur compacté sans mutation d'ordre ; recherche sans compactage supplémentaire. Reorder Liste/Cartes disponible avec les deux filtres, sans déplacer implicitement les masqués non affichés. Partage toujours en lecture seule.

Centre interne : cloche entre recherche et compte, badge non lues, panneau et navigation. Trois types initiaux (actualisation, changelog/version, annonce générale), états individuels persistants et retrait des traitées/obsolètes. Publication sécurisée terminal/Codex via Supabase, sans administration UI, secret frontend ou droit administratif ordinaire. Aucun push système, notification navigateur externe ni email. [Cycle de vie complet](01-FEATURES.md#centre-de-notifications--décisions-phase-8).

Blocs réalisés :

| Bloc | Contenu |
|---|---|
| 8A | Cadrage documentaire, algorithme relatif, contrats techniques — **validés** |
| 8B | Persistance et réordonnancement relatif — **terminé, validé Local** |
| 8C | Masquage : base de données, droits et progression — **terminé, validé Local** |
| 8D | Masquage : vues Liste, Cartes et Classeur — **terminé, validé Local** |
| 8E | Détection et aperçu des actualisations — **terminé, validé Local** |
| 8F | Application transactionnelle et confirmation UI — **terminé, validé Local** |
| 8G | Notifications : backend, cycle de vie, publication — **terminé et validé Local** |
| 8H | Notifications : header, panneau, indicateurs et actions — **terminé, validé Local avec preuves navigateur ; limites axe documentées** |
| 8I | Audit transversal, checkpoint manuel Cloud fourni, validation finale et clôture officielle — **terminés** |

**8A reste uniquement documentaire et sa conception 8A.3 est validée.** 8B a livré persistance, contrats, sécurité, concurrence, compatibilité et activation des seules nouvelles créations ; audit Local terminé, collections historiques préservées. Premières dépendances : B fournit journal/révision/reçus, gardes des writers et intégration applicative, C complète masquage/progression, E/F réutilisent ces fondations pour aperçu/application, G/H ajoutent backend puis centre de notifications. [Dépendances détaillées](reports/2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md#13-dépendances-8b-à-8h-et-première-intervention-8b) dans le rapport, sans les transformer en nouvelles grandes phases. Phase 9 conserve la gestion complète des partages, Phase 10 la finalisation, la qualité et la stabilisation V1 ; lecture partagée déjà livrée acquise.

### Préparation de Production après Phase 8

**Statut : EN COURS.** Première mise en ligne après Phase 8 déclarée réalisée par le propriétaire, sans attendre Phase 10 ; V1 non terminée. Fallback SPA livré en `0.8.23`, routes directes vérifiées par lui. Maintenance frontend implémentée et validée localement, configuration et validation Vercel encore à réaliser. Tests complets de compte réel et procédure coordonnée encore à valider.

GitHub `Palmyna/my.` ; `dev` pour développement, `main` par défaut et Production via PR/merge classique ; frontend Vercel et **Supabase Cloud existant** conservé, sans branche Supabase Preview. La [procédure Production](11-PUBLICATION-PRODUCTION.md) centralise les décisions : préparation locale/changelog, fermeture Vercel et gel Supabase effectifs, backup manuel Cloud validé, PR/merge, déploiement Supabase et build Vercel Production, promotion manuelle sans rebuild après succès Supabase, notification idempotente, puis levée du gel et de la maintenance.

Maintenance frontend persistante sans redéploiement et page MY. **503 sans cache**, puis gel backend Supabase des écritures/RPC/accès directs, implémentés et validés localement. Configuration/validation Vercel, installation/validation du gel Cloud et contrôles opérateur hébergés restent à réaliser. Réouverture exclusivement contrôlée ; backend non protégé par une page frontend seule. Outillage de backup et restauration synthétique isolée livrés ; première capture/récupération Cloud adaptée et publisher Cloud sécurisé restent à éprouver. Activation automatique Supabase depuis `main` et attente de promotion manuelle Vercel sont **décidées mais non appliquées**. Aucun échec ne rouvre automatiquement le site ; rollback Vercel ne restaure pas la base.

Les [blocs prévisionnels de réalisation](11-PUBLICATION-PRODUCTION.md#blocs-futurs-de-réalisation) seront affinés en petites sous-phases dans la référence opérationnelle, sans les détailler dans cette roadmap macro. Validation du workflow complet avant premiers tests d’utilisateurs réels ; maintenance frontend et gel backend sont implémentés localement à ce stade. Adaptation Cloud TCGdex distincte. **Phases 9 et 10 gardent leurs périmètres.**

### Phase 9 — Partage des collections

**Statut : PLANIFIÉE**

Compléter le socle DB/RLS et la consultation Dashboard/overview en lecture seule livrés en Phase 5 par le parcours utilisateur de partage :

- recherche limitée d'un destinataire par son identifiant public MY., sans annuaire de profils ;
- identification du destinataire et confirmation par le propriétaire ;
- création et retrait des accès, sans doublon ni partage à soi-même ;
- gestion des accès reçus, dont le retrait par le destinataire, en complément de la consultation déjà livrée ;
- consultation des variantes, de la progression et des exemplaires du propriétaire, avec les vues et outils de lecture ;
- restrictions cohérentes dans l'interface et via RLS.

Le partage est actif dès confirmation du propriétaire : aucune invitation, acceptation ou demande préalable n'est prévue. Le propriétaire peut révoquer l'accès et le destinataire peut retirer son propre accès. Aucun de ces retraits ne supprime la collection ni les exemplaires.

Aucune édition collaborative ni diffusion par lien public n'est ajoutée à la V1. Les notifications de partage restent non cadrées.

### Phase 10 — Finalisation, qualité et stabilisation V1

**Statut : PLANIFIÉE**

Finaliser et stabiliser la V1 en tenant compte de la première version déjà publiée après Phase 8 :

- cohérence responsive et accessibilité des parcours complets ;
- états de chargement, vides et d'erreur ;
- validation de la sécurité, des droits et des parcours de bout en bout ;
- performances, requêtes et taille des bundles, avec découpage si pertinent ;
- nettoyage et documentation finale ;
- retours des tests utilisateurs complets et de l’exploitation de la première version hébergée ;
- consolidation du routage SPA, des environnements, d’Auth/MFA et des emails déjà configurés ;
- validation des procédures de publication, synchronisation catalogue, notifications et récupération ;
- publication de la V1 finalisée puis contrôles en production.

Le développement et les tests courants restent locaux. La première mise en ligne est réalisée selon le propriétaire ; la campagne complète de compte réel et le workflow coordonné restent à valider selon la [procédure Production](11-PUBLICATION-PRODUCTION.md). Les opérations Cloud restent contrôlées et attribuées. Les URLs de production utilisent `https://my.collectrealm.com`, jamais localhost dans Supabase Cloud.

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

La V1 établit un catalogue Pokémon TCG fiable, des variantes identifiées distinctement, des collections personnalisées ou automatiques et des données personnelles cohérentes à l'échelle du compte.

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
