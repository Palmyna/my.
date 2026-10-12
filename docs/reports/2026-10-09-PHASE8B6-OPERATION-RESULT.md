# Phase 8B.6 — Consultation sécurisée des reçus d’opération

Date : **9 octobre 2026**. Version applicative : **0.8.5**.

## Résultat et périmètre

**`get_collection_operation_result` livré et validé sur Supabase Local.** Consultation du seul résultat JSONB historique enregistré par déplacement, ajout et retrait v2, après autorisation actuelle et verrou parent. Aucune mutation de donnée, reçu, intention, ordre ou révision. Trois writers v2 et mécanisme de reprise backend désormais complets ; intégration applicative toujours future.

**Contrat 2 inactif pour les utilisateurs.** Quatre collections réelles et créations restent contrat 1. Aucun lecteur de contenu v2, service TypeScript, hook, interface, masquage, actualisation ou notification développé. Writers v2/legacy, moteur, triggers, règles du journal et migrations historiques inchangés.

Sources examinées : `AGENTS.md`, rapports [8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), [8B.3](2026-10-08-PHASE8B3-REORDER-WRITER-V2.md), [8B.4](2026-10-09-PHASE8B4-MANUAL-ADD-V2.md), [8B.5](2026-10-09-PHASE8B5-MANUAL-REMOVAL-V2.md), documentation courante, migrations/tests/fixtures des trois writers, schéma/ACL/RLS des reçus, transports JSONB/BIGINT, lanceurs DB/concurrence et générateur de types. Context7 `/supabase/cli`, changelog Supabase et aide de la CLI installée consultés pour procédure Local ; aucun changement d’outillage nécessaire.

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `88d77646c2a187fb7479695e3918939b8a1fec72` | Identique ; aucun commit |
| Git | Arbre propre, aucun changement préexistant/staged | 11 fichiers suivis modifiés, 4 nouveaux non suivis ; aucun staged |
| Package / lock / racine du lock | `0.8.4` | `0.8.5` aux trois emplacements |
| Outillage réel | Node `24.20.0`, npm `12.1.0`, CLI `2.120.0` | Identique ; dépendances/engines/packageManager conservés |
| Base | Supabase Local existant, `127.0.0.1:55322/postgres`, PostgreSQL `17.6` | Même base/volume, sans reset |
| Migrations Local | 34/34, dernière `20261009083806` | **35/35**, dernière `20261009092328` |
| Données utilisateur | 4 collections / 660 items, contrat 1/révision zéro | Identiques ; introductions NULL, journal/reçus vides |
| Cloud | Aucun accès distant entrepris | Aucun accès ni migration ; état distant non revérifié |

`migration list --local` compare dépôt/base Local ; sa colonne `Remote` ne prouve aucun état Cloud. Statut Local : Realtime, imgproxy et pooler arrêtés, sans incidence sur preuves SQL. Aucun reset, suppression de volume, commit, push ou déploiement.

## Migration et contrat exact

Migration [20261009092328_phase8b6_operation_result.sql](../../supabase/migrations/20261009092328_phase8b6_operation_result.sql), créée par `supabase migration new phase8b6_operation_result` avec CLI installée, puis appliquée par `migration up --local`. **Un seul BEGIN/COMMIT**, une fonction publique et son commentaire. Aucune table, contrainte, policy, fonction métier existante ou donnée modifiée.

```sql
public.get_collection_operation_result(
  p_collection_id uuid,
  p_operation_id uuid
) returns jsonb
```

Sans paramètre par défaut ni overload. `VOLATILE SECURITY DEFINER`, `search_path=''`, relations qualifiées. EXECUTE révoqué à PUBLIC/anon/authenticated/service_role puis accordé seulement à authenticated. Aucun droit ajouté sur stockage privé ; RLS existante conservée sans policy.

1. Exiger identité JWT, MFA AAL2, profil MY. existant et READ COMMITTED, suivant conventions des writers.
2. Verrouiller parent propriétaire `FOR UPDATE`, puis relire propriété et contrat après attente. Parent inexistant/inaccessible ou ancien propriétaire refusé avant lookup de reçu. FK propriétaire vers profil avec suppression RESTRICT conservée.
3. Refuser contrat 1 et UUID d’opération NULL. Parent NULL suit refus sûr de parent indisponible, comme writers existants.
4. Chercher exactement `(collection_id,operation_id)` et retourner uniquement `result`. Aucune lecture du sujet, comparaison de révision actuelle, reconstruction, sélection par variante, exposition d’empreinte/date/kind ou lecture du journal.
5. Aucun reçu → SQL NULL. Aucun retry automatique, reçu inventé ou mutation déclenchée.

Les trois writers produisent quatre champs : `operation_id`, `outcome`, `personal_revision`, `collection_item_id`. Ils sont retournés tels qu’enregistrés ; révision chaîne décimale exacte. La RPC ne filtre pas les kinds ni ne projette quatre clés : futurs reçus `hide/apply` peuvent conserver leur propre forme JSONB. Les tests utilisent seulement des reçus futurs synthétiques, sans implémenter ces mutations.

**NULL ne prouve pas qu’aucune opération ne peut encore aboutir.** Futur service doit conserver même UUID et mêmes paramètres tant que réponse reste incertaine. Suite concurrente prouve absence avant mutation, reçu non engagé invisible, attente jusqu’au commit, rollback donnant NULL, puis même UUID accepté ultérieurement.

| SQLSTATE / message | Refus |
|---|---|
| `42501 / collection_action_unavailable` | Identité/AAL2/profil/propriété, parent absent/supprimé/inaccessible/NULL |
| `22023 / collection_operation_invalid` | UUID d’opération NULL après autorisation |
| `23514 / order_contract_upgrade_required` | Parent contrat 1 |
| `40001 / collection_structure_conflict` | Isolation incompatible, timeout/verrou/deadlock/sérialisation |
| `XX000 / phase8_operation_unexpected` | Erreur interne assainie |

Anon/service_role : refus PostgreSQL EXECUTE réel avant fonction. UUID mal formé rejeté par transport natif UUID avant entrée dans la fonction ; aucune nouvelle convention de transport inventée.

## Preuves historiques, sécurité et intégrité

[Suite pgTAP 028](../../supabase/tests/database/028_collection_operation_result.test.sql) réutilise fixtures 8B.3/8B.4 sous rollback. Résultats attendus capturés directement à partir des mutations réelles, puis comparés aux reçus effectivement stockés. Déplacement effectif, noop réel, ajout, retrait, nouvelles révisions, sujet supprimé et même variante réintroduite sous nouvel UUID couverts. Consultations répétées comparent exactement le JSONB initial. Révision `9007199254740994` conservée en string au-delà de précision sûre JavaScript ; aucun passage par Number.

Rôle authenticated réel : propriétaire AAL2 accepté ; propriétaire AAL1/AAL absent, compte Auth sans profil, destinataire partagé, tiers et absence de session refusés pour reçu existant comme inconnu. Ancien propriétaire, parent absent/supprimé/inaccessible/NULL et contrat 1 refusés. UUID existant chez un autre propriétaire → NULL sous son propre parent, refus sous parent étranger. Anon/service_role réellement privés d’EXECUTE et SELECT privé ; authenticated également privé de lecture directe. Aucun oracle de présence dans une autre collection.

Injection par indisponibilité temporaire de relation privée vérifie erreur interne assainie, sans détail SQL dans message métier. Modification de fixture annulée par savepoint, aucun changement permanent de stockage.

Snapshots de toutes tables public/private et Auth users/sessions après préparation, comparés après consultations/refus : lignes complètes triées/empreintes identiques, dates comprises. Aucun changement d’ordre, événement, reçu, révision ou donnée utilisateur. ACL des six writers vérifiées dans pgTAP ; définitions/ACL de toutes fonctions antérieures également comparées avant/après livraison.

[Script concurrence](../../scripts/test-collection-operation-result-concurrency.ts) : **quatre connexions PostgreSQL réelles**, attentes parent observées avec `pg_blocking_pids`. Lecture attend writers move/add/remove puis retourne leur résultat engagé exact. Retrait conserve ancien résultat d’ajout. Rollback libère lecture avec NULL ; même UUID/paramètres peut réussir ensuite. Consultation verrouille également parent et bloque writer suivant ; autre parent reste consultable. Lecture engage pendant verrou catalogue exclusif `771402`, sans advisory lock propre. Repeatable-read/serializable et vrai timeout refusés. Changement de contrat, transfert propriétaire et suppression parent engagés pendant attente sont relus/refusés avant résultat.

Fixtures réservées vérifiées libres avant setup, engagées seulement pour preuve multi-session, cleanup transactionnel dans `finally`, zéro résidu contrôlé. Aucune collection réelle convertie.

## Validations exécutées et limites

| Validation | Résultat |
|---|---|
| pgTAP 028 final ciblé | **109 assertions PASS** |
| Suite DB complète `npm.cmd run db:test` | **28 fichiers / 2 852 assertions PASS** |
| Parité canonique intégrée | **1 213 cibles, zéro divergence** |
| Concurrence consultation 8B.6 | **PASS**, quatre connexions réelles |
| Concurrences déplacement/ajout/retrait v2 existantes | **Trois scripts PASS**, inchangés |
| SQL lint public/private | **PASS**, zéro warning/erreur |
| Advisors sécurité Local, info/fail-on warn | **PASS**, zéro WARN/ERROR ; quatre INFO RLS privées sans policy attendues |
| Types Supabase depuis Local appliqué | **PASS**, seule nouvelle RPC ajoutée aux types |
| Build / typecheck | **PASS**, nouveau script inclus ; avertissement connu bundle >500 kB |
| ESLint | **PASS**, après typage de deux résultats SQL du script de preuve |
| Vitest services Collections/items/manuels/contenu v1 | **4 fichiers / 304 tests PASS** |
| Conservation données/droits/fonctions antérieures | **PASS**, snapshots identiques |
| Versions/dépendances/périmètre/liens/diff | **PASS**, `git diff --check` |

Seule adaptation historique de test : suite 024 vérifie absence du futur lecteur de contenu v2 au lieu de consultation de reçu maintenant livrée. Aucun calcul ou scénario algorithmique changé. Générateur utilisé sans modification manuelle du fichier généré. Scripts/logs/snapshots de travail dans `.cache/phase8b6/`, ignoré par Git.

Non exécutés : Cloud, navigateur/UI, Vitest complet, perte réelle de réponse PostgREST/réseau, intégration de sync catalogue, shadow `db diff`, benchmark grand journal, scripts de concurrence legacy séparés. Legacy couvert par suite DB complète et tests de services ; fonctions et ACL antérieures identiques. Reprise incertaine prouvée au niveau SQL/transactions, pas comme parcours applicatif.

## Conservation des données et fichiers

| Donnée Local | Nombre conservé | MD5 conservé |
|---|---|---|
| Collections | 4 | `c56e6bb565e69a361b2efb0c68fadd3e` |
| Items | 660 | `73d33bb3ba435b6daba15008376109c1` |
| Variantes | 31 904 | `340e5ae3aad2633ab1a513538c293b38` |
| Exemplaires | 3 | `1639a715f67e664bff99396b0ce39771` |

Quatre parents contrat 1/révision zéro, 660 introductions NULL, journal/reçus réels vides. Catalogue, positions, origines, rangs, versions, copies, notes, partages, Auth users/sessions préservés. ACL tables/colonnes, RLS/policies, vues et définitions/ACL des fonctions préexistantes identiques.

Quinze fichiers : migration, suite 028, script concurrence et rapport ; package/lock, types générés, include TypeScript, adaptation 024 ; [README](../../README.md), [Fonctionnalités](../01-FEATURES.md), [Modèle](../03-DATA-MODEL.md), [Architecture](../05-ARCHITECTURE.md), [Database](../06-DATABASE.md#phase-8b6--consultation-sécurisée-des-reçus-local), [Roadmap](../08-ROADMAP.md). Rapports historiques préservés ; dépendances/outillage/frontend inchangés.

## Dépendances restantes et retour arrière

Lecteur de contenu v2, services stricts et hooks, gestion applicative du même UUID/paramètres après réponse incertaine, relectures puis activation coordonnée restent à développer dans leurs phases autorisées. Contrat 2 reste inactif ; aucune création modifiée. Masquage, actualisation et notifications hors périmètre.

Avant COMMIT migration : rollback intégral. Après application : fermer seulement nouvelle RPC par future migration additive si nécessaire ; conserver reçus/données/journal, writers et gardes legacy. Aucun rollback destructif ni downgrade des collections.

**Arrêt à 8B.6, sans commit ni push.**
