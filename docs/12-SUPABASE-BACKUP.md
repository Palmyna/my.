# PROD.4 / PROD.5 — Sauvegarde et restauration isolée de MY.

## Statut et contrat

**AUTO.3 :** entrée opérateur `npm run prod:backup`, réutilisant `capture`, `verify`, DPAPI et contrats ci-dessous sans modifier le moteur. Elle ferme Vercel puis Supabase, recueille les preuves contemporaines, impose le drainage technique et gère la session/reprise hors Git. [Préparation initiale et usage](13-PRODUCTION-AUTOMATION.md). Validation simulée uniquement, sans vraie capture Cloud ; `verify` ne prouve toujours pas PROD.5.

Capture PROD.4 livrée en **`0.8.27`**, puis restauration isolée PROD.5 en **`0.8.28`**. Archive native authentique produite par `capture`, restaurée sur une seconde base jetable ; données, sécurité, contrats métier et parcours Auth/TOTP synthétiques éprouvés. **PROD.7B.1, `0.8.30` : transport Windows explicite ajouté au même moteur, capture synthétique réelle avec clients 17.11 et TLS/SCRAM.** [Rapport natif](reports/2026-10-14-PROD7B1-NATIVE-BACKUP-TRANSPORT.md). **Aucune capture Cloud ni sauvegarde Production attestée par ces campagnes ; récupérabilité de Production non démontrée.** La [clôture PROD.7B.2.3](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md) consigne depuis connexion/MFA, rôle et essais métier sous gel sur Preview/Cloud confirmés par le propriétaire, sans essai de sauvegarde ou de restauration Cloud. La [procédure de publication](11-PUBLICATION-PRODUCTION.md) conserve les autres conditions avant publication. [Rapport PROD.5](reports/2026-10-13-PROD5-RESTORE.md).

Trois commandes : `plan` prépare hors connexion ; `capture` effectue les futurs contrôles et exports après deux autorisations explicites ; `verify` relit hors connexion une sauvegarde existante. Le CLI public n'accepte aucune cible Local ou implicite. Le test appelle le moteur avec une cible `isolated` réservée, un conteneur distinct et un marqueur synthétique ; aucun mode CLI ne permet d'exporter le volume personnel.

Un résultat réussi porte **`capture_integrity_verified`, `restore_proven=false`, `publication_authorized=false`**. Il atteste un périmètre exporté et inventorié, avec les limites ci-dessous. Il ne certifie ni les déclarations externes de l'opérateur, ni l'accès futur aux secrets, ni la portabilité Auth/MFA, ni une restauration.

**AUTO.4C** réutilise `verify` et cette archive dans `npm run prod:open`, sans capture ni restauration. Les prérequis PROD.5 restent une preuve opérateur distincte liée à la livraison/archive ; aucune attestation de réouverture ne transforme `restore_proven` ou `production_recovery_proven` en `true`. Une clôture réussie conserve tous les dossiers et références de sauvegarde, puis permet une nouvelle session `prod:backup`. [Commande, états partiels et limites](13-PRODUCTION-AUTOMATION.md#auto4c--commande-finale-prodopen).

PROD.3 reste strictement Local et conserve **`backup_authorized=false`**. Sa sortie n'est pas un fichier d'autorisation PROD.4. Extraction du contrôle de gel en `verifyFreezeContract` : `verifyContract` conserve tous ses contrôles et sa parité stricte des migrations ; aucun SQL, rôle, garde ou résultat PROD.3 modifié.

Depuis PROD.7B.2.2, le gel conserve automatiquement les écritures métier du `super_admin` Auth AAL2 éligible. Ces opérations prennent toujours la barrière `771403` mais peuvent recommencer après sa fermeture. `closed_and_drained` ne prouve donc pas leur arrêt futur. La coordination des writers et le snapshot cohérent incluent cette exception permanente, sans bascule ni réattribution de rôle pendant publication. Aucun nouveau mécanisme de backup/restauration livré ici. [Contrat et preuve Local](reports/2026-10-15-PROD7B22-SUPERADMIN-FREEZE.md).

## Mécanisme retenu

**Un `pg_dump --format=custom` natif de toute la base**, sans filtre de schéma/table, sans `--no-owner`, sans `--no-acl`. Il conserve les objets applicatifs, Auth, Storage, historique de migrations et autres schémas ordinaires accessibles. Le format custom est comprimé et permet l'inspection par `pg_restore`. Le chiffrement AES-256-GCM intervient immédiatement sur stdout, avant toute écriture sur disque.

Un client `pg` déjà installé maintient une transaction `REPEATABLE READ READ ONLY` et exporte `pg_export_snapshot()`. Le dump importe ce snapshot via `--snapshot`. Inventaire, comptes de lignes, métadonnées de rôles et historique sont lus dans la transaction exportatrice. Pas de deuxième dump indépendant, ni de `pg_dumpall` successif présenté comme synchronisé. Les rôles sont un inventaire structuré pour PROD.5, pas un script de recréation automatique du cluster Supabase.

`supabase db dump` n'est pas retenu comme backup exhaustif : par défaut il exporte le schéma, pas les données ni rôles, exclut notamment `auth`, `storage` et les schémas d'extensions. Ses modes data/schema/roles ont des exclusions et transformations différentes ; des historiques gérés sont exclus du mode data. Il ne propose pas de snapshot partagé à cette interface. Son `--dry-run` développe les credentials : **ne jamais l'utiliser avec un secret réel ni conserver cette sortie**. La CLI reste utile pour développement Local ; aucune liaison ou commande distante nécessaire ici.

Supabase Free : exports logiques manuels sans abonnement, service externe ou upload automatique. Les objets Storage ne sont jamais des blobs inclus dans le dump DB. Les backups quotidiens accessibles/PITR payants ne font pas partie de ce système.

### Clients Windows et versions

Node **24.20.0**, npm **12.1.0**. Deux transports, aucun choix automatique : cible historique `my-backup-target-v1` = Docker ; cible `my-backup-target-v2` avec `transport=windows-native` = exécutables Windows. Docker conserve image locale sélectionnée par **ID SHA-256**, `--pull=never`, sans téléchargement implicite. Tests Docker : `public.ecr.aws/supabase/postgres:17.6.1.166`, ID `sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86`. Le réseau Docker du poste ne route pas IPv6 vers Cloud selon PROD.7A ; aucun réglage réseau modifié.

Le serveur source doit avoir la même majeure que les trois clients, actuellement 17 ou 18 acceptées ; la mineure `pg_dump` doit être au moins celle du serveur. Restriction conservatrice maintenue. Sous Windows, les trois versions doivent aussi égaler exactement `native_clients.version`. **17.11 réellement démarrée pour les trois EXEs**, depuis `D:\projets\my\tools\postgresql-17.11\pgsql\bin`, contre serveur synthétique **17.6**. Autres distributions/versions exigent examen et essais ; aucune compatibilité PG18 éprouvée ici. **Version serveur Cloud toujours inconnue** : ne pas la déduire des clients. L'image Docker 17.6 sera refusée pour une source 17.11 ; choisir des clients corrigés dans le transport explicitement examiné, sans mise à niveau du Local personnel.

Commandes internes pertinentes :

```text
pg_dump --format=custom --quote-all-identifiers --no-password --snapshot=<snapshot> --lock-wait-timeout=10s
pg_restore --list
pg_restore --exit-on-error --file=/dev/null
psql --version
```

Les deux lectures `pg_restore` n'ont **aucun `--dbname`, `--create`, `--clean` ou accès réseau DB**. La deuxième parcourt et décompresse réellement toute l'archive ; une liste TOC seule ne suffit pas. Sous Windows, `--file=-` est drainé en mémoire sans rétention ; Docker conserve `/dev/null`. `psql` est vérifié pour le diagnostic opérateur. La restauration PROD.5 reste limitée aux destinations isolées décrites plus bas. Les limites d'attente font échouer une commande bloquée, jamais attester le drainage.

**Correctif PROD.7C.1 EPIPE, version applicative 0.8.34 conservée :** `pg_restore --list` peut terminer après son catalogue avant d'avoir consommé tout stdin. L'inspection accepte une fermeture de pipe uniquement pour cette liste et après succès du contrat processus existant : code zéro, stderr vide, aucun échec de démarrage, timeout ou interruption. Elle continue à lire et déchiffrer tout le fichier jusqu'à validation du tag AES-GCM, avec mémoire bornée et sans fichier en clair. La lecture complète reste obligatoire et refuse une fermeture anticipée, même avec code zéro.

`decryptFile` conserve une première authentification intégrale vers un puits avant toute exposition du plaintext, puis authentifie aussi la seconde lecture. Les erreurs structurelles (`encrypted_file_truncated`, `encrypted_file_format_invalid`), de lecture (`encrypted_file_read_failed`), de pipeline (`encrypted_file_pipeline_failed`) et d'authentification (`encrypted_file_authentication_failed`) restent distinctes, sans message fournisseur ni donnée brute. Une troncature conservant une enveloppe structurellement plausible peut se manifester par un refus d'authentification ; elle n'est jamais acceptée. Les diagnostics processus existants restent applicables ; une entrée PostgreSQL anormalement fermée ou défaillante porte `postgresql_tool_input_closed_early` ou `postgresql_tool_input_failed`. Aucun changement de format, clé, AAD, manifeste, précondition de `verify` ou procédure PROD.5. [Preuves synthétiques et contrainte de reprise après correction](reports/2026-10-17-PROD7C1-EPIPE.md).

### Transport natif Windows — sélection et sécurité

Modèle fermé : [target.windows.json](../scripts/backup/examples/target.windows.json). Remplir les mêmes identité/projet/CA que pour Docker, avec `format=my-backup-target-v2`, `transport=windows-native` et **sans `client_image`**. `native_clients` contient :

| Champ | Contrôle |
|---|---|
| `directory` | Répertoire local absolu canonique, sur lettre de lecteur ; ni PATH, UNC, lien/jonction dans les ancêtres, ni exécutable arbitraire |
| `version` | Version exacte `17.x` ou `18.x`, même majeure que la cible ; trois `--version` réellement exécutés, sans substitution |
| `files` | Map nom → SHA-256 des trois `pg_dump.exe`, `pg_restore.exe`, `psql.exe` et de **toutes** les DLL adjacentes, dont `libpq.dll`. Ensemble exact vérifié ; DLL ajoutée, fichier absent/modifié, autre EXE déclaré refusés |

Empreintes recalculées **avant chaque lancement**, répertoire de travail fixé au bin contrôlé, EXE absolu et `shell=false`. Installer/examiner provenance et ACL de la distribution avant de figer ces empreintes. Une empreinte produite à partir d'un binaire déjà compromis ne prouve pas sa provenance. Ne jamais régénérer automatiquement les empreintes pour contourner un refus.

Cloud natif accepte seulement connexion **directe** `db.<projet>.supabase.co:5432`, `postgres`, base `postgres`. Deux consentements capture inchangés. Windows fournit la route réseau ; Docker n'intervient pas dans la capture/vérification native. La cible `isolated` TLS/loopback reste réservée aux tests internes, inaccessible par le CLI public.

Node vérifie CA épinglée SHA-256, chaîne, hostname et TLS ≥ 1.2 ; libpq impose `verify-full`, même CA contrôlée avant dump, TLS ≥ 1.2, GSS désactivé et **authentification SCRAM obligatoire**. Aucun fallback non chiffré, `require` ou `verify-ca`. Snapshot exporté par Node et importé par le `pg_dump` connecté à cette cible ; fermeture committée, barrière `771403`, inventaires/hashes, owners/ACL, séquences aux bornes et exclusions PROD.4 inchangés.

Environnement natif reconstruit : racine système Windows et PATH limité au bin contrôlé/System32, paramètres PG explicites. Aucun PG hérité, profil utilisateur, service libpq, option PG, variable OpenSSL/Node ou secret tiers transmis. Fichiers implicites pgpass/service/certificat/clé/CRL neutralisés ; CA reste explicite. Mot de passe dans **`PGPASSWORD` de l'enfant seulement**, jamais argv, URL, fichier, sortie ou manifeste ; clé AES reste dans Node, jamais dans ces enfants. stdin du dump fermé ; stdout immédiatement chiffré par le mécanisme existant. `pg_restore` offline reçoit uniquement l'archive par stdin, sans password ni cible DB dans l'environnement.

Limite Windows : utilisateur courant, administrateur/SYSTEM ou logiciel de diagnostic privilégié peut lire mémoire/environnement ; chaînes JS non effaçables avec garantie. ACL et vérification avant spawn ne constituent pas une protection contre un attaquant exécutant du code sous ce même compte entre contrôle et lancement. Poste, OS/DLL système, distribution et configuration doivent rester de confiance ; disque chiffré, compte dédié si nécessaire, aucun transcript/diagnostic mémoire pendant opération. Aucun credential Windows persistant créé par ce transport.

Timeouts natifs : versions 10 s, dump 15 min, lecture archive 5 min, connexion 10 s. SIGINT/SIGTERM gérés ou signal interne tuent l'enfant et attendent sa fermeture ; code non nul, stderr même avec code 0, timeout ou interruption = refus. Aucun stderr arbitraire propagé, retry, changement de transport ou réouverture. Arrêt forcé du parent/poste peut empêcher le nettoyage : dossier incomplet/état inconnu à examiner ; ne jamais réutiliser ce dossier comme nouvelle capture.

### PowerShell — préparation native hors connexion

Copier le modèle Windows **hors dépôt**, compléter cible/CA/identité obtenues lors d'une intervention séparément autorisée. Examiner distribution et versions, puis préparer les empreintes une fois :

```powershell
$nativeBin = 'D:\projets\my\tools\postgresql-17.11\pgsql\bin'
$nativeTargetPath = 'D:\MY-operator\target.windows.json'
foreach ($tool in @('psql', 'pg_dump', 'pg_restore')) {
  & (Join-Path $nativeBin ($tool + '.exe')) --version
  if ($LASTEXITCODE -ne 0) { throw 'Client PostgreSQL indisponible.' }
}
$nativeFiles = [ordered]@{}
Get-ChildItem -LiteralPath $nativeBin -File | Where-Object {
  $_.Extension -ieq '.dll' -or $_.Name -in @('psql.exe','pg_dump.exe','pg_restore.exe')
} | Sort-Object Name | ForEach-Object {
  $nativeFiles[$_.Name] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
}
$nativeTarget = Get-Content -LiteralPath $nativeTargetPath -Raw | ConvertFrom-Json
$nativeTarget.native_clients.files = $nativeFiles
[IO.File]::WriteAllText($nativeTargetPath, ($nativeTarget | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
# Examiner et conserver cible/empreintes ; aucun secret dans ce JSON.
npm.cmd run backup -- --command plan --environment cloud --project <ref-examinee> --config $nativeTargetPath
```

`plan` reste sans lancement PostgreSQL/Docker ni réseau et n'authentifie pas la distribution. Écriture UTF-8 sans BOM, compatible PowerShell 5.1. Lors d'une **future** capture autorisée, utiliser procédure DPAPI/consentements ci-dessous avec `--config $nativeTargetPath`. `verify` sélectionne le transport authentifié du manifeste et relance les trois versions/pins natifs, sans connexion DB ; ne pas modifier un ancien manifeste pour changer de transport ou de chemin.

Preuves isolées PROD.7B.1 : vrais EXEs 17.11, PostgreSQL 17.6 jetable `network=none`, relais hôte loopback aléatoire sans port Docker publié, TLS/SCRAM ; capture et `verify`, preflight PROD.5, MVCC concurrent, versions/empreintes et TLS invalides, corruption interne malgré TOC/GCM/checksum valides, perte de snapshot, interruption réelle de dump et timeout du lanceur. [Rapport et décompte](reports/2026-10-14-PROD7B1-NATIVE-BACKUP-TRANSPORT.md). Rien ne prouve les droits, extensions, TLS ou récupération Cloud réels.

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

La source Local actuelle comporte 24 tables Auth : users/identities, familles MFA, sessions/refresh_tokens, audit, flow_state/one_time_tokens, OAuth/SSO/SAML, WebAuthn et versions internes. Le nombre Cloud n'est pas supposé identique : découverte dynamique obligatoire. Le jeu **PROD.4 historique** emploie le schéma Auth initial de l'image et des dépendances MFA/identités/sessions synthétiques, sans GoTrue ni reconnexion MFA. PROD.5 ajoute un véritable service GoTrue 2.197.0 et des identités/TOTP exclusivement synthétiques dans des ressources distinctes.

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

Manifestes fermés : **`my-backup-manifest-v1` conserve exclusivement sa cible Docker v1**, sans réinterprétation ; **`my-backup-manifest-v2` contient exclusivement la cible Windows v2**, ses chemins/empreintes EXE/DLL et trois versions effectives. Même statut `capture_verified_restore_unproven`, cible/système/versions, branche/HEAD/version et dirty, snapshot et bornes UTC, garantie/limites, résultat TOC et six `{name, bytes, sha256}`. **Archive custom PostgreSQL, sept fichiers et enveloppe AES-GCM `MYBK0001` inchangés.** SHA-256 porte sur chaque fichier chiffré. `manifest.myb` est protégé par GCM ; son SHA-256 externe peut être conservé séparément pour identifier le backup sans auto-hash circulaire. Aucun mot de passe/valeur de secret, contenu Auth ou token dans le manifeste. Le snapshot technique n'est pas une session Auth. Lecture/verify/preflight PROD.5 conservent v1 et acceptent v2 ; le lecteur suit le transport authentifié, sans fallback. La destination de restauration reste Docker et conserve comparaison stricte de version client : une archive capturée avec 17.11 ne devient pas restaurable par l'image 17.6 sans préparation compatible séparée.

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

Wrapper saisit le mot de passe PostgreSQL en `SecureString`, fournit clé/password uniquement au processus Node enfant et nettoie ses variables dans `finally`. Docker reçoit le password par stdin dans un environnement éphémère, jamais dans argv, Config.Env ou fichier. Windows natif reçoit seulement le password dans son environnement explicite, avec limites du poste décrites plus haut ; aucune clé AES transmise au client PG. Node `pg` utilise propriétés distinctes avec `rejectUnauthorized:true`, CA hash examinée et hostname explicite ; libpq impose `sslmode=verify-full`. Aucun downgrade `require`, aucun flag de contournement TLS. Pas de secret Supabase CLI/PAT nécessaire.

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
$env:MY_BACKUP_NATIVE_BIN = 'D:\projets\my\tools\postgresql-17.11\pgsql\bin'
npm.cmd run backup:test:native
```

Le second démarre un conteneur `my-prod4-test-<12 hex>` avec stockage éphémère, port loopback aléatoire et schema/données synthétiques ; installe les migrations versionnées et dépendances Auth représentatives. Supprime seulement ce conteneur exact et son dossier temporaire vérifié. Pas de commande volume/reset, pas de lecture/export des données personnelles, pas de restauration.

## Première sauvegarde Cloud et portée de PROD.5

Première intervention manuelle encore nécessaire : version serveur réelle ; clients compatibles dans le transport choisi ; CA/certificat et hostname direct (session seulement pour Docker v1) ; cible/system_id ; SCRAM pour Windows ; droits réels de lecture/catalogues/locks/snapshot ; contrôle du contrat installé PROD.2 et du drainage réel (installation et essais Preview/Cloud confirmés en PROD.7B.2.3) ; périmètre Auth/MFA/keys/config Cloud ; éventuels writers inconnus et Storage/Vault. Connexion directe Windows et identité manuellement vérifiées selon propriétaire ; aucune connexion effectuée par PROD.7B.1. Si snapshot, visibilité, schéma géré ou clé manque : **refus, diagnostic et cadrage complémentaire**, sans exclusion silencieuse, élargissement automatique de privilèges ou export non protégé. Il est interdit de déclarer complet un simple dump Supabase standard.

PROD.5 éprouve désormais la restauration sur PostgreSQL isolé avec paquets d'extensions Supabase et GoTrue synthétique. Le [rapport](reports/2026-10-13-PROD5-RESTORE.md) distingue ces preuves des adaptations managées, clés externes, SMTP/Edge et récupération Cloud encore non démontrés. **PROD.4 reste une preuve d'intégrité, avec `restore_proven=false` ; aucune autorisation de publication n'en découle.**

## PROD.5 — Architecture et frontières de restauration

Le CLI distinct [restore.js](../scripts/backup/restore.js) accepte uniquement `preflight`, `create`, `inspect`, `execute`, `destroy`. Aucun mode Cloud, URL PostgreSQL, port hôte, `clean`, `reset`, `create database`, mode force, filtre métier ou option pour ignorer une erreur. `preflight` est hors connexion DB : il utilise seulement des clients Docker sans réseau pour authentifier et parcourir l'archive. `create` exige nom réservé choisi explicitement, image locale par digest, fichier cible neuf et `--authorize-create`. `execute` exige cette cible, SHA-256 du manifeste examiné et `--authorize-isolated-restore`.

Destination : cluster PostgreSQL **neuf**, initialisé avec `initdb` dans une image déjà installée. Deux tmpfs seulement (`/var/lib/postgresql/data` limité à 1 GiB, `/tmp` à 128 MiB), aucun volume ni bind hôte, aucun port publié ; namespace Docker `--network none`, sans interface externe, route ni passerelle. Racine en lecture seule, utilisateur système PostgreSQL, capacités supprimées, `no-new-privileges`. PostgreSQL est joint par `docker exec ... nc 127.0.0.1 5432` et le protocole `pg`, jamais par le port du Local personnel. Connexion native `pg_restore` dans le même conteneur. Le compte bootstrap `supabase_admin` et son mot de passe éphémère appartiennent uniquement à ce cluster jetable. Ces bornes conviennent au jeu éprouvé ; capacité et mémoire d'une vraie sauvegarde devront être examinées avant adapter ce mode, sans allocation automatique de volume.

Sélection fermée `my-isolated-restore-target-v1` : nom `my-prod5-restore-<12 hex>`, ID complet du conteneur, `network_id=null`, nonce de labels, digest, transport `docker-stdio`, base/identité/version et `system_id` décimal exact. Avant écriture : moteur Docker local, labels/ID/image/montages et namespace sans réseau réel, identité PostgreSQL réelle, majeure/mineure, source ≠ destination, état vide et absence d'autres sessions. La destination vide contient seulement `public`, `plpgsql` et le bootstrap ; aucun schéma applicatif préexistant accepté. Port `5432` dans le JSON est le port **interne**, sans publication. Le nettoyage exige les mêmes identités réelles, supprime seulement cet ID et refuse tant qu’un service portant le nonce de cet essai subsiste. Aucun `docker volume rm` ou nettoyage par préfixe.

Le moteur de capture reste PROD.4 ; un transport Docker réservé à `synthetic=true` permet la source de test sans port hôte. Capture Cloud et tests PROD.4 existants gardent leur transport TCP/TLS antérieur. Les scénarios créent source et destinations distinctes depuis les migrations/fixtures versionnées, jamais depuis le Local personnel.

### Archive, borne et mémoire

Les **sept artefacts**, `MYBK0001`, AES-256-GCM, SHA-256 des fichiers chiffrés et manifeste fermé `my-backup-manifest-v1` sont conservés. L'inventaire v1 gagne des champs authentifiés : empreintes de contenu, schémas/colonnes, propriétés/ACL DB, vues et event triggers. Empreintes prises **dans le même snapshot PROD.4**, pas après capture : SHA-256 de chaque ligne `to_jsonb(t)::text`, tri des hashes sous collation C, puis SHA-256 du multiensemble. Multiplicités, UUID et BIGINT restent exacts ; aucun contenu Auth décodé en nombres JavaScript. UTC, DateStyle, bytea, flottants et search_path fixés pendant lecture. Toute table ordinaire/matérialisée découverte est comparée, avec comptes et contenu.

Une archive PROD.4 antérieure sans ces champs reste lisible par `backup verify`. Le CLI PROD.5 refuse sa validation/restauration automatique avec `restore_legacy_inventory_requires_reference` : ne pas fabriquer de hashes après sinistre ni retoucher son manifeste. Préparer une référence indépendante et une adaptation examinée, ou recapturer une source encore disponible lors d'une intervention autorisée. Aucune ancienne archive Production n'existe ici. Cette limitation est explicite ; le test utilise une vraie capture du moteur PROD.4 enrichi, sans format parallèle.

Après vérification PROD.4, tous les artefacts sont relus, hashés et authentifiés depuis des buffers figés. L'archive custom est gardée en mémoire jusqu'à fin ; une modification ultérieure du dossier ne change pas les octets restaurés. Authentification GCM complète **avant toute écriture**, puis seconde inspection native de ces octets. Borne fixe : **512 MiB chiffrés par artefact** ; dépassement refuse ce mode. Ne pas extrapoler aux gros catalogues : `string_agg` des hashes consomme aussi de la mémoire PostgreSQL. Aucun SQL/archive déchiffré sur disque hôte. La seule liste TOC adaptée est écrite sur tmpfs privé puis supprimée ; métadonnées, pas SQL ni données Auth. Les tests alimentent pgTAP par stdin. Mémoire, swap/pagefile, crash dumps et effacement physique ne sont pas certifiés ; buffers effacés au mieux, secrets JS/OS non garantis physiquement effacés.

### Ordre et adaptations PostgreSQL

1. Vérification indépendante complète de l'archive et consentement lié à son manifeste ; destination neuve, clients/serveur, versions exactes d'extensions disponibles, locale/encodage compatibles.
2. Claim persistant `my_restore_control.attempt`, hors schémas MY., privé au bootstrap. Sérialisation des tentatives et nouvelle vérification du vide ; toute tentative commencée rend la destination non réutilisable.
3. Rôles source : rôles natifs `pg_*`, liste fermée des rôles plateforme connus et seul rôle personnalisé `my_notification_publisher`. Attributs, memberships ADMIN/INHERIT/SET/grantor et GUC réappliqués. **Aucun mot de passe source exporté/recréé** ; rôles LOGIN restent sans credential, sauf bootstrap synthétique. Rôle privilégié inconnu ou publisher élargi : refus.
4. Schémas source avec owners, DB owner, puis extensions **version/schema/owner exacts**. `pg_dump` ne préserve pas l'owner d'extension ni n'impose sa version. `plpgsql` initial est recréé avant objets applicatifs. Seules entrées CREATE SCHEMA/EXTENSION sont commentées dans la TOC : elles viennent d'être réalisées explicitement. Tous commentaires/ACL et autres objets restent sélectionnés.
5. `pg_restore --dbname=postgres --single-transaction --exit-on-error --no-password --use-list=<TOC tmpfs>` lit l'archive par stdin. Owners, grants, pre-data/data/post-data, séquences, fonctions, contraintes, index, triggers, policies/RLS et migrations sont conservés. Aucun `--no-owner`, `--no-acl`, désactivation de triggers ou `--clean`. Warning/exit natif bloque.
6. Réapplication exacte des **ACL de schémas et DB** depuis l'inventaire authentifié : des privilèges d'initialisation Supabase (`pg_init_privs`), observés notamment sur `graphql`, ne sont pas forcément émis par le dump complet. Droits effectifs comparés, sans assimiler ordre textuel des ACL à un changement de droits ; NULL et ACL par défaut équivalentes normalisés par `acldefault`. GUC de listes copiés avec `set_config`/`SET ... FROM CURRENT`, GUC scalaires conservés sans normaliser leurs unités.
7. Comparaison exhaustive à la borne : objets/colonnes/vues, owners/ACL effectifs, fonctions, contraintes/index, triggers/event triggers, RLS/policies/default privileges, rôles/memberships/GUC, historique **avec statements via empreinte de table**, contenu de chaque table et large object PostgreSQL, états/définitions des séquences et gel. Pour chaque séquence possédant une colonne, prochain ID persistant > max existant et ≤ borne max ; cycles/incréments non positifs refusés. Égalité hors MVCC conserve les limites PROD.4 : caches/réservations clients et avancées privilégiées ne sont pas récupérés.

Bootstrap **`supabase_admin`** nécessaire dans ce test : PostgreSQL 17 attribue les grants de rôle au bootstrap (OID 10), avec règle ADMIN différente d'un autre superuser. Aucun catalogue système modifié à la main. En Supabase managé, ce bootstrap et ces droits ne sont pas disponibles à l'opérateur de la même manière : **ces étapes ne constituent pas une recette Cloud**. Le CLI supporte actuellement PG17, même version serveur et client de restauration, locale `en_US.UTF-8`, extensions exactes de l'image examinée. PG18/autre locale/nouvelle liste de rôles/extension ou build incompatible impose adaptation examinée.

### Résultats, échecs et reprise

Rapport JSON hors Git, neuf, sans secret/Auth brut/personne : manifeste/borne, destination, étapes, durée, comptes des objets, contrôles et diagnostic fixe/SQLSTATE. `postgresql_restored` indique fin du restore natif ; `data_verified` exige tous les contrôles. Succès actuel : `isolated_postgresql_restored_data_verified`, **`application_recovery_proven=false`, `production_recovery_proven=false`, `publication_authorized=false`**. Le CLI n'exécute ni parcours applicatifs, ni réapplication externe, ni levée du gel. Le rapport de test séparé précise les seuls parcours éprouvés.

Claim, rôles/schémas/extensions préparés et ACL sont des étapes séparées de la transaction native. Une erreur native annule cette transaction, mais laisse une destination partielle **jetable**. Une réponse perdue/interruption peut laisser un commit natif inconnu. SIGINT/SIGTERM traités annulent seulement le backend identifié par login/application dédiés ; arrêt forcé Windows/daemon peut empêcher ce traitement. Dans tous les cas : garder rapport/borne, constater les effets par lecture indépendante, **détruire explicitement la destination exacte, créer une nouvelle cible, refaire preflight/autorisation**. Aucun retry, deuxième restore sur cible partielle ou rollback par reset. Succès/échec ne touche ni maintenance ni gel Production.

### Windows / PowerShell — commandes isolées

Choisir dossiers existants hors Git/non synchronisés, clé DPAPI séparée et mot de passe **synthétique** de 16–128 lettres/chiffres/tirets, identique pour création/inspect/exécution. La copie DPAPI reste liée au poste/compte ; vérifier aussi la clé originale au coffre indépendant. Exemple avec l'image déjà présente et éprouvée, à examiner avant choix ; aucun pull automatique :

```powershell
$image = (docker image inspect public.ecr.aws/supabase/postgres:17.6.1.166 --format '{{.Id}}').Trim()
$archive = 'D:\MY-backups\backup-<borne>'
$key = 'D:\MY-secrets\backup-key.dpapi'
$target = 'D:\MY-restore\essai-001\target.json'
$report = 'D:\MY-restore\essai-001\restore-report.json'
# Précontrôle hors connexion DB ; examiner borne, version, SHA, rôles/extensions.
$preflightArgs = @('--command','preflight','--directory',$archive)
$check = & ./scripts/backup/secrets.ps1 -Action Run -Tool Restore -KeyFile $key -BackupArgs $preflightArgs | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Archive refusée ; aucune restauration.' }
# Choisir EXPLICITEMENT un nom réservé neuf ; exemple à remplacer si déjà utilisé.
$createArgs = @('--command','create','--container','my-prod5-restore-123456abcdef','--image',$image,'--target',$target,'--authorize-create')
& ./scripts/backup/secrets.ps1 -Action Run -Tool Restore -KeyFile $key -BackupArgs $createArgs
if ($LASTEXITCODE -ne 0) { throw 'Création refusée ; inspecter ressources exactes.' }
$inspectArgs = @('--command','inspect','--directory',$archive,'--target',$target)
& ./scripts/backup/secrets.ps1 -Action Run -Tool Restore -KeyFile $key -BackupArgs $inspectArgs
if ($LASTEXITCODE -ne 0) { throw 'Cible refusée.' }
# Décision explicite après examen du précontrôle, du JSON cible et de la portée.
$runArgs = @('--command','execute','--directory',$archive,'--target',$target,'--report',$report,
  '--expect-manifest-sha256',$check.manifest_sha256,'--authorize-isolated-restore')
& ./scripts/backup/secrets.ps1 -Action Run -Tool Restore -KeyFile $key -BackupArgs $runArgs
if ($LASTEXITCODE -ne 0) { throw 'Récupération non validée ; cible jetable, aucun retry.' }
Get-Content -LiteralPath $report
# Après conservation du rapport et arrêt des seuls services de cet essai :
npm.cmd run restore -- --command destroy --target $target --authorize-destroy
```

Le wrapper `Tool=Backup` par défaut conserve PROD.4 ; `Tool=Restore` choisit seulement le CLI isolé et nettoie clé/password de travail en `finally`. `create`/`inspect`/`execute` demandent un mot de passe masqué ; pas de secret dans JSON/argv/logs/Docker Config.Env du cluster. Code 0 : commande nommée réussie, 1 : refus/échec, 130 : interruption traitée. Le test utilise des clés éphémères exclusivement synthétiques, jamais conservées comme clés Production.

```powershell
npm.cmd run restore:test
npm.cmd run restore:test:isolated
npm.cmd run backup:test
npm.cmd run backup:test:isolated
npm.cmd run maintenance:test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

### Auth, services externes et future sauvegarde Cloud

Trois preuves acquises **uniquement pour les identités synthétiques** du test : données Auth dans capture authentique ; tables/relations/SQL restaurés et profil MY. conservé ; GoTrue **2.197.0** effectivement reconnecté à la base restaurée, password/TOTP chiffré original/AAL2/refresh réussis avec clés éphémères correspondantes. Sans clé de déchiffrement, login retourne 500 ; mauvaise clé de signature refuse token avec 403. Pendant gel, Auth Admin INSERT/DELETE retourne 503 ; après ouverture isolée explicite, nouveau compte/profil créé puis supprimé. Aucun nouvel enrôlement nécessaire dans **ce** cas ; aucun engagement pour les facteurs Cloud ou tous les types MFA/SSO/WebAuthn. Le service est sur boucle locale du namespace PostgreSQL (`--network container:<ID>`), SMTP loopback port 1 fermé, emails `.invalid`, aucun provider/webhook/Edge externe exécuté.

Après sinistre réel : vérifier disponibilité effective des clés Auth/JWT/JWK/decryption et éventuelle racine Vault dans un coffre indépendant, pas seulement des références. Rotation peut invalider tokens/sessions ; prévoir réauthentification, récupération des facteurs selon fournisseur, puis nouvel enrôlement si la clé nécessaire est perdue. Version GoTrue et historique `auth.schema_migrations` doivent correspondre ; ne pas lancer ses migrations automatiquement sur une base réelle non examinée.

Avant essai ultérieur d'une **vraie sauvegarde Cloud**, intervention distincte autorisée : obtenir backup authentique/clé, digest du manifeste, source Git et versions exactes ; revérifier installation PROD.2 et fermeture coordonnée, au-delà du checkpoint Preview/Cloud PROD.7B.2.3 ; vérifier droits réels d'export, rôles/managed schemas/extension packages et besoins externes. Préparer un environnement isolé adapté et approuvé ; désactiver intégrations sortantes avant démarrage, confirmer accès indépendant aux secrets. Ne pas utiliser ce CLI sur Cloud ni sur le volume personnel.

Pour préparer la récupération future sur **projet Cloud existant**, examiner séparément conflits avec schémas Auth/Storage déjà gérés, propriétaires/grants disponibles, versions d'extensions, rôles réservés non recréables et absence de bootstrap opérateur. Choisir adaptations et ordre par objet avec Supabase, sans ignorer les erreurs ni réimporter aveuglément le DDL géré. Préparer réapplication des URLs/redirections Auth, providers, SMTP/Resend/templates, MFA, clés Data API/PG, réseau, Edge `delete-account`/secrets et version déployée, Realtime/jobs/intégrations ; vérifier la parité code/schéma avant reprise. Storage blobs et Vault non vide nécessitent un nouveau workflow protégé (capture actuelle refuse). Aucune commande de restauration Cloud livrée.

Déclaration de récupération opérationnelle seulement après essai réel et relevés : données/borne/RPO, sécurité/permissions, login et MFA des facteurs concernés, mutations/lectures/UUID-reçus, secrets réellement accessibles/reprovisionnés, Edge, emails/redirections/API et frontend compatible. Les lectures/écritures SQL et HTTP Auth synthétiques de PROD.5 ne prouvent pas le navigateur, SMTP/Resend, Edge, services managés Cloud ou disponibilité de leurs secrets après sinistre. RTO mesuré sur petit jeu synthétique uniquement ; pertes possibles depuis snapshot, effets externes et caches de séquences restent distincts. Aucun assouplissement des préconditions de publication.

Références publiques actuelles consultées via Context7 et aides des clients : [CLI dump](https://supabase.com/docs/reference/cli/supabase-db-dump), [backups Free/Storage/rôles](https://supabase.com/docs/guides/platform/backups), [backup-restore et chiffrement](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [changelog Supabase](https://supabase.com/changelog), [mise à jour PostgreSQL](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes), [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [psql](https://www.postgresql.org/docs/17/app-psql.html), [snapshots](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION), [TLS libpq](https://www.postgresql.org/docs/17/libpq-ssl.html), [extensions](https://www.postgresql.org/docs/17/extend-extensions.html), [TLS node-postgres](https://node-postgres.com/features/ssl). Capacités documentées, aucun état Cloud MY. vérifié.
