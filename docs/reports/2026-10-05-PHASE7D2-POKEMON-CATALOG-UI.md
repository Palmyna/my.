# Phase 7D.2 — Page Pokémon et socle UI Catalogue

Livraison locale du 5 octobre 2026, version **0.7.8**. Périmètre arrêté à Pokémon ; aucune page Extension/Carte, route Variante, recherche globale ou navigation contextuelle 7F.

## Dépôt et inspection

- Branche initiale/finale : `dev`.
- HEAD initial/final : `05b81e604df13c82970352bf83f0dd11a43578be` — `v0.7.7`.
- Worktree initial propre ; changements finaux non indexés, aucun commit/push.
- Package/lockfile `0.7.7` → `0.7.8` ; injection Vite/footer conservée, aucune version codée dans l'interface.
- Instructions, routage Auth, contrats/types/RPC/services/palette 7D.1, préférences 7A.3/7B/7C, filtres, création/validation, caches Dashboard et focus des dialogues inspectés avant modifications.
- L'ancien cadrage documentaire Pokémon parlait de Cartes distinctes et d'une carte illustrative. Aligné sur la demande 7D.2 : Variantes canoniques, compteur versions, aucun artwork.

## Livraison

Route authentifiée `/catalog/pokemon/:pokemonId`, ID MY. décimal exact. `getCatalogPokemon` seul lecteur Catalogue ; query `['catalog', 'pokemon', viewerId, pokemonId]`. Chargement, indisponibilité uniforme avec retour Dashboard, erreur technique avec retry ; titre de document après lecture, sans vol de focus.

`src/features/catalog/` : `CatalogPokemonPage`, `CatalogToolbar`, `CatalogVariants`, `useCatalogView`, `filterCatalogVariants`, `PokemonCollectionAction`, `CreatePokemonCollectionDialog`, clés de query et tests. Deux vues sur le même tableau chargé/filtré, même ordre RPC, aucun tri ou modèle d'ordre supplémentaire. Bouton d'ouverture frère des zones de contenu, permettant de futurs liens Carte/Extension indépendants ; aucun lien mort livré.

Header : Pokédex quatre chiffres minimum, nom FR, types FR, singulier/pluriel et CTA. Identité issue exclusivement de `resolveCatalogIdentity` : mono-type clair/sombre principal ; double-type clair principal/sombre secondaire. Principal dominant sur CTA/sélection/focus ; secondaire perceptible en gradient/badge. Voile graphite commun et aucun artwork Pokémon/PokéAPI dans le navigateur.

Recherche `type=search`, label contextuel, autocomplete off, effacement et focus. Normaliseur extrait dans `src/lib/local-search.ts`, repris par Collection sans changement de champs ni d'ordre. AND, casse/accents/ligatures/espaces ; champs Carte, Extension FR/source, abréviations FR/source, local ID, Variante. Aucun appel Supabase pendant la frappe ; recherche conservée entre Liste/Cartes.

Rendu Catalogue neutre : `CardImage`/placeholder et `formatFrSource` existants, Variante toujours visible. Pas de possession/grayscale/progression/exemplaires/origine/reorder/poignée/menu/overlay Collection. Grille automatique desktop proche de 180 px, deux colonnes mobile.

`usePreferredView` extrait de la mécanique existante pour les deux consommateurs `useCollectionView` et `useCatalogView`. Cache privé partagé, défaut résolu une fois par ouverture, Liste de secours, choix immédiat, sérialisation par viewer/domaine, rollback et réconciliation, abandon des réponses tardives. Catalogue écrit uniquement `lastCatalogView`, fusionné par champ confirmé ; aucune modification du défaut global. Régressions Collection couvertes. Une ouverture en erreur fige également son fallback, pour éviter qu'une modification ultérieure de Paramètres remplace la vue courante.

`VariantDetailPanel` inchangé : owner = viewer connecté, gestion de ses exemplaires dans le Détail, Catalogue sous-jacent neutre. Dialog natif, trap, focus initial, Esc/bouton, restauration exacte ; indisponibilité du Détail locale, sans démontage de Pokémon.

Lecture Collections ajoutée : `findOwnedAutomaticCollection(viewerId, targetType, targetId)` sélectionne seulement `id` sur `collections`, avec propriétaire courant + automatic + type et ID exacts, sous RLS existante. Partages exclus, état de chargement/erreur explicite et retry. CTA Créer/Ouvrir, navigation directe vers Collection.

Modal contextuelle : nom libre vide, validation Unicode existante, sans sélecteur ou nom généré. Uniquement `createAutomatic` existant ; adaptation BIGINT string additive, anciens nombres compatibles, types générés inchangés. `created=true` et `created=false` ouvrent l'ID PostgreSQL, sans renommage/recréation. Double soumission bloquée. Cache CTA confirmé/invalidation et Dashboard exact du viewer invalidé ; navigation n'attend pas le Dashboard. Erreurs utilisateur naturelles, aucune donnée SQL brute.

README, fonctionnalités, UX, architecture, roadmap globale et contrats Catalogue alignés. Aucun découpage opérationnel ajouté à la roadmap.

## Validations

| Contrôle exécuté | Résultat |
|---|---|
| Suite ciblée initiale | PASS — 5 fichiers, 83 tests |
| Suite élargie route/services/préférences | PASS — 6 fichiers, 262 tests |
| `npm test -- --maxWorkers=4` | PASS — 56 fichiers, 1 509 tests avant ajout du dernier test de double soumission |
| Dernière suite page Pokémon | PASS — 23 tests, dont double soumission, trap Détail et focus d'erreur de nom |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS ; avertissement bundle principal 732,08 kB, 208,71 kB gzip |
| `git diff --check` | PASS |

Couverture : frontière Auth (déconnecté/aal1/aal2), lectures/états/retry, thèmes/compteurs, defaults/last-used/fallback, changements explicites et focus, mutations sérialisées/erreurs/sessions/réponses tardives, filtre/ordre/clear/vues neutres, Détail existant, CTA personnel/partages, création vraie ou concurrente, invalidations exactes, messages sûrs et contrôles clavier.

Les tests frontend utilisent les services mockés. Aucun test DB/migration/synchronisation requis pour cette évolution frontend ; aucune preuve de création HTTP/TOTP authentifiée nouvelle n'est revendiquée.

## Vérification visuelle réelle

Export **en lecture seule**, transaction repeatable read annulée, de `get_catalog_pokemon` et `get_variant_detail` sur Supabase local. Pokémon résolus par leur nom en base, jamais par ID supposé :

- Pikachu : ID MY. lu `25`, Électrik, 254 versions.
- Dracaufeu : ID MY. lu `6`, Feu/Vol, 122 versions.

Prévisualisation ignorée par Git sous `.cache/phase7d2-*`, composants de production et shell réels, payloads RPC réels passés dans les décodeurs existants. Session, préférences et détection CTA simulées ; écriture automatique interdite dans la prévisualisation. Cette preuve navigateur couvre le rendu et les interactions, **pas** un parcours Auth/backend de bout en bout.

Captures des deux Pokémon : desktop **1440×1000**, mobile **390×844**, Liste et Cartes ; recherche locale, création et Détail native mobile/desktop. Contrôle supplémentaire Dracaufeu **320×740**. Mesures : 7 colonnes desktop ≈186,85 px, 2 colonnes mobile 167 px, 2 colonnes à 320 px de 132 px. ScrollWidth identique au viewport dans les trois largeurs. Images en couleur, `filter: none`.

Recherche réelle `DRACAUFEU base 4` : 6 résultats ; absence puis clear restaure les 122 résultats et le focus input. Fermeture Détail restaure le bouton exact identifié par son libellé. Modal à nom vide et focus initial ; Esc, annulation, trap et sélection de vue couverts. Aucun artwork dans le header.

Console : aucun page error ni erreur significative ; uniquement Vite et conseil React DevTools. Audit axe 4.12.1 sur la page : **0 violation**, une catégorie `incomplete` de contraste due aux gradients et surfaces d'interaction superposées. Contrôle conservatif de toutes les palettes, sous le voile le plus faible : texte header ≥**4,80:1**, CTA ≥**5,98:1**, accent du sélecteur ≥**5,13:1**, texte secondaire graphite **8,42:1**. Contrôles visuels complémentaires réalisés ; l'audit automatique seul ne couvre pas tous les scénarios d'accessibilité.

Preuves ignorées : export réel JSON, captures `phase7d2-{pikachu,dracaufeu}-*`, mesure de contraste JSON et scripts de prévisualisation. Aucun artefact de fixture ajouté au produit.

## Limites et suite

**Aucune migration, modification SQL/RLS, synchronisation Supabase, opération Supabase Cloud, aucun commit, aucun push.** Seule lecture DB locale pour les payloads visuels. Aucun blocage backend découvert. Avertissement de bundle préexistant conservé ; optimisation hors 7D.2.

Avant 7D.3 : consommer le contrat Extension existant, adapter son contexte au socle livré et ajouter ses liens uniquement lorsque la route existe. Carte et navigation contextuelle restent 7D.4/7F. Le parcours de création authentifié HTTP/TOTP peut être vérifié séparément avec une session locale disponible ; aucun test unitaire ou preview n'est présenté comme cette preuve.

Retour arrière : retirer la route et le consommateur Catalogue, conserver contrats et données. Aucun changement destructif ou contraction de schéma prévu.
