# Phase 7E.3.4 — Cohérence visuelle et vocabulaire Catalogue

Livraison frontend locale du 6 octobre 2026, **0.7.16 → 0.7.17**. Aucune nouvelle fonctionnalité métier, dépendance, modification SQL/migration/RPC/RLS/grant/service/contrat ou action Cloud. Aucun commit ni push. Navigation contextuelle 7F non livrée.

## État réel initial

- Branche `dev`, HEAD `d4138d52179ef4fc2f14fe36ed092e83b804fd5f`, commit `v0.7.16`.
- `git status --short` vide : dépôt propre, aucun changement local préexistant ni fichier indexé.
- `package.json`, `package-lock.json` et `packages[""].version` : `0.7.16`.
- AGENTS.md, styles globaux, trois pages Catalogue, CatalogVariants, CatalogCardMetadata, panneau Variante, résumé compact/ligne/CSS Collection, tests correspondants, UX, Features, Roadmap, contrats Catalogue et rapport 7E.3.3 inspectés.
- Lecteurs/writers inchangés : services et contrats existants possèdent les données, IDs, ordre, autorisations, exemplaires et préférences. CSS possède la présentation ; les pages ne changent que le libellé du compteur.
- Transition compatible avec les consommateurs précédents et les mêmes payloads. Retour arrière : restaurer uniquement les fichiers frontend, version et documentation de cette étape ; aucune migration de données, contraction ou action Cloud nécessaire.

## Réutilisation et corrections

AGENTS.md reçoit une règle durable dans les principes de réalisation : rechercher un équivalent avant de créer composant, pattern visuel ou CSS ; réutiliser/factoriser les concepts communs ; justifier une divergence par une différence fonctionnelle ou UX réelle. Règle générique, indépendante de la Phase 7 et sans architecture imposée.

`CatalogCardMetadata` reste le composant commun de la fiche Carte et du Détail Variante. Sa présentation Carte reste la référence : labels Extension, Rareté, Catégorie, Série, Date de sortie et Pokémon en **600**, valeurs en **400**. Labels `.8rem`, valeurs `<dd>` `.9rem` ; Pokémon conserve ses liens compacts existants. `font-weight: 400` est explicite dans la règle commune `<dd>`.

Suppressions dans `variant-detail.css` : overrides du composant commun `dt` à `.7rem`, couleur atténuée et graisse `400`, et `dd` à `.85rem`. Les règles dupliquées de grille, min-width et typographie de `.variant-detail-metadata` disparaissent également. Restent les seuls besoins du panneau : couleur contextuelle des liens, marges, gaps/layout responsive.

Caractéristiques utilise maintenant `<dl class="catalog-card-metadata variant-detail-metadata">` : même grille et mêmes règles `<dt>/<dd>`, sans troisième pattern. Sa classe spécifique ne possède que ses marges. Titre de section conservé ; aucun changement de filtrage : valeurs absentes omises, Type seul visible, taille `standard` masquée, Variante non répétée.

Dans `catalog.css`, suppression de `.catalog-variants-list > li + li { border-top: ... }`, sans bordure de remplacement. Poids `600` porté par `.catalog-variant-summary` plutôt que par le seul nom : Carte, séparateur, Extension et Numéro héritent du même poids. Variante suivante reste normale (`400`). TSX de `CatalogVariants` inchangé : liens Carte/Extension, texte Numéro et bouton Détail frères ; aucun contrôle imbriqué.

Densité 7E.3.3 conservée : miniature Liste 36 px, paddings/gaps et responsive inchangés, liens compacts sans minimum/padding vertical artificiel, vrais contrôles tactiles inchangés. Hover Catalogue et hover Collection `--collection-*` conservés ; CSS et première ligne Collection inchangés.

Dans `styles.css`, suppression de la surcharge `.collection-overview .collection-progress-track` sur `--surface-hover`. Dashboard et header Collection consomment directement la règle commune `background: var(--app-bg)`. Remplissage `--collection-accent`, hauteur 5 px, rayon 8 px, valeurs/pourcentage et forced-colors conservés.

## Vocabulaire et cadrage futur

- Catalogue Pokémon : `1 carte` / `N cartes`, depuis le même `variantCount`.
- Catalogue Extension : `1 carte` / `N cartes`, depuis le même `variantCount`.
- Catalogue Carte : `1 version` / `N versions`, toujours depuis `card.variants.length` ; section Versions et usages fonctionnels Variante/version conservés.
- Contrat `variant_count` inchangé ; aucun comptage de Cartes sources distinctes ni remplacement global de « version ».

README, Features, UX, Roadmap et contrats Catalogue alignés sur le vocabulaire et l'état courant. Rapports historiques conservés.

Cadrage 7F enrichi dans UX, Features et Roadmap : Collection Liste/Cartes, nom de Carte vers `/catalog/cards/:cardId`, contexte Extension vers `/catalog/extensions/:setId`, Numéro non cliquable. Surface principale Détail, exemplaires/menu/reorder indépendants, aucun contrôle imbriqué ; même comportement en partage lecture seule lorsque Catalogue autorisé. Futur `get_collection_content` enrichi avec `source_card_id` et `set_id`, absents aujourd'hui, sans reconstruction frontend. Ces liens devront intégrer contexte d'origine, retour avec restauration, précédente/suivante et swipe mobile selon contexte. Aucun de ces comportements ni enrichissement implémenté ici.

## Navigateur réel — Supabase Local

Chromium visible, session isolée `my-7e34`, application `http://127.0.0.1:5173`, API Local `http://127.0.0.1:55321`. Connexion manuelle du propriétaire, vrais payloads et RPC Local ; aucune fixture, session simulée ou preuve Cloud. Captures inspectées et styles/dimensions calculés vérifiés.

| Écran | Preuve réelle |
| --- | --- |
| Collection `test` | Liste à 1440 × 1000, 390 × 844 et 320 × 844 ; première ligne `600`, Variante `400`, aucun overflow. Progression `3 / 12`, `25 %`, fond `rgb(14, 16, 20)`, hauteur 5 px et rayon 8 px à chaque largeur. |
| Dashboard | Progression réelle desktop : même fond `rgb(14, 16, 20)`, hauteur 5 px et rayon 8 px. Progression des tuiles reste masquée mobile selon le comportement existant. |
| Carte `/catalog/cards/236` (Alakazam) | Métadonnées Carte et panneau Variante comparées directement aux trois largeurs ; labels `600 / 12.8px`, valeurs `400 / 14.4px`, même texte clair pour les labels. Pokémon et Caractéristiques suivent le même langage. Compteur `4 versions`. |
| Pokémon `/catalog/pokemon/25` | Aux trois largeurs : `254 cartes`, première ligne entière et liens `600`, Variante `400`, bordure supérieure des éléments `0px`, aucun contrôle imbriqué ni overflow. |
| Extension `/catalog/extensions/14` | Aux trois largeurs : `411 cartes`, Liste `600/400`, zéro séparateur statique, aucun overflow. |
| Extension `/catalog/extensions/99` | À 320 px : `271 cartes`, nom long `Florizarre et Vipélierre GX` et contexte qui reviennent à la ligne, toujours `600`, Variante normale, liens Pokémon conservés, aucun overflow. |
| Carte `/catalog/cards/8225` | Navigation indépendante depuis Extension ; compteur réel `1 version`, métadonnées cohérentes à 320 px. |
| Détail depuis Collection | Pikachu, métadonnées `600/400`, Type/Stamps et exemplaire réel `Exemplaire 1` conservés ; lien Pokémon navigue et ferme/nettoie le dialog. |

Hover calculé Catalogue : fond accent avec alpha `.04` et bordure subtile conservée ; lien au repos sans soulignement, souligné au hover, padding `0px`, min-height `auto`. Hover Collection : fond `--collection-accent` avec alpha `.04` et bordure du pseudo-élément contextuel conservés. Boutons exemplaires/menu mesurés à 44 px.

Interactions réelles : lien Carte depuis Extension et lien Extension depuis Pokémon ne déclenchent pas le Détail. Ouverture clavier du panneau ; Tab passe par Fermer puis Extension, outline visible ; Entrée sur Extension navigue et nettoie le panneau. Escape restitue le bouton Détail exact avec focus visible. Exemplaires ouvre son dialog indépendant ; menu Mew ouvre `Retirer de la collection` sans Détail puis Escape. Poignée Mew : sélection clavier puis Escape, sans déplacement validé. Choix Liste/Cartes via préférences existantes uniquement ; vue Collection initiale Cartes restaurée. Footer réel final `v0.7.17`.

Un premier contrôle CLI de viewport signalait EOF malgré une taille réellement appliquée ; largeurs rendues vérifiées dans `innerWidth`, commandes suivantes réussies. Entrée JavaScript passée en base64 pour éviter le wrapper PowerShell et ses problèmes de quoting/stdin. Aucun effet sur le code applicatif.

Limites : pas de CRUD réel d'exemplaires, suppression/reorder validé, lecteur d'écran, session de partage réelle ni nouvelle émulation forced-colors. Tests existants couvrent droits, CRUD/verrou, focus/trap, omissions et Type seul ; règles forced-colors inchangées dans le diff. Aucun résultat fixture présenté comme preuve Auth/backend.

## Validation automatisée et version

- Tests ciblés : **9 fichiers, 216 tests réussis**, exit 0 — CatalogPokemonPage, CatalogSetPage, CatalogCardPage, CatalogVariants, VariantDetailPanel, CollectionContentList, CollectionItemReorderList, CollectionCardsReorder, ManualCollectionItems.
- Assertions adaptées : singulier/pluriel `carte(s)` et absence de `version(s)` dans les headers Pokémon/Extension ; protection `1 version`/`3 versions` Carte et absence de compteur cartes ; structure Liste avec liens indépendants, Variante seconde et Détail autonome. Typographie/bordures prouvées navigateur, sans assertions CSS fragiles.
- Tests Détail existants conservés : données/omissions, Type seul, taille standard, liens Extension/Pokémon, nettoyage, trap/Escape/focus, exemplaires et verrou écriture/relecture.
- Suite finale `npm test` sur **0.7.17** : **61 fichiers, 1 812 tests réussis**, exit 0. Deux messages JSDOM de navigation externe non implémentée, sans échec.
- `npm run build` : typecheck et build réussis, exit 0. Avertissement de chunk >500 kB déjà présent ; optimisation hors périmètre.
- `npm run lint` : exit 0, zéro warning.
- Revue TSX ciblée : mêmes composants, hooks, clés, lectures et handlers ; aucune couche de données/persistance ou dépendance ajoutée, sémantique/accessibilité préservées.
- `npm version 0.7.17 --no-git-tag-version` après tests ciblés et contrôle visuel ; trois valeurs package/lock racine synchronisées. Diff package/lock limité à ces versions, dépendances inchangées.
- `git diff --check` réussi ; rapport non suivi vérifié séparément pour whitespace et fin de fichier. Captures temporaires supprimées.

## DB et Git final

`supabase migration list --local` relu en lecture seule : **28 migrations présentes/appliquées**, dernière `20261006120339`. La colonne `remote` de cette commande désigne ici la base Local. **23 Cloud au dernier checkpoint confirmé par le propriétaire**, dernière `20260928083830` : attribution historique des documents du dépôt, aucune relecture Cloud.

Aucun changement sous `supabase`, `src/services`, `src/types` ou `scripts` ; aucun SQL, migration, RPC, RLS, grant, contrat, service de données, synchronisation catalogue, reset ou action Cloud. Seuls les choix de vue ont exercé les préférences UI existantes pendant le contrôle navigateur.

Branche et HEAD initiaux conservés. Aucun fichier indexé, aucun commit ni push. Git final :

```text
 M AGENTS.md
 M README.md
 M docs/01-FEATURES.md
 M docs/04-UX-UI.md
 M docs/08-ROADMAP.md
 M docs/09-CATALOG-CONTRACTS.md
 M package-lock.json
 M package.json
 M src/features/catalog/CatalogCardPage.test.tsx
 M src/features/catalog/CatalogPokemonPage.test.tsx
 M src/features/catalog/CatalogPokemonPage.tsx
 M src/features/catalog/CatalogSetPage.test.tsx
 M src/features/catalog/CatalogSetPage.tsx
 M src/features/catalog/CatalogVariants.test.tsx
 M src/features/catalog/catalog-card-metadata.css
 M src/features/catalog/catalog.css
 M src/features/variant-detail/VariantDetailPanel.tsx
 M src/features/variant-detail/variant-detail.css
 M src/styles.css
?? docs/reports/2026-10-06-PHASE7E3-4-UI-CONSISTENCY.md
```
