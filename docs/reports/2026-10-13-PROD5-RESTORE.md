# PROD.5 — Restauration isolée et validation de récupération

Date : **13 octobre 2026**. Version livrée : **`0.8.28`**.

## Verdict et portée

**Critère synthétique atteint.** Une vraie archive du moteur PROD.4, avec données synthétiques et Auth/TOTP réel, est authentifiée puis restaurée sur une destination PostgreSQL neuve indépendante. Contenus, identifiants, séquences, objets et sécurité concordent à la borne ; parcours SQL métier et GoTrue restaurés éprouvés. Aucun format parallèle, dépendance, migration métier ou modification de RPC/garde.

**Récupération Production non démontrée.** Aucun accès Supabase Cloud, backup réel Production, restore Cloud, reset/écriture du Local personnel, déploiement, réglage distant, Global Config, PR, commit ou push. Aucun PROD.6. Première installation Cloud PROD.2 reste une intervention manuelle ultérieure. Frontend/Edge/SMTP et tous services managés Cloud ne sont pas certifiés par ces tests.

PROD.4 conserve `capture_integrity_verified`, `restore_proven=false`, `publication_authorized=false`. PROD.3 conserve `backup_authorized=false`. Rapport PROD.5 séparé : `postgresql_restored=true`, `data_verified=true`, **`application_recovery_proven=false`, `production_recovery_proven=false`, `publication_authorized=false`** ; les preuves applicatives partielles sont détaillées ci-dessous.

Référence opérateur : [12-SUPABASE-BACKUP.md](../12-SUPABASE-BACKUP.md#prod5--architecture-et-frontières-de-restauration). Ordre et autres préconditions : [11-PUBLICATION-PRODUCTION.md](../11-PUBLICATION-PRODUCTION.md#prod5--restauration-isolée).

## Git, version et conservation Local

| Élément | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `79d98b7c688587f67979db234ce8980f08312bcd` | Identique |
| `git status --short` | Vide | 13 fichiers suivis modifiés, 7 fichiers créés ; changements PROD.5 non committés |
| Package / lockfile / entrée racine du lock | `0.8.27` | `0.8.28`, PATCH via `npm.cmd version 0.8.28 --no-git-tag-version` |
| Historique Local personnel | 50 migrations, dernière `20261013135415` | Identique ; aucune migration ajoutée/appliquée |
| Gel Local personnel | false, révision exacte `120` | false, même révision, horodatage et identité `postgres` |
| Gardes / fonctions / permissions PROD.2 Local | 23 / 15 / vérifiées | Identiques |

Préparation : AGENTS, documents 05/06/08/10/11/12 et rapports PROD.2/3/4 examinés ; scripts backup/maintenance, migrations, Auth et contrats Phase 8 suivis dans le code réel. Les anciens relevés restent historiques ; aucun état Cloud déduit d'un relevé Local.

Deux transactions **REPEATABLE READ READ ONLY** sur Local personnel établissent l'égalité exacte des empreintes de **27 tables** : 23 public/private dont singleton de gel, `auth.users`, `auth.identities`, `auth.mfa_factors` et historique des migrations. Six séquences catalogue et sécurité (rôles, ACL, fonctions, triggers et policies) identiques. Preuves sans contenu Auth brut dans `.cache/prod5/personal-before.json` et `personal-after.json`. Les journaux/sessions techniques Auth ne sont pas couverts par cette empreinte ; aucune égalité physique du volume n'est revendiquée.

Conteneur personnel conservé : `acf4abb00b3dda1eb225d9fc2fca787da56502f7c9906c07459c7d3e89ca579e`, volume nommé `supabase_db_my-local`. Seulement lectures de précontrôle/empreintes et inspection de ses métadonnées. Pas de dump, setval/nextval, fixture, bascule, manipulation de compte, copie de volume ou reset sur ce conteneur. Tous essais DB/Auth/restores utilisent leurs propres ressources jetables. Aucune commande Docker de suppression de volume/prune.

## Architecture réellement éprouvée

Source : `my-prod4-test-<12 hex>`, migrations versionnées et fixtures Phase 8 réservées, données complémentaires synthétiques. Destination : `my-prod5-restore-<12 hex>`, `initdb` neuf dans le même paquet PostgreSQL, mêmes locale/versions. Des destinations supplémentaires distinctes servent les échecs et le CLI réel. Tous IDs PostgreSQL source/destination différents et contrôlés.

Image PostgreSQL déjà installée : `public.ecr.aws/supabase/postgres:17.6.1.166`, digest **`sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86`**. GoTrue **2.197.0**, image déjà installée, digest **`sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b`**. PostgreSQL/client 17.6, Node 24.20.0, npm 12.1.0 ; aucun pull ou upgrade du Local personnel.

Isolation finale : **`--network none`**, aucun port Docker publié, aucune interface externe/route/passerelle ; clients PG par stdin Docker et boucle locale. GoTrue partage uniquement le namespace de son PostgreSQL (`--network container:<ID>`) et écoute loopback ; proxy HTTP de test uniquement sur `127.0.0.1`, port éphémère, aucune route extérieure. SMTP loopback port 1 fermé, emails `.invalid`, aucune Edge/provider/intégration sortante. Destination read-only, UID/GID PostgreSQL, `cap-drop=ALL`, no-new-privileges, tmpfs données et `/tmp`, aucun volume/bind. Source image initialisée dans ses propres tmpfs ; son bootstrap utilise les capacités normales nécessaires à l'entrypoint, sans mode privileged.

Sélection fermée lie nom, ID, nonce de labels, digest, `network_id=null`, transport/base/user/majeure et `system_id` exact. Moteur Docker local exigé ; env Docker/PG incidental non transmis aux clients natifs. Bootstrap `supabase_admin` éphémère nécessaire pour préserver les grantors PostgreSQL OID 10 ; jamais créé sur une base existante. Supabase réservé/custom distingués, liste fermée et aucun password source recréé. Nettoyage vérifie identité/montages/namespace et absence de services du nonce avant suppression du seul ID. Ressources exactes de diagnostics intermédiaires également supprimées, aucun nettoyage global.

Ordre : preflight hors DB ; identité/vide/versions ; claim privé non réutilisable ; rôles/attributs/memberships/GUC ; schémas/owners et versions/owners d'extensions ; restore natif en transaction unique ; ACL plateforme ; comparaisons indépendantes. Détails et commandes [dans la procédure](../12-SUPABASE-BACKUP.md#ordre-et-adaptations-postgresql).

Deux différences réelles expliquent l'adaptation : `pg_dump` n'impose ni owner ni version d'extension ; certains grants Supabase d'initialisation de schémas (`pg_init_privs`, notamment `graphql`) sont absents du dump. Seules créations SCHEMA/EXTENSION sont réalisées explicitement puis retirées de la TOC, aucune donnée/FK/trigger/policy/ACL filtrée. Schémas/DB reçoivent leurs ACL authentifiées et leurs droits effectifs sont comparés. Rôles restaurés avec ADMIN/INHERIT/SET/grantor et GUC exacts ; valeurs de listes et unités scalaires traitées sans changement silencieux. Pas d'édition du catalogue système.

## Archive, contenu et matrice de contrôles

Archive réelle produite par `capture` PROD.4 : `database.dump.myb`, `inventory.json.myb`, `external.json.myb`, `evidence.json.myb`, `source.tar.myb`, `toc.txt.myb`, `manifest.myb`. AES-256-GCM/MYBK0001, checksums SHA-256 ciphertext et manifeste authentifié conservés. Inventaire enrichi de champs v1 sous le même snapshot : hashes de contenu de toutes les tables, schémas/colonnes, DB ACL, vues/event triggers et contenu des large objects. Format des fichiers et du manifeste inchangé.

Archive custom figée en mémoire après intégrité et GCM, seconde inspection des mêmes octets, puis stdin `pg_restore --single-transaction --exit-on-error --no-password --dbname=postgres --use-list=<TOC tmpfs>`. Aucun SQL/archive en clair écrit sur disque hôte. TOC privée sur tmpfs supprimée ; tampering ultérieur du dossier ne remplace pas les octets sélectionnés. Borne de mode : 512 MiB chiffrés par artefact ; coût mémoire des hashes SQL et des large objects à examiner pour un grand jeu. Pas de promesse d'effacement physique RAM/tmpfs/pagefile/crash dumps.

| Contrôle à la borne | Source | Destination et preuve |
|---|---|---|
| Tables de données | **55**, **243 lignes** agrégées ; 23 tables MY. public/private | Compteurs **et SHA-256 des multiensembles de lignes** identiques, tables vides incluses |
| Identifiants/contenus | UUID réservés, Pokémon `9007199254740993`, variante `9007199254740997`, révision/reçu `9007199254740993` | Valeurs exactes, SQL hash sans décodage BIGINT en number ; insertion Pokémon légitime alloue **`9007199254741000`** sans réutilisation |
| Catalogue | Pokémon/séries/sets/cartes/variantes/liens/états canoniques, fixtures existantes | Identité/contenu comparés ; status/preview/apply cohérents avec catalogue restauré |
| Comptes/collections | Auth/profils, collections v1/v2, items/masques/positions/rangs, exemplaires/préférences/override/partage | Chaque table comparée ; propriété/RLS, propriétaire/partagé/tiers/AAL1 vérifiés directement |
| Phase 8 | Journal non vide ; vrais reçus hide/reorder, dont BIGINT non sûr | Contenu exact ; lecture de reçu gelé, replay même UUID après ouverture, apply token frais + replay et un seul reçu |
| Notifications | Vraie publication par rôle publisher, état read/processed et lecture collection | Tables exactes ; centre autorisé, publication/hash/replay sous gel, accès direct et bascule publisher refusés |
| Séquences | **8**, incluant Auth et sonde technique ; 6 catalogue | Valeur/is_called, incrément/cache/bornes/cycle égaux ; prochain ID contrôlé pour chaque colonne possédée ; source figée aux bornes PROD.4 |
| Fonctions | **76**, dont sonde de délai non métier | Définitions/signatures/owners/ACL comparés ; 15 fonctions protégées PROD.2 revérifiées |
| Policies | **53** | Définitions/RLS/owners/ACL et default privileges concordants ; refus effectifs également exercés |
| Autres objets | Colonnes/defaults/identités, vues, contraintes/FK/index, triggers/event triggers, schemas, rôles/memberships/GUC, extensions | Comparaison de toutes les lignes inventoriées, avec ACL effectifs normalisés |
| Migrations | **50**, noms/versions et vrais statements source versionnés | Même table avec fingerprint de son contenu, préfixe dépôt et contrat PROD.2 contrôlés ; aucune migration rejouée pendant restore |
| Large object PostgreSQL | Un objet synthétique avec owner/grants et contenu hashé | Identité/ACL/SHA du contenu restaurés ; distinct des blobs Storage externes |
| Gel sauvegardé | true, révision `1`, borne/changement opérateur exacts | Même état après CLI ; 23 gardes et droits vérifiés. Tests ouvrent uniquement cette cible explicitement, puis referment |
| Storage/Vault | 0 bucket/objet, 0 secret Vault | Même état SQL ; aucune preuve de copie de blobs ou de portabilité d'une racine Vault utilisée |

Les 55 tables comprennent schémas plateforme, historiques et sonde `prod5_probe` de 20 lignes. Sa contrainte temporisée donne une fenêtre **observée** de COPY pour annuler un vrai processus/connexion ; aucun RPC MY. modifié. Le petit jeu ne mesure pas la performance du catalogue personnel ou Cloud. Tables Auth non peuplées/SSO/WebAuthn et autres configurations externes ne constituent pas des parcours éprouvés.

`source.tar` reste l'archive du HEAD, selon PROD.4. Les tests autorisent explicitement un worktree synthétique dirty ; migrations source inchangées par cette tâche, 50 fichiers appliqués depuis leurs versions réelles. Une capture Cloud reste conditionnée à source Git propre/committée : aucune extrapolation de ce mode synthétique vers Production, aucune certification générale des anciens statements historiques Cloud.

Anciennes archives v1 sans champs enrichis : `backup verify` reste disponible ; restore automatisé refuse `restore_legacy_inventory_requires_reference`. Ne pas reconstruire des hashes depuis une destination après sinistre ni éditer le manifeste. Adaptation/référence indépendante examinée nécessaire, ou nouvelle capture autorisée si source encore disponible. Limitation annoncée ; aucun backup Production existant traité ici.

## Auth, MFA et compatibilité réellement éprouvées

1. **Présence dans l'archive** : GoTrue source réel crée compte, identité, bcrypt, TOTP vérifié **chiffré par une clé séparée**, session/challenge/AMR/refresh. Capture complète après arrêt explicite du service source ; hashes SQL et contraintes assurent une seule borne.
2. **Relations SQL restaurées** : mêmes données/UUID, FK, historique Auth et triggers MY. ; profil conservé et absence d'orphelins profil→Auth. Permissions restaurées, aucun password PostgreSQL des rôles source importé.
3. **Utilisation par service restauré** : même GoTrue 2.197.0, clés de chiffrement/signature synthétiques conservées en mémoire séparée ; login password, **TOTP original sans nouvel enrôlement**, AAL2 et refresh réussis. Pendant gel : nouvelles créations/destructions Auth Admin **503** ; compte/profil original conservé. Après décision d'ouverture isolée : nouveau compte confirmé/profil créé puis destruction et cleanup MY. réussis.

Dépendances négatives réelles : clé de déchiffrement absente → login **500** car facteur chiffré illisible ; mauvaise signature réappliquée → token conservé **403**. Données SQL seules ne permettent donc pas d'annoncer Auth/MFA récupérés. Ces codes correspondent à GoTrue **2.197.0** de ce test, sans réécrire les preuves historiques 2.196.0 de PROD.2.

SQL métier : vraies sessions PostgreSQL `authenticator`, rôles authenticated/service_role, claims AAL2 synthétiques pour les fixtures réservées ; lecteurs catalogue/collections/notifications/preview/reçus, refus tiers/AAL1 et write freeze, replay du même UUID, apply avec token frais, unicité du reçu, préférence persistée. Vrai login publisher sur la destination avec secret éphémère réintroduit explicitement après constat password NULL ; deux fonctions seulement, aucun accès direct/bascule, publication/replay/hash validés sous gel. Ces probes ne sont pas un test PostgREST/browser MY. complet.

Reste non éprouvé : React→Data API→Edge complet, handler `delete-account` et sa reauth/révocation dans cette stack, emails Resend/SMTP/redirections, providers/SSO/WebAuthn/autres facteurs, secrets Cloud réellement disponibles après sinistre, Vault utilisé, blobs Storage et services managés. Versions/config/URLs/signature/déchiffrement doivent être reprovisionnées et vérifiées indépendamment. Rotation de signature impose souvent réauthentification ; clé MFA perdue peut nécessiter récupération administrative et nouvel enrôlement. Le test avec clés disponibles ne résout pas leur indisponibilité potentielle chez Supabase.

## Tests et défaillances

| Validation finale | Résultat |
|---|---|
| `npm.cmd run restore:test` | **4 tests réussis**, CLI/autorisation/cibles fermées, rôles et GCM en mémoire |
| `npm.cmd run restore:test:isolated` | **29 tests réussis** : 6 tests PROD.4 réutilisés, 22 sous-scénarios et parent ; moteur + CLI réels + DPAPI |
| SQL existant `039_business_write_freeze.test.sql` sur destination | **83 assertions réussies**, ouverture explicite dans transaction de test puis rollback, aucune garde modifiée |
| `npm.cmd run backup:test` | **6 tests réussis** |
| `npm.cmd run backup:test:isolated` | **15 tests réussis**, dont snapshot partagé/UPDATE Auth exclue, séquences non-MVCC, échec pg_dump réel et wrapper DPAPI |
| `npm.cmd run maintenance:test` | **5 tests réussis**, résultats conservateurs PROD.3 préservés |
| `npm.cmd test -- --maxWorkers=2` | **79 fichiers / 2 482 tests réussis**, **6 fichiers / 10 tests DB opt-in ignorés** ; ces opt-in ne sont pas revendiqués exécutés |
| Typecheck / lint / build | Réussis ; **396 modules**, warning de chunk >500 kB préexistant |
| Versions/JSON/PowerShell/diff/liens | Trois versions `0.8.28`, schémas JSON fermés, vrais wrappers DPAPI Backup/Restore, contrôles finaux sans erreur |
| Conservation Local | 27 empreintes de tables, six séquences, sécurité et gel identiques ; ressources jetables finales supprimées |

Défaillances exercées et refusées : mauvaise clé ; manifeste modifié ; dump modifié/tronqué/checksum incorrect ; fichier manquant/INCOMPLETE ; mauvaise version serveur/extension ; rôle omis ; mauvais system_id/cible personnelle/autorisation/manifest SHA ; destination non vide ou déjà restaurée ; vrai conflit pendant pg_restore ; rôle publisher supprimé avant post-data ; backend PostgreSQL terminé **pendant COPY/PgSleep observé** ; processus Docker natif interrompu et annulation ciblée ; permissions insuffisantes et privilège de contrôle élargi dans transaction rollbackée ; données modifiées après parcours métier refusent la certification de la borne ; mauvaise clé externe et dépendance MFA absente.

Échecs natifs : objets/données du restore transactionnel rollbackés, schémas/extensions/rôles/claim préparés subsistent. Cette cible partielle est refusée pour reprise. Stop brutal non traité peut laisser commit inconnu : aucun résultat positif déduit, lecture indépendante puis nouvelle destination après destruction explicite. Les fichiers de rapport distinguent étape native terminée et validation des données ; aucun signal ne lève le gel/maintenance Production. Des échecs intermédiaires ont corrigé bootstrap grantor, ACL d'initialisation, GUC de listes/unités, transport source test, socket psql et codes Auth de version ; aucune protection métier assouplie.

## Durées, RTO et RPO

Dernier passage sur isolation finale sans réseau : **capture 4,188 s**, **restore + préparation/ACL/comparaison 4,298 s**, test du **second CLI avec création cible 8,410 s**, suite **69,506 s**, nettoyage inclus. Borne du snapshot de cet essai : **`2026-10-13T20:42:18.734Z`**, liée à son manifeste/rapport ; gel source committé à `2026-10-13T20:42:17.034326+00:00`. Mesures précédentes sous charge des tests frontend : restore 5,613 s, suite 89,166 s, topologie intermédiaire avec bridge interne ; elles ne remplacent pas la mesure `--network none`.

Ni RTO Production ni RPO réel mesurés. Temps dépend de volume/hashes/mémoire, compression/AES, Docker/CPU/disque, disponibilité des versions/extensions/images/clés, index/FK, Auth migrations et validations externes/opérateur. Les 0,6 s environ de délai synthétique COPY sont inclus. Snapshot DB est la borne de perte logique possible ; toute écriture/receipt/notification postérieure peut manquer. Emails/révocations/tokens clients/configuration externe ont leurs bornes distinctes. Séquences hors MVCC/caches ne constituent pas une récupération transactionnelle d'effets extérieurs. Ne pas promettre un délai fixe de reprise à partir de ce petit jeu.

## Fichiers et commandes opérateur

Créés :

- [isolated.js](../../scripts/backup/isolated.js) : création, identité réelle, transport/cleanup sans réseau ou volume personnel.
- [restore.js](../../scripts/backup/restore.js) : preflight figé, sélection/consentement, étapes, native restore, rapport et interruption.
- [restore-database.js](../../scripts/backup/restore-database.js) : rôles/owners/extensions/ACL et comparaison indépendante.
- [restore-fixtures.js](../../scripts/backup/restore-fixtures.js) : seules données/services synthétiques et GoTrue de test.
- [restore.test.js](../../scripts/backup/restore.test.js), [restore.integration.js](../../scripts/backup/restore.integration.js) : frontières et parcours réels/défaillances.
- Ce rapport.

Modifiés : `scripts/backup/cli.js` (schéma de manifeste exporté, transport réservé au synthétique), `database.js` (inventaire/hash), `clients.js` (transport/diagnostics), `secure-files.js` (octets authentifiés avant consommation), `secrets.ps1` (Tool Restore, défaut Backup conservé), `package.json`/`package-lock.json` (PATCH et scripts), README, docs 05/06/08/11/12. Aucun frontend, config Vercel/Supabase, SQL migration/type généré, Edge, publisher ou script maintenance modifié.

Modes opérateur : `preflight` hors connexion DB, `create --authorize-create` sur nom/image/cible choisis, `inspect` sans écriture, `execute --authorize-isolated-restore --expect-manifest-sha256 <empreinte examinée>` avec rapport neuf, `destroy --authorize-destroy` après conservation du rapport/arrêt des seuls services de l'essai. [PowerShell/DPAPI complet](../12-SUPABASE-BACKUP.md#windows--powershell--commandes-isolées). Aucune commande de restauration Cloud livrée.

## Portabilité démontrée et préconditions futures

**Démontré** : PostgreSQL **17.6** ordinaire initialisé à neuf avec paquets d'extensions de l'image Supabase sélectionnée, mêmes locale/versions/owners ; schémas SQL plateforme + MY. restaurés avec fidélité constatée ; GoTrue 2.197.0 et TOTP synthétique avec clés correspondantes. Extensions exactes et rôle bootstrap sont des dépendances du test, pas une certification sur n'importe quel cluster PostgreSQL ou instance Supabase managée.

**Avant essai de vraie sauvegarde Cloud** : autorisation distincte, backup authentique/clé/source Git propres, versions réelles corrigées (17.11 annoncé par fournisseur, image 17.6 insuffisante si source 17.11), privilèges/CA/snapshot/drainage/exclusions/Storage-Vault vérifiés ; accès indépendant réel aux secrets ; environment isolé adapté à rôles/extensions/managed schemas/GoTrue et sorties externes bloquées. Toute version/rôle/locale/extension inconnue exige adaptation examinée, pas force/no-owner/no-acl.

**Avant récupération du projet Cloud existant** : décider avec propriétaire/Supabase la stratégie pour schémas/rôles gérés préexistants, owners/grants non réappliquables par opérateur, données/config/externe et perte depuis borne ; préparer chaque adaptation réversible et preuve de sécurité. Reconfigurer URLs/Auth/MFA/providers/JWT/decryption, Data API/réseau, SMTP/Resend/templates, Edge et secrets/source déployée, Realtime/jobs/intégrations, Storage/Vault si utilisés. Tester parcours complets et frontend compatible, comptes/facteurs concernés, mutations/refus/idempotence/notifications, secrets survivant au sinistre et RTO/RPO réalistes. Publication et réouverture Production restent des décisions séparées après ces preuves.

## Sources officielles actuelles

Context7 résolu avant PostgreSQL 17, Supabase, Docker et Auth 2.197.0 ; changelog public Supabase et aides réelles des clients consultés. Sources publiques décrivent capacités/limites, jamais l'état Cloud MY. :

- [pg_restore : transaction, erreurs, owners, SQL privilégié](https://www.postgresql.org/docs/17/app-pgrestore.html), [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [snapshots](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION).
- [GRANT : bootstrap/grantor/ADMIN](https://www.postgresql.org/docs/17/sql-grant.html), [roles](https://www.postgresql.org/docs/17/role-membership.html), [extensions](https://www.postgresql.org/docs/17/extend-extensions.html).
- [Supabase backup/restore et schémas gérés](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [backups/Storage/secrets](https://supabase.com/docs/guides/platform/backups), [changelog](https://supabase.com/changelog), [upgrade 17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- [GoTrue 2.197.0 configuration](https://github.com/supabase/auth/blob/v2.197.0/_autodocs/configuration.md), [chiffrement DB/MFA et validation des clés](https://github.com/supabase/auth/blob/v2.197.0/internal/conf/configuration.go).
- [Docker network none](https://docs.docker.com/engine/network/drivers/none/), [namespace partagé](https://docs.docker.com/engine/network/#container-networks), [tmpfs](https://docs.docker.com/engine/storage/tmpfs/).
