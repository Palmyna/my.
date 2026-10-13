# PROD.3 — Coordination opérationnelle de la maintenance MY.

Date : **13 octobre 2026**. Version livrée : **`0.8.26`**.

## Résultat et portée

**Fermeture et réouverture coordonnées reproductibles sur Local.** CLI privé opérateur, preuves de cible/identité/contrat, observation des transactions et de la barrière `771403`, bascules liées à une révision examinée, commit puis relecture indépendante, attestation backend conservatrice, contrôles HTTP et reprise explicite. Les mécanismes PROD.1/PROD.2 sont réutilisés sans réimplémentation.

**Aucune opération Cloud.** Aucun secret Cloud ajouté, changement de Global Config, migration distante, backup/restauration, réglage GitHub/Vercel, notification, déploiement ou promotion. Aucun commit/push. Le workflow Production reste non opérationnel tant que ses installations, contrôles hébergés, snapshot/restauration et répétition autorisée ne sont pas acquis. Chaque résultat conserve `backup_authorized=false` : une réussite Local ne certifie jamais une sauvegarde Production.

## État réel initial et final

| Élément | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `603460596a8b5ab434dc7519402bd9bb2c493b75` | Identique |
| Git | Propre | 8 fichiers suivis modifiés et 6 nouveaux fichiers ; aucun changement étranger |
| Package, lock, racine du lock | `0.8.25` | `0.8.26` |
| Migrations Local | 50, dernière `20261013135415` | Identiques, aucune migration ajoutée/appliquée |
| PostgreSQL / CLI | `17.6` / `2.120.0` | Identiques |
| Gel Local | Ouvert, révision exacte `105` | Ouvert après décision explicite, révision exacte `120` |

Lecture préalable : `AGENTS.md`, documentation 05/06/08/10/11, rapports PROD.1/PROD.2, middleware/page/headers, deux migrations PROD.2, test SQL 039, intégration PROD.2, connexion pipeline, publisher et fixtures Phase 8. Vérification directe Local de l'identité, des objets et des 50 migrations ; aucun état Cloud inféré de `migration list --local`.

Les validations **Preview fournies par le propriétaire** couvrent activation sans rebuild, page MY., HTTP 503, headers anti-cache, refus d'une route directe et retour HTTP 200 sans rebuild. Elles sont attribuées au propriétaire et non revérifiées ici. Preview sans Supabase n'est pas une cible de test backend. Ni ces résultats ni le packaging Local historique ne démontrent Production ou propagation mondiale.

## Outillage livré

| Fichier | Responsabilité |
|---|---|
| [database.js](../../scripts/maintenance/database.js) | Connexion Local/identité/visibilité, lecture exacte du singleton, signatures/corps/owners/search_path, gardes/ACL/migrations/publisher, observation assainie et probes ordinaires |
| [cli.js](../../scripts/maintenance/cli.js) | Commandes privées, cible/révision attendues, consentement de réouverture, transaction dédiée, commit/relecture indépendante, sorties NDJSON et diagnostics fixes |
| [http-check.js](../../scripts/maintenance/http-check.js) | Génération hors connexion de contrôles GET/HEAD pour session Vercel normale ; codes/headers et limites de preuve ; aucune URL/clé/cookie/HTML/CSP nonce journalisés |
| [operator.test.js](../../scripts/maintenance/operator.test.js) | Arguments, décimales exactes, refus des cibles/identités dangereuses, diagnostics et HTTP/authentification/erreurs |
| [local.integration.js](../../scripts/maintenance/local.integration.js) | Répétition isolée, concurrence réelle, interruptions/timeouts, fixtures Phase 8 et empreintes données/séquences/sécurité |

Commandes npm :

```powershell
npm.cmd run maintenance:db -- --command preflight --environment local --project my-local
npm.cmd run maintenance:db -- --command observe --environment local --project my-local
npm.cmd run maintenance:http -- --print-browser --expect closed
npm.cmd run maintenance:http -- --print-browser --expect open
npm.cmd run maintenance:test
npm.cmd run maintenance:test:local
```

Les modes DB `close`, `verify-closed`, `reopen`, `verify-open` exigent aussi `--expect-system-id` et `--expect-revision`, chaînes décimales issues du précontrôle examiné. `reopen` exige `--authorize-reopen`. [Commandes complètes et dossier opérateur](../11-PUBLICATION-PRODUCTION.md#prod3--coordination-opérateur). CLI refuse Cloud, identités API/service_role/publisher, paramètres URL et fragments avant connexion. `service_role` apparaît seulement comme rôle d'un **probe d'écriture refusée** sous `session_user=authenticator`, jamais identité opérateur ni clé API utilisée par cet outillage.

Version incrémentée avec `npm.cmd version 0.8.26 --no-git-tag-version`, scripts ajoutés sans dépendance. Documentation modifiée : README, architecture, DB, roadmap macro, notification et référence Production. Aucun changement `src`, SQL/migration, types générés, handler Edge, middleware/configuration Vercel/Supabase ou droits publisher.

## Contrats de fermeture et de refus

Précontrôle : connexion réellement Local, base/ports/version/identifiant système, identité PostgreSQL autorisée et visibilité complète ; version/commit Git ; historique identique aux 50 fichiers ; 23 gardes actives ; signatures et corps des 15 fonctions définies par PROD.2 ; singleton RLS sans accès API ; droits minimaux publisher. Les identifiants BIGINT/révisions restent exacts, y compris au-delà de `Number.MAX_SAFE_INTEGER`.

Fermeture : frontend en premier, puis bascule SQL sous exclusif transactionnel `771403`, comparaison de la révision examinée, setter, commit. Sorties successives : demande, enregistrement **provisoire**, commit reçu, état exact relu sur connexion fraîche. Les writers ordinaires admis détiennent leurs locks jusqu'au commit/rollback ; leur fin retarde réellement la borne du gel. Un retour SQL avant commit ne la remplace pas.

Attestation : contrat vérifié, état/révision liés à la cible, verrou partagé pendant observations/probes contre une bascule concurrente, refus des locks d'admission restants et transactions préparées, lecture autorisée et refus PT503 exact sous deux rôles ordinaires. `ordinary_writes=closed_and_drained` concerne le **backend Local à la borne observée**. `global_closure=not_attested` et `backup_authorized=false` restent explicites.

Observation : PID, identité SQL connue/catégorie, état et début transactionnels, waits/blockers et locks filtrés à la **base courante**. Aucun SQL, adresse client, application_name libre, credential ou donnée personnelle. Opérateurs, import/migration et publisher échappent au drainage ordinaire ; Auth interne reste actif. Leur absence dans un échantillon ne garantit pas l'absence d'un prochain writer.

Refus : mauvaise cible/révision, état inconnu, fonction/garde/ACL incorrecte, permission ou visibilité insuffisante, blocage, timeout, deadlock, connexion ou interruption. Codes de sortie : 0 contrôle nommé réussi, 1 non vérifié, 130 interruption gérée. Une fermeture potentiellement committée après réponse perdue nécessite relecture fraîche ; aucune relance automatique ni annonce de succès. Le CLI ne tue jamais un autre backend.

Réouverture : décision explicite après préconditions, consentement lié à la révision actuelle, backend d'abord, commit/relecture, probe ouvert et vraie mutation synthétique relue ; frontend ensuite, HTTP 200. Succès, échec, timeout, fermeture du terminal ou interruption ne lèvent jamais une protection automatiquement. Le cleanup des tests supprime uniquement les fixtures exactes et ferme leurs propres connexions ; il ne bascule jamais le gel.

## Validation finale

| Vérification | Résultat et limite |
|---|---|
| `npm.cmd run maintenance:test` | **5 tests réussis** ; refus des arguments/cibles/opérateurs, décimales exactes, diagnostics sans secrets, réponses HTTP incompatibles, exécution du code navigateur généré avec transport synthétique |
| `npm.cmd run maintenance:test:local` | **10 groupes PASS**, connexions réelles et HTTP Local ; état ouvert après réouverture explicite ; empreintes données/Auth/séquences/sécurité identiques |
| `npm.cmd run db:test -- supabase/tests/database/039_business_write_freeze.test.sql` | **1 fichier, 83 assertions réussies**, rollback transactionnel, aucune consommation de séquence |
| `npm.cmd test -- --maxWorkers=2` | **79 fichiers / 2 482 tests réussis**, 6 fichiers / 10 tests DB opt-in ignorés ; non exécutés par cette commande |
| `npm.cmd run db:lint` | **0 erreur/warning** public/private |
| `npm.cmd run lint` ; vérification ESLint finale des scripts maintenance | Réussies, zéro warning |
| `npm.cmd run build` | Typecheck et build réussis, 396 modules ; avertissement préexistant chunk >500 kB |
| JSON package/lock, Git et liens documentaires | Trois versions `0.8.26`, `git diff --check` réussi, aucun lien local manquant ; branche/HEAD inchangés |

Scénarios exercés dans l'intégration :

1. État initial ouvert, identité exacte, 50 migrations et protections privées.
2. Identifiant système inattendu, URL distante, mauvaises identités opérateur et SQL sans privilèges refusés.
3. Frontend HTTP fermé en premier ; vraie transaction ordinaire admise en cours, ShareLock accordé et ExclusiveLock en attente avec blockers ; état reste ouvert jusqu'au commit du writer, puis commit du gel et relecture indépendante.
4. Refus statements authenticated/service_role et RPC Phase 8 ; lectures du contenu et du reçu historique maintenues avec payload exact ; sortie normale d'un vrai CLI de fermeture laisse le gel actif ; aucune attestation Production.
5. Singleton absent, table non couverte et permission de contrôle élargie refusés, **injections uniquement dans transactions rollbackées**, aucune garde désactivée.
6. Setter retournant un état provisoire dans une transaction différente : connexion indépendante retrouve encore le précédent état ; vérification refusée pendant lock exclusif.
7. Lock résiduel, timeout de bascule, arrêt d'un sous-processus en attente et révision ancienne : aucun état rouvert ni révision changée.
8. Mauvais mot de passe Local : erreur assainie, gel conservé, aucun secret affiché.
9. GET/HEAD réels sur serveur HTTP isolé servant la page/headers PROD.1 : HTTP reste fermé pendant les échecs ; résultat incompatible refusé. **Ce serveur n'est ni Vercel, ni Global Config, ni preuve CDN.**
10. Réouverture explicitement autorisée : relecture indépendante, mutation réelle de préférence persistée/relue, reprise RPC et rejeu du même UUID Phase 8 retrouvant exactement son reçu historique, puis ouverture HTTP vérifiée.

Les tests ordinaires SQL utilisent les fixtures AAL2 synthétiques réservées ; aucune preuve MFA navigateur réelle nouvelle. Le probe opérateur, lui, n'invente pas de JWT et ne touche aucune ligne. Les tests SQL/REST/Auth/Edge/publisher exhaustifs de PROD.2 restent les preuves historiques de ces mécanismes inchangés ; leur intégration complète n'a pas été relancée ici. Les nouveaux contrôles ne se font jamais via une Preview sans Supabase.

## Conservation Local

Fixtures existantes Phase 8, UUID/plages catalogue réservés et mutex `830011` réutilisés. Aucun reset, réimport, reconstitution d'une ligne personnelle, secret publisher provisionné, suppression Auth personnelle ou reset de séquence. Comparaison exacte des **22 tables métier**, `auth.users`, six compteurs de séquences, ACL de tables/colonnes/fonctions, rôles, politiques, fonctions et triggers avant/après chaque répétition. Snapshot du singleton volontairement distinct : ses révisions/horodatages sont la trace des seules bascules opérateur de test.

Empreintes de contrôle dans `.cache/prod3/before.json` et `after.json`, hors sources suivies ; aucun contenu Auth ou secret. Les audits hashent les données en base, sans les exporter. Les gardes restent actives et aucune permission temporaire n'est visible hors transaction d'injection. Les passages finaux réussis prouvent conservation des données, comptes, séquences et sécurité ; le gel final reste désactivé.

Un passage intermédiaire a réellement échoué sur une assertion de forme du reçu ajoutée au test : l'API renvoie directement le payload historique. Le cleanup a laissé le gel fermé à révision `116` et les empreintes identiques. Assertion corrigée selon le contrat existant ; précontrôle puis commande explicite `reopen --authorize-reopen` ont produit la révision `117`, avant la répétition finale réussie jusqu'à `120`. Ce cas confirme également l'absence de réouverture implicite après un échec réel du test.

## Conditions indispensables encore Cloud

- Installation autorisée des deux migrations PROD.2 du même commit, parité et identité réelles des services Cloud, SQL privé/TLS vérifié/visibilité complète ; le CLI livré refuse toute connexion distante et ne doit pas être contourné.
- Maintenance Production et chaque domaine/alias/déploiement/rollback compatible éprouvés avec session Vercel normale. Ne pas désactiver All Deployments, CSP, gardes, RLS ou MFA. `vercel curl` automatise un bypass de Deployment Protection : outil non retenu pour cette procédure.
- Coordonnateurs de chaque writer privilégié : imports catalogue, migrations, publisher, SQL administratif et autres jobs recensés puis arrêtés/exclus avant le backup, sans kill automatique. Auth interne et ses écritures restent à traiter par le snapshot cohérent du futur bloc sauvegarde ; aucune promesse d'arrêt global.
- Sauvegarde/périmètre/snapshot cohérent/restauration éprouvés ; ordre backup avant PR/migrations. Aucun backup ici. Une simple absence de transactions n'est pas un contrat d'exclusion durable.
- Publisher Cloud sécurisé et lecture autoritative éligible ; mêmes fichier/clé/hash après réponse incertaine, aucune publication pendant backup. Aucun élargissement de droits.
- Moyen protégé et validé de contrôler le frontend Production réellement servi pendant fermeture, compatibilité applicative et préconditions E. `Ready`, dashboard ou parité de SHA ne remplacent pas ce contrôle. Aucun bypass applicatif improvisé dans PROD.3.
- Répétition réelle et autorisée de tout le workflow. Un test HTTP ponctuel ne démontre jamais la propagation mondiale ; en conserver cibles, lieux, bornes et limites.

Auth : les suppressions physiques sont interdites pendant gel ; les UPDATE/sessions/MFA et éventuelles opérations administratives soft restent hors gel métier. L'Edge peut révoquer les sessions avant de retourner 503 `deletion_failed` ; ces sessions restent révoquées. Les refus Auth natifs peuvent être HTTP 500 génériques, distincts des mutations REST 503. Phase 8 : UUID/token/intention/reçu exacts restent le contrat ; résultat réseau incertain ou reçu absent ne justifie aucune nouvelle opération aveugle.

**Toute condition absente, inconnue ou non vérifiable interdit de déclarer la fermeture sûre pour backup ou d'autoriser la réouverture Production.** La [référence opérateur](../11-PUBLICATION-PRODUCTION.md#prod3--coordination-opérateur) conserve ordre, commandes, preuves et décisions.

## Sources actuelles consultées

Context7 : PostgreSQL 17 (advisory locks transactionnels, représentation bigint dans pg_locks et portée par base), node-postgres (Client/errors/transactions), Supabase CLI (status/migrations/tests Local), Vercel (Authentication et comportement de `vercel curl`). Aide de la CLI installée consultée avant commandes. Changelog Supabase public consulté : aucun changement de mécanisme nécessaire pour ce chantier Local ; aucune mise à niveau PostgreSQL imposée.

- [PostgreSQL : locks](https://www.postgresql.org/docs/17/explicit-locking.html), [pg_locks](https://www.postgresql.org/docs/17/view-pg-locks.html).
- [node-postgres : transactions](https://node-postgres.com/features/transactions), [Client](https://node-postgres.com/apis/client).
- [CLI Supabase](https://supabase.com/docs/reference/cli/introduction), [changelog](https://supabase.com/changelog).
- [Vercel curl](https://vercel.com/docs/cli/curl), [Global Config](https://vercel.com/docs/global-config), [limites](https://vercel.com/docs/global-config/global-config-limits).

Ces sources décrivent les plateformes ; elles ne constituent aucune observation des projets Cloud MY.
