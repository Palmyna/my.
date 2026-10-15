# PROD.1 — Maintenance frontend Vercel

## Conclusion et périmètre

**PROD.1 corrigée localement, nouvelle validation Preview requise.** Le propriétaire signale un premier déploiement Preview `Ready` retournant HTTP 500 : import de `vercel/maintenance-page.ts` introuvable depuis `middleware.js`. Le défaut de packaging est reproduit puis corrigé avec le builder officiel en Local ; le correctif n’a pas été déployé pendant cette intervention. Le dispositif n’est pas déclaré opérationnel sur Vercel. Version du dépôt **`0.8.24`**, inchangée par ce correctif ciblé.

Frontend uniquement : aucune modification Supabase, gel backend PROD.2, outillage coordonné PROD.3, assignation automatique des domaines, CI/CD, déploiement, promotion, activation Production, commit ou push.

## Git et fichiers

Implémentation initiale : `dev`, HEAD `312ff061c7d9783b1b689ab3c45bf7bcdb614895`, worktree propre, version `0.8.23`. Derniers changements pertinents : `312ff06` documentation transversale, `85e04ab` cadrage publication/maintenance, `590d9fb` fallback/version `0.8.23`. Fin de cette implémentation : même branche et même HEAD, modifications locales non commitées, version `0.8.24`.

Correctif packaging du 13 octobre 2026 : `dev`, HEAD réel `6049d4e9ff9612c8abbf7463dcb48c8bc260bc44`, worktree initial propre. Trois fichiers concernés : `middleware.ts`, nouveau `vercel/middleware-packaging.test.ts`, ce rapport. Aucun commit ni push ; version, dépendances du projet et configuration Vercel inchangées.

| Fichiers | Rôle |
|---|---|
| [middleware.ts](../../middleware.ts) | Lecture serveur cohérente, séparation Production/Preview, fermeture sur défaut et délai de lecture |
| [vercel/maintenance-page.ts](../../vercel/maintenance-page.ts) | HTML/CSS/SVG autonomes, HTTP 503, HEAD sans corps, headers sans cache et indexation |
| [vercel/middleware.test.ts](../../vercel/middleware.test.ts), [vercel/maintenance-page.test.ts](../../vercel/maintenance-page.test.ts) | Contrat HTTP, SDK réel avec transport simulé, absence de bypass, erreurs et autonomie/fidélité du logo |
| [vercel/middleware-packaging.test.ts](../../vercel/middleware-packaging.test.ts) | Non-régression : JavaScript émis seul, import et exécution dans un processus Node natif sans résolution Vitest ni sources TypeScript |
| [vercel.json](../../vercel.json) | Entrypoint middleware explicite, aucun matcher restrictif ; fallback SPA existant conservé |
| [tsconfig.vercel.json](../../tsconfig.vercel.json), [tsconfig.json](../../tsconfig.json), [vite.config.ts](../../vite.config.ts) | Typecheck serveur Node/Web APIs distinct et projet de tests maintenance |
| [package.json](../../package.json), [package-lock.json](../../package-lock.json) | Dépendances verrouillées et PATCH synchronisé, injection Vite/footer existante |
| [11-PUBLICATION-PRODUCTION.md](../11-PUBLICATION-PRODUCTION.md), [05-ARCHITECTURE.md](../05-ARCHITECTURE.md), [08-ROADMAP.md](../08-ROADMAP.md), [README.md](../../README.md), ce rapport | Procédure manuelle, architecture, statut actuel et preuves ; rapports historiques préservés |

## Architecture et choix

Routing Middleware Vercel Node, configuré par `proxy.entrypoint`, et un Global Config persistant. Aucun framework ajouté. Le store peut conserver deux clés booléennes isolées, `maintenance_production` et `maintenance_preview`, malgré la limite Hobby d’un store total. Seul `false` ouvre ; Production ferme sur défaut. Preview sans connexion reste inchangée ; Preview connectée applique la même règle stricte à sa propre clé. Vite Local ne lance pas le middleware.

Deux dépendances directes : **`@vercel/functions@3.9.11`**, helper officiel `next()` ; **`@vercel/global-config@1.5.1`**, SDK officiel de lecture. Node 24.20.0 compatible avec leurs moteurs. Installation : 21 packages ajoutés au total, dont ces deux directs ; audit npm d’installation sans vulnérabilité. Versions des dépendances préexistantes conservées. Aucun import depuis `src` vers ces SDK, aucune dépendance Vercel incorporée par ce changement dans le bundle React. Le SVG officiel est copié dans la page autonome ; test exact contre le fichier source pour prévenir une divergence sans dépendance au filesystem déployé.

`consistentRead: true` contourne caches/répliques du SDK, `staleIfError: false` interdit l’ancien état comme repli. Latence supérieure assumée pour cette fermeture ; une lecture par requête, assets compris, consomme le quota. Délai de lecture de 3 secondes retourne 503 sans modifier l’item ni ouvrir après une réponse tardive. Lecture SDK non annulable peut finir en arrière-plan. Aucun état ouvert mémorisé, TTL de maintenance, bypass ou minuterie de réouverture.

## Preuves locales de l’implémentation initiale

| Vérification | Résultat et portée |
|---|---|
| `npm.cmd run typecheck` | Réussi, y compris middleware, page et tests Node/Web APIs |
| `npm.cmd run lint` | Réussi, zéro warning ESLint |
| `npm.cmd test -- --project maintenance` | **60 tests réussis**, 2 fichiers ; SDK réel, `fetch` simulé, aucune lecture Vercel réelle |
| `npm.cmd test -- --maxWorkers=4` | **2 481 réussis, 10 ignorés**, 78 fichiers réussis / 6 ignorés ; intégrations DB opt-in non exécutées |
| `npm.cmd run build` | Réussi, Vite 8.2.2, 396 modules ; avertissement de chunk > 500 kB conservé |
| Import natif Node 24 du middleware | Réussi avec transport synthétique ; continuation normale puis 503 sur `/assets/app.js` |
| Configuration | `proxy` présent dans schéma officiel Vercel actuel ; test du JSON exact et fallback conservé ; versions package/lock cohérentes |
| Navigateur local | Page réellement servie par HTTP 503 avec ses headers ; desktop 1440 × 1000, mobile 390 × 844, largeur 320 px et texte à 200 % sans débordement horizontal après correction |
| Accessibilité locale | Axe 4.12.1 : **0 violation, 0 contrôle incomplet**, desktop/mobile et texte 200 % ; document FR, titre/h1/main, aucun contrôle métier |
| Autonomie locale | Liste des ressources navigateur vide, aucune erreur de page observée ; logo/styles intégrés, aucun script ou appel Supabase |
| Diff | `git diff --check` et inspection finale effectués ; aucune modification de fonction métier ou de fichier Supabase |

Couverture ciblée : fermeture routes directes/fallback/JS/CSS/favicon/robots/API/chemins particuliers, GET/HEAD/POST/OPTIONS, Range/ETag, paramètres/cookies/headers de bypass ignorés, états manquants/non booléens, connexions invalides, environnements inconnus, JSON malformé, HTTP 401/404/429/500/503, erreur réseau, fermeture après un ancien `false`, délai et réponse tardive, état persistant sans réouverture temporelle, isolation Preview et fidélité du logo.

Les messages jsdom « Not implemented: navigation to another Document » proviennent des tests existants ; suite réussie. Aucun test DB nécessaire ou exécuté pour ce changement frontend. Captures/serveur temporaires conservés hors sources suivies ; aucun outillage opérateur ajouté.

## Correctif ciblé du packaging après le premier Preview

### Cause racine et correction

Runtime Logs transmis par le propriétaire : `ERR_MODULE_NOT_FOUND`, URL `file:///var/task/vercel/maintenance-page.ts`, importée depuis `/var/task/middleware.js`. Ce constat distant est fourni par le propriétaire ; aucun accès au projet Cloud pendant le correctif.

L’ancien import explicite `./vercel/maintenance-page.ts` désignait la **source**, alors que le builder Node trace et transpile cette source en `vercel/maintenance-page.js`. Avec le compilateur TypeScript 6.0.3 utilisé ici, l’import `.ts` reste dans le JavaScript émis. Le fichier `.ts` n’est pas embarqué : l’import échoue au chargement du module, avant les gardes et leur réponse 503. Un build `Ready` ne démontre donc pas le démarrage du middleware.

Vitest/Vite résolvaient directement les sources `.ts`. Le typecheck serveur utilise `noEmit`, `moduleResolution: bundler` et `allowImportingTsExtensions`, hérités de `tsconfig.node.json` : il autorisait cet import sans produire ni vérifier le JavaScript exécuté. L’import natif initial sous Node 24 utilisait lui aussi les sources TypeScript présentes. Le build Vite compile la SPA, pas l’artefact Node du middleware. Ces preuves ne reproduisaient pas la disparition des sources après packaging.

Correction dans `middleware.ts` : import de **`./vercel/maintenance-page.js`**. La substitution d’extension TypeScript résout ce nom vers la source `.ts` pour le typecheck ; le builder trace cette source et embarque son `.js`, que Node peut charger. Aucun fichier JavaScript généré ajouté aux sources, aucun `includeFiles`, chemin `/var/task`, bundler supplémentaire, duplication de la page ou changement métier. HTML, headers, séparation des clés, fermeture sécurisée et absence de bypass conservés.

Documentation actuelle consultée via Context7 : [Routing Middleware Vercel](https://vercel.com/docs/routing-middleware), [configuration `proxy`](https://vercel.com/docs/project-configuration/vercel-json#proxy), [builder Node officiel](https://github.com/vercel/vercel/blob/main/packages/node/src/build.ts), [substitution d’extension TypeScript](https://www.typescriptlang.org/docs/handbook/modules/reference.html#file-extension-substitution). Le middleware de cette SPA utilise bien `proxy.entrypoint` et Node, sans configuration Next.js.

### Vérifications du correctif

| Vérification | Résultat et portée |
|---|---|
| Non-régression avant correction | JavaScript seul importé dans Node natif : **échec `ERR_MODULE_NOT_FOUND` identique**, page `.ts` demandée depuis `middleware.js` |
| Non-régression après correction | Réussie ; transpilation sans réécriture des extensions, fichiers locaux `.js` seuls, sous-processus Node avec `--no-experimental-strip-types` ; SDKs installés, transport synthétique |
| Builder officiel `@vercel/node@23.0.1`, ancien import | Artefact généré puis matérialisé hors dépôt : page `.js` incluse, import `.ts` conservé ; chargement natif échoue avec **`ERR_MODULE_NOT_FOUND`** |
| Même builder, import corrigé | **27 fichiers tracés**, dont `vercel/maintenance-page.js` et sa source map ; import `.js`, handler `middleware.js`, middleware Node et route globale `^/.*$` |
| Artefact corrigé exécuté hors dépôt | Réussi sous Node **24.20.0**, sans sources TypeScript ni accès aux dépendances du dépôt : continuation sur `false`, HTTP 503/page MY./headers sur `true`, HEAD vide, clés Production/Preview isolées, Preview non connectée ouverte et Production sans connexion fermée |
| `npm.cmd run typecheck` | Réussi |
| `npm.cmd run lint` | Réussi, zéro warning |
| `npm.cmd test -- --project maintenance` | **61 tests réussis**, 3 fichiers |
| `npm.cmd test -- --maxWorkers=4` | **2 482 réussis, 10 ignorés**, 79 fichiers réussis / 6 ignorés ; intégrations DB opt-in non exécutées |
| `npm.cmd run build` | Réussi, 396 modules ; avertissement préexistant de chunk > 500 kB |
| `git diff --check` | Réussi |

Le builder a été installé uniquement dans `.cache/prod1-packaging/tools`, sans modifier package/lock. Invocation locale de son API en mode middleware Node, installation du projet désactivée, `helpers: false` pour importer directement le handler émis. Les fichiers tracés ont été copiés dans des répertoires temporaires hors dépôt avant exécution ; seuls les appels SDK sont simulés. Scripts, logs et chemins des artefacts sont conservés dans `.cache/prod1-packaging`, hors sources suivies. Le manifeste `.vercel/node/package-manifest.json` créé par le builder a été retiré après vérification.

Le builder résout le `tsconfig.json` racine, pas le projet référencé `tsconfig.vercel.json` utilisé par notre typecheck. Il affiche deux diagnostics **TS2591** sur `process`, non bloquants, avec l’ancien et le nouvel import ; l’ancien affiche également **TS5097**. La compilation et l’exécution de l’artefact corrigé réussissent malgré ces diagnostics. Aucun changement des paramètres de compilation dans ce correctif de résolution.

Cette preuve reproduit le tracing, la transpilation et le chargement Node des dépendances locales avec un builder officiel identifié. **Elle ne constitue pas un `vercel build` complet, ni l’artefact exact du déploiement distant** : version du builder distant, wrapper plateforme, environnement Cloud, Authentication et CDN non contrôlés ici. Aucun provisionnement, liaison Cloud, changement de configuration distante ou déploiement effectué.

### Contrôles obligatoires sur la nouvelle Preview

Conserver All Deployments et réaliser les contrôles avec un accès Vercel autorisé, uniquement sur la clé Preview et des credentials de test isolés :

1. Relever commit et identifiant du nouveau déploiement. Vérifier les Runtime Logs après de vraies requêtes : absence de `ERR_MODULE_NOT_FOUND` et de HTTP 500 de démarrage. `Ready` seul ne suffit pas.
2. `maintenance_preview: false` : `/`, routes directes et refresh `/login`, `/forgot-password`, `/dashboard`, `/index.html`, favicon et vrais JS/CSS accessibles ; fallback normal, aucun 503 maintenance. Sans Supabase Preview, cette preuve reste limitée au frontend attendu.
3. Passer **uniquement** `maintenance_preview` à `true`, sans rebuild : GET et HEAD donnent **503**, page MY. pour GET, HEAD vide, headers sans cache et sans indexation. Tester routes, vrais assets, chemin inconnu, Range/ETag et tentatives de bypass par paramètres/cookies/headers ; aucun ancien 200/304 ne doit contourner la fermeture. Contrôler les headers CDN consommés côté plateforme dans les logs/cache, pas seulement leur visibilité client.
4. Vérifier la page sans ressources externes et l’absence de secrets dans HTML/assets/logs. Contrôler les exceptions de chemins réservés et l’ordre réel avec Authentication sans désactiver la protection.
5. Sur une configuration de test Preview isolée, vérifier erreur de lecture, clé/valeur invalide ou connexion fournie mais invalide : **503**, jamais ouverture ni HTTP 500. Ne pas supprimer la connexion Preview pour simuler une panne : Preview non connectée est volontairement ouverte. Ne pas révoquer de token partagé avec Production.
6. Repasser la clé Preview à `false` : réouverture après les 503, même identifiant de déploiement. Vérifier que la clé Production reste inchangée et que le middleware Preview n’utilise que la clé Preview.

Ces contrôles lèvent le défaut de packaging sur Vercel et valident les comportements Preview correspondants. La campagne complète décrite dans la référence opérationnelle reste requise, dont maintien de fermeture entre déploiements compatibles ; ils ne prouvent ni installation Production, ni rollback Production, ni gel Supabase.

## Configuration et validation distantes restantes

Liste exacte et procédures dans [PROD.1 de la référence opérationnelle](../11-PUBLICATION-PRODUCTION.md#prod1--maintenance-frontend-vercel) : plan/quotas, un store, deux booléens initialisés à `false`, schéma, connexion serveur `GLOBAL_CONFIG` par environnement, variables système/`VERCEL_ENV`, maintien All Deployments, tests Preview isolés, inventaire des déploiements et tokens compatibles avec rollback. Ne pas livrer Production avant préparation de la connexion et des clés : défaut Production entraîne 503.

Aucun projet Vercel inspecté ou modifié. Documentation publique consultée par Context7 et directement sur les pages officielles le 13 octobre 2026. Capacités documentées, pas preuves du compte : middleware tout framework avant cache, Node, `Response`, Global Config sans redéploiement ; propagation publiée jusqu’à 10 s, lectures cohérentes à l’origine, quotas Hobby. **Build Vite/typecheck/import natif ne démontrent pas le packaging Vercel**, les paths réservés, le CDN, propagation mondiale, latence ou ordre avec Authentication. Compilation effective et contrat HTTP après passage plateforme doivent être contrôlés sur un vrai Preview puis lors d’une installation Production autorisée. Aucun `vercel build` avec liaison/provisionnement distant exécuté.

Risques restants : quota 100 000 lectures/mois potentiellement atteint avant celui des invocations ; latence des lectures d’origine ; réponse plateforme si panne/suspension avant middleware ; requête déjà engagée avant bascule ; navigateur/onglet possédant déjà le code ; ancien déploiement sans middleware incompatible. **Supabase non gelé par cette page.** Aucun bypass opérateur : contrôles applicatifs en Production pendant fermeture bloqués jusqu’au cadrage/validation serveur de PROD.3. Le workflow complet reste non opérationnel ; PROD.2 non anticipée.
