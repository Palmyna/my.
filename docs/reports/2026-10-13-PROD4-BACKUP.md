# PROD.4 — Outillage de sauvegarde manuelle Supabase

Date : **13 octobre 2026**. Version livrée : **`0.8.27`**.

## Résultat

**Outillage reproductible livré et validé sur PostgreSQL isolé synthétique.** Préparation sans connexion, capture future exigeant cible Cloud et consentements connexion/export distincts, snapshot PostgreSQL partagé, archive native complète, inventaires Auth/rôles/migrations/configurations, chiffrement immédiat, manifeste et vérification indépendante. Aucune dépendance, migration métier ou restauration ajoutée.

**Aucune connexion/export Supabase Cloud, sauvegarde Production, modification distante, déploiement, PR, commit ou push. Aucun reset ni export de données personnelles Local. Aucune restauration.** Succès signifie `capture_integrity_verified`, avec `restore_proven=false` et `publication_authorized=false`. Le workflow Production reste non opérationnel jusqu'à PROD.5 et ses autres validations.

Référence opérateur et **matrice détaillée du périmètre, droits, exclusions et preuves** : [12-SUPABASE-BACKUP.md](../12-SUPABASE-BACKUP.md). Ordre officiel : [11-PUBLICATION-PRODUCTION.md](../11-PUBLICATION-PRODUCTION.md), sauvegarde après fermeture/gel effectifs, avant PR et migrations.

## État réel et conservation

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `36be2bca5ba278a2d89417090f3722b240472387` | Identique |
| Git | `git status --short` vide | Modifications PROD.4 non commitées : 9 fichiers suivis, 13 nouveaux fichiers |
| Package/lock/racine lock | `0.8.26` | `0.8.27`, PATCH synchronisé avec `npm.cmd version --no-git-tag-version` |
| Historique Local réel | 50, dernière `20261013135415` | Identique |
| Gel personnel Local | Ouvert, révision exacte `120` | Ouvert, même révision `120` et horodatage ; aucune bascule |
| PROD.3 | `backup_authorized=false` | Inchangé ; contrôle partagé extrait sans changer le contrat |

Lectures préalables : AGENTS, procédure Production, architecture/DB/roadmap/README, rapports PROD.1/2/3, code maintenance/pipeline/publisher/Edge, migrations et catalogue Local des schémas/rôles/Auth/extensions. Versions et aides réelles consultées : Node 24.20.0, npm 12.1.0, Supabase CLI 2.120.0, Docker 29.8.2 et clients/serveur PostgreSQL 17.6. Aucun client PostgreSQL Windows natif trouvé ; clients Docker utilisés.

Inventaire Local en lecture seule : 23 tables MY. public/private, 24 tables Auth ; triggers `auth_user_created_profile`, `auth_user_deleting_account`, `business_write_freeze` sur Auth ; zéro bucket/objet Storage, zéro secret Vault. Extensions plpgsql 1.0, uuid-ossp 1.1, pgcrypto 1.3, pg_stat_statements 1.11, supabase_vault 0.3.1, citext 1.6, pgtap 1.3.3. Le code MY. consomme les assets TCGdex externes et n'utilise pas Storage/Vault. **Usage/version/droits réels Cloud non vérifiés** ; anciens checkpoints du propriétaire restent historiques.

Seules lectures de précontrôle/catalogue/aides sur le conteneur personnel. Pas d'empreinte globale de données personnelles produite et aucune revendication de comparaison hash avant/après de ces données. Les tests créent leur propre PostgreSQL, installent les migrations versionnées et fixtures réservées ; seul ce conteneur et ses fichiers temporaires exacts sont nettoyés. Aucun Docker volume nommé touché, aucune commande `db reset`, `volume rm` ou restauration. Conteneur de diagnostic réservé également supprimé.

## Livrables et choix

| Fichier | Responsabilité |
|---|---|
| [contract.js](../../scripts/backup/contract.js) | Schémas fermés cible/évidence/externe, IDs décimaux exacts, refus d'incertitude/omission, chemins hors Git/synchronisation connue et diagnostics fixes |
| [database.js](../../scripts/backup/database.js) | Identité réelle/TLS/visibilité, état de gel via PROD.3, inventaire sous snapshot, historique préfixe Git, séquences et validation TOC |
| [clients.js](../../scripts/backup/clients.js) | Clients Docker par digest local, credentials stdin, sorties sensibles absorbées, codes/warnings bloquants, inspection sans réseau |
| [secure-files.js](../../scripts/backup/secure-files.js) | ACL, AES-256-GCM streaming, SHA-256 ciphertext, authentification avant lecture native |
| [cli.js](../../scripts/backup/cli.js) | Plan hors connexion, deux autorisations distinctes, capture/manifest/source Git, dossier partiel, verify hors connexion |
| [secrets.ps1](../../scripts/backup/secrets.ps1) | Import masqué de clé existante au coffre dans DPAPI, password SecureString, variables de travail nettoyées, clé hors backup/Git |
| [Modèles](../../scripts/backup/examples/) | target/evidence/external à compléter hors Git ; placeholders et préconditions fausses refusés |
| [operator.test.js](../../scripts/backup/operator.test.js) | Cibles/arguments, consentements, bornes exactes, omissions, chiffrement, TOC et confidentialité |
| [local.integration.js](../../scripts/backup/local.integration.js) | PostgreSQL jetable, 50 migrations, données synthétiques, archive réelle et erreurs, aucune restauration |
| [Contrôle PROD.3](../../scripts/maintenance/database.js) | Extraction `verifyFreezeContract` ; `verifyContract` conserve contrôle complet + stricte parité historique |

Autres fichiers : `.gitignore` (défense supplémentaire, pas permission de stocker un backup dans Git), package/lock (version + trois commandes npm), README et documents 05/06/08/11, nouveau document 12 et ce rapport. Aucun fichier frontend, middleware, configuration Vercel/Supabase, SQL/migration, type généré ou Edge modifié.

Choix : `pg_dump -Fc` natif complet, owners/ACL conservés ; Supabase CLI dump standard exclut notamment schémas gérés et ne contient pas données/rôles par défaut. Exportateur `pg` maintient une transaction `REPEATABLE READ READ ONLY` et `pg_export_snapshot` ; archive importe `--snapshot`, inventaires lus dans la même transaction. Rôles/attributs/appartenances/paramètres conservés en JSON pour PROD.5, **sans mots de passe PostgreSQL**. Archive Git entière de HEAD, historique réel dans dump et hashes des migrations ; pas de script de recréation de rôles réservés.

Configuration hors SQL : toutes les catégories exigées ; chaque référence de configuration doit avoir un relevé non vide `records`, conservé chiffré. Existence des références au coffre et exactitude/exhaustivité des relevés restent des vérifications manuelles. Une référence seule ne remplace pas le relevé de réglages ; les valeurs de secrets restent séparées.

### Garanties et limites

- **MVCC PostgreSQL partagé** : tables/données Auth et MY./historique/métadonnées transactionnelles à la même borne. UPDATE Auth synthétique après export du snapshot : état ancien dans dump, état nouveau dans source, sans mélange entre exports. Snapshot perdu entraîne vraie erreur `pg_dump` et refus.
- **Séquences hors MVCC** : comparaison exacte des valeurs persistantes avant/après, cycles/incréments non positifs refusés. Une avance réelle bloque le backup ; caches internes non récupérés. Absence de `setval`/DDL privilégié changeant puis rétablissant une valeur dépend de l'exclusion opérateur, explicitement exigée.
- **Rôles/DDL/configuration** : coordination durable obligatoire ; échantillon sans transaction insuffisant. Aucun arrêt/kill ou modification de paramètres automatisé.
- **Externe** : aucune transaction distribuée, borne/inventaire opérateur séparés. Storage/Vault non vides, données d'extension non exportables ou foreign tables bloquent ; aucune copie d'objet Storage prétendue.
- **Auth/MFA** : tables et secrets chiffrés présents ne prouvent pas portabilité. Clés/signatures/config GoTrue à conserver/réutiliser selon possibilités réelles. Pas de conservation garantie des sessions/tokens, effets emails/révocations ou navigateur ; réauthentification et éventuellement réinscription MFA à éprouver.
- **Source/schéma** : historique doit être préfixe exact noms/versions des migrations source et contrat PROD.2 exact ; pas de certification des octets historiques de toutes les migrations ni de parité générale du schéma. Schéma réel/DDL et statements historiques conservés pour PROD.5.

## Validations

| Commande / preuve | Résultat et portée |
|---|---|
| `npm.cmd run backup:test` | **6 tests réussis** ; validations fermées et exactes, refus cibles implicites/distantes incorrectes, consentements distincts, références manquantes, omissions Auth/séquences, crypto/troncature/tampering, diagnostics sans secret |
| `npm.cmd run backup:test:isolated` | **15 tests réussis** : six tests unitaires réutilisés, huit groupes d'intégration, groupe parent ; export natif réel, zéro restauration |
| `npm.cmd run maintenance:test` | **5 tests réussis**, contrat PROD.3 et `backup_authorized=false` conservés |
| Précontrôle PROD.3 personnel avant/après | Cible Local, 50 migrations, 23 gardes/15 fonctions, permissions vérifiées, gel false/revision 120 ; aucune écriture |
| `npm.cmd test -- --maxWorkers=2` | **79 fichiers / 2 482 tests réussis**, 6 fichiers / 10 tests DB opt-in ignorés ; pas exécutés par cette commande |
| `npm.cmd run lint` | Réussi, zéro warning |
| `npm.cmd run build` | Typecheck et build réussis, 396 modules ; warning préexistant chunk >500 kB |
| PowerShell | Parser sans erreur ; **vraie copie DPAPI et wrapper Run/verify** exécutés sur Windows sans password DB/connexion ; key absente de sortie |
| JSON/version/diff/liens | Trois versions 0.8.27, modèles JSON lisibles, `git diff --check`, liens locaux contrôlés |

Jeu représentatif : 50 migrations réellement appliquées à un cluster neuf depuis les sources, tables Auth initiales de l'image et dépendances identités/MFA/sessions synthétiques ; fixtures Phase 8 existantes réutilisées. Catalogue avec BIGINT `9007199254740993`, séquence `9007199254740999`, UUID fixes, collections/items/exemplaires/partages/masques, intentions et reçus à BIGINT exact, annonces/read/processed, préférences. Présence des rôles/attributs, appartenances, default ACL, RLS, policies, owners/grants, contraintes/index, Auth triggers et historique vérifiée. Archive rendue **en mémoire seulement** ; toutes les sections lues par `pg_restore --file=/dev/null`, réseau désactivé, jamais `-d`.

Erreurs réellement exercées : mauvais system_id/password, gel ouvert et révision périmée, snapshot terminé avant `pg_dump`, avance concurrente de séquence, bucket Storage, fichier manquant, tronqué ou modifié, checksum incorrect, mauvaise clé, marker partiel, manifeste absent et configuration/référence absente. Les refus gardent le gel synthétique actif quand il était actif ; les scénarios gel ouvert n'en changent pas l'état. Diagnostics publics sans password/URL/token/contenu Auth. Aucune réouverture de test implicite.

Passages intermédiaires ont corrigé le démarrage du cluster jetable (readiness TCP après serveur temporaire d'init), les dépendances Auth/Storage représentatives, une assertion de checksum avant authentification, l'injection d'une vraie erreur d'export par snapshot perdu, la publication synthétique via SQL opérateur et la lecture DPAPI avec newline. Répétition finale réussie après corrections. Ce sont des défauts de test/lecture corrigés, pas des échecs Cloud ni des opérations sur le volume personnel.

Suites SQL/REST/Auth/Edge exhaustives PROD.2 et répétition bascule PROD.3 personnelle non relancées : mécanismes SQL inchangés, aucune activation du gel personnel nécessaire. Aucun contrôle TLS Cloud, dump avec droits managés Cloud actuels, Storage externe ou login MFA réel effectué.

## Prochaine intervention et PROD.5

Commandes opérateur prévues et complètes dans [procédure Windows](../12-SUPABASE-BACKUP.md#windows--powershell-et-stockage) :

```powershell
npm.cmd run backup -- --command plan --environment cloud --project <ref-examinee> --config <target-hors-Git>
# Future capture seulement après autorisation distincte et toutes les préconditions :
# secrets.ps1 Run + capture, --authorize-cloud ET --authorize-sensitive-export,
# target/evidence/external, dossier neuf hors Git, clé DPAPI séparée.
# Puis secrets.ps1 Run + verify, aucune connexion DB.
```

Avant première capture Cloud : clients compatibles/corrigés et digest examiné (documentation annonce PG17.11, image de test17.6 insuffisante si serveur17.11), CA/hostname/TLS verify-full, identité exacte et privilèges complets/snapshot exportable, migrations PROD.2 Cloud installées dans opération autorisée, maintenance/commit/drainage réellement prouvés, writers privilégiés/DDL/config durablement exclus, Auth/clés/coffre et relevés conservés, Storage/Vault usage vérifié, source Git propre. Autorisations explicites jamais déduites de PROD.3 ou des tests Local.

PROD.5 : restauration isolée et portable, rôles réservés/custom et droits Cloud, versions d'extensions/managed schemas/GoTrue, ordre DDL/data/contraintes/triggers/ACL, séquences exactes, parité migration/source/schéma, Auth/identités/MFA/secrets/SMTP/Edge, reçus/notifications et compatibilité applicative, réauthentification, perte post-borne et durée/reprise. **Intégrité prouvée ici ne vaut pas restaurabilité.** Toute limite non résolue maintient l'interdiction de publication et la fermeture lors d'une opération future.

Sources publiques consultées avec Context7 : Supabase CLI/dump/Free/backups/Auth/chiffrement ; PostgreSQL17 dump/restore/psql/snapshot/extensions/TLS ; node-postgres SSL. Changelog Supabase actuel et aides des outils installés consultés ; annonces TLS HTTP et upgrade17.11 ne prouvent aucune version/configuration Cloud MY. [Liens de référence](../12-SUPABASE-BACKUP.md). Aucun projet distant inspecté.
