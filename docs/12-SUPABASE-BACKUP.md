# PROD.4 — Sauvegarde manuelle Supabase de MY.

## Statut et contrat

Outillage livré en **`0.8.27`**, testé exclusivement sur PostgreSQL jetable avec données synthétiques. **Aucun accès Cloud, aucun backup Production, aucune restauration.** La [procédure de publication](11-PUBLICATION-PRODUCTION.md) reste la référence pour l'ordre des opérations : fermeture effective, sauvegarde, puis seulement PR et migrations. PROD.5 devra éprouver la récupération avant toute publication.

Trois commandes : `plan` prépare hors connexion ; `capture` effectue les futurs contrôles et exports après deux autorisations explicites ; `verify` relit hors connexion une sauvegarde existante. Le CLI public n'accepte aucune cible Local ou implicite. Le test appelle le moteur avec une cible `isolated` réservée, un conteneur distinct et un marqueur synthétique ; aucun mode CLI ne permet d'exporter le volume personnel.

Un résultat réussi porte **`capture_integrity_verified`, `restore_proven=false`, `publication_authorized=false`**. Il atteste un périmètre exporté et inventorié, avec les limites ci-dessous. Il ne certifie ni les déclarations externes de l'opérateur, ni l'accès futur aux secrets, ni la portabilité Auth/MFA, ni une restauration.

PROD.3 reste strictement Local et conserve **`backup_authorized=false`**. Sa sortie n'est pas un fichier d'autorisation PROD.4. Extraction du contrôle de gel en `verifyFreezeContract` : `verifyContract` conserve tous ses contrôles et sa parité stricte des migrations ; aucun SQL, rôle, garde ou résultat PROD.3 modifié.

## Mécanisme retenu

**Un `pg_dump --format=custom` natif de toute la base**, sans filtre de schéma/table, sans `--no-owner`, sans `--no-acl`. Il conserve les objets applicatifs, Auth, Storage, historique de migrations et autres schémas ordinaires accessibles. Le format custom est comprimé et permet l'inspection par `pg_restore`. Le chiffrement AES-256-GCM intervient immédiatement sur stdout, avant toute écriture sur disque.

Un client `pg` déjà installé maintient une transaction `REPEATABLE READ READ ONLY` et exporte `pg_export_snapshot()`. Le dump importe ce snapshot via `--snapshot`. Inventaire, comptes de lignes, métadonnées de rôles et historique sont lus dans la transaction exportatrice. Pas de deuxième dump indépendant, ni de `pg_dumpall` successif présenté comme synchronisé. Les rôles sont un inventaire structuré pour PROD.5, pas un script de recréation automatique du cluster Supabase.

`supabase db dump` n'est pas retenu comme backup exhaustif : par défaut il exporte le schéma, pas les données ni rôles, exclut notamment `auth`, `storage` et les schémas d'extensions. Ses modes data/schema/roles ont des exclusions et transformations différentes ; des historiques gérés sont exclus du mode data. Il ne propose pas de snapshot partagé à cette interface. Son `--dry-run` développe les credentials : **ne jamais l'utiliser avec un secret réel ni conserver cette sortie**. La CLI reste utile pour développement Local ; aucune liaison ou commande distante nécessaire ici.

Supabase Free : exports logiques manuels sans abonnement, service externe ou upload automatique. Les objets Storage ne sont jamais des blobs inclus dans le dump DB. Les backups quotidiens accessibles/PITR payants ne font pas partie de ce système.

### Clients Windows et versions

Node **24.20.0**, npm **12.1.0**, Supabase CLI **2.120.0**, Docker Desktop/moteur **29.8.2**, serveur Local et clients PostgreSQL **17.6** observés. Aucun `pg_dump`, `pg_restore` ou `psql` Windows natif trouvé dans PATH. Utilisation de clients dans une image Docker déjà présente, sélectionnée par son **ID SHA-256**, jamais `latest` ; `--pull=never`, aucun téléchargement implicite. Tests : `public.ecr.aws/supabase/postgres:17.6.1.166`, ID `sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86`.

Le serveur source doit avoir la même majeure que les trois clients, actuellement 17 ou 18 acceptées ; la mineure `pg_dump` doit être au moins celle du serveur. C'est une restriction conservatrice, plus stricte que la capacité native de dumping d'une ancienne majeure. Les versions effectives sont consignées. La documentation publique du 25 septembre 2026 annonce un passage Supabase **17.6 → 17.11** : une source Cloud 17.11 fera refuser l'image de test 17.6. Préparer manuellement une image cliente corrigée, puis examiner son digest et son aide, sans mettre à niveau le volume personnel. La mineure Cloud actuelle reste inconnue.

Commandes internes pertinentes :

```text
pg_dump --format=custom --quote-all-identifiers --no-password --snapshot=<snapshot> --lock-wait-timeout=10s
pg_restore --list
pg_restore --exit-on-error --file=/dev/null
psql --version
```

Les deux lectures `pg_restore` n'ont **aucun `--dbname`, `--create`, `--clean` ou accès réseau**. La deuxième parcourt et décompresse réellement toute l'archive ; une liste TOC seule ne suffit pas. `psql` est vérifié pour le futur diagnostic opérateur et PROD.5 ; aucun script de restauration livré. Les limites d'attente font échouer une commande bloquée, jamais attester le drainage.

## Matrice du périmètre

| Catégorie | Export réel et contenu | Exclusions / droits | Validation PROD.4 |
|---|---|---|---|
| `public`, `private` | Archive native : tables, données, séquences/définitions/états, contraintes, index, triggers, fonctions, vues, RLS/policies, owners, grants et default ACL | SELECT intégral, visibilité catalogues, droits de locks et fonctions de contrôle ; pas de contournement RLS | Inventaire réel, comptes de lignes, TOC tables/données/séquences/triggers/contraintes/index/policies ; lecture totale ; contrôle exact PROD.2 |
| Catalogue | Pokémon, séries, extensions TCG, cartes, variantes, relations, états canoniques ; tables `catalog_*` privées | Images externes TCGdex : URLs en DB, pas leur contenu ; disponibilité du fournisseur hors SQL | Données synthétiques, ID `9007199254740993` exact ; tables/données inventoriées |
| Comptes MY. et collections | Profils, collections, items, copies, préférences globales/par collection, partages | Aucun export réservé seulement aux tables visibles par un utilisateur | FK profil → `auth.users` vérifiée ; fixtures catalogue/collections/copies/partages existantes réutilisées |
| Phase 8 | Contrats, versions/révisions, ordre/positions, rangs, masques, intentions, reçus et JSON exacts | Pas de conversion, réécriture ou reprise d'opération | Tables complètes, intentions/reçus synthétiques avec BIGINT exacts ; archive inspectée sans restauration |
| Notifications | Annonces, états read/processed et lecture des cibles | Pas de publication réelle ou mutation pendant capture | Fixtures d'annonce/lecture/traitement ; tables/données et rôle publisher présents |
| Gel PROD.2 | Singleton gel/revision, fonctions privées/publiques et triggers, y compris `auth.users`, ACL | Dump garde le gel **actif** ; aucune levée automatique | `readFreeze`, `observe`, `verifyFreezeContract` réutilisés ; révision attestée avant snapshot et fin d'export |
| Migrations | Schéma/données `supabase_migrations` natifs ; archive Git entière du HEAD, 50 fichiers actuels, empreintes et indicateur installed par fichier | Les migrations nouvelles du commit peuvent ne pas encore être installées ; aucun repair/reset | Historique réel noms/versions doit être préfixe exact des fichiers, au moins PROD.2 installé ; statements sont dans le dump ; source propre et HEAD/version stables |
| Auth géré | Toutes les tables Auth inventoriées, dont users, identities, MFA facteurs/challenges/AMR, sessions, refresh tokens ; autres tables présentes incluses automatiquement | Lecture intégrale requise ; GoTrue et dépendances de chiffrement/signature externes nécessaires | Présence obligatoire des sept familles Auth essentielles ; TOC de toutes les tables réellement découvertes ; UPDATE concurrente exclue par snapshot |
| Personnalisations MY. sur Auth | Triggers création profil, suppression compte et gel ; fonctions/owners/ACL correspondants | Les schémas gérés ne sont pas filtrés ; ne pas rejouer aveuglément leur CREATE en PROD.5 | Inventaire définitions et TOC des triggers Auth ; archive SQL lue en mémoire sur jeu synthétique |
| Rôles | Attributs explicites `pg_roles`, appartenances admin/inherit/set, paramètres de rôle/base, owners et ACL d'objets ; publisher LOGIN/NOINHERIT | **Aucun `rolpassword`/`pg_authid` exporté** ; mots de passe à reprovisionner séparément ; rôles Supabase réservés ne sont pas à recréer aveuglément | Inventaire dans snapshot, attributs et permissions publisher vérifiés par contrat existant ; données JSON nécessaires à PROD.5 |
| Configuration hors PostgreSQL | `external.json.myb` : paramètres Auth/URLs/providers/version, SMTP/Resend, MFA, Data API, réseau, intégrations, fonction déployée et relevés détaillés `records` | Pas de lecture Management API ; chaque référence de configuration doit avoir un relevé non vide inclus, sans secret brut ; pas d'inférence depuis `config.toml` Local | Schéma fermé exige toutes les catégories ; référence sans relevé refusée ; **exactitude et exhaustivité des réglages vérifiées manuellement**, jamais inférées de Local |
| Secrets externes | Références séparées obligatoires DB, publisher, SMTP, clés Auth/signature et variables Edge | Valeurs hors manifeste/logs/Git, dans coffre approuvé ; clés inaccessibles non déclarées disponibles | Attestation de conservation séparée ; portabilité et reprovisionnement à éprouver en PROD.5 |
| Edge `delete-account` | Source Git du commit, lockfile/deno/config ; hash et configuration de la version réellement déployée dans inventaire externe | Version déployée peut différer de Git ; secrets/réglages runtime non contenus dans SQL | Référence et hash exigés ; parité Cloud à vérifier manuellement lors de première opération autorisée |
| Storage | Métadonnées des schémas dans archive ; inventaire exige **zéro bucket et zéro objet** | Aucun usage dans code actuel ; Local 0/0. Usage Cloud inconnu. Si utilisé, **refus**, future copie protégée blobs + inventaire + writers arrêtés nécessaire | Injection d'un bucket synthétique refusée. Aucune copie d'objet ou upload livré tant que MY. ne l'utilise pas |
| Extensions / Vault | Définitions natives, versions/schema/config, données de configuration exportables ; inventaire des dépendances | Objets appartenant à extension recréés depuis son paquet, pas tous décrits individuellement ; données non-config non vides, filtres config, foreign tables ou séquences cycliques refusés | Extensions Local plpgsql, uuid-ossp, pgcrypto, pg_stat_statements, supabase_vault, citext, pgtap ; Vault 0 secret ; usage non vide refusé |
| Autres objets PostgreSQL | Schémas ordinaires supplémentaires et objets natifs de la base ; large objects natifs, inventaire owners/ACL | Pas de globals/tablespaces/WAL, fichiers serveur, clés de chiffrement ou état d'autres bases ; accès manquant bloque | Inventaire dynamique et erreur/warning natif bloquants ; dépendances extensions/plateforme à examiner en PROD.5 |

Une parité noms/versions n'établit pas que chaque migration historique a été exécutée avec les octets actuels. Les empreintes des fichiers sont celles du commit sauvegardé. Les statements historiques et le **schéma réellement installé** restent dans l'archive ; définitions, contraintes, politiques et ACL sont aussi inventoriées. Le contrat PROD.2 est comparé au code. **La preuve de parité générale schéma/migrations et l'ordre de restauration relèvent de PROD.5** ; aucune déclaration de parité globale n'est produite par le manifeste.

### Auth, sessions et limites de récupération

La source Local actuelle comporte 24 tables Auth : users/identities, familles MFA, sessions/refresh_tokens, audit, flow_state/one_time_tokens, OAuth/SSO/SAML, WebAuthn et versions internes. Le nombre Cloud n'est pas supposé identique : découverte dynamique obligatoire. Le jeu isolé emploie le schéma Auth initial de l'image et des dépendances MFA/identités/sessions synthétiques ; il ne simule pas GoTrue actuel ni une reconnexion MFA.

Les hashes de mots de passe, secrets TOTP, tokens et données personnelles sont sensibles même chiffrés. Leur présence dans le dump ne prouve pas qu'ils fonctionneront après restauration. Clés Auth, signature/JWT/JWK, secrets OAuth/SMTP/Edge et éventuelle racine Vault ne sont pas automatiquement exportés. Certaines clés peuvent rester gérées/inaccessibles chez Supabase : **si le propriétaire ne peut pas établir leur conservation/réutilisation, noter ce blocage pour PROD.5**, pas promettre MFA portable.

Sessions/tokens PostgreSQL sont inclus dans la borne MVCC, mais tokens côté navigateur, expiration, réutilisation, révocation, signature, emails déjà envoyés et état externe ne sont pas récupérés transactionnellement. Après restauration, prévoir réauthentification et éventuelle réinscription MFA selon résultat d'essai. Aucune promesse de conserver une session active. L'Edge peut avoir révoqué des sessions avant son refus de suppression pendant gel ; cet effet reste effectif.

## Cohérence et préconditions

La maintenance frontend ne ferme pas Supabase. Le commit du gel PROD.2 draine les writers métier ordinaires utilisant `771403`, mais pas Auth interne ni opérateurs/publisher. Le moteur vérifie un état **committé**, revision exacte, contrat du gel, visibilité totale, zéro lock résiduel et zéro transaction préparée. Il tient ensuite un lock partagé `771403` pendant le snapshot pour empêcher une bascule concurrente du gel. Il ne réalise aucune écriture métier, probe de mutation, bascule de maintenance ou gel.

Tous les éléments PostgreSQL transactionnels exportés partagent le snapshot maintenu jusqu'à fin du dump. Une écriture Auth committée après la borne reste exclue de l'ensemble DB, sans mélange users/MFA/profils entre commandes. Connexion directe ou **pooler session port 5432**, jamais pooler transaction 6543. Le partage du snapshot et sa visibilité doivent fonctionner avec les droits Cloud réels ; refus si indisponibles. Même cible attendue, contrôle `pg_control_system`, session_user/current_user postgres, database, majeure, SSL effectif et visibilité statistiques exigés. DDL, rôles et paramètres restent exclus par coordination opérateur : les catalogues ne constituent pas une sauvegarde distribuée de la plateforme.

**Séquences non MVCC** : valeurs `last_value`, `is_called`, incrément/cache/bornes lus avant et après le dump, sous forme de chaînes exactes. Écart, cycle ou incrément non positif bloque la complétude. Cette égalité encadre l'état persistant exporté ; elle ne restitue pas les caches internes ni une réservation client. Elle exige absence coordonnée de `setval`, DDL et modifications privilégiées pouvant changer puis rétablir une valeur. Les avances Auth normales peuvent provoquer un refus : arrêter/exclure réellement le writer concerné avant nouvelle tentative ; ne pas supprimer le contrôle ou relancer aveuglément. Aucune attente arbitraire ne garantit cela.

Les configurations/objets extérieurs à PostgreSQL ont une **borne séparée attestée par l'opérateur**, sans transaction distribuée. Les writers/configurations/secrets doivent rester exclus jusqu'à la fin de conservation de leurs éléments. Un échantillon `pg_stat_activity` sans transaction ne prouve jamais cette exclusion durable. Le moteur accepte seulement un fichier d'évidence fermé et lié cible/système/révision, avec références explicites de maintenance, commit/drainage, exclusion privilégiée/DDL/config, stockage et clés. Ce fichier reste **une déclaration opérateur**, pas une observation automatique de Vercel ou une preuve globale.

### Séquence future obligatoire

1. Sélectionner et examiner cible Cloud exacte, projet, system_id et connexion ; obtenir versions et CA par une intervention manuelle autorisée distincte. Installer les migrations PROD.2 sur Cloud uniquement dans leur phase autorisée. Préparer clients compatibles et source Git propre au commit retenu.
2. Constater maintenance Vercel effective avec accès normalement autorisé, sur domaine/aliases/déploiements concernés ; conserver bornes, GET/HEAD/503/headers et limites géographiques.
3. Constater gel Supabase après commit puis relecture indépendante. Le CLI PROD.3 reste Local : ses preuves ne sont pas réutilisées comme fermeture Cloud.
4. Vérifier absence d'écritures ordinaires en vol, barrière et transactions préparées, permissions et visibilité intégrales.
5. Coordonner imports, migrations, publisher, SQL administratif, jobs/cron/intégrations et writers privilégiés, avec exclusion maintenue jusqu'à fin. Aucun kill automatique ni simple observation ponctuelle.
6. Établir snapshot Auth, bornes séquences, configuration externe, secrets/clés disponibles et Storage/Vault inutilisés ; compléter inventaires et dossier de références protégé. Toute incertitude bloque.
7. Autoriser distinctement connexion Cloud et export sensible, puis lancer `capture` dans un dossier neuf hors Git.
8. Examiner succès, inventaires, périmètre, limites et références ; `verify` doit réussir indépendamment. Relever empreinte du manifeste chiffré pour le dossier opérateur ; ne pas afficher son contenu sensible.
9. Conserver dossier chiffré, ACL restreintes, copie de conservation manuelle dans un support explicitement approuvé et non synchronisé ; clé de récupération dans coffre séparé. Aucun upload automatique.
10. Maintenir fermeture ; attendre la future validation de restauration PROD.5 et tous les autres prérequis avant autoriser PR/publication. Échec/interruption : aucun script ne désactive maintenance ou gel, ni ne réutilise un dossier partiel.

## Dossier et manifeste

```text
backup-<borne choisie>/
  database.dump.myb    archive custom de toute la base
  inventory.json.myb   catalogues, comptes, rôles/ACL, migrations et séquences
  external.json.myb    paramètres non secrets et références du dossier/coffre externe
  evidence.json.myb    déclarations liées à cette cible et fermeture
  source.tar.myb       git archive HEAD entier, commit propre requis en Cloud
  toc.txt.myb          liste native des objets exportés
  manifest.myb         manifeste JSON chiffré et authentifié
```

Un dossier en cours/échoué garde `INCOMPLETE`, et ne peut jamais passer `verify`. Existant refusé à capture. Noms/fichiers supplémentaires ou absents, symlinks, format inconnu, manifeste incohérent, tag GCM invalide, taille/hash différents, warning ou exit natif non nul et archive illisible provoquent refus. Le manifeste n'est publié qu'après lecture intégrale de l'archive ; le moteur vérifie de nouveau tous les artefacts avant rendre le succès. Aucun SQL/Auth brut sur disque.

Manifeste fermé `my-backup-manifest-v1` : statut `capture_verified_restore_unproven`, cible/système/versions, branche/HEAD/version et dirty, outils, snapshot et bornes UTC, garantie/limites, résultat TOC et six `{name, bytes, sha256}`. SHA-256 porte sur chaque **fichier chiffré**. `manifest.myb` est protégé par GCM ; son SHA-256 externe peut être conservé séparément pour identifier le backup sans auto-hash circulaire. Le manifeste ne contient aucun mot de passe/valeur de secret, contenu Auth ou token. Le snapshot technique n'est pas une session Auth.

Format binaire : magic ASCII `MYBK0001` (8 octets), nonce aléatoire (12), ciphertext AES-256-GCM, tag (16). Magic authentifié comme AAD ; nonce neuf par fichier ; clé aléatoire **32 octets**, encodée base64 canonique. La lecture authentifie intégralement avant toute transmission plaintext à `pg_restore`, puis relit en streaming. Le checksum n'est pas une restauration, ni une signature contre un opérateur possédant la clé.

## Windows / PowerShell et stockage

Choisir deux emplacements explicites hors dépôt : racine de backups protégée et copie DPAPI de travail de la clé, séparée. Exemple ci-dessous : chemins à adapter, parents créés et protection vérifiée manuellement. Exiger volume/support chiffré au repos adapté (BitLocker si disponible, sinon volume chiffré approuvé) et accès minimal. Chaque nouveau dossier reçoit ACL Windows sans héritage, utilisateur courant + SYSTEM seulement ; Unix 0700/0600. L'archive est toujours chiffrée même si le disque l'est déjà. Administrateur local/Docker peut lire les secrets en mémoire : poste et daemon de confiance indispensables.

Le moteur refuse dépôt/ancêtres, destinations résolues connues OneDrive/Google Drive/Dropbox et chemins de synchronisation connus. Il ne peut détecter tous les agents de synchronisation : `unsynchronized_destination=true` et référence de contrôle manuel restent obligatoires. Ne pas choisir un dossier synchronisé inconnu et ne pas mettre une clé dans le dossier backup. Aucun `.env` secret, credential dans argument/URL, logging de stdout PostgreSQL ou contenu Auth. stderr des outils absorbé ; diagnostics fixes seulement.

1. Copier les trois [modèles](../scripts/backup/examples/) dans le dossier opérateur protégé, hors Git ; remplacer **toutes** les valeurs illustratives. Champs `REPLACE`/fausses préconditions refusés. La configuration est fermée, pas une connection string. Chaque référence de configuration `*_evidence`/`evidence` doit retrouver un objet non vide dans `external.records` : relevé complet des paramètres non secrets, origine/date et instructions de réapplication. Le moteur embarque ces relevés dans `external.json.myb` et refuse tout relevé absent. Les références de fermeture désignent le dossier opérateur réel ; `secret_store_refs` désigne les entrées du coffre séparé, vérifiées manuellement ; **ne jamais y mettre les valeurs des secrets**. Le script ne certifie pas l'exactitude des déclarations ni l'accès au coffre.
2. Préparer dans le coffre approuvé une clé cryptographique de 32 octets, avec copie de récupération indépendante. Importer par saisie masquée une copie DPAPI de travail :

```powershell
& ./scripts/backup/secrets.ps1 -Action ImportKey -KeyFile 'D:\MY-secrets\backup-key.dpapi'
```

DPAPI est lié au compte/machine Windows : ce fichier seul ne suffit pas après perte du poste. La clé originale reste au coffre séparé ; tester son accès indépendant. Ne jamais afficher/coller la clé dans un shell journalisé ou l'inscrire dans la cible JSON.

3. Préparer hors connexion, sans secret :

```powershell
npm.cmd run backup -- --command plan --environment cloud --project <ref-examinee> --config 'D:\MY-operator\target.json'
```

`plan` n'appelle ni Docker, ni PostgreSQL, ni Cloud. Il ne prouve aucun état distant et ne remplace pas la séquence précédente.

4. **Lors d'une future intervention Cloud expressément autorisée**, après toutes les préconditions :

```powershell
$captureArguments = @(
  '--command', 'capture', '--environment', 'cloud', '--project', '<ref-examinee>',
  '--config', 'D:\MY-operator\target.json',
  '--evidence', 'D:\MY-operator\evidence.json',
  '--external', 'D:\MY-operator\external.json',
  '--directory', 'D:\MY-backups\backup-<borne>',
  '--authorize-cloud', '--authorize-sensitive-export'
)
& ./scripts/backup/secrets.ps1 -Action Run -KeyFile 'D:\MY-secrets\backup-key.dpapi' -BackupArgs $captureArguments
if ($LASTEXITCODE -ne 0) { throw 'Backup refusé/incomplet ; garder maintenance et gel.' }
```

Wrapper saisit le mot de passe PostgreSQL en `SecureString`, fournit clé/password uniquement au processus enfant et nettoie ses variables dans `finally`. Docker reçoit le password par stdin dans un environnement de processus éphémère, jamais dans argv, Config.Env ou fichier. Node `pg` utilise propriétés distinctes avec `rejectUnauthorized:true`, CA hash examinée et hostname explicite ; libpq impose `sslmode=verify-full`. Aucun downgrade `require`, aucun flag de contournement TLS. Pas de secret Supabase CLI/PAT nécessaire.

5. Relire ultérieurement, sans mot de passe DB ni connexion réseau :

```powershell
$verifyArguments = @('--command', 'verify', '--directory', 'D:\MY-backups\backup-<borne>')
& ./scripts/backup/secrets.ps1 -Action Run -KeyFile 'D:\MY-secrets\backup-key.dpapi' -BackupArgs $verifyArguments
Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\MY-backups\backup-<borne>\manifest.myb'
```

Codes : 0 = commande nommée réussie ; 1 = refus/inconnu. Interruption brutale laisse un dossier partiel/marker ou des empreintes non valides ; ne pas en déduire réussite. Réexécuter `verify` et précontrôles ; aucune réouverture implicite ni relance automatique. Aucun mode force.

Tests autorisés ici :

```powershell
npm.cmd run backup:test
npm.cmd run backup:test:isolated
```

Le second démarre un conteneur `my-prod4-test-<12 hex>` avec stockage éphémère, port loopback aléatoire et schema/données synthétiques ; installe les migrations versionnées et dépendances Auth représentatives. Supprime seulement ce conteneur exact et son dossier temporaire vérifié. Pas de commande volume/reset, pas de lecture/export des données personnelles, pas de restauration.

## Première sauvegarde Cloud et transmission PROD.5

Première intervention manuelle encore nécessaire : version serveur réelle ; image corrigée ; CA/certificat et hostname direct/session ; cible/system_id ; droits réels de lecture/catalogues/locks/snapshot ; installation autorisée PROD.2 ; Auth/MFA/keys/config Cloud ; éventuels writers inconnus et Storage/Vault. Si snapshot, visibilité, schéma géré ou clé manque : **refus, diagnostic et cadrage complémentaire**, sans exclusion silencieuse, élargissement automatique de privilèges ou export non protégé. Il est interdit de déclarer complet un simple dump Supabase standard.

PROD.5 devra définir et tester : lecture déchiffrée portable ; versions/packages d'extensions ; cible isolée ; ordre rôles/managed schemas/DDL/data/FK/triggers/ACL/RLS ; droits restreints Supabase Cloud et reprise sur projet existant ; séquences ; historique et parité source/schéma ; versions GoTrue ; comptes/identités/MFA et politiques de réauthentification ; secrets/SMTP/Edge ; reçus et notifications ; pertes après borne et durées ; vérifications applicatives et stratégie d'échec. **Aucun `pg_restore -d` ni restauration complète anticipé dans PROD.4.**

Références publiques actuelles consultées via Context7 et aides des clients : [CLI dump](https://supabase.com/docs/reference/cli/supabase-db-dump), [backups Free/Storage/rôles](https://supabase.com/docs/guides/platform/backups), [backup-restore et chiffrement](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [changelog Supabase](https://supabase.com/changelog), [mise à jour PostgreSQL](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes), [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [psql](https://www.postgresql.org/docs/17/app-psql.html), [snapshots](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION), [TLS libpq](https://www.postgresql.org/docs/17/libpq-ssl.html), [extensions](https://www.postgresql.org/docs/17/extend-extensions.html), [TLS node-postgres](https://node-postgres.com/features/ssl). Capacités documentées, aucun état Cloud MY. vérifié.
