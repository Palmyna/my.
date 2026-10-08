# Phase 7 — Checkpoint documentaire transversal

Checkpoint du 6 octobre 2026, après 7D.5 / **0.7.11**. Documentation uniquement ; aucune nouvelle fonctionnalité. Les références fonctionnelles restent les documents spécialisés, ce rapport consignant l'inspection et les corrections.

## État de départ

- Branche : **dev**.
- HEAD : **af97b69d5f4c7c134fc5dc2219f43c2602b2ea75 — v0.7.11**.
- Git initial : worktree propre, `git status --short` vide ; `git status --short --branch` : `## dev...origin/dev`.
- Versions confirmées : `package.json`, racine du lockfile et package racine du lockfile à **0.7.11**.
- Inventaire : **26 fichiers de migration**, dont trois Phase 7 ; **21 fichiers pgTAP**. L'inventaire des fichiers ne constitue pas une nouvelle lecture de l'historique DB.

## Inspection

`AGENTS.md`, packages, état Git et historique récent Phase 7 inspectés avant correction. Références lues : [README](../../README.md), [Vision](../00-VISION.md), [Fonctionnalités](../01-FEATURES.md), [TCGdex](../02-TCGDEX.md), [Modèle](../03-DATA-MODEL.md), [UX/UI](../04-UX-UI.md), [Architecture](../05-ARCHITECTURE.md), [Database](../06-DATABASE.md), [Pipeline](../07-CATALOG-SYNC.md), [Roadmap](../08-ROADMAP.md), [Contrats Catalogue](../09-CATALOG-CONTRACTS.md).

Les six rapports Phase 7 présents ont été lus : [7A.3](2026-10-01-PHASE7A3-VIEW-PREFERENCES.md), [7D.1](2026-10-04-PHASE7D1-CATALOG-FOUNDATION.md), [7D.2](2026-10-05-PHASE7D2-POKEMON-CATALOG-UI.md), [7D.3](2026-10-05-PHASE7D3-SET-CATALOG-UI.md), [7D.4](2026-10-05-PHASE7D4-CARD-CATALOG-UI.md), [7D.5](2026-10-05-PHASE7D5-COLOR-IDENTITY.md). Le [checkpoint Phase 6](2026-09-30-PHASE6-CLOSURE.md) conserve les preuves Cloud fournies par le propriétaire.

Les trois migrations Phase 7 ont été inspectées comme fichiers, sans exécution. Vérifications ciblées en lecture seule des routes, contrats/services Catalogue et Collections, préférences, recherche locale et résolveurs d'identité pour distinguer état livré et ancien cadrage.

## Incohérences trouvées et corrections

| Référence modifiée | Correction |
|---|---|
| README | Version courante 0.7.10 remplacée par 0.7.11 ; convention complète 7A–7D.5 ; route Carte livrée ; identité Extension/Carte teal ; migrations 26 Local / dernier Cloud confirmé 23 ; inventaire pgTAP 19 remplacé par 21. |
| Vision / TCGdex | Formats Classeur encore envisagés et hiérarchie évoquant des regroupements remplacés par la V1 continue livrée, sans mode par bloc/ère. |
| Fonctionnalités | État Phase 6 historique séparé de l'état après 7D.5 ; Catalogue et CTA automatique livrés ; recherche et navigation contextuelle restantes. |
| Modèle / Database / Pipeline | Ancien regroupement par Cartes, ordre Pokémon par date de Carte et compteur principal `card_count` remplacés par les entrées Variante, compteurs versions et ordre canonique backend livrés. |
| UX/UI | Anciens accents déterministes, reorder encore ouvert, composition Liste/Cartes encore ouverte et ambiguïté sur les deux préférences corrigés ; trois réglages Affichage confirmés ; recherche du header encore non fonctionnelle. |
| Architecture | Route Carte encore future, illustration spéciale Pokémon/Extension et CTA encore futurs corrigés ; Détail existant partagé ; consommateurs des préférences Catalogue complets ; adaptation BIGINT exacte du service actuel documentée. |
| Database | Intro arrêtée à 24/24 ; migration 7D.5 classée à tort en Phase 5 ; Catalogue encore futur ; anciens grants privés distingués des grants ciblés 7D.1 ; client/mapping manuel livré et placeholder WebP actuel précisés. |
| Pipeline / Roadmap | Pages et préférences encore futures corrigées ; historique Local/Cloud conservé comme historique ; partage dans la recherche Phase 7 dissocié du parcours de partage Phase 9. |

La règle de recherche des collections a été alignée dans Fonctionnalités, Modèle, UX/UI, Architecture, Database et Roadmap, ainsi que dans le README. Les [contrats Catalogue](../09-CATALOG-CONTRACTS.md), déjà cohérents, restent inchangés.

## Historique conservé

Aucun ancien rapport modifié. Les identités neutres décrites aux livraisons 7D.3/7D.4, anciens compteurs de migrations, versions et preuves de validation restent des constats datés. L'ancien cadrage Catalogue est corrigé uniquement là où il se présentait encore comme courant ; aucune décision pré-Phase-7 remplacée n'a été restaurée.

La [convention Phase 7](../../README.md#état-du-projet) retient 7A.1 → 0.7.1, 7A.2 → cadrage sans version, 7A.3 → 0.7.2, puis 7B.1 à 7D.5 → 0.7.3 à 0.7.11. L'inspection Git révèle toutefois `0.7.0` dans les packages des commits initiaux 7A.1 (`644e488`), 7A.3 (`12f372e`), 7B.1 (`c2443aa`) et 7B.2 (`8fe2ca4`). Cette différence historique est explicitée dans le README, sans réécriture des commits ni du rapport 7A.3, et sans inventer de livraison 7A.2.

## Décision verrouillée avant 7E

**La recherche globale Phase 7 doit pouvoir retourner toutes les collections actuellement accessibles au viewer : personnelles ou reçues en partage.** Les droits actuels restent la frontière de visibilité. La Phase 9 porte le parcours utilisateur de création, gestion et retrait des partages ; elle n'est pas nécessaire pour lire ou rechercher un accès déjà actif. Aucun moteur, requête, projection SQL ou nouveau contrat d'implémentation ajouté pendant ce checkpoint.

## État migrations documenté

| Migration Phase 7 | État attesté par les rapports datés |
|---|---|
| [20261001132144_phase7a3_view_preferences.sql](../../supabase/migrations/20261001132144_phase7a3_view_preferences.sql) | Local uniquement ; historique 24/24 en 7A.3. |
| [20261004161759_phase7d1_catalog_foundation.sql](../../supabase/migrations/20261004161759_phase7d1_catalog_foundation.sql) | Local uniquement ; historique 25/25 en 7D.1. |
| [20261005181925_phase7d5_collection_identity.sql](../../supabase/migrations/20261005181925_phase7d5_collection_identity.sql) | Évolution Phase 7D.5 du contrat Dashboard/Collection ; Local uniquement, historique 26/26. |

État retenu : **26 Local / 23 Cloud au dernier checkpoint confirmé par le propriétaire**, jusqu'à `20260928083830` pour le Cloud. Les trois migrations Phase 7 sont documentées comme non déployées Cloud. Aucun accès DB local ou Cloud, aucune commande de migration ni synchronisation pendant ce checkpoint ; aucun état distant vérifié en direct.

## Périmètre final et suite

Les acquis 7A–7D.5 restent ceux des références : trois vues Collection, Classeur continu `2x2`/`3x3`/`4x3`, défaut `3x3` et pagination frontend ; préférences du viewer et héritage dynamique ; trois réglages Affichage ; trois routes Catalogue et socle Variante ; identité Partagée indigo prioritaire → Personnalisée rouge MY. → Extension teal → Pokémon par types → fallback neutre. Aucun hash d'attribution, portrait Carte Pokémon ni couleur métier stockée.

Restent à développer en Phase 7 : recherche globale du header (7E), puis navigation contextuelle, Retour/Précédente/Suivante et comportement mobile associé selon le cadrage actuel. Architecture détaillée de recherche et finitions des interactions restent à traiter dans leurs étapes autorisées. Phases 8 et 9 non commencées par ce checkpoint. Aucun point documentaire bloquant identifié avant 7E ; aucun fichier hors documentation nécessitant une modification identifié.

Seuls README et les références `docs/00` à `docs/08` sont corrigés, avec ce nouveau rapport. Aucun code applicatif, SQL, migration, test DB, script, donnée, dépendance ou package modifié ; version maintenue à **0.7.11**. Aucun redesign, commit ou push.

## Validation documentaire

- Diffs complets relus, avec contrôle des acquis 7A–7D.5 et distinction entre état courant, historique et reste à développer.
- Liens Markdown locaux des onze documents modifiés/créés vérifiés : **281 destinations et 60 ancres**, dont **34 destinations nouvelles**, aucune cible ni ancre manquante détectée. Aucun sondage réseau des liens externes.
- `git diff --check` : **PASS** ; whitespace du nouveau rapport non suivi contrôlé séparément.
- Versions package/lockfile : **0.7.11** ; aucun diff package ou fichier applicatif/SQL. Anciens rapports et contrats Catalogue inchangés.
- Git final : **10 documents modifiés non indexés**, plus ce rapport **non suivi** ; branche et HEAD inchangés. Aucune suite DB/frontend, build ou lint applicatif relancé pour cette modification strictement documentaire.
