# AUTO.2 — Pilotage sécurisé de la maintenance Vercel

Date : **16 octobre 2026**. Branche `dev`, HEAD initial `443f6c3` (`AUTO.1`), worktree initial propre ; HEAD conservé. Version package/lock/racine **`0.8.33` conservée**, comme AUTO.1 pour cet outillage opérateur sans changement applicatif. Aucune dépendance ajoutée, aucun commit/push.

## Livraison et frontières

CLI Windows `maintenance:vercel` : **`preflight`, `close`, `reopen`**, cible stricte hors Git, projet `my`, domaine `my.collectrealm.com`, identifiants exacts projet/équipe/store et slug examinés. Lecture des métadonnées du projet, protection `All Deployments`, liaison Production `GLOBAL_CONFIG.edgeConfigId`, domaine vérifié et store propriétaire. États booléens `true`/`false`, valeur absente/invalide et état inconnu séparés. Source `preflight` bornée par deux lectures des métadonnées du store ; empreinte liée à la cible et à sa version, sans publication des autres valeurs.

Connexion autorisée par `--authorize-vercel-connect` ; fermeture par `--authorize-close`, ouverture par **`--authorize-reopen` distinct**. Les deux actions exigent `--expect-checkpoint` et **`--confirm-exclusive-writer`**. Aucun PATCH si l'état demandé est déjà satisfait ; ancienne empreinte refusée même dans ce cas. Écriture fixe, un seul item `operation=update`, clé `maintenance_production`. Pas de réparation/upsert d'une clé absente/invalide. Accusé API explicitement intermédiaire ; nouveaux GET obligatoires pour confirmer l'état et l'absence de changement observable des autres items et métadonnées de la clé.

Verrou fichier local exclusif par équipe/store, nonce/PID/date sans credential, indépendant du fichier de cible. Marqueur conservé après toute erreur d'action ou interruption, sans expiration, récupération par PID ni suppression automatique. Arrêt forcé sans sortie finale = inconnu. Reprise : coordination des writers, nouvelle lecture indépendante, examen du processus/marqueur exact, suppression manuelle de ce seul fichier après vérifications, nouvelle lecture et décision explicite. Une fermeture appliquée dont l'accusé a été perdu reprend sans nouveau PATCH. Jamais de toggle inverse ou automatique, ni action Supabase.

Secrets : wrapper Windows reprenant le transport volatil AUTO.1, `Read-Host -AsSecureString`, variable enfant temporaire, consommation par Node avant Git, nettoyage BSTR/environnement. Copie persistante uniquement dans le gestionnaire approuvé. Cible JSON sans credential, chemins absolus hors dépôt, API HTTPS fixe, redirects refusés, TLS conservé, timeouts couvrant fetch et corps, réponses bornées. Erreurs brutes et contenus d'autres clés jamais retournés ; diagnostics fixes, NDJSON et état inconnu sur incertitude.

**Aucune opération sur le vrai Vercel, aucun credential réel consulté, aucune requête HTTP sur la Production. Aucun accès/bascule Supabase Cloud, backup, publication, déploiement, commit ou push.** Middleware, page de maintenance, Preview, SSO, domaines, variables, déploiements et contrats PROD.1/2/3/4/5/6 inchangés. Ni `prod:backup` ni `prod:open` implémentés. Selon le propriétaire dans la demande AUTO.2, la maintenance Production est active ; aucune attestation distante ajoutée par ce travail.

## Décision API et concurrence

Documentation fournisseur actuelle consultée via Context7, puis OpenAPI/docs publiques et source CLI Vercel officielle :

- [Global Config REST API](https://vercel.com/docs/global-config/vercel-api), [OpenAPI courant](https://openapi.vercel.sh/), [PATCH items](https://vercel.com/docs/rest-api/global-config/update-global-config-items-in-batch).
- [Tokens et scopes](https://vercel.com/docs/accounts/access-tokens), [RBAC](https://vercel.com/docs/rbac/access-roles), [implémentation CLI officielle du PATCH](https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/global-config/update.ts).

Le token API opérateur permet le plan de contrôle ; le read token du middleware n'est pas supposé capable d'écrire. Scope minimal réellement compatible à examiner ; aucune création de token ou extension de droits. Les tokens projet refusent les ressources d'équipe selon Vercel ; leur compatibilité Global Config n'est donc pas présumée. Aucun droit fournisseur limité à cette seule clé n'est établi ici : restriction portée par le moteur.

**Aucune précondition atomique CAS/If-Match documentée** dans le PATCH retenu, malgré les statuts 409/412 décrits sans précondition correspondante. Aucun header ou comportement inventé. Le propriétaire a explicitement choisi pendant AUTO.2 : **« Oui, exclusivité opérateur obligatoire »**. Les autres consoles, opérateurs et automates doivent donc être exclus durant toute l'opération. Verrou local et empreintes détectent la concurrence observable mais ne couvrent pas un autre poste ou une écriture distante dans l'intervalle lecture–PATCH ; une réécriture distante de même valeur peut rester indétectable. Le moteur ne prétend pas fournir une transaction distribuée ni un CAS distant. AUTO.3 doit conserver ce prérequis et cette limite.

## Fichiers concernés

| Fichier | Changement |
|---|---|
| `scripts/maintenance/vercel.js` | Cible, transport API borné, lecture, verrou, autorisations, PATCH fixe, idempotence, relecture et sorties assainies |
| `scripts/maintenance/vercel-cli.js` | Parsing strict, secret consommé, identité dépôt AUTO.1 réutilisée, commandes/NDJSON et signaux |
| `scripts/maintenance/vercel-secrets.ps1` | Saisie protégée Windows sans stockage persistant ni secret dans argv |
| `scripts/maintenance/examples/vercel-target.json` | Modèle sans secret, placeholders volontairement bloquants |
| `scripts/maintenance/vercel.test.js` | Mocks qui refusent les endpoints non reconnus avant DNS ; tests moteur, CLI/processus et wrapper Windows |
| `package.json` | Scripts `maintenance:vercel` et `maintenance:vercel:test` |
| `docs/11-PUBLICATION-PRODUCTION.md` | Commandes exactes, initialisation minimale, credentials, concurrence, états, reprise, HTTP et interfaces AUTO.3 |
| `README.md`, `docs/05-ARCHITECTURE.md`, `docs/08-ROADMAP.md` | Livraison et limites opérationnelles cohérentes, phases majeures conservées |
| Ce rapport | Preuves et limites AUTO.2 |

## Validations

| Contrôle | Résultat |
|---|---|
| `npm.cmd run maintenance:vercel:test` | **45 tests réussis**, aucun ignoré |
| `npm.cmd run maintenance:test` | **7 tests réussis** |
| `npm.cmd test -- --project maintenance` | **3 fichiers, 65 tests réussis** ; middleware, page et packaging Node existants préservés |
| `npm.cmd run typecheck` | Réussi |
| `npm.cmd run lint` | Réussi, zéro warning |
| `git diff --check`, versions et liens locaux modifiés | Réussis |

Scénarios AUTO.2 : lecture active/inactive/invalide/absente, cible stricte, mauvais projet/équipe/protection/liaison/domaine/store, credentials invalides et TLS désactivé refusés, consentements absents/inversés, fermeture/réouverture explicites et idempotentes, 401/403 en lecture et écriture, 302/409/412/429/500 API, réseau/JSON/corps excessif, fetch et lecture de corps suspendus, ancienne empreinte, changement pendant lecture et juste avant PATCH, opérateurs locaux concurrents, changement Preview/autre clé détecté sans tentative de correction, relecture contradictoire/indisponible, accusé perdu, timeout après application simulée, signal géré et arrêt forcé d'un vrai processus CLI après application simulée, reprise explicite idempotente. Wrapper PowerShell réellement exécuté avec **token synthétique**, saisie simulée sans token dans argv/sorties. Aucun transport de test sélectionnable par la CLI Production.

Première passe : 36/39 tests réussis, trois défauts propres au harness corrigés (`t.mock.env` absent du Node installé et chemins Windows `--import` nécessitant `file:`). Aucun assouplissement des contrôles Production. Passe finale élargie : 45/45. Le diagnostic fixe `config_unavailable` du test middleware est attendu. Les répétitions PostgreSQL/TLS, backup/restauration, frontend complet et Cloud ne sont pas relancées : leurs moteurs ne changent pas.

## Prérequis réels, HTTP et AUTO.3

Avant toute future intervention autorisée : fournir IDs/slug réels indépendamment vérifiés, liaison Production identifiable par `edgeConfigId`, token API avec droits réels et scope minimal compatible, poste/vault protégés, HTTPS/CA valide et exclusivité de tous les writers établie. Rien de cela n'est validé sur le vrai service ici. Une liaison manuelle dépourvue de métadonnée identifiable bloque ; aucun déchiffrement de variable ou changement d'architecture automatique.

Vercel Authentication reste **All Deployments**. Un accès anonyme 302 SSO ne permet aucune conclusion sur le middleware. HTTP authentifié non automatisé : réutiliser la session Vercel normale et le générateur PROD.3 `maintenance:http`, ou Network si la CSP interdit fetch. Séparer valeur Global Config, 503 réellement servi par MY., artefact/commit/version, propagation et couverture de chaque déploiement. Les sorties gardent `middleware_http=not_observed_requires_normal_authenticated_request`, `deployment_coverage=not_attested`, `worldwide_propagation_verified=false`, `global_closure=not_attested`, `backup_authorized=false`. Ces preuves et T1 restent à traiter indépendamment ; aucun GO Production déduit des mocks.

AUTO.3 peut réutiliser **`createVercelMaintenance(...).preflight()` / `.setMaintenance(action, consent, emit)`**, `readTarget`, `operatorLockPath`, `unknownResult` et `safeDiagnostic`, ou le `parseCommand`/`run` NDJSON de la CLI. Pour Supabase : **`scripts/maintenance/cli.js` `parseCommand`/`run` AUTO.1**, sans recopier barrière SQL, CAS de révision, TLS, identité ni autorisations. Les moteurs restent indépendants ; AUTO.3 devra coordonner conditions de fermeture, preuves HTTP/drainage, sauvegarde et conditions E avec arrêts sur inconnu, sans déléguer à AUTO.2 la levée du gel.
