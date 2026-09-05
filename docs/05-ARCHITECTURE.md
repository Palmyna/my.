# Architecture technique de la V1 de MY.

## Rôle du document

Ce document constitue la source de vérité concernant l'architecture technique de la V1 de **MY.**. Il définit la stack principale, les responsabilités des différentes couches, les flux de données, les principes de sécurité, le déploiement, la maîtrise des coûts et les orientations d'évolutivité.

Il complète la [vision](00-VISION.md), les [fonctionnalités](01-FEATURES.md), la [politique TCGdex](02-TCGDEX.md), le [modèle de données conceptuel](03-DATA-MODEL.md) et les [principes UX/UI](04-UX-UI.md). Il ne constitue ni un schéma SQL, ni une configuration de production, ni un plan d'implémentation détaillé.

## Objectifs architecturaux

L'architecture privilégie :

- la simplicité et la lisibilité ;
- un coût initial aussi faible que possible ;
- la sécurité des données ;
- la maintenabilité ;
- la rapidité de développement ;
- une évolution progressive ;
- l'absence de services ou d'abstractions inutiles.

MY. démarre avec environ deux utilisateurs. La V1 doit fonctionner autant que raisonnablement possible sur les offres gratuites retenues, sans créer une architecture jetable qui imposerait une réécriture complète lors d'une ouverture plus large.

## Stack technique

Les choix suivants sont figés pour la V1 :

| Responsabilité | Choix |
|---|---|
| Frontend | React avec TypeScript |
| Outil de développement et build | Vite |
| Gestionnaire de paquets | npm |
| Routage SPA | React Router |
| Données serveur et cache frontend | TanStack Query |
| Validation des données et de la configuration | Zod |
| Client Supabase frontend | `@supabase/supabase-js` |
| Type d'application | Single Page Application (SPA) |
| Hébergement frontend | Vercel |
| Backend principal | Supabase |
| Base de données | PostgreSQL via Supabase |
| Authentification | Supabase Auth |
| Sécurité des données | PostgreSQL Row Level Security via Supabase |
| Source Pokémon TCG | TCGdex / cards-database |
| Catalogue applicatif | Catalogue local MY. dans PostgreSQL |
| Images Pokémon TCG | Assets ou CDN TCGdex utilisés directement |

La V1 n'utilise ni Next.js ni un framework SSR équivalent. Ce choix répond au caractère authentifié et fortement interactif de l'application. Il pourra être réévalué si une future partie publique crée un besoin important de SEO ou de rendu serveur.

## Architecture générale

```text
Utilisateur
    ↓
Navigateur — MY. : React + TypeScript + Vite (SPA)
    │
    ├──────────→ Vercel
    │               frontend compilé, CDN / HTTPS
    │
    ├──────────→ CDN / assets TCGdex
    │               images de cartes
    │
    └──────────→ Supabase
                    ├── Auth
                    ├── PostgreSQL
                    ├── Storage selon les besoins cadrés
                    ├── RLS
                    ├── fonctions SQL / RPC si nécessaire
                    └── logique serveur privilégiée si nécessaire

Processus de synchronisation dans un environnement de confiance
    ├──────────→ TCGdex / cards-database
    └──────────→ Supabase / PostgreSQL
                    ↓
                Catalogue local MY.
```

Vercel héberge le frontend compilé par Vite. La SPA React s'exécute dans le navigateur et accède directement à Supabase pour les opérations applicatives simples, sous contrôle Auth et RLS. Supabase reste le backend principal ; aucune logique backend n'est déplacée vers Vercel. TCGdex alimente le catalogue local, mais n'est pas interrogé à chaque consultation utilisateur.

## Frontend

### SPA React

MY. est une SPA React. Cette approche correspond à une application authentifiée et interactive centrée sur un dashboard, des collections, des listes, des grilles, des classeurs, des recherches et des panneaux de détail.

La navigation applicative est gérée côté client avec React Router. Les routes pourront notamment représenter la homepage, la connexion, l'inscription, le dashboard, une collection et le profil. La Phase 0 prépare uniquement le routeur et une route temporaire de bootstrap.

Vercel devra permettre l'accès direct et le rafraîchissement des routes internes de la SPA. Le mécanisme précis de rewrite ou de fallback SPA sera défini et configuré lors du déploiement effectif. La présente décision d'hébergement n'ajoute aucune configuration de déploiement et ne modifie pas React Router.

### TypeScript

Le frontend est développé en TypeScript avec une configuration suffisamment stricte. TypeScript doit notamment :

- fiabiliser les échanges avec Supabase ;
- représenter clairement les entités ;
- sécuriser la manipulation des variantes ;
- réduire les erreurs ;
- faciliter l'évolution du produit.

### Vite

Vite assure le développement local, le bundling et le build de production. Il produit l'application statique destinée à être hébergée sur Vercel.

### Organisation du code

Le frontend doit distinguer conceptuellement :

- les composants de présentation ;
- les fonctionnalités ;
- l'accès aux données ;
- la logique métier partagée ;
- les types applicatifs.

Le socle de la Phase 0 distingue `src/app/` pour l'application, les providers et les routes, `src/services/` pour l'accès aux données et services, `src/lib/` pour la logique partagée, `src/types/` pour les types et `src/test/` pour la configuration des tests. Les tests sont placés à côté du code testé. `src/components/` et `src/features/` accueilleront les composants partagés et les fonctionnalités au premier besoin, sans dossiers vides anticipés. Une architecture dite « enterprise » ou excessivement abstraite n'est pas justifiée pour la V1.

### État frontend

L'état local reste local lorsqu'il n'a pas besoin d'être partagé. Les données serveur sont traitées comme des données distantes. Aucun système lourd de gestion d'état global n'est imposé par défaut.

TanStack Query est retenu pour les requêtes et le cache des données serveur. Son provider est préparé dès la Phase 0, sans requête métier ni gestionnaire d'état global supplémentaire. Zod est retenu pour valider les données et la configuration.

## Hébergement frontend : Vercel

Vercel est retenu pour :

- construire le frontend Vite ;
- héberger et servir les fichiers statiques ;
- fournir le CDN de l'application ;
- fournir HTTPS ;
- gérer éventuellement le domaine ;
- déployer depuis le dépôt GitHub ;
- permettre ultérieurement les previews de branches ou de pull requests lorsqu'elles sont utiles ;
- servir correctement les routes de la SPA.

Supabase reste le backend principal. Les opérations applicatives simples continuent à aller directement du navigateur vers Supabase, sous contrôle Auth, RLS et contraintes de base. Vercel Functions ne constituent pas par défaut un nouveau backend applicatif ni un intermédiaire obligatoire devant Supabase.

```text
Flux applicatif courant : Navigateur → Supabase (Auth / RLS)

Flux éventuel, après cadrage : Navigateur → Vercel Functions → Supabase
```

L'utilisation éventuelle de Vercel Functions ne peut être introduite qu'en réponse à un besoin réel, après cadrage et validation. Elle ne doit pas déplacer par défaut la logique backend de Supabase vers Vercel.

Vercel n'est pas encore configuré, le dépôt n'y est pas importé et aucun déploiement de production n'est en place.

## Supabase et PostgreSQL

### Backend principal

Supabase fournit le backend applicatif principal :

- PostgreSQL ;
- Supabase Auth ;
- l'API de données ;
- la Row Level Security ;
- les fonctions PostgreSQL et RPC ;
- les Edge Functions lorsqu'elles sont nécessaires.

La V1 n'ajoute pas de serveur Node, Express, NestJS ou Fastify permanent devant Supabase.

### PostgreSQL comme source de vérité

Les données persistantes de MY. sont stockées dans PostgreSQL.

Le catalogue comprend notamment les Pokémon, séries ou blocs, sets, cartes, variantes, rattachements et corrections MY.

Les données utilisateur comprennent notamment les profils, collections, éléments de collection, exemplaires, partages et paramètres nécessaires.

Le schéma physique reste hors périmètre de ce document et doit respecter le [modèle conceptuel](03-DATA-MODEL.md) ainsi que le [schéma PostgreSQL / Supabase](06-DATABASE.md).

### Supabase Auth

Supabase Auth gère l'identité technique, la création de compte, la connexion, la déconnexion et les sessions. MY. ne met pas en place de système de mots de passe maison.

Le profil MY. demeure distinct de l'identité Auth. Les méthodes d'authentification proposées dans la V1 restent à préciser.

## Sécurité et contrôle d'accès

### Row Level Security

La Row Level Security PostgreSQL constitue la fondation de la sécurité des données utilisateur. Les règles doivent conceptuellement garantir que :

- un utilisateur lit et modifie ses propres données ;
- il ne peut pas modifier les données d'un autre compte ;
- une collection partagée n'est visible que par ses destinataires autorisés ;
- le destinataire d'un partage reste strictement en lecture seule ;
- les exemplaires d'un autre utilisateur ne sont visibles que dans le contexte réellement partagé ;
- les autres données privées restent invisibles ;
- un utilisateur ordinaire ne peut pas modifier le catalogue global.

Les principes de politiques sont définis dans le [schéma PostgreSQL / Supabase](06-DATABASE.md). Leur SQL final reste à écrire et à tester dans les migrations.

### Le frontend n'est pas une frontière de sécurité

Masquer un bouton dans React ne suffit pas à interdire une opération. Les permissions doivent être appliquées côté base ou backend.

Une collection partagée est donc en lecture seule à la fois dans l'UX et dans les contrôles RLS ou serveur. Un appel direct à l'API ne doit pas permettre de contourner les règles fonctionnelles.

### Clés publiques et secrets

Les valeurs conçues pour le navigateur, telles que l'URL Supabase et la clé publique appropriée, peuvent être injectées dans la configuration frontend. La sécurité ne dépend pas du secret de cette clé, mais de Supabase Auth, de la RLS et des contraintes de base.

La clé Supabase `service_role`, ou toute autre clé privilégiée :

- ne doit jamais être envoyée au navigateur ;
- ne doit jamais être placée dans une variable `VITE_*` ;
- ne doit jamais être commitée dans Git ;
- ne doit jamais apparaître dans du JavaScript public.

Les secrets privilégiés restent exclusivement dans un environnement de confiance.

### Confidentialité du partage

Une collection partagée ne donne pas accès à l'ensemble du compte du propriétaire. Seules les informations nécessaires à la consultation de cette collection doivent être exposées.

La recherche d'un destinataire par son identifiant public MY. ne doit retourner que les informations nécessaires pour confirmer l'utilisateur et créer le partage. Une vue limitée, une RPC ou un mécanisme équivalent pourra être choisi ultérieurement.

## Accès aux données et opérations métier

### Accès direct du frontend à Supabase

Les opérations simples et autorisées pourront être réalisées directement depuis React avec `@supabase/supabase-js`, retenu comme client Supabase, notamment :

- consulter ses collections ou une collection partagée ;
- gérer ses exemplaires ;
- modifier une note ou son profil ;
- consulter le catalogue ;
- effectuer une recherche.

Ces accès restent protégés par Auth, la RLS et les contraintes de la base.

### Opérations autoritatives

Une opération qui touche plusieurs ensembles de données, doit être atomique, applique des invariants, calcule une structure automatique ou nécessite des privilèges serveur ne doit pas être orchestrée naïvement depuis React.

Elle doit être centralisée dans une opération métier côté base ou backend. Lorsqu'elle est principalement liée aux données et doit être transactionnelle, une fonction PostgreSQL exposée via RPC est privilégiée si elle simplifie correctement le système.

Les RPC servent notamment à créer une collection automatique, produire et appliquer sa mise à jour, résoudre un destinataire et créer un partage, ou réaliser une réorganisation complexe. Leur code et leurs signatures SQL finales restent à définir.

### Edge Functions

Les Supabase Edge Functions peuvent être utilisées pour appeler un service externe depuis une zone de confiance, protéger un secret ou exécuter une logique serveur interactive qui ne convient pas directement à PostgreSQL.

Elles ne doivent pas devenir une couche obligatoire devant toutes les requêtes.

### Opérations privilégiées

L'écriture dans le catalogue global, la synchronisation TCGdex, les corrections administratives et certaines opérations de maintenance s'exécutent uniquement dans un environnement de confiance. Le navigateur ne possède jamais les privilèges correspondants.

## Collections automatiques

### Génération autoritative

Le frontend ne doit pas charger tout le catalogue pertinent, décider seul de l'éligibilité puis insérer chaque élément automatique de manière non contrôlée.

La création utilise le catalogue local MY. et une opération métier autoritative.

```text
Cible Pokémon
Pokémon → rattachements carte-Pokémon
        → variantes françaises éligibles
        → éléments automatiques

Cible Extension
Set → cartes du set
    → variantes françaises éligibles
    → éléments automatiques
```

Une Extension désigne ici un set précis, non une série ou un bloc TCGdex. Dans les deux cas, chaque variante française pertinente demeure une unité distincte et l'ordre canonique de MY. est appliqué.

### Mise à jour autoritative et contrôlée

Le frontend demande ou reçoit le résumé des changements, l'affiche puis recueille la validation explicite de l'utilisateur.

La base ou le backend applique ensuite la mise à jour de manière cohérente et transactionnelle, garantit les invariants et préserve les éléments manuels, les exemplaires et les autres données utilisateur. Le frontend ne décide pas seul quels éléments automatiques insérer.

La synchronisation du catalogue ne modifie jamais silencieusement une collection utilisateur.

## Catalogue local et synchronisation TCGdex

### Flux de données

Le dépôt `tcgdex/cards-database` est la source technique principale du pipeline. MY. utilise ensuite son catalogue PostgreSQL local pour les consultations, recherches et générations automatiques.

```text
Snapshot cards-database identifié → synchronisation de confiance → catalogue local MY. → application
```

Chaque snapshot est identifié par le commit SHA Git utilisé. L'API REST TCGdex reste auxiliaire pour les vérifications, diagnostics ou besoins spécifiques ; elle n'est pas une seconde source automatiquement fusionnée.

### Synchronisation dans un environnement de confiance

Le processus doit pouvoir :

- lire un snapshot identifié de `cards-database` ;
- les transformer vers le modèle MY. ;
- détecter les changements ;
- appliquer les données source puis les corrections MY. versionnées dans Git ;
- mettre à jour le catalogue.

Il ne s'exécute pas depuis le navigateur avec des droits d'écriture sur le catalogue.

### Import initial et rythme de synchronisation

L'import initial utilise autant que possible le même pipeline fiable et reproductible que les synchronisations ultérieures. Une infrastructure lourde n'est pas nécessaire pour cette opération.

Au début, la synchronisation est lancée manuellement selon les besoins. Elle retraite le catalogue utile, préserve les IDs internes et reste reproductible et idempotente.

Une automatisation simple pourra être ajoutée ultérieurement via Supabase, GitHub Actions ou un autre mécanisme adapté. Le déclencheur et la fréquence exacts restent ouverts. Aucun scheduler payant ou worker permanent n'est requis au démarrage.

### Catalogue ciblé

PostgreSQL ne doit pas recevoir aveuglément toutes les données brutes de TCGdex. Le catalogue conserve principalement les informations utiles à MY., à la synchronisation, à la comparaison et à la traçabilité.

Les données de gameplay inutiles et une copie complète de chaque payload « au cas où » ne sont pas conservées par défaut. Un futur besoin de snapshots complets devra être cadré séparément.

### Corrections locales

Les corrections MY. ont pour source de vérité des fichiers versionnés dans Git. Le pipeline les applique dans une couche serveur contrôlée du catalogue ; les tables privées peuvent refléter leur état appliqué. La recherche, l'affichage et les collections automatiques consomment la valeur effective fournie par le catalogue.

Le mécanisme physique des corrections reste ouvert. La V1 ne nécessite pas obligatoirement de back-office graphique ; des outils réservés aux mainteneurs peuvent suffire initialement.

## Images

Dans la V1, les images de cartes ne sont pas copiées dans Supabase Storage. Le catalogue conserve les informations nécessaires pour utiliser l'asset TCGdex pertinent, puis le navigateur charge directement l'image depuis le CDN ou le service d'assets TCGdex.

```text
Navigateur → CDN / assets TCGdex
```

Cette approche limite le stockage, la bande passante, les duplications et les coûts. Le frontend doit pouvoir utiliser le lazy loading, une qualité adaptée au contexte et un fallback lorsqu'une image manque. Une grande collection ne doit pas télécharger immédiatement toutes ses images en haute résolution.

Supabase Storage pourra être envisagé plus tard pour de véritables fichiers propres au produit ou aux utilisateurs, sans être ajouté par défaut.

## Recherche et requêtes

La recherche de la V1 repose sur PostgreSQL et Supabase pour :

- la recherche interne aux collections ;
- la recherche dans le catalogue ;
- la recherche de Pokémon ;
- la recherche d'extensions.

La V1 n'introduit pas Algolia, Elasticsearch, Meilisearch hébergé ou un autre moteur externe. Le mécanisme SQL exact reste ouvert.

Le navigateur ne doit pas charger tout le catalogue pour effectuer une recherche. Les requêtes doivent pouvoir être filtrées, paginées et limitées aux données nécessaires.

## Vue classeur et temps réel

La pagination visuelle du classeur est principalement calculée par le frontend à partir de l'ordre des éléments, du format de page et du mode continu ou par blocs. Il n'est pas nécessaire de persister chaque page virtuelle en base.

La V1 ne nécessite pas Supabase Realtime. Le partage en lecture seule ne justifie pas une architecture collaborative en temps réel. Realtime ne doit pas être activé sans besoin réel.

## Coûts et dimensionnement

### Objectif initial

L'objectif est un coût d'infrastructure aussi proche que possible de `0 € / mois` pendant la phase initiale d'environ deux utilisateurs.

Les offres gratuites de Supabase et Vercel sont privilégiées tant qu'elles répondent aux besoins. Leurs quotas ne sont pas figés dans l'architecture : ils doivent être surveillés, et un plan supérieur ne sera choisi qu'en réponse à un besoin mesuré.

### Garde-fous

La V1 évite sans besoin réel :

- un backend ou VPS payant ;
- une base de données supplémentaire ;
- Redis ;
- un moteur de recherche externe ;
- le stockage ou le proxy des images TCGdex ;
- un worker permanent ou une queue distribuée ;
- un monitoring ou des analytics payants ;
- un cron externe payant ;
- Realtime ;
- une Vercel Function pour chaque requête ;
- l'import de données TCGdex inutiles.

Chaque nouveau service doit répondre à un besoin concret.

### Mesures à surveiller

Avec la croissance du projet, il faudra suivre notamment :

- la taille de PostgreSQL ;
- la bande passante Supabase ;
- les utilisateurs actifs et le volume de requêtes ;
- l'exécution des fonctions ;
- la consommation Vercel et la fréquence des builds ;
- les performances de recherche ;
- la durée des synchronisations.

Le passage à une offre payante doit être déclenché par des métriques réelles.

## Environnements et configuration

MY. distingue le développement et la production. La Phase 0 prépare Supabase local avec sa CLI installée comme dépendance de développement npm et sa configuration versionnée. Elle ne lie ni ne modifie le projet cloud. Le staging éventuel et la configuration de production restent ouverts.

Les URL, clés publiques et autres paramètres sont injectés par environnement. La configuration de production n'est pas codée en dur. Les données de production ne doivent pas être utilisées inconsidérément pendant le développement.

## Versionnement et déploiement

### GitHub et Vercel

Le dépôt GitHub est la source de référence du code et de la configuration versionnée. Il doit contenir le frontend, les scripts, les migrations, la documentation et la configuration non secrète. Aucun secret ne doit y être commité.

Lors du déploiement effectif, Vercel construira et déploiera le frontend depuis GitHub selon le flux prévu :

```text
Push GitHub → build Vite sur Vercel → frontend statique déployé sur Vercel
```

La branche de production, la configuration Vercel et les règles détaillées restent à définir. Les previews de branches ou de pull requests pourront être utilisées ultérieurement lorsqu'elles apportent une valeur réelle, sans provoquer volontairement un grand nombre de builds inutiles. Ce flux n'est pas encore configuré.

### Migrations PostgreSQL

Les évolutions de structure de la base doivent être versionnées par des migrations reproductibles. La production ne doit pas dépendre uniquement de modifications manuelles non tracées dans le dashboard Supabase.

Les migrations définissent principalement la structure. Le catalogue TCGdex volumineux est alimenté par l'import ou la synchronisation plutôt que par de gigantesques migrations SQL.

Le déploiement des migrations reste contrôlé. Un simple changement frontend ne doit pas pouvoir appliquer accidentellement une migration destructive en production. Une automatisation CI pourra être ajoutée plus tard si elle apporte une vraie valeur.

## Qualité, tests et exploitation

### Qualité du code

Le développement privilégie un code lisible, des responsabilités claires, des composants raisonnablement petits, des types explicites, la suppression du code mort et les abstractions seulement lorsqu'elles sont utiles.

### Vérifications

Les changements importants doivent pouvoir être vérifiés au minimum par le build Vite, la vérification TypeScript, ESLint et les tests pertinents. La Phase 0 retient Vitest, React Testing Library et jest-dom avec jsdom comme environnement DOM. Les commandes npm sont documentées dans le README.

### Tests prioritaires

Les tests ciblent en priorité les zones comportant une logique métier ou un risque réel :

- la génération automatique pour Pokémon et Extension ;
- l'ordre des variantes ;
- les mises à jour des collections automatiques ;
- le calcul de progression ;
- la pagination du classeur ;
- les règles de partage ;
- les politiques RLS et la protection des données ;
- la synchronisation TCGdex ;
- la conservation des corrections locales.

Les scénarios RLS doivent notamment couvrir le propriétaire, un utilisateur non autorisé, le destinataire d'un partage, un utilisateur non authentifié et un processus privilégié de synchronisation.

Il n'est pas nécessaire de tester mécaniquement chaque détail de présentation.

### Logs, monitoring et sauvegardes

Au démarrage, MY. privilégie les outils de diagnostic fournis par Supabase, Vercel et le navigateur. Aucun service de monitoring payant n'est requis par défaut.

Les données utilisateur ne sont jamais considérées comme jetables. Les migrations et synchronisations potentiellement destructrices doivent être conçues prudemment. La politique détaillée de sauvegarde évoluera avec le stade du projet et le plan Supabase disponible.

## Premium post-V1

Une future offre Premium sur abonnement reste une possibilité d'évolution. La centralisation des opérations automatiques doit permettre d'ajouter ultérieurement un contrôle de droit sans réécrire toute l'application.

La V1 n'intègre cependant :

- aucun abonnement ou paiement ;
- aucun fournisseur tel que Stripe ;
- aucun entitlement, plan ou quota Premium ;
- aucun checkout ;
- aucune restriction des collections automatiques ;
- aucune table de facturation, facture, historique de paiement ou webhook commercial.

La préparation demandée est uniquement architecturale : les opérations importantes sont autoritatives et le frontend n'est pas la seule autorité.

## Évolutivité

L'architecture doit accompagner une progression naturelle :

1. usage privé par environ deux utilisateurs sur les offres gratuites ;
2. ouverture à un petit groupe avec la même architecture et surveillance des quotas ;
3. ouverture publique, optimisation et éventuelle montée en gamme des services ;
4. éventuelle offre Premium avec droits et paiement seulement après cadrage.

Une augmentation des capacités Supabase ou Vercel ne doit pas exiger de remplacer React, Vite, Vercel, Supabase ou PostgreSQL. Chaque phase ajoute seulement la complexité devenue nécessaire.

## Technologies et services exclus de la V1

Sans nouveau besoin explicite, la V1 n'introduit pas :

- Next.js ou SSR ;
- backend Node séparé ou microservices ;
- Redis ;
- Elasticsearch, Algolia ou autre moteur de recherche externe ;
- queue distribuée ou worker permanent ;
- Kubernetes, serveur dédié ou VPS ;
- proxy d'images ou copie locale complète des images TCGdex ;
- Supabase Realtime ou WebSocket applicatif ;
- système de paiement ou infrastructure Premium ;
- service externe payant supplémentaire.

## Éléments laissés ouverts

Les choix suivants seront définis lors des étapes ultérieures, dans les limites du [schéma PostgreSQL / Supabase](06-DATABASE.md) :

- le SQL final des tables, index, contraintes et migrations ;
- le code final des politiques RLS et des fonctions RPC ;
- la stratégie physique des corrections locales ;
- l'algorithme final d'ordre et les détails de calcul des hashes de structure ;
- la bibliothèque d'interface éventuelle ;
- le découpage détaillé des futures fonctionnalités dans la structure initialisée ;
- les méthodes précises d'authentification ;
- le staging éventuel et la stratégie de production au-delà du développement Supabase local ;
- la configuration détaillée de Vercel, dont le rewrite ou fallback des routes SPA lors du déploiement effectif ;
- la fréquence et le déclencheur de l'automatisation future du pipeline décrit dans [07-CATALOG-SYNC.md](07-CATALOG-SYNC.md) ;
- l'utilisation exacte des Edge Functions ;
- la politique détaillée de sauvegarde ;
- la branche de production et l'automatisation CI ;
- les seuils précis de passage aux offres payantes ;
- le modèle Premium et un éventuel fournisseur de paiement.

Ces éléments ne doivent pas être considérés comme décidés avant leur cadrage et leur validation.
