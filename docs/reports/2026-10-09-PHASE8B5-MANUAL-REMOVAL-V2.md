# Phase 8B.5 — Retrait manuel v2 et cycle de vie des éléments

Date : **9 octobre 2026**. Version applicative : **0.8.4**.

## Résultat et périmètre

**`remove_manual_collection_item_v2` livré et validé sur Supabase Local.** Retrait effectif du seul élément manuel, cascade de toutes ses intentions propres, révision +1 et reçu `remove` atomiques. Références historiques R1 des autres sujets et reçus antérieurs conservés. Réintroduction de même variante par ajout v2 : nouvel UUID, nouvelle introduction et nouveau placement initial, sans héritage de personnalisation.

**Aucune activation du contrat 2 pour les collections utilisateur.** Quatre collections réelles et créations toujours contrat 1 ; aucun frontend, lecteur/service v2, consultation publique de reçu, masquage, actualisation ou notification livré. Moteur 8B.2, writers 8B.3/8B.4, contraintes différées 8B.4 et migrations historiques inchangés. Aucun tombstone ni historique de personnalisation archivé.

Sources examinées : `AGENTS.md`, rapports [8A.2](2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md), [8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), [8B.1](2026-10-08-PHASE8B1-RELATIVE-ORDER-FOUNDATIONS.md), [8B.2](2026-10-08-PHASE8B2-RELATIVE-ORDER-ENGINE.md), [8B.3](2026-10-08-PHASE8B3-REORDER-WRITER-V2.md), [8B.4](2026-10-09-PHASE8B4-MANUAL-ADD-V2.md), documentation courante, migrations/tests des writers legacy, journal, moteur et writers v2, FK/cascades, reçus, lanceurs et types. Context7 `/supabase/cli`, changelog et `--help` de la CLI installée consultés pour la procédure Local.

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `ede311903d61c7e59b3bff217fe7b5a0c7e93b81` | Identique ; aucun commit |
| Git | Arbre propre, aucun changement préexistant/staged | 11 fichiers suivis modifiés, 4 nouveaux non suivis ; aucun staged |
| Version package / lock / racine du lock | `0.8.3` aux trois emplacements | `0.8.4` aux trois emplacements |
| Outillage réel | Node `24.20.0`, npm `12.1.0`, Supabase CLI `2.120.0` | Identique ; dépendances, engines et packageManager conservés |
| Base | Supabase Local existant, `127.0.0.1:55322/postgres`, PostgreSQL `17.6` | Même base/volume, sans reset |
| Migrations Local | 33/33, dernière `20261009061226` | **34/34**, dernière `20261009083806` |
| Collections/items réels | 4 collections / 660 items, contrat 1/révision zéro | Identiques ; introductions NULL, journal/reçus vides |
| Cloud | Aucun contrôle distant entrepris | Aucun accès ni migration Cloud ; dernier checkpoint propriétaire historique non revérifié |

`migration list --local` compare dépôt et base Local ; sa colonne `Remote` ne prouve aucun état Cloud. Realtime, imgproxy et pooler arrêtés dans le statut Local, sans incidence sur les validations SQL. Aucun reset, suppression de volume, seed applicatif, commit, push ou déploiement.

## Migration et contrat exact

Migration [20261009083806_phase8b5_manual_remove_v2.sql](../../supabase/migrations/20261009083806_phase8b5_manual_remove_v2.sql), créée via `npx.cmd --no-install supabase migration new phase8b5_manual_remove_v2`, puis appliquée par `migration up --local`. **Un seul BEGIN/COMMIT**, une nouvelle fonction publique et commentaires ; aucune table, colonne, FK, contrainte, trigger ou fonction métier préexistante modifié.

```sql
public.remove_manual_collection_item_v2(
  p_collection_id uuid,
  p_collection_item_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid
) returns jsonb
```

Sans défaut ni overload. `VOLATILE SECURITY DEFINER`, `search_path=''`, tables qualifiées. EXECUTE révoqué à PUBLIC/anon/service_role, accordé seulement à authenticated. Les droits directs préexistants restent identiques.

1. Exiger identité, MFA AAL2, profil existant et `READ COMMITTED`.
2. Verrouiller parent propriétaire `FOR UPDATE`, puis relire propriété, contrat et révision après éventuelle attente. Contrat 1 refusé. Aucun accès ni verrou catalogue.
3. Valider sujet/opération non NULL et révision non NULL/non négative. Calculer SHA-256 du tuple JSONB canonique versionné : nom de RPC, parent, UUID sujet, révision attendue en texte exact.
4. Chercher reçu sous parent/UUID : même kind `remove` et empreinte → résultat historique ; autre requête/type → `operation_id_conflict`. Autorisation actuelle et existence du parent obligatoires avant retour historique. Présence actuelle du sujet et révision courante non réexigées sur retry accepté.
5. Nouvelle opération : révision attendue exacte, sujet vivant du même parent verrouillé, origine `manual`. Automatique natif ou ancien manuel converti refusé.
6. Supprimer sujet, cascader ses intentions propres, incrémenter révision exactement une fois, enregistrer reçu `remove` et retourner résultat. Aucun compactage ni nouvelle intention de placement pour un retrait.

Résultat JSONB possède exactement quatre champs : `operation_id`, `outcome`, `personal_revision`, `collection_item_id`. Outcome toujours `changed`, UUID supprimé conservé dans résultat/reçu, révision **chaîne décimale exacte**. La suite vérifie empreinte canonique, résultat identique au reçu, révision acceptée, exactitude au-delà de Number et rollback à l’overflow BIGINT.

| SQLSTATE / message | Refus |
|---|---|
| `42501 / collection_action_unavailable` | Identité/AAL2/profil/propriété, parent absent/supprimé/inaccessible |
| `22023 / collection_operation_invalid` | Sujet/opération/révision NULL ou révision négative |
| `P0002 / collection_item_unavailable` | Sujet absent, déjà retiré ou hors parent, sans révéler autre collection |
| `23514 / automatic_item_removal_forbidden` | Automatique, ancien manuel converti compris |
| `23514 / order_contract_upgrade_required` | Parent legacy |
| `40001 / collection_structure_conflict` | Nouvelle révision obsolète, snapshot fixe, timeout/deadlock/contention |
| `23505 / operation_id_conflict` | UUID accepté avec autres paramètres ou autre type de writer |
| `XX000 / phase8_operation_unexpected` | Erreur interne assainie ; rollback intégral |

## Preuves de cycle de vie et intégrité

FK composite sujet → item avec `ON DELETE CASCADE` supprime placement initial et tous déplacements propres. Ancres et suffixes historiques sans FK restent dans intentions des autres sujets ; comparaison des lignes JSONB complètes, dates et contextes inclus, confirme absence de modification. Reçus seulement liés au parent, sans FK sujet : reçus précédents conservés exactement jusqu’à suppression du parent. Positions, origines, rangs et dates des autres items comparés intégralement après chaque retrait, y compris positions égales décimales minuscules.

R1 : cinq manuels ajoutés dans parent libre synthétique, dernier sujet déplacé avant premier. Suppression ancre → vrai moteur 8B.2 résout premier successeur historique. Suppression de ce successeur → moteur saute son UUID et résout prochain vivant. Disparition de tout suffixe → `fallback_end`, permutation finale singleton attendue. Intention du sujet restant comparée intégralement avant/après ; suffixe absent conservé, seules intentions des sujets retirés disparaissent.

R3 : ajout exact, deux déplacements personnels, intention d’autre sujet désignant ancien UUID, retrait puis réajout de même variante. Ancien sujet avait **trois intentions**, toutes réellement supprimées ; nouveau sujet possède **une seule nouvelle intention initiale**, nouvel UUID et introduction. Ancienne ancre conserve ancien UUID et moteur résout `fallback_end`, jamais nouveau sujet par variante. Rejeu du journal vivant reproduit permutation matérialisée. Retry du retrait retourne ancien UUID ; anciens reçus add/move restent utilisables, sans changer la nouvelle révision.

Copies/notes globales comparées exactement ; accès SELECT propriétaire sous rôle authenticated vérifié après retrait et après réintroduction. Elles restent accessibles via la même variante et RLS existante.

Injection avant INSERT reçu vérifie que sujet et ses intentions sont déjà absents et révision incrémentée ; séquence de test non transactionnelle prouve étape atteinte. Erreur publique assainie, comparaison complète confirme restauration item/intention/révision/reçus. UUID échoué repris avec succès. Script concurrent injecte également un échec différé au **vrai COMMIT après reçu** : transaction intégralement annulée, retry accepté ensuite.

Contraintes 8B.4 intactes : retrait sujet/initiale autorisé au COMMIT ; suppression d’initiale d’un manuel vivant ou converti interdite au vrai COMMIT, sans état partiel. Conversion synthétique engagée conserve introduction/initiale et refuse RPC de retrait. Suppression parent engagée cascade journal/reçus. Legacy toujours exempt et fonctionnel.

## Tests et validations exécutés

| Validation | Résultat |
|---|---|
| [Suite pgTAP 027](../../supabase/tests/database/027_manual_collection_removal_v2.test.sql) finale | **175 assertions PASS** |
| `npm.cmd run db:test`, suites finales | **27 fichiers / 2 743 assertions PASS** |
| Parité canonique intégrée | **1 213 cibles, zéro divergence** |
| [Concurrence retrait v2](../../scripts/test-manual-collection-removal-v2-concurrency.ts) | **PASS, quatre connexions PostgreSQL réelles** |
| Concurrences reorder v2 et ajout manuel v2 | **PASS**, scripts précédents inchangés |
| Concurrences reorder v1 et ajout/retrait v1 | **PASS**, scripts précédents inchangés |
| `npm.cmd run db:lint` public/private | **PASS**, zéro warning/erreur |
| Advisors sécurité Local, info / fail-on warn | **PASS**, zéro WARN/ERROR ; quatre INFO privées RLS sans policy attendues |
| `npm.cmd run db:types` | **PASS**, génération depuis Local appliqué ; seule nouvelle RPC ajoutée |
| `npm.cmd run build` / typecheck inclus | **PASS**, nouveau script TypeScript inclus |
| `npm.cmd run lint` | **PASS** |
| Vitest services Collections/items/manuels/contenu v1 | **4 fichiers / 304 tests PASS** |
| Conservation données/ACL/RLS/vues/fonctions préexistantes | **PASS**, snapshots complets identiques |
| Versions/dépendances, historique, types, liens, périmètre, `git diff --check` | **PASS** |

Suite 027 : parent libre/automatique, premier/intermédiaire/dernier/singleton, mouvements multiples, disparition sujet/initiale/moves, préservation exacte autres items/intents, R1 et R3 via moteur réel. Retry avant/après mutation et réintroduction, conflits sujet/révision/types, nouvelle suppression d’absent, stale revision, paramètres invalides, fingerprint canonique, BIGINT exact/overflow, rollback injecté, conversion, contraintes différées et cascade parent.

Sécurité réelle : propriétaire AAL2 accepté ; propriétaire sans AAL2, vrai utilisateur Auth sans profil, destinataire partagé, tiers et absence de session refusés sur nouvelle opération et reçu historique. Anon/service_role sans EXECUTE ; refus réel de lecture journal/reçus et DML direct item/intention/position/révision. Ancien propriétaire, parent absent/supprimé/inaccessible refusés. Aucun nouveau privilège sur table privée ou donnée structurelle.

Concurrence : attentes parent observées par `pg_blocking_pids`. Deux retraits même sujet avec UUID distincts → stale après attente, puis absent avec révision fraîche, sans deuxième reçu. Même UUID simultané → seul retrait/reçu/incrément. Reorder → retrait stale ; retrait → reorder de sujet absent refusé. Retrait → add stale puis retry frais ; add → retrait avec prochaine révision accepté après attente, intention de nouvel ajout conservée. Deux parents indépendants, même UUID autorisé par portée parent. Rollback libère retry en attente ; retry après réponse engagée supposée perdue retourne reçu sans réécriture. Retrait engage pendant verrou catalogue exclusif sans prendre advisory lock. Snapshot repeatable-read/serializable et vrai timeout parent refusés. Changement propriétaire et suppression parent pendant attente relus avant retry historique.

Fixtures 8B.3/8B.4 réutilisées, aucune fixture métier parallèle. pgTAP sous rollback ; script multi-connexion vérifie IDs réservés libres avant setup, engage fixtures synthétiques seulement, cleanup transactionnel dans `finally`, zéro résidu contrôlé. Aucun effet sur quatre collections utilisateur.

Seule adaptation d’une suite historique : 024 remplace absence du retrait v2 désormais livré par absence de consultation publique de reçu encore future. Aucun calcul/attente algorithmique, migration historique ou writer précédent modifié. Échec initial de nouvelle fixture dû au mode des contraintes après rollback de savepoint ; retour explicite à DEFERRED corrige fixture, sans affaiblir invariant ni changer production.

Non exécutés : navigateur/UI, Vitest complet, perte réelle de réponse PostgREST/réseau, intégration de sync catalogue, shadow `db diff`, benchmark grand journal et Cloud. Aucune UI/pipeline modifié ; reprise incertaine prouvée par reçu engagé et même appel SQL, indépendance catalogue par vrai verrou exclusif. Masquage persistant toujours hors périmètre.

## Conservation et fichiers

Snapshots avant migration et après suites/concurrences : toutes tables public/private et Auth users/sessions, nombres/MD5 de lignes JSONB triées ; ACL tables/colonnes, RLS/policies, vues et définitions/ACL des fonctions préexistantes. **Identiques**, moteur, legacy, reorder/add v2 et helpers 8B.4 inclus.

| Donnée réelle Local | Nombre conservé | MD5 conservé |
|---|---|---|
| Collections | 4 | `c56e6bb565e69a361b2efb0c68fadd3e` |
| Items | 660 | `73d33bb3ba435b6daba15008376109c1` |
| Variantes | 31 904 | `340e5ae3aad2633ab1a513538c293b38` |
| Exemplaires | 3 | `1639a715f67e664bff99396b0ce39771` |

Quatre parents contrat 1/révision zéro ; 660 introductions NULL ; journal/reçus réels vides. IDs, positions, origines, rangs, catalogue, versions, copies, notes, partages et Auth préservés. Scripts/snapshots/logs dans `.cache/phase8b5/`, ignoré par Git.

Quinze fichiers en périmètre : migration, suite 027, script concurrence, ce rapport ; package/lock, types générés, include TypeScript, adaptation 024 ; [README](../../README.md), [Fonctionnalités](../01-FEATURES.md), [Modèle](../03-DATA-MODEL.md), [Architecture](../05-ARCHITECTURE.md), [Database](../06-DATABASE.md#phase-8b5--retrait-manuel-v2-et-cycle-de-vie-r3-local), [Roadmap](../08-ROADMAP.md). Rapports historiques conservés, roadmap macro seulement. Aucun changement de dépendance/outillage ou frontend.

## Dépendances suivantes et retour arrière

Prochain cadrage 8B.6 : consultation propriétaire sécurisée des reçus (`get_collection_operation_result`), autorisation actuelle/parent obligatoire, identité supprimée et révision historique conservées, collisions jamais assimilées à succès. Mécanisme de reçus commun aux trois writers désormais disponible. Transport BIGINT string exact et décodeurs stricts à réutiliser dans futurs services ; CLI génère encore argument BIGINT en `number`, aucune adaptation manuelle des types effectuée.

Lecteur de contenu v2, services/frontend et activation coordonnée restent à séquencer dans leurs périmètres autorisés. Aucun de ces travaux commencé.

Avant COMMIT de migration : rollback intégral. Après application : conserver données, reçus, journal, invariant initial et gardes legacy ; fermer nouvelle RPC par migration additive future si retrait logiciel nécessaire. Ne pas ressusciter sujets/intentions supprimés ni réautoriser legacy sur contrat 2 comme rollback.

**Arrêt à 8B.5, sans commit ni push.**
