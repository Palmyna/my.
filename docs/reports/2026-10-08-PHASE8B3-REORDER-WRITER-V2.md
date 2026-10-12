# Phase 8B.3 — Writer de réordonnancement v2 et protection legacy

Date : **8 octobre 2026**. Version applicative : **0.8.2**.

## Résultat et périmètre

**`reorder_collection_item_v2` livré et validé sur Supabase Local.** Les trois writers legacy refusent contrat 2 avant écriture ; contrat 1 conserve signatures, privilèges et règles métier. Déplacement v2 : ordre complet, capture R1 serveur immuable, révision personnelle, intention chronologique et reçu atomiques. No-op R4 persistant sans intention/révision ; retries idempotents, erreurs assainies.

**Aucune activation du contrat 2.** Les quatre collections utilisateur et toutes les créations restent contrat 1. Interface, DnD Liste/Cartes, Classeur, lecteurs et services React inchangés. Aucun ajout/retrait v2, consultation publique de reçu, conversion, masquage, actualisation, notification ou publication développé. Moteur 8B.2 et ses migrations inchangés.

Sources lues avant modification : `AGENTS.md`, rapports [8A.2](2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md), [8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), [8B.1](2026-10-08-PHASE8B1-RELATIVE-ORDER-FOUNDATIONS.md), [8B.2](2026-10-08-PHASE8B2-RELATIVE-ORDER-ENGINE.md), documentation courante, migrations/tests 8B.1/8B.2, writers 6A.3/6C.1, fixtures/lanceurs et types générés. Documentation CLI courante obtenue via Context7 et commandes `--help` de la CLI installée ; changelog Supabase consulté. Aucun changement d’outillage requis.

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `80bf399c474dfb5bb75b8a9c2a9ba394c2454ed7` | Identique ; aucun commit |
| Git | Arbre propre, aucun staged/changement préexistant | 11 fichiers suivis modifiés, 5 nouveaux non suivis ; aucun staged |
| Package / lock / racine du lock | `0.8.1` aux trois emplacements | `0.8.2` aux trois emplacements ; dépendances inchangées |
| Outillage | Node `24.20.0`, npm `12.1.0`, Supabase CLI `2.120.0` | Conservé |
| Base | Supabase Local, volume existant, `127.0.0.1:55322/postgres` | Même base/volume, sans reset |
| Migrations Local | 31/31, dernière `20261008180634` | **32/32**, dernière `20261008185717` |
| Collections utilisateur | 4, contrat 1/révision zéro | Identiques ; 660 items conservés |
| Cloud | Dernier checkpoint propriétaire documenté : 29 | Aucun accès ni application ; état distant non revérifié |

`migration list --local` compare dépôt et base Local ; sa colonne `Remote` ne prouve aucun état Cloud. Aucun reset, suppression de données réelles, commit, push ou déploiement.

## Migration atomique et compatibilité

[20261008185717_phase8b3_reorder_writer_v2.sql](../../supabase/migrations/20261008185717_phase8b3_reorder_writer_v2.sql), créée par la CLI installée :

```sh
node node_modules/supabase/dist/supabase.js migration new phase8b3_reorder_writer_v2
node node_modules/supabase/dist/supabase.js migration up --local
```

Une seule transaction `BEGIN`/`COMMIT`, trois `CREATE OR REPLACE FUNCTION` legacy et une nouvelle fonction publique ; aucun défaut, création, colonne, table, policy ou donnée existante modifié. Les 31 migrations historiques restent intactes.

Dans `reorder_collection_item`, `add_manual_collection_item`, `remove_manual_collection_item`, garde ajoutée après identité/MFA/profil/propriété et verrou parent existants : mode 2 → **`23514 / order_contract_upgrade_required`**. Les deux handlers manuels laissent passer cette nouvelle erreur plutôt que la convertir en erreur interne. Aucun autre changement de corps, signature, défaut, privilège ou métier legacy. Contrat 1 fonctionne comme avant ; aucun UUID/reçu artificiel ajouté aux anciennes APIs.

Comparaison du SQL avec les sources historiques après retrait des seules gardes/clauses d’erreur : **corps identiques**. Comparaison des définitions installées normalisées et ACL : identiques. Test transactionnel supplémentaire : restaurer les corps legacy et retirer la nouvelle RPC dans une transaction isolée, rejouer le fichier final complet, comparer définitions/ACL aux objets installés, puis `ROLLBACK` ; **PASS**, état installé intact.

Premier essai d’application annulé pour un délimiteur dollar altéré lors de l’assemblage du fichier ; corrigé avant application réussie. Aucune fonction/donnée partiellement installée ni entrée d’historique conservée. Empreintes contrôlées après cet échec.

## Contrat et déroulement du writer v2

```sql
public.reorder_collection_item_v2(
  p_collection_id uuid, p_item_id uuid, p_placement text, p_anchor_id uuid,
  p_expected_revision bigint, p_operation_id uuid
) returns jsonb
```

Sans paramètre par défaut ni overload. `VOLATILE SECURITY DEFINER`, `search_path=''`, tables qualifiées. EXECUTE révoqué à PUBLIC/anon/service_role, accordé seulement à authenticated. Session AAL2, profil existant, propriété actuelle et parent existant obligatoires. Contrat 1 refusé. `READ COMMITTED` imposé ; snapshots fixes refusés `collection_structure_conflict`.

1. Contrôler identité, prendre verrou parent `FOR UPDATE`, relire propriété/mode/révision après attente.
2. Valider forme des paramètres ; calculer SHA-256 du tuple JSONB canonique versionné : nom de RPC, collection, sujet, placement, ancre nullable, révision attendue en texte. Types natifs UUID/BIGINT produisent une représentation canonique. La destination normalisée dépendante de l’état ne participe pas à l’identité du retry.
3. Chercher reçu sous ce parent/UUID. Même kind/empreinte → résultat historique exact ; autre requête → `operation_id_conflict`. Autorisation actuelle vérifiée avant ce retour. Révision actuelle et présence actuelle du sujet/ancre ne sont pas réexigées pour un retry déjà accepté.
4. Nouvelle opération : vérifier révision, lire **tous** les items triés `sort_position,id`, vérifier sujet/ancre du même parent, extraire logiquement le sujet puis résoudre destination.
5. Permutation modifiée : midpoint NUMERIC exact ou rééquilibrage existant, une révision, une intention `move` à cette séquence. Même permutation : aucun changement de position/révision/journal, même avec positions égales.
6. Insérer reçu changed/noop et retourner exactement quatre clés. Toute erreur annule positions, révision, intention et reçu.

Start → avant premier restant ou fin ; end → fin explicite ; before → avant ancre fournie ; after → avant successeur complet de l’ancre après extraction, sinon fin. Auto-ancrage, destination incohérente, NULL obligatoire, révision négative, sujet/ancre absent ou extérieur refusés. **R1** : suffixe strictement après l’ancre normalisée dans l’ordre autoritatif **pré-déplacement**, sujet exclu ; automatiques et manuels compris, aucune donnée de contexte fournie par client. **R2** : ordre relatif exact des autres éléments conservé. Rééquilibrage numérique ne devient jamais un geste sur un autre élément.

JSONB : `{operation_id,outcome,personal_revision,collection_item_id}`, outcome `changed` ou `noop`, révision **chaîne décimale exacte**. BIGINT au-delà de la précision JavaScript et limite maximale testés. Overflow d’incrément : erreur interne assainie et rollback complet. Erreurs publiques conformes 8A.3 : action indisponible, opération invalide, item indisponible, conflit structurel, UUID en conflit, contrat incompatible ; erreur interne `XX000 / phase8_operation_unexpected`. Timeout/verrou/deadlock normalisés en conflit structurel.

Journal historique jamais mis à jour/compressé. Positions restent l’unique ordre affiché. Rang canonique, origine, introduction, versions, copies et notes inchangés. Primitive de matérialisation reprise du writer legacy ; **aucun appel au moteur de fusion pour un geste direct**, conformément à 8A.3. Un test rejoue ensuite le journal réellement produit dans le moteur 8B.2 inchangé et retrouve la même permutation.

## Preuves PostgreSQL, sécurité et concurrence

| Validation exécutée | Résultat |
|---|---|
| [Suite 025](../../supabase/tests/database/025_relative_order_writer.test.sql) | **233 assertions PASS** |
| `npm run db:test` | **25 fichiers / 2 390 assertions PASS** |
| Parité canonique dans suite DB | **1 213 cibles, zéro divergence** |
| `npm run db:lint` | **PASS**, public/private, zéro warning/erreur |
| Advisors sécurité Local, niveau info / fail-on warn | **PASS**, zéro WARN/ERROR ; quatre INFO privées RLS sans policy attendues |
| [Concurrence v2](../../scripts/test-relative-order-writer-concurrency.ts) | **PASS, quatre connexions PostgreSQL réelles** |
| Concurrence reorder v1 et ajout/retrait v1 | **PASS**, deux scripts existants exécutés |
| `npm run db:types` | **PASS**, génération depuis schéma appliqué ; seule RPC v2 ajoutée |
| `npm run build` et typecheck du nouveau script | **PASS** ; warning bundle >500 kB connu |
| `npm run lint` | **PASS**, script inclus dans projet TypeScript existant |
| Vitest services Collections/items/manuels/contenu v1 | **4 fichiers / 304 tests PASS** |
| Rejeu transactionnel du fichier de migration final | **PASS**, définitions/ACL conformes, rollback complet |
| Données/droits/lecteurs/moteur après tests | **PASS**, empreintes et contrats préexistants conservés |
| `git diff --check`, whitespace des nouveaux fichiers, dépendances/types/liens/périmètre | **PASS** |

Suite 025 : quatre placements, manuel/automatique, douze permutations explicites, destination déjà satisfaite, after dont le sujet était le successeur, singleton, précision épuisée et bornes NUMERIC, égalités réparées seulement sur geste effectif. Capture R1 exacte mixte, contexte d’une époque personnalisée distinct du canonique, répétitions du même sujet et ancien contexte immuable. Retry identique avant/après autres gestes et no-op après réparation numérique ; sujet/ancre retiré après succès ; fingerprint incluant sujet, placement, ancre et révision ; conflit périmé sans reçu ; erreur injectée **à l’insertion finale du reçu**, après ordre/révision/intention, rollback complet vérifié.

Sécurité SQL réelle : propriétaire AAL2 réussi, anon/service_role sans EXECUTE, authenticated sans session/AAL2, vrai utilisateur Auth sans profil, destinataire partagé, tiers et ancien propriétaire refusés, sur nouvelle opération **et/ou reçu historique** selon le cas. Parent absent/supprimé indisponible ; aucune récupération privée par reçu. Droits directs et refus d’accès journal/reçus/révision/positions vérifiés. RLS/grants préexistants inchangés.

Concurrence : attentes parent **observées par `pg_blocking_pids`**, révision obsolète refusée après commit concurrent, révision suivante acceptée avec R1 depuis l’ordre fraîchement engagé, same UUID simultané → résultat identique sans double intention/écriture, UUID simultané différent → conflit, reçu no-op simultané unique. Déplacement effectif sur une seconde collection pendant verrou de la première, visibilité atomique avant commit, rollback puis reprise, snapshots repeatable-read/serializable refusés, vrai lock timeout normalisé. Un legacy en attente voit le contrat 2 installé pendant l’attente et refuse avant insertion. Aucun geste/reçu perdu ; toutes les intentions move concurrentes ont leur reçu cohérent.

Fixtures [dédiées](../../supabase/tests/database/relative_order_writer.fixtures.inc), IDs réservés, aucune collection réelle convertie. pgTAP sous `BEGIN`/`ROLLBACK`. Plusieurs sessions exigent visibilité de fixtures engagées : setup et cleanup chacun transactionnel, seuls parents synthétiques utilisés, nettoyage `finally` avec cascade et assertion zéro reste. Contrat 2 uniquement sur fixtures synthétiques. Les services Realtime/imgproxy/pooler arrêtés dans le statut Local ne sont pas nécessaires à ces validations.

Assertion de suite 024 actualisée : absence du writer reorder v2 n’est plus attendue ; absence moteur public/aperçu/application et writers manuels v2 toujours vérifiée. **Aucun calcul/attente algorithmique 8B.2 modifié.** Droits manquants des adaptateurs pgTAP temporaires corrigés avant résultat final ; script ajouté au `include` TypeScript pour validation ESLint/typecheck.

Non exécutés : navigateur/UI et Vitest complet, intégration de sync catalogue, reconstruction shadow `db diff`, appel PostgREST/réseau avec perte réelle de réponse, test Cloud. Aucun frontend/pipeline changé ; reprise après résultat incertain prouvée par même appel SQL avec reçu engagé, puis autres mutations. Pas de preuve de masquage persistant : colonne `is_hidden` appartient à 8C et reste absente ; ordre complet sans filtre prouvé sur automatiques/manuels. Aucun benchmark grand journal requis/entrepris.

## Conservation des données réelles

Snapshot en lecture seule avant application, comparaison après migration/tests/concurrence : **toutes les tables applicatives public/private**, nombres/MD5 de lignes JSONB triées, ACL tables/colonnes, RLS/policies, vues, fonctions préexistantes. Pour les trois writers, comparer définitions après retrait des seules gardes/clauses autorisées ; ACL identiques. Moteur 8B.2 inclus et intact.

| Donnée Local | Nombre identique | MD5 identique |
|---|---|---|
| Collections | 4 | `c56e6bb565e69a361b2efb0c68fadd3e` |
| Items | 660 | `73d33bb3ba435b6daba15008376109c1` |
| Variantes | 31 904 | `340e5ae3aad2633ab1a513538c293b38` |
| Exemplaires | 3 | `1639a715f67e664bff99396b0ce39771` |

Quatre parents toujours mode 1/révision zéro ; introductions historiques NULL, journal et reçus réels vides. IDs, positions, origines, rangs, versions, dates, notes, exemplaires et partages préservés. Aucun seed ou résidu de fixture.

## Fichiers, suites et retour arrière

Seize fichiers en périmètre : migration, suite 025, fixtures, script concurrence, ce rapport ; package/lock, types générés, include TypeScript, assertion d’inventaire 024 ; références courantes [README](../../README.md), [Fonctionnalités](../01-FEATURES.md), [Modèle](../03-DATA-MODEL.md), [Architecture](../05-ARCHITECTURE.md), [Database](../06-DATABASE.md#phase-8b3--writer-de-déplacement-v2-et-gardes-legacy-local), [Roadmap](../08-ROADMAP.md). Rapports historiques conservés ; roadmap au niveau macro. Scripts/empreintes de vérification dans `.cache/phase8b3/`, ignoré par Git.

Types générés : CLI expose l’argument BIGINT en `number`, aucune adaptation manuelle. Aucun consommateur v2 livré ; les futurs services devront reprendre l’adaptation ciblée string du projet et les décodeurs stricts, jamais transporter les révisions par Number. Retours SQL et tests Node utilisent déjà des chaînes exactes.

**Restes pour un périmètre 8B.4 à valider** : writers v2 ajout/retrait manuel, placement initial et invariant différé du manuel vivant, cycle de retrait/réintroduction avec reçu ; consultation sécurisée des reçus ; puis lecteur/services v2 et activation coordonnée dans leurs sous-phases autorisées. Cette liste ne décide pas arbitrairement du découpage de 8B.4. Aucune activation, conversion legacy ou UI implicite.

Avant commit de migration : rollback intégral. Après commit : garder gardes legacy, données, positions, journal et reçus ; si retrait logiciel nécessaire, fermer nouvelle RPC par migration future et conserver consultation compatible. **Ne jamais réautoriser legacy sur contrat 2 ni effacer des données comme rollback.** Aucun retour arrière destructif exécuté.

**Arrêt à 8B.3, sans commit ni push.**
