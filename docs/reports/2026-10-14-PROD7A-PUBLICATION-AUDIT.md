# PROD.7A — Audit transversal du workflow de publication Production

Date : **14 octobre 2026**. Version auditée : **`0.8.29`**. Périmètre : PROD.1 à PROD.6, audit et cadrage uniquement.

## Verdict

**Le dispositif livré est substantiel et cohérent, mais la première répétition Production complète n'est pas encore autorisable sur les preuves disponibles.** Les protections SQL, le drainage ordinaire, la capture chiffrée, la restauration synthétique et le publisher idempotent existent. Les réglages de déploiement et le précontrôle publisher Cloud ont été effectués par le propriétaire. Ils ne sont plus à considérer comme des développements manquants.

Deux limites techniques précises restent visibles : aucun contrôle applicatif du nouveau frontend Production ne traverse le 503, alors que la procédure l'exige avant publication ; le chemin natif de sauvegarde Docker actuel ne dispose pas de route IPv6, contrairement à la connexion publisher réussie depuis Windows. Les capacités déjà livrées doivent être réutilisées avant de décider une correction ciblée.

Les autres blocages sont opérationnels : installation et preuve des protections Production, préparation de la capture/récupération sur les versions et droits réels, procédure des contrôles sous fermeture, puis répétition autorisée. **Aucune nouvelle architecture de publication, sauvegarde initiale Cloud supplémentaire, automatisation ou suite exhaustive n'est proposée.** PROD.7B et PROD.7C ne sont pas commencées.

## 1. État réel et méthode

| Repère | Initial | Final de PROD.7A |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `d6868f8f8b640c475816d4ecbd23e691b1a10426` (`v0.8.29`) | Identique |
| `git status --short` | Vide ; aucun changement staged | Uniquement ce nouveau rapport, non suivi ; aucun changement staged |
| `package.json` / lockfile / `packages['']` | `0.8.29` / `0.8.29` / `0.8.29` | Identiques |
| Migrations versionnées | **50**, dernières `20261013133423` et `20261013135415`, PROD.2 | Identiques |
| Référence locale `main` et `origin/main` | `d9b7bcc9364235c700b7b6d668824a6e68d37035` ; package `0.8.23`, 48 migrations, aucun `middleware.ts` | Identiques ; aucune actualisation réseau |
| Outils du poste | Node `24.20.0`, npm `12.1.0`, Supabase CLI `2.120.0`, `pg_dump` de l'image examinée `17.6` | Aucun outil installé ou mis à niveau |

La référence locale `main` est un **instantané Git local**, pas une lecture actuelle de GitHub ni une preuve de la version Vercel active. Aucun `fetch`, accès au projet Supabase Cloud ou aux consoles/API GitHub/Vercel. Les 50 migrations **appliquées Local** sont une preuve historique PROD.6 ; leur installation et l'état du gel personnel n'ont pas été relus ici. Aucun accès SQL au Local personnel, aucune fixture ni bascule sur cette base.

Lecture : [AGENTS.md](../../AGENTS.md), [architecture](../05-ARCHITECTURE.md), [base de données](../06-DATABASE.md), [roadmap](../08-ROADMAP.md), [notifications](../10-NOTIFICATION-PUBLICATION.md), [publication](../11-PUBLICATION-PRODUCTION.md), [backup/restauration](../12-SUPABASE-BACKUP.md), README et six rapports historiques. Inspection directe du middleware, des scripts/contrats/tests maintenance, backup, restore et notifications, des deux migrations PROD.2, du test SQL 039, des fonctions SQL de publication/lecture et du handler Edge `delete-account`. Les rapports ne remplacent pas ces contrats.

Documentation publique actuelle recherchée avec Context7 puis confrontée aux pages officielles Supabase/Vercel. Changelog Supabase public consulté. Ces consultations ne sont **aucun accès au projet Cloud MY.**

### Vérifications exécutées dans cet audit

| Vérification | Résultat et portée |
|---|---|
| Git, trois versions via Node, inventaire de migrations et références locales | Cohérents avec le tableau ; aucun état distant déduit |
| `node --test scripts/maintenance/operator.test.js scripts/backup/operator.test.js scripts/backup/restore.test.js` | **15/15 PASS** : arguments/cibles/consentements, décimales exactes, HTTP simulé, chiffrement/GCM et refus des destinations ; aucun accès DB ou Cloud |
| `node scripts/notifications/publish.ts --file scripts/notifications/releases/0.8.29.json --validate` | `validated`, version `0.8.29`, clé `my.release.0.8.29`, hash `c982d27302634694d79d9397415162a752dee5a309e0b4505ac636c9ac811189` ; aucune connexion/publication |
| Inspection Docker du bridge et de l'image déjà présente | `EnableIPv6=false`, réseau `172.17.0.0/16` ; image ID `sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86` |
| Deux conteneurs temporaires `--rm --pull=never`, sans volume | `pg_dump --version` sous `--network none` : `17.6` ; lecture `/proc/net/ipv6_route` sous bridge : uniquement loopback, aucune route IPv6 extérieure ; aucun trafic Cloud, dump, restore ou modification réseau |
| Rapport, liens locaux et diff | Contrôlés à la clôture ; seul ce rapport créé |

Aucune relance pgTAP, intégration SQL/REST/Auth/Edge, campagne Local de gel, capture/restauration synthétique ou suite frontend complète. Aucun build applicatif nécessaire pour ce changement documentaire. Les preuves chiffrées suivantes sont attribuées aux rapports qui les ont produites, pas à PROD.7A.

## 2. Inventaire des composants et provenance des preuves

| Composant | Implémentation actuelle et invariant | Preuves acquises | Limite actuelle |
|---|---|---|---|
| **PROD.1**, `0.8.24` | [middleware](../../middleware.ts), [page](../../vercel/maintenance-page.ts), [configuration](../../vercel.json), tests `vercel/*` ; seul booléen `false` ouvre, lecture cohérente sans ancien état de secours, deadline 3 s, page autonome 503/HEAD/anti-cache ; aucun bypass | [Rapport PROD.1](2026-10-13-PROD1-MAINTENANCE.md) : 61 tests ciblés, artefact Node officiel exécuté sans sources TS, navigateur/axe Local. Activation/503/headers/route directe/réouverture Preview rapportés par propriétaire | Installation et couverture Production non établies ; Authentication ne traverse pas la maintenance |
| **PROD.2**, `0.8.25` | [Migration initiale](../../supabase/migrations/20261013133423_prod2_business_write_freeze.sql) et [barrière](../../supabase/migrations/20261013135415_prod2_freeze_admission_barrier.sql) ; singleton privé, 23 triggers, 11 writers RPC gardés, 15 fonctions contrôlées ; identité `session_user`, barrière `771403` jusqu'au commit | [Rapport PROD.2](2026-10-13-PROD2-WRITE-FREEZE.md), redémonstration [PROD.6](2026-10-14-PROD6-NOTIFICATION-PUBLISHER.md) : 83 assertions ciblées, 13 groupes, 98 refus SQL/78 REST, Auth et Edge réels Local | **Pas installé Cloud**, selon propriétaire ; aucune preuve de refus/drainage Cloud |
| **PROD.3**, `0.8.26` | [CLI](../../scripts/maintenance/cli.js), [DB](../../scripts/maintenance/database.js), [HTTP](../../scripts/maintenance/http-check.js) ; cible/révision exactes, commit puis connexion indépendante, observations assainies, réouverture explicite | [Rapport PROD.3](2026-10-13-PROD3-COORDINATION.md) : 5 tests unitaires, 10 groupes Local de coordination/concurrence/reprise ; 5 unitaires relancés dans PROD.7A | CLI DB **Local seulement** ; `backup_authorized=false`, `global_closure=not_attested` ; contrôle HTTP échantillonné, pas version applicative ni propagation globale |
| **PROD.4**, `0.8.27` | [CLI](../../scripts/backup/cli.js), [DB](../../scripts/backup/database.js), [clients](../../scripts/backup/clients.js), [contrat](../../scripts/backup/contract.js), [crypto](../../scripts/backup/secure-files.js), [wrapper](../../scripts/backup/secrets.ps1) ; archive complète custom, snapshot partagé, inventaires, séquences aux bornes, AES-GCM, sept fichiers hors Git | [Rapport PROD.4](2026-10-13-PROD4-BACKUP.md), confirmation [PROD.5](2026-10-13-PROD5-RESTORE.md) : 6 unitaires, 15 tests isolés dont snapshot/erreurs natifs ; 6 unitaires relancés | Aucun backup Cloud ; droits d'export, transport Docker, clients et inventaire externe à vérifier. Succès = intégrité, pas récupération |
| **PROD.5**, `0.8.28` | [restore](../../scripts/backup/restore.js), [isolation](../../scripts/backup/isolated.js), [DB restore](../../scripts/backup/restore-database.js), fixtures/tests ; archive PROD.4, cible neuve identifiée, owners/extensions/ACL conservés, restore natif transactionnel, comparaison indépendante | [Rapport PROD.5](2026-10-13-PROD5-RESTORE.md) : 29 tests isolés, 55 tables synthétiques comparées, 83 assertions SQL ; vrai GoTrue `2.197.0`, password/TOTP original/AAL2/refresh ; 4 unitaires relancés | CLI **isolé PG17 seulement**, mêmes versions/locale/extensions ; aucun mode de restauration sur projet Cloud existant. `application_recovery_proven=false`, `production_recovery_proven=false` |
| **PROD.6**, `0.8.29` | [publisher](../../scripts/notifications/publish.ts), [connexion](../../scripts/notifications/database.ts), [contrat](../../scripts/notifications/contract.ts), [wrapper](../../scripts/notifications/secrets.ps1), [payload](../../scripts/notifications/releases/0.8.29.json) ; cible Cloud explicite, TLS/cluster/ACL, hash/version et consentement séparés, même clé au rejeu | [Rapport PROD.6](2026-10-14-PROD6-NOTIFICATION-PUBLISHER.md) : 112 tests notifications Local, 20 TLS/PG isolés dont commit réel sans reçu ; `--check` **Cloud réel réussi selon propriétaire** | Aucun changelog Cloud publié ; visibilité réelle sous gel à établir. `--check` ne certifie ni frontend, ni maintenance, ni gel |

Le dernier rapport PROD.6 consigne aussi 39 fichiers/3 873 assertions PostgreSQL et 2 535 tests applicatifs/outils réussis, avec dix tests DB opt-in ignorés par la suite standard et exécutés séparément dans les campagnes concernées. Ces chiffres restent historiques. Aucune nouvelle preuve navigateur ou de restauration Cloud ici.

### Confirmations manuelles reçues pour PROD.7A

**Les éléments de cette section sont rapportés par le propriétaire ; Codex ne les a pas revérifiés.** Ils remplacent les anciens états déclarés, sans réécriture des rapports historiques.

| Plateforme | État confirmé |
|---|---|
| Supabase GitHub | Projet MY. lié à `Palmyna/my.`, working directory `.`, **Deploy to production activé**, branche `main`, aucune branche Preview |
| Historique Cloud | Dernier contrôle connu : **48 migrations**, contre 50 fichiers sur `dev` ; différence = les deux migrations PROD.2 ; gel non installé |
| Publisher Cloud | Rôle `my_notification_publisher` avec attributs attendus, SCRAM provisionné, connexion directe IPv6 réussie, CA officielle/TLS `verify-full` vérifiés |
| Identité et check Cloud | `system_id` exact **`7678069749886157684`** ; `--check` réel PROD.6 : `TLS=verified`, `permissions=verified` ; aucune notification publiée |
| Vercel | Branche Production `main` ; **Auto-assign Custom Production Domains désactivé** ; futurs builds Production en attente de promotion manuelle |
| Maintenance | PROD.1 éprouvée sur Preview ; répétition coordonnée Production restante |

Les documents consignent aussi, historiquement selon propriétaire, domaine `my.collectrealm.com`, Vercel Authentication All Deployments, variables Supabase uniquement Production, Auth/redirections et Resend configurés. Ces éléments n'ont pas été reconfirmés par le prompt PROD.7A : les lire à la mise en service avant de les prendre comme préconditions actuelles.

## 3. Matrice de la chaîne A à E

Les commandes ci-dessous sont **un inventaire des capacités existantes**, pas une procédure nouvellement exécutée ni une autorisation d'opération. La [référence actuelle](../11-PUBLICATION-PRODUCTION.md) conserve l'ordre. Un checkpoint réussi ne donne aucun consentement automatique pour l'étape suivante.

| Étape | Préconditions | Commandes/moyens existants | Preuves et résultat attendu | Échec ou résultat incertain |
|---|---|---|---|---|
| **A — Préparation** | Livraison `dev` examinée, compatibilité frontend/backend/reprise Phase 8, commit/version fixés, source propre avant capture, contenu public et audience examinés | Tests/build habituels selon changements ; comparaison des trois versions ; publisher `--file <fichier> --validate` hors connexion | Version package/lock/payload identique ; clé/hash stables ; changelog = corps de la publication `category=changelog` ; aucune diffusion | Corriger livraison/payload avant B ; ne pas inventer `CHANGELOG.md` ou seconde annonce. Un hash modifié exige nouvel examen |
| **B1 — Fermeture frontend** | Middleware réellement installé dans Production active et déploiements exposés ; connexion serveur Global Config, clé Production et variables système disponibles ; accès Vercel autorisé | Dashboard : `maintenance_production=true` ; `npm.cmd run maintenance:http -- --print-browser --expect closed` ; navigation/Network si CSP interdit fetch | Même deployment ID pendant bascule ; GET/HEAD 503 MY., anti-cache, routes/HTML/assets et URLs inventoriées fermés ; limites de propagation notées | Arrêt avant C ; ancien déploiement sans middleware n'est pas protégé. Réparer fermeture ; aucune promotion, suppression de clé ou ouverture temporaire pour tester |
| **B2 — Gel et drainage** | Deux migrations PROD.2 installées, identités/contrat/ACL vérifiés ; aucune autre bascule opérateur ; coordination des exceptions | Sur Cloud : connexion PostgreSQL opérateur TLS, fonctions privées `get_business_write_freeze()`/`set_business_write_freeze(true)`, lectures sessions/locks documentées. `maintenance:db preflight/observe/close/verify-closed` existent **seulement Local** | Borne = **commit**, puis relecture indépendante système/révision/frozen ; 23 gardes/15 fonctions attendues, SQL PT503/REST 503, Auth/Edge selon leur contrat, zéro lock d'admission résiduel/transaction préparée | État inconnu reste inconnu ; lire depuis connexion neuve avant toute reprise. Blockers/timeouts/deadlocks à diagnostiquer ; pas de kill ou réouverture automatiques |
| **C — Capture** | B établi, PROD.2 présent, clients/transport/droits réels compatibles, historique préfixe exact, exceptions/DDL/config exclus durablement, Auth/séquences pris en compte, coffre/clé/inventaires valides | `backup --command plan --environment cloud --project <ref> --config <target>` hors connexion ; wrapper `secrets.ps1` + `capture --authorize-cloud --authorize-sensitive-export` ; puis `verify` hors connexion | `capture_integrity_verified`, sept artefacts chiffrés, pas `INCOMPLETE`, GCM/SHA/lecture native complets, même snapshot et séquences aux bornes ; manifeste/source/borne identifiés ; récupération examinée | Ne pas créer PR de livraison ; conserver fermeture. Dossier partiel jamais réutilisé ; nouvelle capture seulement après cause corrigée et décision. `restore_proven=false` n'est pas un échec de capture, mais sa limite |
| **C — Capacité de récupération** | Archive authentique/clé indépendante, inventaire enrichi, cible isolée exacte neuve, versions/locale/extensions/rôles compatibles, aucune sortie vers services réels | Wrapper existant `-Tool Restore` : `preflight`, `create --authorize-create`, `inspect`, `execute --authorize-isolated-restore --expect-manifest-sha256`, `destroy --authorize-destroy` | `isolated_postgresql_restored_data_verified` et contrôles données/sécurité ; essais Auth et applicatifs/externe distincts ; plan adapté pour projet Cloud existant | Ne pas certifier Production. Conserver rapport/borne ; destination partielle jetable, reprise sur nouvelle cible expressément choisie. Aucun reset Local ni restore Cloud via ce CLI |
| **D1 — Merge et déploiements** | B/C validés, PR `dev`→`main` approuvée, contenu/migrations compatibles ; intégrations et attente de promotion recontrôlées | PR/merge classique ; déploiement Supabase GitHub et build Vercel Production ; lecture statuts/logs/historique | SHA **final de merge sur `main`** identifié ; backend migrations/fonctions corrects, services/config conservés ; build Production du même SHA prêt, domaine encore sur ancienne Production fermée | Garder fermeture ; backend partiellement migré possible. Lire historique et effets ; pas de promotion sur simple build `Ready`, pas de réapplication/repair/reset aveugles |
| **D2 — Promotion** | Succès réel Supabase, compatibilité validée, build Production exact et maintenance persistante, moyen de contrôle opérateur résolu | Promotion manuelle du build Production attendu, sans rebuild ; lecture deployment ID/SHA/environnement/domaines | Domaine assigné au bon build ; variables Production ; HTTP fermé ; contrôle frontend/version réellement servi conforme au moyen validé | Résultat incertain : relire affectation des domaines et ID, conserver maintenance/gel ; pas de seconde promotion aveugle |
| **E1 — Publication** | Capture terminée/validée, aucune sauvegarde en cours, nouveau frontend/backend vérifiés, maintenance et gel encore effectifs, fichier/hash/version examinés, autorisation métier | Wrapper notifications + `--check --environment cloud --project --target --expect-version --authorize-cloud-connect`, puis `--apply --authorize-publish --expect-hash` sur même sélection | `checked` pour TLS/identité/ACL puis reçu `outcome=published`, UUID/date/hash ; une seule publication changelog ; lecture centre/compteur/contenu AAL2 éligible, unicité et `revision` = hash | Même fichier/clé/hash après réponse perdue, aucune nouvelle clé. Reçu historique seul ne prouve pas annonce active ; garder fermeture, relire visibilité. Retrait exige autorisation distincte |
| **E2 — Réouverture** | Publication/visibilité et compatibilité établies, preuve frontend acquise, décision explicite propriétaire ; aucun état inconnu restant | Opérateur SQL : levée gel, commit/relecture puis contrôle des écritures ; Global Config `maintenance_production=false` ensuite ; HTTP `--expect open` et navigateur | Backend ouvert vérifié avant frontend ; domaine/version/routes/Auth/MFA/lecture/mutation/notification corrects ; aucune opération Phase 8 renouvelée sans son UUID/token/reçu exact | Gel ou frontend ouvert partiellement : arrêter, décider maintien/rétablissement contrôlé, examiner effets intervenus ; aucun script ne restaure automatiquement l'état antérieur |

### Dépendances avant la première exécution régulière

1. **PROD.1 doit être effectivement installé en Production avant B1.** Une clé Global Config ne ferme pas un ancien frontend sans middleware. La référence locale `main` ne contient pas PROD.1 ; l'état Vercel réel doit être lu avant de décider l'installation existante nécessaire. Les confirmations Preview ne résolvent pas ce prérequis.
2. **PROD.2 doit être installé avant B2 et C.** `capture` appelle le contrôle du gel et exige au moins 50 migrations installées. Il ne peut pas sauvegarder le Cloud au checkpoint de 48 migrations avec cet outillage. Attendre que le premier merge D installe PROD.2 créerait une dépendance circulaire B/C/D.
3. La **première installation manuelle PROD.2**, déjà prévue en PROD.4/5, reste un prérequis distinct autorisé par le propriétaire. Installer les deux fichiers du même commit avec historique correctement enregistré ; singleton initial **ouvert**, puis fermeture explicite seulement après contrôles. Une installation SQL hors outil ne doit pas laisser des versions absentes de l'historique, sinon l'intégration tentera de les rejouer.
4. Après installation, le prochain déploiement GitHub doit constater ces versions et les ignorer ; aucune application en double. Les installations initiales du dispositif ne sont pas une répétition réussie A–E. Leurs autorisations, cibles et résultats doivent être consignés.

Ce rapport **n'ajoute aucun mécanisme de backup initial** pour cette installation et ne tranche pas ses opérations distantes. Il maintient le backup PROD.4 à l'étape C des publications régulières, après protections réellement installées et fermées.

## 4. Interfaces maintenance, gel et opérations en cours

### Frontière SQL et exceptions

La deuxième migration donne aux writers ordinaires le verrou partagé transactionnel `771403`, puis une lecture verrouillée du singleton. La bascule obtient l'exclusif : les writers déjà admis doivent committer/rollback avant la fermeture effective. Les transactions commencées avant mais non admises attendent puis lisent fermé ; anciens snapshots RR/SERIALIZABLE peuvent échouer `40001`. Le délai CLI est un timeout, jamais une preuve de drainage.

`session_user` protège aussi les SECURITY DEFINER : `current_user=postgres` dans une RPC appelée par `authenticator` ne donne aucune exception. Les claims, JWT, métadonnées, headers et `SET ROLE service_role` ne transforment pas une session API en opérateur. Les triggers de statement protègent aussi une mutation zéro ligne ; les gardes RPC précèdent les noops/rejeux. Lecteurs et reçus restent disponibles, les writers de rejeu restent refusés pendant gel.

| Chemin | Comportement livré | Preuve Cloud à acquérir sans transposer la suite Local |
|---|---|---|
| SQL ordinary / REST / RPC / service role API | Refus `PT503/business_writes_frozen`, REST 503 ; identité réelle authenticator | Vérifier les identités et gardes réelles ; probes sans lignes/séquences ou fixtures expressément autorisées ; anciens JWT/onglets inclus |
| Signup/admin création et hard delete Auth | INSERT/DELETE `auth.users` refusés avant triggers MY. ; pas de compte/profil partiel | Constater absence de création/destruction ; statut Auth peut être 500 générique, pas obligation de 503 |
| Login/password/email/MFA/refresh/révocation | UPDATE et tables internes Auth continuent ; aucun gel total Auth revendiqué | Inventorier leurs écritures et leurs effets externes ; snapshot partagé et contrôle de séquences pour C |
| Edge `delete-account` | Password/TOTP frais, révocation globale, puis hard delete ; gel peut donner 503 `deletion_failed` après révocation | Compte/données conservés, sessions révoquées restent révoquées ; reconnecter après ouverture. Ne pas attendre conservation des sessions initiales |
| Opérateurs PostgreSQL / imports / migrations | Exceptions SQL de confiance, hors drainage ordinaire | Exclusion durable avant et pendant capture, inventaire des sessions/jobs ; échantillon vide insuffisant |
| Publisher dédié | Deux fonctions privées autorisées ; exception limitée aux INSERT/UPDATE d'annonces ; aucun état utilisateur/DML direct/bascule gel | Check réel revalidé si état évolue ; publication métier seulement E, jamais pendant C |

Aucune minuterie de réouverture, aucun `finally` qui désactive protections, aucun rollback Vercel qui restaure DB. Le cleanup d'une fixture ne constitue pas une décision d'ouverture. La maintenance HTTP ne révoque ni bundle déjà chargé ni session Supabase : les refus backend sont indispensables.

### Contrôles opérateur sous HTTP 503

**Ce qui est réalisable aujourd'hui :** session Vercel normale et navigation/Network pour vérifier HTTP ; dashboard pour build/SHA/domaines/config ; connexion SQL opérateur privée pour état/locks/contrat ; lecteurs Supabase purs avec identité AAL2 éligible pour catalogue/reçus/notification. La CSP de la page maintenance bloque fetch : utiliser un onglet autorisé conservé avant fermeture, ou Network, comme déjà documenté. Aucun bypass public requis pour ces contrôles.

**Ce qui ne l'est pas avec le code livré :** charger et exercer le **nouveau** frontend Production sur son domaine ou son URL de déploiement pendant `maintenance_production=true`. `middleware.ts` ne distingue aucune identité opérateur. Vercel Authentication et un header de protection plateforme ne changent pas cette règle. Ancien onglet chargé = ancien bundle, pas nouvelle version ; `maintenance:http --expect open` vérifie HTML 200/root, pas `__APP_VERSION__`.

La version est injectée par [Vite](../../vite.config.ts) et affichée au [footer](../../src/app/SiteFooter.tsx). Le 503 autonome ne la publie pas. Lire package, artefact et SHA du dashboard prouve le **build sélectionné** ; cela ne suffit pas à la preuve applicative explicitement exigée en E et dans docs 11, « Contrôles opérateur ».

PROD.7B doit vérifier d'abord si un accès existant et protégé aux **artefacts exacts** permet leur exécution isolée avec des contrôles adéquats. Cette preuve resterait une exécution de l'artefact en isolation, pas une navigation sur le domaine fermé. Si elle est retenue comme preuve de compatibilité, le propriétaire doit valider explicitement cette précision du critère ; ne pas l'assimiler silencieusement au critère actuel. Si le parcours hébergé avant E reste obligatoire, une **capacité de contrôle minimale réservée à l'opérateur côté serveur** manque. La cadrer et proposer une correction ciblée PROD.7B, puis l'éprouver PROD.7C : identité authentifiée et autorisation vérifiées, aucun secret client/header libre/cookie/paramètre public ou exception de hostname, refus des utilisateurs ordinaires et gel conservé. Aucune solution nouvelle choisie ou implémentée dans cet audit.

## 5. Capture, secrets et récupération

### Compatibilité réelle à établir

- **Transport distinct :** publisher `pg` fonctionne depuis le poste Windows selon propriétaire ; le dump natif est lancé par `dockerArgs()` sur **`--network bridge`**. Bridge actuel IPv4, absence de route IPv6 extérieure constatée sans accès Cloud. **La cible directe IPv6 ne peut pas être atteinte par ce conteneur actuel.** C'est une limite démontrée du chemin de capture, pas un échec de connexion Cloud observé.
- Le décodeur backup accepte déjà une cible **Supavisor session AWS port 5432**, login `postgres.<ref>`, et exige les identités serveur `postgres`, le même cluster et TLS. Cette option peut fournir un chemin existant IPv4, mais **compatibilité session, droits, TLS backend et partage du snapshot entre `pg` et `pg_dump` ne sont pas prouvés Cloud**. Pas de pooler transaction 6543, pas de downgrade TLS. Le publisher accepte aussi des hostnames session GCP ; le backup actuellement seulement AWS : pas d'uniformisation nécessaire tant que MY. utilise une cible prise en charge.
- **Version :** `pg_dump=17.6` constaté. Le moteur exige même majeure et mineure client au moins serveur. Une annonce fournisseur de passage 17.11 ne prouve pas la version MY. ; si Cloud >17.6, la capture refusera volontairement cette image. Destination restore actuelle exige PG17, version serveur numérique et client restore identiques à l'archive, locale `en_US.UTF-8`, extensions exactes. Préparer une image adaptée après relevé réel, sans upgrade du Local personnel.
- **Droits :** le check publisher ne prouve aucun droit du login `postgres` pour exporter toutes les tables Auth/gérées, séquences, schémas, large objects, catalogues et snapshot ; `identity()` exige aussi visibilité complète et SSL. Une permission manquante ou warning natif bloque, sans omission silencieuse.
- **Périmètre :** capture refuse Storage/Vault non vides, foreign tables et certaines données d'extensions non exportables. Usage Cloud inconnu : inventaire obligatoire. Cela ne justifie pas d'avance un nouveau chantier blobs/Vault ; adaptation seulement si utilisation réelle constatée.
- **Charge :** restore limite chaque artefact chiffré à 512 MiB ; JSON déchiffré à 32 MiB, TOC à 16 MiB ; hashes complets calculés côté PostgreSQL, statements backup limités à 60 s. Volume/temps Cloud inconnus : comparer aux résultats de capture, sans supprimer limites ou lancer un projet performance abstrait.

### Cohérence et clé de récupération

Le moteur capture utilise un snapshot `REPEATABLE READ READ ONLY` exporté et partagé avec `pg_dump`, garde le verrou partagé de gel et contrôle état/révision. Données MY., Auth et historique transactionnels proviennent de cette borne. Les séquences sont hors MVCC : égalité exacte aux bornes exigée, caches internes non reconstitués. Une séquence Auth qui avance peut faire refuser la capture malgré le gel métier ; identifier/coordonner ce writer avant nouvelle tentative, pas affaiblir le contrôle.

Coordination durable des opérateurs/imports/DDL/rôles/config jusqu'à fin indispensable ; le snapshot ne fige pas la plateforme, les emails, les clés ou les objets externes. Le fichier `evidence.json` reste une attestation opérateur avec références, pas une vérification automatique Vercel. `external.json` exige les catégories Auth/SMTP/MFA/API/réseau/intégrations/Edge/chiffrement/Storage, des relevés non vides, et références de secrets séparées.

Sept artefacts chiffrés AES-256-GCM hors dépôt et synchronisation, ACL restrictives, clé 32 octets sauvegardée dans coffre **indépendant**. La copie DPAPI de travail dépend du poste/compte Windows : elle n'est pas la seule clé de récupération. Vérifier accès effectif depuis la situation de récupération envisagée, CA/hash, password DB/publisher, Resend, URL/clés API, signature et déchiffrement Auth. Les mots de passe PostgreSQL ne sont pas restaurés par l'inventaire de rôles. Une référence au coffre ne garantit pas que Supabase expose une clé managée ou qu'elle survivra au sinistre.

### Restauration démontrée et récupération encore non démontrée

PROD.5 démontre une restauration native fidèle sur un **cluster neuf indépendant**, avec comparaison de données/séquences/owners/ACL/RLS/policies/fonctions/historique et vrais comptes/TOTP synthétiques avec clés disponibles. Les tests négatifs montrent que la perte de clé MFA ou le changement de signature peut empêcher login/token. Le CLI restore ne démarre pas à lui seul React/PostgREST/Edge/SMTP ; les essais GoTrue appartiennent au banc synthétique.

Le projet Cloud existant possède déjà rôles et schémas gérés ; l'opérateur n'a pas le bootstrap `supabase_admin` utilisé dans le banc neuf. **Le CLI PROD.5 refuse une destination Cloud et non vide.** Ce n'est pas un défaut à corriger par `--clean`, `--no-owner`, `--no-acl`, suppression de schémas ou reset personnel. La capacité de récupération du projet réel doit encore être cadrée avec les droits et mécanismes Supabase effectivement disponibles : adaptation par objet, ordre, paramètres externes et preuve isolée de l'archive authentique. Aucun nouveau mécanisme de capture n'est demandé.

Une première vraie capture PROD.4, ensuite restaurée en isolation adaptée, apportera une preuve différente du restore synthétique. Elle n'est pas autorisée par PROD.7A. Le dossier doit distinguer **restaurabilité des octets**, **compatibilité services/Auth**, et **retour au projet Cloud existant** ; ce dernier n'est pas certifié par la seule cible jetable.

RTO/RPO Cloud inconnus. Les secondes mesurées sur petit jeu PROD.5 ne sont pas une durée Production. Toute récupération revient à une borne : reçus, notifications et écritures Auth postérieures peuvent manquer ; emails/révocations déjà émis ne s'annulent pas. Analyser les opérations Phase 8 concernées avant reprise, jamais nouvel UUID/token aveugle après absence de reçu.

## 6. GitHub, Supabase et Vercel

### Effets attendus de l'intégration Supabase actuelle

Documentation officielle consultée : GitHub **Deploy to production** déploie les changements lors des pushes/merges sur la branche Production. Aucun workflow `.github` n'est nécessaire. Les migrations sans entrée historique s'appliquent ; une version historique sans fichier correspondant fait échouer l'étape. Les transactions sont par fichier, **pas sur toute la livraison**. Les deux migrations PROD.2 ont aussi BEGIN/COMMIT ; succès d'un fichier n'atteste pas succès du second ni de l'étape Edge suivante.

Sur branche persistante Production, la documentation actuelle indique que l'étape de configuration des services depuis `[db]`, `[api]`, `[auth]`, `[storage]`, `[experimental]` est **ignorée sans bloc `[remotes]` visant ce projet**. Le dépôt n'en contient aucun. Les URLs localhost de `config.toml` ne sont donc **pas un écrasement Auth/SMTP avéré ni une correction TOML obligatoire** dans le workflow actuel. Contrôler les logs et les réglages réels avant/après déploiement ; l'ajout ultérieur d'un bloc remotes changerait cette conclusion.

Les autres sections restent pertinentes aux étapes migrations/deploy : `[db.migrations].enabled=true`, seed désactivé, aucun bucket Storage déclaré, aucune valeur de secret Edge déclarée. `[functions.delete-account].verify_jwt=false` est déclaré : l'intégration peut déployer cette fonction ou modifier son paramètre JWT selon checksum/config réellement déployés. Le handler vérifie lui-même utilisateur/password/TOTP ; `verify_jwt=false` n'est pas absence de contrôle applicatif. Vérifier bundle/SHA, configuration et secrets existants ; ne pas supposer « migrations uniquement ». Aucun réimport catalogue/reset/seed ni suppression de buckets n'est prévu par le dépôt.

Auth/SMTP/Resend/providers/clés et objets Storage existants restent des paramètres à inventorier et vérifier, sans affirmer qu'ils ont été modifiés. La documentation décrit Configure → Migrate → Seed → Deploy avec étapes dépendantes ; un échec après migration peut laisser DB avancée et Edge ancienne. Aucun succès Vercel ne remplace l'analyse de ce résultat.

### Promotion et preuve de livraison

Le réglage confirmé Vercel conserve **build Production et variables Production**, puis promotion manuelle sans rebuild. Le build est accessible par URL générée, mais le middleware y lit toujours `maintenance_production` : cet accès ne résout pas le contrôle applicatif fermé. Promouvoir un Preview peut reconstruire ; ce n'est pas le chemin retenu. Pas de variables Supabase Production dans une Preview ordinaire pour contourner le problème.

À relever avant le merge : états d'intégration, branche/workdir, absence de Preview Supabase, SHA de `main` et Production active, réglage d'assignation Vercel et inventaire des URLs. À relever après : SHA **du merge**, deployment IDs backend/frontend, noms/versions/statements pertinents des migrations, fonction Edge et compatibilité réelle, alias/domaines et version applicative. Le SHA `dev` peut différer du merge classique ; une comparaison directe de ces deux SHA serait un faux échec.

Le réglage d'attente porte sur les domaines ; il n'empêche pas Supabase de migrer ni le nouveau build d'utiliser les services Production. Maintenance Production persistante et All Deployments doivent couvrir les URLs exposées. Aucun push/merge sur `main` « documentaire » ne doit être supposé sans effet après activation de l'intégration. Les deux déploiements peuvent partir en parallèle : **la décision de promotion** est la barrière après backend vérifié.

Rollback frontend uniquement vers un déploiement éligible, compatible avec schéma courant et équipé de la même maintenance/connexion. La référence locale `main` sans middleware souligne ce risque ; lire les déploiements réels éligibles. Un rollback Vercel ne restaure ni migrations, données, Auth, Edge ou notifications, et réutilise l'environnement de l'ancien build. Aucune restauration DB ou réouverture automatiquement liée à un rollback.

## 7. Notifications et visibilité

Le check Cloud réussi fourni par le propriétaire ferme la question de la **faisabilité initiale directe** : réseau hôte, identité du rôle, cluster, TLS et permissions ont déjà été contrôlés. Ne pas reprovisionner le rôle/password ni élargir ses droits « par précaution ». Réexaminer cible/CA/cluster et relancer check en lecture seule à l'étape E après migration/rotation si nécessaire, avec autorisation de connexion distincte.

Le publisher n'a pas de lecture directe des données métier ni accès au contrôle du gel. `checked` conserve `deployment_verified=false`, `maintenance_verified=false`, `freeze_verified=false`. `--expect-version` compare le payload à la version **fournie par l'opérateur**, pas à Vercel. `--authorize-publish` et `--expect-hash` empêchent une publication involontaire ou un fichier changé ; ils ne prouvent pas les préconditions A–D.

Le passage du terminal PostgreSQL à E doit aussi préserver la séparation des credentials : le publisher refuse toute variable `PG*` non vide, une ancienne `MY_NOTIFICATION_DATABASE_URL` Local et `NODE_TLS_REJECT_UNAUTHORIZED=0`. Prévoir un environnement de processus propre et le wrapper existant ; ne pas réutiliser les variables/password administratifs pour le rôle dédié. Ce refus est déjà couvert, pas une nouvelle défaillance à contourner.

Sous gel, l'exception d'annonce fonctionne déjà Local/isolé. La fonction SQL sérialise par clé ; contenu identique retourne UUID/date/hash historiques, contenu différent donne `23505/publication_key_conflict`. Réponse réseau perdue après commit : même requête sur nouvelle connexion. Retrait définitif séparé, pas de réactivation par replay. Le reçu `published` peut concerner une annonce déjà retirée/expirée : vérifier projection active.

Pour E, un compte **réel existant et éligible**, AAL2, lit `get_notification_center`, `get_notification_unread_count` et `get_notification_content`. Pagination si nécessaire ; exactement une occurrence de l'UUID/clé attendus, version/corps conformes, `revision` égal au hash. Ces lecteurs sont purs. Ne pas ouvrir un parcours qui marque lu/traité pendant ce contrôle, ne pas appeler les transitions. Compte créé après publication non éligible avec `include_new_users=false` ; compte déjà traité peut également ne plus voir l'annonce. L'identité de contrôle doit être choisie avant la fermeture, sans relâcher MFA ni inventer de claims.

Le fichier préparé `0.8.29` constitue le changelog public prévu. Pas de seconde annonce ni page de changelog à développer. **Aucune fixture synthétique d'annonce ne doit être publiée sur Cloud réel**, même retirée ensuite : elle serait visible à l'audience pendant un intervalle et conservée dans l'historique. La première preuve de publication Cloud sera la vraie annonce de livraison, après décision explicite propriétaire. Cloud check seul reste sans écriture.

## 8. Classement des écarts

| ID | Classe | Justification actuelle | Résolution minimale recommandée |
|---|---|---|---|
| **T1** | **Bloquant technique pour le critère E actuel** | Middleware retourne 503 pour toutes identités et URLs Production ; docs 11 exige preuve du frontend réellement servi/parcours sous fermeture. Dashboard/ancien onglet ne la fournissent pas | PROD.7B : éprouver d'abord contrôle des artefacts exacts protégé et expliciter sa portée/acceptation ; sinon cadrer correction minimale côté serveur réservée opérateur. PROD.7C : prouver refus des utilisateurs ordinaires et fermeture persistante |
| **T2** | **Bloquant technique du chemin de capture directe IPv6 actuel** | `clients.js` impose bridge ; inspection locale prouve absence de route IPv6 extérieure. Check publisher Windows ne valide pas `pg_dump` | PROD.7B : privilégier cible session IPv4 déjà acceptée si compatible et approuvée ; sinon correction ciblée du choix de transport Docker pour IPv6, sans changer format/crypto/snapshot ou isolation restore. Preuve réseau/client réelle ultérieure autorisée |
| **O1** | **Bloquant opérationnel** | Gel Cloud absent ; capture exige ses objets et historique ≥50. Production frontend n'est prouvée que Preview ; référence locale `main` n'a pas middleware | Lire état Production réel, puis organiser installation autorisée des mécanismes existants avant répétition régulière ; deux migrations PROD.2 et historique contrôlés. Aucun nouveau backup bootstrap |
| **O2** | **Bloquant opérationnel** | Aucun précontrôle/campagne Cloud de fermeture, identités REST/Auth/Edge, refus et drainage ; CLI PROD.3 refuse Cloud par contrat | Rédiger checklist SQL/TLS manuelle avec queries existantes, identité/cible/révision, commit/relecture et probes approuvés ; pas de nouveau CLI Cloud obligatoire |
| **O3** | **Bloquant opérationnel** | Version/droits/snapshot/usage Storage-Vault/tailles Cloud inconnus ; image 17.6 et restore exacts seulement démontrés en synthétique | Relevés en lecture seule autorisés ; image compatible explicitement choisie ; coffre/CA/externe complets. Ne qualifier incompatibilité de version qu'après version réelle |
| **O4** | **Bloquant opérationnel avant déclaration de récupération et GO final** | Vraie archive Cloud non éprouvée ; récupération sur projet managé existant non préparée, pas de commande CLI pour cela | Réutiliser capture PROD.4 et restore PROD.5 adapté en isolation ; préciser reprise du projet existant et services externes sur droits réels, accès indépendant aux clés, bornes/pertes/RTO. Aucun restore Production sans décision distincte |
| **O5** | **Bloquant opérationnel** | Réglages déploiement et check publisher confirmés, mais pas chaîne merge/backend/build/promotion/visibilité/réouverture réellement répétée | Dossier d'exécution, checkpoints, décisions distinctes et contrôle des SHA/domaines/config ; vraie publication uniquement à E autorisée |
| **C1** | **Déjà couvert** | Gel ordinary/definers/service role, locks, lecteurs/reçus, erreurs et réouverture explicitement contrôlée existent et sont éprouvés Local | Vérifier installation Cloud ; ne pas redévelopper une protection frontend ou un arrêt global Auth |
| **C2** | **Déjà couvert** | Capture/crypto/intégrité, secrets séparés, refus omissions, isolation restore et comparaison fidèle existent | Réutiliser ; ne pas créer autre moteur/export initial ou réinitialiser Local |
| **C3** | **Déjà couvert** | Publisher Cloud/TLS/cluster/ACL/code/reprise livré ; check réel confirmé ; publication sous gel éprouvée isolément | Épreuve métier/visibilité Cloud restante ; pas d'annonce test, provisionnement parallèle ou droits supplémentaires |
| **C4** | **Déjà couvert par confirmation manuelle** | Auto-déploiement Supabase et attente de promotion Vercel réglés | Contrôles lecture seule à la mise en service ; pas de demande de reconfiguration identique |
| **C5** | **Déjà couvert par configuration et docs fournisseur** | Aucun `[remotes]` ; config des services Production ignorée par défaut, seed désactivé, aucun bucket déclaré | Vérifier logs/Auth/SMTP ; aucun écrasement localhost avéré ou patch TOML préventif |
| **F1** | **Amélioration facultative** | Centraliser les relevés ou automatiser commandes Cloud ne crée aucune capacité indispensable supplémentaire | Dossier opérateur manuel suffit ; aucun orchestrateur, polling, pipeline ou CLI maintenance Cloud à ouvrir |
| **F2** | **Amélioration facultative** | Required checks/notifications de déploiement peuvent aider ; promotion manuelle et revue actuelle constituent déjà les barrières prévues | Vérifier protection `main` connue ; ne pas créer nouveau workflow CI ou branches Supabase Preview pour cet audit |

T1/T2 désignent des capacités manquantes **dans les chemins nommés**, pas une défaillance de Production nouvellement observée. Une alternative existante validée peut les résoudre sans code. O3/O4 sont des preuves/actions nécessaires, pas une affirmation que les outils échoueront sur toutes les cibles Cloud.

## 9. Incohérences documentaires à corriger ultérieurement

**Aucun document de référence ni rapport historique modifié dans PROD.7A.**

| Document | Écart constaté | Correction future |
|---|---|---|
| [docs 11](../11-PUBLICATION-PRODUCTION.md), état connu/conditions/D/blocs futurs | Décrit assignation Vercel automatique et déploiement Supabase désactivé, réglages « non appliqués » | Remplacer dans documentation courante par confirmations propriétaire PROD.7A, avec date/provenance et absence de revérification |
| [architecture](../05-ARCHITECTURE.md), GitHub/Vercel ; [roadmap](../08-ROADMAP.md), publication | Même état ancien des deux réglages ; passages « autres mécanismes restant à réaliser »/PROD.1–3 ne reflètent pas toujours PROD.4–6 livrées | Décrire composants livrés et seules validations/adaptations restantes ; préserver rapports historiques |
| docs 11, exigences maintenance | « gel backend reste à concevoir », alors que PROD.2/3 existent | Pointer protections livrées et installation Cloud restante |
| docs 11, publisher/état | Connexion/secret/TLS/permissions Cloud encore tous décrits non démontrés | Distinguer check réel confirmé pour PROD.7A de publication/visibilité toujours non effectuées ; rapport PROD.6 garde son état historique |
| docs 11, contrôles opérateur et E | Exige frontend servi sous 503, sans moyen livré | Résoudre T1 puis écrire commandes/moyen et portée exacts ; ne pas supprimer silencieusement l'exigence |
| [docs 12](../12-SUPABASE-BACKUP.md), clients et essais PROD.4 | Passage « aucun script de restauration livré » devenu faux depuis PROD.5 ; description de port loopback de l'ancienne isolation pas alignée partout avec scripts `--network none`/stdio actuels | Actualiser ces passages courants, conserver preuves/version de chaque banc |
| docs 12, cible/versions | Compatibilité Cloud mentionnée comme précondition, mais aucune liaison démontrée entre succès IPv6 hôte et client Docker ; mineure Cloud inconnue | Ajouter distinction transports et relevés nécessaires, sans annoncer 17.11 MY. ou session éprouvée |

La roadmap macro n'est pas modifiée : état/ordre des grandes phases inchangé, audit PROD.7A limité à ce rapport. Sa synchronisation avec la procédure courante relève de PROD.7B après validation du cadrage.

## 10. PROD.7B recommandé — Procédure opérateur et vérifications

**Périmètre minimal : une procédure exécutable et des critères de passage exacts, réutilisant docs 10/11/12 et scripts existants.** Pas de nouvelle phase fonctionnelle, migration, moteur de backup ou architecture de publication.

1. **Synchroniser documentation courante et provenance.** Consigner confirmations manuelles, composants réellement livrés, état initial à relire, limites du check et preuves historiques ; rapports historiques intacts. Réutiliser les modèles target/evidence/external hors Git.
2. **Résoudre les deux capacités nommées T1/T2.** Tester d'abord moyens déjà disponibles. Pour T1, préciser quelle preuve répond au critère frontend sous fermeture et sa limite ; si code indispensable, présenter une correction réservée opérateur et son autorisation séparée. Pour T2, choix session existant et preuve du snapshot interconnexions, ou correction du seul transport natif IPv6. Aucun patch générique ou mécanisme de bypass grand public.
3. **Écrire prérequis de première mise en service.** Production active/middleware/Global Config, deux migrations PROD.2 et historique, système exact et ACL, versions/digests, endpoints/CA/visibilité/droits, compte de contrôle AAL2 existant, coffre/clés indépendants. Identifier les installations manuelles existantes à autoriser, sans nouveau backup initial. Supabase auto-déploiement déjà actif : toute évolution `main` demande examen des effets.
4. **Finaliser A–E et la trace opérateur.** Pour chaque checkpoint : commande/moyen précis, sortie examinée, SHA final/versions/IDs/borne/révision/hash, personne responsable et décision suivante. Cloud maintenance via psql TLS et queries existantes, pas CLI Local détourné. Fermeture frontend puis gel ; capture et exclusion privilégiée ; PR/merge/backend/build/promotion ; notification réelle ; gel puis frontend à l'ouverture.
5. **Finaliser reprises et récupération.** Réponses incertaines, préfixe de migrations, fonction Edge ancienne, promotion/domaines inconnus, capture partielle, restore jetable, notification retirée/expirée, rollback frontend compatible, effets après ouverture partielle. Cadrer récupération du projet Cloud existant selon possibilités réelles et référence PROD.5 ; ne pas présenter CLI isolé comme commande distante.
6. **Définir dossier de preuves/critères PROD.7C.** Séparer tests hors connexion, isolation, lectures Cloud autorisées, opérations Cloud mutantes et validations manuelles. Une prochaine intervention documentaire ne vaut pas autorisation distante ; créer/installer/publier/rouvrir demande décision propriétaire.

Sortie PROD.7B : procédure et décisions nécessaires reviewables, plus seulement corrections techniques démontrées et séparément autorisées. Pas de tests exhaustifs répétés sans lien avec un écart ou une correction. Les références étant déjà riches, préférer correction/consolidation de leurs sections à un second runbook divergent.

## 11. PROD.7C recommandé — Répétition et clôture

### Scénarios hors Production

| Scénario | Réutilisation et preuve cherchée | Limite |
|---|---|---|
| **R1 — Répétition documentaire A–E et incidents** | Parcourir procédure PROD.7B avec sorties synthétiques : target/révision/SHA/hash faux, commit sans réponse, prefixe migration, backend OK/build KO, promotion inconnue, annonce retirée, ouverture partielle ; toutes décisions suivantes restent suspendues | Ne prouve ni fournisseurs ni propagation ; pas de nouveau framework de simulation |
| **R2 — Fermer sans ouvrir les utilisateurs ordinaires** | Si T1 nécessite correction : campagne middleware/artefact/tests existants, requêtes ordinary/opérateur, faux paramètres/headers et état inconnu, fermeture maintenue pendant erreurs ; navigateur/stack isolés seulement | Même si Preview valide, Production reste à prouver ; pas de JWT réel ou secret de bypass dans tests |
| **R3 — Capture/restore sur cible adaptée** | Réutiliser PROD.4/5 sur images/versions réellement choisies ; vérifier transport natif pertinent, archive/authentification, restore/droits/extensions/locale et accès indépendant à la clé | Synthétique reste synthétique ; essai de vraie archive Cloud nécessite capture autorisée séparée |
| **R4 — Handoffs utiles entre composants** | Un parcours intégré en isolation : gel/drainage, capture achevée, restore sur autre cible, publication sous gel/rejeu exact, lecteurs éligibles, décision d'ouverture. Réutiliser fixtures/harness des suites existantes, choisir seulement l'interface encore non prouvée | Pas de reproduction complète des suites PROD.2–6 ; pas de test sur Local personnel |

Le drainage/concurrence/rejeu SQL est déjà éprouvé Local. Pas de raison de rerun `maintenance:test:local`, `test-business-write-freeze.js` ou les 3 873 assertions sur le volume personnel pour cette clôture. Si une nouvelle correction affecte une garde, utiliser exclusivement une cible synthétique neuve et les cas pertinents. Pour une correction publisher inexistante à ce stade, aucune nouvelle campagne de publication synthétique nécessaire.

### Contrôles nécessitant ultérieurement une opération Cloud autorisée

| Intervention | Lecture seule utile avant décision | Opération mutante distincte, si nécessaire |
|---|---|---|
| Installations initiales | Production active/SHA/middleware/env/store/domaines/quotas ; Cloud historique/identités/owners/grants/PG/extensions/CA/réseau ; journaux d'intégration | Installation Production du code PROD.1 et des deux migrations PROD.2, si manquante ; aucun déclenchement implicite par cet audit |
| Fermeture réelle | Coverage URLs et réponses, état gel/contrat/sessions/locks, identité AAL2 de contrôle | Bascule maintenance puis gel, éventuels probes exactement approuvés ; compte/tests Auth/Edge seulement avec périmètre explicite |
| Capture et récupération | Privilèges/snapshot/versions/Storage-Vault/config/secrets indépendants, choix client/transport | **Capture régulière PROD.4 de C** autorisée, puis essai adapté de cette archive en isolation ; jamais restauration du Cloud ou Local personnel pour tester |
| Déploiement coordonné | Paramètres intégrations, règles `main`, log/checks, SHA/historique/functions/domaines | PR/merge puis déploiements déclenchés, promotion manuelle seulement backend vérifié |
| Notification | `--check` pur sur cible/version actuelles ; compte éligible et lecteurs purs | Vraie publication changelog autorisée E ; pas de notification synthétique aux utilisateurs ; reprise même clé/hash si résultat incertain |
| Réouverture/clôture | Checkpoints complets, rollback/reprise disponibles, aucune incertitude | Levée gel vérifiée puis maintenance, contrôles finaux. Réouverture reste décision propriétaire, jamais effet du succès des tests |

Une répétition sans merge/publication peut valider fermeture/capture et leurs reprises, mais doit être nommée **partielle**. Une répétition complète avec annonce réelle est une publication Production, pas un test innocent. Si données réelles présentes dans l'archive d'essai, stockage/accès/isolement doivent être expressément autorisés ; aucune sortie email/Edge/provider depuis destination.

### Critère de clôture

PROD.7C peut clore les preuves isolées sans prétendre clore Production. GO complet seulement quand T1/T2 sont résolus sur le chemin retenu, protections initiales réellement installées, capture/récupération adaptées et accès aux clés démontrés dans leur portée, intégrations/SHA/domaines vérifiés, vraie annonce visible pour audience, puis réouverture explicitement décidée et contrôlée. Toute case inconnue garde son statut ; aucun test Local, booléen de manifeste ou confirmation de réglage ne la remplace.

## 12. Sources publiques consultées et frontières

- [Supabase — Deployment & Branching](https://supabase.com/docs/guides/deployment) : contenus déployés, skip configuration Production sans remotes, intégration sans Preview obligatoire.
- [Supabase — Intégration GitHub](https://supabase.com/docs/guides/deployment/branching/github-integration) : push/merge Production, configuration/seed, historique, transactions par migration, Edge/checksum/secrets/Storage.
- [Supabase — Configuration remotes](https://supabase.com/docs/guides/deployment/branching/configuration) : opt-in des réglages sur branche persistante.
- [Vercel — Environnements](https://vercel.com/docs/deployments/environments) et [promotion](https://vercel.com/docs/deployments/promoting-a-deployment) : attente manuelle d'un build Production, variables Production, domaines sans rebuild.
- [Supabase — Changelog](https://supabase.com/changelog), [PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) : annonce fournisseur, aucune version MY. déduite ; changements TLS HTTP annoncés distincts du check PostgreSQL.

Les docs 10/11/12 et rapports cités conservent aussi leurs sources PostgreSQL, GoTrue, Docker, Vercel et Supabase backup/restore. Aucun résultat de plateforme inventé. Toutes opérations Cloud restent futures et séparément autorisées. **Seul livrable PROD.7A : ce rapport ; version, code, SQL, plateformes et rapports historiques inchangés.**
