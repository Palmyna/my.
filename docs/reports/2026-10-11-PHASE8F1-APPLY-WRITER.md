# Phase 8F.1 — Application transactionnelle PostgreSQL

Date : **11 octobre 2026**. Version **0.8.11**. Writer SQL et validations ciblées livrés **exclusivement Local**. Arrêt à 8F.1 : aucune intégration applicative TypeScript, interface de confirmation ou notification. **8F reste en cours** ; aucune clôture globale, aucun commit ni push.

## État initial et final

| Contrôle | Résultat |
|---|---|
| Branche / HEAD | `dev` / `f27b8fb345d1e229d837ea26dd67f39e1adfebb6`, inchangés |
| Git initial | Propre, aucun changement préexistant |
| Git final | 19 fichiers ajoutés/modifiés pour 8F.1, rien staged |
| Version | `0.8.10` → **`0.8.11`**, package/lock seuls champs de version changés |
| Outillage | Node `24.20.0`, npm `12.1.0`, Supabase CLI `2.120.0`, dépendances inchangées |
| Supabase Local | PostgreSQL `127.0.0.1:55322`, API `http://127.0.0.1:55321` |
| Historique Local | 42 → **43 migrations**, concordance fichiers/Local jusqu'à `20261011081317` |
| Données personnelles avant/après | **2 collections, 257 éléments, 3 exemplaires, 7 intentions, 14 reçus**, strictement identiques |
| Catalogue avant/après | **1 025 Pokémon, 18 séries, 188 extensions, 19 907 cartes sources, 31 904 variantes, 1 213 états de cible**, strictement identiques |

Les deux collections recréées volontairement par le propriétaire constituent la référence réelle. Aucune recherche/restauration des quatre anciennes collections. Snapshots complets des lignes collections/items/copies/partages/profils/journal/reçus et des six tables catalogue, comparés après retrait des fixtures ; noms, UUID, positions, rangs, origines, introductions, masquages, notes et timestamps inclus. SHA-256 de la sérialisation identique avant/après : `167f079ccaacff64e20a11c6eb5ad40a39cb8ab6ecc0d5c08602d5c43701b7b4`.

Lecture préalable : `AGENTS.md`, conception 8A.3 section 6, clôture 8E, migrations/helpers/token 8E, moteur 8B.2, invariants différés 8B.4, writers/reçus v2, création automatique, masquage 8C, contraintes réelles Local, synchronisation catalogue et helper HTTP 409 8B.8. Mémoire utilisée pour localiser ces conventions puis vérifiée dans le dépôt/Local. Skills migration, Supabase et migration Local/types appliqués ; docs CLI et erreurs PostgREST consultées via Context7, changelog Supabase consulté. Aucun changement d'outillage.

## Migration, sécurité et signature

Migration unique créée par `supabase migration new` : [20261011081317_phase8f1_apply_collection_update.sql](../../supabase/migrations/20261011081317_phase8f1_apply_collection_update.sql). Un seul BEGIN/COMMIT, aucun nouveau stockage métier, aucune réécriture de migration historique. Application avec `migration up --local`, historique revérifié avec `migration list --local`. La colonne « remote » de cette commande locale ne prouve aucun état Cloud.

```sql
public.apply_collection_update(
  p_collection_id uuid,
  p_preview_token jsonb,
  p_operation_id uuid
) returns jsonb
```

Une seule signature, aucun défaut. `VOLATILE SECURITY DEFINER`, `search_path=''`, références qualifiées. ACL réelle : `{postgres=X/postgres,authenticated=X/postgres}` ; PUBLIC, anon et service_role sans EXECUTE. Helper de conflit privé également fermé, aucun grant direct supplémentaire sur journal/reçus.

Auth/AAL2/profil, parent existant, propriétaire actuel, automatique contrat 2 et READ COMMITTED requis. Verrou partagé catalogue **771402 avant parent FOR UPDATE**, puis relecture propriétaire/profil/type/contrat après attente. Les autres writers et la sync restent inchangés.

## Token et plan autoritatifs

Exactement six clés : `contract_version`, `applied_target_version`, `target_version`, `target_hash`, `personal_revision`, `plan_hash`. Format 1 numérique ; versions positives et révision non négative, chaînes décimales canoniques dans les limites BIGINT ; hashes hexadécimaux minuscules de 64 caractères. Champs supplémentaires, absences, NULL, nombres à la place de chaînes, signes, zéros initiaux, fractions, exponentielles et dépassements rejetés.

Après contrôle du reçu, toute nouvelle opération appelle les helpers **8E inchangés**. Le lecteur revalide son contexte sous les verrous déjà détenus, appelle le canonique une fois et vérifie son hash ; `private.collection_update_plan` réutilise le moteur **8B.2 inchangé**, avec toutes les intentions vivantes chronologiques. Comparaison exacte du token recalculé : format, quatre valeurs d'état et hash du plan lié à l'UUID parent. Aucune application silencieuse d'une autre version.

| Erreur | SQL direct / HTTP |
|---|---|
| Format/paramètre invalide | `22023 / collection_operation_invalid`, HTTP 400 |
| Token valide devenu obsolète | `40001 / preview_stale`, HTTP **409** |
| Token courant sans delta utile | `23514 / collection_update_not_available`, HTTP 400 |
| UUID accepté, autre requête ou writer | `23505 / operation_id_conflict`, HTTP 409 |
| Droits/type/legacy/état incohérent | Erreurs sûres 8E conservées |
| Isolation/timeout/conflit transactionnel | `collection_structure_conflict`, helper 8B.8 |
| Erreur interne | `XX000 / collection_update_unexpected`, HTTP 500 |

`private.raise_collection_preview_stale` reprend le principe 8B.8 : erreur `PGRST` JSON structurée en transport HTTP, code métier `40001` et message `preview_stale` préservés. Cinq conflits HTTP définitivement obsolètes terminent ensemble en moins de cinq secondes, sans boucle de retry interne. Copies, notes, nom et préférences ne participent pas au token ; leurs changements préservent le plan structurel.

## Application et atomicité

Le writer matérialise `final_order` du plan, jamais un second tri ou moteur :

- Retraits automatiques et cascade de leurs intentions propres ; références UUID historiques des sujets survivants intactes.
- Nouveaux automatiques aux seuls placeholders : UUID v4 inédit, visible, introduction NULL, aucun geste artificiel.
- Conversion manuel → automatique sur le même UUID ; introduction et journal conservés, visible.
- Automatiques conservés : UUID, masque et intentions conservés ; rang canonique cible actualisé.
- Positions exactes `1…N` depuis l'ordinal complet du plan, manuels et masqués inclus.
- Parent : version cible appliquée et révision +1, puis reçu `apply` dans la même transaction. Aucune intention d'application.

Copies et notes globales ne sont jamais écrites par le writer. Cible vide applicable avec ou sans manuels, parent existant conservé ; nouvelle création automatique vide toujours refusée.

La suite compare la matérialisation au **véritable plan SQL 8E**, avec substitution des seuls placeholders par `created_items`. Elle couvre ajouts/retraits/conversion simultanés, UUID, origines/rangs/masques, chronologie, contexte R1, disparition/réintroduction R3 et rangs/positions exacts. Aucun moteur de fusion dans les tests.

Deux injections pgTAP : pendant conversion après retrait/insertion partiels, et à l'insertion finale du reçu après mise à jour du parent. Snapshots complets identiques après chaque échec. Contraintes différées vérifiées sur le résultat final avec `SET CONSTRAINTS ALL IMMEDIATE`, puis **au vrai COMMIT** dans la preuve multi-session : application valide engagée avec conversion ; application retournée puis introduction convertie volontairement invalidée, COMMIT refusé `collection_initial_placement_invalid`, transaction entière restaurée. Aucune désactivation/modification des contraintes.

## Résultat et idempotence

Retour exact : `{operation_id,outcome:'applied',personal_revision:string,applied_target_version:string,created_items:[{variant_id:string,collection_item_id:UUID}]}`. BIGINT exacts ; mapping uniquement pour les nouveaux automatiques, dans l'ordre des rangs cibles. Test de révision `9007199254740997` → `9007199254740998`, version cible `9007199254740999` et variante `9007199254740997`, SQL et HTTP.

Empreinte SHA-256 du texte JSONB PostgreSQL UTF-8 de `['apply_collection_update',collection_uuid,token_normalisé]`. Le reçu est contrôlé **avant** contexte/catalogue/items/journal ; ordre des clés du token sans effet. Même UUID/requête → résultat initial inchangé ; autre token/type d'opération → conflit avant fraîcheur. Collisions dans les deux directions avec move/add/remove/hide vérifiées.

Retry après autre application, retrait manuel, changement ou absence d'état catalogue accepté. Le test supprime aussi le nouvel automatique d'une ancienne application : son UUID reste retourné dans le reçu historique. Pas de nouvelle allocation, révision, intention ou écriture. `get_collection_operation_result` existant récupère le même résultat. Réponse perdue **simulée après commit réel** ; aucune coupure réseau réelle revendiquée.

Autorisation actuelle obligatoire aussi pour le retry : AAL1, profil absent, destinataire partagé, tiers refusés. Transfert de propriété et suppression du parent pendant une attente réelle refusent le reçu à l'ancien propriétaire.

## Preuves réellement exécutées

| Validation | Résultat |
|---|---|
| [pgTAP 033](../../supabase/tests/database/033_collection_update_apply.test.sql) | **131 assertions PASS** |
| Suites directement concernées 024 / 026 / 032 | **498 + 177 + 134 = 809 assertions PASS** |
| [Concurrence apply](../../scripts/test-collection-update-apply-concurrency.ts) | PASS, **quatre connexions réelles** |
| [PostgREST apply](../../scripts/test-collection-update-apply-api.ts) | PASS, vraie API Local |
| SQL lint public/private | PASS, aucun avertissement/erreur |
| Signature / ACL / contraintes réelles | PASS, pgTAP et inspection Local |
| Types Supabase depuis Local, seconde génération | PASS, identiques byte à byte ; SHA-256 `9c7960d56bd96591bb67465f661bcac724f8c3b1d03f0b41c2c7b38795c19fc5` |
| `npm run build`, incluant `tsc -b` | PASS ; avertissement existant de bundle >500 kB |
| ESLint nouveaux scripts + types générés | PASS, zéro avertissement |
| Dépendances package/lock | PASS, seule version modifiée |
| Snapshots utilisateur/catalogue avant/après | PASS, égalité exacte et zéro résidu synthétique |
| Liens des documents touchés / `git diff --check` | PASS |

Concurrence observée par `pg_blocking_pids` : sync exclusive puis apply (parent encore libre pour un writer), writer structurel puis apply puis sync simultanés, deux apply du même UUID avant premier COMMIT, sync attendant une application, mutation structurelle attendant une application engagée, reprise après COMMIT, isolation fixe refusée, timeout réel, relecture des droits après attente. Aucun deadlock observé. Changements catalogue synthétiques effectués sous le verrou réel de la sync ; le pipeline catalogue complet n'est pas relancé.

Non exécutés, conformément au périmètre : DB complète, frontend/Vitest complet, anciens scripts de concurrence, parcours navigateur, Cloud/Vercel, vraie perte réseau. Validation globale réservée à 8F.3. Aucun reset, migration Cloud, conversion legacy, mutation des deux collections réelles, déploiement, commit ou push.

## Fichiers et intégration suivante

Fichiers de réalisation : migration, suite 033 et [fixture SQL](../../supabase/tests/database/collection_update_apply.fixtures.inc), [adaptateur des fixtures 8E](../../scripts/collection-update-apply-fixtures.ts), deux scripts concurrence/API. Les tests 024/032 remplacent uniquement leurs assertions historiques d'absence de futur writer par la fermeture permanente du moteur/plan privé ; aucun algorithme ou assertion de pureté affaibli.

Autres fichiers : [types générés](../../src/types/database.generated.ts), [tsconfig.node.json](../../tsconfig.node.json) pour vérifier les scripts, [package.json](../../package.json)/[lock](../../package-lock.json), ce rapport et références courantes README/Fonctionnalités/Modèle/Architecture/Database/Roadmap. Roadmap indique 8F en cours, sans découpage opérationnel ni clôture globale.

8F.2 devra ajouter le service et décodeur strict du résultat, conserver tous les BIGINT en chaînes, réutiliser UUID/token exacts pour reprise et `get_collection_operation_result`, traiter distinctement `preview_stale`, absence de delta et collision. Relectures autoritatives et invalidations communes contenu/ordre/overview/Dashboard/statut/aperçu à réutiliser. La forme `created_items` ne rentre pas dans le résultat à quatre clés des writers ordinaires : étendre le contrat de reprise à la couche responsable, sans tronquer le reçu. Confirmation et intégration UI restent 8F.3. `applied_target_version` atomique permettra à 8G de déduire le traitement sans écriture massive ; aucun suivi anticipé ajouté.
