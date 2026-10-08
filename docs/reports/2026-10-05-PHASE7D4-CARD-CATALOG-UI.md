# Phase 7D.4 — Page Carte

Livraison locale du 5 octobre 2026, version **0.7.10**. Périmètre arrêté à la page Carte et aux adaptations du socle Catalogue nécessaires. 7D.5 et 7F non commencées.

## État initial et inspection

- Branche : `dev`, worktree initial propre.
- HEAD initial et final : `b63c96685870f6863e6db488bc9426b13ffe19b5` — `v0.7.9`, conforme au repère fourni ; aucun accès distant nécessaire.
- Versions initiales : `0.7.9` dans `package.json` et les deux entrées racines du lockfile.
- Instructions du dépôt, documents produit/UX/architecture/roadmap/contrats, routes, pages Pokémon/Extension, socle partagé, préférence globale, service/décodeur Carte, identité neutre, `formatFrSource`, `CardImage`, Détail Variante et tests inspectés avant modification.
- Tests initiaux Pokémon, Extension, préférence Catalogue et service Catalogue : **4 fichiers / 111 tests réussis**.
- Contrat 7D.1 suffisant : relations, image représentative et Versions minimales déjà fournies. Tableau vide rejeté par le décodeur ; aucun état produit ajouté. Aucun blocage backend identifié.

## Livraison

`CatalogCardPage` sous la route authentifiée **`/catalog/cards/:cardId`**, ID interne MY. de `source_cards`. Lecture exclusivement par `getCatalogCard`, cache `['catalog', 'card', viewerId, cardId]`. Chargement « Chargement de la carte… », indisponibilité uniforme avec retour Dashboard, erreur technique sûre avec Réessayer ; aucun code/message Supabase exposé. Titre du document actualisé sans refocus lors de l'arrivée des données.

Fiche neutre issue de `resolveCatalogIdentity()` sans types Pokémon : un h1, image représentative **`card.imageUrl` utilisée telle quelle**, contexte `formatFrSource` + numéro/local ID, métadonnées disponibles dans un dl. Extension liée par `set.setId`, rareté, catégorie, série FR/source et date Carte française UTC ; absence omise sans valeur inventée. Pokémon nommés liés individuellement par `pokemonId`, séparateurs neutres et aucun bloc vide. Compteur directement issu de `card.variants.length`.

Image commune `CardImage`, bornée à 240 px desktop / 200 px mobile, proportions conservées. Absence/échec : `card-placeholder.webp` existant. Petit paramètre `placeholderAlt` additif pour conserver le nom de Carte dans l'alternative du fallback principal ; anciens consommateurs inchangés. Aucun choix frontend de Variante représentative ni extraction de couleur. Fiche à deux zones desktop, colonne mobile. Liens/focus du header éclaircis depuis l'accent neutre pour conserver le contraste sur le gradient.

`CatalogContent` accepte un mode Carte explicitement typé, sans données communes recopiées dans les Variantes. `CatalogToolbar` accepte une recherche optionnelle : Carte affiche **Versions** en h2 et Liste/Cartes uniquement ; Pokémon/Extension conservent recherche et effacement. `CatalogVariants` accepte le contrat minimal : miniature en Liste, image dominante en Cartes, label permanent avec « Variante indisponible », date secondaire seulement si distincte de celle de Carte. Aucun nom, numéro ou Extension répété dans les Versions ; ordre backend intact. Deux colonnes mobile, images sans filtre ni état de possession, action Collection, origine, reorder ou menu.

Une seule Version conserve section et sélecteur. `useCatalogView` inchangé : même préférence globale et sauvegarde de `lastCatalogView` uniquement. `formatCatalogDate` partage le rendu de date Extension/Carte, sans modification du contrat. Footer/Vite inchangés ; version dérivée du package, aucun `0.7.10` codé dans l'interface.

Ouverture exclusivement dans le `VariantDetailPanel` existant, inchangé : `ownerId = viewerId`, exemplaires personnels dans ce panneau, erreurs locales, dialog natif, trap, Esc et focus restauré sur l'ouvreur exact. Aucune route Variante, second Détail ou navigation précédente/suivante/swipe.

Liens désormais actifs : noms Carte depuis Pokémon/Extension → `/catalog/cards/:sourceCardId`, contexte Extension depuis Pokémon → `/catalog/extensions/:setId`, liens Pokémon existants conservés. Abréviation Extension via `formatFrSource`, nom disponible de secours si les abréviations sont absentes. Liens frères du bouton principal, aucun contrôle imbriqué ni double ouverture. Retour navigateur standard seulement. Aucun CTA Collection sur Carte ; `CatalogCollectionAction` reste limité à Pokémon/Extension.

README, Features, UX, Architecture, Roadmap et contrats alignés. Compatibilité avec les RPC et données existantes conservée. Retour arrière : restaurer les consommateurs frontend précédents, sans migration, suppression de données ou contraction de contrat.

## Validations exécutées

| Contrôle final | Résultat |
|---|---|
| `npm run test` | **PASS — 58 fichiers, 1 583 tests** |
| `npm run typecheck` | **PASS**, également exécuté dans le build final |
| `npm run lint` | **PASS**, zéro avertissement ESLint |
| `npm run build` | **PASS**, bundle principal 740,21 kB / 209,88 kB gzip |
| `git diff --check` | **PASS** |

Tests nouveaux/adaptés : frontière de route out/aal1/aal2/enrollment/email, loading, retry et erreurs sûres, titre/cache privé, fiche/métadonnées présentes ou absentes, date/numéro/FR-source, image représentative différente des images de Versions, fallback absent/échoué, liens mono/multi/aucun Pokémon, compteur singulier/pluriel, neutralité, absence recherche/CTA, préférences, deux vues, ordre backend, Version unique, label/image/date propres, absence possession/actions, Détail réel et focus/trap/Esc, navigations indépendantes entre les trois niveaux. Assertions historiques Extension précisées lorsqu'un nom de Carte et un nom de Pokémon correspondent au même texte.

Non-régression automatisée Pokémon/Extension : tous les tests restent verts, dont thèmes mono/double-type et neutre, headers/médias, recherche et conservation entre vues, CTA/détection/modal/création, préférence, Détail/exemplaires et focus. Services/décodeurs, identité, helper FR/source et contrat des préférences inchangés. Revue React effectuée : hooks hors branches conditionnelles dans les composants de contenu, identités viewer/ressource, dérivation sans état métier supplémentaire, clés backend, effets de titre sans focus, liens/boutons frères.

## Preuves locales et navigateur

Lectures Supabase **locales uniquement**, via le connecteur de maintenance qui vérifie hôte loopback, port 55322 et base locale migrée. Transactions `REPEATABLE READ READ ONLY`, annulées après export. Aucun changement de données : `get_catalog_set`, `get_catalog_pokemon`, `get_catalog_card`, `get_variant_detail`. Lectures PostgreSQL de maintenance ; aucune nouvelle preuve HTTP Auth/RLS revendiquée.

| Carte locale | ID MY. | Versions | Cas |
|---|---|---:|---|
| Pikachu | `8854` | 5 | Plusieurs Versions, Pokémon, fallback CDN |
| Bulbizarre | `8834` | 1 | Une seule Version, Pokémon |
| Cancrelove et Mouscoto GX | `7664` | 1 | Deux Pokémon, image normale chargée |
| Déplace Dégâts | `8887` | 1 | Dresseur, aucun Pokémon |
| Double Énergie Incolore | `8899` | 1 | Énergie, aucun Pokémon |

Prévisualisation ignorée `.cache/phase7d4-*` : shell/composants de production, payloads RPC réels passés dans les décodeurs existants. **Session, préférences, détection CTA et exemplaires simulés**, création bloquée ; aucune preuve de mutation personnelle authentifiée. Navigateur intégré indisponible ; vérification réalisée ensuite avec `agent-browser` dans une session Chrome isolée, fermée en fin de contrôle.

- Desktop **1440×1000**, mobile **390×844** et **320×740** : fiche, Versions Liste/Cartes, une/multiples Versions, Pokémon/multi-Pokémon/Dresseur/Énergie. Deux colonnes mesurées à **167 px** / **132 px** mobile ; grille desktop autour de **186,85 px**. `scrollWidth` égal au viewport dans les cartes contrôlées ; un h1, h2 Versions, aucune recherche locale, aucun filtre d'image.
- Image représentative normale et image de Version chargées sur Cancrelove et Mouscoto GX. Pikachu : échec des assets Légendes Brillantes, placeholder commun réellement observé, alternatif nommé. Aucun payload/URL corrigé et aucune synchronisation tentée. Image initialement absente et Versions aux images différentes couvertes par tests ; pas de donnée persistante fabriquée.
- Détail Holo Cosmos ouvert par focus + Enter, panneau mobile et exemplaires consultables simulés ; Esc ferme et restaure le focus exact sur « Voir le détail de Pikachu · Holo Cosmos ». Fermeture bouton/trap également couverts par tests.
- Carte → Extension/Pikachu/Mouscoto, Extension → Carte, Pokémon → Carte/Extension, puis retours navigateur réellement exécutés. Liens n'ouvrent aucun Détail simultané.
- Contrôle visuel Pokémon Pikachu/Dracaufeu : mono/double-type, header, recherche et Cartes. Extensions Légendes Brillantes/Alliance Infaillible : header neutre, logo/symbole selon assets disponibles, recherche par Pokémon, liens multiples et CTA Créer/Ouvrir simulés conservés.
- Console : aucune erreur JavaScript ; messages Vite/React DevTools uniquement.
- Axe **4.12.1**, WCAG 2 A/AA : **0 violation détectée** sur les fiches contrôlées, une catégorie `incomplete` de contraste due aux gradients. Vérification conservatrice au voile graphite le plus faible : texte header **6,08:1**, liens/focus header **4,85:1**, sélecteur **6,62:1**. Valeur de couleur des liens confirmée dans le navigateur après correction.

## Limites et clôture

Avertissement de bundle >500 kB préexistant conservé ; conseil Vitest sur le coût de création des environnements jsdom et notices Git LF/CRLF conservés. Échecs CDN de certains assets existants, fallback commun opérationnel. Tests DB non relancés : aucun changement SQL/RPC/RLS, seules lectures locales nécessaires à la preuve de rendu.

**Aucune migration, modification DB/RPC/RLS, synchronisation Catalogue ou écriture Supabase Cloud ; aucun commit, aucun push.** Changements finaux non indexés : 20 fichiers modifiés et 4 nouveaux fichiers (page Carte, tests Carte, helper date et ce rapport). Aucun changement utilisateur initial à préserver ; HEAD et branche inchangés.

Avant 7D.5 : aucune tâche fonctionnelle 7D.4 restante identifiée. Complément possible de preuve en session locale réellement authentifiée pour préférences/exemplaires ; état des assets CDN à revérifier lorsque disponibles. Ces limites de validation ne constituent pas un blocage backend. 7D.5 non implémentée ; navigation contextuelle reste en 7F.
