# Phase 8B.8 — Activation du contrat 2 et clôture Local de 8B

Date : 2026-10-10. Version **0.8.7**. **Phase 8B terminée et validée Local.** Les nouvelles collections libres et automatiques sont créées en **contrat 2 / révision 0**. Les quatre collections utilisateur existantes restent **contrat 1 / révision 0**, sans conversion, suppression ni modification de leurs 660 éléments et données associées.

Moteur PostgreSQL de fusion/rejeu, journal chronologique, trois writers v2, reçus idempotents, consultation sécurisée, lecteur et intégration applicative sont livrés. `sort_position,id` reste l’ordre affiché autoritatif. Actualisation automatique, masquage et notifications restent futurs. **Prochaine étape : 8C, non commencée.** Aucun accès ni déploiement Supabase Cloud/Vercel, reset, commit ou push pendant cette intervention.

## 1. État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `15a7a89fc12d0fb5d8d99ea0ffba29a496cd77b6` | Identique |
| Git | Worktree propre, aucun changement préexistant | 22 fichiers suivis modifiés, 6 nouveaux ; rien indexé |
| Application | `0.8.6` | **`0.8.7`** |
| Node / npm / Supabase CLI | `24.20.0` / `12.1.0` / `2.120.0` | Identiques |
| Migrations Local | 36 appliquées | **39/39 appliquées**, dernière `20261010072938` |
| PostgreSQL / API Local | `127.0.0.1:55322` / `http://127.0.0.1:55321` | Volume conservé |
| Cloud | Dernier checkpoint manuel propriétaire : 29 migrations | Aucun accès ; état distant non revérifié |

Avant modification : lecture de `AGENTS.md`, des [contrats 8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), du [rapport 8B.7](2026-10-09-PHASE8B7-APPLICATION-INTEGRATION.md) et des rapports 8B précédents nécessaires. Inspection des créations libres/automatiques, migrations, contraintes, grants/RLS, gardes legacy, placements initiaux, moteur, writers, reçus, lecteurs, services/hooks, caches, interfaces et tests. État réel du dépôt et de Local utilisé comme référence ; aucun changement préexistant à préserver. Documentation courante Supabase/CLI et PostgREST consultée via Context7 ; comportement PostgREST confronté au code de la version installée.

## 2. Migrations et créations

Trois migrations créées via la CLI, chacune avec une seule transaction `BEGIN`/`COMMIT`, inspectées puis appliquées par `migration up --local` après inventaire. Historique final contrôlé par `migration list --local`. La colonne `Remote` de cette commande désigne ici l’historique de la base **Local**, aucune preuve Cloud.

| Migration | Effet |
|---|---|
| [20261010064645_phase8b8_activate_relative_order.sql](../../supabase/migrations/20261010064645_phase8b8_activate_relative_order.sql) | Défaut serveur 2 ; insertion automatique explicite 2/0 ; aucun backfill |
| [20261010065918_phase8b8_postgrest_structure_conflicts.sql](../../supabase/migrations/20261010065918_phase8b8_postgrest_structure_conflicts.sql) | Rendu HTTP définitif des conflits des trois writers v2 |
| [20261010072938_phase8b8_conflict_return_contract.sql](../../supabase/migrations/20261010072938_phase8b8_conflict_return_contract.sql) | Retour JSONB du helper privé et RETURN dans les trois handlers, pour couvrir tous les chemins de retour au SQL lint |

**Libre :** insertion existante dans `public.collections` conservée. `authenticated` peut fournir uniquement `name` et `collection_type` ; propriétaire et contrat sont serveur. Le défaut `order_contract_version` passe à 2 ; `personal_revision` conserve son défaut zéro. Parent initial vide, sans journal ni reçu. Le premier ajout manuel v2 enregistre introduction, placement initial, révision et reçu atomiquement. Les requêtes tentant de sélectionner contrat 1, contrat 2 ou une révision arbitraire, à l’insertion comme à la modification, sont refusées en SQL et via PostgREST. RPC/service/interface de création libre inchangés.

**Automatique :** `create_automatic_collection(text,text,bigint)` garde signature, retour, ACL, autorisation AAL2/profil, verrou catalogue partagé `771402`, unicité propriétaire/cible, éligibilité, vérification du hash, refus d’une cible vide et matérialisation atomique. Seule l’insertion d’un nouveau parent choisit explicitement **2/0**. Items natifs automatiques : UUID propre, origine, rang canonique et position identiques au contrat de création existant ; introduction NULL, aucun journal/reçu initial. Pokémon et Extension testés.

Une cible déjà possédée retourne la collection existante avec `created=false`, sans changer nom, mode, révision, contenu, positions ou version appliquée. Cas v1 testé avec nom NULL et hash catalogue devenu invalide, puis avec deux appels concurrents : retour de l’existant préservé, aucun passage au contrat 2.

## 3. Correctif indispensable découvert par HTTP réel

Les essais PostgREST ont révélé une boucle de retry sur une révision métier obsolète : appels dépassant 15 secondes et répétitions du même `40001` dans les logs PostgreSQL. Le [code PostgREST v14.5](https://github.com/PostgREST/postgrest/blob/v14.5/src/PostgREST/MainTx.hs) utilise `SQL.transaction`, transaction Hasql avec reprise de `40001`. Une révision définitivement obsolète ne peut réussir à paramètres constants ; l’exception SQL provoquait donc des reprises internes inutiles.

Le helper privé `private.raise_collection_structure_conflict()` centralise uniquement le **rendu de l’erreur**. SQL direct conserve `40001 / collection_structure_conflict`. Avec `request.method` non vide, le handler lève une [erreur structurée PostgREST](https://docs.postgrest.org/en/v14/references/errors.html#add-http-headers-with-raise), SQLSTATE interne `PGRST`, HTTP **409**, payload inchangé `{code:"40001",message:"collection_structure_conflict",details:null,hint:null}`. Les trois erreurs HTTP de révision obsolète sont maintenant reçues en moins de cinq secondes au total. Le frontend existant les reconnaît comme refus définitifs.

Helper `SECURITY INVOKER`, `search_path=''`, aucun EXECUTE pour PUBLIC/anon/authenticated/service_role. `request.method` n’accorde aucun droit et ne modifie aucun contrôle métier. Les corps des trois writers diffèrent uniquement dans leur handler final de conflit/contention ; moteur, verrous, autorisations, révisions, journal, reçus et paramètres publics préservés. Une troisième migration corrige le warning SQL lint « control reached end of function without RETURN » : helper retournant JSONB, appel avec RETURN ; il lève toujours l’erreur et ne retourne aucun succès.

Aucun nouvel UUID, recalcul de révision, second geste ou retry de writer ajouté. Aucun patch de migration historique. Après la dernière migration, suite DB complète, API d’activation, sept scripts de concurrence et SQL lint redéroulés avec succès.

## 4. Parcours fonctionnels intégrés

[pgTAP 030](../../supabase/tests/database/030_order_contract_activation.test.sql) : **47 assertions PASS**. [Script HTTP d’activation](../../scripts/test-order-contract-activation-api.ts) : vraies requêtes PostgREST, fixtures engagées et nettoyage limité à leurs IDs. Le scénario libre contrôle chaque révision, ordre lu/matérialisé, nombre d’intentions/reçus et identité : création → ajout A/B → déplacement → nouvel ajout C → retrait B → réintroduction B. Même UUID/paramètres retourne le résultat original ; réponse engagée volontairement ignorée récupérée par reçu, sans second geste. Nouveau B reçoit un nouvel UUID/introduction et aucun ancien placement propre. Exemplaire et note globale conservés ; progression Dashboard/Collection reflète sa réintroduction.

Créations automatiques Pokémon et Extension : contenu canonique complet, trié, sans doublons, révision zéro, aucun journal artificiel. Ouverture de l’existant avec même ID. Déplacement d’un automatique, ajout/retrait d’une manuelle et refus du retrait natif automatique. `automatic_rank` reste canonique quand `sort_position` devient personnel. Aucun parcours d’actualisation développé.

Parcours navigateur dans Chromium réel, connecté à Vite et Supabase Local, fixtures distinctes de celles des scripts SQL/HTTP. Propriétaire et destinataire disposent de sessions AAL2 synthétiques reconnues par `/auth/v1/user`, avec facteur vérifié. Installation des sessions/fixtures par SQL privilégié ; aucun parcours d’inscription/enrôlement/challenge MFA prétendu exécuté. Catalogue synthétique de six variantes BIGINT au-delà de MAX_SAFE_INTEGER.

| Parcours navigateur | Preuve et résultat |
|---|---|
| Création libre depuis Dashboard | Parent 2/0 vide ; Alpha et Bravo en fin, Charlie au début via dialogue existant |
| Liste, souris | Entrées natives mouse down/move/up ; changement confirmé par relecture et backend |
| Cartes, souris | Même parcours avec déplacement et ordre engagé/relu |
| Liste et Cartes, clavier | Focus poignée, prise/déplacement/dépôt clavier natifs ; mutations v2 et confirmation |
| Liste et Cartes, tactile | Émulation mobile `390×844`, événements CDP touch/pointer natifs `isTrusted=true` ; ordre engagé/relu |
| Placements | Début/fin dans l’ajout ; avant/après dans les requêtes émises par DnD/clavier ; les quatre formes couvertes par les suites SQL/services |
| Feedback et relectures | Enregistrement puis confirmation « Carte déplacée. » ; traces de `get_collection_item_order` et `get_collection_content_v2` après writer |
| Ajout après réponse perdue | Delta ajouté par HTTP engagé, réponse masquée au client ; récupération du reçu, un seul ajout |
| Retrait/réintroduction | Bravo retiré après confirmation, exemplaire gardé ; nouvel UUID au réajout, note et progression conservées |
| Recherche partielle | Recherche Alpha : poignées absentes, message demandant d’effacer la recherche avant reorder |
| Classeur | Formats 2×2, 3×3 et 4×3, navigation après changements ; Echo retrouvé en page 2 du format 2×2, ordre backend conservé |
| Catalogue Pokémon | CTA crée trois automatiques en 2/0, journal/reçus vides ; mouvement tactile, ajout/retrait Delta ; « Ouvrir ma collection » conserve l’ID |
| Catalogue Extension | CTA crée six automatiques en 2/0, rangs/positions 1…6, aucun journal initial |
| Dashboard / version | Collections synthétiques et progression correctes ; footer `v0.8.7` |

Collection libre navigateur finale : révision **12**, cinq items dans l’ordre `Alpha, Charlie, Delta, Bravo, Echo`, huit intentions de sujets vivants et douze reçus. Automatique Pokémon : trois items, révision **3** après déplacement/ajout/retrait ; automatique Extension : six items, révision **0**. États intermédiaires/final enregistrés avant suppression des fixtures. Aucun composant, CSS, design ou comportement UX modifié.

**Limite d’exercice tactile :** aucun doigt ou appareil physique. Une première simulation Liste lancée pendant une transition de vue/animation est restée dans l’animation de dépôt ; tentative non comptée PASS. Après recharge et stabilisation, parcours Liste réussi avec événements natifs et ordre backend confirmé. Cartes réussie également. Cette campagne ne prouve pas toutes les combinaisons de navigateur, matériel et gestes pendant transition.

## 5. Partage et sécurité

Le client actuel ne fournit pas encore la gestion des partages, prévue en Phase 9. Installation et révocation du partage **synthétique seulement** par SQL privilégié ; consultation et refus réellement exercés via HTTP/navigateur. Aucun grant de gestion accordé à l’utilisateur.

Destinataire mobile : contenu et ordre exacts du propriétaire, progression **1/5**, exemplaire de Bravo et note autorisée, panneau exemplaires en lecture seule, aucun bouton d’ajout/retrait/reorder. Les trois writers v2 et la consultation propriétaire de reçu refusent le destinataire via HTTP. Tiers invisible ; AAL1 ne lit pas le contenu et ne peut ajouter. Après révocation, relecture HTTP invisible et UI « Collection indisponible… plus accès. » ; parent inchangé.

Suites DB : ACL/RLS, AAL2/profil/propriété, champs serveur, parents/inconnus et frontières historiques vérifiés. Advisors Local : **0 WARN/ERROR**, quatre INFO attendues pour tables privées RLS sans policy (`catalog_overrides`, `catalog_sync_runs`, `collection_order_intents`, `collection_operation_receipts`). Aucun accès direct API au journal/reçus/helper privé. Snapshot final confirme tables/colonnes ACL, RLS/policies, vues et ACL de toutes les fonctions antérieures inchangées.

## 6. Idempotence, concurrence et rollback

Les sept scripts existants ont été réutilisés, sans nouveau mécanisme de concurrence :

| Script | Résultat / portée |
|---|---|
| [Création automatique](../../scripts/test-automatic-collection-concurrency.ts) | **17 contrôles PASS** ; deux créations attendent réellement le catalogue, puis l’unicité ; un UUID, un created=true, un created=false, parent 2/0 sans intentions/reçus ; autre propriétaire indépendant ; sync attend le créateur ; deux ouvertures v1 intactes |
| [Déplacement v2](../../scripts/test-relative-order-writer-concurrency.ts) | PASS ; quatre connexions, attente parent observée, révision/R1 relus, parents indépendants, UUID simultané/retry/collision/no-op, atomicité/rollback, timeout/isolation et garde legacy après attente |
| [Ajout v2](../../scripts/test-manual-collection-items-v2-concurrency.ts) | PASS ; ajouts concurrents, même UUID, collision/variante doublon, deux sens add/reorder, catalogue avant parent, éligibilité relue, échecs différés réels au COMMIT et rollback intégral |
| [Retrait v2](../../scripts/test-manual-collection-removal-v2-concurrency.ts) | PASS ; remove/reorder/add, réponse engagée incertaine et retry identique, références R1, réintroduction R3, échec injecté au COMMIT et reprise après rollback, autorisation/existence relues après attente |
| [Consultation de reçu](../../scripts/test-collection-operation-result-concurrency.ts) | PASS ; attente des trois writers observée, visibilité après commit, rollback NULL puis même UUID accepté, résultat historique exact, révocation/suppression et aucun changement par consultation |
| [Déplacement v1](../../scripts/test-collection-reorder-concurrency.ts) | PASS ; sérialisation, voisins frais, autre parent, atomicité, rollback et rejet snapshot fixe |
| [Ajout/retrait v1](../../scripts/test-manual-collection-items-concurrency.js) | PASS ; ordre des verrous, disparition du parent, BIGINT exact, rollback et copies préservées |

Attentes vérifiées par connexions PostgreSQL indépendantes, `pg_locks`/`pg_blocking_pids` ; aucune simple succession d’appels présentée comme concurrence. Extension limitée au risque nouveau d’activation : contrat 2/0 vide de journal, canonique et ouverture concurrente d’un existant v1. Les règles métier des autres scripts restent inchangées.

HTTP réel : trois writers à révision obsolète refusés sans modifier ordre/journal/révision ; même UUID accepté retourne son reçu avant contrôle de révision courante ; UUID réutilisé avec autres paramètres refusé ; variante déjà présente refusée même avec nouvelle opération. Perte de réponse simulée **après commit réel**, reçu récupéré sans deuxième writer. Aucune panne réseau physique ou fermeture permanente d’onglet prétendue testée.

## 7. Audit R1–R4 et limites de stockage

| Invariant | Conclusion |
|---|---|
| Moteur PostgreSQL | Fonction pure 8B.2 inchangée, 36 scénarios 8A.2 exercés dans suite complète, dont S08/S35 ; futurs aperçu/application réutiliseront ce moteur |
| Ordre unique | Lecteurs et vues restent fondés sur `sort_position,id` ; canonique `automatic_rank` indépendant ; aucune fusion React |
| R1 | Ancre/suffixe capturés avant geste, contexte immuable ; références historiques d’une ancre supprimée gardées pour sujets vivants |
| R2 | Normalisation dans ordre complet, seul sujet déplacé ; scénarios moteur avec masqués testés, sans livrer stockage ou UI de masquage |
| R3 | Toutes intentions propres disparaissent avec sujet retiré ; réintroduction nouvel UUID/placement ; copies/notes globales gardées ; conversion synthétique conserve identité/introduction |
| R4 | No-op : reçu seul, aucune intention ni révision supplémentaire ; retry identique sans second geste ; chaque ajout manuel possède placement initial, y compris premier ajout/fin |
| Chronologie / invariant initial | Tous gestes v2 des sujets vivants conservés, sans compression au dernier move ; contrainte différée à COMMIT et rollback réels vérifiés |
| Reçus | Mutation/révision/reçu atomiques ; résultat historique exact, sujet supprimé jamais restauré par consultation ; NULL ne libère jamais une requête incertaine |
| BIGINT | IDs/révisions en chaînes décimales exactes ; API existante vérifie révision `9007199254740995`, variantes au-delà de MAX_SAFE_INTEGER et snapshot SQL superposé de 1 005 items |
| Coexistence / caches | Contenu v2 séparé du tableau v1, clé viewer/collection/v2 ; routing selon contrat autoritatif, aucun fallback legacy sur v2 ; suites services/hooks complètes PASS |

Persistance d’une opération incertaine limitée au **même onglet** par `sessionStorage`, avec mémoire du runtime : reload du même onglet couvert par tests existants ; fermeture permanente ne conserve pas la requête pour un nouvel onglet. Nouveau contexte relit l’état serveur et ne rejoue rien automatiquement. Révisions, unicité des variantes et reçus empêchent de créer une seconde écriture implicite ou de dupliquer un item ; récupération universelle d’une intention perdue entre onglets non garantie. Une action ultérieure explicite reste une nouvelle action propriétaire, distincte d’un retry silencieux.

Stockage corrompu : blocage de la mutation concernée **avant envoi**, aucune substitution d’UUID. Essai réel navigateur avec clé corrompue : message d’issue incertaine, compteur de writers inchangé **2→2**, aucun Echo ajouté. Après retrait explicite de la corruption de test et action explicite, ajout réussi. Ce comportement évite corruption/duplication, mais peut nécessiter résolution manuelle du stockage affecté ; aucune purge automatique de requête incertaine ni nouvelle persistance ajoutée.

## 8. Validation technique finale

| Contrôle exécuté | Résultat |
|---|---|
| pgTAP ciblé 030 | **47 assertions PASS** |
| Suite DB complète finale `npm run db:test` | **30 fichiers / 2 944 assertions PASS** |
| Frontend complet `npm test -- --maxWorkers=2` | **64 fichiers / 1 945 tests PASS** |
| Sept scripts de concurrence v1/v2 | PASS après dernière migration |
| API d’activation `node scripts/test-order-contract-activation-api.ts` | PASS après dernière migration et typage final du script ; fixtures retirées |
| API lecteur `node scripts/test-collection-content-v2-api.ts` | PASS ; 1 005 items, partage, BIGINT, snapshot superposé, reçus historiques |
| SQL lint `npm run db:lint` | PASS, aucune erreur/alerte de schéma après correctif RETURN |
| Security advisors `db advisors --local --type security --level info --fail-on warn` | PASS, 0 WARN/ERROR ; quatre INFO privées attendues |
| Types `npm run db:types`, deux générations finales | Identiques, SHA-256 `C181DC7944B75DBEBEC07934EFAC1606CA07C4E141821597FD383B9ECCFC5845` ; aucun diff sémantique |
| Build/typecheck et ESLint | PASS ; nouveau script inclus dans le projet TypeScript existant |
| Graphe package/lockfile | Identique après exclusion des trois champs de version ; dépendances/outillage inchangés |
| Contrats historiques | 36 migrations historiques sans diff ; fonctions/ACL comparées au snapshot initial, seules différences autorisées détaillées ci-dessus |
| Parcours navigateur desktop/mobile | PASS pour parcours décrits ; limites tactile/transition/réseau explicitement conservées |
| `git diff --check`, nouveaux fichiers et liens documentaires | PASS |

Warning Vite existant : bundle principal supérieur à 500 kB, sans échec de build. Vitest émet les messages jsdom de navigation non implémentée déjà connus ; aucune assertion échouée dans la suite finale. Les essais intermédiaires HTTP en boucle, warning SQL lint, typage/lint des scripts et première simulation tactile ne sont pas présentés comme réussis ; correctifs ou limites ci-dessus.

Les fixtures des tests historiques sont désormais explicitement contrat 1 lorsque leur objet est la compatibilité legacy. Tests de fondations adaptés au défaut courant 2 ; test moteur compare les vrais parents/journal/reçus avant/après, au lieu de supposer globalement un monde v1 vide. Aucune attente métier R1–R4 affaiblie. Aucun test frontend/source/UI modifié.

## 9. Conservation des données et nettoyage

Snapshots avant/après de **toutes les lignes public/private**, utilisateurs/sessions Auth, ACL de tables/colonnes, RLS/policies, vues, corps et ACL des fonctions existantes. Chaque table comparée par nombre et MD5 du JSONB de toutes ses colonnes, lignes triées ; fonctions comparées individuellement, avec seulement l’insertion 2/0 automatique et le rendu de conflit des trois writers autorisés à différer.

| Données | Avant = après | Empreinte MD5 identique |
|---|---:|---|
| `public.collections` | **4** | `c56e6bb565e69a361b2efb0c68fadd3e` |
| `public.collection_items` | **660** | `73d33bb3ba435b6daba15008376109c1` |
| `public.catalog_variants` | **31 904** | `340e5ae3aad2633ab1a513538c293b38` |
| `public.physical_copies` | **3** | `1639a715f67e664bff99396b0ce39771` |

Les quatre parents restent contrat 1/révision zéro ; 660 introductions NULL, journal et reçus utilisateur vides. IDs, positions, origines, rangs, versions appliquées, dates, notes, préférences et partages intacts. Snapshot final PASS après suites et suppression des seules fixtures synthétiques. Sessions navigateur d’audit fermées, fichiers privés temporaires d’authentification supprimés ; serveur Vite lancé pour l’audit arrêté, Supabase Local conservé en fonctionnement.

Traces locales ignorées dans `.cache/phase8b8/` : `before.json`/`after.json`, logs DB/frontend/concurrence/API/lint/advisors/build/types, états navigateur intermédiaires/final, requêtes/relectures, événements tactiles et captures `free-desktop.png`/`shared-mobile.png`. Elles constituent des artefacts d’audit Local, sans secret Auth dans les fichiers versionnés. Les tests SQL/HTTP et l’extension du script de création concurrente sont versionnés pour reproduction.

## 10. Version, documentation et conclusion

`package.json` et `package-lock.json` synchronisés de **0.8.6 à 0.8.7**, dépendances et outillage identiques. README et références 01/03/05/06/08 mis à jour : activation des nouveaux parents seulement, conservation legacy, bloc 8B livré/validé Local, limites de reprise, actualisation/masquage/notifications futurs, 8C prochaine étape et absence de déploiement Cloud Phase 8. Roadmap conservée au niveau macro ; rapports historiques préservés.

**Clôture 8B Local acquise.** Aucun problème bloquant restant dans le périmètre testé. Les limites du même onglet et du stockage corrompu n’introduisent aucun retry silencieux, corruption ou duplication dans les scénarios exercés ; ergonomie de récupération entre onglets et validation sur matériel tactile physique demeurent des limites documentées. Arrêt à **8B.8** ; 8C non commencé, aucun reset, conversion de données utilisateur, commit, push ou déploiement.
