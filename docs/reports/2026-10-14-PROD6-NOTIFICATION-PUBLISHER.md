# PROD.6 — Publisher sécurisé des notifications Supabase Cloud

Date : **14 octobre 2026**. Version livrée : **`0.8.29`**.

## Résultat et frontière

**Code, tests réels et procédure d’exploitation livrés.** Le publisher Phase 8 conserve Local et ajoute une cible Cloud explicitement sélectionnée/autorisée, avec secret séparé, TLS CA/chaîne/hostname/socket vérifiés, identité de cluster et rôle réel contrôlés, droits effectifs minimaux et consentement lié au fichier/hash/version. Publication/rejeu/conflit/retrait sous gel démontrés sur Supabase Local ; TLS et pertes de réponse après commit démontrés sur PostgreSQL synthétique jetable.

**Aucun accès Supabase Cloud, secret Cloud réel, provisionnement distant, migration Cloud, publication/retrait Cloud, configuration Vercel/Global Config/GitHub/domaines, commit ou push. Aucun frontend, SQL/migration, type généré, garde PROD.2 ni droit du rôle existant modifié.** Le système hébergé n’est pas déclaré opérationnel : connexion, droits, publication et visibilité réelles restent à vérifier lors d’une intervention autorisée.

## État Git, versions et lecture préalable

| Repère | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `2e7921cb8851449ed637638384214d99533d44e9` | Identique |
| Git | Propre, rien staged | Dix fichiers suivis modifiés et huit nouveaux fichiers, rien staged |
| Package / lock / racine du lock | `0.8.28` / `0.8.28` / `0.8.28` | `0.8.29` / `0.8.29` / `0.8.29` |
| Migrations Local | 50 fichiers / 50 appliquées, dernière `20261013135415` | Identiques, aucune créée/appliquée sur Local personnel |
| Outils | Node `24.20.0`, npm `12.1.0`, Supabase CLI `2.120.0`, PostgreSQL Local `17.6`, pg `8.23.0` | Identiques, aucune dépendance ajoutée |
| Gel Local | Ouvert, révision exacte `120` | Ouvert, révision exacte `139` |
| Secret publisher Local | PASSWORD NULL | PASSWORD NULL après credentials synthétiques temporaires |

Lecture : AGENTS.md, README/versionnement, docs 05/06/08/10/11, rapports Phase 8G.3/8I.2 et PROD.2–5, scripts publisher/contrat/exemples/tests/fixtures, fonctions privées, migrations/gardes PROD.2, tests SQL 034–039, outillage maintenance et conventions secrets/isolation PROD.4/5. État réel Local vérifié, y compris rôle/migrations/gel ; aucune colonne `remote` de `migration list --local` interprétée comme preuve Cloud. Skills Context7 et Supabase appliqués ; aucune délégation.

Conventions : incrément PATCH via `npm.cmd version 0.8.29 --no-git-tag-version`, sans tag/commit ; lock ne change que ses deux champs de version. Documentation courante synchronisée ; rapports historiques intacts.

## Architecture et invariants

[database.ts](../../scripts/notifications/database.ts) possède la connexion/identité/permissions ; [publish.ts](../../scripts/notifications/publish.ts) conserve orchestration CLI et deux appels paramétrés. Contrat [contract.ts](../../scripts/notifications/contract.ts), scalaires SemVer/date et SQL Phase 8 **inchangés**. Exports Local historiques conservés pour les tests et consommateurs existants.

Local : mêmes commandes `--validate`, `--apply --environment local`, `--withdraw --environment local`, même variable `MY_NOTIFICATION_DATABASE_URL`, loopback/port `55322`/base `postgres`, sans paramètres URL ; fragments également refusés. Cloud : fichier JSON fermé non secret, `--environment cloud --project <ref> --target <file> --authorize-cloud-connect`, aucun projet déduit de CLI liée ou frontend. Validation hors connexion reste indépendante des credentials/base.

Cloud direct : hostname exactement `db.<ref>.supabase.co`, login dédié. Cloud Supavisor session : hostname explicite aws/gcp, port `5432`, login routé `my_notification_publisher.<ref>` mais identités PostgreSQL **sans suffixe** exigées. Transaction `6543`, dedicated pooler, URL et identités de substitution refusés. Le mode session est une capacité conditionnelle, aucune compatibilité Supavisor réelle revendiquée.

Contrat métier conservé : `announcement`/`changelog`, dix champs et contexte fermés, normalisation LF/NFC/trim, texte brut/action/audience/expiration stricts, SemVer, `requires_action=false`, hash canonique v1 indépendant de UUID/date/acteur, clé stable, même résultat historique au rejeu, conflit de contenu sans écrasement, retrait définitif sans réactivation. Aucun traitement/lecture utilisateur automatique ou nouvelle notification parallèle.

## TLS, identité et permissions

CA officielle choisie par opérateur, chemin absolu et empreinte SHA-256 de ses octets dans cible. Cloud construit les paramètres séparément, **sans connectionString** ; `sslmode/sslcert/sslkey/sslrootcert/options/ssl` injectés dans cible refusés, toute URL Local héritée bloque. Toute variable `PG*` non vide et `NODE_TLS_REJECT_UNAUTHORIZED=0` bloque avant connexion. Les defaults incidentels du driver ne remplacent donc aucune cible/startup option.

TLS : `rejectUnauthorized:true`, CA explicite, hostname attendu imposé au `checkServerIdentity`, TLS ≥1.2, puis TLSSocket réel autorisé/protocole/peer hostname contrôlés. Aucune option désactivant validation, fallback plaintext ou retry automatique. La liaison TLS contrôlée pour pooler est celle du client ; sa liaison backend et son mode réel restent préconditions Cloud.

Avant écriture : base `postgres`, port serveur `5432`, `session_user=current_user=my_notification_publisher`, LOGIN/limite quatre, NOINHERIT et attributs administratifs faux, zéro membership, réplication origin/READ COMMITTED. Identifiant du cluster via `pg_control_system().system_identifier::text`, comparé exactement à `system_id` examiné ; droit déjà disponible Local. Lecture interdite Cloud → refus, aucun GRANT ni login administratif de substitution.

ACL effectifs (PUBLIC inclus) : CONNECT/USAGE privé nécessaires ; CREATE base/schéma, USAGE Auth, table **ou colonne** public/private/Auth/Storage/migrations, séquence et ownership refusés. Exactement deux EXECUTE public/private, sans GRANT OPTION ; deux fonctions JSONB VOLATILE DEFINER/owner postgres/search_path vide, API roles sans EXECUTE. Aucune lecture directe de données métier pour les contrôles. Fonctions système/PUBLIC historiques non révoquées globalement. Rôle ne peut ni écrire états utilisateur, ni basculer/lire le gel, ni appeler RPC utilisateur, ni modifier permissions.

## Parcours opérateur et secrets

[Commandes complètes PowerShell](../10-NOTIFICATION-PUBLICATION.md#cloud--commandes-powershell-et-autorisations) :

1. Valider fichier hors connexion, conserver clé/hash/métadonnées.
2. Relever cible, CA et cluster indépendamment ; préparer JSON fermé hors Git, sans secret.
3. Avec consentement de connexion, exécuter `--check --expect-version <version>` ; examiner cible, identités, TLS, droits et publication. Aucune écriture.
4. Vérifier **manuellement étape E** : sauvegarde terminée/validée, commit/version réellement servis, maintenance Vercel/gel Supabase effectifs, aucune sauvegarde en cours. Les sorties conservent `deployment_verified=false`, `maintenance_verified=false`, `freeze_verified=false`.
5. Autoriser `--apply --authorize-publish --expect-hash <hash examiné>` sur même cible/fichier/version. Hash/version différents → refus avant connexion. NDJSON `checked`, puis reçu `published` après réponse conforme ; premier résultat seul ne prouve jamais publication.
6. Relire avec compte réel éligible/AAL2, lecteurs centre/compteur/contenu purs, pagination et unicité/UUID/hash/version/corps ; aucun mark/read/process ou bypass frontend.
7. Levée gel puis maintenance seulement après preuves selon docs 11. Retrait : `--withdraw <clé> --authorize-withdraw`, autorisation distincte ; correction par retrait puis nouvelle clé.

[secrets.ps1](../../scripts/notifications/secrets.ps1) reprend saisie masquée SecureString/BSTR/variable de processus temporaire/cleanup PROD.4/5, sans copie DPAPI persistante superflue. Secret jamais argument CLI, URL Cloud, exemple, frontend ou log ; variable supprimée dans wrapper et CLI. Erreurs fixes, aucun objet driver/SQL brut journalisé. Memory/pagefile/crash dump ne bénéficient pas d’une garantie d’effacement physique.

Provisionnement/rotation futurs : rôle existant uniquement, connexion administrative TLS vérifiée distincte, `psql -W`, SCRAM et `\password`; gestionnaire de secrets séparé. Révocation PASSWORD NULL, fermeture explicitement décidée des sessions publisher concernées, nouvelle connexion vérifiée ; changement de mot de passe ne ferme pas sessions/caches pooler existants. Aucune de ces opérations réalisée Cloud ici.

Changelog publiable [0.8.29.json](../../scripts/notifications/releases/0.8.29.json) préparé, sans diffusion : clé `my.release.0.8.29`, catégorie changelog, version `0.8.29`, audience existante, expiration NULL. SHA-256 normalisé **`c982d27302634694d79d9397415162a752dee5a309e0b4505ac636c9ac811189`**. Audience/durée/contexte et déploiement doivent être examinés avant consentement réel ; fichier préparé ne constitue aucune autorisation de publication.

## Tests réellement exécutés

| Validation | Résultat |
|---|---|
| Notifications unitaires sans opt-in DB | **111 tests / deux fichiers PASS**, un test Local ignoré |
| Notifications `MY_SUPABASE_LOCAL_TEST=1 --project notifications --maxWorkers=1` | **112 tests / trois fichiers PASS**, vrais credentials SCRAM/logins publisher, CLI Local, PostgREST et conflits/verrous réels |
| `npm.cmd run notifications:test:isolated` | **20 tests PASS** (19 sous-scénarios et parent), TLS/PostgreSQL et CLI/wrapper Windows réels |
| `npm.cmd run db:test` | **39 fichiers / 3 873 assertions PASS**, dont publication 038 et gel 039 (**83 assertions**) ; parité 1 213 cibles, zéro divergence |
| `node scripts/test-business-write-freeze.js` | **13 groupes PASS**, **98 refus SQL / 78 refus REST**, 22 tables, 15 lecteurs/11 writers ; Auth/TOTP/refresh/Edge réels Local et reprise après ouverture explicite |
| `npm.cmd run maintenance:test` | **5 tests PASS**, contrats opérateur existants |
| `npm.cmd test -- --maxWorkers=2` | **80 fichiers / 2 535 tests PASS**, **six fichiers / dix tests DB opt-in ignorés** ; intégration publisher exécutée séparément ci-dessus |
| `npm.cmd run build` / typecheck / `npm.cmd run lint` | PASS ; 396 modules, warning de chunk >500 kB préexistant |
| `npm.cmd run db:lint` | Aucune erreur SQL public/private |
| Contrôle maintenance installé | **23 gardes / 15 fonctions / permissions / 50 migrations vérifiées**, dernière `20261013135415` |
| Documentation courante et rapport | **Sept fichiers / 505 liens locaux / 95 ancres valides**, syntaxe PowerShell et `git diff --check` sans erreur |

Banc isolé réutilise isolation PROD.5 : Docker local, image installée `17.6.1.166`, source synthétique `--network none`, tmpfs et aucun volume/port Docker publié, proxy hôte loopback uniquement, aucun service/application/audience Production. Cinquante migrations réelles source initialisent cette cible ; aucune restauration de données personnelles. OpenSSL Git Windows crée CA et certificats éphémères ; clé serveur en tmpfs, ressources exactes supprimées par ID/labels après contrôles. Routage fictif du test injecté seulement dans son transport/preloader ; CLI livré ne propose aucun mode de contournement.

Scénarios : CA et hostname corrects acceptés ; mauvais secret SCRAM, cluster, rôle, accès au contrôle système refusés ; manque USAGE/EXECUTE, table/colonne/PUBLIC/séquence/CREATE/ownership, RPC/gel/preparer/GRANT OPTION, memberships et six attributs privilégiés refusés ; contrat DEFINER altéré refusé. Vraies négociations avec mauvaise CA, SAN incorrect, certificat expiré, serveur sans SSL et protocole incompatible refusées, aucun fallback. Login routé qui devient identité PostgreSQL suffixée refusé : simulation d’un pool incompatible, **pas test Supavisor réel**.

CLI Cloud réel sur projet fictif routé vers sandbox : check pur, consentement absent, version/hash incohérents, erreurs/secret assainis, publication/rejeu/retrait durant gel synthétique, wrapper PowerShell inchangé avec entrée synthétique. Deux pertes de réponse : lecture socket suspendue avant appel, connexion indépendante constate **commit réel**, puis socket détruit avant reçu ; reprise sur session fraîche avec même payload/clé/hash retrouve UUID/hash/date ou première date de retrait. Une seule ligne historique et aucune réactivation après retrait.

Sur Supabase Local : vrai publisher sous gel committé, publication/changelog/rejeu identiques, collision `23505`, retrait/retrait répété, lecteurs centre/contenu éligibles et une seule occurrence. Mark/read/process refusés 503, zéro nouvel état. DML, RPC, lecture/bascule gel et escalade rôle refusés `42501`. Campagne PROD.2 complète redémontre barrière, états absents/snapshots anciens refusés, drainage après COMMIT, 503 Edge sans destruction, révocation sessions et reprise effective après décision d’ouverture.

## Conservation Local et écarts documentés

Snapshot initial/final dans `.cache/prod6/`, sans contenu Auth ni secrets exportés : **30 tables** (métier/private, Auth pertinent et migrations). **29 tables de données/historique strictement identiques** en compteurs/hash ; seul singleton du gel change, avec révisions de test `120→139`, statut initial/final ouvert. Aucun reset, réimport, suppression personnelle, recréation de ligne historique ou credential opérateur préexistant ; fixtures réservées/mutex `830011`, cleanup exact, secret remis NULL.

Suite pgTAP globale a consommé **15 valeurs** sur les six séquences catalogue : `automatic_target_states 1659→1666`, `catalog_variants 31996→31997`, `pokemon 1235→1238`, `source_cards 20058→20060`, `tcg_series 110→111`, `tcg_sets 280→281`. Les INSERT de tests rollbackés ne révoquent pas les allocations de séquence. **Aucun rewind/setval/reset pour masquer ces avances**, aucune ligne personnelle touchée. Reprises finales notifications et campagne gel conservent ces six valeurs exactement.

Premier hash de catalogue trop large incluait statistiques `pg_class` et a changé après tests ; il ne prouve donc pas identité de sécurité initiale/finale. Projection corrigée portant owner/ACL/RLS/options, colonnes/fonctions/policies/triggers/rôles/memberships : **identique avant/après campagne finale Local**, avec séquences identiques. Contrat installé PROD.2 et permissions revérifiés ; campagne existante compare aussi tous ACL/owners et comptes préexistants exactement. Aucun fichier SQL ni permission permanente changé.

Échecs intermédiaires du banc corrigés sans assouplir produit : syntaxe de fixture certificat, sélection du helper SQL synthétique tolérant les NOTICE, vrai chemin `hba_file` (ancien fichier non utilisé ne prouvait pas SCRAM), signature complète de RPC et code EPROTO, environnement OS du wrapper Windows. Dernier banc teste le vrai SCRAM/refus et réussit intégralement. Lint final ajoute type exact du compteur d’état ; aucun contrat modifié. Correction du snapshot explique sa limite, sans réécrire les preuves initiales.

## Fichiers livrés

Modifiés : README, docs 05/06/08/10/11, package.json/package-lock.json, scripts/notifications/publish.ts et publication.local.test.ts.

Créés :

- [database.ts](../../scripts/notifications/database.ts) : connexion Local/Cloud et vérifications.
- [cloud.test.ts](../../scripts/notifications/cloud.test.ts) : contrat cible/consentements/versions/hashes/secrets/options.
- [cloud.integration.js](../../scripts/notifications/cloud.integration.js) : TLS/PostgreSQL/CLI/sécurité/commit incertain réels isolés.
- [test-fixtures.ts](../../scripts/notifications/test-fixtures.ts) : SCRAM synthétique partagé.
- [secrets.ps1](../../scripts/notifications/secrets.ps1) : saisie Windows et nettoyage.
- [cloud-target.json](../../scripts/notifications/examples/cloud-target.json) : exemple sans secret ni projet réel.
- [0.8.29.json](../../scripts/notifications/releases/0.8.29.json) : changelog préparé, non publié.
- Ce rapport.

Sources existantes PROD.1/2/3/4/5, frontend, migrations, contrat JSON Phase 8 et types générés inchangés ; helpers d’isolation test PROD.5 réutilisés sans modification.

## Mise en service future et limites

Autorisation distante distincte requise : confirmer projet/DNS/réseau/CA et cluster, état du rôle réel sans nouveau grant, SCRAM et restrictions réseau, accès de lecture system_id, session Supavisor et ses liaisons/cache si nécessaire. Si un précontrôle refuse, arrêter et cadrer ; pas de compte privilégié de substitution ni certificat non vérifié.

Installer/éprouver gel Cloud selon PROD.2, maintenance/déploiement servis et moyens protégés selon docs 11, vraie sauvegarde terminée/éprouvée, coordination des exceptions. Publier seulement le changelog métier autorisé après ces preuves ; vérifier lecture AAL2 éligible, présence/version/hash/contenu et unicité, sans état utilisateur modifié, avant réouverture. Une fixture synthétique n’est jamais une audience isolée Cloud.

Non démontré : connexion/authentification/TLS/cluster/ACL du projet hébergé, Supavisor réel et sa liaison backend, gel installé/effectif Cloud, nouvelle version réellement servie Vercel pendant maintenance, publication/retrait/visibilité Cloud, propagation mondiale et répétition coordonnée complète. Tests browser hébergés et revue des secrets réels restent futurs ; aucune promesse Cloud tirée des succès Local/isolés.

## Sources officielles actuelles

Context7 résolu puis interrogé pour Supabase, node-postgres et PostgreSQL 17 ; changelog Supabase public consulté le 14 octobre et driver installé inspecté (priorités connectionString/SSL/PG*). Documentation décrit les mécanismes, aucune observation des projets MY. :

- [Supabase connexion directe/session/TLS](https://supabase.com/docs/guides/database/connecting-to-postgres), [psql/CA verify-full](https://supabase.com/docs/guides/database/psql), [routage rôle/projet](https://supabase.com/docs/guides/troubleshooting/tenant-or-user-not-found), [changelog](https://supabase.com/changelog).
- [node-postgres TLS et override de l’objet SSL](https://node-postgres.com/features/ssl), [Client](https://node-postgres.com/apis/client).
- [PostgreSQL identité/fonctions/privilèges](https://www.postgresql.org/docs/17/functions-info.html), [membership/SET ROLE](https://www.postgresql.org/docs/17/role-membership.html), [SCRAM](https://www.postgresql.org/docs/17/auth-password.html), [psql/password](https://www.postgresql.org/docs/17/app-psql.html).
