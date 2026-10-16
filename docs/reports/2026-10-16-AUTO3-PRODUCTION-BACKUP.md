# AUTO.3 — Orchestrateur de fermeture et sauvegarde Production

Date : **16 octobre 2026**. Branche `dev`, HEAD initial **`7efb53b2a796107e9f1c6a87f230d3418a2ef20d`**, worktree initial propre. Version package/lock/racine **0.8.33 conservée**, suivant AUTO.1/AUTO.2 pour cet outillage opérateur sans changement applicatif. Aucune dépendance ajoutée, aucun commit/push.

## Livraison

`npm run prod:backup` fournit l'entrée interactive Windows. Configuration permanente stricte hors Git, projets fermés, source `dev` propre/committée, cohérence des cibles/configurations et du package/lock, volume `M:\MY-backups` existant et identité épinglée. Réutilisation des fichiers AUTO.1/AUTO.2/PROD.4 et de l'inventaire externe, sans lire de vrais credentials pendant cette livraison.

Ordre : précontrôles et autorisation des connexions ; fermeture/confirmation maintenance Vercel puis gel Supabase ; relectures et déclarations contemporaines HTTP/couverture/propagation/refus API/exclusion durable ; drainage technique indépendant ; autorisation d'export sensible distincte ; capture chiffrée dans destination neuve ; `verify` indépendant ; relecture finale des protections. Aucun état inconnu ou consentement absent n'autorise la suite. Les protections déjà actives ne provoquent aucun PATCH/révision supplémentaire grâce aux moteurs existants.

Réutilisation directe :

- **AUTO.2** : `createVercelMaintenance(target, token, options).preflight()` et `.setMaintenance('close', consent)`, checkpoint et exclusivité opérateur imposés. Protection All Deployments conservée ; aucun contournement SSO.
- **AUTO.1** : `parseCommand` et `run` du moteur existant, pour `preflight`, `close`, `verify-closed` Cloud. Révision BIGINT exacte, TLS/identité, contrat SQL et relecture indépendante conservés.
- **PROD.4** : `capture`, `verify`, déchiffrement authentifié de leurs métadonnées et SHA-256 du manifeste pour liaison à la session ; `identity`, `requireClosed` et observations existantes pour drainage technique. Aucun changement au moteur, au format d'archive ou aux contrats.
- **DPAPI** : extension ciblée du wrapper existant par `Tool=ProductionBackup`, sans changer les modes Backup/Restore. Copie DPAPI existante, mot de passe/token masqués, canaux volatils et nettoyage ; aucun secret dans arguments, fichiers de session ou diagnostics.

## Session et reprise

`scripts/production/` possède configuration, session/relevés, orchestrateur et entrée interactive. `current.json` désigne une session protégée contenant source/version, projet, empreinte des fichiers opérateur, états/révisions, preuves datées et provenance, tentatives/destinations, statuts capture/verify et SHA-256 du manifeste chiffré. Références de fermeture générées liées aux relevés réels ; fichiers permanents d'origine inchangés.

Capture incomplète : conservée, jamais validée ni réutilisée comme destination. Capture terminée sans accusé, ou échec du verify indépendant : reprise par vérification de la même archive, sans nouvelle fermeture/attestation/export. Source, cible, révision, empreinte et références doivent correspondre. Session validée : nouvelle vérification des protections et de l'archive, sans duplication même après avancement de `dev` pendant publication. Pointer manquant avec sessions existantes : arrêt, sans nouvelle capture.

Échec/interruption : état sauvegardé quand possible, aucun rollback. Signal/arrêt forcé conserve le verrou AUTO.3 ; AUTO.2 conserve ses propres marqueurs selon son contrat. Aucun TTL, récupération automatique par PID, force, kill de backend, reset ou restauration. Reprise seulement après examen indépendant des processus/enfants et marqueurs exacts. La session active n'est pas abandonnée pour démarrer automatiquement une nouvelle publication ; son cycle de clôture appartient au futur `prod:open`.

## Preuves et frontières

Les lectures Vercel restent des preuves du plan de contrôle. HTTP anonyme 302 vers SSO n'est pas traité comme erreur de maintenance ; aucun accès HTTP applicatif réel n'est effectué par cet orchestrateur. L'opérateur atteste les contrôles via admission Vercel normale, fournit déploiement réel et date UTC du contrôle après fermeture. Provenance et date de déclaration sont distinctes de l'heure observée ; pas de propagation mondiale automatiquement attestée.

L'exclusion permanente des writers privilégiés/DDL/configuration reste une déclaration explicite coordonnée, sans affaiblir l'exception `super_admin`. Elle ne remplace jamais le drainage : connexion TLS/identité/visibilité, verrou partagé `771403`, état/révision, zéro admission résiduelle, zéro transaction préparée et aucune transaction cliente ordinaire/privilégiée/non classée. Auth interne conserve les garanties et limites snapshot/séquences PROD.4.

Volume : présence et numéro de série contrôlés automatiquement ; chiffrement au repos et exclusion des synchroniseurs proviennent d'un relevé opérateur permanent réellement vérifié, référencé dans l'inventaire externe. Aucun chiffrement inféré d'une lettre de lecteur. Secrets/clés, configuration externe, Storage/Vault et restauration restent soumis aux contrats existants.

**Aucune opération réelle Vercel/Supabase Cloud, aucune capture Production, aucun accès/export de données personnelles Local.** Aucun SQL/migration, garde, ACL/RLS, exception `super_admin`, TLS, frontend, déploiement, publisher, promotion ou configuration distante modifié. Les états Cloud historiques restent déclarations propriétaire, non rafraîchies. `restore_proven=false`, `production_recovery_proven=false`, `publication_authorized=false` ; un verify réussi ne prouve pas PROD.5.

## Validations

| Commande | Résultat |
|---|---|
| `npm.cmd run prod:backup:test` | **44 tests réussis**, aucun ignoré |
| `npm.cmd run backup:test` | **7 tests réussis** |
| `npm.cmd run maintenance:test` | **7 tests réussis** |
| `npm.cmd run maintenance:vercel:test` | **45 tests réussis**, API simulée et wrappers synthétiques |
| `npm.cmd run typecheck` | Réussi |
| `npm.cmd run lint` | Réussi, zéro warning |
| Versions package/lock/racine, liens locaux modifiés, `git diff --check` | Réussis |

AUTO.3 : quatre combinaisons initiales ouvert/fermé, consentements absents, échecs Vercel/Supabase, contradictions, source/configuration modifiée pendant confirmation, attestation/date invalide, drainage réel `requireClosed` avec client simulé, timeout moteur simulé, signal via AbortController, capture incomplète et reprise, perte d'accusé, verify échoué, archive/source/révision/empreinte/provenance contradictoires, session déjà validée, avancement de dev, protection ouverte et verrous concurrents. Transport HTTP et connexions PostgreSQL réelles interdits par les tests AUTO.3 avant tout endpoint ; dossiers et clés exclusivement temporaires synthétiques hors dépôt. Wrapper PowerShell/DPAPI réellement exercé avec secrets synthétiques et invocation Node interceptée pour vérifier leurs canaux sans connexion ni capture.

Pas de nouvelle campagne Docker/PostgreSQL/native, restauration ou frontend : moteurs inchangés. Les erreurs/timeouts de capture sont injectés ; aucune preuve de capture Cloud, d'interruption complète d'un vrai processus d'export orchestré ou de récupération Production n'en est déduite. Les délais/outils natifs et les limites d'arrêt forcé restent ceux de PROD.4.

Documentation PostgreSQL 17 consultée via Context7 pour `pg_stat_activity`, `pg_locks` et `pg_prepared_xacts` ; changelog Supabase consulté. Aucun nouvel usage d'API fournisseur ni SQL introduit ; les règles d'identité et de drainage existantes sont réutilisées.

## Utilisation réelle restante

Préparer une fois [configuration opérateur](../13-PRODUCTION-AUTOMATION.md#configuration-initiale-une-seule-fois), fichiers cibles/inventaires complets, clé DPAPI et coffre indépendant, répertoire de sessions et volume M: réellement chiffré et examiné. Autoriser ensuite séparément une intervention réelle : droits/transport Cloud et token Vercel restent non éprouvés ici ; contrôles HTTP/propagation/exclusion durable requis à chaque capture. Éprouver une vraie archive en PROD.5 et conserver les autres prérequis de publication.

Séquence conservée : **`prod:backup` → PR `dev` vers `main`, merge, déploiements, promotion/tests → futur `prod:open` avec publication/vérification du changelog, puis dégel/réouverture**. AUTO.3 n'implémente pas `prod:open`.
