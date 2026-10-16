# Publication des notifications depuis le terminal

Backend livré et validé sur **Supabase Local** en 8G.3, version `0.8.16`. Aucun droit de publication dans le navigateur. Centre et raccordement aux parcours livrés et validés Local en [8H.3](reports/2026-10-12-PHASE8H3-CLOSURE.md). **PROD.6 (`0.8.29`) adapte le même publisher à une cible Cloud explicitement autorisée**, avec identité PostgreSQL, TLS et permissions vérifiés. Preuves Supabase Local et PostgreSQL/TLS synthétiques uniquement : aucune connexion, configuration, notification ou validation de visibilité Cloud. [Rapport PROD.6](reports/2026-10-14-PROD6-NOTIFICATION-PUBLISHER.md), [clôture Phase 8](reports/2026-10-12-PHASE8I2-CLOSURE.md), [clôture 8G](reports/2026-10-11-PHASE8G3-CLOSURE.md).

## Changelog des publications Production

AUTO.4A réutilise ce contrat **hors connexion** pour préparer le futur `prod:open` : fichier `scripts/notifications/releases/<version>.json` committé avec la source sauvegardée, catégorie/version/audience/expiration vérifiées, chemin/clé/hash normalisé et SHA-256 des octets épinglés dans la session AUTO.3. AUTO.4B livre l'orchestration interne du **même publisher PROD.6** : consentements Cloud/publication distincts, nouvelles observations AUTO.4A, reçu, relectures SQL indépendantes et preuve opérateur authentifiée AAL2 via les trois lecteurs existants. Même fichier/clé/hash en reprise ; `ready` et reçu historique insuffisants. Aucun droit SQL ajouté, aucune notification réelle publiée pendant cette livraison, aucun `prod:open` partiel ou changement de protection. [Préparation](13-PRODUCTION-AUTOMATION.md#auto4a--préparation-de-réouverture), [publication/reprise et limites](13-PRODUCTION-AUTOMATION.md#auto4b--publication-et-vérification-du-changelog).

La [procédure Production](11-PUBLICATION-PRODUCTION.md) est la référence unique de l’ordre des opérations. Codex prépare le changelog public et le fichier de notification lors de chaque clôture publiable, avec la version correspondant à la livraison réelle. Une **publication de catégorie `changelog`** porte notification et contenu public dans le centre MY. ; aucune seconde annonce parallèle ni nouvelle page publique nécessaire.

Préparer/valider localement sans diffusion réelle ni publication Cloud. Après maintenance et gel effectifs, backup, merge, réussite Supabase et promotion manuelle du build Vercel Production, vérifier la version effectivement déployée puis publier une seule fois **avant réouverture**. Relire le centre avec identité éligible, contrôler présence/contenu/version et absence de doublon ; lever ensuite gel Supabase puis maintenance Vercel. Échec ou réponse incertaine : fermeture conservée, même fichier/clé/hash pour reprise, jamais nouvelle clé pour contourner l’incertitude.

Audience existante seulement : date d’inscription Auth ≤ publication ; exception `include_new_users=true` justifiée pour les nouveaux inscrits tant que l’annonce est active. Durée définie par `expires_at` valide ou `null`, retrait définitif et traitement individuel selon les contrats Phase 8 ; lire ne traite pas. Aucun ciblage arbitraire, délai fixe, polling ou notification externe ajouté.

**La publication hébergée n’est pas encore déclarée opérationnelle.** Code/procédure Cloud livrés en PROD.6 ; rôle, SCRAM, connexion directe, TLS et `--check` réel confirmés par le propriétaire dans les [confirmations propriétaire PROD.7A](reports/2026-10-14-PROD7A-PUBLICATION-AUDIT.md#confirmations-manuelles-reçues-pour-prod7a). La [clôture PROD.7B.2.3](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md) confirme ensuite 52 migrations et les essais du gel via Preview/Cloud, sans publication de notification ni refus ordinaires Cloud démontrés. **PROD.6 conserve ses preuves Local de publication, rejeu, conflit et retrait pendant le gel.** L’exception publisher utilise la vraie connexion PostgreSQL `session_user=my_notification_publisher` et les deux fonctions privées existantes ; l’exception permanente `super_admin` reste distincte. Maintenance/backup, publication réelle et relecture éligible sans doublon restent à éprouver en PROD.7C. [Matrice historique PROD.2](reports/2026-10-13-PROD2-WRITE-FREEZE.md).

## Coordination avec la maintenance PROD.3

Le [contrôle opérateur Local](11-PUBLICATION-PRODUCTION.md#prod3--coordination-opérateur) vérifie que le publisher garde exactement ses deux EXECUTE privés et aucune permission de table métier/Auth. Il ne provisionne pas son secret, ne publie rien et ne lui accorde pas de droit sur le gel. Une transaction publisher appartient aux writers **privilégiés non drainés par `771403`**, même si les mutations ordinaires sont refusées : suspendre/coordonner publication et retrait pendant le futur backup, puis les autoriser explicitement au moment prévu par E.

Lecture du centre/contenu/reçu avec une identité synthétique éligible et les permissions MFA existantes peut vérifier la publication pendant gel ; ne pas marquer lu/traiter ni inventer une nouvelle clé après réponse incertaine. Le frontend servi pendant maintenance reste fermé à l'opérateur ; son contrôle protégé hébergé reste un prérequis distinct. PROD.3 ne prétend ni vérifier une publication Cloud, ni autoriser backup ou réouverture Production. [Preuves et limites](reports/2026-10-13-PROD3-COORDINATION.md).

## Préparer et valider un fichier

Copier [l’exemple d’annonce](../scripts/notifications/examples/announcement.json) ou [l’exemple de changelog](../scripts/notifications/examples/changelog.json) dans un fichier local. Les exemples sont documentaires ; aucune publication réelle ne découle de leur présence dans Git.

Tous les champs sont obligatoires, avec `null` explicite pour les options. Aucun champ supplémentaire accepté, y compris dans les objets imbriqués.

| Champ | Contrat |
|---|---|
| `publication_key` | ASCII `[a-z0-9][a-z0-9._:-]{0,119}` ; identité définitive, jamais réutilisée pour corriger un contenu |
| `category` | `announcement` ou `changelog` |
| `title`, `body` | Texte brut utile, respectivement 1–200 et 1–20 000 caractères Unicode ; titre sur une seule ligne |
| `app_version` | SemVer stricte, maximum 64 caractères ; obligatoire pour changelog, sinon SemVer ou `null` |
| `action` | `null` ou exactement `{"kind":"notification_content"}` : consultation du contenu de cette publication. Aucun UUID, chemin, URL ou code fourni par l’opérateur |
| `requires_action` | **`false` seulement**. Aucune condition de résolution d’annonce n’est cadrée et réalisable dans le métier actuel ; `true` refusé par script et PostgreSQL |
| `include_new_users` | Booléen ; `true` étend l’audience tant que la publication reste active |
| `expires_at` | Date ISO avec fuseau, année 0001–9999 et maximum six décimales, ou `null` ; nouvelle publication exige une date strictement future au moment de son insertion serveur |
| `publication_context` | Exactement `reason` (texte utile 1–1000) et `include_new_users_justification` (`null` si exception désactivée, texte utile 1–1000 obligatoire sinon) |

Normalisation commune Node/PostgreSQL : CRLF/CR vers LF, Unicode NFC, trim du jeu d’espaces ECMAScript, expiration UTC à six décimales. Longueurs comptées en caractères Unicode, pas en unités UTF-16. Angle brackets, syntaxes de liens (`scheme://`, `www.`, protocoles HTTP/javascript/data/file/mailto, `//`), contrôles et directionnels invisibles interdits. Cette frontière n’est pas un assainisseur HTML : le corps reste du **texte**, à afficher comme texte en 8H. Les lecteurs 8G.2 construisent eux-mêmes `{kind:'notification_content',announcement_id}` ; ils ne recopient aucune action de stockage. Aucun lien complémentaire vers une autre route n’est livré.

```powershell
node scripts/notifications/publish.ts --file annonce.json --validate
```

Validation hors connexion : aucune URL PostgreSQL nécessaire, aucune base modifiée. Synthèse : clé, catégorie/version, longueurs, action, audience, expiration normalisée et SHA-256. Ni corps ni contexte privé affichés. Fichier local limité à 1 Mo. Une expiration passée peut encore valider structurellement : seul le serveur connaît l’existence d’une publication historique et son horloge au moment d’une écriture.

Empreinte v1 = SHA-256 UTF-8 du tableau JSON compact ordonné : `['my.notification.publication.v1',publication_key,category,title,body,app_version,action.kind ou null,requires_action,include_new_users,expires_at,reason,include_new_users_justification]`. Pas de date générée, UUID ou acteur dans cette empreinte. Elle inclut le contexte métier normalisé.

## Provisionner les identifiants hors Git

La migration crée `my_notification_publisher` LOGIN, **sans mot de passe**, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, limite de quatre connexions et aucune appartenance à un rôle. Avant provisionnement, l’authentification par mot de passe est inutilisable. Droits ajoutés : CONNECT à la base de la migration, USAGE sur `private`, EXECUTE sur les deux fonctions de publication/retrait uniquement. Aucun SELECT/DML/TRUNCATE sur les tables métier/Auth, aucune RPC utilisateur exécutable, aucun accès au helper de préparation. Le USAGE de `public` et les fonctions système ordinaires accessibles via PUBLIC ne donnent aucun droit métier ; ils ne sont pas retirés globalement aux autres rôles.

L’opérateur provisionne un secret long et unique dans son gestionnaire de secrets. Depuis un terminal de confiance équipé de `psql`, ouvrir une connexion administrative **Local**, avec saisie interactive du mot de passe :

```powershell
psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -W
```

Dans `psql` :

```text
SET password_encryption = 'scram-sha-256';
\password my_notification_publisher
\q
```

`\password` demande le nouveau secret et transmet son vérificateur chiffré, sans placer le mot de passe en clair dans une commande SQL, l’historique ou les logs serveur. Ne pas utiliser une commande `ALTER ROLE ... PASSWORD 'secret'`, une URL en argument de processus, un transcript PowerShell ou une variable `VITE_*`. Vérifier l’authentification SCRAM et les restrictions réseau de la base ; garder les seuls opérateurs de confiance sur cet hôte. Identité tracée = **`session_user` PostgreSQL réel**, ici `my_notification_publisher`, sans identité humaine auto-déclarée ou JWT. Un identifiant partagé ne distingue pas plusieurs personnes ; conserver cette responsabilité dans l’organisation opérateur.

Dans PowerShell, saisir le secret puis fournir la connexion uniquement à l’environnement du processus courant :

```powershell
$notificationCredential = Get-Credential -UserName my_notification_publisher -Message 'Publication Supabase Local'
$notificationPassword = [Uri]::EscapeDataString($notificationCredential.GetNetworkCredential().Password)
$env:MY_NOTIFICATION_DATABASE_URL = "postgresql://my_notification_publisher:${notificationPassword}@127.0.0.1:55322/postgres"
Remove-Variable notificationPassword, notificationCredential
```

Ne jamais afficher la variable ni la sauvegarder dans Git. Elle contient encore un secret dans la mémoire du processus ; fermer ce terminal après usage. La validation n’importe aucune connexion depuis le frontend ni depuis le statut Supabase. La commande d’écriture exige cette variable et vérifie `session_user=current_user=my_notification_publisher`, attributs non privilégiés et absence d’appartenance à un rôle.

## Publier, reprendre et retirer

```powershell
node scripts/notifications/publish.ts --file annonce.json --apply --environment local
node scripts/notifications/publish.ts --withdraw cle-publication --environment local
Remove-Item Env:\MY_NOTIFICATION_DATABASE_URL
```

En écriture, environnement explicite obligatoire. Modes mutuellement exclusifs, arguments inconnus/répétés refusés. Cible **Local** : boucle locale, port `55322`, base `postgres`, aucun paramètre URL ni fragment. Cible **Cloud** : procédure distincte ci-dessous, jamais déduite de cette URL, d’une variable frontend ou d’un projet lié Supabase CLI. Requêtes paramétrées aux seules `private.publish_notification_announcement(jsonb)` et `private.withdraw_notification_announcement(text)`, après vérification d’identité et de droits effectifs par `pg_catalog`. Timeout connexion 10 secondes, statement 15 secondes, borne client Cloud 17 secondes ; aucune relance automatique.

Publication réussie retourne `outcome='published'`, clé, UUID, date serveur et empreinte. **Un retry identique retourne exactement le même résultat**, sans nouvel UUID/date, y compris après expiration ou retrait. Le résultat est historique ; il ne promet pas que la publication demeure active. Même clé avec contenu/contextes différents : `publication_key_conflict`, sans écrasement. En cas de rupture de connexion ou réponse incertaine, conserver fichier/clé exacts et reprendre la même commande. Ne jamais contourner une incertitude avec une nouvelle clé.

Retrait réussi retourne `outcome='withdrawn'`, clé, UUID et date serveur. Retry conserve la première date. Clé inconnue : `notification_publication_not_found`. Retrait définitif : pas de réactivation, contenu/provenance et états individuels conservés ; nouvelle lecture du centre/compteur/contenu exclut immédiatement l’annonce. Une transaction de lecture déjà ouverte conserve son snapshot ; le writer de suivi revalide après toute attente et renvoie `obsolete` si le retrait a gagné.

Correction : retirer l’ancienne publication puis préparer une nouvelle clé. Aucune mutation de texte historique. L’expiration d’une nouvelle insertion déjà atteinte produit `notification_expiration_invalid`. `requires_action=true` produit `notification_action_unsupported` ; aucune action générique, bouton de validation libre ou endpoint de forçage. `process_announcement_notification` conserve les règles sûres de 8G.2.

Erreurs/outputs assainis, aucun objet d’erreur driver, SQL brut, secret, URL de connexion ou donnée Auth journalisé. Codes de sortie : 0 succès, 1 échec. UUID/date/hash identiques sur reprise permettent de reconnaître l’idempotence ; aucune valeur `replayed` variable ne modifie le résultat historique.

## Publication Cloud — cible et contrôles

L’[audit 8I.1](reports/2026-10-12-PHASE8I1-AUDIT-CLOUD-READINESS.md#8-publication-cloud-future-des-notifications) conserve les prérequis. Le checkpoint fourni confirme désormais rôle `my_notification_publisher` et migrations Cloud : attributs non administratifs, absence d’héritage/appartenance supérieure et d’accès aux tables métier contrôlées, deux EXECUTE privés autorisés, préparateur interne et publication par `anon`/`authenticated` refusés. [Résultats et limites 8I.2](reports/2026-10-12-PHASE8I2-CLOSURE.md#checkpoint-supabase-cloud-fourni). Ces contrôles historiques ne prouvaient ni connexion publisher/TLS réelle ni provisionnement de secret ; les [confirmations propriétaire PROD.7A](reports/2026-10-14-PROD7A-PUBLICATION-AUDIT.md#confirmations-manuelles-reçues-pour-prod7a) apportent depuis ces confirmations, sans publication visible. `NOINHERIT` ne soustrait pas aux privilèges PUBLIC ; revérifier les ACL effectives lors de la préparation dédiée. Ne pas recréer ce rôle ou réappliquer ses migrations pour adapter le script.

Publication future : environnement/projet explicitement sélectionnés, identifiants hors Git et frontend, rotation et révocation, identité PostgreSQL préservée, TLS vérifiant chaîne et nom d’hôte, puis validation du contrat et de l’audience. Même clé/contenu pour reprise incertaine ; correction par retrait puis nouvelle clé, aucun écrasement. Valider consultation/lecture/traitement/retrait sur fixtures isolées selon les limites de l’audit 8I.1 : une clé synthétique ne restreint pas l’audience et ne justifie pas une annonce de test visible aux utilisateurs réels. Le changelog produit est publié seulement après contrôle de la version effectivement déployée, vérifié actif puis conservé pour la réouverture. Aucun privilège `service_role` utilisé pour remplacer le rôle dédié.

PROD.6 réutilise `pg` et Zod installés, sans SQL/migration/permissions supplémentaires. Le [module de connexion](../scripts/notifications/database.ts) sépare Local et Cloud ; aucune découverte de projet, URL Cloud, variable `VITE_*`, accès Management API ou provisioning automatique. La cible fermée suit [cet exemple documentaire](../scripts/notifications/examples/cloud-target.json) : remplacer **tous** ses repères avant usage, conserver hors Git avec le dossier opérateur. Aucun secret dans ce JSON.

| Repère de cible | Vérification |
|---|---|
| `format`, `environment`, `project` | `my-notification-target-v1`, `cloud`, référence projet de 20 lettres ASCII minuscules, égale à `--project` |
| `connection`, `host`, `user` | `direct` : exactement `db.<project>.supabase.co` / `my_notification_publisher` ; `session` : hostname explicite `aws-<n>-<region>.pooler.supabase.com` ou `gcp-<n>-<region>.pooler.supabase.com`, login `my_notification_publisher.<project>` |
| `port`, `database`, `server_port` | Endpoint `5432`, base `postgres`, port serveur PostgreSQL réel `5432`. Supavisor transaction `6543`, dedicated pooler et autres endpoints refusés |
| `system_id` | Chaîne décimale exacte issue de `pg_control_system()`, comparée depuis la vraie session publisher ; jamais convertie en nombre JavaScript |
| `ca_file`, `ca_sha256` | Chemin absolu vers CA officielle sélectionnée par opérateur et SHA-256 exact des octets examinés. CA absente/modifiée bloque avant connexion |

Avant préparation réelle de la cible, un opérateur habilité devra relever sur **le projet attendu**, par connexion administrative TLS vérifiée :

```sql
select session_user, current_user, current_database(), inet_server_port(),
       (pg_catalog.pg_control_system()).system_identifier::text as system_id;
```

Cette connexion administrative sert uniquement au relevé/provisionnement futur. Le CLI publisher n’accepte jamais son identité comme substitution. `pg_control_system()` est déjà exécutable par le publisher Local ; aucun grant ajouté. Si Cloud interdit cette lecture, le CLI bloque : demander un cadrage autorisé, **sans élargir ses permissions ni retirer le contrôle**. Après restauration ou remplacement de cluster, un changement de `system_id` exige nouveau relevé/examen de cible et nouvelle autorisation ; aucune acceptation automatique. Le nom DNS direct et son certificat lient le projet ; Supavisor ajoute suffixe projet et comparaison du cluster réellement routé.

Avant toute écriture, le CLI exige `session_user=current_user=my_notification_publisher`, LOGIN, limite quatre connexions, NOINHERIT et cinq attributs administratifs désactivés, aucune appartenance. Base/port, réplication `origin` et isolation READ COMMITTED vérifiés. Droits effectifs : CONNECT, USAGE privé, aucun CREATE de base/schéma non système, aucun USAGE Auth, aucun droit de table **ou colonne** métier/Auth/Storage/migrations ni séquence, aucun objet possédé. Exactement deux EXECUTE public/private, sans GRANT OPTION ; signatures JSONB, owner `postgres`, VOLATILE DEFINER et `search_path=''` contrôlés ; rôles API sans EXECUTE. PUBLIC est inclus dans les contrôles effectifs. Fonctions système et droits PUBLIC historiques ne sont pas révoqués globalement.

TLS utilise CA explicite, `rejectUnauthorized:true`, chaîne et hostname vérifiés, minimum TLS 1.2, puis vérification du vrai `TLSSocket` négocié et autorisé. Une erreur CA/certificat/hostname/protocole interrompt ; aucun downgrade ni retry. Le CLI Cloud ne consomme **aucune connectionString** : champs URL `sslmode`, `sslcert`, `sslkey`, `sslrootcert`, `options` ou `ssl` sont refusés par le schéma fermé. `MY_NOTIFICATION_DATABASE_URL` renseignée, `NODE_TLS_REJECT_UNAUTHORIZED=0` ou variable `PG*` héritée non vide bloque Cloud. Retirer explicitement ces variables dans le terminal dédié ; elles ne sélectionnent jamais cible, startup options ou TLS.

Mode session uniquement si nécessaire pour IPv4 : le login routé doit encore produire les deux identités dédiées, même cluster et droits. Le socket vérifie la liaison **opérateur→pooler** ; `pg_stat_ssl` décrit la liaison serveur/pooler différente et ne prouve pas ce premier TLS. Configuration et garanties de la liaison Supavisor→PostgreSQL, CA effective, authentification du rôle et fonctionnement session restent contrôles manuels Cloud. Un pool qui substitue un autre `session_user` est refusé. Aucun mode transaction accepté même s’il exécute une requête.

## Cloud — secret, création, rotation et révocation

**Opérations futures uniquement, avec autorisation distante distincte.** Télécharger la CA depuis les paramètres Database/SSL officiels du projet ; comparer sa provenance et sa chaîne, relever son empreinte. Ne pas récupérer un certificat depuis un endpoint non vérifié puis lui faire confiance automatiquement.

Provisionner le rôle **déjà existant**, sans CREATE ROLE ni GRANT. Depuis `psql` récent sur poste de confiance, configurer les champs non sensibles sélectionnés et exiger `PGSSLMODE=verify-full`, `PGSSLROOTCERT=<CA officielle>`. Utiliser `psql -W` pour le mot de passe administratif interactif, puis `SET password_encryption='scram-sha-256';` et `\password my_notification_publisher` comme dans la procédure Local. Nommer le login administratif routé correctement si connexion session. Le nouveau secret long/aléatoire/unique provient du gestionnaire de secrets approuvé ; aucun mot de passe en SQL littéral, URL, arguments, fichier committé, transcript ou frontend.

```powershell
# Connexion administrative future, séparément autorisée ; jamais identité du CLI publisher.
$notificationCa = Read-Host 'Chemin absolu de la CA officielle examinée'
(Get-FileHash -LiteralPath $notificationCa -Algorithm SHA256).Hash.ToLowerInvariant()
$env:PGHOST = Read-Host 'Hostname officiel du projet attendu'
$env:PGPORT = '5432'
$env:PGDATABASE = 'postgres'
$env:PGUSER = Read-Host 'Login administratif habilité (suffixe projet si session)'
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = (Resolve-Path -LiteralPath $notificationCa).Path
try { psql -X -W }
finally {
  foreach ($notificationVariable in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGSSLMODE','PGSSLROOTCERT')) {
    Remove-Item -LiteralPath "Env:$notificationVariable" -ErrorAction SilentlyContinue
  }
}
```

Dans psql, vérifier cible/cluster et rôle existant avant `\password`. Aucun `PGPASSWORD` hérité accepté dans le terminal dédié. Aucun provisionnement automatique par le script MY.

La commande Windows [secrets.ps1](../scripts/notifications/secrets.ps1) utilise `Read-Host -AsSecureString`, BSTR libéré avec `ZeroFreeBSTR`, variable de processus temporaire et cleanup `finally`. Même convention PROD.4/5 ; aucune copie DPAPI persistante nécessaire. Le CLI retire lui-même `MY_NOTIFICATION_DATABASE_PASSWORD` de son environnement après chargement et à sa sortie. Effacer les variables Local héritées avant usage. Secrets restent brièvement en mémoire Windows/Node ; pas de promesse d’effacement RAM/pagefile/crash dump. Fermer le terminal après opérations ; respecter la politique d’exécution PowerShell approuvée, sans la désactiver automatiquement.

Rotation : suspendre/coordonner les publishers, refaire `\password`, mettre à jour le gestionnaire de secrets, fermer les sessions publisher concernées puis tester une **nouvelle** connexion avec `--check`. Vérifier refus de l’ancien secret et comportement de cache Supavisor selon son mode réel. Révocation : connexion administrative autorisée, `ALTER ROLE my_notification_publisher PASSWORD NULL;`, fermeture explicitement décidée des seules sessions publisher actives, refus d’une nouvelle connexion vérifié. Le changement du mot de passe ne termine pas les sessions ouvertes. Ne modifier aucun contenu historique, grant, gel ou rôle utilisateur. Aucun secret réel créé/roté/révoqué en PROD.6.

## Cloud — commandes PowerShell et autorisations

Ces commandes décrivent une **future intervention autorisée**. Ne pas les diriger vers Cloud pendant les validations Local/isolées. Préparer le [changelog `0.8.29`](../scripts/notifications/releases/0.8.29.json), fixer audience/expiration/contexte avec opérateur, puis valider hors connexion :

```powershell
$notificationFile = (Resolve-Path 'scripts/notifications/releases/0.8.29.json').Path
$notificationPreview = node scripts/notifications/publish.ts --file $notificationFile --validate | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Contrat non validé' }
$notificationPreview
# Après relevés indépendants et examen du fichier target.json hors Git :
$notificationProject = Read-Host 'Référence du projet Cloud attendu (20 lettres)'
$notificationTargetFile = Read-Host 'Chemin absolu du target.json examiné hors Git'
$notificationVersion = '0.8.29' # Version réellement vérifiée en étape E, pas preuve fournie par le CLI.
$notificationCheckArgs = @('--file', $notificationFile, '--check', '--environment', 'cloud',
  '--project', $notificationProject, '--target', $notificationTargetFile,
  '--expect-version', $notificationVersion, '--authorize-cloud-connect')
& ./scripts/notifications/secrets.ps1 -PublisherArgs $notificationCheckArgs
if ($LASTEXITCODE -ne 0) { throw 'Connexion/identité/droits non vérifiés' }
```

Examiner résultat `checked`, cible, identités, TLS, droits, **clé/catégorie/version/audience/expiration/hash**. Aucun corps ni contexte privé affiché. `--check` ne publie rien. `deployment_verified=false`, `maintenance_verified=false`, `freeze_verified=false` signalent les preuves absentes du CLI ; ne jamais les interpréter comme réussite de ces contrôles. `--expect-version` compare le fichier avec la décision opérateur, **sans lire Vercel ni certifier sa version servie**. Pour annonce ordinaire sans `app_version`, la version attendue reste contexte de livraison, sans changer le contrat nullable Phase 8.

Étape E obligatoire : backup terminé et vérifié, déploiement/commit/version réellement servis contrôlés par moyen protégé autorisé, maintenance Vercel et gel Supabase effectifs toujours actifs, aucune sauvegarde en cours, publisher/DDL coordonnés. Le publisher ne lit ni ne bascule le gel, ne modifie pas Vercel et ne donne aucun bypass frontend. Après ces preuves et consentement métier explicite, reprendre **le même fichier et hash examinés** :

```powershell
$notificationApplyArgs = @('--file', $notificationFile, '--apply', '--environment', 'cloud',
  '--project', $notificationProject, '--target', $notificationTargetFile,
  '--expect-version', $notificationVersion, '--authorize-cloud-connect',
  '--authorize-publish', '--expect-hash', $notificationPreview.content_hash)
& ./scripts/notifications/secrets.ps1 -PublisherArgs $notificationApplyArgs
if ($LASTEXITCODE -ne 0) { throw 'Résultat non confirmé ; conserver fichier/clé/hash et protections' }
```

Le fichier est lu/normalisé une seule fois ; toute différence de hash ou de version bloque avant connexion. Sortie NDJSON : précontrôle `checked`, puis reçu `published` uniquement après réponse conforme UUID/date/hash. **`checked` seul n’est jamais succès de publication.** Conserver fichier exact, clé, hash, cible et reçu dans dossier opérateur hors logs publics. Aucune nouvelle clé, relance automatique, modification historique ou réouverture après erreur.

Retrait distinct, décision explicite liée à la clé définitive examinée :

```powershell
$notificationWithdrawalKey = Read-Host 'Clé exacte de la publication dont le retrait définitif est autorisé'
& ./scripts/notifications/secrets.ps1 -PublisherArgs @('--withdraw', $notificationWithdrawalKey,
  '--environment', 'cloud', '--project', $notificationProject, '--target', $notificationTargetFile,
  '--authorize-cloud-connect', '--authorize-withdraw')
if ($LASTEXITCODE -ne 0) { throw 'Retrait non confirmé ; reprendre même clé après contrôle' }
```

## Relecture finale et réponse incertaine

Timeout, arrêt ou connexion perdue après appel : **issue incertaine**, aucun succès/échec définitif déduit. Après diagnostic et nouvelle autorisation, refaire précontrôle puis exactement même publication/fichier/clé/hash, ou même retrait/clé. Le serveur renvoie le résultat historique immuable et ne crée pas de doublon. Un reçu retrouvé après retrait/expiration ne réactive rien ; il ne prouve jamais visibilité actuelle.

Avec compte **réel éligible**, authentification et AAL2 conservés, utiliser les lecteurs autoritatifs existants `get_notification_center` (parcourir les pages), `get_notification_unread_count` et `get_notification_content(announcement_id)` ; comparer UUID, version, corps et `revision=content_hash`, contrôler une seule occurrence. Pendant maintenance, ces lectures peuvent passer directement par Data API authentifiée dans un outil de confiance autorisé, sans contourner le frontend. Ne pas exposer JWT/API credentials dans arguments ou logs ; ne pas appeler `mark_notification_read` ou `process_announcement_notification`, ni automatiser un parcours UI qui les déclenche. Les refus de ces writers pendant gel sont attendus pour les comptes ordinaires. Depuis PROD.7B.2.2, le `super_admin` Auth AAL2 éligible peut les utiliser normalement via les mêmes RPC ; cette exception backend ne change pas la présente vérification en lecture seule ni la maintenance frontend. Les lecteurs purs ne changent aucun suivi utilisateur.

Si compte trop récent, annonce expirée/retirée ou déjà traitée, l’absence au centre peut être conforme ; contrôler éligibilité et état réel au lieu d’inventer une nouvelle clé. Après retrait, relire centre/contenu et constater exclusion ; retry identique conserve première date de retrait. Correction du contenu : retrait autorisé de l’ancienne publication, puis nouvelle clé/contenu et nouveau consentement. Aucune modification du texte/hash historique. Lever gel puis maintenance seulement après preuves complètes selon [étape E](11-PUBLICATION-PRODUCTION.md#e--notification-et-réouverture).

## Tests et limites de mise en service

```powershell
npm.cmd test -- --project notifications --maxWorkers=1
$env:MY_SUPABASE_LOCAL_TEST='1'
try { npm.cmd test -- --project notifications --maxWorkers=1 }
finally { Remove-Item Env:MY_SUPABASE_LOCAL_TEST -ErrorAction SilentlyContinue }
npm.cmd run notifications:test:isolated
npm.cmd run db:test
```

Intégration Local refuse un rôle portant déjà un secret opérateur et un gel initial fermé. Secret SCRAM éphémère, fixtures réservées et mutex `830011`, trois vrais logins publisher, PostgREST/concurrence ; cleanup ciblé et PASSWORD NULL. Les tests ferment réellement le gel, publient/rejouent/refusent collision/retirent, prouvent droits et absence de suivi ; réouverture **explicite après succès** retrouve statut initial ouvert. Si scénario échoue pendant gel, diagnostic/reprise opérateur nécessaires avant restitution ; aucune ouverture automatique en `finally`.

Suite isolée : Docker local et image Supabase PostgreSQL `17.6.1.166` déjà installée (pas de pull), OpenSSL sur PATH ou Git Windows, bootstrap synthétique réutilisant l’isolation PROD.5 `--network none`, tmpfs sans volume ni port Docker publié. Proxy hôte uniquement loopback et routage DNS **réservé au banc de test**, absent du CLI livré. Cinquante migrations source dans cluster jetable ; aucune donnée personnelle/audience Production. Vraies négociations TLS, CA/hostname/expiration/protocole/absence TLS, droits effectifs altérés puis restaurés uniquement dans ce cluster, CLI et wrapper PowerShell réels, réponse perdue après commit et reprise. Aucune connexion Supavisor réelle démontrée.

Avant mise en service hébergée : autorisation distincte ; cible/CA réseau IPv6 ou session adaptés ; vrai mot de passe créé sans recréer rôle ; system_id et identité/ACL réellement vérifiés ; installation et essais Preview/Cloud du gel acquis selon PROD.7B.2.3, refus ordinaires et drainage Cloud encore à éprouver ; preuves maintenance/déploiement Production/backup acquises ; publication métier autorisée et relecture éligible/non-duplication effective. Ne publier aucune fixture de test sur audience réelle : une clé synthétique ne restreint pas cette audience. Le [rapport PROD.6](reports/2026-10-14-PROD6-NOTIFICATION-PUBLISHER.md) sépare preuves Local/TLS synthétiques et contrôles Cloud non exécutés.

Sources officielles consultées en PROD.6 : [Supabase connexions/SSL](https://supabase.com/docs/guides/database/connecting-to-postgres), [psql et CA](https://supabase.com/docs/guides/database/psql), [routage des rôles Supavisor](https://supabase.com/docs/guides/troubleshooting/tenant-or-user-not-found), [node-postgres TLS et overrides URL](https://node-postgres.com/features/ssl), [PostgreSQL identité/privilèges](https://www.postgresql.org/docs/17/functions-info.html), [roles](https://www.postgresql.org/docs/17/role-membership.html), [SCRAM](https://www.postgresql.org/docs/17/auth-password.html), [psql et `\password`](https://www.postgresql.org/docs/17/app-psql.html). Documentation publique et changelog ne constituent aucune observation des projets hébergés MY.
