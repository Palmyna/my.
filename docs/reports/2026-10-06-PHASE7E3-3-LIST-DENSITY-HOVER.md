# Phase 7E.3.3 — Densité des listes et harmonisation du hover

Correction frontend locale du 6 octobre 2026, **0.7.15 → 0.7.16**. Aucune nouvelle fonctionnalité, dépendance, modification SQL/DB/RPC/contrat/service/RLS/grant/ranking ou action Cloud. Aucun commit ni push. Statut 7F inchangé.

## État initial et périmètre

- Branche `dev`, HEAD `203ad998ad5af5611ed8400eb7cd22d3c564e43b`, commit `v0.7.15` ; branche et HEAD conservés.
- Git initial : ` M src/features/catalog/catalog.css` et ` M src/features/global-search/global-search.css` ; rien indexé.
- Modifications préexistantes préservées : padding `0 10px 10px 10px` de `.catalog-variant-info` et popup Recherche globale porté à `min(700px, 70dvh)`. Le padding Catalogue est neutralisé uniquement en Liste ; la vue Cartes conserve le rendu initial du worktree, y compris cet ajustement préalable.
- Package et deux versions racine du lockfile initialement `0.7.15`. Mise à jour via `npm version 0.7.16 --no-git-tag-version`, après validations initiales et navigateur. Aucun changement de dépendance ; footer réel `v0.7.16` vérifié après redémarrage automatique de Vite.
- AGENTS.md, cadrage utilisateur, documentation UX/état courant et rapport 7E.3.2 relus. CSS, composants Catalogue/Collection/Détail, styles globaux, renderer et chemins reorder/List/Cards, tests existants inspectés avant correction.

## Cause et correction

Les liens texte avaient une géométrie de contrôle autonome : `min-height: 36px`, portée à `44px` mobile ; résumé Catalogue avec `padding-block: 6px`, Pokémon avec `padding: 4px 2px`. Leurs boîtes agrandissaient les lignes, désalignaient métadonnées et séparateurs, et s'ajoutaient à la miniature Catalogue de 44 px, gap 14 px, padding 12 px et padding préalable du contenu.

Dans `catalog.css`, les liens de `.catalog-variant-summary` perdent `display: inline-block`, minimum et padding vertical ; minimum mobile retiré. Dans `catalog-card-metadata.css`, les liens de métadonnées et Pokémon perdent minimum desktop/mobile et géométrie `inline-flex`; padding Pokémon retiré. Hauteur désormais liée au texte/line-height, sur desktop et mobile. Couleurs, soulignement au hover, focus global/dialog, liens React Router, position/z-index 2 restent conservés. Aucun bouton tactile modifié.

Les ajustements de densité ciblent `.catalog-variants-list` : miniature 36 px, gap 12 px, padding 6 px, contenu sans padding supplémentaire, nom/contexte et premier label Carte `.88rem`, Variante `.75rem`, marge 2 px. Pokémon supplémentaires `.75rem`. Mobile : gap 8 px, padding `4px 2px`, première ligne `.78rem`, Variante/Pokémon `.7rem`, comme Collection. Résumé conservé en flex avec wrap/baseline ; ancienne colonne mobile retirée pour éviter une ligne de contexte systématique. Nom long ou contexte reviennent à la ligne selon l'espace réel, sans minimum artificiel.

Informations, ordre backend, dates, liens Carte/Extension/Pokémon et bouton Détail frères inchangés. Aucun TSX ni test modifié. Les règles de densité ne ciblent pas Cartes ; `Nom · Abrév · N°` puis Variante, géométrie, espacement et deux colonnes mobile restent ceux du worktree initial.

## Hover Collection

Hover Catalogue conservé exactement : bordure `color-mix(in srgb, var(--catalog-accent) 50%, var(--border))`, fond accent 4 % transparent.

L'ancien fond `var(--surface-hover)` du bouton Détail Collection est retiré. Nouveau traitement uniquement dans `.collection-content`, sur les lignes `.collection-content-list > li` et `.collection-reorder-list > .collection-reorder-row` : fond `--collection-accent` 4 %, bordure mélangeant `--collection-accent` 50 % et `--collection-border`. Cadre en pseudo-élément absolu, rayon hérité 8 px, `pointer-events: none` ; aucun déplacement ni réduction du contenu. Zone visuelle complète, poignée et actions comprises. Aucun `--catalog-accent` introduit dans Collection.

Focus visible du bouton Détail active également le cadre, sans retirer son outline. Exemplaires, menu et poignée conservent leurs focus/actions indépendants et dimensions tactiles. Grayscale et atténuation ne portent toujours que sur image/informations manquantes ; le hover reste visible. Aucune nouvelle règle sur Cartes/overlays ni feedback reorder.

Ownership : CSS possède seulement la présentation ; lecteurs, writers, données et autorisations restent ceux des composants/services existants. Transition réversible par retrait des changements CSS de cette phase, sans annuler les modifications préexistantes ; aucune migration de données, fenêtre de compatibilité backend ni contraction requise.

## Navigateur réel — Supabase Local

Chromium visible, session isolée `my-7e33`, connexion réalisée manuellement par le propriétaire sur `http://127.0.0.1:5173`. Données et RPC Local réels, aucune fixture/session simulée. Captures inspectées et styles/dimensions calculés contrôlés. Viewports : **1440 × 1000**, **390 × 844**, **320 × 740/844**.

| Écran | Vérification réelle |
|---|---|
| Collection `test` | 12 entrées, 3 possédées ; Liste desktop/mobile, miniature 36 px, hover rouge sur carte manquante, grayscale 1 et opacité .55 conservés. Cadre comprenant poignée et actions, hauteur identique avant/après hover. Cartes desktop/mobile sans nouveau cadre, overlays conservés. |
| Catalogue Pokémon `/catalog/pokemon/25` | 254 Versions, Liste desktop/mobile ; nom/Extension/Variante alignés, liens séparés, hover électrique 4 % / bordure 50 % conservé. Cartes et deux colonnes mobile contrôlées. |
| Catalogue Extension `/catalog/extensions/14` et `/99` | Set de Base puis Éclipse Cosmique ; Liste compacte et Pokémon supplémentaires conservés. Florizarre/Vipélierre et Reshiram/Zekrom réels : liens et séparateurs alignés, wrap du nom/contexte à 320 px. Cartes sans bloc Pokémon additionnel. |
| Catalogue Carte `/catalog/cards/236` et `/8289` | Alakazam puis Reshiram et Zekrom GX ; Versions Liste à miniature 36 px, fiche/métadonnées/liens compacts. Cartes conserve contexte et Variante, deux colonnes mobile. |
| Détail Variante | Depuis Carte, Extension et Collection ; Extension/Pokémon compacts, métadonnées alignées, Caractéristiques et Exemplaires conservés. Panneau 620 px desktop, largeur viewport mobile, pas d'overflow horizontal ; exemplaire réel `Exemplaire 1` toujours visible pour Pikachu. |

Mesures de densité : contenu Collection et ligne Catalogue Pokémon/Carte **62,25 px desktop**, **58,25 px mobile**. Collection conserve en plus 6 px de marge de ligne existante. Extension avec ligne Pokémon : **78,81 px desktop**, **69,53 px mobile** quand le contexte tient sur une ligne ; **90,10 px** à 320 px pour un nom/contexte long qui wrap. Écart expliqué par les informations supplémentaires, pas par la hauteur des liens.

Cartes mobile : deux colonnes mesurées, gaps 14/10 px, miniature pleine largeur ; aucun cadre Collection de Liste injecté. Les liens inline inspectés ont padding 0 et minimum 0/auto, jamais 36/44 px. Page et dialog sans overflow horizontal ni contrôles imbriqués. Contrôles Liste Collection mesurés à 44 px (poignée, exemplaires, menu), bouton Détail au moins 44 px.

Interactions réelles : lien Carte depuis Extension navigue sans Détail ; lien Extension depuis Pokémon navigue sans Détail ; séquence Tab Fermer → Extension → Pokémon avec outline visible, Entrée sur Pokémon navigue et ferme le panneau. Escape ferme et restitue le bouton Détail exact, outline visible. Raccourci Exemplaires ouvre son dialog indépendant ; menu ouvre `Retirer de la collection` sans Détail, puis Escape. Poignée clavier : Space sélectionne (une ligne `is-dragging`), Escape annule (zéro), ordre initial conservé. Aucun reorder validé, retrait ni écriture d'exemplaire. Choix de vues seuls exercés via le contrat existant ; Classeur Collection initial restauré.

Limites : pas de CRUD réel sur les exemplaires, de validation de déplacement métier, de lecteur d'écran, ni nouvelle émulation forced-colors. Droits/CRUD/verrou/reconciliation/reorder validé couverts par les tests existants. Aucun résultat fixture présenté comme preuve backend.

## Validation automatisée

- Tests ciblés : **9 fichiers, 215 tests réussis** — CatalogVariants, trois pages Catalogue, VariantDetailPanel, CollectionContentList, CollectionItemReorderList, CollectionCardsReorder, ManualCollectionItems.
- Tests existants suffisants : liens indépendants, contenu/order/dates, Carte à deux lignes, trap/Escape/focus, exemplaires et verrou, menu/reorder et possession. Aucune assertion CSS fragile ajoutée.
- Suite finale `npm test` sur **0.7.16** : **61 fichiers, 1 811 tests réussis**, exit 0. Deux messages JSDOM de navigation externe non implémentée, sans échec.
- `npm run build` final : typecheck et build réussis, exit 0. Build initial signalait la taille de chunks >500 kB ; optimisation hors périmètre.
- `npm run lint` final : exit 0, zéro warning.
- `git diff --check` : exit 0 ; versions package/lockfile `0.7.16`, diff backend vide.

## DB, documentation et Git final

`supabase migration list --local`, lecture seule : **28 migrations présentes/appliquées**, dernière `20261006120339`. **Cloud 23 au dernier checkpoint confirmé par le propriétaire**, dernière `20260928083830` ; information historique du rapport 7E.3.2, aucune relecture Cloud dans cette phase. Aucun SQL, migration, reset, type DB généré, contrat ou service modifié.

Documentation : UX actualisé pour les trois règles visuelles ; README/version et table de versions, intitulés d'état courant Features et version courante Roadmap synchronisés. Statut 7F, ordre/périmètre des grandes phases et documents backend inchangés. Captures/scripts temporaires de vérification supprimés à la clôture.

Git final observé, aucun fichier indexé :

```text
 M README.md
 M docs/01-FEATURES.md
 M docs/04-UX-UI.md
 M docs/08-ROADMAP.md
 M package-lock.json
 M package.json
 M src/features/catalog/catalog-card-metadata.css
 M src/features/catalog/catalog.css
 M src/features/collections/collection-content.css
 M src/features/global-search/global-search.css
?? docs/reports/2026-10-06-PHASE7E3-3-LIST-DENSITY-HOVER.md
```

Recherche globale : diff exclusivement préexistant, conservé sans modification. Catalogue : padding préalable conservé, reste du diff attribuable à 7E.3.3. Aucun commit ni push ; HEAD initial inchangé.
