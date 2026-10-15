# PROD.7B.2 — Contrôle sécurisé du frontend avant réouverture

Contrôle effectué le **15 octobre 2026** ; nom de fichier du 14 octobre conservé selon la demande. Version examinée : **`0.8.30`**. Investigation, tests et documentation uniquement.

## Verdict et décision nécessaire

**T1 reste bloquant pour le critère E actuel.** Aucun moyen existant examiné ne permet de charger le nouveau frontend Production hébergé pendant `maintenance_production=true`. Le middleware ne reconnaît aucune identité opérateur. Une session Vercel autorisée, un lien partagé ou un bypass de Deployment Protection ne modifie pas son résultat.

**Recommandation : conserver PROD.1 et soumettre au propriétaire une validation préalable par exécution isolée de l’artefact Production exact**, suivie des contrôles hébergés obligatoires après réouverture. Cette option réduit la surface de sécurité et réutiliserait les sorties du build et le serveur de prévisualisation existant. Elle **modifie le niveau de preuve exigé avant E** : elle n’est ni adoptée ni livrée ici. La récupération complète de l’artefact du build Git doit encore être éprouvée sur le compte Hobby ; son existence ne découle pas de la possibilité d’en consulter les sorties.

Si le propriétaire maintient l’exigence d’un frontend **réellement servi par Vercel avant E**, une exception opérateur temporaire vérifiée côté serveur nécessite une décision de sécurité et un cadrage complémentaire. Aucune exception, authentification parallèle, dépendance, pipeline ou modification du middleware n’est introduite. PROD.7B.3 et PROD.7C ne sont pas commencées.

La demande impose explicitement cet arrêt lorsqu’une décision de sécurité ou de périmètre est nécessaire. L’[audit PROD.7A, contrôles opérateur](2026-10-14-PROD7A-PUBLICATION-AUDIT.md#contrôles-opérateur-sous-http-503) exige également la validation propriétaire avant de substituer une preuve isolée au critère actuel. Aucun GO, promotion, publication ou réouverture ne résulte de ce rapport.

## État Git et périmètre réel

| Repère | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `cac9c4b088470547fd62e66502f3d362a1444f16` | Identique |
| `git status --short` | Vide, aucun changement staged | `docs/11-PUBLICATION-PRODUCTION.md` et `vercel/middleware.test.ts` modifiés ; présent rapport non suivi ; aucun changement staged |
| Package / lockfile / racine du lockfile | `0.8.30` / `0.8.30` / `0.8.30` | Identiques |
| Node / Vite | `24.20.0` / `8.2.2` | Identiques |

Lecture des instructions [AGENTS.md](../../AGENTS.md), rapports [PROD.7A](2026-10-14-PROD7A-PUBLICATION-AUDIT.md), [PROD.7B.1](2026-10-14-PROD7B1-NATIVE-BACKUP-TRANSPORT.md) et [PROD.1](2026-10-13-PROD1-MAINTENANCE.md), procédure [11](../11-PUBLICATION-PRODUCTION.md), version/convention, middleware/page/configuration/tests, outil `maintenance:http`, configuration Vite, routes, client/configuration Supabase et parcours ciblés ci-dessous. La réussite native Windows PROD.7B.1 reste une preuve historique de sauvegarde synthétique ; elle n’apporte aucune preuve de frontend.

Aucun accès aux projets Supabase Cloud, SQL Local, volume personnel, Docker, GitHub ou projet Vercel ; aucune migration, capture, restauration, notification ou modification distante. Consultation de documentation Vercel publique uniquement. L’inventaire navigateur disponible retourne zéro navigateur/onglet ; aucune session dashboard exploitable n’est fournie. CLI `vercel` non trouvée dans le PATH et aucun cache `.vercel/` présent. Aucun token recherché dans les fichiers privés, aucune CLI installée, aucun `vercel pull`, `fetch` Git, commit ou push.

**Identité du déploiement Production exact : non acquise.** Aucun deployment ID, SHA distant, build distant ou environnement Vercel réel n’est présenté comme identifié. Le SHA du worktree et sa version ne sont pas ceux d’un déploiement distant présumé. Les réglages confirmés par le propriétaire dans PROD.7A restent attribués à ce rapport, sans revérification. Les incohérences historiques de configuration déjà signalées dans la documentation courante ne sont pas corrigées dans cette sous-phase.

## Comportement et invariants constatés

1. [vercel.json](../../vercel.json) configure `proxy.entrypoint=middleware.ts`, sans exclusion, puis le fallback SPA. Le middleware intervient avant le service normal des fichiers.
2. [middleware.ts](../../middleware.ts) choisit la clé par `VERCEL_ENV` serveur, indépendamment du hostname, des paramètres, cookies et headers entrants. Production en attente et Production courante utilisent donc `maintenance_production`.
3. Seul le booléen `false` continue. `true`, état invalide, erreur ou deadline de lecture renvoient la [page autonome](../../vercel/maintenance-page.ts), HTTP 503 avec protections de cache et HEAD vide. Le frontend et sa version ne sont pas chargés par cette page.
4. Vercel Authentication contrôle l’admission plateforme. Son succès conduit ensuite au middleware ; il ne constitue pas une autorisation de traverser PROD.1. Un visiteur sans accès Vercel peut recevoir la réponse Authentication avant MY. : cela n’est pas une mesure du 503 MY.
5. [Vite](../../vite.config.ts) remplace `__APP_VERSION__` depuis `package.json`. Le [footer](../../src/app/SiteFooter.tsx) affiche cette valeur, sans SHA ni deployment ID. Une version seule ne distingue pas deux builds de même version.
6. Les deux variables `VITE_SUPABASE_*` utilisées par [la configuration](../../src/lib/env.ts) sont publiques et incorporées au build. Changer les variables du serveur de prévisualisation ne redirige pas un bundle Production existant vers Local. Les remplacer dans le JavaScript ou reconstruire produirait un autre artefact.

Le gel PROD.2 et les protections RLS/Auth/MFA/PostgreSQL restent indépendants. Aucun accès frontend spécial ne pourrait autoriser les mutations pendant le gel. Login, refresh ou certains traitements Auth peuvent avoir des effets même si les mutations métier sont gelées ; ils ne deviennent pas des contrôles sans effet par simple utilisation du frontend.

## Documentation officielle actuelle

Documentation obtenue via Context7 (`/websites/vercel`, puis `/vitejs/vite`), confrontée aux pages officielles publiques Vercel et à son OpenAPI le 15 octobre 2026. Les pages `.md` ont été conservées dans le cache ignoré `.cache/prod7b2/docs/`. Échec TLS initial de Node corrigé par `NODE_USE_SYSTEM_CA=1`, sans désactiver la vérification TLS.

| Source officielle | Capacité documentée et limite pour MY. |
|---|---|
| [Staging et promotion](https://vercel.com/docs/deployments/promoting-a-deployment) | Désactiver l’assignation automatique conserve un build Production en attente ; promotion de ce build sans rebuild. Promouvoir un Preview suit un autre chemin avec reconstruction. Aucun de ces gestes ne supprime le middleware |
| [Environnements](https://vercel.com/docs/deployments/environments) — résultat Context7 | Build Production en attente avec variables Production, accessible par URL générée ; ses tests peuvent atteindre les services et données Production |
| [Inspection du build](https://vercel.com/docs/deployments/troubleshoot-a-build) | `Build Logs`, `Resources` pour fonctions/middleware/assets et `Source` pour sorties du build, également mentionné via `/_src`. Inspection de sorties, pas exécution du frontend. Accès effectif et récupération complète non éprouvés ici ; aucun chemin MY. n’est exempté |
| [List Deployment Files](https://vercel.com/docs/rest-api/deployments/list-deployment-files) | `GET /v6/deployments/{id}/files` décrit l’arborescence des **sources** ; disponibilité de cette arborescence précisée pour créations CLI/API avec `files`. Pas une promesse d’export complet des sorties d’un build Git |
| [Get Deployment File Contents](https://vercel.com/docs/rest-api/deployments/get-deployment-file-contents) | `GET /v8/deployments/{id}/files/{fileId}`, contenu base64 et paramètre `path` pour Git. Ne pas assimiler ce contrat à une archive portable de tout le build. OpenAPI public examiné : aucun export complet des sorties identifié parmi ces endpoints |
| [Build Output API](https://vercel.com/docs/build-output-api), [vercel build](https://vercel.com/docs/cli/build), [vercel pull](https://vercel.com/docs/cli/pull) | `.vercel/output` décrit les fichiers à produire/déployer ; `build` les construit localement, `pull` télécharge réglages et variables. Ces commandes ne téléchargent pas l’artefact exact déjà construit à distance |
| [Deployment Protection](https://vercel.com/docs/deployment-protection), [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) | Authentication et portée **All Deployments** disponibles sur Hobby, sans add-on payant. Admission requise aussi pour atteindre Routing Middleware. Aucune identité opérateur applicative vérifiable fournie par le simple succès de cette admission |
| [Routing Middleware](https://vercel.com/docs/routing-middleware), [Hobby](https://vercel.com/docs/plans/hobby) | Middleware disponible sur tous les plans et exécuté avant cache. Aucune dispense Hobby pour les URLs générées. Password Protection payant/non disponible Hobby et Trusted IPs Enterprise ne constituent pas une solution retenue |
| [Vite : environnement](https://vite.dev/guide/env-and-mode), [CLI](https://vite.dev/guide/cli) | Variables `VITE_*` exposées au client et remplacées au build ; environnement processus prioritaire sur `.env`. `vite preview` sert un build local, sans reproduire plateforme Vercel, Authentication, CDN ou Global Config |

La possibilité de consulter `Source` ne démontre ni l’export intégral ni sa disponibilité exacte dans le compte MY. Une API privée du dashboard, un scraping des sorties ou une récupération du corps d’un 503 ne sont pas retenus comme chaîne d’acquisition validée.

## Quatre niveaux de preuve distincts

| Niveau | Preuve exigée | Résultat de cette sous-phase |
|---|---|---|
| **1 — Build et artefact identifiés** | Déploiement précis `Ready`, Production, SHA attendu, configuration effective et inventaire des sorties/version | **Build local réussi seulement**, rattaché au HEAD local ; aucun build Vercel identifié |
| **2 — Artefact exact exécuté en isolation** | Octets du déploiement identifié récupérés sans rebuild, intégrité vérifiée, exécution protégée et parcours explicités | **Non démontré.** Aucun artefact distant acquis et aucune exécution navigateur de ce bundle. Tests des sources et artefact Node local ne valent pas ce niveau |
| **3 — Nouveau frontend servi dans l’environnement hébergé** | Navigation réelle du nouveau build Vercel, version affichée, routes/assets et intégration observées sur cible exacte | **Non réalisé.** Le code actuel renvoie 503 sous fermeture. Inspection dashboard ou Source ne remplace pas la navigation |
| **4 — Parcours utilisateur complet après réouverture** | Domaine/version, Auth/MFA/redirections/emails pertinents, lectures, mutations légitimes, notification et reprise | **Non réalisé.** Gel et maintenance ne sont pas levés ; aucun accès Cloud dans cette phase |

La promotion et le rattachement d’un domaine ne prouvent pas à eux seuls le niveau 3. Un ancien onglet peut exécuter l’ancien bundle. Les tests de sources utilisent leurs mocks et ne prouvent pas l’exécution du JavaScript minifié distant.

## Solutions examinées

| Option | Protection, coût et preuve possible | Conclusion |
|---|---|---|
| Dashboard, logs, ressources et version injectée | Lecture opérateur ; pas de nouveau service ni coût payant identifié. Niveau 1 si l’identité et les sorties sont effectivement relevées | Nécessaire, insuffisant pour le critère E actuel |
| URL générée Production en attente, alias, domaine après promotion | Même environnement Production et même clé. Authentication d’abord, puis 503 MY. ; pas de changement Global Config | Ne résout pas T1, même avec accès plateforme valide |
| Preview existant sans variables Production | Protégé par Vercel ; peut contrôler shell et comportement maintenance Preview | Autre build/environnement, backend incomplet. Aucun ajout de credentials Production ni promotion Preview pour résoudre T1 |
| Reconstruction locale au même SHA ou `vercel build --prod` | Build local possible, mais réglages/variables/outils peuvent différer ; `pull` peut aussi exporter des secrets serveur | Autre artefact tant qu’égalité complète non établie ; ne pas confondre reproductibilité supposée et correspondance démontrée |
| **A — Sorties Production exactes, exécutées isolément** | Maintient le 503 pour tous, aucune exception serveur, pas d’offre payante nécessaire pour un contrôle sur poste. Acquisition complète encore à prouver. Niveau 2 possible, jamais niveau 3 | **Option recommandée sous réserve de décision sur le critère et de faisabilité effective de l’acquisition** |
| Autre hébergement/projet de contrôle, nouveau pipeline prebuilt | Nouveau déploiement, configuration et protection à garantir ; possible duplication de secrets. Un prebuilt pourrait fixer les octets en changeant le workflow Git actuel | Complexité disproportionnée et changements distants hors périmètre ; pas retenu |
| **B — Accès opérateur temporaire vérifié côté serveur** | Peut viser niveau 3 tout en refusant utilisateurs ordinaires ; développement, revue de sécurité, transport d’identité et tests hébergés requis. Pas de dépendance payante intrinsèque identifiée | Décision sécurité obligatoire ; aucun mécanisme fiable existant identifié dans MY. et aucune implémentation ici |

Ni paramètre, cookie libre, header déclaratif, exception de domaine/chemin, suppression de clé, ni `maintenance_production=false` temporaire ne constitue une option acceptable. Aucun mécanisme de contournement permanent n’est proposé.

### Conditions concrètes de l’option A, si elle est acceptée

Avant tout contrôle, relever dans une intervention de lecture autorisée : équipe/projet, deployment ID immuable et URL propre au déploiement, environnement **Production**, statut, SHA final du merge sur `main`, package/lock correspondants et version attendue. Relever configuration effective : framework, root/output directory, commande install/build, Node/package manager et éventuels overrides. Dans le dépôt : React/Vite, commande `npm run build` incluant typecheck et sortie Vite par défaut `dist/` ; cela ne prouve aucun réglage distant. Relever les noms/scopes des variables nécessaires sans exporter les secrets serveur.

L’acquisition doit provenir des sorties de **ce deployment ID**, via accès autorisé et effectivement éprouvé. Conserver la relation entre acquisition, ID, SHA et inventaire complet des chemins, tailles et SHA-256. Inclure HTML, JS/CSS principaux et différés, images et polices. Un fichier de hashes fourni avec un dossier arbitraire ne prouve pas sa provenance. Une version trouvée dans un fichier isolé ne prouve pas qu’il est référencé et exécuté par le HTML attendu.

Rejeter identité/environnement/SHA/version non concordants, export incomplet, asset absent ou supplémentaire inexpliqué, hash différent, bundle obsolète ou dossier d’un autre deployment ID. Ne pas accepter un rebuild à la place et ne pas ignorer un écart « parce que la version est identique ». Les tests négatifs d’un éventuel vérificateur restent à écrire après choix du chemin d’acquisition ; aucun tel vérificateur n’est livré ici.

Servir les fichiers inchangés depuis un dossier protégé sur poste de confiance, lié à `127.0.0.1`, sans exposition LAN/tunnel, avec navigateur au profil neuf et restriction des sorties réseau. Ne copier aucun token Vercel/Global Config, clé privilégiée Supabase, session personnelle ou secret serveur. L’accès local est réservé au poste et à son utilisateur de confiance ; le seul nom `localhost` ne constitue pas une protection contre un autre processus du même compte.

Réutiliser `vite preview` pour le service statique **seulement après vérification de son outDir**, ou le service statique déjà maîtrisé. Ce service n’émule pas le middleware Vercel. Le middleware reste intact dans le vrai déploiement fermé. Les mécanismes de restriction réseau du banc doivent être définis avant d’exécuter un bundle incorporant les URLs Production ; le gel métier seul ne suffit pas à rendre ses appels sans effet.

Sans accès au backend réel, le contrôle peut éprouver chargement du shell, version effectivement affichée, CSS/polices/images, chunks différés, routes/fallback, rendu et erreurs JavaScript. Les écrans authentifiés nécessitent un backend isolé approprié ou des réponses synthétiques explicitement identifiées comme simulations ; le banc actuel Vitest teste les sources, pas automatiquement le bundle exporté. Ne pas modifier les octets pour remplacer les variables Production par celles de Local. Aucun besoin démontré d’un nouveau service ou pipeline.

Compatibilité backend : contrats/décodeurs et reprise idempotente se testent localement avec fixtures/mocks existants ; une campagne isolée adaptée peut compléter SQL/Auth. La compatibilité du **Cloud migré réel**, de ses ACL, redirections, MFA, Edge et audiences reste une autre preuve, à établir dans une intervention autorisée. Sous gel, privilégier lecteurs purs, reçus, catalogue et notifications éligibles sans marquer lu/traité. Mutations et parcours complets restent obligatoires après réouverture. Aucun de ces contrôles Cloud n’a été exécuté ici.

La promotion doit viser ensuite **le même deployment ID Production**, sans rebuild. Après promotion, relire affectation des domaines et identité, puis vérifier 503 sur les origins inventoriés avec l’outil HTTP existant. Ces relevés ne suffisent toujours pas au niveau 3.

### Frontières de l’option B, si le critère hébergé est maintenu

Un header indiquant un nom, l’existence d’un cookie Vercel ou un secret partagé de bypass ne prouve pas l’identité opérateur. Aucune assertion d’identité Vercel consommable et vérifiable par le middleware MY. n’a été établie dans les sources consultées. Ne pas en inventer une.

Il faudrait réutiliser une identité existante, avec preuve vérifiée **côté serveur** : émetteur et audience attendus, signature, validité, sujet immuable et autorisation opérateur explicite ; si identité MY., MFA/AAL2 et état courant respectés. Une identité authentifiée ordinaire ne doit jamais suffire. L’activation doit être limitée au déploiement autorisé et dans le temps, révocable, avec retrait prévu ; erreur, expiration, état inconnu ou dépendance indisponible doivent conserver le refus.

Le frontend MY. actuel conserve sa session dans le client Supabase ; la navigation HTML/assets n’apporte pas spontanément cette preuve au middleware. Transport/bootstrap, portée des ressources, révocation et protection contre rejeu/CSRF doivent donc être cadrés avant implémentation. Un cookie éventuellement délivré ne pourrait être une valeur libre : sa validation serveur et son lien à l’autorisation seraient indispensables. Ce rapport n’adopte ni nouveau cookie ni endpoint public.

Aucune modification RLS, Auth/MFA, gel ou permissions ne serait autorisée par le choix B. Aucune exception publique de domaine ou chemin. Tests indispensables : identité absente/forgée/ordinaire/AAL1/expirée/révoquée, mauvaise cible, erreur serveur, accès à tous les assets nécessaires, maintien des 503 ordinaires et expiration effective. Une solution nécessitant une authentification parallèle ou un service tiers doit être réexaminée pour nécessité ; elle n’est pas autorisée par ce rapport.

## Tests et preuves effectivement exécutés

| Vérification | Résultat et portée |
|---|---|
| Git, instructions, trois versions via Node | Branche/HEAD/arbre initial confirmés ; versions `0.8.30` cohérentes |
| `npm.cmd exec vitest -- run --project maintenance` | **64/64 PASS après ajout de trois cas** : domaine, URL générée et alias synthétiques restent 503 en `production`, clé Production lue malgré headers/cookie d’accès prétendu. Autres cas PROD.1 : méthodes/HEAD, assets/routes, erreurs, deadline, absence de contournement, états et Preview |
| Artefact Node du test packaging existant | Exécuté dans la campagne précédente : JavaScript émis localement, sous-processus Node sans sources TS, SDK réseau simulé. **Pas l’artefact Vercel distant**, ni un frontend exécuté en navigateur |
| `node --test scripts/maintenance/operator.test.js` | **5/5 PASS**, dont HTTP simulé, refus 401/redirection/503 générique/headers absents, snippet sous session normale et absence de secret dans diagnostics. Aucun backend connecté |
| Vitest frontend ciblé, neuf fichiers | **223/223 PASS** : footer/version, routes et barrières Auth, auth-store, centre de notifications, preview/dialog/application/reprise de mise à jour, configuration et client Supabase. Services/mocks synthétiques, aucun compte ni donnée réelle |
| `npm.cmd run build -- --outDir .cache/prod7b2/local-dist` | **PASS**, typecheck inclus, Vite `8.2.2`, neuf fichiers produits. Les deux variables Supabase sont explicitement vides dans l’environnement enfant ; valeurs privilégiées remplacées par sentinelles synthétiques. Aucun contact Supabase. Avertissement habituel de chunk >500 kB ; avertissement Node du lanceur temporaire `shell:true` avec arguments fixes |
| Inspection du build local | Version `0.8.30` présente dans le JS principal et références JS/CSS de l’index présentes. Inventaire chemins/tailles/SHA-256 généré en cache ; provenance = HEAD local, pas Vercel. HTML SHA-256 `8d69b181acadb372bd6edb5448f842587e91032787fe2fb2cd8e6a429779dd8b`, JS principal `e0d166fbf7de005206b16a8bf4cb48b64668278730776676aeb9dd24ef609163` |
| Secrets du build local | Aucune des trois valeurs sentinelles Global Config/Vercel/service role dans les neuf fichiers ; aucun bloc clé privée ni valeur `sb_secret_` longue détectée. Le préfixe littéral `sb_secret_` existe dans le SDK comme test de format : premier scan trop large refusé, contexte inspecté, contrôle des valeurs complètes ensuite réussi. Ni certification exhaustive de secrets ni inspection du bundle distant |
| `npm.cmd run maintenance:http -- --print-browser --expect closed` | Génération hors connexion réussie ; aucune requête hébergée. Vérifie HTTP/HTML, pas version frontend ni déploiement global |
| `npm.cmd run lint`, `npm.cmd run typecheck`, `git diff --check` | **PASS** après ajout des tests ; zéro avertissement ESLint. 53 cibles de liens locaux des deux documents vérifiées ; aucune modification fonctionnelle |

Commande frontend ciblée :

```powershell
npm.cmd exec vitest -- run --project frontend src/app/SiteFooter.test.tsx src/app/AppRoutes.test.tsx src/features/auth/auth-store.test.ts src/features/notifications/NotificationCenter.test.tsx src/features/collections/CollectionUpdatePreview.test.tsx src/features/collections/CollectionUpdateDialog.test.tsx src/features/collections/useCollectionUpdateMutation.test.tsx src/lib/env.test.ts src/services/supabase.test.ts
```

Le build local a été lancé avec `VITE_SUPABASE_URL=''` et `VITE_SUPABASE_PUBLISHABLE_KEY=''`, prioritaires sur les fichiers `.env`. Les trois valeurs serveur étaient synthétiques, sans lecture des vrais secrets. Détails temporaires ignorés : `.cache/prod7b2/local-dist/` et `local-build-evidence.json`. Ils ne constituent pas un nouvel outil livré ni une archive de publication.

**Non exécutés :** acquisition d’un artefact Vercel ; comparaison/rejet d’un artefact distant différent ou obsolète ; export et refus d’accès réel du dashboard ; exécution isolée du frontend distant ; navigateur du build local ; refus hébergés, CDN/Global Config réel, Auth/MFA/REST/SQL/Edge Cloud, promotion sans rebuild réelle, parcours après réouverture. Aucun nouveau mécanisme d’autorisation ou vérificateur d’artefact n’est livré. Les tests de refus existants prouvent uniquement leurs frontières simulées/locales.

Pas de campagne complète npm, DB ou sauvegarde/restauration : aucun changement applicatif, SQL ou d’outillage correspondant. Supabase Local personnel n’a fait l’objet d’aucun accès, reset, fixture, arrêt ou modification. Aucun effet sur ses données ou sur Cloud produit par les commandes de cette phase.

## Effets sur la procédure A–E

| Étape | État actuel et effet d’une future décision |
|---|---|
| **A — Préparation** | Conserver version/commit et contrats ; préparer l’identité du futur SHA de merge et critères de refus d’artefact. Aucun incrément PATCH : tests et documentation seuls |
| **B — Fermeture** | Inchangée : 503 MY. après admission Vercel, inventaire des URLs/assets, gel/drainage indépendants. Aucun changement Global Config pour tester |
| **C — Capture** | Inchangée ; aucune capture ou récupération autorisée par ce rapport |
| **D — Build et promotion** | Exiger build Production exact, backend vérifié et identité du SHA final de merge. Option A acceptée : acquisition/exécution isolée de ce build avant sa promotion, puis promotion du même ID sans rebuild et relecture d’assignation/503. Ce chemin n’est pas encore opérationnel |
| **E — Notification et réouverture** | **Critère actuel conservé et bloquant.** Option A nécessiterait décision explicite remplaçant la preuve applicative hébergée avant E par niveau 2 + contrôles backend distincts et report des contrôles hébergés au point de réouverture. Consigner le risque de découvrir alors une anomalie de domaine/CDN/Auth/intégration. Option B viserait niveau 3 avant E, après conception approuvée et preuve réelle. Publication/visibilité, consentement et ordre backend puis frontend restent inchangés |

Après réouverture, dans les deux options : domaine et version affichée du build identifié, chargement et refresh directs, assets/chunks différés, Auth/MFA et redirections, lectures catalogue/collections, mutation légitime autorisée et relecture, notification éligible/non dupliquée et reprise exacte des opérations Phase 8. Pas de nouvelle opération aveugle, ni traitement automatique de notification pour obtenir une preuve. Une anomalie impose arrêt et décision opérateur selon la reprise existante ; aucune refermeture ou réouverture automatique ajoutée.

La [documentation courante](../11-PUBLICATION-PRODUCTION.md#contrôles-opérateur-et-campagne-réelle-restante) reçoit seulement le résultat et le lien vers cette décision. Les critères E, rapports historiques, ordre macro de roadmap et version restent inchangés.

## Conditions de résolution de T1

**Aujourd’hui : `T1_resolved=false`.**

- **Voie A recommandée :** acceptation explicite du changement de niveau de preuve avant E ; récupération complète autorisée de l’artefact exact réellement démontrée sur Hobby ; liaison deployment ID/SHA/config/version et intégrité, refus des artefacts incorrects éprouvés ; exécution isolée protégée avec contrôles suffisants et limites backend explicites ; fermeture hébergée ordinaire vérifiée ; même ID promu sans rebuild ; contrôles hébergés après réouverture inscrits comme obligatoires. Une acceptation seule ne prouve ni faisabilité ni résolution technique.
- **Voie B si niveau 3 maintenu :** conception temporaire serveur et autorisation approuvées ; implémentation minimale séparément autorisée ; refus ordinaires et erreurs démontrés ; vrai nouveau frontend servi et contrôlé sous maintenance dans un environnement hébergé autorisé. Identité du build, gel et promotion sans rebuild conservés. Aucun test local seul ne ferme T1.

**Décision à prendre avant toute implémentation : accepter la voie A et sa modification explicite du critère E, sous réserve d’en éprouver l’acquisition ; ou maintenir le niveau 3 et demander le cadrage de sécurité de la voie B.** Jusqu’à cette décision et aux preuves correspondantes, maintien du blocage T1.
