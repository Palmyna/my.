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
| Catalogue applicatif | Catalogue MY. dans PostgreSQL, disponible localement et dans Supabase cloud |
| Images Pokémon TCG | Assets ou CDN TCGdex utilisés directement |

La V1 n'utilise ni Next.js ni un framework SSR équivalent. Ce choix répond au caractère authentifié et fortement interactif de l'application. Il pourra être réévalué si une future partie publique crée un besoin important de SEO ou de rendu serveur.

## Architecture générale

Architecture cible ; l'hébergement Vercel n'est pas encore configuré :

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

Vercel hébergera le frontend compilé par Vite lors de la mise en production. La SPA React s'exécute dans le navigateur et accède directement à Supabase pour les opérations applicatives simples, sous contrôle Auth et RLS. Supabase reste le backend principal ; aucune logique backend n'est déplacée vers Vercel. TCGdex alimente le catalogue local, mais n'est pas interrogé à chaque consultation utilisateur.

## Frontend

### SPA React

MY. est une SPA React. Cette approche correspond à une application authentifiée et interactive centrée sur un dashboard, des collections, des listes, des grilles, des classeurs, des recherches et des panneaux de détail.

La navigation applicative est gérée côté client avec React Router. Les routes conceptuelles comprennent la homepage, les parcours d'authentification et pages légales, puis Dashboard, Pokémon catalogue, Extension catalogue, Carte catalogue, Collection, Profil et Paramètres. Ces sept dernières destinations restent authentifiées. `AuthenticatedLayout`, distinct d'`AuthLayout`, regroupe les routes livrées `/dashboard`, `/collections/:collectionId`, `/catalog/pokemon/:pokemonId`, `/catalog/extensions/:setId`, `/profile` et `/settings`. Leur accès exige toujours l'état autorisé email confirmé / TOTP vérifié / `aal2` ; les parcours MFA et de récupération restent prioritaires. Un utilisateur autorisé conserve sa route authentifiée, tandis que les routes publiques/Auth le redirigent vers `/dashboard`. Les routes Catalogue livrées utilisent les IDs internes MY. ; la route Carte reste à définir.

`AuthenticatedHeader` conserve le logo blanc à gauche, vers `/dashboard`. Le grand champ de recherche, centré dans l'espace disponible, reste uniquement visuel (sans requête, suggestion ni moteur). Le bouton « Mon compte » porte l'initiale de l'email ; son menu accessible propose Profil, Paramètres et Déconnexion via l'action Auth existante. Il se ferme au clic extérieur, avec Escape, en quittant le menu au clavier ou lors d'une navigation. Les micro-animations respectent la préférence de réduction des mouvements. Sur tablette et mobile, la recherche passe sur une seconde ligne ; le logo diminue et le bouton se compacte sur mobile. La fondation 6F.1 utilise un jeu commun de tokens sémantiques dans `:root` : graphite sombre, actions principales rouges unies, actions secondaires neutres, suppressions distinctes et focus à contour visible avec halo discret. Les écrans publics et Auth utilisent cette même palette, avec leurs structures, dimensions et parcours existants. La navigation et la déconnexion temporaires ont été retirées du contenu du shell.

Les pages partagent le shell, des espacements adaptés à l'écran et un `h1` accessible, focalisé lors de la navigation. Dashboard et Collection exploitent le contenu du shell jusqu’à 1 520 px avec au moins 24 px de marge latérale ; Profil est limité à 1 000 px depuis 6F.4 ; Paramètres reprend cette largeur depuis 7C.1. Dashboard utilise une seule grille personnelle/partagée, les statuts `Personnelle` et `Partagée · Lecture seule`, et un FAB de création personnalisée ; il conserve le message éventuel après changement de mot de passe. `useFooterAwareFab` partage les mesures du footer et safe areas avec le FAB contextuel propriétaire de Collection. Le Profil modernisé conserve le contrat MY.ID/copie, email, mot de passe, Authenticator et suppression du compte. Le composant `SiteFooter` est commun aux shells public/Auth et authentifié. Il conserve la classe `.site-footer` et sa place comme enfant direct du shell, utilisées par `useFooterAwareFab`. Il affiche les conditions et le copyright MY. avec la version applicative injectée par Vite depuis `package.json`, sur la surface graphite existante ; sa hauteur suit le retour à la ligne responsive. Le [rapport Phase 3C](reports/2026-09-12-PHASE3C-SHELL.md) conserve l'état historique du shell minimal. Paramètres livre les trois réglages Affichage depuis 7C.1, dans le langage visuel du Profil. Profil et Paramètres restent accessibles séparément par `Mon compte`, sans raccourci vers Paramètres dans Profil.

Pour les futures pages métier, le routeur et l'état de navigation devront conserver autant que possible page, vue, filtres et scroll lors du retour d'une fiche Carte. Précédente/Suivante réutilisera l'ordre réel du contexte d'origine ; aucune séquence ne sera fabriquée pour une arrivée globale sans liste. Le détail Variante livré dans les collections sera réutilisé par les futures pages Carte, avec actions et données adaptées aux droits du contexte.

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

Le socle de la Phase 0 distingue `src/app/` pour l'application, les providers et les routes, `src/services/` pour l'accès aux données et services, `src/lib/` pour la logique partagée, `src/types/` pour les types et `src/test/` pour la configuration des tests. Les tests sont placés à côté du code testé. `src/components/` et `src/features/` accueillent les composants partagés et les fonctionnalités livrées, dont Dashboard et Collection. Une architecture dite « enterprise » ou excessivement abstraite n'est pas justifiée pour la V1.

### Contrat applicatif Collections

Le [service Collections](../src/services/collections.ts) expose `createCollectionsService(client: SupabaseClient<Database>)`, suivant l'injection déjà utilisée par Auth. Ses [types métier](../src/types/collections.ts) décrivent les entrées et résultats ; les arguments et retours SQL restent inférés depuis les types Supabase générés.

| Opération | Entrée | Résultat |
|---|---|---|
| `listDashboardCollections` | Aucune | `DashboardCollection[]` |
| `getCollectionOverview` | `collectionId` | `CollectionOverview` (dont `ownerId`) |
| `createFree` | `{ name }` | `{ collectionId }` |
| `createAutomatic` | `{ name, targetType: 'pokemon' \| 'set', targetId }` | `{ collectionId, created }` |
| `rename` | `collectionId, name` | `{ collectionId }` |
| `delete` | `collectionId` | `{ collectionId }` |

La création personnalisée via `createFree()` insère uniquement `name` et `collection_type = 'free'`. Le renommage met à jour uniquement `name`, filtré par ID. La suppression cible uniquement le parent `collections` : les cascades des items/partages et la conservation des exemplaires physiques relèvent de PostgreSQL. Les mutations directes utilisent la session du client injecté, sous RLS, sans fournir de propriétaire ni contourner les restrictions de colonnes. Renommage et suppression demandent l'ID effectivement affecté ; zéro ligne renvoie `collection_unavailable`, sans distinguer artificiellement absence et interdiction RLS.

La création automatique appelle exclusivement `create_automatic_collection` avec ses trois paramètres. Elle ne lit ni ne calcule variantes, rangs, hash ou version. `created = false` est un résultat normal d'ouverture de l'existante. Les noms sont transmis intacts ; aucune prévalidation TypeScript ne remplace la règle PostgreSQL des trois caractères utiles après trim, ni n'empêche la RPC de retourner une existante avec un nom fourni invalide. `targetId` reprend le type numérique de la signature générée.

`CollectionsError` expose uniquement un code métier stable dans `code` et `message`, sans erreur serveur brute, `details`, `hint` ni `cause`. Le mapping utilise les erreurs observées dans la base locale et les contrats de la [RPC autoritative](06-DATABASE.md#création-transactionnelle) :

| Code métier | Signal reconnu |
|---|---|
| `invalid_name` | `23514` avec la contrainte `collections_name_check`, ou `23502` identifiant `collections.name` |
| `invalid_target` | `22023` avec le message livré pour type invalide ou ID absent |
| `target_not_found` | `P0002` avec `Automatic target does not exist` |
| `automatic_state_missing` | `P0002` avec `automatic_target_state_missing` |
| `automatic_state_inconsistent` | `23514` avec `automatic_target_hash_mismatch` |
| `empty_automatic_target` | `23514` avec `automatic_collection_empty` |
| `not_authorized` | `42501` ou refus JWT PostgREST `PGRST301`, `PGRST302`, `PGRST303` |
| `collection_unavailable` | Renommage/suppression sans ligne affectée ; overview sans ligne visible ou identifiant manifestement invalide |
| `unexpected` | Toute autre erreur, rejet réseau ou réponse absente/malformée hors contrat |

Les détails d'une erreur ne sont pas analysés comme preuve d'un nom invalide : ils peuvent contenir la ligne et ses valeurs. Un code SQL générique sans le signal spécifique attendu reste `unexpected`. Aucun retry de mutation n'est effectué par le service ; une erreur réseau ne prouve pas que la mutation a été annulée. Les [tests unitaires du service](../src/services/collections.test.ts) contrôlent les payloads, filtres, retours et erreurs sans reproduire le calcul canonique SQL. L'interface et son intégration restent séparées de ce contrat.

La lecture Dashboard effectue un seul `SELECT` sur la [vue `dashboard_collections`](06-DATABASE.md#lecture-dashboard), sans requête par collection. `DashboardCollection` contient `collectionId`, `name`, `collectionType`, `access` (`owned`/`shared`), `targetType`, `targetName`, `ownedCount` et `totalCount`. Le serveur déduit l'accès de l'identité Auth et calcule la possession du propriétaire, même pour une collection partagée. Le service traduit les noms SQL, conserve les noms de cible absents comme `null` et ne calcule ni progression ni ordre visuel. Une liste vide reste `[]` ; les réponses malformées ou incohérentes lèvent `CollectionsError('unexpected')`, et les refus explicites suivent le mapping existant. Les restrictions RLS peuvent produire une liste vide sans erreur explicite : le service ne la présente pas comme une preuve d'authentification.

La page `/collections/:collectionId`, ajoutée sous le même `AuthenticatedLayout`, conserve les gardes Auth existantes et fonctionne en accès direct. `getCollectionOverview` lit `dashboard_collections`, filtré exactement par `collection_id`, avec `maybeSingle()` et le mapper Dashboard existant, puis complète l'overview avec `collections.owner_id` sous RLS. Le propriétaire réel est transmis aux exemplaires, sans fallback vers le lecteur. Aucune ligne visible produit `collection_unavailable`, sans distinguer absence, collection tierce ou partage retiré. Un UUID manifestement invalide produit le même code avant toute requête ; les réponses malformées restent `unexpected`. Aucune nouvelle vue ni lecture d'items n'est nécessaire pour l'overview.

La [page Collection](../src/features/collections/CollectionPage.tsx) utilise la clé TanStack Query `['collections', 'detail', userId, collectionId]`, indépendante de celle du Dashboard, sans retry automatique. Un échec de lecture masque également une éventuelle donnée en cache. Les libellés, couleurs déterministes et la présentation de progression sont partagés avec les tuiles. La page met à jour `document.title` après réception du nom ; le focus de navigation reste géré par `AppRoutes` sur un `h1` persistant.

### Contenu, exemplaires et réorganisation — Phase 6

Le contenu est chargé après overview autorisé via `getCollectionContent` et la RPC `get_collection_content`, avec `collectionContentKey(viewerId, collectionId)`. Son tableau complet, y compris items historiques, conserve l'ordre backend, les métadonnées et la possession du propriétaire. La recherche interne 6D.1 filtre uniquement ce tableau déjà chargé : normalisation, AND multi-termes sur carte, Extension, abréviations, série, numéro et variante, sans réseau, score ni tri. Un filtre masquant des items désactive le reorder.

Le service des exemplaires conserve les IDs BIGINT en chaînes décimales. `physical_copies` appartient au compte et à la variante, jamais à une collection : CRUD propriétaire, lecture partagée, nom facultatif, fallback dynamique `Exemplaire N`, note libre nullable limitée à 750 caractères et aucun grading structuré actif. Le cache distingue lecteur, propriétaire réel et variante ; ajout/suppression invalident les lectures de possession concernées, modification du nom/note sans recalcul indépendant de possession.

Le reorder appelle `reorder_collection_item` pour `start`/`end`/`before`/`after` ; midpoint, rebalance et concurrence appartiennent au backend. `get_collection_item_order` reste une lecture technique, avec invalidation/relecture de l'ordre et du contenu après succès ou erreur. Le DnD propriétaire souris/tactile/clavier conserve uniquement un ordre visuel transitoire pendant la sauvegarde et les relectures pour éviter le snap-back ; aucun cache optimiste ni calcul JavaScript de `sort_position`. L'ordre backend remplace cet état et le frontend ne devient jamais une vérité permanente. Aucun DnD partagé.

### Contrat de lecture du détail Variante — 6E.1

Le [service `getVariantDetail`](../src/services/variant-detail.ts) appelle exclusivement `get_variant_detail(p_variant_id bigint)` via le client Supabase authentifié. Le [type `VariantDetail`](../src/types/variant-detail.ts) décrit ses vingt champs camelCase, sans contexte de collection, possession ou donnée personnelle. La RPC lit seulement les quatre tables catalogue en `SECURITY INVOKER` : les RLS MFA/profil existantes restent applicables, sans lecture directe de `profiles` dans son corps.

Le service valide les vingt champs, leurs nullabilités, le tableau de stamps et les valeurs de provenance, refuse les champs supplémentaires et un ID de réponse différent de l'ID demandé. Il réutilise `variantIdString` et adapte uniquement le type de l'argument RPC `BIGINT` en texte, sans conversion en nombre. Un ID invalide échoue avant l'accès Supabase (`variant_unavailable`). Un résultat SQL `NULL`, pour absence ou invisibilité RLS, donne également `variant_unavailable` ; les refus explicites de permission/JWT donnent `not_authorized`, les réponses malformées et autres erreurs `unexpected`, sans exposer les détails serveur.

La lecture inclut les variantes historiques/inactives, conserve date/provenance et stamps persistés, et délègue le fallback image variante/carte à PostgreSQL. Aucun assemblage catalogue côté navigateur. Ce contrat autonome est consommé par l'interface 6E.2. La migration additive précède son consommateur ; les lecteurs existants restent compatibles.

### Détail contextuel et exemplaires intégrés — 6E.2

[`VariantDetailPanel`](../src/features/variant-detail/VariantDetailPanel.tsx) est monté depuis la zone principale de `CollectionContentRow`, sans navigation. Son état conserve uniquement l'ID exact en chaîne et le déclencheur de focus ; aucune métadonnée n'est reconstruite depuis `CollectionContentItem`. La query `['variant-detail', viewerId, variantId]` appelle seulement `getVariantDetail`, sans retry automatique ni données de substitution d'une autre variante. La frontière Auth et la clé de composant lecteur/propriétaire/variante isolent le contenu ; la perte d'autorisation démonte le panneau. Les champs vides sont omis et la date civile est formatée en français avec un fuseau UTC explicite.

[`PhysicalCopiesContent`](../src/features/physical-copies/PhysicalCopiesContent.tsx) porte la query existante lecteur/propriétaire/variante, les mutations, formulaires, notes, noms automatiques, focus de formulaire, erreurs et invalidations. Il est partagé par `PhysicalCopiesDialog` et le panneau, chacun conservant son enveloppe de dialog natif. Le petit contrat impératif de fermeture consulte le verrou synchrone de mutation : aucune double soumission ni fermeture pendant la mutation et les relectures attendues. La même gestion clavier contient le focus ; chaque enveloppe bloque le scroll arrière et restaure le focus sans scroll. Le panneau mesure au plus 620 px, occupe `100dvh` et passe plein écran à 640 px ; la croix reste hors du scroll interne, sans en-tête visuel. `CardImage` partage son fallback entre tailles compacte et détail.

La possession affichée dérive de la liste d'exemplaires relue, jamais d'un état optimiste indépendant. Le `ownerId` réel est transmis en partage, avec consultation des noms/notes et aucune écriture. `invalidateCopyPossession` reste inchangé : ajout/suppression invalident les lectures existantes concernées ; modifier nom/note ne rafraîchit pas la possession des collections. Les actions ne changent pas leur structure. Le dialogue direct demeure compatible ; retour arrière frontend possible en retirant le déclencheur et le panneau, sans opération DB ni altération de données. Aucun changement de route, de règle de reorder, de DB ou de Cloud dans cette étape.

### État frontend

En 5D.2, les wrappers runtime `renameCollection(collectionId, name)` et `deleteCollection(collectionId)` obtiennent le client Supabase courant puis délèguent aux méthodes injectées existantes, avec `not_authorized` en l'absence de client. Les deux dialogs utilisent `useMutation`, sans retry automatique. Après un renommage confirmé, les lectures en cours du détail et du Dashboard courant sont annulées ; leur nom en cache est mis à jour sans modifier les autres champs, puis ces deux clés exactes sont invalidées pour relecture autoritative. Après suppression confirmée, la lecture détail est annulée et sa query retirée ; sa tuile est également retirée du cache Dashboard avant sa relecture, puis la page navigue vers `/dashboard` et invalide uniquement son Dashboard. Une mutation renvoyant `collection_unavailable` retire le détail en cache et affiche l'état sûr. Aucun cache d'un autre utilisateur ni invalidation globale n'est concerné ; une réponse tardive après démontage ne recrée pas les données d'une session quittée.

L'état local reste local lorsqu'il n'a pas besoin d'être partagé. Les données serveur sont traitées comme des données distantes. Aucun système lourd de gestion d'état global n'est imposé par défaut.

TanStack Query est retenu pour les requêtes et le cache des données serveur. Son provider est préparé dès la Phase 0, sans requête métier ni gestionnaire d'état global supplémentaire. Zod est retenu pour valider les données et la configuration.

Le socle Phase 7A.3 conserve les préférences serveur privées dans `public.user_preferences`, liées au profil et accessibles via Supabase sous RLS. Modes catalogue : `list | cards` ; modes Collection : `list | cards | binder`. Chaque préférence d'ouverture accepte aussi `last_used`, résolu par son dernier mode explicitement choisi ; aucun mode de vue par collection. Une ligne absente utilise `last_used`, `list` initial et `binder_default_format = 3x3`, sans écriture ni trigger de signup.

Formats Classeur V1 exactement `2x2`, `3x3`, `4x3`. `binder_default_format` est global au compte ; `public.collection_view_preferences` conserve seulement l'override explicite du viewer pour une collection. Absence = héritage dynamique ; retour au défaut = suppression de l'override. Propriétaire et lecteur autorisé ont des choix indépendants. La RLS vérifie identité du viewer, collection actuellement lisible, MFA et profil via les patterns existants, sans nouvelle RPC ni `SECURITY DEFINER`.

[`src/services/view-preferences.ts`](../src/services/view-preferences.ts) utilise le client Supabase commun et les types générés. UUID, payloads et identités retournées sont validés strictement ; erreurs exposées uniquement par codes applicatifs. La sauvegarde tente un `UPDATE` ciblé, puis un `INSERT` si absent ; un conflit de création concurrente retente une fois le même `UPDATE`. Cette stratégie préserve les champs omis et les grants interdisant de modifier les clés : un merge-upsert PostgREST réécrirait aussi les PK. Les helpers purs de [`src/lib/view-preferences.ts`](../src/lib/view-preferences.ts) résolvent les vues et **override → global → `3x3`**, et dérivent les emplacements du format. La Phase 7A.3 livrait le socle uniquement ; les consommateurs Collection, Catalogue Pokémon et Paramètres sont désormais branchés.

La Phase 7B.1 branche ce socle dans Collection via [`useCollectionView`](../src/features/collections/useCollectionView.ts) : `currentView`, `setCurrentView` et `isPreferencesLoading`. La query `['user-preferences', viewerId]` appelle seulement `getUserPreferences`, sans retry automatique ; le viewer connecté fournit l'identité, même en partage. Ligne absente : defaults 7A.3. Une erreur ou une lecture en cours permet de rendre Liste sans bloquer le contenu. Depuis 7C.1, les options communes de cette query sont réutilisées par Collection, Classeur et Paramètres, avec `staleTime: Infinity` : les réponses de sauvegarde mettent à jour le cache sans refetch de succès. Les transitions Auth purgent toujours le cache.

[`SettingsPage`](../src/features/settings/SettingsPage.tsx) propose trois groupes radio natifs et trois mutations indépendantes vers `saveUserPreferences`, chacune avec un seul champ de défaut. Aucun `last_*` ni override écrit. La sélection reste confirmée par le serveur ; seule la ligne en cours est verrouillée. Les réponses fusionnent uniquement le champ écrit dans le cache commun, y compris pour `lastCollectionView` dans Collection, afin qu'une réponse concurrente plus ancienne ne remplace pas les autres champs confirmés. Les réponses de composants quittés ne repeuplent pas le cache. Chargement et erreur conservent la section et rendent les contrôles indisponibles sans sélection fictive ; Réessayer relance la lecture. Une erreur d'écriture garde la valeur confirmée et permet de choisir à nouveau. Le format Classeur continue de résoudre l'override séparé avant le défaut global ; les héritiers observent immédiatement le cache global. La vue d'une consultation Collection est initialisée une fois après lecture réussie, puis conservée jusqu'à une nouvelle ouverture.

Résolution d'ouverture : `collection_default_view` fixe, ou `last_collection_view` si `last_used`. Le registre [`availableCollectionViews`](../src/features/collections/collection-views.ts) expose `['list', 'cards', 'binder']` depuis 7B.3 ; le sélecteur affiche les trois vues. Le choix de vue conserve l'unique query de contenu et la recherche, sans modifier le défaut global.

Un choix explicite disponible change immédiatement la présentation et appelle `saveUserPreferences(viewerId, { lastCollectionView })`, jamais `collectionDefaultView`. Les sauvegardes sont sérialisées par viewer ; seul le résultat autoritatif entre au cache. Un échec retire le choix transitoire, retrouve le dernier choix confirmé de la consultation (ou la préférence résolue) et relit les préférences, sans message visible ajouté. Les réponses d'une consultation quittée ne repeuplent pas son cache. À l'ouverture d'une autre collection, la préférence globale est résolue à nouveau : un défaut fixe reste indépendant du dernier choix, tandis que `last_used` reprend ce dernier.

L'état de recherche appartient à `CollectionWorkspace` dans la page, avec une frontière viewer + collection indépendante du renderer. [`CollectionContentView`](../src/features/collections/CollectionContentView.tsx), toujours chargé de façon différée, conserve l'unique query de contenu, le tableau ordonné autoritatif, le filtre interne existant et les actions/détails communs. [`CollectionContentRenderer`](../src/features/collections/CollectionContentRenderer.tsx) orchestre Liste/Cartes sans nouvelle lecture de contenu au changement de vue. Les renderers lecture seule sont `CollectionContentList` et `CollectionContentCards` ; la branche propriétaire partage une seule instance de `useCollectionItemReorder` et `CollectionItemReorderList` entre les vues. `CollectionContentRow` et `CompactVariantSummary` gardent les actions, abréviations et `CardImage`, avec présentation de tuile pour Cartes.

La grille CSS détermine les colonnes (`auto-fill`, minimum 168 px, deux colonnes à 600 px et moins). `ResizeObserver` lit les pistes résolues pour projeter le même tableau en rangées horizontales `Droppable`, car `@hello-pangea/dnd` ne prend pas en charge les grilles avec retour à la ligne. Nombre de colonnes figé pendant drag/sauvegarde ; aucune copie permanente d'ordre. Les indices de destination entre rangées sont convertis en ancre `before/after` du tableau commun, puis passent au moteur Phase 6 existant. Ses verrous de mutation, erreurs, relectures contenu/ordre, attente des notifications React et confirmation restent communs ; seul l'ordre de présentation pendant sauvegarde est transitoire. La zone haute de 44 px est superposée à l'image, séparée du détail, invisible au repos, révélée au survol propre/focus ; elle disparaît si filtre partiel ou droits insuffisants. Souris, appui tactile prolongé et clavier utilisent les capteurs natifs existants ; le focus est conservé lors du passage entre rangées et la réduction des animations est respectée. Retour arrière : retirer `cards` du registre et le renderer frontend ; valeurs et données 7A.3 restent compatibles et conservées, sans opération DB.

L'illustration spéciale Pokémon/Extension est choisie à l'ouverture et conservée dans l'état de consultation, sans tirage à chaque rerender ni nouvelle donnée métier couleur. Le choix précis de l'illustration reste ouvert.

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

Vercel n'est pas encore configuré, le dépôt n'y est pas importé et aucun déploiement de production n'est en place. Le déploiement Vercel et la configuration de ses URLs de production sont réservés à la phase finale de mise en production.

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

Le premier facteur V1 est **email + mot de passe uniquement**, avec **confirmation email obligatoire**. Aucun OAuth, magic link de connexion, téléphone, accès anonyme ou passkey n'est proposé. La MFA est obligatoire pour tous, exclusivement via **TOTP/application Authenticator** ; les sessions `aal1` servent à terminer Auth et les sessions `aal2` permettent l'accès aux données selon les policies métier. Aucun choix d'autorisation ne repose sur `user_metadata`.

```text
Signup → email de confirmation → adresse confirmée
Email + mot de passe → aucun TOTP vérifié : enrollment puis vérification
                    → TOTP vérifié existant : challenge
                    → aal2 : accès MY. sous RLS
```

Le profil MY. est créé dans la transaction d'insertion Auth, avant confirmation email, sans accorder d'accès applicatif anticipé. Le trigger et son backfill sont décrits dans [06-DATABASE.md](06-DATABASE.md#création-du-profil). Le profil ne contient ni mot de passe ni secret MFA.

### Contrat frontend Auth des Phases 3A/3B

`src/services/supabase.ts` fournit un seul client typé par `Database`, avec `persistSession` et `autoRefreshToken` activés. En 3B, `detectSessionInUrl` est désactivé : l'état Auth consomme explicitement les callbacks implicites avant toute résolution d'accès MY. `auth-callback.ts` retire immédiatement les tokens/erreurs de l'URL, valide le type et la route attendus, puis transmet les tokens au service `setSession`. Les secrets du callback ne sont jamais placés dans l'état React ni journalisés. La confirmation termine cette session avec `signOut({ scope: 'local' })`, affiche son succès et impose le login email/mot de passe ; aucun profil ni MFA n'est chargé depuis ce lien. Les erreurs ferment l'accès et permettent de revenir à la connexion ou de demander un nouveau lien.

`src/services/auth.ts` encapsule signup, login, logout, session, abonnement Auth, renvoi de confirmation, AAL, liste des facteurs, enrollment/challenge/vérification TOTP et récupération/réinitialisation du mot de passe. Le QR, l'URI et le secret d'enrollment restent uniquement dans l'état local de l'écran : pas de cache global ni de journalisation. Un nouvel enrollment remplace seulement les TOTP non vérifiés abandonnés ; aucun facteur vérifié n'est supprimé par l'interface. Chaque tentative de code crée un challenge neuf. `getProfile()` exige email confirmé et TOTP vérifié avec `aal2`, puis lit sa propre ligne par UUID sous RLS. Il ne crée pas de profil de secours.

`AuthProvider`, intégré dans `AppProviders`, possède un seul état dérivé, lu par `useAuth()` via `useSyncExternalStore`. Supabase reste propriétaire de la session persistée ; aucun second stockage de tokens n'est ajouté. `useAuth()` expose `session`, `user`, `mfa`, `profile`, `pendingEmail`, `passwordRecovery`, `emailConfirmed`, `passwordChanged`, `error`, `isAuthorized` et les actions. `AppRoutes` utilise exclusivement cet état pour rediriger vers login, enrollment, challenge, reset ou dashboard ; chargement et erreurs n'affichent aucun contenu privé.

| État | Signification |
| --- | --- |
| `initializing` | Restauration ou réévaluation en cours ; aucun accès MY. ni profil exposé |
| `unconfigured` | Variables Supabase absentes ; bootstrap utilisable sans réseau |
| `signed_out` | Pas de session |
| `email_confirmation_required` | Signup sans session ou email Auth non confirmé |
| `mfa_enrollment_required` | Aucun TOTP vérifié, y compris après récupération administrative |
| `mfa_challenge_required` | TOTP vérifié présent mais session pas encore `aal2` |
| `password_reset_required` | Parcours recovery avec email confirmé/TOTP `aal2` ; nouveau mot de passe attendu, profil absent et `isAuthorized = false` |
| `authorized` | Email confirmé, TOTP vérifié, `aal2` et profil chargé |
| `error` | Résolution Auth/profil en échec ; accès fermé, réessai explicite disponible |

Un signup sans session produit un état d'attente email, sans prétendre prouver l'existence ou la création du compte : Supabase peut masquer un compte déjà enregistré. Cette attente reste en mémoire et ne constitue pas une authentification. Le statut de confirmation d'une session provient de l'utilisateur vérifié par Auth.

Les événements Auth, dont `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`, `PASSWORD_RECOVERY` et `MFA_CHALLENGE_VERIFIED`, provoquent une réévaluation. Le callback Auth reste synchrone ; les appels suivants sont différés pour éviter le verrou interne Supabase. Un numéro de révision ignore les réponses anciennes après logout ou changement de compte. L'abonnement et les tâches différées sont nettoyés, y compris sous StrictMode. Le cache TanStack Query est purgé lors des transitions ; les futures requêtes métier devront être activées uniquement lorsque `isAuthorized` vaut `true`.

`requestPasswordReset()` prépare l'email. Le callback `type=recovery` et l'événement `PASSWORD_RECOVERY` activent le même contexte central : enrollment si aucun TOTP vérifié, sinon challenge. Le formulaire et l'action d'état `updatePassword()` exigent `password_reset_required` ; le service vérifie également l'email et la MFA `aal2` avant `updateUser`. Aucune lecture de profil n'a lieu pendant la récupération, même après MFA, avant le succès du changement. Le contexte est conservé au refresh navigateur dans `sessionStorage` par le seul `session_id`, sans token/secret ; ce marqueur de navigation n'autorise jamais l'accès, qui reste vérifié par Auth et RLS. Il est effacé au logout ou après changement réussi. Après reset, la session courante reste active, le profil est chargé et l'utilisateur accède au dashboard sans se reconnecter.

La V1 n'expose ni `signInWithOtp` ni récupération MFA automatisée ; les endpoints email natifs Supabase couvrent aussi OTP/magic link, et aucun réglage indépendant de désactivation n'est inventé dans `config.toml`.

### Configuration locale Auth

`supabase/config.toml` active signup global/email, confirmation email et enrollment/vérification TOTP. Téléphone/SMS, anonyme, providers externes et serveur OAuth restent désactivés. La Site URL est `http://localhost:5173` et les retours autorisés sont cette URL et `http://127.0.0.1:5173`. Les emails sont capturés localement sur `55324`. Les autres valeurs préexistantes, dont l'expiration JWT de 3 600 secondes et la politique de mot de passe, restent inchangées.

La Phase 3B fixe `max_enrolled_factors = 1` et ajoute ces retours exacts, construits par le frontend depuis l'origine courante :

- `http://localhost:5173/auth/confirm-email`
- `http://127.0.0.1:5173/auth/confirm-email`
- `http://localhost:5173/reset-password`
- `http://127.0.0.1:5173/reset-password`

La CLI locale du dépôt est **2.119.0**, référence reproductible via `package-lock.json` et `npm ci`. Son [schéma sessions](https://github.com/supabase/cli/blob/v2.119.0/packages/config/src/auth/sessions.ts) et sa [structure Go](https://github.com/supabase/cli/blob/v2.119.0/apps/cli-go/pkg/config/auth.go), relus au démarrage de Phase 7, exposent seulement `timebox` et `inactivity_timeout`, pas la durée spécifique `aal1`. Aucune clé TOML n'est inventée : les 15 minutes restent spécifiques à la configuration cloud. La politique locale conserve un minimum de 6 caractères sans règle de composition supplémentaire ; les erreurs de politique serveur sont affichées proprement.

### Configuration Auth cloud validée

Le cloud ne reprend pas automatiquement les réglages locaux. Selon la [validation 3A fournie par le propriétaire](reports/2026-09-09-PHASE3A-AUTH.md#validation-cloud), le provider Email, les inscriptions et la confirmation email obligatoire sont activés. TOTP/App Authenticator est activé avec **un seul facteur MFA par utilisateur en V1** ; les sessions `aal1` sont limitées à **15 minutes** et Phone/SMS MFA reste désactivé. L'accès MY. exige toujours `aal2`, notamment via les 13 policies restrictives déployées.

Le développement et les tests courants utilisent **Supabase local**, avec l'URL et la clé publishable locales. Le [checkpoint Cloud 4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) est une exception ponctuelle explicitement autorisée, limitée aux fixtures synthétiques temporaires. Les quatre retours ci-dessus restent dans la configuration locale : **aucune URL `localhost` ou `127.0.0.1` ne doit être ajoutée aux Redirect URLs du cloud**. Supabase cloud est réservé à la future production avec Vercel ; la Site URL et les Redirect URLs de production seront configurées lors de la phase finale de mise en production. Aucune URL de production n'est encore définie et aucune configuration cloud n'est modifiée en 3C.

### Récupération MFA administrative

Procédure réservée à un opérateur dans un environnement de confiance, après vérification manuelle de l'identité du demandeur. Un identifiant MY. ou un email fourni seul ne suffit pas à autoriser la récupération. Aucun écran ni outil d'administration n'est ajouté à la V1.

1. Identifier le compte dans Dashboard → Authentication → Users par email et relever son UUID Auth. S'il fournit son identifiant MY., le rapprocher de `public.profiles.public_id` puis de `profiles.id` dans SQL Editor ; vérifier les deux identités. Ne jamais recréer le compte ou son profil.
2. Avec un client administratif séparé, sans persistence ni refresh de session, appeler `supabase.auth.admin.mfa.listFactors({ userId })`. Vérifier l'appartenance et le type de chaque facteur. Les facteurs vérifiés devenus inaccessibles doivent tous être retirés pour obtenir un compte sans TOTP vérifié ; ne supprimer que ceux validés par la procédure d'identification.
3. Supprimer chaque facteur concerné avec `supabase.auth.admin.mfa.deleteFactor({ userId, id: factorId })`, en contrôlant chaque erreur. La clé administrative est fournie par l'environnement de confiance, jamais par `VITE_*`, React, Git ou un log.
4. **Révoquer explicitement les sessions du seul UUID identifié**, puis vérifier la révocation. La [référence Supabase de deleteFactor](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor) annonce une déconnexion pour un facteur vérifié ; sur le serveur local `v2.196.0` testé en 3A, le refresh restait pourtant utilisable après suppression. Ne pas supposer cette déconnexion acquise. Dans SQL Editor administratif, après avoir remplacé le paramètre par l'UUID vérifié, exécuter la transaction ciblée ci-dessous ; ne toucher ni `auth.users` ni `profiles`.

```sql
begin;
-- Remplacer cet UUID sentinelle par l'UUID Auth vérifié, identique dans les deux requêtes.
delete from auth.sessions
where user_id = '00000000-0000-0000-0000-000000000000'::uuid;
select count(*) as remaining_sessions from auth.sessions
where user_id = '00000000-0000-0000-0000-000000000000'::uuid;
commit;
```

5. Vérifier que les facteurs visés ont disparu et que les anciennes sessions ne peuvent plus être renouvelées. Les JWT déjà émis peuvent rester valides jusqu'à leur expiration : la [sémantique Supabase des sessions](https://supabase.com/docs/guides/auth/sessions) n'assure pas leur révocation instantanée. Les policies 3A vérifient le claim `aal`, sans contrôle supplémentaire de `session_id`. Tenir compte de ce délai avant de considérer la révocation complète ; la durée cloud doit être vérifiée, sans supposer qu'elle correspond au local.
6. L'utilisateur se reconnecte par email/mot de passe, obtient `aal1`, puis doit enrôler et vérifier un nouveau TOTP pour retrouver `aal2`. Son UUID, son identifiant MY. et ses données restent identiques. Consigner l'opération et son résultat sans secret, QR, code TOTP ni token.

## Sécurité et contrôle d'accès

### Profil et gestion du compte — cible Phase 4

Le périmètre fonctionnel et UX de `/profile` est cadré dans [01-FEATURES.md](01-FEATURES.md#profil-utilisateur) et [04-UX-UI.md](04-UX-UI.md#profil-utilisateur). La [Phase 4C](reports/2026-09-14-PHASE4C-PROFILE.md) livre l'identité MY., la date d'inscription, le formulaire email et le statut Authenticator. La [Phase 4D.1](reports/2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) organise le Profil en Identité MY., Adresse email et Sécurité du compte, avec formulaire password puis Authenticator secondaire. La page utilise exclusivement `useAuth()`, sans second client, cache de données du compte ou requête Supabase dans React. Saisie, copie et erreurs de formulaire restent locales ; le statut de soumission/succès password décrit ci-dessous survit au remontage Auth. Le contrat et les messages email 4B.2 restent inchangés. La [Phase 4D.2](reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md) ajoute la suppression depuis Profil ; le [checkpoint Cloud final 4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) valide les protections serveur et clôture la Phase 4.

L'email courant et la date de création du compte se lisent sur l'utilisateur renvoyé par Supabase Auth : `user.email` et `user.created_at`, ce dernier correspondant à `auth.users.created_at`, selon la [référence de l'utilisateur Auth](https://supabase.com/docs/guides/auth/users#the-user-object). `profiles.public_id` fournit l'identifiant MY. ; `profiles.created_at` reste la date technique de la ligne applicative, notamment lors d'un backfill. Aucune duplication d'email ou de date d'inscription, aucun accès direct du navigateur à `auth.users` et aucun champ social ne sont nécessaires.

Le statut Authenticator provient de `mfa.verifiedFactors`, dérivé des facteurs TOTP vérifiés par le service Auth existant. La page distingue un statut indisponible, aucun facteur vérifié et `Authenticator configuré`. Elle affiche directement l'information de contact MY., sans action `Modifier` ni appel d'enrollment, de remplacement ou de suppression de facteur. Le contact définitif reste ouvert et la procédure administrative existante est conservée.

### Sécurité des actions de gestion du compte

L'accès normal à MY. conserve email confirmé, facteur TOTP vérifié et `aal2`, avec les policies MFA/RLS existantes. La décision finale V1 remplace la ré-authentification fraîche commune aux trois actions par les contrats suivants :

| Opération | Protection autoritative retenue |
|---|---|
| Changement volontaire du mot de passe | Session `aal2` + mot de passe actuel exigé et vérifié par Auth |
| Changement d'email | Session `aal2` + Secure Email Change + confirmation ancienne ET nouvelle adresse |
| Suppression | Confirmation explicite + mot de passe actuel + TOTP frais + validation finale + opération serveur privilégiée contrôlée par MY. |

Le [rapport de vérification initial](reports/2026-09-13-PHASE4B1-REAUTH.md) reste conservé sans réécriture : il décrit l'échec de l'ancien contrat commun sur les endpoints natifs. Il ne bloque plus globalement la Phase 4. Pour email/mot de passe, aucun nouveau TOTP, booléen `freshAuth`, timestamp, claim MY., permission temporaire, table ou RPC de fraîcheur n'est ajouté. La RLS ne contrôle pas les mutations Auth ; les protections doivent être imposées par Auth lui-même. La suppression repose sur une orchestration serveur distincte, livrée et validée ci-dessous.

### Changement d'email et de mot de passe

**Email livré localement :** `requestEmailChange(email, emailRedirectTo)` étend le service Auth et les actions de `useAuth()`. L'action d'état exige `authorized` ; le service vérifie session, email confirmé et facteur TOTP vérifié avec `aal2`, puis appelle `auth.updateUser({ email }, { emailRedirectTo })`. L'événement `USER_UPDATED` relit les données Auth : `user.email` reste courant et `user.new_email` représente l'attente. Aucun email n'est copié dans `profiles`, aucun profil n'est créé ou modifié.

Le [fichier local versionné](../supabase/config.toml) conserve `auth.email.double_confirm_changes = true`, transmis au serveur comme `GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true`. Les [tests directs locaux](reports/2026-09-13-PHASE4B2-ACCOUNT-AUTH.md) prouvent, dans les deux ordres, que seule la seconde confirmation finalise le changement. Si l'ancienne boîte est inaccessible, le parcours autonome ne peut pas aboutir : une future récupération manuelle après vérification d'identité sera nécessaire. Aucun bypass, désactivation de l'option ou accès admin frontend n'est prévu ; le contact reste ouvert.

**Callback email :** `/auth/confirm-email-change` partage le lecteur et le store des callbacks existants. Le premier lien retourne un fragment `message` sans tokens : il produit seulement un avis en mémoire invitant à confirmer les deux boîtes. Cet avis ne prouve aucune mutation et n'accorde aucun accès. Le second lien retourne `type=email_change` et une session technique ; le service utilise `setSession`, relit l'utilisateur Auth, vérifie l'absence de `new_email`, puis termine cette seule session avec `signOut({ scope: 'local' })`. L'écran affiche alors `Adresse email modifiée` et propose une connexion avec la nouvelle adresse. Le prochain login impose la MFA normale.

Les paramètres sensibles sont retirés immédiatement de l'URL. `emailChangeResult` est un résultat de navigation en mémoire, distinct de `emailConfirmed` du signup et de toute autorisation. Les erreurs de lien restent fermées ; signup, recovery, listeners et purge du cache conservent leur traitement. Les retours ajoutés sont uniquement `http://localhost:5173/auth/confirm-email-change` et `http://127.0.0.1:5173/auth/confirm-email-change`. Le formulaire Profil de 4C utilise `authRedirectUrl('/auth/confirm-email-change')`, `AuthForm`, `useAuthTask` et l'action `requestEmailChange` existants. Après `USER_UPDATED`, le store résout à nouveau l'accès et remonte la page ; le message d'attente provient alors de `user.new_email`, sans dépendre d'un succès local perdu au démontage. `user.email` reste la seule adresse courante affichée.

**Mot de passe volontaire livré en 4D.1 et validé sur Cloud en 4D.3 :** l'action `changePassword(currentPassword, password)` exige l'état `authorized`. Le service distinct du recovery relit la session, vérifie l'email confirmé et le facteur TOTP vérifié avec `aal2`, puis appelle exactement `auth.updateUser({ password, current_password: currentPassword })`. Il transmet les saisies sans trim. Supabase Auth vérifie le mot de passe actuel ; aucun `signInWithPassword`, challenge TOTP, nonce email ou preuve frontend ne le remplace. Les erreurs sont propagées au traducteur Auth, notamment `current_password_invalid` (observé sur Cloud), `current_password_mismatch`, `weak_password`, erreurs de session, `insufficient_aal` et rate limit.

`accountPasswordChange` est un état de présentation en mémoire (`idle`, `pending`, `success`), sans secret, persistance ni rôle d'autorisation. Il conserve le verrou de formulaire et le succès après `USER_UPDATED`, tandis que les gardes de routes et la résolution Auth restent inchangées. Une réussite n'est publiée qu'après résolution de `updateUser`. Le formulaire vide alors ses champs et affiche `Mot de passe modifié.` ; aucune déconnexion ni changement du contexte recovery. Le statut est effacé à la prochaine soumission, à la déconnexion, au changement d'utilisateur ou à l'arrêt du provider. Les réponses tardives d'un ancien cycle de connexion ne publient aucun succès.

**Limite locale historique et état courant :** le SDK **2.115.0** accepte `current_password`. Le [rapport 4B.2](reports/2026-09-13-PHASE4B2-ACCOUNT-AUTH.md) conserve les versions exactes et les appels directs acceptés sans mot de passe actuel ou avec une valeur incorrecte ; le [rapport 4D.1](reports/2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) conserve le constat suivant du propriétaire. Pour la CLI courante **2.119.0**, la lecture officielle du [schéma email](https://github.com/supabase/cli/blob/v2.119.0/packages/config/src/auth/email.ts) et de la [configuration Go](https://github.com/supabase/cli/blob/v2.119.0/apps/cli-go/pkg/config/auth.go) n'expose pas d'option TOML exigeant `current_password` ; `secure_password_change` reste distinct. Cette lecture ne prouve pas le comportement du serveur lancé par cette version : aucun nouveau test Auth réel ni changement de configuration dans la préparation Phase 7. La protection Cloud validée en 4D.3 reste un acquis ; la revalidation locale éventuelle reste hors périmètre. Aucun test simulé de refus ne prouve cette protection serveur.

Le réglage distinct `auth.email.secure_password_change = false` reste inchangé. `Secure password change` / `reauthenticate()` utilise un nonce email et peut dispenser les sessions de moins de 24 heures ; il ne remplace pas l'obligation du mot de passe actuel. La V1 n'ajoute pas ce nonce. La [référence Supabase](https://supabase.com/docs/guides/auth/password-security) décrit ces deux mécanismes séparément.

Le recovery livré reste distinct : MFA avant le nouveau mot de passe, sans exiger le mot de passe oublié, session conservée après succès. Son contrat `updatePassword(password)` / `updateUser({ password })` reste inchangé et couvert par les tests frontend/Auth. Les essais réels locaux historiques figurent dans le rapport 4B.2 ; ils ne sont pas rejoués en 4D.1. La non-régression après activation du réglage est démontrée sur Cloud en [4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md), via une vraie session recovery, le challenge MFA et le service/store MY., sans ancien mot de passe. Le [handler Auth](https://github.com/supabase/auth/blob/v2.196.0/internal/api/user.go) prévoit une exception pour les sessions recovery.

La [validation Cloud 4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) démontre l'effet de **Require current password when updating** : absence refusée avec `current_password_required`, valeur incorrecte refusée avec `current_password_invalid`, valeur correcte acceptée par le vrai service MY. ; le nouveau mot de passe fonctionne et l'ancien échoue. Le recovery conserve son exception et fonctionne sans ancien mot de passe après MFA. Les réglages déclarés par le propriétaire restent inchangés : Secure Email Change activé, Secure Password Change désactivé, minimum de 6 caractères sans composition additionnelle. Aucun contrôle frontend de remplacement ni configuration Auth parallèle n'est introduit.

### Suppression du compte — contraintes d'orchestration

La suppression définitive exige confirmation des conséquences, ré-authentification fraîche mot de passe + TOTP, puis validation finale explicite. Elle doit être exécutée par une opération contrôlée côté base/backend, ciblant uniquement l'identité authentifiée et vérifiée ; React n'orchestre pas une suite de suppressions privilégiées.

**Backend livré et validé localement et sur Cloud :** l'[Edge Function `delete-account`](../supabase/functions/delete-account/index.ts) utilise uniquement les API Auth officielles ; la [migration dédiée](../supabase/migrations/20260914102414_phase4b3_account_deletion.sql) ajoute le nettoyage transactionnel. Aucune RPC de suppression n'est exposée, aucune FK historique n'est changée, aucun serveur généraliste ou endpoint Vercel n'est ajouté. Le [rapport de réalisation](reports/2026-09-14-PHASE4B3-ACCOUNT-DELETION.md) détaille les tests locaux. Le [checkpoint 4D.3](reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) confirme la migration déployée, la fonction active, les refus password/TOTP, la suppression Auth/données et les lectures vides avec un ancien JWT sur les 13 tables protégées.

**Contrat final :** `POST /functions/v1/delete-account`, avec le JWT utilisateur courant dans `Authorization: Bearer …` et un corps JSON contenant uniquement `currentPassword`, `totpCode` (six chiffres), `confirmConsequences: true` et `confirmDeletion: true`. Le navigateur ne fournit ni UUID cible, ni email, ni facteur, ni challenge, ni preuve de ré-authentification. La réponse réussie est HTTP 200 `{ "deleted": true }`. Les erreurs utilisent un code fermé (`password_verification_failed`, `totp_verification_failed`, `final_confirmation_required`, `deletion_failed`, etc.), sans contenu Auth/SQL ni secret.

Chaque appel final refait toute la vérification côté serveur. Le frontend 4D.2 recueille les saisies et les confirmations successives avant cet appel ; aucune autorisation intermédiaire réutilisable ne circule entre étapes. Les secrets restent dans l'état local de la modal, vidés à la fermeture et après succès. `useAuth().actions.deleteAccount` appelle le service Auth, qui recontrôle la session puis utilise le client Supabase existant via `functions.invoke('delete-account')`, avec timeout de 60 secondes et sans retry. Aucun appel `signInWithPassword`, `mfa.challenge` ou `mfa.verify` n'est ajouté au frontend de suppression. Le data router React Router conserve les routes existantes et permet `useBlocker` pendant l'envoi ; le dialog natif assure l'inertie du fond et le focus modal.

1. Le serveur vérifie le JWT avec `getClaims(token)` et l'utilisateur avec `getUser(token)` ; il exige le même UUID, email confirmé, `aal2`, un seul TOTP vérifié et un profil accessible sous la RLS utilisateur. `verify_jwt = false` désactive uniquement le contrôle JWT historique de la passerelle : la vérification Auth dans le handler reste obligatoire, y compris pour les clés de signature asymétriques.
2. Un client Auth anonyme distinct, limité à cette requête et sans persistance, appelle `signInWithPassword` avec l'email relu depuis Auth et le mot de passe fourni. Il doit obtenir le même UUID et une nouvelle session `aal1`, distincte de la session initiale.
3. Sur le facteur vérifié de cette même identité, le serveur crée un nouveau `mfa.challenge` puis appelle `mfa.verify` avec le code fourni. Il exige le même UUID, la même nouvelle session et `aal2`. Aucun challenge fourni par le navigateur n'est réutilisé, aucun TOTP n'est calculé ou comparé par MY.
4. Après ces vérifications, `confirmDeletion` doit être explicitement vrai. Le client privilégié serveur appelle `auth.admin.signOut(tokenVérifié, 'global')`, puis `auth.admin.deleteUser(uuidVérifié, false)` pour une suppression physique.

Les clients sont isolés par requête. Le client privilégié n'est jamais utilisé pour se connecter comme utilisateur. Aucun token technique, secret TOTP ou clé privilégiée ne sort de l'Edge Function ; mot de passe et code restent uniquement en mémoire pendant la requête. Un refus termine uniquement la session de ré-authentification serveur lorsqu'elle existe.

**Atomicité de la destruction :** le trigger privé `private.delete_account_data_for_auth_user()` s'exécute `BEFORE DELETE ON auth.users`, dans la transaction de l'[opération Auth Admin](https://github.com/supabase/auth/blob/v2.196.0/internal/api/admin.go). Il utilise exclusivement `OLD.id`, verrouille le profil, supprime les partages reçus, collections possédées (éléments et partages sortants en cascade), exemplaires puis profil (préférences en cascade). Le verrou du profil sérialise les nouvelles références FK ; une course ou un deadlock provoque au besoin un échec transactionnel à réessayer. Aucun nettoyage applicatif n'est validé dans une RPC séparée avant la suppression Auth.

Une erreur Auth/SQL annule toute la destruction ; le test réel d'une FK bloquante tardive le démontre. La révocation des sessions précède cette transaction : elle reste effective si la destruction échoue et impose une nouvelle connexion pour réessayer. Un nouvel appel refait les deux facteurs ; un appel après suppression est refusé faute d'utilisateur, sans autre mutation. Si la réponse réseau est perdue après commit, le serveur ne promet pas un succès observable : l'UX affiche un résultat incertain et demande une reconnexion pour vérifier l'état du compte avant toute nouvelle tentative. Une requête déjà en cours peut terminer selon son snapshot ; les nouvelles requêtes après commit n'accèdent plus aux données.

**JWT résiduels :** leur signature peut rester valide jusqu'à expiration, comme l'indique la [documentation Supabase](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users). La policy restrictive `require_my_profile` est ajoutée aux 13 tables applicatives, en plus des policies MFA/propriété existantes. Son prédicat privé sans argument `has_my_profile()` ne révèle que l'existence du profil de `auth.uid()`. Après suppression, les lectures deviennent vides et les écritures sont refusées, y compris dans le catalogue. Ce contrôle ferme le compte supprimé ; il n'est pas un contrôle général de chaque session révoquée tant que son profil existe.

Les fonctions privées ont un `search_path` vide. Le trigger n'a aucun droit d'appel pour PUBLIC, anon, authenticated, service_role ou supabase_auth_admin ; PostgreSQL l'exécute lors du DELETE privilégié. Le prédicat RLS n'accorde `EXECUTE` qu'à authenticated, sans ouvrir le schéma privé. Les opérateurs disposant déjà d'Auth Admin peuvent aussi déclencher le nettoyage en supprimant physiquement un utilisateur ; les privilèges opérateur restent une frontière de confiance.

Les objets Storage détenus par un utilisateur peuvent bloquer sa suppression Auth ; aucun stockage utilisateur de ce type n'est prévu actuellement. Cette erreur conserve les données applicatives. Les éventuelles exigences légales/rétentions particulières restent ouvertes. L'intégration frontend et ses preuves sont décrites dans le [rapport 4D.2](reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md). Après `{ deleted: true }`, le store invalide ses lectures en vol, appelle le `clearData` existant (`queryClient.clear()`), vide les données Auth et le contexte recovery, publie `signed_out` et le retour public, puis demande `signOut({ scope: 'local' })` au SDK. Ce nettoyage secondaire ne peut annuler le succès confirmé. Les anciens événements du compte supprimé sont refusés ; les événements Auth arrivant pendant l'appel sont différés jusqu'au résultat, pour préserver la modal inerte. Après refus, fermer la modal reprend l'événement différé ; une reconnexion purge les données locales via le même cycle. Aucun stockage global de secrets ni effacement manuel des clés SDK.

### Row Level Security

La Row Level Security PostgreSQL constitue la fondation de la sécurité des données utilisateur. Les règles doivent conceptuellement garantir que :

- un utilisateur lit et modifie ses propres données ;
- il ne peut pas modifier les données d'un autre compte ;
- une collection partagée n'est visible que par ses destinataires autorisés ;
- le destinataire d'un partage reste strictement en lecture seule ;
- les exemplaires d'un autre utilisateur ne sont visibles que dans le contexte réellement partagé ;
- les autres données privées restent invisibles ;
- un utilisateur ordinaire ne peut pas modifier le catalogue global.

Les permissions et policies du socle Phase 1 sont définies dans le [schéma PostgreSQL / Supabase](06-DATABASE.md), implémentées par migrations et testées avec pgTAP sur Supabase local. Les opérations fonctionnelles futures conservent leurs limites de périmètre.

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
- modifier une note et consulter son profil ;
- consulter le catalogue ;
- effectuer une recherche.

Ces accès restent protégés par Auth, la RLS et les contraintes de la base.

Aucun champ de `profiles` n'est éditable par l'utilisateur dans la V1 cadrée. Les changements d'email/mot de passe relèvent des protections natives Auth décrites ci-dessus ; la suppression du compte relève d'une vérification renforcée et d'une orchestration serveur contrôlée.

### Opérations autoritatives

Une opération qui touche plusieurs ensembles de données, doit être atomique, applique des invariants, calcule une structure automatique ou nécessite des privilèges serveur ne doit pas être orchestrée naïvement depuis React.

Elle doit être centralisée dans une opération métier côté base ou backend. Lorsqu'elle est principalement liée aux données et doit être transactionnelle, une fonction PostgreSQL exposée via RPC est privilégiée si elle simplifie correctement le système.

La RPC de [création automatique](06-DATABASE.md#création-transactionnelle) est définie par `public.create_automatic_collection(p_name TEXT, p_target_type TEXT, p_target_id BIGINT)` et retourne `(collection_id UUID, created BOOLEAN)`. Les autres RPC envisagées — mise à jour de collection, destinataire/partage, réorganisation — restent à définir.

### Edge Functions

Les Supabase Edge Functions peuvent être utilisées pour appeler un service externe depuis une zone de confiance, protéger un secret ou exécuter une logique serveur interactive qui ne convient pas directement à PostgreSQL.

Elles ne doivent pas devenir une couche obligatoire devant toutes les requêtes.

### Opérations privilégiées

L'écriture dans le catalogue global, la synchronisation TCGdex, les corrections administratives et certaines opérations de maintenance s'exécutent uniquement dans un environnement de confiance. Le navigateur ne possède jamais les privilèges correspondants.

## Collections automatiques

### Génération autoritative

Le frontend ne doit pas charger tout le catalogue pertinent, décider seul de l'éligibilité puis insérer chaque élément automatique de manière non contrôlée.

La création utilise le catalogue local MY. et une opération métier autoritative.

PostgreSQL garantit une seule collection automatique par propriétaire et cible Pokémon ou Set, ainsi qu'un nom d'au moins 3 caractères utiles après trim. La RPC autoritative crée la collection ou retourne l'existante sans modification, y compris en concurrence. Elle exige une identité issue d'Auth, `aal2` et un profil MY., prend le verrou catalogue partagé transactionnel `771402`, vérifie l'état/version et le hash du helper canonique, puis insère atomiquement parent et items. Les nouvelles structures vides sont refusées. Les droits d'écriture directe restent inchangés ; la future interface Créer/Ouvrir pourra utiliser le résultat `created` et l'UUID retourné.

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

Une Extension désigne ici un set précis, non une série ou un bloc TCGdex. Dans les deux cas, chaque variante française pertinente demeure une unité distincte et l'ordre canonique de MY. initialise la collection : Pokémon par date effective croissante, numéro naturel puis variante ; Extension par numéro naturel dans le set puis variante.

Après création, le propriétaire peut réordonner tous les éléments automatiques et manuels via la primitive contrôlée 6A.3. `automatic_rank` reste le rang canonique système ; `sort_position` porte l'ordre réellement affiché. Déplacer un automatique conserve `origin`, `automatic_rank`, le hash/version canonique et `automatic_target_states`. Il reste structurellement géré par MY. et non supprimable manuellement. Deux collections de même cible/version peuvent donc avoir les mêmes éléments automatiques et des positions différentes. Les RPC distinctes `add_manual_collection_item` et `remove_manual_collection_item` (6C.1) partagent le verrou du parent avec le reorder, sous `READ COMMITTED`. PostgreSQL vérifie propriétaire/MFA/profil, éligibilité d'un nouvel ajout, unicité et origine au retrait ; il calcule seul `start`/`end` (défaut `end`) et le rééquilibrage éventuel. Aucun CRUD générique ni grant d'écriture directe n'est ouvert. Les exemplaires physiques restent indépendants. Le [contrat DB](06-DATABASE.md#mutations-manuelles--contrat-6c1) précise erreurs, concurrence et statut des migrations ; les mutations frontend d'ajout-retrait sont branchées en 6C.3 via le service `collection-items`, sans écriture directe sur les tables.

### Mise à jour autoritative et contrôlée

Le frontend demande ou reçoit le résumé des changements, l'affiche puis recueille la validation explicite de l'utilisateur.

La base ou le backend applique ensuite la mise à jour de manière cohérente et transactionnelle : ajout des nouveaux automatiques, retrait des non-éligibles, conversion sans doublon des manuels devenus automatiques et actualisation des `automatic_rank`. La conversion conserve le même `collection_item`, passe `origin` à `automatic` et préserve autant que possible `sort_position`. Les autres éléments manuels, les exemplaires et les données personnelles sont préservés. L'ordre personnalisé de tous les éléments est conservé autant que possible, sans réinitialisation arbitraire vers l'ordre canonique. Le placement des nouveaux automatiques et la stratégie de préservation/ancrage restent ouverts pour la Phase 8, sans algorithme exact d'insertion/fusion décidé. Le frontend ne décide pas seul quels éléments automatiques insérer.

La synchronisation du catalogue ne modifie jamais silencieusement une collection utilisateur.

## Catalogue local et synchronisation TCGdex

### Flux de données

Le dépôt `tcgdex/cards-database` est la source technique principale du pipeline. MY. utilise ensuite son propre catalogue PostgreSQL pour les consultations, recherches et générations automatiques. « Local MY. » désigne ici sa copie maîtrisée de la source TCGdex : le catalogue résultant est également chargé et vérifié dans Supabase cloud. Le pipeline de maintenance demeure volontairement limité à la base locale.

```text
Snapshot cards-database identifié → synchronisation de confiance → catalogue local MY. → application
```

Chaque snapshot est identifié par le commit SHA Git utilisé. L'API REST TCGdex reste auxiliaire pour les vérifications, diagnostics ou besoins spécifiques ; elle n'est pas une seconde source automatiquement fusionnée.

Les noms français et types d'espèces utilisent un [référentiel JSON local versionné](../data/pokemon/README.md), généré manuellement par `npm run pokemon:update` depuis PokéAPI `pokemon-species` et la ressource Pokémon de la variété par défaut. Le type fermé et les libellés FR sont dans `src/types/pokemon.ts` ; palette et resolver dans `src/lib/catalog-identity.ts`, appliqués à la page Pokémon depuis 7D.2. `src/lib/format-fr-source.ts` factorise l'affichage FR/source des résumés et du Détail Variante. Les [contrats Catalogue](09-CATALOG-CONTRACTS.md) ont leurs types et services stricts, consommés depuis 7D.2 par la route Pokémon et son socle UI ; Extension consomme le même socle depuis 7D.3 ; Carte reste future. Node 24 utilise `fetch` natif pour cette maintenance indépendante, sans base ni service permanent. La synchronisation et le navigateur ne contactent jamais PokéAPI. Le contenu canonique de ce fichier est hashé et participe, avec le snapshot, les overrides et le code, à la reproductibilité du catalogue.

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

### Implémentation Phase 2

Le pipeline est isolé dans `scripts/catalog/`, exécuté directement par Node 24 en TypeScript, avec `pg` pour PostgreSQL et Zod pour les corrections JSON. Il utilise le snapshot Git exact en cache, une transaction catalogue globale, des batches de 1 000 lignes et un dry-run sans écriture. Il ne constitue pas un serveur Node permanent. Les règles complètes sont définies dans `07-CATALOG-SYNC.md`.

La date effective et sa provenance sont persistées sur chaque variante. La normalisation et les overrides résolvent la date spécifique, sinon le fallback fiable de carte, sinon `NULL`, en conservant la provenance réelle. Le plan utilise cette date pour les cibles Pokémon, avec `NULL` en dernier ; les cibles Set restent classées par numéro puis variante. Les hashes portent uniquement sur les IDs ordonnés : une correction de date sans déplacement ne change aucune version. La date ne participe jamais à l'identité ; les variantes historiques conservent leur date persistée.

### Pages Pokémon et Extension authentifiées — 7D.2/7D.3

`src/features/catalog/` consomme `getCatalogPokemon` sous `/catalog/pokemon/:pokemonId` et `getCatalogSet` sous `/catalog/extensions/:setId`, avec queries privées par viewer, type et ID interne. `CatalogContent` partage thème, recherche, toolbar, rendu Liste/Cartes et Détail. Extension conserve une identité neutre, logo/symbole optionnels et liens Pokémon indépendants par ID ; son filtre utilise les noms rattachés sans ses propres nom/abréviation. Header/thème 7D.1, toolbar, rendu neutre Liste/Cartes et filtre local sans retri forment le socle réutilisable. Le normaliseur local est partagé avec Collection ; la mécanique de préférences est mutualisée dans `usePreferredView`, avec deux consommateurs dédiés et sauvegardes de derniers modes distinctes. Les defaults initialisent chaque ouverture seulement, les réponses confirmées fusionnent par champ, les mutations sont sérialisées et les réponses de ressources/sessions quittées ignorées. Aucun nouveau stockage de préférences ou contenu personnel Catalogue.

Le Détail Variante existant reçoit le viewer comme owner, sans navigation supplémentaire. La lecture CTA interroge seulement `collections.id` avec propriétaire, type automatic et cible exacte sous RLS. `CatalogCollectionAction`/`CreateCatalogCollectionDialog` partagent détection, dialogue et validation de nom pour les cibles Pokémon/Extension, puis appellent uniquement `createAutomatic` ; `created=false` ouvre l’ID existant sans renommage. Les caches CTA et Dashboard du viewer sont réconciliés sans attendre le Dashboard pour naviguer. Adaptation des seuls arguments BIGINT de création vers string ou anciens nombres, types générés inchangés. Aucun schéma, RPC, grant ou comportement SQL modifié. Frontend réversible par retrait du consommateur sans suppression des données. Voir [contrats et preuve locale](09-CATALOG-CONTRACTS.md).

### Catalogue ciblé

PostgreSQL ne doit pas recevoir aveuglément toutes les données brutes de TCGdex. Le catalogue conserve principalement les informations utiles à MY., à la synchronisation, à la comparaison et à la traçabilité.

Les données de gameplay inutiles et une copie complète de chaque payload « au cas où » ne sont pas conservées par défaut. Un futur besoin de snapshots complets devra être cadré séparément.

### Corrections locales

Les corrections MY. ont pour source de vérité des fichiers versionnés dans Git. Le pipeline les applique dans une couche serveur contrôlée du catalogue ; les tables privées peuvent refléter leur état appliqué. La recherche, l'affichage et les collections automatiques consomment la valeur effective fournie par le catalogue.

Le pipeline TypeScript applique les JSON stricts versionnés dans `data/catalog-overrides/`, validés avec Zod, puis conserve leur provenance dans le schéma privé. La V1 ne nécessite pas obligatoirement de back-office graphique ; des outils réservés aux mainteneurs peuvent suffire initialement.

## Images

Dans la V1, les images de cartes ne sont pas copiées dans Supabase Storage. Le catalogue conserve les informations nécessaires pour utiliser l'asset TCGdex pertinent, puis le navigateur charge directement l'image depuis le CDN ou le service d'assets TCGdex.

```text
Navigateur → CDN / assets TCGdex
```

Cette approche limite le stockage, la bande passante, les duplications et les coûts. Le frontend doit pouvoir utiliser le lazy loading, une qualité adaptée au contexte et un fallback lorsqu'une image manque. Une grande collection ne doit pas télécharger immédiatement toutes ses images en haute résolution.

Supabase Storage pourra être envisagé plus tard pour de véritables fichiers propres au produit ou aux utilisateurs, sans être ajouté par défaut.

## Recherche et requêtes

Les recherches serveur prévues pour la V1 reposent sur PostgreSQL et Supabase pour :

- la recherche globale authentifiée de navigation (Pokémon, Extensions, collections accessibles, Cartes) ;
- la recherche dans le catalogue ;
- la recherche de Pokémon ;
- la recherche d'extensions.

La V1 n'introduit pas Algolia, Elasticsearch, Meilisearch hébergé ou un autre moteur externe. Le contrat SQL de recherche d'ajout est livré en 6C.2 ; il couvre carte/Pokémon, numéro/fraction, Extension, abréviations, identifiants et variante, **sans le nom de série**. La recherche interne 6D.1 est livrée côté client sur le contenu déjà chargé. La page Pokémon et sa recherche locale sont livrées en 7D.2. Extension et sa recherche locale sont livrées en 7D.3 ; Carte et recherche globale restent planifiées en Phase 7.

Le navigateur ne doit pas charger tout le catalogue pour effectuer une recherche. Les requêtes doivent pouvoir être filtrées, paginées et limitées aux données nécessaires.

Le complément Phase 2 fournit un premier moteur portable dans `scripts/catalog/search-catalog.ts` : données simples typées, normalisation Unicode, tokenisation, correspondances multi-champs en AND, score explicable et tri déterministe. Il n'importe aucun module Node, accès DB ou affichage terminal. Le contrat `searchCatalog(entries, query, { limit })` retourne les entrées classées, leurs scores, les correspondances par terme et le total avant limite.

Pour la maintenance actuelle, `search-catalog-db.ts` utilise `pg` et charge une projection compacte du catalogue PostgreSQL local, puis `catalog-find.ts` appelle le moteur et affiche les résultats. Cet adaptateur ne doit **jamais être importé dans React**. Sa lecture complète reste propre à la CLI ; le navigateur utilisera son accès aux données via Supabase/Auth/RLS avec des données filtrées, paginées et limitées.

La future recherche Carte réutilisera autant que possible `search-catalog.ts` pour normalisation, tokenisation, matching, score et tri, sans second moteur divergent. Le moteur n'a aucune dépendance Node, SQL, réseau ou terminal. L'adaptateur Supabase futur doit préserver ses règles et sa pertinence, y compris lorsqu'il présélectionne des candidats. Une éventuelle extraction vers un module partagé ne doit pas copier la logique.

L'orchestration globale applique les règles de [FEATURES](01-FEATURES.md) et [UX-UI](04-UX-UI.md) : seuil de 3 caractères, suggestions seules, maximum 10, ordre Pokémon/Extensions/Collections/Cartes et quotas 2/2/2 puis places restantes. Pokémon utilise le nom français ; Extension et Collection utilisent exclusivement leur nom, sans matching de leur contenu. Les collections candidates sont uniquement celles visibles par propriété ou partage ; la globalité ne contourne jamais la RLS. Le résultat Carte se déduplique au niveau `source_cards`, sans suggestion Variante.

Pour l'ajout manuel, `search_catalog_variants_for_add(p_query, p_limit, p_offset)` assure matching, éligibilité, ranking et pagination dans PostgreSQL. Le [service `searchCatalogVariantsForAdd`](../src/services/catalog-search.ts) utilise uniquement cette RPC via le client authentifié, valide strictement ses huit champs (dont les valeurs brutes `set_abbreviation_fr` / `set_abbreviation`, exposées en `setAbbreviationFr` / `setAbbreviation`, chacune `string | null`) et conserve `variantId` en chaîne décimale. Aucune importation du moteur ou de l'adaptateur Node dans le navigateur. Le [contrat 6C.2](06-DATABASE.md#recherche-catalogue-pour-ajout--contrat-6c2) précise sécurité, différences Unicode minimales, parité et mesures. La lecture des sélecteurs MY. privés justifie `SECURITY DEFINER` avec contrôles explicites ; aucun grant de table privée n'est ouvert.

La Phase 6C.3 branche cette recherche dans le contenu différé de CollectionPage, uniquement après overview autorisé. La modal propriétaire temporise la saisie de 300 ms et utilise `useInfiniteQuery` : pages de 20, offsets serveur, identité de recherche renouvelée à chaque saisie, déduplication défensive par `variantId`. Les réponses anciennes ne remplacent jamais les nouveaux résultats. L'ajout préserve le BIGINT en chaîne via une adaptation typée du seul argument RPC ; les types générés restent inchangés. Après ajout/retrait confirmé ou incertain, le hook annule les lectures obsolètes et invalide exactement contenu, ordre, overview et Dashboard du lecteur/collection. Il ne touche pas au cache des exemplaires physiques. Les mutations structurelles et le reorder partagent une clé d'occupation UI, sans ordre optimiste ni recalcul de progression. Le retour arrière frontend consiste à retirer ces points d'entrée ; les RPC, lecteurs existants et données restent compatibles. Aucune Vercel Function n'est nécessaire. Le [pipeline catalogue](07-CATALOG-SYNC.md#recherche-de-maintenance-catalogfind) reste la référence de l'outil de maintenance.

La lecture Pokémon 7D.1 consommée en 7D.2 fournit les Variantes dans l'ordre canonique, avec `variant_count` égal à leur nombre. Aucun regroupement de Cartes, compteur `card_count`, jointure ou retri frontend n'est ajouté. Extension suit le même principe en 7D.3 ; la future page Carte suivra son contrat et son cadrage, sans dupliquer la source de vérité ni confondre `official_card_count` et total MY. Ces pages n'agrègent aucune progression personnelle. `physical_copies → user_id + variant_id` demeure inchangé.

## Vue classeur et temps réel

Le Classeur V1 livré en 7B.3 est **continu uniquement**, dans l'ordre autoritatif. [`binder-pagination`](../src/features/collections/binder-pagination.ts) calcule les pages/slots, ouvertures et limites ; aucun nombre de slots stocké, table `binder_pages`, RPC ou champ d'organisation. [`CollectionContentBinder`](../src/features/collections/CollectionContentBinder.tsx) reçoit le même tableau via la pagination frontend, sans reorder ni actions sur les pochettes. Desktop/tablette large : 1 à droite, 2–3, 4–5, dernière paire à gauche ; mobile : une page exacte. [`useBinderNavigation`](../src/features/collections/useBinderNavigation.ts) garde page, occurrences et halo ; moteur de recherche existant, positions conservées, saut unique par recherche effective. Navigation côtés/clavier contextualisé/swipe/page directe sans boucle. Voir [recherche Classeur](04-UX-UI.md#recherche-classeur).

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

MY. distingue développement et production. Les 23 migrations jusqu'à la Phase 6 sont appliquées Local/Cloud et alignées jusqu'à `20260928083830`. Le propriétaire a exécuté manuellement le checkpoint Cloud après l'audit technique de Codex : 12 migrations Phase 6 appliquées sans erreur, puis dry-run final sans migration restante. Le [rapport de clôture Phase 6](reports/2026-09-30-PHASE6-CLOSURE.md) consigne ces résultats fournis ; cette clôture documentaire ne réalise aucun nouvel accès Cloud. Le pipeline refuse toujours toute base distante. Le staging et les futurs workflows de déploiement restent à cadrer.

Les URL, clés publiques et autres paramètres sont injectés par environnement. La configuration de production n'est pas codée en dur. Le développement et les tests courants ciblent Supabase local, hors checkpoints Cloud explicitement autorisés et consignés ; Supabase cloud constitue la future instance de production associée à Vercel.

## Versionnement et déploiement

### Version applicative

La phase majeure 7 correspond à la série `0.7.x`. Une sous-sous-phase applicative livrée incrémente le PATCH ; cadrage/documentation seuls n'imposent pas de version. Convention : 7A.1 → `0.7.1`, 7A.2 → cadrage sans version, 7A.3 → `0.7.2`, 7B.1 → `0.7.3`, 7B.2 → `0.7.4`, 7B.3 → **`0.7.5`**. Phase 8 : `0.8.0` ; cible V1 : `1.0.0`.

`package.json` reste la source unique de version, synchronisée avec `package-lock.json` via `npm version <version> --no-git-tag-version`, sans commit ni tag Git. Vite injecte cette valeur dans le footer commun ; l'année reste calculée à l'exécution.

### GitHub et Vercel

Le dépôt GitHub est la source de référence du code et de la configuration versionnée. Il doit contenir le frontend, les scripts, les migrations, la documentation et la configuration non secrète. Aucun secret ne doit y être commité.

`dev` est la branche GitHub par défaut et la branche normale de développement et d'intégration. `main` représente l'état stable et la future production. Les changements validés passent de `dev` vers `main` par Pull Request, sans push direct sur `main` dans le workflow normal.

Un GitHub Ruleset actif protège `main` : suppression et force-push bloqués, Pull Request obligatoire avant merge, sans approbation exigée actuellement. Seul le merge classique est autorisé.

Vercel n'est pas encore configuré et aucun déploiement Vercel n'est en place. Lors de la phase finale de mise en production, à la fin du développement V1, Vercel devra utiliser `main` comme branche de production selon le flux prévu :

```text
PR dev → main fusionnée → build Vite sur Vercel → frontend statique de production sur Vercel
```

La configuration détaillée de Vercel reste à réaliser. L'utilisation éventuelle de previews pour `dev` ou les Pull Requests sera décidée lors de cette configuration, selon leur valeur réelle et sans multiplier inutilement les builds. Ni ce flux de production ni les previews ne sont configurés à ce stade.

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

- les extensions futures du socle SQL, des index et des policies RLS de Phase 1 ;
- le code final des fonctions RPC métier ;
- le moyen de contact final pour le remplacement d'Authenticator et les éventuelles exigences légales/rétentions particulières ;
- la bibliothèque d'interface éventuelle ;
- le découpage détaillé des futures fonctionnalités dans la structure initialisée ;
- le staging éventuel et la stratégie de production au-delà du développement Supabase local ;
- la configuration détaillée de Vercel, dont le rewrite ou fallback des routes SPA lors du déploiement effectif ;
- la fréquence et le déclencheur de l'automatisation future du pipeline décrit dans [07-CATALOG-SYNC.md](07-CATALOG-SYNC.md) ;
- les éventuels usages d'Edge Functions au-delà de la suppression de compte déjà livrée ;
- la politique détaillée de sauvegarde ;
- l'automatisation CI ;
- les seuils précis de passage aux offres payantes ;
- le modèle Premium et un éventuel fournisseur de paiement.

Ces éléments ne doivent pas être considérés comme décidés avant leur cadrage et leur validation.
