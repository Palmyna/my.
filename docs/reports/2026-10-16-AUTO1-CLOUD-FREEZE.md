# AUTO.1 — Pilotage sécurisé du gel Supabase Cloud

Date : **16 octobre 2026**. Branche `dev`, HEAD `07a7e5f99b413dbc06a8ec10591333df63c29639` inchangé. Worktree initial propre. Version package/lock/racine conservée à **`0.8.33`** ; aucune dépendance ajoutée, aucun commit/push.

## Livraison et frontières

Pilotage Cloud ajouté au moteur opérateur PROD.3 existant : `preflight`, `observe`, `close`, `verify-closed`, `reopen`, `verify-open`. Projet explicitement limité à **`xvtiwhxvtfxvvokquttu`**. Cible JSON fermée et sans credentials ; secret en mémoire via saisie Windows protégée ; CA épinglée, hostname, protocole et socket TLS client vérifiés ; identité PostgreSQL réelle et `system_id` contrôlés à chaque connexion. Aucune connexion implicite Local depuis Cloud.

Connexion Cloud autorisée par `--authorize-cloud-connect`, fermeture par `--authorize-close`, réouverture par **`--authorize-reopen` distinct**. Même transaction dédiée, verrou exclusif `771403`, comparaison de révision sous verrou, setter PROD.2, commit puis nouvelle connexion indépendante. Le setter n'est plus appelé si l'état demandé est déjà satisfait ; révision et horodatage restent intacts, avec contrôle de concurrence et relecture maintenus. Cette idempotence s'applique au moteur commun Local/Cloud. BIGINT et identifiant système restent des chaînes exactes.

`verify-closed` Cloud contrôle contrat, état/révision et absence de locks d'admission/transactions préparées à la borne observée, sous verrou partagé contre les bascules concurrentes. L'exception permanente `super_admin` est conservée et sa définition reste vérifiée dans le contrat. Aucun `SET ROLE` depuis `postgres` n'est présenté comme un probe `authenticator` : Cloud indique explicitement absence de probe API et d'exclusion durable des writers privilégiés. Les probes Local authentifiés sont préservés.

Sorties NDJSON assainies : demande, provisoire, commit reçu, résultat relu ; erreurs/interruption avec état inconnu. Tous les résultats gardent `backup_authorized=false` et `global_closure=not_attested`. Réponse perdue, timeout, interruption ou relecture différente : nouvelle lecture/observation indépendante, aucune réouverture ni relance automatique. Aucune commande ne termine les autres backends.

**Aucune opération Supabase Cloud, modification de gel Production ou accès aux données personnelles Local.** Aucun SQL/migration, ACL/RLS, type généré, service frontend/Edge, configuration Supabase/Vercel ou contrat de backup modifié. Aucun orchestrateur de sauvegarde ou de réouverture livré. Les checkpoints Cloud historiques restent des déclarations du propriétaire et ne sont pas rafraîchis ici.

## Fichiers concernés

| Fichier | Modification |
|---|---|
| `scripts/maintenance/cli.js` | Sélection Cloud, consentements distincts, même moteur transactionnel, idempotence et portée des résultats |
| `scripts/maintenance/database.js` | Extraction de la lecture/vérification d'identité commune ; contrôles et probes Local conservés |
| `scripts/maintenance/cloud.js` | Cible stricte, configuration explicite sans URL/fallback, secret consommé, identité/TLS de chaque connexion |
| `scripts/maintenance/secrets.ps1` | Saisie masquée, environnement enfant temporaire, nettoyage BSTR/variable |
| `scripts/maintenance/examples/target.json` | Exemple sans secret et volontairement inexécutable avant configuration réelle |
| `scripts/maintenance/operator.test.js` | Autorisations, cible et environnement TLS/libpq refusés |
| `scripts/maintenance/cloud.integration.js` | Répétition réelle PostgreSQL/TLS/CLI, concurrence, interruptions et reprise ; Local sur même cluster jetable |
| `scripts/postgres-tls.ts` | Validation CA/TLS mutualisée depuis PROD.6, sans moteur TLS parallèle |
| `scripts/notifications/database.ts` | Réutilisation du transport partagé ; mêmes contrôles et diagnostics publisher |
| `package.json` | Commande `maintenance:test:isolated` |
| `tsconfig.node.json` | Inclusion du helper TLS partagé dans le projet Node |
| `docs/11-PUBLICATION-PRODUCTION.md` | Procédure AUTO.1, commandes Windows, prérequis, portée et reprise |
| `README.md`, `docs/05-ARCHITECTURE.md`, `docs/06-DATABASE.md`, `docs/08-ROADMAP.md` | État actuel, propriété des mécanismes et limites cohérentes |
| Ce rapport | Périmètre et preuves AUTO.1 |

## Validations

| Commande / preuve | Résultat |
|---|---|
| `npm.cmd run maintenance:test` | **7 tests réussis** |
| `npm.cmd run maintenance:test:isolated` | **11 scénarios et test parent réussis** : 12 résultats Node, aucun ignoré |
| `npm.cmd test -- scripts/notifications/cloud.test.ts scripts/notifications/contract.test.ts` | **2 fichiers, 111 tests réussis** |
| `npm.cmd run typecheck` | Réussi |
| `npm.cmd run lint` | Réussi, zéro warning |
| `git diff --check`, versions et liens documentaires locaux | Réussis |

Répétition isolée : image PostgreSQL Supabase `17.6.1.166` déjà installée, identité d'image locale `sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86`, conteneur `network=none`, aucun port publié, aucun volume personnel. Migrations du dépôt appliquées seulement sur cette base synthétique ; identité `postgres` non-superuser et visibilité statistique configurées uniquement dans la fixture. TLS et SCRAM réellement négociés. CA et certificats créés pour les tests, secrets synthétiques temporaires hors Git. Proxy loopback et hook de routage **propres aux processus de test**, refusant tout autre endpoint avant DNS, y compris toute connexion distante réelle. Aucun routage spécial exposé par la CLI.

Scénarios exercés :

1. Précontrôle TLS, identité réelle, historique exact des 52 migrations, 17 fonctions et 24 gardes, exception permanente comprise.
2. Mauvais mot de passe, autre `system_id`, visibilité insuffisante, CA non approuvée, certificat d'un autre hostname et serveur sans TLS refusés.
3. État déjà ouvert idempotent ; consentement de réouverture inutilisable pour fermer.
4. Deux opérateurs concurrentiels avec même révision : une seule bascule réussit, l'autre reçoit `freeze_revision_changed`.
5. Vraie connexion `authenticator` sous `authenticated`, statement zéro ligne admis par la garde PROD.2 tenant ShareLock : fermeture ExclusiveLock réellement en attente ; commit seulement après fin du writer puis relecture indépendante. Aucun JWT synthétique ajouté à ce probe.
6. État déjà fermé idempotent ; anciennes révisions de fermeture/réouverture refusées même lorsque l'état pourrait sembler déjà satisfait.
7. Vérification fermée à portée explicite ; lock d'admission résiduel refusé, aucune attestation des writers privilégiés.
8. Timeout sur verrou, échec de relecture indépendante et changement de révision après commit : aucun succès final ni réouverture automatique.
9. Interruption avant commit, accusé de commit perdu et interruption après commit : état inconnu déclaré ; préflight frais et reprise idempotente sans nouvelle révision inutile.
10. Même contrat SQL utilisé via CLI Local : vraie connexion `authenticator`, refus PT503 sous `authenticated`/`service_role`, puis réouverture explicite et probes zéro ligne ouverts.
11. Wrapper Windows de saisie protégée exécuté avec mot de passe synthétique, sans secret dans les sorties.

Les révisions de la fixture démarrent à **`9007199254740997`**, au-delà de `Number.MAX_SAFE_INTEGER` ; aller-retour JSON et CAS exacts. Empreintes des tables métier/Auth et valeurs de séquences comparées avant/après, identiques ; contrat SQL/ACL revérifié à la fin. Cleanup détruit uniquement la ressource jetable identifiée par ID/nonce, sans bascule du gel. Aucune exécution de `maintenance:test:local` contre la stack personnelle, reset, reconstitution ou export personnel.

Deux premiers passages ont révélé une hypothèse incorrecte du test de visibilité : le rôle synthétique `postgres` héritait aussi de `pg_monitor`. La fixture retire temporairement les deux chemins statistiques pour tester le refus, puis les restaure. Aucun assouplissement des contrôles de production. Inclusion TypeScript explicite du helper partagé ajoutée pour le service ESLint. Les passages finaux ci-dessus intègrent ces corrections.

Pas de nouvelle campagne frontend, REST/Auth/MFA ou backup : ces moteurs ne changent pas. Les 111 tests publisher ciblés et le vrai transport TLS de la répétition couvrent la mutualisation ; aucun publisher Cloud réel utilisé. Aucune récupération Production déduite de ces validations.

## Usage et prérequis restant Cloud

Suivre les [commandes Windows AUTO.1](../11-PUBLICATION-PRODUCTION.md#auto1--pilotage-cloud-du-gel). Avant une future intervention distante autorisée :

- préparer hors Git cible exacte, `system_id` indépendamment vérifié, CA approuvée avec SHA-256 et secret opérateur dans le gestionnaire prévu ;
- choisir explicitement direct IPv6/IPv4 disponible, ou Supavisor **session** avec hostname/login exacts ; pas de fallback automatique ; le transport Supavisor réel reste non exercé ici ;
- vérifier permissions managées réelles pour identité/visibilité/contrat et parité du dépôt ; tout refus bloque, sans nouveau GRANT automatique ;
- autoriser connexion puis chaque action séparément, lire chaque résultat et relever une révision fraîche avant la suite ;
- recueillir séparément refus API ordinaires, coordination durable des writers privilégiés et Auth, maintenance HTTP et toutes les préconditions PROD.3/4/E.

Ce bloc est terminé comme livraison d'outillage isolément éprouvé. Il ne valide ni une fermeture Cloud réelle, ni PROD.7C, ni une sauvegarde ou réouverture Production.

Documentation publique consultée via Context7 : [node-postgres SSL](https://node-postgres.com/features/ssl), [transactions](https://node-postgres.com/features/transactions), [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement) et [connexions PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres). Changelog Supabase consulté : aucune adaptation du mécanisme SQL PROD.2 requise. Ces documents décrivent les fournisseurs, pas l'état du projet Cloud.
