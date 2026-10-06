# Phase 7E.3.2 — Harmonisation UX/UI après tests manuels

Livraison frontend du 6 octobre 2026, version **0.7.15**. Contrats 7E.3.1 consommés sans modification. Aucun SQL, migration, RPC, service de données, contrat, ranking/quota, RLS/grant ou Cloud modifié. Aucun commit ni push ; 7F reste future.

## État initial et cadrage

- Branche `dev`, HEAD `d0d255f72ade05a1c978097da1278bdf5994de21`, commit `v0.7.14` ; branche et HEAD conservés.
- `git status --short` initial vide, aucun changement préalable ni fichier indexé.
- `package.json` et les deux versions racine du lockfile : **0.7.14 → 0.7.15**, via `npm version 0.7.15 --no-git-tag-version`. Aucun changement de dépendance.
- AGENTS.md, README, docs 01/04/05/08/09 et rapport 7E.3.1 lus ; composants, CSS, types, tests Catalogue/recherche/Collection/Détail/exemplaires inspectés avant modification.
- Contrats présents : recherche Carte `imageUrl`/`pokemon`, recherche Extension `logoUrl`, Détail Variante `sourceCardId`/`setId`/`pokemon`. Aucun enrichissement ni requête supplémentaire.
- `supabase migration list --local` exécuté en lecture seule : **28 fichiers / 28 migrations appliquées**, dernière `20261006120339`.
- Cloud : **23 au dernier checkpoint confirmé par le propriétaire**, jusqu’à `20260928083830`. État historique documenté, aucune relecture Cloud dans cette phase.

## Identité Carte centralisée

[`catalog-identity.ts`](../../src/lib/catalog-identity.ts) possède `resolveCardIdentity(pokemon)` et `CARD_FALLBACK_ACCENT = '#C9A34A'`, ambre/or doux frontend uniquement. Même résolveur dans la fiche Catalogue Carte et les suggestions Carte ; Extension reste **#44C7B7**, Personnalisée **#E22B35**, Partagée **#6366F1**.

1. Aucun Pokémon, ou au moins un Pokémon sans type primaire exploitable : fallback Carte.
2. Un Pokémon : identité complète `resolvePokemonIdentity(primaryType, secondaryType)`.
3. Tous les couples ordonnés principal/secondaire exactement identiques : même identité complète.
4. Sinon intersection des ensembles de types de tous les Pokémon ; exactement un type commun : identité simple de ce type.
5. Intersection vide ou multiple : fallback. Les couples inversés ne deviennent pas arbitrairement une identité double.

Le premier couple sert uniquement de référence de comparaison/intersection ; aucun Pokémon n’est choisi arbitrairement. Pas de mutation, tri, extraction depuis nom/image/Extension/ID ni persistance de couleur. Les types restent validés par les services 7E.3.1 existants. Accent, secondaire, bordure, gradient, focus et liens contextuels passent par `CatalogIdentity`.

Tests : zéro, simple, double, couples identiques, `electric` + `electric/flying`, secondaire commun, aucun type commun, métadonnée insuffisante, secondaire orphelin, couples inversés, déduplication des ensembles, absence de mutation et invariance d’ordre. Tests consommateurs prouvent l’usage du même résolveur et le maintien du teal Extension.

## Liens et recherche globale

[`styles.css`](../../src/styles.css) retire le soulignement au repos des liens. Hover des liens textuels classiques : soulignement lisible. Boutons, tuiles, menu utilisateur et suggestions complètes conservent leurs états explicites sans soulignement imposé. Menu actif : fond/graisse conservés, aucun soulignement permanent. Focus visible et `<summary>` inchangés.

La règle courante est **« pas de soulignement permanent, hover autorisé »**. Les six documents courants sont cohérents ; le rapport historique 7E.3.1 n’est pas réécrit.

[`GlobalSearchSuggestion`](../../src/features/global-search/GlobalSearchSuggestion.tsx) affiche à gauche :

- Carte : `CardImage` commun, hauteur **44 px**, ratio conservé (environ 31,5 × 44 px), image décorative puisque le nom est adjacent. Absence/échec : placeholder commun, alt vide, aucun contrôle indépendant.
- Extension : logo décoratif **44 × 36 px**, `object-fit: contain`. Absence/échec : image retirée, texte récupérant l’espace ; aucune image cassée ni illustration inventée.
- Pokémon et Collection : aucune colonne média artificielle.

Nom/contexte repliables et catégorie textuelle à droite ; minimum 56 px, focus et navigation inchangés. Aucun changement de debounce, ordre, quota ou routes.

## Trois vues Cartes Catalogue

[`CatalogVariants`](../../src/features/catalog/CatalogVariants.tsx) rend deux zones logiques sous l’image uniquement en mode `cards` :

```text
Nom · Abrév · N°
Variante
```

Pokémon utilise les métadonnées de chaque Variante ; Extension utilise son abréviation parente ; Carte utilise le contexte parent déjà chargé pour chaque Version. `formatFrSource` reste commun ; pas de séparateurs vides. Le fallback de nom Extension existant reste lié dans Pokémon lorsque les abréviations manquent. Le label absent garde `Variante indisponible`.

Liens Carte/Extension existants conservés, frères du bouton Détail ; aucune interaction imbriquée. En Cartes Extension, groupe Pokémon supplémentaire retiré ; en Cartes Carte, date supplémentaire retirée. Liste conserve structure, Pokémon et dates distinctes utiles.

Géométrie alignée sur `.collection-card-grid` / `.collection-content-card` : minimum **168 px**, auto-fill desktop, gaps **16/12 px**, rayon image **12 px**, espacement image/informations **8 px**, nom **.78rem**, Variante **.72rem** avec marge 2 px. Mobile : **deux colonnes**, gaps **14/10 px**. Les textes peuvent se replier tout en restant deux zones logiques.

Ordre backend, filtres locaux, préférences, routes et clic principal conservés. Aucun reorder, action Collection, possession ou grayscale dans les entrées Catalogue.

## Fiche Carte et Détail Variante

[`CatalogCardPage`](../../src/features/catalog/CatalogCardPage.tsx) utilise `resolveCardIdentity(card.pokemon)` ; `Pokémon associés` devient **Pokémon**, y compris le libellé accessible correspondant.

Nouveau petit presenter [`CatalogCardMetadata`](../../src/features/catalog/CatalogCardMetadata.tsx), avec CSS partagé : même ordre/libellés pour fiche Carte et panneau : **Extension → Rareté → Catégorie → Série → Date de sortie**, valeurs absentes omises. Extension et Série privilégient FR avec fallback source ; date via le formateur UTC commun. Puis **Pokémon**, liens indépendants vers chaque Pokémon nommé, séparateurs sobres, groupe absent sans nom exploitable.

[`VariantDetailPanel`](../../src/features/variant-detail/VariantDetailPanel.tsx) conserve la composition compacte image + texte desktop et le plein écran mobile :

```text
Image Variante / Nom Carte
Label Variante
Abrév · N°
Métadonnées communes Carte
Pokémon
Caractéristiques
Exemplaires physiques
```

Caractéristiques : **Type, Sous-type, Finition, Stamps, Taille**, uniquement disponibles ; **Type seul visible**, taille `standard` omise. Label Variante non répété ; aucune ligne Abréviation/Numéro indépendante et aucune nouvelle action « Voir la Carte ».

Les liens Extension/Pokémon utilisent React Router. Activation normale, souris ou Entrée : fermeture acceptée puis navigation ; cleanup du dialog, overflow restauré. Clic modifié : comportement natif conservé. `PhysicalCopiesContent.close()` retourne uniquement l’acceptation de son verrou existant ; écriture/relecture en cours empêche également la navigation. Aucun nouvel état métier ni verrou concurrent.

`PhysicalCopiesContent` reste monté indépendamment du catalogue, y compris pendant un rafraîchissement réussi ou échoué. Ajout/édition/suppression, propriétaire/partage lecture seule, possession et Escape restent couverts. Le piège de focus commun inclut désormais les liens et les disclosures natifs ; Tab ne reboucle pas prématurément sur Fermer.

L’identité du panneau reste contextuelle. Label et liens utilisent l’encre contextuelle existante (`collection-ink`, sinon `catalog-ink`) : correction du contraste rouge détecté au navigateur, sans imposer l’identité Carte à une Collection.

## Validation réelle — Supabase Local et navigateur authentifié

Session **agent-browser `my-7e32-auth`**, Chromium visible, authentifiée manuellement par le propriétaire sur `http://127.0.0.1:5173`. Lectures réelles des RPC Local ; aucune session simulée, fixture navigateur, nouveau compte/collection ou mutation d’exemplaire.

| Contrôle | Preuve réelle |
|---|---|
| Recherche `Pikachu` | Pokémon et sept Cartes électriques `#E2C84A`, deux Extensions teal `#44C7B7`, catégorie explicite, miniatures 44 px, logo Détective Pikachu borné ; logo échoué retiré après erreur |
| Carte sans Pokémon | `Recherches Professorales`, suggestion et fiche `/catalog/cards/13180` en `#C9A34A`, aucun groupe Pokémon vide |
| Catalogue Pokémon | `/catalog/pokemon/25`, Pikachu, 254 Versions ; Liste puis Cartes réellement activées et captures inspectées |
| Catalogue Extension | `/catalog/extensions/14`, Set de Base, 411 Versions ; Liste avec Pokémon, Cartes sans zone Pokémon supplémentaire ; lien Carte indépendant vers Alakazam |
| Catalogue Carte | `/catalog/cards/236`, Alakazam, quatre Versions, identité psy ; Liste puis Cartes, contexte répété et aucune date sous les images |
| Carte Pikachu | `/catalog/cards/7436`, identité électrique, `Pikachu · P5 · 12`, Normal/Holo ; Détail Normal avec **Type seul** réellement visible |
| Référence Collection | Collection personnelle existante `test`, 11 entrées et 3 possédées ; Cartes comparées visuellement et géométriquement, mode Classeur initial restauré |
| Détail depuis Pokémon | Image, nom/Variante/contexte, ordre commun, Pokémon, caractéristiques et exemplaires personnels ; lien Extension vers Set de Base ferme/nettoie le panneau |
| Détail depuis Carte | Alakazam puis Pikachu ; lien Pokémon vers `/catalog/pokemon/65`, et Entrée sur Extension vers `/catalog/extensions/14`, dialog retiré et overflow vide |
| Détail depuis Collection | Pikachu possédé, exemplaire existant, contexte rouge conservé ; formulaire ouvert sans sauvegarde, note temporaire puis Escape revient à la liste, second Escape ferme |

Largeurs réellement contrôlées : **1440 × 1000**, **390 × 844**, **320 × 740**. Trois Catalogues Cartes contrôlés à chaque largeur ; deux colonnes mobile, images/textes bornés. Comparaison Collection : mêmes colonnes/gaps/rayon/typo/espacement. Le panneau occupe 620 px desktop et tout l’écran mobile.

Le contrôle par capture a révélé un scroll horizontal à 320 px lié au `min-width: 320px` du body avec scrollbar verticale classique Windows. Minimum retiré, sans masquer l’overflow. Mesure finale correcte : `scrollWidth <= documentElement.clientWidth` (305 px disponibles à 320 avec scrollbar), deux colonnes Catalogue et aucune barre horizontale. Recherche : page et popup sans overflow aux trois largeurs, catégories intégralement dans leurs lignes.

Repos/hover du lien Extension : `none` → `underline`. Menu Profil actif : `none` au repos et au hover, graisse 600. Parcours réel **Fermer → Extension → Pokémon → Ajouter → Fermer**, Shift+Tab inverse, focus visible ; Escape et restauration du déclencheur exact vérifiés. `prefers-reduced-motion: reduce` réellement émulé puis réglage restauré. Footer navigateur confirmé **v0.7.15**.

Audit axe-core **4.12.1**, commande complète sans filtre : panneau Collection corrigé **0 violation / 0 incomplete / 30 passes** ; panneau Carte Alakazam **0 / 0 / 27**. Fiche sans Pokémon : 0 violation, 47 passes, contraste sur gradients signalé incomplete ; recherche sur Dashboard : 0 violation, 46 passes, contraste du contenu sous-jacent signalé incomplete. Contraste des rôles de palette/fallback/encre sur graphite et surface du panneau couvert par test numérique ; les incomplete ne sont pas présentés comme des vérifications axe réussies.

Forced-colors : règles existantes relues et conservées (Canvas/LinkText/Highlight, focus explicite), **pas d’émulation native forced-colors effectuée**. Images informatives nommées dans Catalogue/Détail, médias recherche décoratifs alt vide ; absence de contrôles imbriqués vérifiée. Pas de test lecteur d’écran réel ni CRUD sur les exemplaires du compte ; droits lecture seule/CRUD/verrou/réconciliation couverts par tests automatisés.

## Validation automatisée finale

- Tests ciblés pendant développement : neuf fichiers / **238 tests réussis** (identité, recherche, trois pages Catalogue, Variants, panneau, Collection Liste/Classeur).
- Après correction du parcours clavier : panneau/exemplaires/identité, quatre fichiers / **94 tests réussis**.
- `npm test` final : **61 fichiers / 1 811 tests réussis**, code 0.
- `npm run build` final : typecheck et Vite réussis, code 0 ; bundle principal 752,09 kB (212,83 kB gzip). Avertissement de chunk >500 kB déjà présent dans le socle ; aucun travail de découpage hors périmètre.
- `npm run lint` : réussi, zéro warning, code 0.
- `git diff --check` : réussi, code 0.
- Deux messages JSDOM `Not implemented: navigation to another Document` correspondent aux clics modifiés des tests de liens ; aucune assertion échouée.
- Aucun SQL/migration, type généré ou service/contrat modifié. Suites DB complètes non exécutées, conformément au périmètre frontend.

## Fichiers et état final

Principaux fichiers : `catalog-identity.ts`/tests, `styles.css`, suggestion/CSS/tests recherche, `CatalogCardPage`, `CatalogContent`, `CatalogVariants`/tests/CSS, nouveau `CatalogCardMetadata`/CSS, panneau Variante/CSS/tests, handle de fermeture et piège de focus des exemplaires. Les composants/pages Pokémon/Extension et les rendus Collection sont réutilisés sans modifier leurs données ou comportement métier.

README et docs 01/04/05/08/09 mis à jour ; présent rapport créé. Rapport historique 7E.3.1 conservé. Version modifiée uniquement dans package/lockfile.

État attendu et contrôlé en fin de travail : **25 fichiers suivis modifiés, 4 nouveaux, rien indexé** ; branche `dev`, HEAD initial inchangé. Aucun fichier temporaire dans le worktree ; captures navigateur dans le répertoire temporaire système, hors dépôt. Serveur Local et fenêtre connectée laissés sur Catalogue Pikachu en Cartes desktop pour reprendre les tests manuels.

```text
 M README.md
 M docs/01-FEATURES.md
 M docs/04-UX-UI.md
 M docs/05-ARCHITECTURE.md
 M docs/08-ROADMAP.md
 M docs/09-CATALOG-CONTRACTS.md
 M package-lock.json
 M package.json
 M src/features/catalog/CatalogCardPage.test.tsx
 M src/features/catalog/CatalogCardPage.tsx
 M src/features/catalog/CatalogContent.tsx
 M src/features/catalog/CatalogSetPage.test.tsx
 M src/features/catalog/CatalogVariants.tsx
 M src/features/catalog/catalog.css
 M src/features/global-search/GlobalSearch.test.tsx
 M src/features/global-search/GlobalSearchSuggestion.tsx
 M src/features/global-search/global-search.css
 M src/features/physical-copies/PhysicalCopiesContent.tsx
 M src/features/physical-copies/trap-dialog-focus.ts
 M src/features/variant-detail/VariantDetailPanel.test.tsx
 M src/features/variant-detail/VariantDetailPanel.tsx
 M src/features/variant-detail/variant-detail.css
 M src/lib/catalog-identity.test.ts
 M src/lib/catalog-identity.ts
 M src/styles.css
?? docs/reports/2026-10-06-PHASE7E3-2-UI-HARMONIZATION.md
?? src/features/catalog/CatalogCardMetadata.tsx
?? src/features/catalog/CatalogVariants.test.tsx
?? src/features/catalog/catalog-card-metadata.css
```

Migrations **28 Local / 23 Cloud au dernier checkpoint historique** inchangées. Seules écritures normales de validation navigateur : préférences de vue ; aucun exemplaire sauvegardé, catalogue synchronisé ou donnée de test créée. Aucun commit, push ou déploiement. Aucune correction restante identifiée avant reprise des tests manuels ; limites d’accessibilité et warning de bundle explicités ci-dessus.
