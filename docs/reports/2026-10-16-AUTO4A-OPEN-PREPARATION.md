# AUTO.4A — Fondations de préparation de réouverture

Livraison d'outillage sur `dev`, base inspectée `0840cbe` (`AUTO.3`), worktree initial propre. Version applicative **0.8.33 conservée**, selon AUTO.1–3. Aucun commit/push effectué. Aucun changement UI, SQL, migration ou dépendance.

## Livré

- `prepareOpen` retrouve `current.json` et la session AUTO.3 ; dossier/ACL, état réellement terminé, archive et preuves revérifiés. Aucun second registre ou nouvelle capture.
- Vérification d'archive partagée avec AUTO.3 : appel PROD.4 indépendant, métadonnées authentifiées et références comparées ; hashes de tous les fichiers chiffrés relus avant résultat final.
- Lectures GitHub de `main` et PR mergée `dev` → `main`, puis graphe Git et arbres vérifiés localement. SHA de merge distinct accepté ; succession de merges classiques sans backmerge artificiel également acceptée. Nouveau contenu propre à `main`, mauvaise source ou arbre final inattendu refusés.
- API AUTO.1 réutilisée pour connexion TLS/identité, contrat SQL et gel ; transaction de lecture seule et migrations `version,name` comparées au commit livré. Pas de comparaison avec les éventuelles migrations supplémentaires du worktree `dev`.
- API AUTO.2 étendue d'une lecture de build/alias : même projet/équipe, Protection All Deployments, domaine `my.collectrealm.com`, cible Production, commit et assignation au domaine contrôlés ; `READY` seul insuffisant.
- Changelog committé de la version : contrat PROD.6, catégorie, audience et expiration vérifiés hors connexion ; fichier/clé/hash normalisé et hash des octets conservés dans le binding de livraison.
- Preuves opérateur fermées et contemporaines pour logs Supabase, promotion manuelle sans rebuild, version réellement servie et contrôles authentifiés, couverture/compatibilité/récupération/coordination. Chaque déclaration porte session, exécution, checkpoint et référence propres ; nouvelle exécution exige nouvelle déclaration.
- Résultats `ready`, `blocked`, `unknown`, toujours sans autorisation de publication/réouverture. Même verrou AUTO.3, écritures locales atomiques, empreintes du pointeur/état/relevés et contrôle d'identité des dossiers ; interruption garde marqueur et état inconnu. Binding exact conservé en reprise.

## Interfaces réutilisables

`prepareOpen`, `operatorEvidenceSchema`, `openPreparationAPI`, `readPublicationDatabase`, `inspectRelease`, `prepareChangelog`, `archiveVerifier`/`verifyArchiveBinding`/`archiveFingerprint`, `guardedSession` et `createVercelMaintenance(...).publication`. Aucun point d'entrée opérateur `prod:open` ; seul script de tests `prod:prepare:test` ajouté. Le futur appelant devra acquérir les secrets via les canaux protégés existants, les retirer avant tout enfant Git, autoriser les connexions et disposer l'API en `finally`.

Fichiers ajoutés : `scripts/production/archive.js`, `open-api.js`, `open-preparation.js`, `open-preparation.test.js`, `release.js` et le présent rapport. Fichiers adaptés : `scripts/production/session.js`, `backup.js`, `cli.js`, `scripts/backup/secure-files.js`, `scripts/maintenance/vercel.js`, `package.json`, `README.md`, `docs/08-ROADMAP.md`, `10-NOTIFICATION-PUBLICATION.md`, `11-PUBLICATION-PRODUCTION.md`, `13-PRODUCTION-AUTOMATION.md`.

## Validation

Tests Node pertinents : sessions et secrets synthétiques, fichiers temporaires avec ACL réelles isolées, dépôt Git jetable, HTTP/PostgreSQL simulés. Régressions AUTO.3, AUTO.2, maintenance et contrats backup incluses. Tests PROD.6 limités aux contrats et mocks Cloud ; aucun banc Local/Cloud réel lancé. TypeScript, lint et `git diff --check` exécutés.

Résultats : **37/37 AUTO.4A**, **103/103 régressions Node** et **111/111 contrats/mocks PROD.6**, sans skip. Suite groupée Node initiale : 138/138, puis suite AUTO.4A finale enrichie de deux cas supplémentaires : 37/37. TypeScript, lint et `git diff --check` réussis ; package, lockfile et racine du lockfile restent `0.8.33`, script `prod:open` absent.

Commandes :

```powershell
node --test scripts/production/backup.test.js scripts/production/open-preparation.test.js scripts/maintenance/vercel.test.js scripts/maintenance/operator.test.js scripts/backup/operator.test.js scripts/backup/native.test.js
npm.cmd test -- --project notifications scripts/notifications/contract.test.ts scripts/notifications/cloud.test.ts --maxWorkers=1
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Couverture : session complète/absente/inachevée/corrompue/ambiguë, hashes et source d'archive contradictoires, SHA de merge distinct, livraisons successives sans backmerge, mauvais commit/version, build non assigné, migration absente/supplémentaire, mauvaise identité, protections prématurément ouvertes, changelog manquant/mauvaise catégorie/version/audience/expiration/hash, historique refusé, interruption/reprise, appel concurrent et édition extérieure, ACL élargies, verrou modifié, secrets supprimés des résultats, GET seuls et SQL sans mutation.

## Limites conservées

**Aucune connexion GitHub/Vercel/Supabase réelle pour cette livraison, aucune notification, capture, restauration ou levée de protection.** Les commits créés par les tests appartiennent uniquement au dépôt temporaire synthétique, pas au dépôt MY.

Les lectures du plan de contrôle ne prouvent pas la version du frontend réellement servi ; le 302 anonyme vers SSO ne remplace jamais les contrôles MY. authentifiés. Sans moyen protégé autorisé de les réaliser sous maintenance, préparation bloquée. Aucun accès de contournement créé. Logs Supabase et compatibilité backend restent des déclarations opérateur explicites : l'historique des migrations ne prouve pas un schéma intégral ou la réussite de toutes les opérations distantes.

Les objets Git doivent déjà exister localement ; API GitHub épinglée à `2022-11-28`, droits de lecture nécessaires pour dépôt privé. Le changelog de la version doit être préparé au chemin conventionnel avant la sauvegarde : l'ancien fichier `0.8.29.json` ne peut pas prouver une livraison `0.8.33`. Aucun nouveau changelog produit inventé pour cette livraison d'outillage.

Les hashes et le verrou protègent la cohérence entre clients coopérants et détectent les changements observables ; ils ne signent pas les preuves contre un administrateur hostile contrôlant le poste et la clé. `ready` n'est valable qu'aux observations enregistrées. AUTO.4B devra conserver le même fichier/clé/hash, obtenir son consentement et gérer publication/reçu/relecture ; AUTO.4C devra contrôler puis lever les protections dans l'ordre documenté. **Ces deux phases ne sont pas commencées.**
