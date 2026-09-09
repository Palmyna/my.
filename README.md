# MY.

**MY.** est une webapp de gestion de collections de cartes Pokémon TCG.

Le projet s'appuiera sur **TCGdex / cards-database** comme source de référence pour les données Pokémon TCG.

Ce dépôt contient la documentation et le socle applicatif. La documentation reste la source de vérité du projet pour les agents et contributeurs.

## État du projet

**Phases 0 à 2 validées ; préparation des préférences déployée ; Phase 3A implémentée et validée localement.** La validation cloud de 3A reste à effectuer. Les six migrations déjà déployées, selon la validation fournie par le propriétaire, sont :

- `20260906082312_phase1_schema` ;
- `20260906082313_phase1_security` ;
- `20260906082314_harden_rls_auto_enable` ;
- `20260906155043_phase2_catalog_pipeline` ;
- `20260908083516_phase2_variant_release_dates` ;
- `20260909124950_pre_phase3_collection_preferences`.

| Catalogue cloud vérifié lors de cette validation | Lignes |
|---|---:|
| `pokemon` | 1 025 |
| `tcg_series` | 18 |
| `tcg_sets` | 188 |
| `source_cards` | 19 907 |
| `catalog_variants` | 31 904 |
| `card_pokemon` | 16 820 |
| `automatic_target_states` | 1 213 |

Aucun nom français Pokémon ne manque et aucune date de Variante n'est NULL dans ce catalogue validé. `sm3.5-28` possède cinq variantes après override. Les tables utilisateur étaient encore vides à ce moment. Cet état cloud est celui transmis par le propriétaire ; la tâche intermédiaire n'effectue ni nouvelle vérification distante ni déploiement cloud.

Le pipeline TypeScript importe et synchronise un snapshot Git exact de TCGdex, applique des corrections JSON/Zod, préserve les IDs et calcule les hashes/versions des cibles. **Le pipeline reste local/protégé ; le catalogue résultant existe également dans le cloud.** Le frontend affiche toujours `MY.` et « Application initialisée ». Le socle Auth de Phase 3A est disponible ; les écrans Auth, le routing public/protégé et le shell des Phases 3B/3C, les RPC de collections et les interfaces métier restent à construire.

Le cadrage Recherche globale / Catalogue / Navigation / Préférences est intégré dans les références produit, modèle, UX, architecture et SQL. La migration intermédiaire [20260909124950_pre_phase3_collection_preferences.sql](supabase/migrations/20260909124950_pre_phase3_collection_preferences.sql) assure l'unicité des collections automatiques par propriétaire/cible, le nom d'au moins 3 caractères utiles après trim et les préférences de vues privées. **Cette sixième migration est déjà déployée dans Supabase cloud**, selon le propriétaire ; l'ancien statut local était obsolète.

La [Phase 3A](docs/reports/2026-09-09-PHASE3A-AUTH.md) ajoute email/mot de passe, confirmation email obligatoire, TOTP obligatoire et session MY. autorisée en `aal2`. La nouvelle migration [20260909184529_phase3a_auth_identity.sql](supabase/migrations/20260909184529_phase3a_auth_identity.sql), **locale uniquement**, crée automatiquement le profil depuis Auth et ajoute une restriction MFA aux 13 tables applicatives. Aucune ancienne migration ni configuration cloud n'a été modifiée.

Le complément Phase 2 fournit les noms français des espèces via un référentiel PokéAPI généré manuellement et destiné au versionnement. Les 1 025 Pokémon locaux ont désormais un nom français, sans changement des 1 213 états de cible ; la seconde application est un noop fonctionnel. La synchronisation du catalogue utilise uniquement ce fichier local et ne contacte jamais PokéAPI.

La maintenance dispose aussi de `catalog:find`, une recherche libre du catalogue local en lecture seule. Son moteur `search-catalog.ts` est portable, sans Node, SQL, réseau ou terminal ; il doit être réutilisé autant que possible pour la future recherche Carte. L'adaptateur `search-catalog-db.ts` utilisant `pg` reste réservé à la maintenance et ne doit pas être importé dans React. Le futur frontend accédera aux données via Supabase/Auth/RLS. Aucune interface de recherche ni API supplémentaire n'est ajoutée.

Chaque variante porte désormais sa date effective nullable et sa provenance persistée. Elle hérite de la date résolue de sa carte lorsqu'aucune date spécifique fiable n'est connue. Le classement Pokémon utilise cette date de variante ; le classement Set reste numéro puis variante. La [correction des dates de variantes](docs/reports/2026-09-08-PHASE2-VARIANT-DATES.md) conserve les preuves de migration du volume local, de stabilité des IDs et d'idempotence.

**Vercel est l'hébergeur frontend retenu pour la V1**, avec Supabase comme backend principal. Vercel n'est pas encore configuré, le dépôt n'y est pas importé et aucun déploiement de production n'est en place.

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

## Organisation du frontend

- `src/app/` : composition de l'application, providers, routes et vue temporaire ;
- `src/services/` : accès aux services, dont la préparation du client Supabase ;
- `src/lib/` : logique et utilitaires partagés, dont la validation d'environnement ;
- `src/types/` : variables Vite et `database.generated.ts`, généré par la CLI Supabase ;
- `src/test/` : configuration commune des tests ; les tests restent à côté du code testé.

`src/features/auth/` contient le provider Auth, son état unique et `useAuth`. `src/components/` accueillera les composants partagés au premier besoin. `main.tsx` se limite au montage React ; le QueryClient reste stable pendant la vie des providers. Les changements Auth purgent son cache pour éviter de conserver des données privées après perte d'accès ou changement de compte.

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

La Site URL locale est `http://localhost:5173`, avec `http://127.0.0.1:5173` également autorisée. Les emails sont capturés par le serveur mail local sur `55324`. Les destinations exactes des écrans seront ajoutées en 3B ; aucune route de callback ou page Auth n'est créée en 3A. Après modification de `config.toml`, redémarrer Supabase avec `supabase:stop` puis `supabase:start`, en conservant les volumes.

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

`db:reset` supprime le catalogue local et ne sert pas à une synchronisation normale. `supabase:stop` conserve le volume importé. La Phase 2, son catalogue et la préparation des préférences sont déjà déployés dans le cloud ; seule la nouvelle migration 3A attend son déploiement contrôlé par le propriétaire.

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
