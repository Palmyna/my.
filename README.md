# MY.

**MY.** est une webapp de gestion de collections de cartes Pokémon TCG.

Le projet s'appuiera sur **TCGdex / cards-database** comme source de référence pour les données Pokémon TCG.

Ce dépôt contient la documentation et le socle applicatif. La documentation reste la source de vérité du projet pour les agents et contributeurs.

## État du projet

**Phase 0 — Bootstrap technique initialisé.** L'application affiche uniquement `MY.` et « Application initialisée » sur une page temporaire. Le routage et le provider de cache sont en place ; le client Supabase est préparé sans connexion au démarrage.

Aucune fonctionnalité métier, authentification, migration SQL, table métier, policy RLS, RPC, synchronisation TCGdex ou interface finale n'est implémentée. Le projet Supabase cloud n'est pas lié au dépôt. La Phase 1 n'a pas commencé.

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
- `src/types/` : déclarations partagées, actuellement les variables Vite ;
- `src/test/` : configuration commune des tests ; les tests restent à côté du code testé.

Les dossiers `src/components/` et `src/features/` accueilleront respectivement les composants partagés et les fonctionnalités lors de leur première implémentation. Ils ne sont pas créés vides. `main.tsx` se limite au montage React ; le QueryClient reste stable pendant la vie des providers et conserve les réglages par défaut de TanStack Query.

## Supabase local et variables d'environnement

La CLI Supabase est une dépendance de développement locale. `supabase/config.toml` est versionné et l'initialisation a déjà été effectuée : il n'est pas nécessaire de relancer `supabase init` après un clone. L'identifiant `my-local` distingue uniquement les conteneurs locaux. Le seed est désactivé en Phase 0 et Realtime l'est conformément à l'architecture V1 ; les autres paramètres générés par la CLI restent des valeurs locales par défaut, sans constituer un cadrage de l'authentification ou de la production.

Pour utiliser les services locaux, démarrer Docker Desktop (avec WSL 2 sous Windows), puis :

```sh
npm run supabase:start
npm run supabase:status
npm run supabase:stop
```

Le premier démarrage télécharge les images Docker. L'arrêt conserve les données locales. Ces commandes ne nécessitent ni connexion au compte Supabase ni lien vers le projet cloud. Le démarrage Docker/Supabase reste à vérifier sur la machine du propriétaire ; Docker n'était pas accessible dans l'environnement d'exécution du bootstrap.

Pour une future connexion locale du frontend, copier `.env.example` vers `.env.local`, puis renseigner l'URL locale et la **clé publishable** locale affichées par la CLI :

- `VITE_SUPABASE_URL` ;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

Ces valeurs sont publiques dans le navigateur. N'y placer aucun secret, clé privilégiée, mot de passe PostgreSQL ou token. Redémarrer Vite après modification. Zod valide ces deux valeurs au premier appel explicite à `getSupabaseClient()` ; sans configuration, cette fonction retourne `null`. Le bootstrap ne l'appelle pas et les comportements automatiques de session sont désactivés jusqu'à la phase d'authentification.

Les fichiers `.env` réels, `node_modules/`, `dist/`, les caches et l'état local Supabase sont ignorés par Git. `.env.example`, `supabase/config.toml` et `package-lock.json` doivent être versionnés. Aucun seed, migration métier ou Edge Function n'est présent.

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
