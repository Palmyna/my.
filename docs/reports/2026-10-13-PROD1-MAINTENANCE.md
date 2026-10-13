# PROD.1 — Maintenance frontend Vercel

## Conclusion et périmètre

**PROD.1 prête pour notre validation manuelle.** Implémentation et preuves locales acquises ; installation/validation Vercel non réalisées. Le dispositif n’est pas déclaré opérationnel sur Vercel. Version du dépôt **`0.8.24`**, PATCH suivant la convention existante ; aucune nouvelle série de versionnement.

Frontend uniquement : aucune modification Supabase, gel backend PROD.2, outillage coordonné PROD.3, assignation automatique des domaines, CI/CD, déploiement, promotion, activation Production, commit ou push.

## Git et fichiers

Initial : `dev`, HEAD `312ff061c7d9783b1b689ab3c45bf7bcdb614895`, worktree propre, version `0.8.23`. Derniers changements pertinents : `312ff06` documentation transversale, `85e04ab` cadrage publication/maintenance, `590d9fb` fallback/version `0.8.23`. Final : même branche et même HEAD, modifications locales non commitées, version `0.8.24`.

| Fichiers | Rôle |
|---|---|
| [middleware.ts](../../middleware.ts) | Lecture serveur cohérente, séparation Production/Preview, fermeture sur défaut et délai de lecture |
| [vercel/maintenance-page.ts](../../vercel/maintenance-page.ts) | HTML/CSS/SVG autonomes, HTTP 503, HEAD sans corps, headers sans cache et indexation |
| [vercel/middleware.test.ts](../../vercel/middleware.test.ts), [vercel/maintenance-page.test.ts](../../vercel/maintenance-page.test.ts) | Contrat HTTP, SDK réel avec transport simulé, absence de bypass, erreurs et autonomie/fidélité du logo |
| [vercel.json](../../vercel.json) | Entrypoint middleware explicite, aucun matcher restrictif ; fallback SPA existant conservé |
| [tsconfig.vercel.json](../../tsconfig.vercel.json), [tsconfig.json](../../tsconfig.json), [vite.config.ts](../../vite.config.ts) | Typecheck serveur Node/Web APIs distinct et projet de tests maintenance |
| [package.json](../../package.json), [package-lock.json](../../package-lock.json) | Dépendances verrouillées et PATCH synchronisé, injection Vite/footer existante |
| [11-PUBLICATION-PRODUCTION.md](../11-PUBLICATION-PRODUCTION.md), [05-ARCHITECTURE.md](../05-ARCHITECTURE.md), [08-ROADMAP.md](../08-ROADMAP.md), [README.md](../../README.md), ce rapport | Procédure manuelle, architecture, statut actuel et preuves ; rapports historiques préservés |

## Architecture et choix

Routing Middleware Vercel Node, configuré par `proxy.entrypoint`, et un Global Config persistant. Aucun framework ajouté. Le store peut conserver deux clés booléennes isolées, `maintenance_production` et `maintenance_preview`, malgré la limite Hobby d’un store total. Seul `false` ouvre ; Production ferme sur défaut. Preview sans connexion reste inchangée ; Preview connectée applique la même règle stricte à sa propre clé. Vite Local ne lance pas le middleware.

Deux dépendances directes : **`@vercel/functions@3.9.11`**, helper officiel `next()` ; **`@vercel/global-config@1.5.1`**, SDK officiel de lecture. Node 24.20.0 compatible avec leurs moteurs. Installation : 21 packages ajoutés au total, dont ces deux directs ; audit npm d’installation sans vulnérabilité. Versions des dépendances préexistantes conservées. Aucun import depuis `src` vers ces SDK, aucune dépendance Vercel incorporée par ce changement dans le bundle React. Le SVG officiel est copié dans la page autonome ; test exact contre le fichier source pour prévenir une divergence sans dépendance au filesystem déployé.

`consistentRead: true` contourne caches/répliques du SDK, `staleIfError: false` interdit l’ancien état comme repli. Latence supérieure assumée pour cette fermeture ; une lecture par requête, assets compris, consomme le quota. Délai de lecture de 3 secondes retourne 503 sans modifier l’item ni ouvrir après une réponse tardive. Lecture SDK non annulable peut finir en arrière-plan. Aucun état ouvert mémorisé, TTL de maintenance, bypass ou minuterie de réouverture.

## Preuves locales

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

## Configuration et validation distantes restantes

Liste exacte et procédures dans [PROD.1 de la référence opérationnelle](../11-PUBLICATION-PRODUCTION.md#prod1--maintenance-frontend-vercel) : plan/quotas, un store, deux booléens initialisés à `false`, schéma, connexion serveur `GLOBAL_CONFIG` par environnement, variables système/`VERCEL_ENV`, maintien All Deployments, tests Preview isolés, inventaire des déploiements et tokens compatibles avec rollback. Ne pas livrer Production avant préparation de la connexion et des clés : défaut Production entraîne 503.

Aucun projet Vercel inspecté ou modifié. Documentation publique consultée par Context7 et directement sur les pages officielles le 13 octobre 2026. Capacités documentées, pas preuves du compte : middleware tout framework avant cache, Node, `Response`, Global Config sans redéploiement ; propagation publiée jusqu’à 10 s, lectures cohérentes à l’origine, quotas Hobby. **Build Vite/typecheck/import natif ne démontrent pas le packaging Vercel**, les paths réservés, le CDN, propagation mondiale, latence ou ordre avec Authentication. Compilation effective et contrat HTTP après passage plateforme doivent être contrôlés sur un vrai Preview puis lors d’une installation Production autorisée. Aucun `vercel build` avec liaison/provisionnement distant exécuté.

Risques restants : quota 100 000 lectures/mois potentiellement atteint avant celui des invocations ; latence des lectures d’origine ; réponse plateforme si panne/suspension avant middleware ; requête déjà engagée avant bascule ; navigateur/onglet possédant déjà le code ; ancien déploiement sans middleware incompatible. **Supabase non gelé par cette page.** Aucun bypass opérateur : contrôles applicatifs en Production pendant fermeture bloqués jusqu’au cadrage/validation serveur de PROD.3. Le workflow complet reste non opérationnel ; PROD.2 non anticipée.
