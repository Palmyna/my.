# PROD.7B.1 — Transport natif Windows pour les sauvegardes Cloud

Date : **14 octobre 2026**. Livraison locale : **`0.8.30`**. Branche **`dev`**, HEAD initial/final **`ccf94bcee65eb4b45a5d9792e7d6d096214b21ae`**. Dépôt initial propre. Aucun commit/push. PROD.7B.2 et PROD.7C non commencées.

## Verdict et frontière de preuve

**Critère synthétique satisfait : véritable capture PROD.4 avec `pg_dump.exe` Windows 17.11, même snapshot que les inventaires Node, chiffrement immédiat et vérification native complète.** Sept fichiers chiffrés, format custom PostgreSQL et enveloppe AES-256-GCM `MYBK0001` conservés. Aucune dépendance au réseau IPv6 Docker dans le chemin natif livré.

**T2 corrigé dans l'outillage, aucune capture Cloud exercée ni autorisée par ce résultat.** La route directe Windows/TLS/identité Cloud est une information du propriétaire, non revérifiée ici. Version serveur Cloud inconnue. `restore_proven=false`, `production_recovery_proven=false`, `publication_authorized=false` ; aucun mécanisme de restauration Production ajouté.

## État examiné et décision

Lecture des instructions AGENTS, audit [PROD.7A](2026-10-14-PROD7A-PUBLICATION-AUDIT.md), références [11](../11-PUBLICATION-PRODUCTION.md)/[12](../12-SUPABASE-BACKUP.md), contrats/scripts/tests de capture et restauration. Le moteur existant possède déjà le snapshot exporté, inventaires, chiffrement et chaîne de vérification nécessaires. Seul lancement des clients dépendait de Docker. Extension à cette couche ; aucun second moteur ni changement de contenu métier.

Les trois outils présents dans `D:\projets\my\tools\postgresql-17.11\pgsql\bin` ont été démarrés réellement, d'abord directement puis par le lanceur livré :

| Outil | Version effective | SHA-256 EXE observé |
|---|---|---|
| `pg_dump.exe` | `pg_dump (PostgreSQL) 17.11` | `e856d19e6b73f351069d2d3d9f442e8c0371bebfc53c7e55b455adfc0b8ee14b` |
| `pg_restore.exe` | `pg_restore (PostgreSQL) 17.11` | `c85a472c22c4eb657f76e70a87b55e2070474cd0042bcb87b50a787d085d950c` |
| `psql.exe` | `psql (PostgreSQL) 17.11` | `aa12e27530ac07f129e69daca953ea5f02202a7bde45d503e771abc39016536d` |

Ces empreintes constatent les fichiers du poste, pas leur provenance fournisseur. Aucun outil installé, modifié ou service Windows créé. Documentation PostgreSQL 17 obtenue via Context7, complétée par les pages officielles/source libpq pour ses fichiers implicites Windows. Changelog Supabase public consulté, sans accès au projet ; changements HTTP TLS et extensions n'impliquent aucune opération ici.

## Contrat et garanties

- Cible **v1 = Docker**, inchangée ; cible **v2 = `windows-native`** explicite. Cloud natif uniquement direct, projet/hostname/port/base/login fermés, CA et `system_id` exacts ; pas de sélection PATH, session/transaction pooler natif, fallback ou cible personnelle.
- `native_clients` épingle répertoire canonique local, version et SHA-256 des trois EXEs plus toutes les DLL adjacentes. Contrôle avant chaque lancement, aucun lien/jonction dans les ancêtres ; fichier modifié/absent, DLL ajoutée, EXE inconnu ou mauvaise version = refus. Trois versions réelles contrôlées à capture et verify ; même majeure serveur, mineure dump au moins celle du serveur.
- Environnement natif reconstruit ; aucun PG hérité, profil, service, option, OpenSSL config ou secret tiers. Répertoire de travail bin contrôlé, EXE absolu, sans shell. Password uniquement dans environnement enfant `PGPASSWORD`, sans fichier/URL/argv/log/manifeste ; clé de chiffrement jamais transmise aux clients PG.
- Node et libpq imposent CA épinglée, chaîne et hostname vérifiés, TLS ≥ 1.2 ; natif `sslmode=verify-full`, GSS désactivé et SCRAM obligatoire. Les fichiers implicites de certificat/clé/CRL/password/service Windows ne peuvent changer la connexion. Aucun mode non chiffré de test ajouté au transport natif.
- Même moteur `capture` : identité et visibilité effectives, contrat PROD.2, gel committé puis relecture, drainage/barrière `771403`, snapshot exporté, inventaires/hashes/séquences aux bornes, archive entière sans exclusions et avec owners/ACL. Aucune modification SQL ni élargissement de droits de capture.
- stdout dump → chiffrement existant immédiatement. `pg_restore` consomme archive déchiffrée authentifiée par stdin ; TOC et rendu complet vers stdout drainé, sans DB ni fichier SQL. stderr arbitraire absorbé ; code non nul, avertissement, timeout ou interruption = refus, pas de réouverture/retry.
- Manifeste **v2** authentifie transport/pins natifs ; **v1** reste strictement associé à cible Docker v1. Aucun ancien format réinterprété. `verify` et preflight PROD.5 suivent le transport authentifié. Format custom, sept fichiers, six entrées de checksum et chiffrement restent identiques ; seul contrat cible/manifeste évolue.
- Secrets AES nettoyés aussi lors des nouveaux refus de précontrôle. Plafonds de sortie TOC/versions refusent explicitement tout dépassement, même si un enfant terminait avec code zéro.

Limites Windows : administrateur/SYSTEM, même utilisateur ou diagnostic privilégié peut lire mémoire/environnement. Chaînes JS non effaçables avec garantie ; pas de défense contre un attaquant de même compte remplaçant un fichier entre contrôle et lancement. OS, DLL système, binaires et configuration doivent être de confiance, avec ACL et disque chiffré. Les empreintes ne sont pas une attestation éditeur. Timeouts : versions 10 s, connexion 10 s, dump 15 min, lecture archive 5 min. Arrêt forcé du parent/poste peut empêcher le nettoyage : état inconnu à examiner indépendamment.

## Preuves réellement exécutées

La nouvelle campagne utilise un cluster **PostgreSQL 17.6 synthétique**, image Supabase déjà présente `sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86`. Nom source réservé aléatoire `my-prod4-test-<12 hex>`, nonce/ID/image contrôlés, `network=none`, aucun port publié, aucun volume/bind ; stockage PG/tmp en tmpfs. Un relais Windows aléatoire **lié seulement à `127.0.0.1`** rejoint ce seul cluster via `docker exec nc`. TLS réel reste de bout en bout entre client Windows et PostgreSQL. HBA SCRAM sur TCP, certificats/CA éphémères synthétiques. Aucun hosts/DNS, réseau Docker ou service Windows modifié.

Fixtures issues des 50 migrations et de données synthétiques versionnées ; 39 tables avec empreintes, UUID/BIGINT/sequences exacts. Schémas Auth représentatifs, sans prétendre remplacer la campagne GoTrue complète PROD.5. La capture de test autorise explicitement le worktree sale avec `synthetic=true` ; source Git archivée = HEAD initial. Le CLI Cloud conserve exigence de source propre committée. Aucune archive de travail synthétique conservée après nettoyage.

| Vérification | Résultat et portée |
|---|---|
| `node --test scripts/maintenance/operator.test.js scripts/backup/operator.test.js scripts/backup/native.test.js scripts/backup/restore.test.js` | **16/16 PASS** : sélections/autorisations, cible native fermée, maintien v1, décimales, GCM et refus restauration |
| `npm.cmd run backup:test:native`, `MY_BACKUP_NATIVE_BIN` explicitement fourni | **16/16 PASS**, dont six tests opérateur importés, neuf scénarios natifs et leur parent ; aucun skip sur Windows |
| Trois EXEs natifs + versions | Démarrages réels 17.11 ; paths inexistants/non canoniques/jonction, outil inconnu, version 17.10 déclarée, EXE/DLL modifiés et DLL ajoutée refusés |
| TLS et secrets | Connexion native/Node valide, SCRAM réel ; mauvaise CA/empreinte, hostname incorrect, certificat expiré et serveur sans TLS refusés ; PG/Node/OpenSSL/secrets hérités injectés sans effet sur cible/TLS ; argv du processus connecté sans password |
| Capture et MVCC | `capture_integrity_verified`, sept fichiers `MYBK0001` ; modification concurrente sur seconde connexion visible ensuite en DB, exclue du dump ; empreinte inventoriée égale avant modification et différente de l'état nouveau ; owners/ACL/RLS et BIGINT exacts dans rendu natif mémoire |
| Lecture complète | `verify` et preflight PROD.5 natifs réels. CLI `--command verify` lancé sans Docker dans PATH ni password DB. Corruption de données qui laisse TOC lisible mais GCM/checksums recalculés valides : lecture complète et verify refusent |
| Échecs et interruptions | Snapshot supprimé avant vrai dump : `INCOMPLETE`, pas de manifeste. Connexion réelle de `pg_dump` observée dans `pg_stat_activity`, puis interruption : enfant fermé, marqueur conservé, aucun succès/réouverture. Timeout natif sur vrai `psql select pg_sleep` : diagnostic fixe |
| `node --test scripts/backup/local.integration.js scripts/backup/restore.integration.js` | **44/44 PASS** : transports Docker PROD.4/5, capture/verify/DPAPI, restauration native transactionnelle, 55 tables/243 lignes/8 séquences, 83 assertions PROD.2, Auth/password/TOTP original/AAL2/refresh, erreurs/interruption et CLI isolée |
| `npm.cmd run build` | **PASS**, inclut `npm run typecheck` ; avertissement Vite de taille de chunk > 500 kB, sans échec |
| `npm.cmd run lint` | **PASS**, zéro avertissement ESLint |
| Versions via Node / `git diff --check` | **PASS**, package/lock/racine lock `0.8.30` ; diff sans erreur d'espacement |

Campagne finale réunissant les sept fichiers ci-dessus en une commande `node --test` : **76/76 PASS, zéro échec, zéro skip**, durée environ 77 s. Ce total comprend les tests opérateur importés dans les intégrations ; il ne représente pas 76 scénarios natifs distincts. Nettoyage final : aucun conteneur portant les labels de ces campagnes restant.

Premier essai natif a refusé le TLS synthétique : un répertoire CRL inexistant provoquait l'activation de contrôles CRL OpenSSL sans liste. Remplacé par référence à un fichier CRL réservé absent, selon sémantique libpq, pour neutraliser le profil implicite. **Aucun assouplissement CA/hostname/verify-full** ; cas positif puis tous les refus TLS redémontrés.

Supabase Local personnel : uniquement inspection Docker ID/StartedAt/montages du conteneur `supabase_db_my-local` avant/après, égalité vérifiée. Aucun accès SQL, capture, fixture, reset, stop/restart ou changement du volume personnel. Ce contrôle métadonnées ne constitue pas une comparaison de ses lignes. Ressources synthétiques supprimées par ID/nonce exacts, dossiers temporaires contrôlés avant suppression ; aucun nettoyage par préfixe ni commande sur volumes personnels.

## Fichiers livrés et état Git

| Fichiers | Modification |
|---|---|
| `scripts/backup/native.js` | Validation runtime/CA, environnement et lancement Windows borné |
| `scripts/backup/clients.js` | Réutilisation des mêmes dump/inspect ; dispatch natif ou Docker |
| `scripts/backup/contract.js`, `scripts/backup/cli.js` | Cible/manifeste v2 distincts, v1 préservé, capture/verify existants |
| `scripts/backup/database.js` | TLS natif isolé, hostname explicite et neutralisation options PG héritées |
| `scripts/backup/restore.js` | Seule lecture d'archive preflight suit transport source ; écriture/destination inchangées |
| `scripts/backup/native.test.js`, `scripts/backup/native.integration.js` | Contrat et véritables captures/échecs Windows isolés |
| `scripts/backup/examples/target.windows.json` | Modèle sans secret ; empreintes et cible à examiner/remplir hors Git |
| `package.json`, `package-lock.json` | PATCH `0.8.30`, scripts de tests natifs |
| `README.md`, `docs/08-ROADMAP.md`, documents 11/12 | Version courante, transport/prérequis/procédure/limites et frontières de preuve |
| Ce rapport | Résultats et reste à faire |

État final contrôlé : **11 fichiers suivis modifiés, 5 nouveaux fichiers non suivis**, aucun changement staged. Aucun fichier métier/frontend, migration, publisher PROD.6, configuration Vercel/GitHub ou règle PROD.2 modifié. Rapports historiques inchangés.

## Interventions restantes, hors PROD.7B.1

1. Lors d'une intervention Cloud distinctement autorisée : confirmer version serveur exacte, CA/hostname, cible/`system_id`, SCRAM, droits complets d'inventaire/export/locks/snapshot, schémas/roles/extensions gérés, Auth/keys/config et Storage/Vault. Aucun grant supplémentaire automatique.
2. Établir installation autorisée PROD.2, maintenance et gel committé/drainage, exclusion durable des writers privilégiés/DDL/config ; preuves et consentements de capture distincts. Examiner distribution/pins/ACL natifs et sauvegarde indépendante de la clé.
3. Première capture Cloud réelle seulement dans sa phase autorisée, depuis source propre ; verify, puis récupération adaptée sur destination isolée avec clients compatibles. **Preflight v2 prouvé ici ; restauration effective d'une archive 17.11 non exercée ici.** Image destination 17.6 conserve refus de version client différente, sans abaisser ce contrôle. Campagne restauration 44/44 concerne les archives Docker 17.6 existantes.
4. Récupération applicative/Cloud, contrôle frontend sous fermeture (T1), publication et répétition Production restent distincts. Aucune de ces opérations ni PROD.7B.2/7C commencée.

Références publiques : [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [snapshots](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION), [libpq TLS](https://www.postgresql.org/docs/17/libpq-ssl.html), [paramètres libpq](https://www.postgresql.org/docs/17/libpq-connect.html), [environnement](https://www.postgresql.org/docs/17/libpq-envars.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html).
