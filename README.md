# MY.

**MY.** est une webapp de gestion de collections de cartes Pokémon TCG.

Le projet s'appuiera sur **TCGdex / cards-database** comme source de référence pour les données Pokémon TCG.

Ce dépôt contient la documentation et le socle applicatif. La documentation reste la source de vérité du projet pour les agents et contributeurs.

## État du projet

**Phases 0 à 6 terminées et validées.** Le Dashboard présente une grille unifiée de collections, avec les statuts `Personnelle` et `Partagée · Lecture seule`, et un FAB de création personnalisée. La Collection affiche son contenu réel autoritatif, la possession/progression, les items automatiques/manuels, la recherche interne locale, l'ajout/retrait manuel et la réorganisation propriétaire. Les exemplaires physiques sont globaux au compte, avec nom facultatif, note libre nullable de 750 caractères maximum et possession dérivée ; leur consultation est en lecture seule en partage. Le détail Variante est contextuel, en panneau desktop ou plein écran mobile, avec exemplaires intégrés. La fondation graphite et l'accent rouge MY. harmonisent public/Auth, Dashboard, Collection et Profil sans nouvelle fonctionnalité métier du compte ; Paramètres était encore minimal à la clôture de Phase 6.

Le backend des collections automatiques est livré : calcul canonique PostgreSQL, état/version de cible, création atomique et concurrente via `create_automatic_collection(...)`, et service TypeScript. La **Phase 7 — Vues, catalogue, recherche globale et préférences** est en cours. Les trois vues Collection **Liste / Cartes / Classeur** sont livrées depuis 7B.3 : préférences du viewer, contenu et ordre autoritatifs communs. Classeur continu, livre desktop/tablette large, page unique mobile, formats `2x2`, `3x3`, `4x3`, recherche sans compactage avec occurrences et halo. Aucun reorder en Classeur ; Liste/Cartes conservent celui du propriétaire. Les trois réglages Affichage de Paramètres sont fonctionnels depuis 7C.1 : défaut catalogue, défaut collection et format Classeur global, sauvegardés indépendamment sans toucher aux derniers modes ni aux overrides. La page Pokémon authentifiée est livrée en 7D.2 : identité par types, recherche locale, vues neutres Liste/Cartes, Détail Variante et création/ouverture automatique personnelle. Extension est livrée en 7D.3 : header neutre à logo/symbole, socle Liste/Cartes/Détail partagé, liens Pokémon indépendants et CTA automatique factorisé. Carte et recherche globale restent futures. Gestion utilisateur des partages prévue en Phase 9. Voir la [roadmap](docs/08-ROADMAP.md) et le [rapport de clôture Phase 6](docs/reports/2026-09-30-PHASE6-CLOSURE.md).

La version applicative est **0.7.9**. `package.json` est son unique source de vérité ; le lockfile est synchronisé. Vite injecte `version` dans `__APP_VERSION__`. Le footer public/Auth et authentifié conserve Conditions d’utilisation et récupère dynamiquement la version, sans constante dans le composant ni dépendance supplémentaire.

**Checkpoint historique Phase 6 : 23 migrations Local/Cloud, dont 12 Phase 6, alignées jusqu'à `20260928083830`.** Après l'audit technique exécuté précédemment par Codex, le propriétaire a exécuté manuellement le checkpoint Cloud : dry-run initial de 12 migrations, push des 12 sans erreur, état final 23/23 et dry-run final sans migration restante. Ces résultats fournis par le propriétaire sont consignés sans nouvel accès Cloud pendant cette clôture documentaire. Les IDs BIGINT restent des chaînes décimales ; le backend reste autoritatif, y compris après réorganisation. Voir le [contrat et l'intégration](docs/06-DATABASE.md#première-liste-fonctionnelle--phase-6b3).

La migration [7A.3](supabase/migrations/20261001132144_phase7a3_view_preferences.sql) est documentée comme appliquée **Supabase Local uniquement** : historique local 24/24 jusqu'à `20261001132144` ; dernier état Cloud fourni par le propriétaire : 23 migrations. 7B.3 réutilise ce socle sans migration ni accès Cloud : override viewer + collection → `binder_default_format` → `3x3`. Absence = héritage dynamique ; retour au défaut = suppression de l'override. Propriétaire et lecteur restent indépendants. Pagination frontend, sans table `binder_pages`. La [recherche Classeur](docs/04-UX-UI.md#recherche-classeur) garde toutes les positions. `src/assets/placeholders/card-placeholder.webp` est le placeholder commun des cartes sans image ou après erreur de chargement, y compris détail et ajout ; une pochette vide ne contient aucune image.

Les onze migrations des Phases 0 à 5 ci-dessous sont présentes dans le dépôt, validées localement et déployées dans Supabase Cloud. Les huit premières ont été confirmées au checkpoint 4D.3 ; le propriétaire a confirmé le déploiement manuel des trois migrations Phase 5. Les [douze migrations Phase 6](docs/reports/2026-09-30-PHASE6-CLOSURE.md#migrations) complètent désormais cet historique, soit 23 au total.

- `20260906082312_phase1_schema` ;
- `20260906082313_phase1_security` ;
- `20260906082314_harden_rls_auto_enable` ;
- `20260906155043_phase2_catalog_pipeline` ;
- `20260908083516_phase2_variant_release_dates` ;
- `20260909124950_pre_phase3_collection_preferences` ;
- `20260909184529_phase3a_auth_identity` ;
- `20260914102414_phase4b3_account_deletion` ;
- `20260920134607_phase5_canonical_collection_structure` ;
- `20260920140934_phase5_create_automatic_collection` ;
- `20260920194903_phase5_dashboard_collections`.

La huitième migration, [20260914102414_phase4b3_account_deletion.sql](supabase/migrations/20260914102414_phase4b3_account_deletion.sql), est appliquée localement et dans le Cloud : nettoyage transactionnel lors d'une suppression Auth et retrait d'accès des JWT résiduels. La fonction `delete-account` est active avec `verify_jwt = false` ; leur intégration réelle est validée dans le [rapport 4D.3](docs/reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md). Aucun déploiement n'a été effectué pendant ce checkpoint.

| Catalogue cloud vérifié lors de cette validation | Lignes |
|---|---:|
| `pokemon` | 1 025 |
| `tcg_series` | 18 |
| `tcg_sets` | 188 |
| `source_cards` | 19 907 |
| `catalog_variants` | 31 904 |
| `card_pokemon` | 16 820 |
| `automatic_target_states` | 1 213 |

Aucun nom français Pokémon ne manque et aucune date de Variante n'est NULL dans ce catalogue validé. `sm3.5-28` possède cinq variantes après override. Les tables utilisateur étaient encore vides à ce moment. Ces constats historiques proviennent du propriétaire. Le checkpoint 4D.3 confirme les volumes ci-dessus et la préservation des empreintes des lignes du catalogue et du pipeline après nettoyage des fixtures, sans nouveau déploiement.

Le pipeline TypeScript importe et synchronise un snapshot Git exact de TCGdex, applique des corrections JSON/Zod, préserve les IDs et calcule les hashes/versions des cibles. **Le pipeline reste local/protégé ; le catalogue résultant existe également dans le cloud.** La [Phase 3B](docs/reports/2026-09-10-PHASE3B-AUTH-UI.md) a livré les écrans Auth et le routing public/protégé ; la [Phase 3C](docs/reports/2026-09-12-PHASE3C-SHELL.md), le shell authentifié. Celui-ci accueille désormais `/dashboard`, `/collections/:collectionId`, `/catalog/pokemon/:pokemonId`, `/catalog/extensions/:setId`, `/profile` et `/settings`. La recherche du header reste visuelle ; Carte, recherche globale et mises à jour automatiques restent planifiées selon la roadmap.

Le cadrage Recherche globale / Catalogue / Navigation / Préférences est intégré dans les références produit, modèle, UX, architecture et SQL. La migration intermédiaire [20260909124950_pre_phase3_collection_preferences.sql](supabase/migrations/20260909124950_pre_phase3_collection_preferences.sql) assure l'unicité des collections automatiques par propriétaire/cible, le nom d'au moins 3 caractères utiles après trim et les préférences de vues privées. **Cette sixième migration est déjà déployée dans Supabase cloud**, selon le propriétaire ; l'ancien statut local était obsolète.

La [Phase 3A](docs/reports/2026-09-09-PHASE3A-AUTH.md) ajoute email/mot de passe, confirmation email obligatoire, TOTP obligatoire et session MY. autorisée en `aal2`. La migration [20260909184529_phase3a_auth_identity.sql](supabase/migrations/20260909184529_phase3a_auth_identity.sql), **déployée et validée dans Supabase cloud**, crée automatiquement le profil depuis Auth et ajoute une restriction MFA aux 13 tables applicatives. Aucune ancienne migration n'a été modifiée.

La configuration Auth cloud est validée : provider Email et inscriptions activés, confirmation email obligatoire, TOTP/App Authenticator activé avec **un seul facteur par utilisateur en V1**, sessions `aal1` limitées à **15 minutes**, Phone/SMS MFA désactivé. **Le développement et les tests courants utilisent Supabase local.** Le [checkpoint Cloud 4D.3](docs/reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) constitue une validation ponctuelle explicitement autorisée, limitée à des fixtures temporaires. Les URLs de retour locales définies en 3B restent locales : aucune URL `localhost` ou `127.0.0.1` ne doit être ajoutée au cloud. Supabase cloud est réservé à la future instance de production avec Vercel ; ses Site URL et Redirect URLs de production seront configurées lors de la mise en production.

Routes 3B : `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm-email`, `/auth/mfa/enroll`, `/auth/mfa/challenge` et `/dashboard`. La confirmation termine la session technique du lien et impose une connexion email/mot de passe. La récupération impose enrollment ou challenge TOTP **avant** le nouveau mot de passe, puis conserve la session après succès. Les données MY. restent fermées pendant ces parcours.

Le complément Phase 2 fournit les noms français des espèces via un référentiel PokéAPI généré manuellement et destiné au versionnement. Les 1 025 Pokémon locaux ont désormais un nom français, sans changement des 1 213 états de cible ; la seconde application est un noop fonctionnel. La synchronisation du catalogue utilise uniquement ce fichier local et ne contacte jamais PokéAPI.

La maintenance dispose aussi de `catalog:find`, une recherche libre du catalogue local en lecture seule. Son moteur `search-catalog.ts` est portable, sans Node, SQL, réseau ou terminal ; il doit être réutilisé autant que possible pour la future recherche Carte. L'adaptateur `search-catalog-db.ts` utilisant `pg` reste réservé à la maintenance et ne doit pas être importé dans React. La recherche catalogue d'ajout Phase 6 utilise une RPC Supabase/Auth/RLS ; elle couvre carte/Pokémon, numéro/fraction, Extension, abréviations, identifiants et variante, avec normalisation et AND multi-termes, mais **pas le nom de série**. La recherche globale reste prévue en Phase 7.

Chaque variante porte désormais sa date effective nullable et sa provenance persistée. Elle hérite de la date résolue de sa carte lorsqu'aucune date spécifique fiable n'est connue. Le classement Pokémon utilise cette date de variante ; le classement Set reste numéro puis variante. La [correction des dates de variantes](docs/reports/2026-09-08-PHASE2-VARIANT-DATES.md) conserve les preuves de migration du volume local, de stabilité des IDs et d'idempotence.

**Vercel est l'hébergeur frontend retenu pour la V1**, avec Supabase comme backend principal. Vercel n'est pas encore configuré, le dépôt n'y est pas importé et aucun déploiement de production n'est en place. Le déploiement Vercel et ses URLs de production sont réservés à la phase finale de mise en production.

Le socle Phase 7D.1 est livré localement : types Pokémon, RPC Catalogue authentifiées, services/décodeurs stricts, helper FR/source et palette frontend. Pokémon (7D.2) et Extension (7D.3) partagent leur socle UI, sans nouvelle migration. Voir les [contrats](docs/09-CATALOG-CONTRACTS.md), le [rapport 7D.1](docs/reports/2026-10-04-PHASE7D1-CATALOG-FOUNDATION.md) et le [rapport 7D.2](docs/reports/2026-10-05-PHASE7D2-POKEMON-CATALOG-UI.md) et le [rapport 7D.3](docs/reports/2026-10-05-PHASE7D3-SET-CATALOG-UI.md).

## Workflow Git

`dev` est la branche GitHub par défaut et la branche de développement et d'intégration. `main` représente l'état stable et sera la branche de production Vercel ; les changements validés y passent par Pull Request depuis `dev`. Vercel reste non configuré et non déployé à ce stade.

## Développement local

Prérequis : Git, Node.js **24.20.0** (ou une version 24.x plus récente) et npm **11.19.0** (ou une version 11.x plus récente). Le fichier `.nvmrc` indique la version de référence de Node.

```sh
npm ci
npm run dev
```

Vite affiche l'adresse locale, habituellement `http://localhost:5173`. Le frontend fonctionne sans fichier `.env` et sans Supabase démarré.

La stack installée comprend React 19, TypeScript 6, Vite 8, React Router 8, TanStack Query 5, Zod 4 et `@supabase/supabase-js` 2. Les versions exactes sont fixées dans `package.json` et `package-lock.json`. TypeScript reste en 6.0.3 pour respecter la compatibilité de `typescript-eslint` ; TypeScript 7 n'est pas encore pris en charge par cette version du linter.

| Commande | Usage |
|---|---|
| `npm run dev` | Serveur Vite de développement |
| `npm run typecheck` | Vérification TypeScript du frontend, du pipeline, des tests et de Vite |
| `npm run build` | Vérification TypeScript puis build Vite dans `dist/` |
| `npm run preview` | Aperçu local du dernier build |
| `npm run lint` | ESLint, avec analyse TypeScript et zéro avertissement autorisé |
| `npm test` | Tests Vitest exécutés une fois |
| `npm run test:watch` | Tests Vitest en mode interactif |

Les tests frontend utilisent React Testing Library, jest-dom et jsdom, avec des mocks Supabase pour Auth et MFA. Le projet Vitest `catalog` utilise Node pour les tests du pipeline. Aucun test unitaire ne requiert le dataset réel ni une base distante. `npm test -- --project frontend` exécute uniquement la suite frontend.

Le projet Vitest `functions` couvre le handler de suppression (`npm test -- --project functions`). Son point d'entrée Deno est vérifiable avec `deno check --config supabase/functions/delete-account/deno.json supabase/functions/delete-account/index.ts`. Après démarrage local, `npx supabase functions serve delete-account` sert l'Edge Function et `node scripts/test-account-deletion.js` vérifie le parcours réel avec nettoyage des fixtures. Le contrat serveur est décrit dans l'[architecture](docs/05-ARCHITECTURE.md#suppression-du-compte--contraintes-dorchestration).

## Organisation du frontend

- `src/app/` : composition de l'application, providers, routes, shell et header authentifiés ;
- `src/services/` : accès aux services, dont la préparation du client Supabase ;
- `src/lib/` : logique et utilitaires partagés, dont la validation d'environnement ;
- `src/types/` : variables Vite et `database.generated.ts`, généré par la CLI Supabase ;
- `src/test/` : configuration commune des tests ; les tests restent à côté du code testé.

`src/features/auth/` contient le provider Auth, son état unique, `useAuth`, les callbacks email et les écrans Auth. `src/features/profile/` contient la page Profil et la gestion du compte ; `dashboard/` porte les tuiles et la création personnalisée ; `collections/` porte l'overview, la progression partagée avec les tuiles, la liste de contenu et les actions propriétaire ; `physical-copies/` porte la modal des exemplaires. `settings/` porte les trois réglages Affichage, branchés sur le service 7A.3 et le cache partagé des préférences. La présentation utilise le logo existant et Poppins 400/600 servis localement depuis `src/assets/fonts/`, avec leur licence OFL. `main.tsx` se limite au montage React ; le QueryClient reste stable pendant la vie des providers. Les changements Auth purgent son cache pour éviter de conserver des données privées après perte d'accès ou changement de compte.

## Supabase local et variables d'environnement

La CLI Supabase est une dépendance de développement locale : `supabase` **2.119.0** dans le lockfile, avec la plage `^2.119.0` dans `package.json`. Après `npm ci`, les scripts npm et `npx supabase` utilisent cette CLI locale, référence reproductible du projet ; aucune installation globale n'est nécessaire. `supabase/config.toml` est versionné et l'initialisation a déjà été effectuée : il n'est pas nécessaire de relancer `supabase init` après un clone. L'identifiant `my-local` distingue uniquement les conteneurs locaux. Le seed et Realtime restent désactivés. La configuration Auth locale applique la V1 : signup email, confirmation obligatoire, enrollment/vérification TOTP activés, téléphone et autres providers désactivés. Elle ne configure pas le cloud.

Pour utiliser les services locaux, démarrer Docker Desktop (avec WSL 2 sous Windows), puis :

```sh
npm run supabase:start
npm run supabase:status
npm run supabase:stop
```

Le premier démarrage télécharge les images Docker. L'arrêt conserve les données locales. Ces commandes ne nécessitent ni connexion au compte Supabase ni lien vers le projet cloud. Docker Desktop et Supabase local ont été vérifiés hors sandbox dans Codex pendant la Phase 1.

Les ports du projet utilisent la plage `5532x` : API `55321`, PostgreSQL `55322`, Studio `55323`, serveur mail de test `55324`, base shadow `55320`, analytics `55327` et pooler éventuel `55329`. Windows réservait notamment la plage `54285–54384`, bloquant le port PostgreSQL initial `54322`. Seule la configuration des ports locaux a été adaptée ; aucune configuration réseau système n'a été modifiée.

Pour activer Auth localement, copier `.env.example` vers `.env.local`, puis renseigner l'URL locale et la **clé publishable** locale affichées par la CLI :

- `VITE_SUPABASE_URL` ;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

Ces valeurs sont publiques dans le navigateur. N'y placer aucun secret, clé privilégiée, mot de passe PostgreSQL ou token. Redémarrer Vite après modification. Zod valide ces deux valeurs au premier appel à `getSupabaseClient()` depuis le provider Auth ; sans configuration, cette fonction retourne `null` et le bootstrap reste utilisable sans réseau. Avec configuration, le client unique restaure/persiste les sessions, renouvelle les tokens et traite les liens de confirmation/reset. Le provider commence en `initializing` et ne charge le profil qu'après email confirmé et TOTP `aal2`.

La Site URL locale est `http://localhost:5173`, avec `http://127.0.0.1:5173` également autorisée. Les retours exacts `/auth/confirm-email` et `/reset-password` sont autorisés pour ces deux origines ; le frontend construit les liens depuis son origine courante. Les emails sont capturés par Mailpit sur `55324`. `max_enrolled_factors = 1` aligne le local sur la V1. Le [schéma sessions de la CLI 2.119.0](https://github.com/supabase/cli/blob/v2.119.0/packages/config/src/auth/sessions.ts) expose `timebox` et `inactivity_timeout`, sans durée spécifique `aal1` : les 15 minutes restent un réglage cloud. L'[architecture](docs/05-ARCHITECTURE.md#profil-et-gestion-du-compte--cible-phase-4) distingue les limites Auth historiques des schémas CLI courants ; le comportement serveur local du mot de passe actuel n'est pas revalidé dans cette préparation Phase 7. Après modification de `config.toml`, redémarrer Supabase avec `supabase:stop` puis `supabase:start`, en conservant les volumes.

Les fichiers `.env` réels, `node_modules/`, `dist/`, les caches et l'état local Supabase sont ignorés par Git. `.env.example`, `supabase/config.toml`, `package-lock.json`, les migrations, les tests SQL et les types générés sont versionnés. Aucun seed applicatif n'est présent. L'Edge Function `delete-account` assure la suppression du compte ; la création automatique des collections repose directement sur PostgreSQL/RPC, sans Edge Function intermédiaire.

## Validation de la base locale

Après `npm ci`, démarrer Docker Desktop. Pour appliquer les migrations en attente au volume local existant puis vérifier le schéma :

Toute migration validée est appliquée à **Supabase local** au fil du développement. Le checkpoint Cloud Phase 6 a été exécuté manuellement par le propriétaire ; Local et Cloud comptent désormais 23 migrations alignées. `migration list --local` compare les fichiers à l'historique de la base locale : sa colonne `Remote` désigne ici cette base locale, pas Supabase Cloud. Aucun reset requis pour appliquer les migrations manquantes.

```sh
npm run supabase:start
npx supabase migration list --local
node node_modules/supabase/dist/supabase.js migration up --local
npm run db:test
npm run db:lint
npm run db:types
npm run build
npm run lint
npm test
```

| Commande ajoutée | Usage |
|---|---|
| `npm run db:reset` | Reconstruit entièrement la base **locale**, en supprimant ses données, depuis les migrations |
| `npm run db:test` | Exécute les 19 fichiers pgTAP via `supabase test db --local` ; accepte un chemin pour cibler une suite |
| `npm run db:test:concurrency` | Vérifie la création automatique concurrente et le verrou catalogue avec plusieurs connexions locales ; nettoie ses fixtures dédiées |
| `npm run db:lint` | Vérifie `public` et `private`, avec échec dès un avertissement SQL |
| `npm run db:types` | Régénère `src/types/database.generated.ts` depuis `public` local ; le fichier existant est conservé si la CLI échoue |

Les assertions PostgreSQL couvrent le schéma, les grants/RLS métier, le pipeline, les dates, les préférences, la création des profils, le backfill Auth, les restrictions `aal1`/`aal2`, la suppression du compte, le calcul canonique, la création automatique, la lecture Dashboard owned/shared et les contrats Phase 6. **Audit technique final Phase 6 exécuté précédemment par Codex : DB/pgTAP PASS, 18 fichiers et 977 assertions ; Frontend/Vitest PASS, 40 fichiers et 1 202 tests.** `db:lint`, `typecheck`, `lint`, `build` et `diff-check` : PASS ; `db:types` : PASS sans diff. Ces résultats validés sont consignés dans le [rapport de clôture Phase 6](docs/reports/2026-09-30-PHASE6-CLOSURE.md), sans réexécution pendant cette clôture. Le bundle principal d'environ 680,01 kB reste un point non bloquant, avec optimisation reportée à la finalisation V1. Les fixtures DB sont annulées à la fin de chaque fichier. Le lanceur prépare temporairement les migrations Automatic RLS et Auth nécessaires aux tests de régression, puis supprime ces copies ignorées ; aucun utilisateur ou catalogue synthétique ne constitue un seed applicatif.

Adapter les contrôles aux changements : tests ciblés pendant le développement, puis une seule passe globale pertinente. `build` inclut déjà `typecheck`. Régénérer les types une seule fois après stabilisation du schéma. Pour vérifier une reconstruction sans détruire le volume importé, `supabase db diff --local --schema public,private` compare le schéma à une base shadow reconstruite depuis les migrations. `db:reset` reste réservé à un besoin explicite de base locale vide ; `supabase:stop` conserve les données.

La validation historique Phase 1 a réussi sur PostgreSQL 17 local : reconstruction depuis les migrations, 258 assertions pgTAP, lint SQL sans avertissement, contrôle de sécurité Supabase sans problème signalé et génération CLI des types. La passe finale 3A réussit 446 assertions PostgreSQL et 36 tests frontend, avec `build` et `lint`.

Les déclarations de types restent celles produites par la CLI ; le script normalise seulement la fin de fichier. Seule la règle ESLint `no-redundant-type-constituents` est désactivée pour ce fichier afin de conserver les unions telles que générées ; la vérification TypeScript et les autres règles restent actives.

Les migrations sont détaillées dans [06-DATABASE.md](docs/06-DATABASE.md). Le trigger Auth crée le profil et réutilise la génération de son identifiant public immuable. La création automatique passe par la RPC contrôlée livrée en Phase 5. Les écritures directes de collections automatiques, les modifications d'éléments et la création d'un partage restent fermées ; les RPC contrôlées d'ajout/retrait manuel et de réorganisation sont livrées en Phase 6. Le parcours utilisateur de création de partage reste futur.

## Catalogue TCGdex local

La procédure et les algorithmes sont définis dans [07-CATALOG-SYNC.md](docs/07-CATALOG-SYNC.md). `scripts/catalog/` utilise Node 24, TypeScript, Zod et `pg` (avec ses types). Le cache Git et les rapports résident dans `.cache/`, ignoré. Les corrections versionnées sont dans [data/catalog-overrides/](data/catalog-overrides/README.md) ; aucun override réel n'est ajouté par défaut.

Le catalogue local vérifié contient 19 907 cartes, 31 904 variantes, 1 025 Pokémon et 188 sets ; le catalogue cloud validé est détaillé plus haut. Le premier override réel porte Pikachu 28/73 à cinq variantes. Les mesures de l'import initial (31 900 variantes) restent dans le [rapport Phase 2](docs/reports/2026-09-06-PHASE2.md), qui constitue une preuve historique locale. La recherche n'applique aucune correction et ne change ni le catalogue ni les états de cible.

| Commande | Usage |
|---|---|
| `npm run catalog:validate` | Valide snapshot, corrections et rapprochement en lecture sur Supabase local |
| `npm run catalog:find -- "Pikachu Légendes Brillantes"` | Recherche locale en lecture seule ; affiche la cible d'override directement copiable |
| `npm run catalog:find -- "Pikachu" --export` | CSV local de toutes les cartes trouvées, une ligne par variante standard, avec dates et sélecteurs |
| `npm run pokemon:update` | Régénère manuellement le référentiel complet noms FR + types des espèces depuis PokéAPI, sans accès DB |
| `npm run catalog:sync` | Dry-run complet par défaut, zéro écriture DB, aucun ID consommé |
| `npm run catalog:sync -- --snapshot <SHA> --dry-run` | Rejoue un SHA exact et produit le plan |
| `npm run catalog:sync -- --snapshot <SHA> --apply` | Applique le plan transactionnellement sur la base locale |
| `npm run catalog:test:db` | 32 assertions d'intégration hors ligne, avec rollback de toutes les fixtures ; base locale vide requise |

Sans SHA, le HEAD TCGdex est résolu une fois. Le premier clone/fetch nécessite GitHub ; un SHA déjà en cache peut être rejoué hors ligne. La connexion locale provient du statut Supabase sans afficher les secrets. `CATALOG_DATABASE_URL`, privée et facultative, accepte seulement le loopback sur `55322/postgres`. Aucun mode distant n'est disponible. `--apply` est obligatoire pour écrire.

Le [référentiel Pokémon](data/pokemon/README.md) précise la provenance, la validation, les erreurs et la mise à jour de `data/pokemon/pokemon-reference.json`. Une synchronisation reproductible fixe également ce fichier, les overrides et le code. Les résultats du complément noms sont consignés dans le [rapport du 7 septembre](docs/reports/2026-09-07-PHASE2-POKEMON-NAMES.md).

Pour retrouver une cible, démarrer Supabase local puis utiliser une seule chaîne entre guillemets :

```sh
npm run catalog:find -- "Pikachu 28"
npm run catalog:find -- "Raichu GX"
npm run catalog:find -- "Évoli Promo" --limit 10
```

La sortie affiche `tcgdex:sm3.5-28`, le nom, les Pokémon liés, le set, `28/73` et cinq variantes pour le cas Pikachu. Les termes peuvent correspondre à des champs différents ; casse et accents sont ignorés. La limite est de 20 résultats, ajustable de 1 à 100, avec le total affiché. Aucun résultat est une sortie normale ; une recherche vide affiche l'usage. Si Supabase est arrêté, la commande indique comment le démarrer. Le [guide des overrides](data/catalog-overrides/README.md) explique `id`, `card` et les étapes suivantes ; le [rapport catalog:find](docs/reports/2026-09-07-PHASE2-CATALOG-FIND.md) conserve les tests réels et la preuve de lecture seule.

Avec `--export`, la même recherche produit toutes ses correspondances, une ligne par variante standard stockée, sans limite 20. La combinaison `--export --limit` est refusée. Les huit colonnes sont **Card, Nom, Set, N°, Variante, Date, Origine date, Variant Key** ; `Variant Key` se copie dans le champ `key` de `variant.patch`, et une date NULL donne une cellule vide.

Le CSV est écrit dans `.cache/catalog-exports/catalog-find-<recherche-normalisée>-<empreinte-10-caractères>.csv`, ignoré par Git, et remplace proprement le précédent export de cette recherche. UTF-8 avec BOM, séparateur `;`, guillemets échappés et fins de ligne CRLF permettent l'ouverture dans Excel/LibreOffice. Aucun résultat ne crée de CSV ; un éventuel ancien export est conservé et signalé.

Workflow : **export de référence → audit humain → fichier séparé `*_override.csv` contenant uniquement les corrections souhaitées**. Ce fichier sert de liste manuelle ; aucun importeur CSV n'est créé et le CSV de référence n'est pas destiné à être modifié puis réimporté. Le [guide des overrides](data/catalog-overrides/README.md) détaille les clés et le [rapport d'export](docs/reports/2026-09-08-PHASE2-CATALOG-FIND-EXPORT.md) conserve les vérifications.

Pour vérifier le pipeline lui-même, utiliser l'intégration synthétique `catalog:test:db` uniquement sur une base locale sans catalogue réel. Pour une mesure reproductible d'import initial sur une base volontairement reconstruite, fixer le SHA, lancer le dry-run, lire son rapport, puis appliquer deux fois les mêmes entrées : la seconde application ne doit changer aucune donnée fonctionnelle. Ces opérations ne sont pas nécessaires à une modification de préférences ou de contraintes utilisateur. Les rapports JSON complets sont dans `.cache/catalog-reports/`.

`db:reset` supprime le catalogue local et ne sert pas à une synchronisation normale. `supabase:stop` conserve le volume importé. La Phase 2, son catalogue, la préparation des préférences et la migration 3A sont déployés et validés dans Supabase cloud, selon le propriétaire.

## Documentation

Les documents du dossier `docs/` constituent le cadre de référence des étapes suivantes.

- [Vision générale du projet](docs/00-VISION.md)
- [Fonctionnalités de la V1](docs/01-FEATURES.md)
- [Intégration de TCGdex](docs/02-TCGDEX.md)
- [Modèle de données conceptuel](docs/03-DATA-MODEL.md)
- [Expérience utilisateur et interface](docs/04-UX-UI.md)
- [Architecture technique de la V1](docs/05-ARCHITECTURE.md)
- [Schéma PostgreSQL / Supabase de la V1](docs/06-DATABASE.md)
- [Pipeline catalogue et synchronisation TCGdex](docs/07-CATALOG-SYNC.md)
- [Roadmap globale et évolution du projet](docs/08-ROADMAP.md)
