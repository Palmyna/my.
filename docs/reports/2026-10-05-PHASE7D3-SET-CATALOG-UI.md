# Phase 7D.3 — Page Extension

Livraison locale du 5 octobre 2026, version **0.7.9**. Périmètre arrêté à Extension et aux factorisations Catalogue nécessaires ; 7D.4 et 7F non commencées.

## État et inspection

- Branche initiale/finale : `dev`.
- HEAD initial/final : `3d4c8ffd5d7cedfa40ef43f82564b20078c60fc2` — `v0.7.8`.
- Worktree initial propre ; changements finaux non indexés, aucun commit/push.
- `package.json` et les deux versions racines du lockfile : `0.7.8` → `0.7.9`. Footer/Vite inchangés, version toujours dérivée.
- Instructions, docs produit/UX/architecture/contrats, route Pokémon, composants Catalogue 7D.2, préférences, services Collections, validation de nom, caches et tests existants inspectés avant édition.
- Aucun blocage DB/RPC. Ancien cadrage Extension (carte illustrative/cartes distinctes) aligné sur la demande 7D.3 : médias du contrat et entrées par Variante.

## Livraison

`CatalogSetPage` sous la route authentifiée `/catalog/extensions/:setId`, avec ID interne MY. et `getCatalogSet` uniquement. Cache `['catalog', 'set', viewerId, setId]` ; chargement discret, indisponibilité uniforme avec retour Dashboard, erreur technique sûre avec retry et titre du document sans refocus.

Header neutre `resolveCatalogIdentity()` : nom français principal, source distincte, abréviation exclusivement `formatFrSource`, série FR/source disponible, date française UTC si présente et compteur singulier/pluriel des versions. Logo borné responsive et symbole secondaire, `object-fit: contain`, uniquement depuis les URLs existantes. Images décoratives puisque l'identité est nommée ; médias absents/échoués retirés sans asset inventé. Aucun prélèvement de couleur du logo. Texte secondaire plus petit, avec contraste conservé sur tout le gradient.

`CatalogContent` mutualise thème, query de recherche locale, toolbar, rendu et ouverture du Détail ; `CatalogVariants` accepte aussi les variantes Extension et leur contexte d'abréviation. `CatalogToolbar`, `useCatalogView`, `CardImage`, placeholder, normalisation et `formatFrSource` conservés. Aucun système parallèle de préférence, requête, possession ou Détail.

Filtre Extension : nom Carte, local ID/numéro, Variante et noms des Pokémon rattachés, AND avec casse/accents/espaces normalisés. Nom/abréviation Extension et série exclus ; aucune requête pendant la frappe, aucun tri. Query conservé Liste/Cartes et état vide commun. Liste : nom/contexte puis Variante ; Cartes : image dominante, contexte compact et Variante permanente, deux colonnes mobile. Aucune possession, atténuation, grayscale, exemplaire, reorder ou action Collection dans les entrées.

Pokémon associés : vrais `Link` indépendants vers leurs IDs internes `/catalog/pokemon/:pokemonId`, groupe ARIA nommé, liens texte neutres avec retour à la ligne. Aucun groupe sur les cartes sans rattachement. Liens et bouton principal sont frères ; un clic Pokémon n'ouvre pas le Détail. Le `VariantDetailPanel` reste inchangé : `ownerId = viewerId`, exemplaires personnels confinés au Détail, dialog natif, focus/trap/Esc/restauration exacts, erreurs locales et comportement mobile. Aucun précédent/suivant, swipe ou contexte ordonné.

`CatalogCollectionAction` et `CreateCatalogCollectionDialog` remplacent `PokemonCollectionAction` et `CreatePokemonCollectionDialog`. Cible `pokemon | set`, ID et nom ; UX Pokémon conservée. Extension appelle `findOwnedAutomaticCollection(viewerId, 'set', setId)` puis `createAutomatic({ name, targetType: 'set', targetId: setId })`. Propriétaire explicite et partages exclus ; pas de CTA supposé pendant lecture/erreur. Modal unique à nom libre vide, validation existante, sans sélecteur supplémentaire. `created=true/false` ouvrent immédiatement l'ID autoritatif retourné, sans renommage/recréation/items modifiés. Cache CTA confirmé puis invalidé et Dashboard exact du viewer invalidé, sans attendre sa relecture. Microcopy Extension sûre ; erreurs de nom sur le champ.

Docs Features, UX, Architecture, Roadmap, contrats et README actualisés. Frontend compatible avec les contrats SQL existants ; retour arrière par restauration des consommateurs précédents, sans suppression de données.

## Validations exécutées

| Contrôle | Résultat |
|---|---|
| Suite complète après correction ARIA | PASS — 57 fichiers, 1 549 tests |
| Dernière suite Extension/Pokémon après finition CSS | PASS — 54 tests : 31 Extension + 23 Pokémon existants inchangés |
| `npm run typecheck` | PASS, également exécuté dans le build final |
| `npm run lint` | PASS |
| `npm run build` | PASS ; bundle principal 735,94 kB / 209,27 kB gzip |
| `git diff --check` | PASS |

Tests : frontière Auth de la nouvelle route, états/retry, métadonnées/date/abréviations/compteurs, médias présents/absents/échoués, thème neutre, préférences, filtre/ordre/vues, liens uniques/multiples/absents et navigation sans Détail, focus natif, CTA set, exclusion des partages au service, validation/modal, créations vraie/concurrente, caches exacts et erreurs utilisateur. Tests Pokémon existants restent verts, dont thèmes mono/double, recherche, vues, préférences, exemplaires dans le Détail, CTA/modal, deux résultats de création, double soumission et focus.

Tests frontend avec services mockés ; aucune nouvelle preuve de création HTTP/TOTP authentifiée n'est revendiquée.

## Vérification navigateur et limites

Export en **lecture seule** sur Supabase local, transaction repeatable read annulée : `get_catalog_set`, `get_catalog_pokemon` et `get_variant_detail`. IDs résolus depuis la base, sans IDs métier supposés.

- Légendes Brillantes : ID MY. `102`, 82 versions, logo et symbole renseignés.
- Alliance Infaillible : ID MY. `96`, 235 versions, 22 variantes multi-Pokémon, logo et symbole renseignés.
- Aucun set à média partiel/absent trouvé dans le snapshot local. Cas absent/partiel couverts par tests unitaires ; aucune fixture visuelle permanente ajoutée.

Prévisualisation ignorée `.cache/phase7d3-*` : shell et composants de production, payloads RPC réels décodés par les services existants. Session, préférences, détection CTA et destination Collection simulées ; création explicitement bloquée. Cette preuve couvre rendu/interactions, pas Auth/RLS ou création réelle. Aucune donnée personnelle écrite.

Desktop **1440×1000**, mobile **390×844** et **320×740** : Liste/Cartes, logos, recherche `PIKACHU reverse`, liens vers Pikachu/Cancrelove par IDs, retour navigateur, liens multiples Mouscoto/Cancrelove, Dresseur `Déplace Dégâts` et `Double Énergie Incolore` sans zone Pokémon, Détail natif et modal à nom vide, CTA Créer/Ouvrir simulés. Détail fermé par Esc : bouton exact restauré. Deux colonnes mobile (167 px à 390, 132 px à 320), sept desktop (≈186,85 px), scrollWidth égal au viewport ; liens mobiles de 44 px, mêmes couleurs neutres, images sans filtre. Pikachu Électrik et Dracaufeu Feu/Vol contrôlés après factorisation.

Certains assets CDN, dont les symboles des deux Extensions et les images de Légendes Brillantes, échouent dans cette consultation : suppression des symboles et placeholder Carte commun observés. Logos et cartes d'Alliance Infaillible chargés ; aucune correction de payload/URL ou synchronisation tentée. Console : aucune erreur JavaScript, uniquement Vite et conseil React DevTools.

Audit axe 4.12.1 final : **0 violation**, une catégorie `incomplete` de contraste liée aux gradients et à la surface principale superposée. Groupe de liens corrigé avec `role=group`. Contrôle conservatif neutre sous le voile graphite le plus faible : texte header ≥**6,08:1**, liens/CTA **7,71:1**, sélecteur **6,62:1**. Métadonnées utilisent le texte principal pour respecter cette borne ; hiérarchie conservée par taille/poids.

## Clôture et suite

**Aucune migration, modification DB/RPC/RLS, synchronisation ou écriture Supabase Cloud ; aucun commit, aucun push.** Seule lecture DB locale pour le rendu. Avertissement de bundle >500 kB préexistant conservé ; optimisation hors périmètre. État final : modifications/ajouts non indexés, deux anciens composants remplacés par leurs versions génériques.

7D.4 non entamée : page Carte reste à livrer sur son contrat existant. Parcours Auth local HTTP/TOTP de création réelle reste à vérifier avec une session disponible ; limitation de preuve, aucun blocage backend détecté. Navigation contextuelle réservée à 7F.
