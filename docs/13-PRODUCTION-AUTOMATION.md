# Automatisation des publications Production

`npm run prod:backup` orchestre AUTO.2, AUTO.1 et PROD.4. Livraison d'outillage Windows en version applicative **0.8.33 conservée**, sans dépendance nouvelle. Tests sur mocks et fichiers/secrets synthétiques temporaires uniquement ; aucune opération Vercel/Supabase Cloud ni capture Production effectuée pendant cette livraison. [Rapport](reports/2026-10-16-AUTO3-PRODUCTION-BACKUP.md).

**AUTO.4A** fournit les fondations internes de préparation de réouverture, décrites [ci-dessous](#auto4a--préparation-de-réouverture). Son résultat `ready` reste une observation, sans autorisation de publication ou de réouverture.

**AUTO.4B** fournit la publication/vérification du changelog via PROD.6, [décrite ci-dessous](#auto4b--publication-et-vérification-du-changelog). **AUTO.4C livre `npm run prod:open`**, composant ces API puis dégel Supabase et réouverture Vercel, sous consentements distincts. [Usage et reprise](#auto4c--commande-finale-prodopen), [rapport](reports/2026-10-16-AUTO4C-PRODUCTION-OPEN.md). Version applicative **0.8.33 conservée** ; aucune opération réelle ni preuve Production acquise par ce développement. AUTO.5 reste hors périmètre.

## Utilisation

Depuis `dev`, source propre et committée, dans un terminal interactif Windows :

```powershell
npm.cmd run prod:backup
```

La commande charge `D:\MY-operator\production.json`. Un autre emplacement permanent peut être sélectionné par la variable **non secrète** `MY_PRODUCTION_CONFIG`. Aucun argument d'autorisation ou secret à recopier à chaque usage. Les secrets viennent du coffre approuvé : mot de passe PostgreSQL et token API Vercel saisis masqués ; clé AES depuis sa copie DPAPI existante. Le wrapper réutilise `scripts/backup/secrets.ps1`, nettoie les variables volatiles et BSTR ; Node consomme ces canaux avant Git et garde les secrets hors des rapports. Les chaînes JavaScript et la mémoire d'un poste administré ne sont pas une enclave de secrets.

Avant toute connexion, résumé du projet fermé **`xvtiwhxvtfxvvokquttu`**, domaine `my.collectrealm.com`, version/commit et session. Puis confirmations ciblées :

1. `AUTORISER CONNEXIONS` : connexions Vercel et Supabase Cloud, sans export.
2. `FERMER MY` : maintenance Vercel, puis gel Supabase ; exclusivité des autres writers Global Config pendant lecture/écriture/relecture. L'absence de CAS Vercel reste inchangée.
3. Déclaration contemporaine de fermeture : identifiant réel `dpl_...`, date UTC réelle du contrôle HTTP, puis `FERMETURE ATTESTEE`. Elle regroupe les contrôles opérateur décrits ci-dessous et reste étiquetée comme déclaration.
4. `AUTORISER EXPORT SENSIBLE` : autorisation distincte de la connexion Cloud. Elle couvre données personnelles/Auth/MFA exportées chiffrées. Les contrôles techniques sont relus après cette saisie et dans PROD.4.

Si une protection est déjà active, les API existantes la confirment sans PATCH Vercel ni nouvelle révision Supabase inutiles. Tout échec arrête la suite, sans action inverse. La commande n'ouvre aucun accès, ne publie aucun changelog, ne déploie rien et ne restaure jamais.

## Configuration initiale, une seule fois

Copier le [modèle fermé](../scripts/production/examples/production.json) hors Git. Conserver les fichiers et parents dans l'espace opérateur protégé et non synchronisé. Tous les chemins sont absolus, hors dépôt, sans reparse point. Les cibles AUTO.1/AUTO.2 et PROD.4 restent leurs fichiers existants ; aucun moteur de connexion parallèle. Les deux cibles PostgreSQL doivent partager exactement système, endpoint, login, base, CA et empreinte. Le transport PROD.4 reste explicitement celui du fichier de cible : Docker v1 ou Windows natif v2, sans fallback. Le poste doit disposer des accès et clients déjà exigés par ces contrats.

Les champs du modèle désignent :

| Champ | Configuration existante à référencer |
|---|---|
| `maintenance_target` | Cible Cloud AUTO.1 : système obtenu indépendamment, CA approuvée et endpoint examiné |
| `vercel_target` | Cible AUTO.2 : projet/équipe/store/slug exacts, liaison Production et protection All Deployments |
| `backup_target` | Cible PROD.4, notamment `target.windows.json` avec EXEs/DLL et versions épinglés |
| `evidence` | Évidence PROD.4 existante : prérequis permanents réellement établis |
| `external` | Inventaire externe PROD.4 complet et relevés non secrets existants |
| `key_file` | Copie de travail DPAPI existante, séparée des captures ; récupération originale au coffre indépendant |
| `sessions_directory` | Répertoire existant protégé hors Git et hors volume M:, pour retrouver la session même sans le volume de backup |
| `volume_serial` | Numéro de série exact à huit caractères hexadécimaux du volume chiffré approuvé monté sur M: |
| `encrypted_volume_evidence` | Référence d'un relevé opérateur réel dans `external.records` |

Créer initialement `M:\MY-backups` dans le volume chiffré approuvé et le répertoire de sessions. Vérifier leurs protections. La commande vérifie présence, chemin canonique sans reparse point, accès en écriture et identité du volume via `Win32_LogicalDisk`. **Elle ne déduit pas le chiffrement d'une lettre de lecteur.** La configuration persistante doit référencer un relevé réel de la forme suivante, avec valeurs obtenues lors de cette préparation, jamais copiées comme preuve :

```json
{
  "volume_serial": "1234ABCD",
  "encrypted_at_rest": true,
  "unsynchronized_destination": true,
  "provenance": "operator_verified",
  "recorded_at": "2026-10-16T12:34:56Z"
}
```

L'ajouter sous la référence choisie dans **l'inventaire existant**, sans écraser les autres relevés. Le mécanisme de chiffrement du volume et l'exclusion des synchroniseurs restent des vérifications initiales de l'opérateur, pas une détection automatique universelle. Refaire ces vérifications si le support ou ses réglages changent. Les exigences PROD.4 de conservation séparée de la clé, Storage/Vault inutilisés et configuration externe complète restent bloquantes. Les champs permanents d'`evidence.json` doivent donc être valides ; aucun faux booléen, placeholder ou secret ne sera accepté pour les satisfaire.

AUTO.3 complète seulement les champs contemporains de l'évidence, **en mémoire**, à partir des observations et confirmations de la session : projet/système, révision, preuve de gel committé, drainage, maintenance HTTP et exclusions privilégiées/DDL/configuration. Les fichiers opérateur d'origine ne sont pas modifiés. Les dates historiques ne sont pas rafraîchies artificiellement. Chaque référence générée retrouve un relevé horodaté protégé dans la session ; les déclarations portent une provenance distincte des observations automatiques.

## Fermeture et preuves

L'API AUTO.2 vérifie cible, All Deployments, store lié Production et maintenance, avec relecture indépendante. AUTO.1 contrôle identité/TLS, contrat SQL, révision exacte, fermeture committée puis nouvelle connexion. `verify-closed` conserve ses limites : pas de probe API déguisé depuis `postgres`, pas d'exclusion durable des writers privilégiés déduite d'un échantillon.

**Vercel Authentication All Deployments reste volontaire.** Un HTTP anonyme 302 vers SSO n'est ni un échec de maintenance ni une preuve de fermeture. AUTO.3 ne fait aucune requête HTTP applicative anonyme ou authentifiée, ne collecte aucun cookie et n'ajoute aucun bypass. L'opérateur vérifie par admission Vercel normale les GET/HEAD 503 MY., headers anti-cache/robots/CSP attendus, routes et assets sur domaine, build Production identifié et déploiements compatibles. Réutiliser les [contrôles HTTP PROD.3](11-PUBLICATION-PRODUCTION.md#contrôles-http-futurs-sous-vercel-authentication). La date saisie est celle du **contrôle réellement réalisé après fermeture**, pas une date inventée par l'outil. Propagation/couverture et refus API ordinaires avec sessions existantes sont attestés séparément du plan de contrôle ; aucune propagation mondiale automatiquement prouvée.

L'opérateur coordonne et exclut jusqu'à fin de capture `super_admin` authentifié/AAL2, SQL administrateur, publisher, imports, jobs/cron/intégrations, DDL, rôles et configuration. Cette déclaration ne modifie jamais l'exception permanente `super_admin` et ne remplace aucun contrôle SQL.

Le drainage effectif réutilise **`PROD.4 requireClosed`**, sur connexion TLS indépendante avec identité PROD.4 et visibilité intégrale, sous transaction/verrou partagé `771403` : révision fermée exacte, aucun lock d'admission, aucune transaction préparée, aucune transaction cliente ordinaire/privilégiée/non classée active. Auth interne conserve son traitement PROD.4 : snapshot PostgreSQL cohérent, clés externes séparées, bornes de séquences inchangées. Les contrôles sont refaits après consentement d'export, par PROD.4 autour du snapshot et après `verify`. Un drainage technique en échec bloque la capture, même après attestation d'exclusivité.

## Capture, résultat et reprise

Chaque capture reçoit une destination neuve `M:\MY-backups\backup-<UTC>-<UUID>`, créée exclusivement par PROD.4. Moteur, archive AES-256-GCM, snapshot, contrôles séquences, contrats et sept fichiers inchangés. Après succès de `capture`, **nouvel appel indépendant à `verify`**, déchiffrement authentifié des métadonnées pour les lier à la session, puis nouvelle vérification des protections. `capture_integrity_verified` n'établit jamais une restauration PROD.5, une récupération Production ou une autorisation de publication.

Le dossier opérateur contient `session.json` et des relevés immuables référencés par UUID : identité, source Git/version, empreinte des configurations et inventaire, révision, état/checkpoint Vercel, déclarations et preuves avec provenance/date, autorisations distinctes, destinations/tentatives, statuts réels, SHA-256 du manifeste chiffré et informations de reprise. ACL restreintes aux nouveaux dossiers, fichiers hors Git et hors synchronisation. Ni token, mot de passe, clé AES, contenu Auth ni inventaire SQL dans ces relevés de session. `current.json` désigne la session courante ; `prod:open` authentifie l'archive et la publication correspondantes.

Relancer **la même commande** après diagnostic :

- Fermeture déjà effective : nouvelles lectures, sans révision/PATCH inutiles. Une reprise inachevée demande `REPRENDRE SESSION` après examen de l'ancien processus et de ses éventuels enfants.
- Capture partielle avec `INCOMPLETE`, fichiers absents ou sans manifeste : tentative conservée, jamais validée ni réutilisée comme destination ; nouvelle capture après nouveaux consentements et contrôles.
- Capture terminée dont l'accusé a été perdu, ou échec du `verify` indépendant : vérifier la même archive avant toute nouvelle capture. Aucun export sensible supplémentaire pour cette relecture. Mauvaise intégrité, source, cible, révision ou provenance : arrêt, sans remplacer silencieusement l'archive.
- Session déjà validée : relire maintenance et révision exacte, refaire `verify`, rendre la même sauvegarde. Aucun nouvel export, même si `dev` a avancé pendant la publication. Une protection désormais ouverte provoque un refus sans refermeture implicite.
- Source changée pendant une session sans archive terminée, ou configuration/inventaire changé : refus ; examiner et reprendre avec les références originales. Aucun transfert silencieux d'une session à une autre publication. Une archive terminée reste liée à son commit initial et peut être revérifiée si `dev` a avancé.

Verrou local AUTO.3 : `%LOCALAPPDATA%\MY\production\prod-backup.lock`, en plus du verrou équipe/store AUTO.2. Pas de TTL ni reprise automatique par PID. Erreur contrôlée : l'état de la session est sauvegardé, verrou AUTO.3 libéré si aucun signal. Signal/arrêt forcé : marqueur conservé, état inconnu. Examiner indépendamment processus, enfants, session et verrous exacts ; supprimer manuellement **uniquement les marqueurs identifiés** après leur arrêt et coordination. AUTO.2 peut garder son propre verrou après erreur ; sa procédure reste obligatoire. Aucun script ne tue les autres backends ou ne réouvre les protections.

La session reste active après succès de la sauvegarde. Seul le succès complet de `prod:open` la clôture. Le prochain `prod:backup` peut alors créer une nouvelle session et remplacer atomiquement le pointeur ; tous les dossiers UUID terminés et leurs références d'archives restent conservés. Une session partielle ou un dossier supplémentaire non terminé bloque cette rotation. Ne jamais supprimer des références pour forcer une nouvelle capture.

## Workflow de publication conservé

1. `prod:backup` : fermeture, drainage, sauvegarde chiffrée vérifiée ; restauration et autres prérequis de publication restent distincts.
2. PR `dev` → `main`, merge, déploiements, réussite Supabase, promotion du build Production identifié sans rebuild et tests requis.
3. **`prod:open`** : retrouver la session, vérifier livraison et changelog publié une seule fois, puis dégel Supabase et réouverture Vercel selon les conditions E existantes. Clôture seulement après contrôles finaux réussis.

Les commandes manuelles actuelles demeurent disponibles selon leurs contrats. Aucune exigence de fermeture, restauration, notification, vérification de l'artefact réellement servi ou réouverture n'est supprimée par l'orchestration.

## AUTO.4A — Préparation de réouverture

API interne [prepareOpen](../scripts/production/open-preparation.js), destinée à AUTO.4B/C. Elle lit la configuration permanente via `configurationBundle`, puis le même `sessions_directory/current.json` et la même session `my-production-session-v1`. Aucun second registre, nouvelle sauvegarde ou rotation de session. Les entrées de livraison sont uniquement le numéro de PR et l'identifiant du build Production attendu. Le fichier de changelog suit la convention existante `scripts/notifications/releases/<version>.json` : il doit être présent dans le commit sauvegardé, validé lors de sa clôture, puis identique dans le worktree utilisé pour la préparation. Un fichier absent bloque ; aucun exemple historique n'est substitué.

### Contrôles automatiques

- Dossier hors Git/synchronisation, chemins canoniques sans reparse point, volume M: identifié par son numéro de série, ACL des dossiers et fichiers de session réservées à l'opérateur courant et SYSTEM. ACL trop larges : refus, sans réparation implicite. Un seul dossier UUID actif admis ; les dossiers terminés restent conservés avec la rotation AUTO.4C.
- Session `verified`, dernière capture terminée, vérification indépendante `complete`, révision BIGINT exacte et une seule archive validée. Nouvelle vérification locale PROD.4 de **la même archive**, sans capture/restauration ; manifeste chiffré, source, version, cible et preuves archivées comparés aux relevés AUTO.3. Les nouveaux relevés possèdent un SHA-256 ; les anciens restent lisibles, avec comparaison obligatoire aux métadonnées authentifiées de l'archive. Ces empreintes détectent une corruption, pas un administrateur hostile contrôlant poste, clé et fichiers.
- GitHub : GET de la référence `main` et de la PR `dev` → `main` dans `Palmyna/my.`. PR réellement mergée, source identique à la session, `main` toujours au merge attendu. API GitHub épinglée à `2022-11-28`, dont le contrat conserve `merge_commit_sha` ; aucun mélange avec l'API `2026-03-10` qui retire ce champ. Token de lecture facultatif pour un dépôt public, requis selon les droits du dépôt privé ; jamais dans les arguments/rapports.
- Git local : objets déjà présents, historique non superficiel, vrai merge à deux parents dont le second est la source sauvegardée. Premier parent déjà ancêtre de la source **ou sans changement d'arbre depuis leur ancêtre commun** : un précédent merge classique sur `main` n'impose donc aucun backmerge artificiel vers `dev`. Arbres source/merge identiques. Ainsi **SHA de merge différent admis**, mais squash/rebase, contenu propre à `main` non intégré, résolution de conflit modifiant la livraison et source `dev` avancée dans la PR sont refusés. Aucun fetch, checkout ou changement Git automatique. Les versions package/lockfile sont lues dans le commit sauvegardé, indépendamment de l'avancement ultérieur du worktree.
- Supabase : même connexion TLS/identité et primitives AUTO.1 ; transaction de lecture seule, contrat du gel, état/révision et historique `version,name` lus en base. Comparaison exacte avec les migrations du commit livré, sans migrations absentes ni supplémentaires. Les hashes des fichiers source sont conservés. L'historique SQL ne prouve pas à lui seul les logs du déploiement, le contenu intégral du schéma ou la compatibilité métier : preuves opérateur distinctes obligatoires.
- Vercel : précontrôle AUTO.2 conservant projet, équipe, `GLOBAL_CONFIG` Production et Authentication **All Deployments**. Deux GET de l'alias `my.collectrealm.com` encadrent la lecture du build attendu : identifiant assigné au domaine, projet, cible Production, `READY`, commit `main` concordants. `READY` sans assignation ne suffit jamais. Cette lecture ne prouve ni le déroulement manuel sans rebuild ni le code réellement servi.
- Changelog : contrat PROD.6 réutilisé hors connexion, catégorie `changelog`, version livrée, audience cohérente et expiration encore future ou nulle. Conservation du chemin, SHA-256 des octets exacts, clé stable et `content_hash` normalisé. Une simple remise en forme change l'empreinte du fichier et bloque une reprise, même si le hash normalisé reste identique.

### Preuves opérateur et fraîcheur

Après les premières lectures, `io.attachEvidence(challenge)` reçoit `session_id`, `run_id` neuf et `checkpoint` des faits observés. Le contrat fermé `operatorEvidenceSchema` impose ces trois liens, la date réelle du contrôle dans cette exécution, une référence opérateur non secrète, domaine/build/commit/version servis et les contrôles explicitement confirmés : revue/merge GitHub, logs Supabase réussis, compatibilité backend, promotion du même build Production sans rebuild, version/commit servis, GET/HEAD MY. 503 authentifiés avec headers/routes/assets, couverture/propagation, prérequis de publication/récupération existants, absence de backup en cours et coordination des writers privilégiés/publisher/DDL.

La callback peut rester absente : résultat `blocked`, faits automatiques disponibles dans les relevés, aucune attestation fabriquée. Le rattachement d'une déclaration ne remplace pas sa réalisation. **Un 302 anonyme vers Vercel SSO est attendu et n'entre jamais comme preuve du middleware.** Aucun appel HTTP applicatif, cookie, JWT, bypass ou mécanisme d'accès temporaire ajouté. Si aucun moyen protégé autorisé ne permet de vérifier la version réellement servie sous maintenance, ce contrôle reste bloquant ; la préparation ne résout pas ce verrou de preuve.

Après les contrôles humains, nouvelles lectures GitHub, Vercel, maintenance, gel et migrations ; comparaison avec les premières observations, relecture des objets Git/changelog, des ACL et des empreintes de **tous** les fichiers chiffrés référencés par le manifeste. Un état changé pendant les contrôles empêche `ready`. Aucune preuve d'une précédente exécution n'est réutilisée comme nouvel état distant.

### Résultat, persistance et interfaces suivantes

`session.open_preparation` contient le dernier résultat `my-production-open-preparation-v1` ; les relevés `open_automatic_checks`, `open_operator_evidence` et `open_preparation_result` utilisent le mécanisme AUTO.3 existant. Le binding de livraison conserve source, merge, version, PR, build et identité du changelog. Dès son premier rattachement validé, changer fichier/clé/hash/build/merge lors d'une reprise est refusé.

| Résultat | Sens et suite |
|---|---|
| `ready` | Préconditions observées dans cette exécution, incluant les déclarations opérateur identifiées ; prochaine étape à autoriser séparément |
| `blocked` | Précondition manquante ou contradictoire ; corriger la cause, conserver les protections |
| `unknown` | Interruption, lecture indisponible, échec non classé ou résultat non persisté ; aucune ouverture autorisée |

Tous les résultats portent `publication_authorized=false`, `reopen_authorized=false`, `remote_writes=false` et une validité limitée aux observations. **`ready` n'est ni une autorisation ni un jeton durable.** AUTO.4B/C refont les contrôles actuels avant toute action, puis obtiennent leurs consentements propres. Ils réutilisent le binding exact du changelog, les contrats de preuve, l'API de lectures `openPreparationAPI`, `inspectRelease`/`prepareChangelog`, la vérification partagée d'archive et `VercelMaintenance.publication`.

Même verrou `prod-backup.lock` qu'AUTO.3, sans TTL ni reprise automatique par PID. Sauvegardes de `session.json` par remplacement atomique ; empreintes du pointeur, de l'état et des relevés, identité des dossiers contrôlées avant chaque sauvegarde. Ce verrou coordonne les clients coopérants ; les contrôles détectent aussi les éditions extérieures entre lectures, sans prétendre fournir un CAS contre un processus hostile ignorant le verrou. Interruption : résultat en cours reste `unknown`, marqueur conservé. Après examen indépendant et arrêt des anciens processus/enfants, retirer seulement le verrou exact puis reprendre la préparation ; archive et binding conservés, preuves distantes et déclarations à refaire. AUTO.4A ne crée aucun processus enfant de capture.

`openPreparationAPI` n'expose que lectures et vérification locale, avec autorisation de connexion explicite à sa construction. L'appelant consomme/nettoie les canaux secrets **avant Git ou tout processus enfant**, garde les identifiants en mémoire et appelle `dispose()` en `finally`, comme AUTO.3. Les erreurs fournisseurs et réponses privées sont supprimées des résultats. Aucun publisher ou setter de protection n'est appelé par cette API de préparation.

Validation : mocks HTTP/PostgreSQL, sessions/ACL et graphe Git synthétiques dans des dossiers temporaires isolés. Aucune lecture ou écriture des projets réels. [Rapport AUTO.4A](reports/2026-10-16-AUTO4A-OPEN-PREPARATION.md).

## AUTO.4B — Publication et vérification du changelog

Livraison **interne**, sans commande `prod:open` partielle. [Rapport AUTO.4B](reports/2026-10-16-AUTO4B-CHANGELOG-PUBLICATION.md). Aucune notification Production publiée pendant le développement ; aucune connexion aux projets réels, migration, capture, restauration, levée de gel ou de maintenance. Les droits SQL et RPC PROD.6 restent inchangés.

### Interfaces pour AUTO.4C

- `publishOpenChangelog(bundle, input, io, api, context?)` dans `scripts/production/open-publication.js`. `input` fermé : `pull_request`, `deployment_id`, `visibility_user_id` (UUID du vrai utilisateur qui effectuera les relectures). Même session AUTO.3, même `current.json`, même verrou `prod-backup.lock`, mêmes écritures atomiques/empreintes/ACL. Sans `context`, durée du verrou AUTO.4B inchangée. AUTO.4C passe sa session gardée et conserve ce verrou jusqu'à clôture, sans fenêtre libération/reprise.
- `prepareOpenInSession` extrait d'AUTO.4A pour réutiliser **une fois par exécution** la vérification historique complète et l'archive, sous le verrou de l'appelant. `prepareOpen` conserve son comportement et ses résultats. La fonction interne rend aussi `revalidate()` : nouvelles lectures GitHub, maintenance, gel/révision, migrations, build/alias, objets Git et octets du changelog, configuration et fichiers de session. Ces contrôles volatils sont refaits après consentement et après preuve opérateur ; aucun ancien `ready` ne suffit.
- `openPublicationAPI(bundle, secrets, { publisherTargetFile, authorizeConnect: true, signal, configFile })` étend les lectures AUTO.4A, sans exposer de setter de protection. `publisherTargetFile` désigne le **fichier de cible PROD.6 existant**, hors Git et sans reparse point. Projet, système, endpoint, base, transport et CA doivent correspondre à la cible de la session ; seule l'identité dédiée du publisher diffère. Le fichier est épinglé pendant l'exécution. Pas de modification du format de configuration AUTO.3.
- `readPinnedChangelog` vérifie chemin conventionnel, absence de reparse point, octets exacts, contrat PROD.6, version et expiration ; renvoie le contenu validé de ces mêmes octets. Aucun changement de clé, audience, expiration, hash ou fichier autorisé en reprise, même après simple reformatage.
- `readPublishedChangelog` ouvre une **nouvelle connexion** AUTO.1 TLS/identité `postgres`, en transaction `repeatable read read only`. Elle relit la table privée déjà autorisée à cet opérateur, sans élargir les droits du publisher. Recherche par clé **ou changelog de même version**, limitée à deux lignes : une seconde ligne suffit à refuser la réouverture. Aucune requête SQL de mutation, attribution de rôle/JWT ou RPC utilisateur sous identité administrative.
- `visibilityEvidenceSchema` décrit la preuve authentifiée ; `publicationIsVerified(result, currentRunId)` distingue le résultat vérifié de **l'exécution courante** d'une simple tentative. Ce prédicat ne donne aucun droit de réouverture. AUTO.4C revalide les faits actuels avant ses propres actions via `revalidatePublishedChangelog` ; un résultat stocké reste une observation historique.

### Consentements et secrets

Deux consentements explicites distincts : `io.authorizeCloudConnect(challenge)` **avant toute lecture distante**, puis `io.authorizePublish(challenge)` après préparation et première relecture, avec livraison/fichier/clé/hash exacts. Seul le booléen `true` autorise la suite. Chaque consentement est enregistré avec session, nouvelle exécution, horodatage et périmètre. Le consentement d'export PROD.4 et `session.publication_authorized` ne sont jamais utilisés pour autoriser la publication. Le drapeau interne `authorizeConnect` ne remplace pas ces consentements.

L'interface AUTO.4C demande une fois les connexions de l'exécution, puis la publication et les preuves nécessaires, sans accord par connexion technique. `io.attachEvidence` reste le contrat contemporain AUTO.4A ; `io.attachVisibilityEvidence` est distinct, car il décrit des lectures réalisées **après** la publication.

L'appelant appelle `consumeOpenSecrets()` **avant configuration, Git ou tout processus enfant**. Cette fonction consomme et supprime les canaux volatils existants `MY_BACKUP_KEY`, `MY_BACKUP_DATABASE_PASSWORD`, `MY_VERCEL_MAINTENANCE_TOKEN`, `MY_NOTIFICATION_DATABASE_PASSWORD` ; `MY_PRODUCTION_GITHUB_TOKEN` est optionnel pour les lectures GitHub privées. Aucun secret en arguments, session ou logs. `openPublicationAPI` refuse les canaux non consommés ; appeler `api.dispose()` en `finally`, et nettoyer également l'objet de secrets si la construction échoue. Les chaînes JavaScript ne constituent pas une enclave mémoire.

La saisie masquée du publisher est réutilisée par dot-sourcing de `scripts/notifications/secrets.ps1 -LoadFunctionsOnly`, puis `Read-NotificationPublisherPassword`, qui retourne un `SecureString`. Le wrapper AUTO.4C utilise le transfert volatil/BSTR/nettoyage déjà employé par PROD.4/6. Le CLI PROD.6 existant conserve son comportement ; `connectCloudPublisher` accepte aussi le mot de passe fourni en mémoire, pour éviter de remettre un secret dans l'environnement avant les enfants Git.

### Reçu, état réel et visibilité

L'appel utilise exclusivement `publish` et `connectCloudPublisher` de PROD.6 : TLS, cluster, rôle réel, ACL et idempotence inchangés. Avant SQL, un relevé durable `open_publication_dispatch` conserve le binding exact ; `dispatch_started=true` signifie **requête pouvant avoir été envoyée**, pas insertion démontrée. La connexion/validation du publisher précède ce marqueur ; un échec de connexion avant celui-ci n'a pas effectué de publication dans cette exécution.

Le reçu PostgreSQL est fermé : clé, UUID, date et hash. L'enveloppe porte l'identité vérifiée de la connexion ; le reçu SQL **ne contient pas de version**. La version est donc comparée au fichier et à la ligne relue indépendamment. Même UUID/date/clé/hash exigés lors d'une réponse idempotente ou d'une reprise avec reçu connu. La relecture compare aussi contenu complet normalisé et hash recalculé, auteur publisher, audience, expiration, absence de retrait et dates d'activité. Un reçu historique ne rend jamais visible une ligne retirée ou expirée.

L'opérateur de relecture doit disposer d'une **vraie session Supabase authentifiée AAL2** du `visibility_user_id` épinglé, sur le bon projet. Le contrôle administratif vérifie existence Auth/profil, éligibilité par date d'inscription ou exception d'audience, et absence de traitement individuel. Il **ne prouve pas** une session utilisateur ou un AAL2 et ne tente pas d'en fabriquer un.

Après la relecture indépendante, `io.attachVisibilityEvidence(challenge)` reçoit session, nouvelle exécution, checkpoint, heure de début du contrôle, projet, UUID utilisateur/annonce, clé, hash et version. Il doit fournir une preuve fermée `my-production-changelog-visibility-v1`, provenance `operator_verified_real_authenticated_RPC`, référence non secrète, date réelle du contrôle dans ce challenge et `aal=aal2`. Toutes les identités et le checkpoint doivent correspondre. L'opérateur atteste :

1. Identité réelle et AAL2 de la session utilisés, confirmés par le parcours Auth autorisé.
2. `get_notification_center` : parcourir toutes les pages nécessaires ; exactement une notification de la livraison, bon UUID, version, titre et révision/hash. Une première page sans annonce n'est pas une preuve d'absence.
3. `get_notification_unread_count` : cohérence avec l'ensemble du centre et ses états existants ; aucun nombre fixe inventé pour une annonce déjà lue.
4. `get_notification_content` pour cet UUID : contenu non nul et exact (titre, corps, version, révision/hash), conforme au fichier épinglé.
5. Aucun appel `mark_notification_read` ou `process_notification`, aucune mutation de l'état individuel pendant le contrôle.

Utiliser un client authentifié normalement admis, autorisé et apte à faire ces seules RPC de lecture. L'interface de l'application peut marquer automatiquement une annonce lue : ne pas utiliser un tel parcours comme contrôle sans mutation. Aucun JWT, cookie, email, mot de passe ou corps brut de réponse à joindre à la preuve. Aucun `service_role`, `SET ROLE`, `request.jwt.claims` fabriqué, login administratif ou bypass Vercel ne démontre ces lectures. Sans moyen sûr disponible, la preuve manque et le résultat reste non admissible ; aucune permission n'est ajoutée pour débloquer ce contrôle.

Après la preuve : nouvelles observations des protections/livraison et nouvelle connexion indépendante pour l'annonce. Existence, activité et contenu encore exacts exigés ; identité et état individuel `read_at/processed_at` inchangés. Les relevés distinguent les lectures SQL automatiques des déclarations opérateur. Aucun contrôle de RPC utilisateur automatique n'est revendiqué. Le frontend Production servi sous maintenance reste une preuve AUTO.4A distincte.

### Résultats et reprise

`session.open_publication` conserve le dernier résultat `my-production-open-publication-v1`. Les relevés AUTO.3 existants reçoivent consentements, marqueur de dispatch, reçu, relectures, challenge/preuve de visibilité et résultat horodaté. Les relectures stockent métadonnées, identité, audience, expiration et état du lecteur ; ni corps privé ni secret. Le contenu complet est comparé en mémoire.

| `outcome` | Signification |
|---|---|
| `verified` | Reçu valide, état réel actif/exact/unique, preuve éligible AAL2 liée à cette exécution, relectures finales concordantes |
| `not_published` | Aucun dispatch par cette session ; pas de tentative SQL de publication démontrée. `existence=unobserved` ne prétend pas que la clé est absente du serveur |
| `uncertain` | Dispatch possible sans confirmation suffisante, interruption, résultat non durable ou verrou altéré ; garder les protections |
| `existing_ineligible` | Présence/reçu connus, mais retrait, expiration, conflit, doublon, preuve manquante ou préconditions non valides empêchent une réouverture |

Tous les résultats portent `reopen_authorized=false`, `protections_changed=false`, `visibility_verified` explicite et une validité limitée aux observations. Une relecture indisponible après reçu reste `uncertain` ; une preuve de visibilité manquante après une ligne valide donne `existing_ineligible`. Le diagnostic précise la cause. Aucun de ces états ne déclenche d'action inverse.

Réponse perdue, erreur réseau avant/après transaction ou redémarrage : réutiliser **la même session, livraison, version, utilisateur de vérification, fichier, octets, clé et hash**. Refaire consentements et preuves contemporaines. Le publisher reprend idempotemment avec le même UUID si la ligne existe ; aucune seconde notification ni clé de secours. Un conflit, retrait, expiration ou doublon demande un examen opérateur ; aucune correction automatique ni republication sous une autre clé. Si l'identité de vérification épinglée devient inutilisable, arrêt et examen opérateur de la session, sans édition automatique de son binding.

Interruption : marqueur durable conservé, verrou sans TTL ni suppression automatique. Examiner session et processus/enfants, confirmer leur arrêt, puis retirer seulement le verrou exact selon AUTO.3 avant reprise. Les verrous coordonnent les outils coopérants ; les hashes détectent la corruption ou les changements observables, sans signature contre un administrateur hostile. Aucune transaction distribuée ne peut figer simultanément GitHub, Vercel et PostgreSQL : coordination des writers privilégiés toujours obligatoire. Toute divergence observée interdit `verified`.

Tests exclusivement simulés et fichiers/ACL temporaires isolés : `npm.cmd run prod:publication:test`. Aucun banc PostgreSQL, Supabase Local/Cloud ou Vercel réel nécessaire à cette validation.

## AUTO.4C — Commande finale prod:open

Après `prod:backup`, PR/merge classique, déploiements, promotion du même build Production sans rebuild et tests requis :

```powershell
npm.cmd run prod:open
```

L'entrée [open.ps1](../scripts/production/open.ps1) charge **la même** configuration `MY_PRODUCTION_CONFIG` / `D:\MY-operator\production.json`. Format AUTO.3 inchangé : aucune modification de sa configuration n'est nécessaire pour ajouter AUTO.4C à une session active. La cible publisher PROD.6 existante doit être placée à `notifications\target.json` à côté de ce fichier, ou désignée une fois par la variable non secrète `MY_PRODUCTION_PUBLISHER_TARGET`. Chemin absolu hors Git, cible/CA/cluster identiques à la session ; empreinte du fichier recontrôlée pendant l'exécution. Aucun credential dans ces JSON.

Le wrapper `secrets.ps1 -Tool ProductionOpen` lit la copie DPAPI existante, saisit masqués mot de passe opérateur, token Vercel, mot de passe du rôle publisher et token GitHub de lecture facultatif. Les secrets hérités sont refusés selon les contrats existants ; les canaux volatils sont consommés avant configuration/Git et nettoyés en sortie. Aucun secret de session utilisateur AAL2 n'est demandé. Tous les chemins/outils/permissions PROD.4 restent requis pour revérifier la sauvegarde locale, sans export ni restauration.

### Parcours et preuves

La commande affiche session, projet, source/version et archive/manifeste. Elle reprend PR, build et UUID du lecteur déjà épinglés. À défaut, elle demande leurs **valeurs réelles**, sans découvrir ou inventer de déploiement et sans réutiliser le build ancien de fermeture AUTO.3 comme build livré.

1. `AUTORISER CONNEXIONS` autorise les lectures GitHub/Vercel/Supabase de cette exécution, sans export. Résumé et saisies locales précèdent tout accès distant.
2. Vérification AUTO.4A complète de la même archive PROD.4, session/provenances, relation Git/PR/merge, package/lock, migrations, build Production/alias, maintenance et gel/révision. `LIVRAISON ATTESTEE` rattache les contrôles humains réalisés à un challenge neuf. Les relevés statiques peuvent être réutilisés **si toujours valides** ; logs, compatibilité, version/commit réellement servis, HTTP authentifié, coordination et prérequis de récupération doivent être réellement confirmés. L'essai PROD.5 adapté à l'archive, sa portée et ses limites doivent être référencés dans le relevé. Sans cette preuve, arrêter. Les marqueurs techniques `restore_proven` et `production_recovery_proven` restent **false** ; aucune déclaration n'en fait une preuve machine.
3. `PUBLIER CHANGELOG` autorise séparément PROD.6 pour le fichier/clé/hash exacts. Réutilisation directe de `publishOpenChangelog`, `openPublicationAPI`, `publicationIsVerified`, reçu et relecture indépendante. Contenu, activité, auteur, audience, version, hash, unicité et absence de retrait contrôlés ; une seule publication `changelog`.
4. `VISIBILITE AAL2 ATTESTEE` exige le challenge AUTO.4B neuf et les trois RPC de lecture avec **vraie identité éligible AAL2**, sans marquer lu/traiter. Référence et date UTC réelles, jamais JWT/cookie/réponse brute. Aucun appel utilisateur depuis `postgres`, faux claims ou droit supplémentaire. Sans client sûr autorisé, arrêt.
5. Revalidation fraîche. Deux autorisations distinctes de la publication : `DEGELER SUPABASE`, puis `ROUVRIR VERCEL`. Elles couvrent les cibles et révision/checkpoint affichés ; exclusion des autres opérateurs gel, changements de livraison, writers privilégiés/publisher/retrait/DDL/configuration et **tous** les writers Global Config jusqu'aux relectures finales. Refuser l'une empêche toute bascule dans cette exécution.
6. **Supabase d'abord** : AUTO.1 `reopen` avec système/révision attendus et autorisation, verrou transactionnel `771403`, commit puis socket indépendant ; révision exactement suivante et état ouvert obligatoires. `verify-open` et nouvelles lectures de livraison/publication avant la suite. Exception permanente `super_admin` inchangée.
7. **Vercel ensuite** : AUTO.2 `setMaintenance('reopen', { authorizeReopen: true, exclusiveWriter: true, checkpoint })`. Identité, All Deployments, liaison Production et store réexaminés avant PATCH ; seule `maintenance_production` change. Relecture indépendante obligatoire. Aucun changement Preview, SSO, domaine ou déploiement.
8. Nouvelles lectures des deux configurations, livraison/alias/migrations et annonce. `RETOUR EN LIGNE ATTESTE` rattache les contrôles **applicatifs humains** : GET/HEAD 200 authentifiés sur domaine/routes/ressources, version/commit/build effectivement servis, Auth/MFA, lectures et mutation légitime autorisée relue, reprise Phase 8 et disponibilité du changelog pour son audience. Conserver l'état individuel du lecteur de contrôle. Nouveau challenge/date/référence et relectures après cette intervention.

**Authentication All Deployments demeure active.** Un HTTP anonyme 302 vers SSO est normal. L'outil ne collecte aucun cookie/token utilisateur, ne fait aucun appel HTTP applicatif et ne fournit aucun bypass. Les preuves version servie/HTTP/visibilité et parcours réels restent explicitement opérateur ; les API seules ne démontrent pas la disponibilité globale. Sans moyen autorisé de prouver version/commit sous maintenance, la préparation reste bloquée comme AUTO.4A.

### Verrou, concurrence et reprise

Le contexte interne AUTO.4B reçoit la session gardée d'AUTO.4C. **Aucune libération du verrou AUTO.3 entre publication et ouverture.** Nonce du verrou, empreintes des fichiers/configurations et ACL sont recontrôlés. Chaque consentement et intention d'écriture est enregistré **avant** l'appel distant ; reçus et observations restent distincts. Les intentions lient session/exécution/livraison, preuve de publication, révision attendue/suivante et checkpoint fermé. Reprise d'une ouverture partielle : AUTO.4A refait les preuves avec les états exacts permis par ces intentions ; frontend déjà ouvert exige preuve HTTP ouverte, jamais faux 503. AUTO.4B passe alors en relecture seule avec reçu connu, sans autre appel de publication ; preuve AAL2 fraîche obligatoire.

Avant chaque bascule et après toute intervention humaine, les états volatils sont relus. Supabase conserve son CAS de révision. Vercel conserve verrou local et exclusivité opérateur, **sans CAS distant** : le checkpoint couvre tout le store, et toute contradiction observée avant PATCH bloque. Le verrou local ne rend pas GitHub/Vercel/PostgreSQL atomiques. Un opérateur externe ignorant la coordination peut encore changer l'état entre deux systèmes ; aucune garantie distribuée ou propagation mondiale n'est revendiquée.

Relancer **le même `prod:open`**, sans modifier le binding ni supprimer de session :

| État réel / incident | Reprise |
|---|---|
| Annonce publiée, deux protections fermées | Nouvelle préparation, reçu idempotent même fichier/clé/hash/UUID, preuve AAL2 et nouveaux consentements ; aucune deuxième insertion |
| Réponse publisher perdue | Même publication PROD.6 idempotente ; relire contenu/activité/UUID, jamais nouvelle clé |
| Supabase ouvert, Vercel fermé | Exiger intention durable autorisée, révision exactement suivante et checkpoint fermé inchangé ; lecture seule du changelog, preuves fraîches, consentement Vercel puis seule bascule restante |
| Dégel committé, relecture indisponible | État inconnu, aucun PATCH Vercel ; nouvelle connexion et examen opérateur à la reprise |
| Vercel ouvert, accusé perdu | Exiger intention durable, Supabase ouvert à la révision attendue et examen des changements distants ; sans checkpoint de retour durable, vérifier aussi journal fournisseur/exclusivité/absence d'autre changement du store. Le nouveau checkpoint est une observation après examen, pas une preuve CAS |
| Deux protections ouvertes, tests finaux incomplets | État partiel explicite ; ni publication ni bascule supplémentaire. Refaire contrôles de livraison/annonce/AAL2 et preuve applicative finale |
| Mauvaise révision, checkpoint modifié, livraison différente ou ouverture sans intention autorisée | Arrêt ; aucun nouveau checkpoint adopté silencieusement, aucune compensation |
| Succès complet, accusé local perdu ou nouvelle exécution | Relire réellement et refaire preuves contemporaines ; aucun publish/PATCH/dégel supplémentaire. Clôture historique conservée, aucun succès inféré du seul résultat ancien |

Une reprise incomplète exige `REPRENDRE OUVERTURE` après examen des processus/enfants, marqueurs et changements distants. Signal/arrêt forcé conserve le verrou AUTO.3 ; AUTO.2 conserve son marqueur en cas d'erreur suivant son contrat. Aucun TTL, kill, suppression automatique de marqueur ou verrou d'interruption. Le précontrôle refuse un marqueur AUTO.2 existant ; appliquer son examen indépendant puis retirer manuellement **uniquement le marqueur exact** après arrêt/coordination. Pas d'opération inverse automatique, même si les protections sont déjà partiellement levées. Les erreurs affichent séparément Supabase et Vercel : `closed`, `open` ou `unknown`, sans promettre qu'ils sont encore tous deux fermés.

### Clôture et première utilisation réelle

`session.open_reopening` et les relevés AUTO.3 existants conservent version/source/merge/PR/build/changelog, notification/reçu, autorisations, intentions, états réellement confirmés et preuves finales avec provenance/date. `stage=completed` exige les deux états ouverts **et** la preuve applicative finale, suivis de relectures concordantes. Le relevé final et sa référence sont contrôlés au chargement. Échec de contrôle, persistance ou verrou : résultat incomplet, prochaine sauvegarde bloquée. `current.json` reste sur cette session terminée jusqu'au prochain `prod:backup`, qui crée un nouvel UUID et remplace seulement le pointeur atomiquement ; historique protégé et références d'archives intacts. Pointeur absent ou dossier actif orphelin : examen obligatoire.

Tests : `npm.cmd run prod:open:test`, intégration isolée du vrai cœur AUTO.4A/B, PROD.6 et des sessions/ACL, avec fournisseurs simulés et réseau interdit. Les wrappers Windows/DPAPI sont exercés uniquement avec secrets synthétiques. [Validation et limites](reports/2026-10-16-AUTO4C-PRODUCTION-OPEN.md).

Restent avant le premier usage autorisé : configuration AUTO.3 complète, volume/clé/ACL, cible et droits publisher, accès GitHub si privé, changelog exact de la version livré/validé/committé, moyens autorisés pour les preuves AAL2 et applicatives, vraie sauvegarde et essai de récupération PROD.5 adapté. Le dépôt conserve seulement le changelog historique `0.8.29.json` : aucun changelog `0.8.33` inventé pour cet outillage. Droits/transport Cloud, délais/propagation, erreurs de vrais fournisseurs, interruption du processus/poste et coordination multi-opérateurs restent à éprouver dans une intervention Production explicitement autorisée. Aucun usage réel effectué ici ; AUTO.5 non commencé.
