# AUTO.3 — Fermeture et sauvegarde Production

`npm run prod:backup` orchestre AUTO.2, AUTO.1 et PROD.4. Livraison d'outillage Windows en version applicative **0.8.33 conservée**, sans dépendance nouvelle. Tests sur mocks et fichiers/secrets synthétiques temporaires uniquement ; aucune opération Vercel/Supabase Cloud ni capture Production effectuée pendant cette livraison. [Rapport](reports/2026-10-16-AUTO3-PRODUCTION-BACKUP.md).

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
