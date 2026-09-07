# Phase 2 — Complément noms français Pokémon

Vérification locale du 7 septembre 2026, depuis le commit MY. `d1356931f24ca0c687db7da5bcb6c284ca0c8fc3`. Ce rapport complète le [rapport initial du 6 septembre](2026-09-06-PHASE2.md), dont les mesures historiques restent inchangées.

**Résultat : 1 025 noms français renseignés, zéro nom manquant, aucune modification structurelle et seconde application sans changement fonctionnel.** Aucun reset, commit, déploiement ou accès en écriture au cloud.

## Référentiel et maintenance

Commande finale :

```sh
npm run pokemon:update
```

Le générateur manuel utilise exclusivement les endpoints officiels PokéAPI `pokemon-species/` et `pokemon-species/{id}/`, selon la [documentation v2](https://pokeapi.co/docs/v2#pokemon-species). Il récupère l'ID d'espèce et l'entrée de nom dont la langue est exactement `fr`. Aucune ressource `pokemon`/`pokemon-form`, autre API, recherche textuelle de carte ou fallback anglais n'est utilisé.

La pagination réelle a fourni **1 025 espèces**, **1 025 avec nom français**, **0 sans nom français**, du numéro **1** au numéro **1 025**. Aucun total de 1 025 n'est présupposé par le générateur. Aucune anomalie PokéAPI n'a été rencontrée.

Le fichier [`pokemon-fr.json`](../../data/pokemon/pokemon-fr.json) contient le mapping complet sous forme d'objet JSON plat : `{"1":"Bulbizarre", ...}`. Les clés sont les numéros nationaux sous forme de chaînes décimales canoniques, triées numériquement ; les valeurs sont les noms exacts. UTF-8, indentation de deux espaces, LF final, sans timestamp ni payload brut. Unicode, ponctuation, accents et espaces internes sont conservés sans normalisation.

Validation Zod des numéros positifs compatibles SQL, noms non vides et forme stricte ; contrôle supplémentaire des clés dupliquées, y compris échappées. Les réponses API sont contrôlées pour la cohérence du total, les doublons, la correspondance des IDs et l'unicité du nom français. Un échec HTTP, JSON, de validation ou un nom FR absent empêche la publication et préserve l'ancien fichier. La publication utilise un fichier temporaire voisin, une synchronisation disque et un renommage atomique après validation complète.

Node 24 utilise son `fetch` natif, sans nouvelle dépendance. Pages séquentielles de 200 demandées, six requêtes d'espèces simultanées maximum, timeout de 15 s par tentative. Au plus trois tentatives pour réseau/timeouts, HTTP 408/429/5xx ; attentes de 500 puis 1 000 ms, prolongées si nécessaire par `Retry-After` plafonné à 30 s. Les redirections et liens hors endpoints sont refusés. Les tests simulent les erreurs et la génération répétée, avec égalité des octets à données identiques.

Empreinte SHA-256 du mapping canonique validé :

```text
753e1abca4935bdd6ea4d2c3757b23ae518778678466eb94af8a730f3df393f5
```

Cette empreinte ignore uniquement la mise en page JSON. La [procédure de maintenance](../../data/pokemon/README.md) précise le format, les erreurs et la canonisation.

## Intégration

La CLI valide et charge une fois le fichier local avant l'accès DB. Le plan reçoit explicitement ce référentiel et affecte le nom par `dex_number`, en conservant l'ID existant. Le fichier fait autorité sur tout nom DB précédent, également pour un Pokémon historique devenu inactif. Un dex absent reste conservé avec `name_fr=NULL`, diagnostic `pokemon-name-missing` et compteur `catalogue.pokemon_without_name` visible en console.

Le générateur réseau est indépendant et n'est jamais importé par la synchronisation. Aucun appel PokéAPI n'est effectué par `catalog:sync`, `catalog:validate` ou React. Le déterminisme dépend du SHA TCGdex, du contenu du référentiel, des overrides, du code et de l'état initial des IDs. L'empreinte figure dans le rapport JSON local et dans `private.catalog_sync_runs.report.pokemon_reference` lors des applications réussies. Aucune migration ou colonne SQL supplémentaire.

## Dry-run et deux applications réelles

Supabase local a redémarré depuis son volume existant, sans `db:reset`. Les trois runs utilisent le même SHA TCGdex complet :

```text
1c30c50253756bafecf0f065fc377f77016ad12f
```

Les overrides restent vides et inchangés, empreinte `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.

```sh
npm run catalog:sync -- --snapshot 1c30c50253756bafecf0f065fc377f77016ad12f --dry-run
npm run catalog:sync -- --snapshot 1c30c50253756bafecf0f065fc377f77016ad12f --apply
npm run catalog:sync -- --snapshot 1c30c50253756bafecf0f065fc377f77016ad12f --apply
```

| Mesure | Avant | Après dry-run | Après premier apply | Après second apply |
|---|---:|---:|---:|---:|
| Pokémon | 1 025 | 1 025 | 1 025 | 1 025 |
| Noms NULL en DB | 1 025 | 1 025 | 0 | 0 |
| États de cible | 1 213 | 1 213 | 1 213 | 1 213 |
| Runs privés cumulés | 2 | 2 | 3 | 4 |

Le dry-run prévoit exactement 1 025 modifications de Pokémon et zéro création, désactivation ou modification d'une autre entité. La comparaison DB après dry-run est intégralement identique à l'état initial, journal et séquences inclus.

Le premier apply réalise les 1 025 modifications prévues, avec le timestamp de mise à jour des Pokémon. Le second est un **noop fonctionnel** : aucune ligne catalogue ni aucun timestamp fonctionnel ne change ; seul un run technique est ajouté. Les deux applies réussis enregistrent l'empreinte du référentiel.

Supabase local a ensuite été arrêté normalement avec sauvegarde du volume (`backup=true`) ; le catalogue enrichi est conservé pour le prochain démarrage.

| Données conservées | Nombre | Vérification |
|---|---:|---|
| IDs Pokémon par numéro national | 1 025 | Identiques avant et après |
| Séries / sets | 18 / 188 | Lignes complètes et timestamps identiques |
| Cartes sources | 19 907 | Lignes complètes, IDs et timestamps identiques |
| Variantes | 31 900 | Lignes complètes, IDs et timestamps identiques |
| Rattachements carte–Pokémon | 16 820 | Identiques |
| États Pokémon / Set | 1 025 / 188 | IDs, hashes, versions et timestamps identiques |
| Versions de génération | 1 pour chaque cible | Aucune incrémentation |
| Listes ordonnées des variantes par cible | 1 213 | Identiques dans les trois rapports |

Les séquences restent inchangées : prochains IDs Pokémon 1 026, séries 19, sets 189, cartes 19 908, variantes 31 901 et états 1 214. Les données utilisateur sont toujours vides : zéro compte Auth, profil, collection, élément, exemplaire et partage. Aucun override ni alias n'est ajouté.

Empreintes comparées avant/après sur les valeurs canoniques complètes :

| Objet | SHA-256 identique |
|---|---|
| Couples dex / ID Pokémon | `9e0d91f2aa5e767e2030ec246902d639b0a0b451e00940f46c3d9da0bdde34c5` |
| Lignes cartes, timestamps inclus | `c6027a0ecb06b8bba216754e4a1c7ca1c348c32a5cad4999b3761be21fb9be24` |
| Lignes variantes, timestamps inclus | `7385e2e4b921327e439897cf58182911160c6b35a5638802804484c9c5e69080` |
| Lignes des 1 213 états, timestamps inclus | `cc847bcda15fd490a0b4526931dc87a5ba9dbd4467833fe037b8e90b55e1a45f` |
| Structures ordonnées des trois rapports | `d2566c0c67749fd2742cdf5f0cbf9d2f65db053dd5fa89055955995cdf40fa35` |

Le hash du plan souhaité est identique pour les trois exécutions : `0a6c759d928256c1d77910d7d4dcc19a25a845623ad6fbe06d8b864246087df9`.

## Noms vérifiés dans PostgreSQL

La comparaison des 1 025 valeurs DB avec le référentiel a réussi. Exemples inspectés :

| Dex | Nom exact |
|---:|---|
| 1 | Bulbizarre |
| 25 | Pikachu |
| 29 | Nidoran♀ |
| 122 | M. Mime |
| 150 | Mewtwo |
| 772 | Type:0 |
| 1 000 | Gromago |
| 1 007 | Koraidon |
| 1 008 | Miraidon |
| 1 023 | Chef-de-Fer |
| 1 024 | Terapagos |
| 1 025 | Pêchaminus |

## Tests et preuves locales

- `npm test` : **84 tests passent**, dont 11 frontend, 37 catalogue existants et 36 nouveaux tests du référentiel/générateur/intégration au plan. Aucun appel réseau dans la suite.
- `npm run typecheck` : réussi.
- `npm run build` : réussi, frontend temporaire inchangé.
- `npm run lint` : réussi, zéro avertissement.
- `npm run db:lint` : réussi, aucune erreur ou alerte SQL.
- Audits en lecture seule du vrai catalogue : **42 assertions réussies** (9 après dry-run, 15 après premier apply, 18 après second).
- Comparaison des trois rapports et de la sérialisation du fichier : **24 assertions réussies**.
- `git diff --check`, contrôle des liens Markdown et recherche de références devenues obsolètes : réussis.

`catalog:test:db` exige une base vide et n'a pas été relancé sur ce catalogue réel. Les 307 assertions pgTAP et les 32 assertions de cette intégration restent les mesures du rapport initial ; elles ne sont pas présentées comme réexécutées ici. Aucun reset ni changement de schéma n'est nécessaire pour ce complément.

Les preuves détaillées sont ignorées par Git dans `.cache/` : `pokemon-before.json`, `pokemon-after-dry.json`, `pokemon-after-first.json`, `pokemon-after-second.json`, `pokemon-report-proof.json`, avec les scripts ponctuels d'audit associés. Rapports CLI :

| Fichier dans `.cache/catalog-reports/` | Durée | Résultat |
|---|---:|---|
| `2026-09-07T18-11-39-360Z-dry-run.json` | 63 311 ms | 1 025 noms à modifier, zéro écriture DB |
| `2026-09-07T18-16-57-357Z-apply.json` | 56 339 ms | 1 025 noms modifiés |
| `2026-09-07T18-18-57-932Z-apply.json` | 43 706 ms | Noop fonctionnel |

Les diagnostics TCGdex historiques restent identiques : 9 divergences de dossier, 9 répétitions exactes de variante regroupées, 32 numéros atypiques, 2 sets FR vides et 4 noms français de sets absents. Ces derniers concernent des sets, aucun nom d'espèce Pokémon. Aucune anomalie PokéAPI ni nouvelle anomalie catalogue.

## Fichiers et périmètre

Fichiers créés pour le dépôt :

- [`data/pokemon/pokemon-fr.json`](../../data/pokemon/pokemon-fr.json) ;
- [`data/pokemon/README.md`](../../data/pokemon/README.md) ;
- [`scripts/catalog/pokemon-reference.ts`](../../scripts/catalog/pokemon-reference.ts) ;
- [`scripts/catalog/pokemon-update.ts`](../../scripts/catalog/pokemon-update.ts) ;
- [`scripts/catalog/pokemon.test.ts`](../../scripts/catalog/pokemon.test.ts) ;
- ce rapport.

Fichiers modifiés :

- [`package.json`](../../package.json) : commande de maintenance ;
- [`cli.ts`](../../scripts/catalog/cli.ts), [`plan.ts`](../../scripts/catalog/plan.ts), [`report.ts`](../../scripts/catalog/report.ts) : chargement, noms effectifs, diagnostics et empreinte ;
- [`fixtures.ts`](../../scripts/catalog/fixtures.ts), [`catalog.test.ts`](../../scripts/catalog/catalog.test.ts), [`integration.ts`](../../scripts/catalog/integration.ts) : injection explicite du référentiel synthétique dans les tests existants ;
- [`README.md`](../../README.md), [`02-TCGDEX.md`](../02-TCGDEX.md), [`03-DATA-MODEL.md`](../03-DATA-MODEL.md), [`05-ARCHITECTURE.md`](../05-ARCHITECTURE.md), [`06-DATABASE.md`](../06-DATABASE.md), [`07-CATALOG-SYNC.md`](../07-CATALOG-SYNC.md) : sources, modèle, responsabilités, procédure et traçabilité synchronisés.

Vérifiés sans modification : frontend `src/`, migrations/configuration/tests Supabase, types générés, `package-lock.json`, overrides et rapport initial. Aucun autre fichier du dépôt n'est modifié ; les audits et sorties de build restent ignorés. Les nouveaux fichiers sont prêts à être ajoutés au prochain commit, aucun commit automatique n'a été effectué.

**Pikachu 28/73 (`sm3.5-28`) reste inchangé : aucun override réel ajouté. Aucun `supabase db push`, sync distant ou enregistrement cloud modifié. Auth, profil, frontend métier, collections et Phase 3 n'ont pas commencé.**
