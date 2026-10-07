# Phase 7F.2 — Retour commun et liens d’entités

Date : 7 octobre 2026. Version finale : **0.7.19**. **7F terminée.** Livraison frontend uniquement, sans commit ni push.

## État réel initial et reprise

| Contrôle | État |
| --- | --- |
| Branche | `dev` |
| HEAD initial et final | `173e64dc2d4aa4ad21b20a8db7bdbf90449f27ca` |
| Commit initial | `v0.7.18` |
| Git initial avant 7F.2 | Propre, aucun fichier modifié ou non suivi |
| Version initiale | `0.7.18` dans package, lock et racine du lock |
| React Router installé | `8.3.1` |
| Migrations Local | 29 fichiers et 29 migrations appliquées, alignées jusqu’à `20261007085921` |
| Dernier Cloud confirmé | 23 migrations jusqu’à `20260928083830`, checkpoint historique du propriétaire ; aucun accès Cloud pendant 7F.2 |

Avant modification : branche, status, HEAD, `AGENTS.md`, versions, composants/routes/styles/tests concernés et documentation courante inspectés. La reprise après interruption a relu status, diff et fichiers déjà modifiés. Retour partagé, liens, séparation des contrôles et documentation corrects ont été conservés. Les compléments portent sur validations, assertions d’unicité/titres Catalogue, typage sûr de l’historique, wrapping limité à la consultation, version, rapport et nettoyage.

Contrats 7F.1 réutilisés sans modification : `targetType/targetId/targetName`, `sourceCardId/setId`, ainsi que les IDs du Détail Variante et des Catalogues. Aucun ID déduit d’un texte ou converti en nombre.

## Retour partagé et fallback

[`PageBackButton`](../../src/app/PageBackButton.tsx), avec `.page-back` dans [`styles.css`](../../src/styles.css), reprend l’apparence de l’ancien `.collection-back`. Libellé unique `← Retour`, bouton natif, hauteur minimale 44 px et focus visible. Un seul exemplaire apparaît avant le contenu de Collection et des trois pages Catalogue, pendant succès, chargement, erreur et indisponibilité. Les anciens liens fixes d’indisponibilité Catalogue ont été supprimés.

Documentation React Router consultée via Context7, puis mécanisme de la version installée vérifié dans `node_modules/react-router/dist/development/lib/router/history.js`. MY. possède un seul `createBrowserRouter`, créé hors des composants.

- Lecture de `window.history.state` comme `unknown`, puis contrôle de son champ `idx`.
- Index entier positif : `useNavigate()` appelle `navigate(-1)`.
- Index absent, invalide ou zéro : `navigate('/dashboard', { replace: true })`.

Le routeur navigateur initialise l’index à zéro, incrémente les PUSH et conserve l’index pour REPLACE et refresh. Cet index distingue une entrée de l’application d’un historique navigateur plus ancien pouvant contenir un autre site ; `history.length` n’est pas utilisé. Le refresh d’une fiche issue d’un lien interne conserve le vrai retour. Un nouvel onglet ouvert directement sur une fiche prend le fallback Dashboard.

Aucun gestionnaire d’historique supplémentaire, pile métier, séquence de cartes, sessionStorage, sérialisation de filtre ou restauration manuelle de scroll. Préférences existantes inchangées. Précédente/Suivante, swipe entre cartes et navigation rapide sont abandonnés ; la pagination Classeur existante reste indépendante.

## Interactions Collection et Détail Variante

[`CollectionContentRow`](../../src/features/collections/CollectionContentRow.tsx) reprend le principe de `CatalogVariants` : wrapper visuel `.collection-detail-surface`, bouton Détail vide superposé et résumé comme frères. Liens indépendants au-dessus de la surface ; actions Exemplaires/menu à l’extérieur. La poignée DnD conserve son emplacement et ses capteurs, seul déclencheur de reorder.

[`CompactVariantSummary`](../../src/features/collections/CompactVariantSummary.tsx) reste la source commune : image/fallback, Nom · Abrév · N°, Variante et origine Auto/Perso. Les IDs optionnels de consultation sont fournis par les lignes Liste/Cartes ; résumés d’ajout/retrait et choix de Variante restent textuels. Le wrapping des liens est limité à la surface de consultation, pour conserver l’ellipsis des workflows d’action.

[`collection-content.css`](../../src/features/collections/collection-content.css) conserve grille, zone drag supérieure, actions image, touch targets et hover 7E.3.3 : accent subtil, fond teinté, bordure sans déplacement. Première ligne semibold ; Variante secondaire normale. Liens sans soulignement au repos, soulignement hover/focus, couleur issue des variables Collection existantes.

Image, numéro, Variante et zone non liée ouvrent uniquement Détail. Carte/Extension naviguent uniquement ; Exemplaires, menu et poignée restent indépendants. Label accessible `Voir le détail de …`. Aucun `<button><Link /></button>`, aucun lien imbriqué, aucun double déclenchement. En partage : mêmes liens, Détail et exemplaires lecture seule, sans poignée ni retrait. Classeur n’ajoute aucun texte/lien.

[`CollectionPage`](../../src/features/collections/CollectionPage.tsx) lie la cible automatique d’après `targetType/targetId`, sans requête. Type, accès, progression, couleur et layout conservés. Collection libre : aucune cible. Dashboard conserve sa tuile entièrement liée à Collection, sans lien cible imbriqué.

[`VariantDetailPanel`](../../src/features/variant-detail/VariantDetailPanel.tsx) lie son nom de Carte avec `sourceCardId`. Métadonnées Extension/Pokémon toujours rendues par `CatalogCardMetadata`. Garde de clic normal factorisé dans [`isPlainLinkClick`](../../src/lib/is-plain-link-click.ts) ; même fermeture `PhysicalCopiesContent.close()` pour les trois entités. Écriture et relecture d’exemplaire bloquent la navigation normale. Clics modifiés conservent le comportement natif. Dialog, overflow, focus, Escape, Caractéristiques et exemplaires conservés.

## Matrice réelle des destinations

| Surface | Texte/entité | Destination et ID |
| --- | --- | --- |
| Collection header auto Pokémon | Cible Pokémon | `/catalog/pokemon/:targetId` |
| Collection header auto Extension | Cible Extension | `/catalog/extensions/:targetId` |
| Collection Liste/Cartes, propriétaire ou partage | Nom Carte, y compris `Pikachu-ex` | `/catalog/cards/:sourceCardId` |
| Collection Liste/Cartes, propriétaire ou partage | Abrév/contexte Extension | `/catalog/extensions/:setId` |
| Détail Variante | Nom Carte | `/catalog/cards/:sourceCardId` |
| Détail Variante | Extension | `/catalog/extensions/:setId` |
| Détail Variante | Pokémon explicitement listé | `/catalog/pokemon/:pokemonId` |
| Catalogue Pokémon, Liste/Cartes | Nom Carte et contexte Extension existants | `/catalog/cards/:sourceCardId`, `/catalog/extensions/:setId` |
| Catalogue Extension, Liste/Cartes | Nom Carte | `/catalog/cards/:sourceCardId` |
| Catalogue Extension, Liste | Pokémon explicitement affiché | `/catalog/pokemon/:pokemonId` |
| Fiche Carte, métadonnées | Extension et Pokémon explicites | `/catalog/extensions/:setId`, `/catalog/pokemon/:pokemonId` |
| Recherche globale | Suggestion entière, catégorie Pokémon/Extension/Collection/Carte | `/catalog/pokemon/:pokemonId`, `/catalog/extensions/:setId`, `/collections/:collectionId`, `/catalog/cards/:sourceCardId` |

Numéro et Variante restent du texte. Les h1 représentant la page courante restent sans self-link. En Cartes Catalogue Extension, pas de groupe Pokémon ajouté ; contexte de l’Extension courante reste texte. Les Versions de la fiche Carte n’ajoutent pas de lien vers la Carte courante. `CatalogVariants` et `CatalogCardMetadata` conservent leurs références existantes et contrôles frères. `GlobalSearchSuggestion` conserve son unique Link, destination par union discriminée `kind` et ID ; aucun changement de production de Recherche globale.

## Tests automatisés

Tests ciblés exécutés pendant développement : **327 tests / 12 fichiers**, puis périmètre étendu **517 tests / 25 fichiers**. Commande étendue :

```text
npm test -- src/app/PageBackButton.test.tsx src/app/AppRoutes.test.tsx src/features/collections src/features/catalog src/features/variant-detail/VariantDetailPanel.test.tsx src/features/global-search/GlobalSearch.test.tsx src/features/dashboard/DashboardPage.test.tsx
```

- Retour : vrai routeur navigateur, entrée précédente, entrée directe malgré historique antérieur, recréation après refresh, label, bouton clavier et unicité.
- Collection Liste/Cartes et partage : `Pikachu-ex` reste Carte, IDs décimaux au-delà de la précision Number, Extension exacte, numéro/Variante sans lien, indépendance Détail/exemplaires/menu/reorder, focus poignée et ordre autoritatif.
- Cibles automatiques Pokémon/Extension, libre sans cible ; nom visible différent de l’ID démontrant l’absence d’heuristique.
- Détail Variante : routes Carte/Extension/Pokémon, clic normal ferme/nettoie, clic modifié natif, verrou écriture/relecture, Escape/focus/exemplaires.
- Catalogue : références existantes Liste/Cartes, aucune interaction imbriquée, titre courant non lié, Retour unique dans les différents états.
- Dashboard : une seule ancre dans la tuile. Recherche globale : routes de catégories et suggestion entière conservées.

Lors d’une reprise ciblée sous charge, une assertion de focus après suppression indisponible a devancé l’effet React ; les 22 tests d’actions passaient isolément. L’assertion attend désormais le focus public final avec `waitFor`, sans changement du workflow produit. Lint a également imposé la lecture typée `unknown` de `history.state`. Validations finales après corrections :

| Commande | Résultat final |
| --- | --- |
| `npm test` | **1 839 tests / 62 fichiers réussis** |
| `npm run build` | Typecheck et build réussis |
| `npm run lint` | Réussi, aucune erreur ni warning ESLint |
| `git diff --check` | Réussi |

Build signale un bundle supérieur à 500 kB, sans échec ; pas de changement de stratégie de bundle dans cette phase. JSDOM indique que la navigation de document des clics modifiés n’est pas implémentée ; les assertions de comportement passent.

## Navigateur réel — Supabase Local

Vite Local sur `127.0.0.1:5173`, API Local sur `127.0.0.1:55321`. Database existante restaurée par `supabase start`, sans reset ni application de migration. Deux utilisateurs temporaires Auth réels, TOTP vérifié/AAL2 : propriétaire et lecteur partagé. Données Catalogue réelles (`Pikachu-ex`, Carte `12650`, Extension `122`, Pokémon `25`), Collection libre avec trois variantes, un exemplaire et deux Collections automatiques. Aucune réponse Catalogue simulée.

Parcours validés par vrais clics/clavier dans sessions isolées `my7f2` et `my7f2share` :

| Parcours | Résultat |
| --- | --- |
| Dashboard → Collection → Retour | Dashboard |
| Collection → Carte → refresh → Retour | Collection |
| Collection → Extension → Retour | Collection |
| Pokémon → Carte → Retour | Pokémon |
| Extension → Carte → Retour | Extension |
| Recherche globale → Carte → Retour | Page MY. précédente, Extension dans cette preuve |
| Nouvel onglet direct Carte → Retour avec Enter | Dashboard, index initial zéro |
| Cible automatique Pokémon/Extension | Bon Catalogue ; retour Pokémon vers Collection vérifié |

Liste **et** Cartes : Carte, Extension, numéro, Variante, image/Détail, exemplaires et menu testés indépendamment. Détail Carte/Extension/Pokémon ferme le dialog et restaure `body.style.overflow`. Partage Liste **et** Cartes : liens et Détail/exemplaires en lecture seule, aucune poignée/menu/action d’écriture.

Reorder propriétaire Liste **et** Cartes : souris et clavier réels, focus poignée conservé, états idle → pending → success/coche observés. Ordre rendu comparé à une relecture authentifiée indépendante `getCollectionContent`. Tactile **émulé Chromium**, via événements touch et appui prolongé : Liste et Cartes déplacées, pending/coche et même ordre autoritatif confirmés. Aucun lien traité comme poignée. Aucun appareil tactile physique utilisé.

## Responsive et accessibilité

Widths **1440, 390, 320 px**, captures inspectées : Collection Liste/Cartes et Détail Variante. Les quatre pages ont exactement un Retour, au même emplacement à largeur donnée : x=24/y=130 sur desktop ; x=24/y=196 sur mobile, hauteur 44 px. Aucun débordement horizontal, aucun contrôle imbriqué, h1 sans lien. Liens sous image, wrapping naturel, géométrie de grille et contrôles d’au moins 44 px conservés. Panneau Variante : largeur 620/390/320 px, contenu dans le viewport, pas de débordement interne, cleanup Escape correct.

Tab navigateur : Détail → Carte → Extension → Exemplaires ; liens accessibles séparément et outlines visibles. Bouton Retour activé avec Enter. Trap natif du dialog conservé. Forced-colors **émulé** : couleurs système, lien et outline de 2 px visibles ; capture contrôlée. Reduced-motion **émulé** actif, règles existantes conservées.

Audit axe-core **4.12.1**, WCAG2 A/AA, à 390 px : **zéro violation détectée** dans Liste, Cartes et Détail. Un contrôle contraste incomplet sur chaque surface : gradients/superpositions empêchent axe de déterminer certains fonds. Ce résultat ne constitue pas une certification exhaustive de contraste ; rendu et focus vérifiés visuellement.

## Version, périmètre et clôture

`package.json`, `package-lock.json` et racine du lock : **0.7.18 → 0.7.19**. Aucune dépendance ajoutée/modifiée. Aucun fichier SQL, migration, RPC, view, service de données, type DB généré ou synchronisation modifié. **29 Local appliquées / 23 Cloud au dernier checkpoint confirmé**, sans nouvel accès Cloud.

Documentation actualisée : README, Features, UX/UI, Architecture, Roadmap ; deux anciennes formulations des contrats Catalogue corrigées. Cadrage courant sans Précédente/Suivante/swipe entre cartes à réaliser. Les rapports historiques et la pagination Classeur existante ne sont pas réécrits.

Fixtures nettoyées par suppression contrôlée des deux seuls utilisateurs temporaires Local ; absence des utilisateurs, Collections, items, exemplaires, partages et préférences vérifiée. Sessions navigateur de test fermées, scripts/JSON/log/captures temporaires supprimés. Aucun fichier temporaire conservé. Le serveur Vite lancé pour cette validation est arrêté ; Supabase Local reste disponible.

Git final : branche et HEAD inchangés ; **31 fichiers modifiés et 4 nouveaux fichiers non suivis**, aucun fichier staged. Nouveaux fichiers : `PageBackButton.tsx`, son test, `is-plain-link-click.ts`, ce rapport. Modifications limitées aux consommateurs/styles/tests frontend, aux deux fichiers de version et à la documentation. Aucun commit ni push.

**7F est terminée : 7F.1 fournit les IDs ; 7F.2 livre le Retour partagé et les liens d’entités.**
