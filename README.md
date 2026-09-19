# MY.

**MY.** est une webapp de gestion de collections de cartes Pokémon TCG.

Le projet s'appuiera sur **TCGdex / cards-database** comme source de référence pour les données Pokémon TCG.

Ce dépôt contient la documentation et le socle applicatif. La documentation reste la source de vérité du projet pour les agents et contributeurs.

## État du projet

**Phases 0 à 4 terminées et validées.** La **Phase 4 — Profil et gestion du compte** est clôturée par le [checkpoint Cloud final](docs/reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md), exécuté le 19 septembre 2026. Le Profil livre identité MY. copiable, date d'inscription Auth, changement d'email, section **Sécurité du compte** avec changement volontaire du mot de passe et statut Authenticator, puis suppression définitive en trois étapes. Les refus serveur du mot de passe actuel absent/incorrect, le changement via le service MY., le recovery sans ancien mot de passe, la MFA et la suppression réelle avec fermeture des anciens JWT sont validés sur fixtures Cloud nettoyées. La limitation de la CLI locale 2.117.0 reste documentée. Les rapports historiques [4B.2](docs/reports/2026-09-13-PHASE4B2-ACCOUNT-AUTH.md), [4B.3](docs/reports/2026-09-14-PHASE4B3-ACCOUNT-DELETION.md), [4C](docs/reports/2026-09-14-PHASE4C-PROFILE.md), [4D.1](docs/reports/2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) et [4D.2](docs/reports/2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md) restent conservés. Prochaine étape : **Phase 5 — Dashboard, création et gestion des collections**, non commencée. La [roadmap globale](docs/08-ROADMAP.md) définit l'ordre des grandes phases jusqu'à la V1.

La préparation des préférences est déployée ; le socle Auth est validé localement et dans Supabase cloud ; les écrans Auth et le shell authentifié sont validés localement. Les huit migrations déployées, confirmées en lecture seule au checkpoint 4D.3, sont :

- `20260906082312_phase1_schema` ;
- `20260906082313_phase1_security` ;
- `20260906082314_harden_rls_auto_enable` ;
- `20260906155043_phase2_catalog_pipeline` ;
- `20260908083516_phase2_variant_release_dates` ;
- `20260909124950_pre_phase3_collection_preferences` ;
- `20260909184529_phase3a_auth_identity` ;
- `20260914102414_phase4b3_account_deletion`.

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

Le pipeline TypeScript importe et synchronise un snapshot Git exact de TCGdex, applique des corrections JSON/Zod, préserve les IDs et calcule les hashes/versions des cibles. **Le pipeline reste local/protégé ; le catalogue résultant existe également dans le cloud.** La [Phase 3B](docs/reports/2026-09-10-PHASE3B-AUTH-UI.md) ajoute les écrans Auth et le routing public/protégé sur le socle 3A. La [Phase 3C](docs/reports/2026-09-12-PHASE3C-SHELL.md) finalise le shell authentifié, son header et les pages minimales `/dashboard`, `/profile` et `/settings`. La recherche du header reste visuelle ; les RPC de collections et les interfaces métier restent à construire.

Le cadrage Recherche globale / Catalogue / Navigation / Préférences est intégré dans les références produit, modèle, UX, architecture et SQL. La migration intermédiaire [20260909124950_pre_phase3_collection_preferences.sql](supabase/migrations/20260909124950_pre_phase3_collection_preferences.sql) assure l'unicité des collections automatiques par propriétaire/cible, le nom d'au moins 3 caractères utiles après trim et les préférences de vues privées. **Cette sixième migration est déjà déployée dans Supabase cloud**, selon le propriétaire ; l'ancien statut local était obsolète.

La [Phase 3A](docs/reports/2026-09-09-PHASE3A-AUTH.md) ajoute email/mot de passe, confirmation email obligatoire, TOTP obligatoire et session MY. autorisée en `aal2`. La migration [20260909184529_phase3a_auth_identity.sql](supabase/migrations/20260909184529_phase3a_auth_identity.sql), **déployée et validée dans Supabase cloud**, crée automatiquement le profil depuis Auth et ajoute une restriction MFA aux 13 tables applicatives. Aucune ancienne migration n'a été modifiée.

La configuration Auth cloud est validée : provider Email et inscriptions activés, confirmation email obligatoire, TOTP/App Authenticator activé avec **un seul facteur par utilisateur en V1**, sessions `aal1` limitées à **15 minutes**, Phone/SMS MFA désactivé. **Le développement et les tests courants utilisent Supabase local.** Le [checkpoint Cloud 4D.3](docs/reports/2026-09-15-PHASE4D3-CLOUD-CHECKPOINT.md) constitue une validation ponctuelle explicitement autorisée, limitée à des fixtures temporaires. Les URLs de retour locales définies en 3B restent locales : aucune URL `localhost` ou `127.0.0.1` ne doit être ajoutée au cloud. Supabase cloud est réservé à la future instance de production avec Vercel ; ses Site URL et Redirect URLs de production seront configurées lors de la mise en production.

Routes 3B : `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm-email`, `/auth/mfa/enroll`, `/auth/mfa/challenge` et `/dashboard`. La confirmation termine la session technique du lien et impose une connexion email/mot de passe. La récupération impose enrollment ou challenge TOTP **avant** le nouveau mot de passe, puis conserve la session après succès. Les données MY. restent fermées pendant ces parcours.

Le complément Phase 2 fournit les noms français des espèces via un référentiel PokéAPI généré manuellement et destiné au versionnement. Les 1 025 Pokémon locaux ont désormais un nom français, sans changement des 1 213 états de cible ; la seconde application est un noop fonctionnel. La synchronisation du catalogue utilise uniquement ce fichier local et ne contacte jamais PokéAPI.

La maintenance dispose aussi de `catalog:find`, une recherche libre du catalogue local en lecture seule. Son moteur `search-catalog.ts` est portable, sans Node, SQL, réseau ou terminal ; il doit être réutilisé autant que possible pour la future recherche Carte. L'adaptateur `search-catalog-db.ts` utilisant `pg` reste réservé à la maintenance et ne doit pas être importé dans React. Le futur frontend accédera aux données via Supabase/Auth/RLS. Aucune interface de recherche ni API supplémentaire n'est ajoutée.

Chaque variante porte désormais sa date effective nullable et sa provenance persistée. Elle hérite de la date résolue de sa carte lorsqu'aucune date spécifique fiable n'est connue. Le classement Pokémon utilise cette date de variante ; le classement Set reste numéro puis variante. La [correction des dates de variantes](docs/reports/2026-09-08-PHASE2-VARIANT-DATES.md) conserve les preuves de migration du volume local, de stabilité des IDs et d'idempotence.

**Vercel est l'hébergeur frontend retenu pour la V1**, avec Supabase comme backend principal. Vercel n'est pas encore configuré, le dépôt n'y est pas importé et aucun déploiement de production n'est en place. Le déploiement Vercel et ses URLs de production sont réservés à la phase finale de mise en production.

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

`src/features/auth/` contient le provider Auth, son état unique, `useAuth`, les callbacks email et les écrans Auth. `src/features/profile/` contient la page Profil et ses formulaires de changement d'email et de mot de passe volontaire ; `dashboard/` et `settings/` conservent les pages minimales du shell. La présentation utilise le logo existant et Poppins 400/600 servis localement depuis `src/assets/fonts/`, avec leur licence OFL. `main.tsx` se limite au montage React ; le QueryClient reste stable pendant la vie des providers. Les changements Auth purgent son cache pour éviter de conserver des données privées après perte d'accès ou changement de compte.

## Supabase local et variables d'environnement

La CLI Supabase est une dépendance de développement locale. `supabase/config.toml` est versionné et l'initialisation a déjà été effectuée : il n'est pas nécessaire de relancer `supabase init` après un clone. L'identifiant `my-local` distingue uniquement les conteneurs locaux. Le seed et Realtime restent désactivés. La configuration Auth locale applique la V1 : signup email, confirmation obligatoire, enrollment/vérification TOTP activés, téléphone et autres providers désactivés. Elle ne configure pas le cloud.

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

La Site URL locale est `http://localhost:5173`, avec `http://127.0.0.1:5173` également autorisée. Les retours exacts `/auth/confirm-email` et `/reset-password` sont autorisés pour ces deux origines ; le frontend construit les liens depuis son origine courante. Les emails sont capturés par Mailpit sur `55324`. `max_enrolled_factors = 1` aligne le local sur la V1. La CLI 2.116.0 n'expose pas la durée propre à `aal1` dans `config.toml` : les 15 minutes restent un réglage cloud. Après modification de `config.toml`, redémarrer Supabase avec `supabase:stop` puis `supabase:start`, en conservant les volumes.

Les fichiers `.env` réels, `node_modules/`, `dist/`, les caches et l'état local Supabase sont ignorés par Git. `.env.example`, `supabase/config.toml`, `package-lock.json`, les migrations, les tests SQL et les types générés sont versionnés. Aucun seed applicatif ni Edge Function n'est présent.

## Validation de la base locale

Après `npm ci`, démarrer Docker Desktop. Pour appliquer les migrations en attente au volume local existant puis vérifier le schéma :

```sh
npm run supabase:start
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
| `npm run db:test` | Exécute les huit suites pgTAP via `supabase test db --local` ; accepte un chemin pour cibler une suite |
| `npm run db:lint` | Vérifie `public` et `private`, avec échec dès un avertissement SQL |
| `npm run db:types` | Régénère `src/types/database.generated.ts` depuis `public` local ; le fichier existant est conservé si la CLI échoue |

Les assertions PostgreSQL couvrent le schéma, les grants/RLS métier, le pipeline, les dates, les préférences, la création des profils, le backfill Auth et les restrictions `aal1`/`aal2`. Les fixtures sont annulées à la fin de chaque suite. Le lanceur prépare temporairement les migrations Automatic RLS et Auth nécessaires aux tests de régression, puis supprime ces copies ignorées. Aucun utilisateur ou catalogue synthétique ne constitue un seed applicatif. Les résultats de la passe 3A sont consignés dans son [rapport](docs/reports/2026-09-09-PHASE3A-AUTH.md).

Adapter les contrôles aux changements : tests ciblés pendant le développement, puis une seule passe globale pertinente. `build` inclut déjà `typecheck`. Régénérer les types une seule fois après stabilisation du schéma. Pour vérifier une reconstruction sans détruire le volume importé, `supabase db diff --local --schema public,private` compare le schéma à une base shadow reconstruite depuis les migrations. `db:reset` reste réservé à un besoin explicite de base locale vide ; `supabase:stop` conserve les données.

La validation historique Phase 1 a réussi sur PostgreSQL 17 local : reconstruction depuis les migrations, 258 assertions pgTAP, lint SQL sans avertissement, contrôle de sécurité Supabase sans problème signalé et génération CLI des types. La passe finale 3A réussit 446 assertions PostgreSQL et 36 tests frontend, avec `build` et `lint`.

Les déclarations de types restent celles produites par la CLI ; le script normalise seulement la fin de fichier. Seule la règle ESLint `no-redundant-type-constituents` est désactivée pour ce fichier, car les helpers générés incluent des unions avec les vues actuellement absentes ; la vérification TypeScript et les autres règles restent actives.

Les migrations sont détaillées dans [06-DATABASE.md](docs/06-DATABASE.md). Le trigger Auth crée le profil et réutilise la génération de son identifiant public immuable. Les créations de collections automatiques, les modifications d'éléments et la création d'un partage restent fermées à l'écriture directe jusqu'aux opérations contrôlées correspondantes.

## Catalogue TCGdex local

La procédure et les algorithmes sont définis dans [07-CATALOG-SYNC.md](docs/07-CATALOG-SYNC.md). `scripts/catalog/` utilise Node 24, TypeScript, Zod et `pg` (avec ses types). Le cache Git et les rapports résident dans `.cache/`, ignoré. Les corrections versionnées sont dans [data/catalog-overrides/](data/catalog-overrides/README.md) ; aucun override réel n'est ajouté par défaut.

Le catalogue local vérifié contient 19 907 cartes, 31 904 variantes, 1 025 Pokémon et 188 sets ; le catalogue cloud validé est détaillé plus haut. Le premier override réel porte Pikachu 28/73 à cinq variantes. Les mesures de l'import initial (31 900 variantes) restent dans le [rapport Phase 2](docs/reports/2026-09-06-PHASE2.md), qui constitue une preuve historique locale. La recherche n'applique aucune correction et ne change ni le catalogue ni les états de cible.

| Commande | Usage |
|---|---|
| `npm run catalog:validate` | Valide snapshot, corrections et rapprochement en lecture sur Supabase local |
| `npm run catalog:find -- "Pikachu Légendes Brillantes"` | Recherche locale en lecture seule ; affiche la cible d'override directement copiable |
| `npm run catalog:find -- "Pikachu" --export` | CSV local de toutes les cartes trouvées, une ligne par variante standard, avec dates et sélecteurs |
| `npm run pokemon:update` | Régénère manuellement le référentiel complet des noms d'espèces français depuis PokéAPI, sans accès DB |
| `npm run catalog:sync` | Dry-run complet par défaut, zéro écriture DB, aucun ID consommé |
| `npm run catalog:sync -- --snapshot <SHA> --dry-run` | Rejoue un SHA exact et produit le plan |
| `npm run catalog:sync -- --snapshot <SHA> --apply` | Applique le plan transactionnellement sur la base locale |
| `npm run catalog:test:db` | 32 assertions d'intégration hors ligne, avec rollback de toutes les fixtures ; base locale vide requise |

Sans SHA, le HEAD TCGdex est résolu une fois. Le premier clone/fetch nécessite GitHub ; un SHA déjà en cache peut être rejoué hors ligne. La connexion locale provient du statut Supabase sans afficher les secrets. `CATALOG_DATABASE_URL`, privée et facultative, accepte seulement le loopback sur `55322/postgres`. Aucun mode distant n'est disponible. `--apply` est obligatoire pour écrire.

Le [référentiel Pokémon](data/pokemon/README.md) précise la provenance, la validation, les erreurs et la mise à jour de `data/pokemon/pokemon-fr.json`. Une synchronisation reproductible fixe également ce fichier, les overrides et le code. Les résultats du complément noms sont consignés dans le [rapport du 7 septembre](docs/reports/2026-09-07-PHASE2-POKEMON-NAMES.md).

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
