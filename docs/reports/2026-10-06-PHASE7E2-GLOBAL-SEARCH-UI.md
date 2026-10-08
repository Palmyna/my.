# Phase 7E.2 — Recherche globale fonctionnelle du header

Livraison locale du 6 octobre 2026, version **0.7.13**. Contrat serveur/service 7E.1 consommé sans modification. Navigation contextuelle 7F reste future. Aucun commit, push, reset, migration ou accès au projet Cloud.

## État initial

- Branche **dev**, HEAD **121277eab4a28a0794fb2d8a922a81d579d68802 — v0.7.12** ; HEAD/branche conservés.
- `git status --short` vide avant modification.
- Package et deux versions racine du lockfile : **0.7.12 → 0.7.13**, aucune dépendance changée. Footer toujours alimenté automatiquement par `__APP_VERSION__` depuis package.json.
- AGENTS.md, README, sections pertinentes FEATURES/UX/Architecture/Roadmap/Database, rapport 7E.1, header/styles/tests, services/types et identités existantes inspectés avant édition. Conventions React Query de l’ajout Collection et du Catalogue réutilisées ; docs courantes TanStack Query/Supabase MFA consultées via Context7.
- Historique `supabase migration list --local` relu : **27 fichiers / 27 migrations appliquées**, jusqu’à `20261006085902`. La colonne Remote de cette commande désigne ici la DB Local. Cloud reste **23 au dernier checkpoint confirmé par le propriétaire**, sans relecture.

## Architecture et compatibilité

- [`GlobalSearch.tsx`](../../src/features/global-search/GlobalSearch.tsx) : champ permanent, saisie et ouverture/fermeture ; petit composant interne SearchResults pour timer et React Query.
- [`GlobalSearchSuggestion.tsx`](../../src/features/global-search/GlobalSearchSuggestion.tsx) : projection du seul payload 7E.1 en nom, contexte, catégorie, route et identité existante.
- [`global-search.css`](../../src/features/global-search/global-search.css) : popup et lignes, sans nouvelle dépendance ni animation.
- [`AuthenticatedHeader`](../../src/app/AuthenticatedHeader.tsx) reste responsable de composition logo/recherche/compte. Logique UserMenu inchangée ; listeners extérieurs existants suffisent à fermer les deux popovers mutuellement.
- Aucun hook générique ni gestionnaire global de popovers. Retour arrière frontend possible en retirant GlobalSearch et restaurant le champ visuel ; service, SQL, anciens lecteurs/écrivains et données restent compatibles. Aucune contraction backend requise.

## Saisie, queries et réponses périmées

Saisie brute, sans normalisation/matching/ranking frontend. Seul appel : `searchGlobalNavigation(query)`. Seuil et limite comptent les points de code Unicode, comme 7E.1 : moins de 3, aucun appel/popup ; maximum 200, y compris collage/caractères hors BMP sans surrogate coupé. Pas de maxLength HTML en unités UTF-16 qui limiterait incorrectement les caractères hors BMP.

Debounce **300 ms**. Résultats keyés par saisie : nouvelle frappe démonte ancien timer/observateur et affiche immédiatement `Recherche en cours…`. Clé `['global-search', viewerId, searchId, query]`, identité de durée de vie `useId` comme dans la recherche d’ajout existante. Identité distincte aussi pour A → B → A. Anciennes réponses restent attachées à leur query, jamais à la liste courante.

`retry:false`, `gcTime:0`, `staleTime:30000`, `refetchOnWindowFocus:false`, activation seulement après debounce, dropdown ouvert et viewer présent. Aucun placeholder précédent. Les anciennes queries sont collectées après détachement/fin de requête ; seule saisie courante conservée. Fermer garde son état éphémère ; réouvrir sous 30 s le réutilise, réouvrir après 30 s recharge. Toute requête/refetch masque les liens pendant chargement. Changement de viewer ou navigation remonte la feature ; nettoyage Auth existant reste inchangé.

Chargement/absence utilisent `role=status`, erreur `role=alert`. Aucun résultat : `Aucun résultat pour « xyz »`, texte échappé par React. Erreur générique, message de reconnexion pour `not_authorized`, saisie à modifier pour `invalid_query`. Aucun détail Supabase/PostgreSQL ni stack affiché ; texte conservé et modifiable.

## Résultats et identité 7D.5

Ordre et quotas exclusivement serveur, sans titres intermédiaires : Pokémon → Extension → Collection → Carte, maximum 10. Chaque ligne est un lien natif React Router, catégorie textuelle à droite.

| Résultat | Informations | Route | Identité réutilisée |
|---|---|---|---|
| Pokémon | Nom FR, Pokédex sur au moins 4 chiffres | `/catalog/pokemon/:pokemonId` | `resolvePokemonIdentity(primaryType, secondaryType)` |
| Extension | Nom FR/fallback source ; abréviation `formatFrSource` | `/catalog/extensions/:setId` | `resolveFunctionalIdentity('set')` |
| Collection | Nom ; Personnalisée, cible automatique ou Partagée · Lecture seule | `/collections/:collectionId` | `resolveCollectionIdentity(collection)` |
| Carte | Nom, numéro brut, Extension et abréviation disponibles | `/catalog/cards/:sourceCardId` | `resolveFunctionalIdentity('set')` |

Priorité Collection shared → free → automatic set → automatic pokemon → neutre intacte. Aucun hash, nom/ID utilisé pour colorer, couleur persistée ou palette concurrente. Accents et fond très légèrement teinté sur graphite ; catégorie et partage identifiables par texte. Aucun artwork, miniature, logo, série, Variante, rareté ou dénominateur inventé.

Activation explicite : fermeture, champ vidé, navigation. Aucune création de collection ni autre action métier.

## Clavier, fermeture et responsive

- Tab/Shift+Tab parcourent input puis liens dans l’ordre DOM natif ; Enter sur lien active sa navigation native. Pas de menu/listbox ni sélection active artificielle.
- Enter dans le champ empêche l’action native de lancement et fait `blur()` sur tous les navigateurs : aucune navigation/sélection, texte et suggestions conservés ; `enterKeyHint=done`. Pas de device sniffing. Enter de composition IME n’est pas intercepté.
- Escape ferme et restitue/conserve focus input, sans réouverture involontaire. Pointerdown/focusin réellement extérieur ferme sans déplacer focus de destination. Input → lien → lien reste ouvert. Reprise du focus input réouvre selon fraîcheur ci-dessus.
- Champ natif searchbox avec label et `aria-controls` lorsqu’un popup existe. Première passe axe a trouvé `aria-expanded` non supporté sur searchbox ; attribut retiré, audits finaux sans violation. Focus liens clairement visible, forced-colors prévu, aucun mouvement indispensable.
- Header desktop logo/recherche/compte, recherche deuxième ligne sous 1100 px et logo/menu mobile conservés. Seul ajout de position relative du header authentifié mobile garantit sa couche au-dessus du contenu. Popup largeur du champ, directement dessous, `max-height:min(480px,50dvh)`, scroll interne ; textes longs repliés et lignes minimum 56 px.

## Vérification navigateur réellement authentifiée

Vite de production applicative en développement sur `http://localhost:5173`, Supabase **Local** `http://127.0.0.1:55321`. `agent-browser` 0.38.2 / Chrome 154 isolé. Deux utilisateurs temporaires, login/mot de passe + enrollment/challenge/vérification TOTP réels, JWT `aal2` ; session réelle chargée dans le navigateur. Une collection libre personnelle et une collection libre d’un autre propriétaire reçue en partage créées temporairement. Catalogue réel existant ; aucun payload, service, résultat, Auth ou cache applicatif simulé.

Recherches contrôlées : Pikachu, Légendes, fraction 28/73, multi-termes Pikachu SLG, AbsentUnique7e2, Validation7e2. Pikachu : Pokémon, deux Extensions, sept Cartes. Fraction : Pikachu et Zygarde ; multi-termes : Pikachu de Légendes Brillantes. Absence : microcopy attendue, dropdown ouvert. Collection partagée et personnelle retournées dans l’ordre serveur, avec texte de partage explicite.

Navigation réelle par suggestions : `/catalog/pokemon/25` (Tab → première suggestion, Tab → suivante, Shift+Tab → première, Enter natif), `/catalog/extensions/40`, `/catalog/cards/8854`, et les deux routes UUID des collections temporaires. Pages Catalogue effectivement chargées ; collection partagée effectivement en lecture seule. Champ vidé et popup retiré après activation. Menu compte ferme la recherche ; focus dans la recherche ferme le menu.

| Viewport | Observation réelle |
|---|---|
| 1440×1000 | Champ/popup **1083.73 px** identiques, document **1440 px** ; popup limité à 480 px, résultats sous le champ et au-dessus de page ; Enter conserve popup sans navigation |
| 390×844 | Champ/popup **342 px**, document **390 px** ; popup **422 px**, contenu scrollable **690 px**, bas **582 px** ; lignes ≥ **64.22 px** ; Enter retire focus input mais conserve popup/route, Escape restitue focus et ferme |
| 320×740 | Champ/popup **272 px**, document **320 px** ; popup **370 px**, contenu scrollable **752 px**, bas **530 px** ; noms longs repliés, aucun scroll horizontal |

Captures desktop et mobile inspectées visuellement. Reduced-motion actif en contrôles mobiles : popup sans animation. Axe-core **4.12.1**, recherche ouverte : **0 violation / 0 contrôle incomplet** desktop (21 passes) et mobile (22 passes). Aucune erreur applicative console/navigateur ; seuls messages Vite/React de développement.

Chrome headless ne présente pas de clavier virtuel physique : comportement DOM mobile réel de Enter/blur/suggestions validé, fermeture visuelle du clavier sur téléphone matériel non observée. Cette limite de preuve reste distincte d’une correction fonctionnelle connue.

## Latence UI observée

Un passage par recherche, navigateur réel et réseau loopback, après correction ARIA. Temps saisie → état final mesuré avec horloge navigateur et polling DOM 20 ms ; durée RPC via Resource Timing, réseau inclus. Aucun SLA ni mesure Cloud ; valeurs incluant rendu/overhead diffèrent des EXPLAIN 7E.1.

| Requête | Saisie → résultats/absence | RPC |
|---|---:|---:|
| Pikachu | 922 ms | 592 ms |
| Légendes | 899 ms | 575 ms |
| 28/73 | 542 ms | 203 ms |
| Pikachu SLG | 818 ms | 496 ms |
| AbsentUnique7e2 | 889 ms | 566 ms |
| Validation7e2 | 867 ms | 553 ms |

Chargement visible environ une demi-seconde à presque une seconde depuis saisie stabilisée, compréhensible et continu. Pas de flash de l’ancienne liste ni clignotement excessif constaté. Texte moins immédiat que fraction, conforme aux mesures serveur précédentes ; aucune optimisation SQL ajoutée.

## Tests et contrôles finaux

| Contrôle exécuté | Résultat |
|---|---|
| Tests dédiés GlobalSearch | **26 PASS** : seuil Unicode/debounce/limite, états, erreurs, réponses tardives A → B → A, ordre/identités/routes, DOM Tab, focus, Escape/Enter, extérieur, fraîcheur et isolation/cache/nettoyage timer |
| Header + GlobalSearch + service 7E.1 ciblés | **3 fichiers / 78 PASS** ; Header **14 PASS**, anciens tests Profil/Paramètres/Déconnexion et clavier conservés |
| `npm test` final | **60 fichiers / 1 740 PASS** |
| `npm run build` | **PASS**, TypeScript et Vite, 371 modules ; chunk principal 750.50 kB, avertissement Vite >500 kB conservé, découpage hors périmètre |
| `npm run lint` | **PASS**, zéro avertissement/erreur |
| `git diff --check` | **PASS** |
| Contrat/service/types 7E.1 et SQL/migrations | Aucun ajout/modification ; ranking, quotas, payload, RLS/grants et types DB inchangés |
| Nettoyage fixtures Local | Compteurs initiaux/finals identiques : utilisateurs **1**, collections **1**, partages **0**, migrations **27** ; deux utilisateurs, collections/partage, MFA/session temporaires supprimés |

Suites DB complètes non relancées : aucun fichier DB changé. Aucun accès au projet Cloud, déploiement, commit ou push.

## Fichiers et état final

Sources principales : feature global-search (deux composants, CSS, tests), header et tests, position mobile dans styles.css, package.json/lockfile. Statuts synchronisés dans README et docs 01/04/05/06/08 ; rapport présent. Aucun fichier Catalogue, service, type, moteur ou SQL changé. Scripts/captures/session temporaires de cette validation supprimés ; serveur Vite et session navigateur de contrôle arrêtés.

Git final : branche **dev**, HEAD initial inchangé ; **11 fichiers suivis modifiés**, feature nouvelle de **4 fichiers**, ce rapport nouveau. Aucun fichier stagé. Recherche globale 7E.2 livrée ; 7F reste à réaliser. Aucune incompatibilité 7E.1 ni correction fonctionnelle restante identifiée ; limite matérielle clavier mobile ci-dessus.
