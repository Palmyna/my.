# Micro-correction après 7F — retrait des badges d'origine en Liste

Date : **7 octobre 2026**. Version : **0.7.19 → 0.7.20**.

## État initial et périmètre

Branche **dev**, HEAD initial **9e5aae84090c3ad01a45246856cedb596eb29d95**, dépôt propre. `package.json`, version du lock et racine du lock étaient tous en **0.7.19**. Inspection des consommateurs, styles, tests Collection et documents mentionnant les badges avant modification.

La Liste n'affiche plus `Auto` / `Perso`, sans badge, icône, couleur ou autre remplacement. `item.origin` reste une donnée métier : le menu de retrait reste réservé aux items manuels du propriétaire. Aucun changement de types, services, contrats 7F.1, DB ou logique de retrait.

## Modifications

- [`CollectionContentRow.tsx`](../../src/features/collections/CollectionContentRow.tsx) : suppression de la transmission visuelle d'origine et de la prop `automatic`, utilisée uniquement pour le badge ; garde `!readOnly && item.origin === 'manual' && onRemove` conservée.
- [`CompactVariantSummary.tsx`](../../src/features/collections/CompactVariantSummary.tsx) : suppression de la prop `origin` et du markup `.collection-content-origin`, y compris son texte accessible. Le type `CollectionContentItem` reste utilisé pour les IDs des liens.
- [`CollectionContentView.tsx`](../../src/features/collections/CollectionContentView.tsx) : suppression du seul passage de la prop `automatic` devenue inutile.
- [`collection-content.css`](../../src/features/collections/collection-content.css) : suppression des deux règles du badge, générale et mobile. Aucun autre style modifié.
- [`ManualCollectionItems.test.tsx`](../../src/features/collections/ManualCollectionItems.test.tsx) et [`CollectionContentList.test.tsx`](../../src/features/collections/CollectionContentList.test.tsx) : adaptation des tests existants propriétaire/partage ; absence des badges, retrait manuel disponible, absence de menu automatique, liens et Détail conservés.
- `package.json` et `package-lock.json` : uniquement les trois champs de version. Comparaison JSON avec HEAD : aucune dépendance ni autre valeur modifiée.
- Documentation ciblée : Features, UX/UI, Database et annotation datée du rapport 7F.2. Les preuves historiques restent attribuées à leur livraison ; l'origine métier reste explicitement distincte de son affichage.

Liens Carte/Extension, surface Détail, Exemplaires, menu, reorder, Cartes, Classeur, partage, hover, densité et responsive conservés. Retour arrière : restauration du diff frontend/documentation/version, sans migration ni modification de données. Ancien et nouveau frontend consomment le même contrat.

## Validation

| Contrôle | Résultat |
| --- | --- |
| Tests ciblés des deux fichiers Collection | **87 tests passés**, 2 fichiers |
| `npm test` | **1 840 tests passés**, 62 fichiers |
| `npm run build` | Réussi, TypeScript et Vite ; build final en **0.7.20** |
| `npm run lint` | Réussi, zéro warning ESLint |
| `git diff --check` | Réussi ; rapport non suivi contrôlé séparément |
| Périmètre métier protégé | Aucun diff dans `src/types`, `src/services`, `supabase`, le hook de retrait ou le menu |

Avertissement Vite conservé : chunk principal supérieur à 500 kB après minification ; build réussi. Aucun travail de découpage ajouté à cette correction.

Preuve visuelle dans Chrome connecté, sur une **fixture frontend temporaire des vrais composants `CollectionPage` / `CollectionContentView`**, avec cache et état Auth simulés : un item automatique Pikachu et un item manuel Évoli. Aucune session Auth réelle, aucun appel DB ni preuve backend authentifiée revendiqués.

Liste propriétaire inspectée à **1920, 390 et 320 px** : aucun badge, aucun débordement horizontal, liens et disposition cohérents. Exemplaires et menu restent à **44 × 44 px** à 390 px. Seul Évoli propose `Retirer de la collection` ; confirmation ouverte puis annulée. Pikachu ouvre le Détail Variante avec ses liens et exemplaires. Liste partagée inspectée à **390 px** : aucun badge, poignée, ajout ou retrait ; liens et consultation des exemplaires conservés. Détail Évoli ouvert en lecture seule puis fermé.

Les deux fichiers de fixture ont été supprimés, le viewport restauré, l'onglet de test fermé et le serveur Vite lancé pour la validation arrêté. Capture propriétaire conservée localement dans `.cache/2026-10-07-list-origin-owner.png`, hors suivi Git.

## DB et Git

Aucun SQL, migration, RPC, reset, accès DB ou Cloud. **29 migrations versionnées** inchangées. État de référence conservé : **29 Local appliquées selon le rapport 7F.2 / 23 Cloud au dernier checkpoint confirmé par le propriétaire** ; aucun nouveau contrôle de l'historique DB pendant cette correction.

Git final : **dev**, HEAD initial inchangé, **12 fichiers modifiés et ce rapport nouveau non suivi**, aucun fichier staged. Aucun commit ni push.
