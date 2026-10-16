# Automatisation des publications Production

`npm run prod:backup` orchestre AUTO.2, AUTO.1 et PROD.4. Livraison d'outillage Windows en version applicative **0.8.33 conservée**, sans dépendance nouvelle. Tests sur mocks et fichiers/secrets synthétiques temporaires uniquement ; aucune opération Vercel/Supabase Cloud ni capture Production effectuée pendant cette livraison. [Rapport](reports/2026-10-16-AUTO3-PRODUCTION-BACKUP.md).

**AUTO.4A** ajoute les fondations internes de préparation de réouverture, décrites [ci-dessous](#auto4a--préparation-de-réouverture). Aucune commande `prod:open`, publication de notification ou levée de protection livrée. Version `0.8.33` conservée, comme AUTO.1–3 : outillage opérateur sans changement applicatif.

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

Le dossier opérateur contient `session.json` et des relevés immuables référencés par UUID : identité, source Git/version, empreinte des configurations et inventaire, révision, état/checkpoint Vercel, déclarations et preuves avec provenance/date, autorisations distinctes, destinations/tentatives, statuts réels, SHA-256 du manifeste chiffré et informations de reprise. ACL restreintes aux nouveaux dossiers, fichiers hors Git et hors synchronisation. Ni token, mot de passe, clé AES, contenu Auth ni inventaire SQL dans ces relevés de session. `current.json` désigne la session active ; le futur `prod:open` devra lire ce contrat et authentifier l'archive/publication correspondantes.

Relancer **la même commande** après diagnostic :

- Fermeture déjà effective : nouvelles lectures, sans révision/PATCH inutiles. Une reprise inachevée demande `REPRENDRE SESSION` après examen de l'ancien processus et de ses éventuels enfants.
- Capture partielle avec `INCOMPLETE`, fichiers absents ou sans manifeste : tentative conservée, jamais validée ni réutilisée comme destination ; nouvelle capture après nouveaux consentements et contrôles.
- Capture terminée dont l'accusé a été perdu, ou échec du `verify` indépendant : vérifier la même archive avant toute nouvelle capture. Aucun export sensible supplémentaire pour cette relecture. Mauvaise intégrité, source, cible, révision ou provenance : arrêt, sans remplacer silencieusement l'archive.
- Session déjà validée : relire maintenance et révision exacte, refaire `verify`, rendre la même sauvegarde. Aucun nouvel export, même si `dev` a avancé pendant la publication. Une protection désormais ouverte provoque un refus sans refermeture implicite.
- Source changée pendant une session sans archive terminée, ou configuration/inventaire changé : refus ; examiner et reprendre avec les références originales. Aucun transfert silencieux d'une session à une autre publication. Une archive terminée reste liée à son commit initial et peut être revérifiée si `dev` a avancé.

Verrou local AUTO.3 : `%LOCALAPPDATA%\MY\production\prod-backup.lock`, en plus du verrou équipe/store AUTO.2. Pas de TTL ni reprise automatique par PID. Erreur contrôlée : l'état de la session est sauvegardé, verrou AUTO.3 libéré si aucun signal. Signal/arrêt forcé : marqueur conservé, état inconnu. Examiner indépendamment processus, enfants, session et verrous exacts ; supprimer manuellement **uniquement les marqueurs identifiés** après leur arrêt et coordination. AUTO.2 peut garder son propre verrou après erreur ; sa procédure reste obligatoire. Aucun script ne tue les autres backends ou ne réouvre les protections.

La session reste active après succès. Son archivage/avancement appartient à la future clôture `prod:open` : AUTO.3 ne fournit pas de bouton « nouvelle publication » qui abandonnerait une session active. Pour une rotation avant livraison de cette future commande, une procédure opérateur explicitement cadrée reste nécessaire ; ne pas supprimer les références pour forcer une nouvelle capture.

## Workflow de publication conservé

1. `prod:backup` : fermeture, drainage, sauvegarde chiffrée vérifiée ; restauration et autres prérequis de publication restent distincts.
2. PR `dev` → `main`, merge, déploiements, réussite Supabase, promotion du build Production identifié sans rebuild et tests requis.
3. **Futur `prod:open`**, non implémenté par AUTO.3 : retrouver la session, vérifier publication et changelog publié une seule fois, puis dégel et réouverture selon les conditions E existantes.

Les commandes manuelles actuelles demeurent disponibles selon leurs contrats. Aucune exigence de fermeture, restauration, notification, vérification de l'artefact réellement servi ou réouverture n'est supprimée par l'orchestration.

## AUTO.4A — Préparation de réouverture

API interne [prepareOpen](../scripts/production/open-preparation.js), destinée à AUTO.4B/C. Elle lit la configuration permanente via `configurationBundle`, puis le même `sessions_directory/current.json` et la même session `my-production-session-v1`. Aucun second registre, nouvelle sauvegarde ou rotation de session. Les entrées de livraison sont uniquement le numéro de PR et l'identifiant du build Production attendu. Le fichier de changelog suit la convention existante `scripts/notifications/releases/<version>.json` : il doit être présent dans le commit sauvegardé, validé lors de sa clôture, puis identique dans le worktree utilisé pour la préparation. Un fichier absent bloque ; aucun exemple historique n'est substitué.

### Contrôles automatiques

- Dossier hors Git/synchronisation, chemins canoniques sans reparse point, volume M: identifié par son numéro de série, ACL des dossiers et fichiers de session réservées à l'opérateur courant et SYSTEM. ACL trop larges : refus, sans réparation implicite. Un seul dossier UUID actif admis tant que la rotation de session n'est pas livrée.
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

Tous les résultats portent `publication_authorized=false`, `reopen_authorized=false`, `remote_writes=false` et une validité limitée aux observations. **`ready` n'est ni une autorisation ni un jeton durable.** AUTO.4B/C devront refaire les contrôles actuels avant toute action, puis obtenir leurs consentements propres. Ils pourront réutiliser `prepareOpen`, le binding exact du changelog, `operatorEvidenceSchema`, l'API de lectures `openPreparationAPI`, `inspectRelease`/`prepareChangelog`, la vérification partagée d'archive et `VercelMaintenance.publication`.

Même verrou `prod-backup.lock` qu'AUTO.3, sans TTL ni reprise automatique par PID. Sauvegardes de `session.json` par remplacement atomique ; empreintes du pointeur, de l'état et des relevés, identité des dossiers contrôlées avant chaque sauvegarde. Ce verrou coordonne les clients coopérants ; les contrôles détectent aussi les éditions extérieures entre lectures, sans prétendre fournir un CAS contre un processus hostile ignorant le verrou. Interruption : résultat en cours reste `unknown`, marqueur conservé. Après examen indépendant et arrêt des anciens processus/enfants, retirer seulement le verrou exact puis reprendre la préparation ; archive et binding conservés, preuves distantes et déclarations à refaire. AUTO.4A ne crée aucun processus enfant de capture.

`openPreparationAPI` n'expose que lectures et vérification locale, avec autorisation de connexion explicite à sa construction. Le futur appelant devra consommer/nettoyer les canaux secrets **avant Git ou tout processus enfant**, conserver les identifiants en mémoire et appeler `dispose()` en `finally`, comme AUTO.3. Les erreurs fournisseurs et réponses privées sont supprimées des résultats. Aucun publisher ou setter de protection n'est appelé. Pas de wrapper interactif ou commande d'exploitation livré dans AUTO.4A ; seul `npm.cmd run prod:prepare:test` est ajouté.

Validation : mocks HTTP/PostgreSQL, sessions/ACL et graphe Git synthétiques dans des dossiers temporaires isolés. Aucune lecture ou écriture des projets réels. [Rapport AUTO.4A](reports/2026-10-16-AUTO4A-OPEN-PREPARATION.md).
