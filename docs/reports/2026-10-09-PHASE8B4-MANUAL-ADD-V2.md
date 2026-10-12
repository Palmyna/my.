# Phase 8B.4 — Ajout manuel v2 et invariant du placement initial

Date : **9 octobre 2026**. Version applicative : **0.8.3**.

## Résultat et périmètre

**`add_manual_collection_item_v2` livré et validé sur Supabase Local.** Chaque ajout engage ensemble nouvel item manuel, position exacte, révision personnelle, introduction, intention initiale et reçu idempotent. Placement initial obligatoire au début comme en fin ; trois contraintes différées contrôlent l’état final, y compris après conversion manuel → automatique. Aucun second mécanisme de reçu ou d’ordre.

**Aucune activation utilisateur du contrat 2.** Les quatre collections réelles et toutes les créations restent contrat 1 ; legacy fonctionnel. Frontend, services, lecteurs, DnD, vues et interface d’ajout inchangés. Retrait v2, consultation publique de reçu, conversion réelle, masquage, actualisation, notifications et publication non implémentés. Moteur 8B.2 et writer 8B.3 inchangés.

Avant modification : `AGENTS.md`, rapports [8A.2](2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md), [8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), [8B.1](2026-10-08-PHASE8B1-RELATIVE-ORDER-FOUNDATIONS.md), [8B.2](2026-10-08-PHASE8B2-RELATIVE-ORDER-ENGINE.md), [8B.3](2026-10-08-PHASE8B3-REORDER-WRITER-V2.md), documentation courante, migrations/tests des writers legacy, journal, moteur et reorder v2, fixtures, lanceurs, sécurité et conventions de concurrence examinés. Context7 `/supabase/cli`, changelog Supabase et `--help` de la CLI installée consultés pour la procédure Local. Aucun changement d’outillage requis.

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `2539d5beeb4af05a71ac0c08e85d6c7aef22f8c2` | Identique ; aucun commit |
| Git | Arbre propre, aucun staged ni changement préexistant | 12 fichiers suivis modifiés, 5 nouveaux non suivis ; aucun staged |
| Package / lock / racine du lock | `0.8.2` aux trois emplacements | `0.8.3` aux trois emplacements, dépendances inchangées |
| Outillage | Node `24.20.0`, npm `12.1.0`, Supabase CLI `2.120.0` | Conservé, engines et packageManager identiques |
| Base | Supabase Local existant, `127.0.0.1:55322/postgres`, PostgreSQL `17.6` | Même base/volume, sans reset |
| Migrations Local | 32/32, dernière `20261008185717` | **33/33**, dernière `20261009061226` |
| Données réelles | 4 collections, 660 items, 31 904 variantes, 3 exemplaires | Identiques, empreintes conservées |
| Mode réel | Quatre parents contrat 1/révision zéro, introductions NULL, journal/reçus vides | Identique |
| Cloud | Dernier checkpoint propriétaire documenté : 29 | Aucun accès ni application, état distant non revérifié |

`migration list --local` compare le dépôt à la base Local ; sa colonne `Remote` ne constitue pas une preuve Cloud. Realtime, imgproxy et pooler arrêtés dans le statut Local, sans incidence sur les preuves SQL. Aucun reset, suppression de volume, seed applicatif, commit, push ou déploiement.

## Migration et contrat du writer

Migration [20261009061226_phase8b4_manual_add_v2.sql](../../supabase/migrations/20261009061226_phase8b4_manual_add_v2.sql), créée par `npx.cmd --no-install supabase migration new phase8b4_manual_add_v2`, puis appliquée par `migration up --local`. **Un seul BEGIN/COMMIT**, trois fonctions et quatre triggers nouveaux ; aucune migration historique réécrite, aucune nouvelle table/colonne ou modification des defaults de création. Commentaires du stockage actualisés.

```sql
public.add_manual_collection_item_v2(
  p_collection_id uuid, p_variant_id bigint, p_placement text,
  p_expected_revision bigint, p_operation_id uuid
) returns jsonb
```

Sans défaut ni overload PostgREST. `VOLATILE SECURITY DEFINER`, `search_path=''`, tables qualifiées, EXECUTE révoqué à PUBLIC/anon/service_role et accordé seulement à authenticated. Fonctions de trigger privées également fermées ; leur contexte definer permet de vérifier le journal privé sans en ouvrir les droits.

1. Exiger identité, MFA AAL2, profil existant et READ COMMITTED.
2. Prendre verrou partagé catalogue `771402`, puis parent propriétaire `FOR UPDATE`. Relire propriété, contrat et révision après attente. Contrat 1 refusé.
3. Valider `start/end`, variante et UUID non NULL, révision attendue non négative. Calculer SHA-256 du tuple JSONB canonique versionné : nom de RPC, parent, variante exacte en texte, placement et révision en texte. Aucun contexte normalisé mutable dans l’empreinte.
4. Chercher le reçu 8B.3 sous parent/UUID. Même kind `add` et empreinte → résultat historique ; collision → `operation_id_conflict`. Autorisation actuelle et existence du parent toujours requises ; vieille révision et éligibilité actuelle non réexigées sur retry accepté.
5. Nouvelle opération : contrôler révision, doublon et critères catalogue strictement identiques au legacy : variante active, français confirmé, carte source et extension actives. Aucune restriction de cible/type/canonique supplémentaire ; ajout hors cible automatique testé.
6. Lire tous les items en ordre `sort_position,id`. Start → avant premier pré-ajout et suffixe R1 strictement après cette ancre ; vide → end. End → ancre NULL, suffixe vide. Manuels et automatiques participent à ce contexte complet.
7. Allouer position NUMERIC(40,20) selon la primitive legacy d’extrémité. Égalités ou overflow → rééquilibrer uniquement ce parent en préservant exactement l’ordre relatif des autres items. Positions ordinaires, origine et rang des autres items inchangés.
8. Insérer nouvel UUID, `origin='manual'`, rang NULL ; allouer révision +1, l’enregistrer comme introduction et séquence de `manual_add`, puis créer le reçu atomique et retourner le résultat. Ajout toujours mutation effective, même en fin ou à vide.

Retour exact : `{operation_id,outcome,personal_revision,collection_item_id}` ; outcome toujours `changed`, UUID sous forme de chaînes, révision **chaîne décimale exacte**. Variantes au-delà de la précision JavaScript et révision maximale BIGINT testées. Overflow d’incrément → erreur assainie, rollback intégral.

Erreurs stables : action indisponible, opération invalide, variante indisponible (`manual_variant_unavailable`, convention legacy conservée), doublon `already_present`, révision/contention `collection_structure_conflict`, UUID `operation_id_conflict`, contrat `order_contract_upgrade_required`. Erreurs internes → `XX000 / phase8_operation_unexpected`. Aucun texte interne d’erreur injectée exposé. Timeout catalogue/parent, snapshots repeatable-read/serializable refusés sans mutation.

## Invariant différé et cycle de vie

Contraintes `collection_items_initial_placement`, `collection_intents_initial_placement` et `collections_initial_placement` : **DEFERRABLE INITIALLY DEFERRED**. Elles vérifient l’état final du parent v2, sous verrou parent et relecture après attente, sans lire ni verrouiller le catalogue.

- Tout manuel vivant v2 a une introduction positive, au plus égale à la révision personnelle, et exactement un `manual_add` du même sujet à cette séquence.
- Tout item ayant une introduction conserve cette correspondance, même devenu automatique. Un `manual_add` sur un automatique natif sans introduction reste incohérent.
- PK `(collection_id,sequence)` et correspondance exacte sujet/introduction empêchent deux items de partager la même introduction ; aucune seconde intention initiale du même sujet, aucun geste propre avant l’introduction.
- Trigger `collection_items_introduction_immutable` protège identité, variante, parent et introduction acquise en v2. Changement origine/rang de conversion autorisé ; introduction et intention ne sont pas réécrites.
- Insertion item puis intention permise dans la transaction ; état incomplet ou suppression d’une intention initiale d’un sujet vivant refusés en fin de transaction. Suppression du sujet/parent reste cohérente grâce aux cascades ; références historiques des autres sujets et reçus techniques indépendants conservés.
- Legacy exempt, introductions NULL toujours légales, aucune intention historique reconstruite. Aucune ouverture de DML sur journal, items, révision ou contrat.

Preuves : suite 026 force la vérification différée avec `SET CONSTRAINTS ... IMMEDIATE`, puis constate rollback complet des incohérences. Script multi-connexion tente aussi **deux vrais COMMIT invalides** : item sans intention et suppression d’intention initiale vivante. Les deux échouent `23514 / collection_initial_placement_invalid`, sans état partiel. Conversion synthétique réellement engagée conserve introduction ; tests interdisent ensuite son effacement/changement ou le transfert d’identité.

## Tests et validations exécutés

| Validation | Résultat |
|---|---|
| [Suite pgTAP 026](../../supabase/tests/database/026_manual_collection_items_v2.test.sql), exécution ciblée finale | **177 assertions PASS** |
| Suites ciblées 023–026, avant derniers cas complémentaires | **4 fichiers / 1 125 assertions PASS** |
| `npm.cmd run db:test`, fichiers finaux | **26 fichiers / 2 568 assertions PASS** |
| Parité canonique intégrée | **1 213 cibles, zéro divergence** |
| [Concurrence ajout v2](../../scripts/test-manual-collection-items-v2-concurrency.ts), version finale | **PASS, quatre connexions PostgreSQL réelles** |
| Concurrence reorder v2 8B.3 | **PASS**, script existant inchangé |
| Concurrence reorder v1 et ajout/retrait v1 | **PASS**, deux scripts existants inchangés |
| `npm.cmd run db:lint` public/private | **PASS**, zéro warning/erreur |
| Advisors sécurité Local, niveau info / fail-on warn | **PASS**, zéro WARN/ERROR ; quatre INFO RLS sans policy sur tables privées fermées, attendues |
| `npm.cmd run db:types` | **PASS**, génération depuis schéma Local appliqué ; seule nouvelle RPC ajoutée au diff |
| `npm.cmd run build` | **PASS**, typecheck inclus, nouveau script TypeScript inclus ; warning connu bundle >500 kB |
| `npm.cmd run lint` | **PASS** |
| Vitest services Collections/items/manuels/contenu v1 | **4 fichiers / 304 tests PASS** |
| Conservation des données/ACL/RLS/vues/fonctions préexistantes | **PASS**, snapshots avant/après identiques |
| Versions, dépendances, types, historique SQL, liens, périmètre, `git diff --check` | **PASS** |

Suite 026 : début/fin/vide, collections automatiques/libres, hors cible, normalisation et suffixe R1 complet, absence de changement des autres positions ordinaires, égalités/limites NUMERIC et ordre relatif, précisions BIGINT, retries après gestes ou inéligibilité/retrait/réintroduction, collision variante/placement/révision et entre writers, stale revision, doublons et chaque critère catalogue. Injections après insertion item avant intention, puis après intention avant reçu : étapes atteintes prouvées par séquence de test, erreurs assainies et état complet restauré. UUID d’opération refusé puis repris après rollback accepté normalement.

Sécurité SQL réelle : propriétaire AAL2 réussi ; sans AAL2, sans session, vrai compte Auth sans profil, destinataire partagé et tiers refusés sur ajout neuf et reçu historique ; anon et service_role sans EXECUTE ; autre collection, parent absent/supprimé et ancien propriétaire refusés. Accès directs journal/reçus/items/révision refusés ; droits existants conservés.

Concurrence : attentes réellement observées par `pg_blocking_pids`. Deux ajouts simultanés, révision périmée refusée après attente, révision suivante acceptée avec R1 frais ; même UUID simultané conserve résultat/item sans écriture supplémentaire ; collision explicite ; deux demandes de même variante avec UUID distincts n’ajoutent qu’un item/intention/reçu. Reorder puis add et add puis reorder partagent parent/révision. Autre collection écrivable pendant verrou ; aucune visibilité partielle avant commit, rollback/reprise et timeouts réels testés. Sous catalogue exclusif, ajout attend sans posséder le parent ; autre session verrouille/réordonne ce parent, puis ajout relit éligibilité et révision à la libération. Reorder ne prend aucun verrou catalogue. Tous les gestes concurrents acceptés ont leur reçu à la même séquence, aucune intention perdue.

Fixtures [8B.3](../../supabase/tests/database/relative_order_writer.fixtures.inc) réutilisées et [complément dédié](../../supabase/tests/database/manual_collection_items_v2.fixtures.inc). pgTAP sous rollback. Multi-connexion : IDs synthétiques réservés vérifiés libres, setup/cleanup transactionnels, `finally`, assertion zéro résidu. Aucune collection réelle convertie ou utilisée par les tests.

Rejeu des items et intentions **réellement produits** dans le moteur 8B.2 inchangé : permutation identique ; manuel ajouté en fin puis converti au début du nouveau canonique reste en fin par son intention initiale. Aucun appel au moteur pour effectuer un ajout direct, aucune modification de ses calculs ou attentes.

Deux adaptations historiques strictes : test 023 de BIGINT maximal complété par son intention initiale légitime et vérification différée dans son savepoint ; test 024 retire seulement l’attente d’absence du writer d’ajout désormais livré. Fixtures/attentes métier 8B.3 inchangées. Corrections de la nouvelle suite avant PASS : jointure SQL ambiguë, remise en mode différé après rollback de savepoint et fixture de transfert isolant le bon invariant. Aucun changement de production nécessaire à ces corrections.

Non exécutés : navigateur/UI, Vitest complet, appel PostgREST avec perte réseau réelle, intégration de sync catalogue, shadow `db diff`, benchmark grand journal, Cloud. Aucun code frontend/pipeline modifié ; reprise incertaine prouvée par reçu engagé et même appel SQL, sync concurrente représentée par son vrai verrou exclusif et mutation catalogue synthétique. Masquage persistant toujours absent, conformément au périmètre.

## Conservation des données et documents

Snapshots en lecture seule avant migration et après toutes les suites/concurrences : nombres/MD5 de toutes les tables public/private et Auth users/sessions ; ACL tables/colonnes, RLS/policies, vues, définitions/ACL des fonctions préexistantes. **Comparaison identique**, notamment moteur 8B.2, reorder 8B.3 et trois writers legacy. Aucune modification de privilège préexistant.

| Donnée réelle Local | Nombre identique | MD5 identique |
|---|---|---|
| Collections | 4 | `c56e6bb565e69a361b2efb0c68fadd3e` |
| Items | 660 | `73d33bb3ba435b6daba15008376109c1` |
| Variantes | 31 904 | `340e5ae3aad2633ab1a513538c293b38` |
| Exemplaires | 3 | `1639a715f67e664bff99396b0ce39771` |

Quatre parents toujours contrat 1/révision zéro ; 660 introductions NULL, journal et reçus réels vides. IDs, positions, origines, rangs, versions, dates, copies, notes et partages préservés. Scripts/snapshots de contrôle dans `.cache/phase8b4/`, ignoré par Git.

Dix-sept fichiers en périmètre : migration, suite 026, complément fixtures, script concurrence, ce rapport ; package/lock, types générés, include TypeScript, deux adaptations de tests historiques ; [README](../../README.md), [Fonctionnalités](../01-FEATURES.md), [Modèle](../03-DATA-MODEL.md), [Architecture](../05-ARCHITECTURE.md), [Database](../06-DATABASE.md#phase-8b4--ajout-manuel-v2-et-invariant-initial-local), [Roadmap](../08-ROADMAP.md). Rapports historiques conservés ; roadmap macro uniquement.

CLI génère arguments BIGINT en `number`, sans adaptation manuelle des types. Aucun consommateur v2 livré ; futurs services devront utiliser l’adaptation string ciblée et les décodeurs stricts existants. Payload SQL et tests Node transportent déjà des chaînes décimales exactes.

## Suite et retour arrière

**À traiter dans un périmètre 8B.5 à cadrer : retrait manuel v2**, révision et reçu atomiques, suppression des intentions propres, reçu conservé après retrait et cycle retrait/réintroduction sans héritage d’UUID. Consultation sécurisée des reçus encore future ; lecteurs/services v2 et activation à préparer dans leurs périmètres autorisés. Aucun de ces travaux commencé en 8B.4.

Avant commit de migration : rollback intégral. Après application : conserver données, introduction, invariant, journal/reçus et gardes legacy ; fermer la nouvelle RPC par migration additive future si retrait logiciel nécessaire. Ne jamais effacer les données ou réautoriser un ancien writer sur contrat 2 comme rollback.

**Arrêt à 8B.4, sans commit ni push.**
