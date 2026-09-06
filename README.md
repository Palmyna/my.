# MY.

**MY.** est une webapp de gestion de collections de cartes Pokémon TCG.

Le projet s'appuiera sur **TCGdex / cards-database** comme source de référence pour les données Pokémon TCG.

Ce dépôt contient la documentation et le socle applicatif. La documentation reste la source de vérité du projet pour les agents et contributeurs.

## État du projet

**Phase 0 validée ; Phase 1 — Socle PostgreSQL / Supabase implémenté et testé localement.** Trois migrations créent les 12 tables de la V1, leurs contraintes, index, triggers techniques, permissions et policies RLS. Les tests pgTAP vérifient le schéma et les accès. Les types TypeScript sont générés depuis la base locale.

Le frontend affiche toujours uniquement `MY.` et « Application initialisée ». Aucune Auth frontend, RPC fonctionnelle, interface métier ou synchronisation TCGdex n'est implémentée. Aucun catalogue réel n'a été importé. Le projet Supabase cloud n'est ni lié au dépôt ni modifié ; la Phase 1 n'est pas déployée en production et la Phase 2 n'a pas commencé.

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
| `npm run typecheck` | Vérification TypeScript du frontend, des tests et de la configuration Vite |
| `npm run build` | Vérification TypeScript puis build Vite dans `dist/` |
| `npm run preview` | Aperçu local du dernier build |
| `npm run lint` | ESLint, avec analyse TypeScript et zéro avertissement autorisé |
| `npm test` | Tests Vitest exécutés une fois |
| `npm run test:watch` | Tests Vitest en mode interactif |

Les tests utilisent React Testing Library, jest-dom et jsdom. Ils vérifient le rendu initial, les providers, la navigation, la conservation du cache et la préparation de la configuration/client Supabase sans requête réseau.

## Organisation du frontend

- `src/app/` : composition de l'application, providers, routes et vue temporaire ;
- `src/services/` : accès aux services, dont la préparation du client Supabase ;
- `src/lib/` : logique et utilitaires partagés, dont la validation d'environnement ;
- `src/types/` : variables Vite et `database.generated.ts`, généré par la CLI Supabase ;
- `src/test/` : configuration commune des tests ; les tests restent à côté du code testé.

Les dossiers `src/components/` et `src/features/` accueilleront respectivement les composants partagés et les fonctionnalités lors de leur première implémentation. Ils ne sont pas créés vides. `main.tsx` se limite au montage React ; le QueryClient reste stable pendant la vie des providers et conserve les réglages par défaut de TanStack Query.

## Supabase local et variables d'environnement

La CLI Supabase est une dépendance de développement locale. `supabase/config.toml` est versionné et l'initialisation a déjà été effectuée : il n'est pas nécessaire de relancer `supabase init` après un clone. L'identifiant `my-local` distingue uniquement les conteneurs locaux. Le seed et Realtime restent désactivés ; les paramètres Auth générés par la CLI ne constituent pas un cadrage de l'authentification ou de la production.

Pour utiliser les services locaux, démarrer Docker Desktop (avec WSL 2 sous Windows), puis :

```sh
npm run supabase:start
npm run supabase:status
npm run supabase:stop
```

Le premier démarrage télécharge les images Docker. L'arrêt conserve les données locales. Ces commandes ne nécessitent ni connexion au compte Supabase ni lien vers le projet cloud. Docker Desktop et Supabase local ont été vérifiés hors sandbox dans Codex pendant la Phase 1.

Les ports du projet utilisent la plage `5532x` : API `55321`, PostgreSQL `55322`, Studio `55323`, serveur mail de test `55324`, base shadow `55320`, analytics `55327` et pooler éventuel `55329`. Windows réservait notamment la plage `54285–54384`, bloquant le port PostgreSQL initial `54322`. Seule la configuration des ports locaux a été adaptée ; aucune configuration réseau système n'a été modifiée.

Pour une future connexion locale du frontend, copier `.env.example` vers `.env.local`, puis renseigner l'URL locale et la **clé publishable** locale affichées par la CLI :

- `VITE_SUPABASE_URL` ;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

Ces valeurs sont publiques dans le navigateur. N'y placer aucun secret, clé privilégiée, mot de passe PostgreSQL ou token. Redémarrer Vite après modification. Zod valide ces deux valeurs au premier appel explicite à `getSupabaseClient()` ; sans configuration, cette fonction retourne `null`. Le bootstrap ne l'appelle pas et les comportements automatiques de session sont désactivés jusqu'à la phase d'authentification.

Les fichiers `.env` réels, `node_modules/`, `dist/`, les caches et l'état local Supabase sont ignorés par Git. `.env.example`, `supabase/config.toml`, `package-lock.json`, les migrations, les tests SQL et les types générés sont versionnés. Aucun seed applicatif ni Edge Function n'est présent.

## Validation de la base locale

Après `npm ci`, démarrer Docker Desktop, puis exécuter :

```sh
npm run supabase:start
npm run db:reset
npm run db:test
npm run db:lint
npm run db:types
npm run build
npm run lint
npm test
npm run supabase:status
npm run supabase:stop
```

| Commande ajoutée | Usage |
|---|---|
| `npm run db:reset` | Reconstruit entièrement la base **locale**, en supprimant ses données, depuis les migrations |
| `npm run db:test` | Exécute les trois suites pgTAP via `supabase test db --local` |
| `npm run db:lint` | Vérifie `public` et `private`, avec échec dès un avertissement SQL |
| `npm run db:types` | Régénère `src/types/database.generated.ts` depuis `public` local ; le fichier existant est conservé si la CLI échoue |

Les 258 assertions PostgreSQL utilisent uniquement des fixtures synthétiques, annulées à la fin de chaque suite. Elles couvrent les contraintes, l'identifiant public, les suppressions, les grants, la RLS et le durcissement d'Automatic RLS. Le lanceur de tests copie temporairement la migration de durcissement à côté du test pour la rendre accessible au conteneur `pg_prove` ; cette copie ignorée par Git est supprimée après l'exécution. Aucune donnée Auth ou catalogue de test ne constitue un seed applicatif.

La validation Phase 1 a réussi sur PostgreSQL 17 local : reconstruction depuis les migrations, 258 assertions pgTAP, lint SQL sans avertissement, contrôle de sécurité Supabase sans problème signalé et génération CLI des types. Les vérifications frontend restent `build`, `lint` et les 11 tests Vitest.

Les déclarations de types restent celles produites par la CLI ; le script normalise seulement la fin de fichier. Seule la règle ESLint `no-redundant-type-constituents` est désactivée pour ce fichier, car les helpers générés incluent des unions avec les vues actuellement absentes ; la vérification TypeScript et les autres règles restent actives.

Les migrations sont détaillées dans [06-DATABASE.md](docs/06-DATABASE.md). Le profil reçoit automatiquement son identifiant public immuable ; la création du profil lors du signup attend la phase Auth. Les créations automatiques, les modifications d'éléments et la création d'un partage restent fermées à l'écriture directe jusqu'aux opérations contrôlées correspondantes.

Le pipeline, les corrections privées détaillées, les priorités exactes des variantes, la normalisation des numéros et le traitement des dates inconnues attendent la Phase 2. Toute migration cloud fera l'objet d'une étape séparée après review et validation du propriétaire ; aucune commande de lien ou de déploiement distant n'appartient à ce workflow local.

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
