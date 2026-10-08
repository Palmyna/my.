# Phase 8A.3 — Architecture et contrats techniques

Date : **8 octobre 2026**. Version applicative conservée : **0.7.21**.

## Statut et périmètre

**Conception documentaire, à valider avant développement.** R1–R4 sont des décisions métier explicitement validées par le propriétaire, désormais acquises. Les structures, noms et signatures ci-dessous constituent la recommandation technique 8A.3 ; ils ne décrivent aucune fonctionnalité livrée ni migration appliquée. Arrêt à 8A.3 ; aucun développement 8B à 8H autorisé par ce rapport.

Le [rapport 8A.2](2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md) reste inchangé : ses formulations « recommandation à valider » retracent son état historique, antérieur à la validation propriétaire. Son algorithme et ses 36 scénarios deviennent la référence sous les quatre décisions validées.

## 1. État initial et sources inspectées

| Contrôle | Constat pendant 8A.3 |
|---|---|
| Branche / HEAD | `dev` / `ab35b8f3cc5a6af4b1eb1322121e0d7b06d4f8ae` |
| Dernier commit réel | `Create 2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md` |
| Git initial | Arbre propre, aucun fichier staged ni modification préexistante |
| Consignes | `AGENTS.md` lu ; seul fichier de ce nom trouvé dans le dépôt |
| Application | `package.json` : `0.7.21`, conservée |
| Preuve | Inspection de fichiers uniquement ; aucune lecture/écriture de base Local ou Cloud |

Références examinées : [Fonctionnalités](../01-FEATURES.md), [Modèle](../03-DATA-MODEL.md), [UX/UI](../04-UX-UI.md), [Architecture](../05-ARCHITECTURE.md), [Database](../06-DATABASE.md), [Roadmap](../08-ROADMAP.md), sections pertinentes du [pipeline](../07-CATALOG-SYNC.md), et lecture intégrale du rapport 8A.2.

| Responsabilité livrée | Sources inspectées et conséquence |
|---|---|
| Schéma, identité, droits | [Sécurité Phase 1](../../supabase/migrations/20260906082313_phase1_security.sql), [Auth Phase 3A](../../supabase/migrations/20260909184529_phase3a_auth_identity.sql), [types générés](../../src/types/database.generated.ts). UUID utilisateur/item ; BIGINT catalogue/version ; MFA `aal2`, profil présent, propriété, RLS et grants étroits. Écriture directe des items fermée. |
| Canonique / création | [Canonique](../../supabase/migrations/20260920134607_phase5_canonical_collection_structure.sql), [création](../../supabase/migrations/20260920140934_phase5_create_automatic_collection.sql), assertions [010](../../supabase/tests/database/010_canonical_collection_structure.test.sql) / [011](../../supabase/tests/database/011_create_automatic_collection.test.sql). Canonique unique et rangs continus ; création sous verrou catalogue partagé `771402`, hash contrôlé ; refus d'une nouvelle cible vide. |
| Writers | [Reorder](../../supabase/migrations/20260923195220_phase6a3_reorder_collection_item.sql), [ajout/retrait](../../supabase/migrations/20260926070705_phase6c1_manual_collection_items.sql), assertions [014](../../supabase/tests/database/014_collection_reorder.test.sql) / [016](../../supabase/tests/database/016_manual_collection_items.test.sql). Verrou parent `FOR UPDATE`, `READ COMMITTED`, positions exactes ; aucun journal. Retrait actuel sans compaction, copies intactes. |
| Lecteurs / progression | [Contrat final 7F.1](../../supabase/migrations/20261007085921_phase7f1_navigation_contracts.sql), [identité 7D.5](../../supabase/migrations/20261005181925_phase7d5_collection_identity.sql), [service Collections](../../src/services/collections.ts), [contenu](../../src/services/collection-content.ts), [types de contenu](../../src/types/collection-content.ts). Contenu JSON à 15 clés, décodeur strict ; Dashboard et overview partagent la vue invoker et les mêmes comptes. |
| Synchronisation | [CLI catalogue](../../scripts/catalog/cli.ts), [plan](../../scripts/catalog/plan.ts), [application](../../scripts/catalog/apply.ts). Transaction, verrou exclusif `771402`, puis verrous des tables catalogue ; version +1 seulement si hash des IDs ordonnés change. Aucun writer de collection dans la sync. |
| Services / cache | [Items](../../src/services/collection-items.ts), [types](../../src/types/collection-items.ts), [clés](../../src/features/collections/collection-query.ts), [hook reorder](../../src/features/collections/useCollectionItemReorder.ts). Destinations logiques, BIGINT exacts, erreurs sûres, relecture après succès ou erreur, pas de retry automatique. |
| Vues / gestes | [Contenu commun](../../src/features/collections/CollectionContentView.tsx), [DnD](../../src/features/collections/CollectionItemReorderList.tsx), [Classeur](../../src/features/collections/useBinderNavigation.ts), [progression](../../src/features/collections/CollectionProgress.tsx), [routes](../../src/app/AppRoutes.tsx). DnD vers le haut = avant ancre visible, vers le bas = après ; recherche partielle bloque ; Classeur consultatif. Aucune route changelog livrée. |
| Assertions frontend | [Items](../../src/services/collection-items.test.ts), [contenu](../../src/services/collection-content.test.ts), [hook](../../src/features/collections/useCollectionItemReorder.test.tsx), [Cartes](../../src/features/collections/CollectionCardsReorder.test.tsx), [Classeur](../../src/features/collections/CollectionContentBinder.test.tsx). Requêtes logiques, refus des champs supplémentaires/doublons, lectures autoritatives, session/navigation, recherche conservant les pochettes. Inspection, aucune exécution de suite. |

Documentation publique consultée via Context7 : [Supabase — fonctions et sécurité](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [TanStack Query v5 — invalidations](https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations). Ces sources confortent `INVOKER` pour les lectures ordinaires, les contrôles explicites et grants restreints des `DEFINER`, et les invalidations attendues après mutation. Elles ne prouvent aucun état déployé de MY.

## 2. Confirmation des décisions R1–R4

| Décision validée | Contrat obligatoire |
|---|---|
| **R1 — contexte du geste** | À chaque déplacement accepté, enregistrer avant/ancre ou fin, et le suffixe historique strictement après l'ancre, extrait de l'ordre complet autoritatif **juste avant le geste**, sujet exclu. Automatiques, manuels et masqués inclus. Premier successeur encore présent → ancre de repli ; aucun → fin. Contexte immuable, jamais recalculé à l'actualisation. |
| **R2 — masqués** | Geste avant B → réellement avant B ; après A → avant son successeur dans l'ordre complet après extraction du sujet, sinon fin. Seul le sujet bouge ; retirer le sujet des séquences avant/après donne la même liste. `A H B C`, H masquée, C avant B → **`A H C B`**. Recherche textuelle partielle continue de bloquer. |
| **R3 — cycle de vie** | Retrait réel → disparition des intentions propres et du masquage de cet item. Réintroduction → nouvel UUID, aucun rattachement par variante aux anciennes intentions. Conversion manuel → automatique → même UUID et mêmes intentions ; visible par défaut puisque le manuel n'était pas masquable. Copies et notes globales conservées. Garder uniquement les références historiques nécessaires aux intentions des sujets vivants. |
| **R4 — absence d'effet / retry** | Annulation ou séquence inchangée → aucune intention ni nouvel ordre chronologique métier. Retry du même UUID d'opération → même résultat enregistré, jamais second geste. Ajout manuel → placement initial toujours enregistré, même fin par défaut ou collection vide. |

Toutes les intentions d'un sujet vivant restent chronologiques : aucune compression au dernier déplacement. S08 interdit cette simplification. S35 interdit le rejeu sur l'ordre déjà personnalisé au lieu d'une reconstruction depuis la base canonique.

## 3. Architecture cible recommandée

Conserver PostgreSQL comme propriétaire de l'ordre et des mutations. Ajouter un journal d'intentions et des reçus d'opération privés. Les lecteurs restent fondés sur **un seul ordre affiché matérialisé**, `collection_items.sort_position, id`. Le canonique et le journal sont les entrées de reconstruction, jamais deux lecteurs concurrents d'ordre pour les vues.

| Champ existant | Rôle conservé |
|---|---|
| `sort_position NUMERIC(40,20)` | Unique ordre affiché complet. Gestes : midpoint/rééquilibrage existants réutilisés. Application d'actualisation : matérialisation de la permutation calculée en `1…N`. Aucun nombre de position dans le contrat client. |
| `automatic_rank BIGINT` | Canonique de la version **réellement appliquée**, indépendant des gestes. Mettre à jour seulement à la création/actualisation. Permet de reconstituer l'ancien canonique sans historique global des versions catalogue. |
| `origin` | `manual` ou `automatic`, déterminé par les writers. Conversion change origine/rang, conserve UUID et intentions. Retrait automatique reste exclusivement structurel. |

Une fonction interne de calcul, sans écriture ni allocation d'UUID, réalise exactement `FUSIONNER` de 8A.2. Aperçu et application appellent cette même fonction avec un canonique cible vérifié, l'univers complet et le journal. Pas de service de tri frontend, de graphe de contraintes ou de moteur par vue.

Les gestes ordinaires continuent d'extraire/insérer dans l'ordre matérialisé courant. Le retrait manuel conserve l'ordre relatif des autres items et ne compacte pas, comme aujourd'hui ; il supprime les intentions de son sujet. Le journal restant sera reconstruit lors de la prochaine actualisation, avec les replis alors applicables. On ne rejoue pas toutes les intentions sur la séquence courante après chaque geste ou retrait.

## 4. Modèle persistant projeté

Noms recommandés pour les migrations futures. Aucun de ces ajouts n'existe au HEAD inspecté.

### 4.1 Collections, items et journal

| Structure | Champs / contraintes recommandés |
|---|---|
| `collections` | Ajouter `personal_revision BIGINT NOT NULL DEFAULT 0 CHECK >= 0` et `order_contract_version SMALLINT NOT NULL`, `CHECK IN (1,2)` : 1 = legacy sans journal complet ; 2 = nouveau contrat. Valeur imposée côté serveur, non modifiable par le navigateur. |
| `collection_items` | Ajouter `introduced_revision BIGINT NULL` pour le placement initial manuel ; strictement positive si présente, conservée lors d'une conversion. Ajouter `is_hidden BOOLEAN NOT NULL DEFAULT false`, voir section 7. Un manuel d'une collection v2 a obligatoirement une révision d'introduction et une intention initiale ; invariant contrôlé transactionnellement. |
| `private.collection_order_intents` | `collection_id UUID`, `sequence BIGINT > 0`, `operation_id UUID`, `subject_item_id UUID`, `kind TEXT CHECK IN ('manual_add','move')`, `destination TEXT CHECK IN ('before','end')`, `anchor_item_id UUID NULL`, `fallback_item_ids UUID[] NOT NULL`, `accepted_at TIMESTAMPTZ`. PK `(collection_id,sequence)`, UNIQUE `(collection_id,operation_id)`. |
| Références du journal | FK parent `ON DELETE CASCADE` ; FK composite sujet `(collection_id,subject_item_id)` vers les items, `ON DELETE CASCADE`, nécessitant UNIQUE `(collection_id,id)` sur les items. Index `(collection_id,subject_item_id)` pour retrait. Ancre et suffixe sont des **UUID historiques sans FK vers les items vivants**. Leur disparition doit préserver le repli. |

Pour `end`, ancre NULL et suffixe vide. Pour `before`, ancre non NULL, distincte du sujet ; suffixe ordonné sans NULL, doublon, sujet ni ancre. Writer seul construit ce suffixe ; jamais fourni par le client. Validation du même parent et de l'existence au moment d'acceptation ; une référence historique ensuite absente reste légitime. Aucun lookup dans une autre collection pour résoudre une ancienne ancre. L'invariant manuel vivant v2 ↔ placement initial est vérifié en fin de transaction par contrainte différée, afin d'autoriser insertion de l'item puis du journal dans la même transaction ; retrait/cascade et conversion doivent être couverts.

Sous verrou parent, chaque mutation effective d'ordre/univers/masquage/version appliquée incrémente une seule fois `personal_revision`. Sa nouvelle valeur devient `sequence` si elle crée une intention, et `introduced_revision` pour l'ajout manuel. Les trous dus aux autres mutations sont normaux. Ordre total **par collection**, conforme à l'ordre d'acceptation transactionnel ; timestamp et UUID ne servent pas de départage chronologique. Deux collections indépendantes n'ont pas besoin d'une chronologie globale.

Reorder sans changement de permutation : pas d'intention ni incrément métier. Un éventuel rééquilibrage purement numérique ne transforme pas ce cas en geste. Masquage déjà dans l'état demandé : même règle. Ajout, retrait et application effective incrémentent la révision. Renommage, lecture, préférences, copies et notes ne l'incrémentent pas : ils ne changent pas les entrées structurelles de l'aperçu.

Journal commun aux collections v2 pour réutiliser les writers ; les collections personnalisées n'ont aucune actualisation canonique. Les manuels vivants hors canonique sont initialisés par `introduced_revision` croissante, puis leurs placements rejoués. Les manuels convertis gardent cette information et leur journal, bien qu'ils appartiennent désormais à la base canonique.

### 4.2 Reçus et idempotence technique

`private.collection_operation_receipts` : `collection_id UUID` FK cascade, `operation_id UUID`, `kind TEXT` limité à `move/add/remove/hide/apply`, `request_hash TEXT` SHA-256, `accepted_revision BIGINT`, `result JSONB`, `accepted_at TIMESTAMPTZ`. PK `(collection_id,operation_id)`. Le résultat minimal contient l'issue, la révision acceptée et les identités nécessaires à retrouver un ajout/application. Aucun contexte d'ancre, note ou exemplaire dans ce reçu.

Le client crée un UUID par **nouvelle action** et conserve UUID et paramètres exacts tant que le résultat réseau reste incertain. Même UUID + même requête → retourner le reçu avant contrôle de la révision attendue ; même UUID + autre requête → conflit explicite. L'empreinte porte sur les paramètres métier validés, y compris révision/token attendus, sérialisés canoniquement par le serveur, pas sur un JSON brut à ordre de clés variable. Ne pas recalculer une destination normalisée pour identifier un retry.

Autorisation actuelle et parent existant restent obligatoires avant de retourner un reçu. Reçu et mutation sont engagés dans la même transaction ; rollback → aucun reçu de succès. Un succès sans effet a un reçu mais aucune intention. Les échecs ne sont pas mémorisés comme succès. Un retrait retenté avec son UUID réussi retourne son reçu même si l'item est absent ; une nouvelle opération sur cet item absent reste refusée.

Reçus conservés pendant la vie de la collection pour garantir les reprises, sans fenêtre arbitraire de retry. Ils ne restaurent aucune personnalisation. Quand un item est retiré, supprimer ses intentions ; garder dans les intentions d'autres sujets vivants leurs UUID historiques immuables. Aucun tombstone d'item, historique de masquage ou journal destiné à restaurer un item supprimé. Suppression du parent → cascade journal, reçus et suivi de notification ; copies/notes non concernées.

## 5. Contrats de réordonnancement et mutations

Suffixe `_v2` recommandé pour une coexistence explicite des signatures ; aucun overload PostgREST ambigu avec des paramètres par défaut.

### 5.1 Interfaces publiques projetées

Tous les retours métier sont des JSONB stricts. UUID = string ; BIGINT et révisions = **chaînes décimales** exactes, jamais `Number`. `MutationResult` contient exactement `operation_id`, `outcome` (`changed` ou `noop`), `personal_revision`, `collection_item_id` (UUID ou NULL). La répétition retourne ce même résultat historique ; elle ne prétend pas décrire le contenu actuel, à relire.

| RPC recommandée | Paramètres | Responsabilité |
|---|---|---|
| `reorder_collection_item_v2` | `p_collection_id UUID`, `p_item_id UUID`, `p_placement TEXT`, `p_anchor_id UUID NULL`, `p_expected_revision BIGINT`, `p_operation_id UUID` | Propriétaire, v2, révision attendue ; normaliser puis déplacer seul sujet, journaliser seulement si permutation change. |
| `add_manual_collection_item_v2` | `p_collection_id UUID`, `p_variant_id BIGINT`, `p_placement TEXT`, `p_expected_revision BIGINT`, `p_operation_id UUID` | Placement `start/end` uniquement, fin par défaut choisie par le service ; mêmes critères d'éligibilité 6C.1, aucune restriction automatique supplémentaire. UUID neuf, origine manuelle, rang NULL, visible ; intention initiale toujours créée. |
| `remove_manual_collection_item_v2` | `p_collection_id UUID`, `p_collection_item_id UUID`, `p_expected_revision BIGINT`, `p_operation_id UUID` | Refus automatique ; retirer seulement ce manuel, ses intentions propres et son état de masquage ; autres positions intactes, reçus techniques conservés. |
| `get_collection_operation_result` | `p_collection_id UUID`, `p_operation_id UUID` | Propriétaire seul ; reçu strict ou NULL si aucun succès engagé. Permet de résoudre une réponse perdue ; NULL n'autorise pas à créer un nouvel UUID pour réessayer la même action. |
| `get_collection_content_v2` | `p_collection_id UUID` | `SECURITY INVOKER`, snapshot unique : NULL si invisible, sinon `{order_contract_version, personal_revision, items}`. `items` = 15 clés 7F.1 + `is_hidden BOOLEAN`, en ordre complet `sort_position,id`. Collection vide visible → objet avec tableau vide. |

`get_collection_content` à 15 clés et `get_collection_item_order` restent compatibles en lecture. Le nouveau contenu est l'évolution du lecteur existant, pas une seconde implémentation métier : même sélection/jointures/ordre/possession, projections contractuelles adaptées. Le hook réutilise les clés de contenu/ordre existantes avec un marqueur de version du payload lors du basculement, ou purge ciblée du cache ; jamais mélange d'enveloppe v2 et tableau v1 sous une même clé persistante. **Séquence B/C :** B livre déjà l'enveloppe et les 16 clés v2 avec `is_hidden=false` produit comme constante SQL ; C ajoute la colonne et remplace cette constante par sa valeur persistée, sans nouvelle forme JSON ni colonne de masquage implémentée prématurément en B.

### 5.2 Normalisation autoritative

Lire la séquence complète sous verrou, retirer logiquement le sujet, puis :

| Geste reçu | Destination persistée |
|---|---|
| `start`, ancre NULL | Avant premier élément restant, ou fin si aucun. |
| `end`, ancre NULL | Fin explicite, suffixe vide. |
| `before`, ancre présente distincte | Avant cette ancre. |
| `after`, ancre présente distincte | Avant son successeur complet après extraction du sujet, ou fin. |

Capture R1 dans l'ordre **avant** déplacement, depuis l'ancre normalisée ; pour ajout, ordre avant introduction. `after A` dont le successeur était le sujet recherche le prochain voisin après extraction. Valider paramètres incompatibles, sujet/ancre absents ou hors parent, auto-ancre et révision obsolète avant écriture.

DnD Liste/Cartes transmet ses ancres visibles actuelles, comme livré : mouvement haut → `before`, bas → `after`. Le serveur ignore tout indice filtré. Début/fin explicites restent structurels. Sous `Non masquées`, première/dernière visible ne sont pas nécessairement les extrémités complètes. Pas de déplacement d'un bloc, pas de positions absolues gelées pour les masqués.

## 6. Détection, aperçu et application

### 6.1 Détection sans mutation

`get_collection_update_status(p_collection_id UUID)` → objet strict `{collection_id, order_contract_version, applied_target_version, target_version, target_hash, update_available}` pour le propriétaire d'une collection automatique ; erreurs sûres sinon. Versions/hash proviennent de l'état courant et de la version réellement appliquée, pas de dates descriptives.

Comparer d'abord `applied_target_version < generation_version`. Les automatiques matérialisés, triés par `automatic_rank`, suffisent à reconstituer la liste canonique appliquée. Aucun snapshot de chaque ancienne version catalogue à stocker. Si la version a avancé mais que cette liste est de nouveau exactement celle de la cible, aucune différence structurelle utile ne reste : notification obsolète, `update_available=false`, sans modifier silencieusement `applied_target_version`. Ce contrôle se fait sur IDs ordonnés/hash, pas sur les positions personnelles ni les manuels.

État de cible absent, version régressée ou hash incompatible avec le canonique courant → erreur d'intégrité assainie, jamais fabrication d'état. Une modification de nom/image/rareté sans changement de liste ordonnée ne produit aucune actualisation ni notification. La sync conserve ses responsabilités et ne touche aucun item ou état de lecture individuel.

### 6.2 Aperçu pur et token de confirmation

`preview_collection_update(p_collection_id UUID)` → JSONB strict, propriétaire automatique v2 uniquement. Fonction transactionnelle `VOLATILE` à cause des verrous, **sans écriture**, sans journaliser de geste, sans créer d'item ni marquer automatiquement lue une notification par simple préchargement.

| Champ de retour | Format et sens |
|---|---|
| `collection_id` | UUID |
| `token` | `{contract_version:1, applied_target_version:string, target_version:string, target_hash:string, personal_revision:string, plan_hash:string}` |
| `update_available`, `target_empty` | booléens |
| `added` | Liste `{variant_id:string, automatic_rank:string}` ; nouveaux automatiques, hors conversions. |
| `removed` | Liste `{collection_item_id:UUID, variant_id:string, automatic_rank:string}` ; automatiques quittant l'univers. |
| `converted` | Liste `{collection_item_id:UUID, variant_id:string, automatic_rank:string}` ; même identité, ancienne origine manuelle. |
| `rank_changes` | Liste `{collection_item_id:UUID, variant_id:string, previous_rank:string, next_rank:string}` pour automatiques conservés dont le rang change. |
| `final_order` | Séquence complète `{collection_item_id:UUID ou NULL, variant_id:string, origin:'manual' ou 'automatic', automatic_rank:string ou NULL, is_hidden:boolean}`. NULL seulement pour un nouvel automatique non encore créé. |

Les listes de changements suivent l'ancien rang pour les retraits et le rang cible pour ajouts/conversions/changements de rang ; séquence finale suit le résultat du calcul. Identités/variantes uniques et classifications disjointes. Le delta de position affichée se déduit de l'ordre actuel chargé et de `final_order` ; aucun second algorithme de tri. La trace détaillée des replis reste interne aux tests, sans payload public volumineux ajouté pour diagnostic.

Nouveaux items représentés par leur variante exacte pendant le calcul. Pas d'UUID aléatoire dans le tri ni de réservation persistée pendant l'aperçu. L'application alloue une fois les UUID, conserve les identités existantes et retourne la correspondance pour les nouveaux ; le reçu garantit leur stabilité après retry. « Aperçu identique à l'application » signifie même permutation de variantes, mêmes identités conservées/converties, mêmes origines/rangs/masquages et mêmes deltas.

Token **sans table de previews** : le serveur recalcule et compare les six champs. `plan_hash` = SHA-256 d'une sérialisation canonique versionnée du plan structurel ci-dessus, incluant la séquence finale et les identités existantes, sans labels, exemplaires, notes ou UUID nouveaux. Pas de délai d'expiration inventé : changement pertinent → token obsolète. Ce token n'est pas une autorisation ; aucune confiance dans un ordre ou delta fourni par le client, aucune signature secrète frontend nécessaire.

### 6.3 Application atomique

`apply_collection_update(p_collection_id UUID, p_preview_token JSONB, p_operation_id UUID)` → `{operation_id, outcome:'applied', personal_revision:string, applied_target_version:string, created_items:[{variant_id:string,collection_item_id:UUID}]}`. Refuser un nouveau geste d'application sans actualisation disponible ; un retry reconnu retourne toujours son reçu.

Transaction recommandée :

1. Contrôler identité/MFA/profil ; verrou catalogue partagé **avant** verrou parent `FOR UPDATE` ; vérifier propriété, type automatique et contrat v2.
2. Chercher le reçu du même UUID, vérifier empreinte ; s'il existe, le retourner sans réappliquer ni exiger que sa vieille révision soit encore courante.
3. Relire état catalogue et parent après attente ; comparer version appliquée, version/hash cible, révision personnelle et version du calcul au token.
4. Appeler une fois le canonique, contrôler son hash avec `automatic_target_states`, puis le même calcul que l'aperçu ; comparer `plan_hash`.
5. Convertir les manuels ciblés sans doublon ; allouer les nouveaux automatiques ; retirer les automatiques absents et leurs intentions propres ; garder les contextes historiques des sujets vivants.
6. Fixer les rangs depuis le canonique cible, le masquage selon les règles, puis matérialiser l'ordre final complet en positions exactes `1…N`.
7. Mettre à jour `applied_target_version`, incrémenter `personal_revision`, enregistrer le reçu. L'événement de notification dérivé devient traité par cette version appliquée **dans ce même commit**.

Tout échec annule conversions, ajouts, retraits, rangs, positions, version, révision et reçu. Aucune écriture dans `physical_copies`, notes, catalogue ou autres collections. La contrainte UNIQUE `(collection_id,variant_id)` reste arbitre final.

| Cas | Résultat obligatoire |
|---|---|
| Cible devenue vide | Aperçu explicite de tous les retraits ; application autorisée après validation, manuels restants conservés. Collection existante maintenue, éventuellement vide. La création automatique d'une nouvelle cible vide reste refusée. |
| Collection supprimée entre aperçu et validation | Même indisponibilité que collection inaccessible ; aucun item recréé, aucun reçu retourné sans parent autorisé. |
| Catalogue changé depuis aperçu | Refus `preview_stale`, sans appliquer une version plus récente silencieusement ; nouvel aperçu requis. |
| Reorder / ajout / retrait / masquage / autre application concurrente | Révision différente → `preview_stale` ; autre geste v2 à ancienne révision → `collection_structure_conflict`. |
| Changement de copie, note, nom ou préférence | Ne périme pas un plan purement structurel ; relectures normales actualisent la présentation/progression. Ne pas afficher ces valeurs comme figées par le token. |
| Réponse d'application perdue | Consulter le reçu ou renvoyer UUID/token identiques ; aucun nouveau journal ni UUID d'item. |

## 7. Masquage, progression et vues

### 7.1 Donnée et mutation

`is_hidden` appartient au seul item. CHECK local `NOT is_hidden OR origin='automatic'` ; contrôle du parent automatique par trigger d'invariant, prolongement du contrôle d'origine existant. Index existant `(collection_id,sort_position,id)` suffisant : pas de nouvel index booléen isolé, ni de positions visibles stockées.

`set_collection_item_hidden(p_collection_id UUID, p_collection_item_id UUID, p_is_hidden BOOLEAN, p_expected_revision BIGINT, p_operation_id UUID)` → `MutationResult`. Propriétaire automatique v2, item automatique dans ce parent ; NULL et manuel refusés. Verrou parent, reçu, comparaison révision, écriture uniquement du booléen/révision ; pas d'intention ni changement d'ordre. Demander l'état déjà enregistré → reçu `noop`. Copies/notes intactes. Nouveaux automatiques et convertis → false ; maintenus → valeur conservée.

### 7.2 Progression autoritative coordonnée

Dans la vue invoker `dashboard_collections`, modifier **les deux agrégats avec le même prédicat** : compter les items tels que `NOT (origin='automatic' AND is_hidden)`. Numérateur : ce sous-ensemble ayant un `EXISTS` de copie pour `collections.owner_id`. Copies multiples → un seul item possédé ; manuels toujours inclus. Overview et Dashboard réutilisent cette vue, et partages les copies du propriétaire sous RLS, jamais celles du destinataire.

Ne pas changer `owned` dans les lignes du contenu : une automatique masquée possédée reste possédée et consultable sous `Toutes`. Pas de compteur parallèle frontend. Total nul → `0 / 0`, pas de division. Le texte adapté au cas « tous les automatiques masqués » reste une finition UX à valider ; le rendu livré « Collection vide » ne suffit pas à décrire ce cas.

Livrer la mutation de masquage, les deux agrégats et le lecteur v2 de façon coordonnée en 8C, puis les filtres/actions en 8D. Avant 8D, aucune action de masquage exposée dans l'UI. Une lecture partagé révoquée reste refusée par les policies existantes.

### 7.3 Séquence de consultation

Dans le propriétaire commun `CollectionContentView`, dériver une séquence de visibilité depuis le contenu complet ordonné, puis les correspondances textuelles depuis cette séquence. `Non masquées` exclut `is_hidden`, `Toutes` garde tout. Le filtre est un état de consultation, pas une nouvelle préférence persistée non cadrée.

Liste/Cartes rendent les correspondances textuelles ; reorder bloqué seulement si la **recherche** retire des items de la séquence du filtre choisi. Le masquage seul ne bloque pas. Masquer un item affiché peut retirer son contrôle du DOM : restituer le focus à un contrôle stable selon les patterns existants ; pas de succès confirmé avant relecture.

Classeur reçoit la séquence de visibilité comme base de `binderPages`, puis les correspondances comme occurrences/halo. Compactage uniquement après masquage ; aucune compaction supplémentaire par recherche. Formats `2x2/3x3/4x3`, pages/occurrences recalculées, page bornée après exclusion, aucune écriture de positions. Pas d'œil ni reorder Classeur. Partage : mêmes filtres et progression, aucune mutation ni aperçu/application propriétaire.

## 8. Notifications et publication

### 8.1 Modèle simple, sans diffusion massive

| Structure privée projetée | Champs et contraintes |
|---|---|
| `collection_notification_reads` | `collection_id UUID PRIMARY KEY` FK cascade, `read_target_version BIGINT > 0`, `read_at TIMESTAMPTZ`. Propriétaire dérivé du parent, aucun `user_id` redondant ni destinataire partagé. Une ligne seulement après lecture explicite. |
| `notification_announcements` | `id UUID PK`, `publication_key TEXT UNIQUE`, `category TEXT CHECK IN ('changelog','announcement')`, `title TEXT`, `body TEXT`, `app_version TEXT NULL`, `action JSONB NULL`, `requires_action BOOLEAN`, `include_new_users BOOLEAN DEFAULT false`, `published_at TIMESTAMPTZ`, `expires_at TIMESTAMPTZ NULL`, `withdrawn_at TIMESTAMPTZ NULL`, `content_hash TEXT`, `published_by TEXT`, `publication_context JSONB` strict pour justification d'audience et condition de résolution validée. Changelog exige une version valide ; titre/corps non vides, limites de taille validées dans le contrat du script. |
| `notification_announcement_states` | `user_id UUID` FK profil cascade, `announcement_id UUID` FK cascade, `read_at TIMESTAMPTZ NULL`, `processed_at TIMESTAMPTZ NULL`. PK `(user_id,announcement_id)` ; traité exige lecture. Absence de ligne = non lu. |

Index journal/reçus décrits section 4 ; pour annonces, `(published_at DESC,id)` et index du suivi par utilisateur déjà couvert par sa PK. Pas d'index sur états booléens isolés. Pas de table générique polymorphe regroupant tous les événements ni de copies de chaque annonce par utilisateur.

**Collection : événement dérivé**, clé stable `collection:<UUID>`, révision = version cible courante. Actif pour le seul propriétaire d'un parent automatique **v2** si différence structurelle utile non appliquée, selon section 6. Les parents de test legacy restent hors parcours de notification/action Phase 8 tant qu'ils ne sont pas recréés ; le statut expose leur mode sans les mettre à niveau. Une seule projection par collection, donc aucun doublon à la sync. Texte/lien dérivés du parent actuel ; timestamp d'évolution = état cible. Lecture absente ou `read_target_version < target_version` → non lu ; sinon lu non traité. Nouveau changement → nouvelle version et retour non lu **sans écriture de masse**. Version appliquée → traité, exclu. Collection supprimée ou delta devenu nul → obsolète, exclu. L'état lu ancien peut demeurer pour empêcher un reset gratuit ; aucun item de notification historique à restaurer.

**Annonce : contenu partagé, réception dérivée.** Dans le lecteur contrôlé, vérifier la date d'inscription serveur `auth.users.created_at` du seul appelant : antérieure ou égale à `published_at` → éligible, même s'il était déconnecté. La création tardive d'un profil MY. ne change pas cette date. `include_new_users=true` étend explicitement l'éligibilité tant que l'annonce est active ; réservé à une annonce importante encore actuelle, avec justification opérateur. Pas de requête/écriture de diffusion à tous les comptes, pas de trigger d'inscription. Expirée/retirée → obsolète ; traitée → exclue. Un nouvel utilisateur sans exception ne reçoit pas les anciennes annonces. Date d'inscription jamais fournie par le client ni exposée dans le retour.

### 8.2 Interfaces et transitions

| RPC projetée | Paramètres / retour | Règle |
|---|---|---|
| `get_notification_center` | `p_limit INTEGER`, `p_cursor JSONB NULL` → `{items, unread_count:string, next_cursor:objet ou NULL}` | Snapshot unique, items actifs triés `(updated_at DESC,notification_key)` ; pagination par curseur strict, compteur total non limité à la page. Limite maximale technique 50, défaut service 20. |
| `get_notification_unread_count` | Aucun paramètre → `{unread_count:string}` | Même prédicat d'éligibilité/activité/lecture que le centre, pour le badge sans charger les corps. |
| `get_notification_content` | `p_announcement_id UUID` → contenu strict ou indisponibilité sûre | Corps de l'annonce/changelog à consulter dans le centre ; ne suppose aucune route changelog déjà livrée. Aucune mutation implicite lors d'un prefetch. |
| `mark_notification_read` | `p_notification_key TEXT`, `p_observed_revision TEXT` → `{outcome:'recorded' ou 'obsolete'}` | Écriture uniquement du suivi de l'appelant. Collection : version observée positive ≤ version cible ; enregistrer monotonement la version effectivement présentée, jamais une version nouvelle non vue. Annonce immuable : révision = `content_hash`. |
| `process_announcement_notification` | `p_announcement_id UUID`, `p_observed_hash TEXT` → même issue | Annonce ordinaire consultée : lire et traiter ensemble, idempotent. Annonce exigeant une action : traitement uniquement selon une condition de résolution explicitement cadrée pour cette publication. Aucun endpoint générique ne traite une collection. |

Item du centre : union discriminée stricte. Champs communs `notification_key`, `kind` (`collection_update/changelog/announcement`), `revision`, `state` (`unread/read`), `title`, `updated_at`, `action`. Variante collection : `collection_id`, `applied_target_version`, `target_version`. Variante annonce : `announcement_id`, `app_version` nullable, `requires_action`. Aucun état traité/obsolète retourné parmi les items actifs. Les lecteurs réutilisent un même prédicat interne, pour que le badge et le centre concordent au même snapshot.

Actions validées : collection → `{kind:'collection_preview',collection_id}` ; annonce/changelog → `{kind:'notification_content',announcement_id}` ; lien complémentaire optionnel → navigation interne typée vers une route MY. autorisée. Pas de HTML exécutable ni d'URL arbitraire, `javascript:` ou secret. Réutiliser les liens natifs et les contrôles indépendants déjà livrés.

Après affichage réussi de l'aperçu, le frontend appelle `mark_notification_read` avec **sa** version cible. Préchargement, aperçu échoué ou panneau fermé avant consultation → aucune lecture automatique. Si v3 arrive pendant consultation de v2, seul v2 est acquitté ; v3 reste non lu. Application v2 refusée si cible v3 ; application réussie traite l'événement par la version appliquée. Un marquage manuel lu ne valide ni aperçu ni application. Reprises de suivi monotones : ne pas effacer `processed_at`, conserver les dates déjà acquittées pour la même révision ; `read_at` de collection évolue seulement si sa version lue avance. Revalider activité/éligibilité lors de l'écriture ; une notification disparue entre lecture et acquittement produit `obsolete` sans la ressusciter.

Pas de Realtime, Cron ou worker de diffusion nécessaire : disponibilité correcte dès la prochaine lecture, même après déconnexion. Rafraîchir à connexion, ouverture du centre, retour de focus et après actions ; cadence de polling éventuelle encore à valider. Pagination est une lecture vivante : une sync entre deux pages peut déplacer un événement ; dédupliquer par clé et rafraîchir la tête, sans prétendre figer toute la navigation au premier snapshot.

### 8.3 Publication sécurisée

Recommander un script Node utilisant `pg` déjà installé et une connexion PostgreSQL privilégiée **dédiée à la publication**, hors navigateur. Rôle `my_notification_publisher` sans privilèges catalogue/utilisateurs : accès de connexion, USAGE nécessaire et EXECUTE sur `private.publish_notification_announcement` / `private.withdraw_notification_announcement` seulement. Aucun DML direct, accès `auth.users`, rôle `BYPASSRLS` ou clé `service_role` nécessaire à ce script. Provisionner le secret de connexion hors Git par l'opérateur, TLS vérifié pour une connexion distante ; pas de secret dans les migrations, logs, arguments de processus ou variables `VITE_*`.

Fonctions privilégiées privées `SECURITY DEFINER`, `search_path=''`, ACL uniquement rôle de publication et propriétaire SQL ; aucun EXECUTE `PUBLIC/anon/authenticated/service_role`. Leur autorisation repose sur le rôle PostgreSQL dédié, **pas sur un JWT utilisateur ni un faux `auth.uid()`**. Appelant opérateur tracé par `session_user`. Les utilisateurs ordinaires, même propriétaires de collections, n'ont aucun droit de publication. Les RPC utilisateurs ne donnent jamais accès à ces fonctions.

Interface de commande **projetée, absente du dépôt** : `node scripts/notifications/publish.ts --file <fichier.json> --validate`, puis le même fichier avec `--apply --environment local` ; retrait par `--withdraw <publication_key> --environment local`. Modes mutuellement exclusifs, environnement explicite en écriture, Cloud uniquement après autorisation correspondante. Connexion depuis `MY_NOTIFICATION_DATABASE_URL` fournie hors Git, jamais depuis un argument contenant le secret ; `--validate` ne nécessite aucune connexion. Le script émet uniquement clé, UUID, empreinte et issue assainie, sans recopier connexion ou données Auth.

Contrat script futur : fichier JSON local validé strictement (`publication_key`, catégorie, titre, corps texte, version, action, nécessité d'action, exception nouveaux inscrits et éventuelle expiration) ; `--validate` sans écriture ; publication explicite vers l'environnement annoncé. Limites techniques recommandées : clé ASCII `[a-z0-9][a-z0-9._:-]{0,119}`, titre 1–200 caractères après trim, corps texte 1–20 000, version SemVer ≤ 64 ; expiration éventuelle postérieure à la publication. Action validée selon l'union interne connue, jamais SQL/code ou chemin arbitraire. Le serveur revalide tout, horodate `published_at` avec son horloge au moment de publication et n'accepte aucune date de publication rétroactive du client. Une transaction insère contenu et provenance ; UNIQUE `publication_key` + hash normalisé hors dates/acteur générés : reprise identique retourne même UUID/date, clé réutilisée avec contenu différent → `publication_key_conflict`, sans remplacement silencieux.

Contenu publié immuable. Correction : retrait explicite et nouvelle publication avec nouvelle clé, opération contrôlée et traçable ; retrait répété sans effet. `include_new_users` et `requires_action` exigent une justification/condition validée dans le fichier de publication et conservée comme provenance privée. Une condition de résolution non cadrée ou non supportée par le backend est refusée à la publication ; aucune validation libre du client ne vaut réalisation d'une action. Publications ordinaires initiales : `requires_action=false`. Aucun script créé pendant 8A.3, aucune annonce publiée. Utilisation Cloud ultérieure soumise à son autorisation explicite habituelle ; aucune UI d'administration ni notification externe.

## 9. Sécurité, transactions et concurrence

### 9.1 Frontières de privilèges

| Surface | Lecture / écriture recommandées |
|---|---|
| Collections/items/catalogue/copies existants | RLS et grants conservés ; lecteurs contenu/ordre/Dashboard `SECURITY INVOKER`. Aucun grant DML sur items, révision, mode de contrat, masquage ou rangs à `authenticated`. Partages en lecture seule. |
| Journal, reçus et suivi privés | Aucun droit direct navigateur ; RLS activée en défense supplémentaire, schéma non exposé. Révoquer explicitement les grants hérités sur les nouvelles tables/fonctions privées, sans toucher aux tables privées déjà livrées. Mutation uniquement par fonctions contrôlées. Le destinataire partagé ne lit ni intentions, reçus, aperçus ni notifications du propriétaire. |
| RPC utilisateurs écrivant / lisant les structures privées | `SECURITY DEFINER` justifié par fermeture du DML/stockage privé, `search_path=''`, noms qualifiés ; contrôle explicite `auth.uid()`, JWT `aal2`, profil présent et propriétaire/utilisateur concerné avant accès. Révoquer EXECUTE à `PUBLIC`, `anon`, `authenticated`, `service_role`, puis accorder uniquement `authenticated`. |
| Annonces et compteurs privés | Lecteurs contrôlés `DEFINER` parce que stockage non exposé et lookup d'inscription Auth. Lire exclusivement la ligne Auth de l'appelant ; ne jamais retourner de liste de comptes. Suivi individuel uniquement, sans paramètre `user_id`. |
| Publication | Rôle DB dédié, fonctions privées et ACL propres ; aucune identité utilisateur frontend ne confère ce rôle. |

Ne pas utiliser `user_metadata` pour l'autorisation. Ne pas remplacer les protections existantes de profil supprimé/MFA par la seule présence d'un JWT. Aucun nouveau mécanisme de session ni récupération MFA introduit ; conventions actuelles conservées. Les grants existants de `service_role` sur les tables restent inchangés ; aucune opération frontend ne les utilise.

### 9.2 Ordre de verrouillage

Pour toute opération lisant le catalogue et modifiant/verrouillant une collection : **verrou partagé catalogue `771402` → parent → items → reçu/suivi**, ordre constant. Création, nouvel ajout manuel v2, status/aperçu et application suivent cet ordre. Status et aperçu utilisent également le verrou parent pour obtenir un état cohérent en plusieurs instructions ; aucune écriture de donnée n'en résulte. Reorder/retrait/masquage ne lisant pas le catalogue prennent seulement le parent et ne demandent jamais ensuite `771402`.

Pipeline : verrou exclusif `771402` puis verrous catalogue actuels, sans verrou de collection ni écriture de suivi individuel. Il peut attendre les lecteurs protégés, mais ne crée aucune inversion avec les writers de collection. Les fonctions de lecture/suivi de notification utilisent un snapshot SQL ou relisent après leurs verrous ; elles ne prennent pas un verrou catalogue après un parent.

`READ COMMITTED` imposé aux writers et opérations multi-instructions protégées ; relire après attente. Refuser snapshots fixes comme aujourd'hui. Verrou parent sérialise reorder/add/remove/hide/apply et suppression du parent ; deux collections restent indépendantes hors cohérence catalogue. Pas de transaction conservée entre aperçu et clic : token optimiste en plus des verrous courts. Deadlock, timeout et conflit → rollback et code sûr ; relecture puis reprise avec le même UUID si issue incertaine.

### 9.3 Erreurs métier projetées

| SQLSTATE / message stable | Sens côté service |
|---|---|
| `42501 / collection_action_unavailable` | Identité/MFA/profil/propriété ou parent absent/inaccessible ; mêmes réponses pour tiers et collection supprimée. |
| `22023 / collection_operation_invalid` | Paramètres incohérents, token mal formé ou destination invalide. |
| `P0002 / collection_item_unavailable` | Sujet/ancre absent ou hors parent, sans exposer son autre collection. |
| `23505 / already_present` | Variante exacte déjà présente ; constraint interne non exposée. |
| `23514 / automatic_item_removal_forbidden` | Retrait manuel d'automatique. |
| `23514 / item_hiding_forbidden` | Manuel, mauvais type de parent ou état illégal. |
| `40001 / collection_structure_conflict` | Révision de geste obsolète, isolation non supportée, contention normalisée. |
| `40001 / preview_stale` | Un des champs de confirmation/plan diffère ; nouvel aperçu requis. |
| `23505 / operation_id_conflict` | UUID réutilisé avec requête différente. |
| `23514 / order_contract_upgrade_required` | Collection legacy ou ancien writer incompatible ; aucun reset automatique. |
| `23514 / automatic_state_inconsistent` | État manquant/régressé, canonique/hash ou journal invalide ; bloquer, pas réparer silencieusement. |
| `23514 / collection_update_not_available` | Nouvelle application sans delta utile. |
| `42501 / notification_unavailable` | Contenu non éligible/inaccessible ; absence et tiers indistinguables. |
| `22023 / notification_operation_invalid` | Clé, curseur, action ou révision observée invalides. |
| `23505 / publication_key_conflict` | Publication identifiée déjà existante avec autre contenu. |
| `XX000 / phase8_operation_unexpected` | Erreur interne assainie ; aucune donnée SQL ou secret dans l'UI. |

Tables privées, incohérence interne et erreurs PostgreSQL non reconnues restent hors messages publics. TypeScript mappe des couples code/message précis ; erreurs de transport/protocole restent génériques. Les anciens codes demeurent sur les API legacy tant que leurs consommateurs existent.

## 10. Services TypeScript et cache

Étendre les services et types responsables, le client Supabase commun et `variantIdString` ; nouveaux décodeurs JSON avec `z.strictObject` / union discriminée suivant les patterns 7E. Ne pas modifier à la main `database.generated.ts` : futures migrations Local puis génération réelle. Les entrées BIGINT nécessitant adaptation de transport string suivent le pattern ciblé existant, sans faux overlay d'API absente.

Valider UUID, chaînes décimales bornées au BIGINT PostgreSQL (révisions non négatives, versions/rangs positifs), hashes hexadécimaux, clés exactes, unicité, cohérence origine/rang/masquage et classification. Refuser payload extra, champ absent, entier JSON numérique à la place d'une chaîne ou nouveau discriminant inconnu. Décodeur v1 reste strict ; ne pas le rendre permissif pour contourner une livraison incomplète.

| Action | Invalidations / relectures nécessaires pour le viewer et parent de la requête |
|---|---|
| Reorder | Contenu, ordre technique, aperçu/status ciblés ; Dashboard/progression inchangés. |
| Ajout/retrait | Contenu, ordre, overview, Dashboard, aperçu/status et centre/compteur : les changements personnels peuvent modifier le delta utile. |
| Masquer/réafficher | Contenu, overview, Dashboard et aperçu/status ; positions inchangées, ordre technique conservé. |
| Application | Contenu, ordre, overview, Dashboard, aperçu/status, centre/compteur ; supprimer le token de confirmation affiché. |
| Lire/traiter notification | Centre, compteur, contenu de notification concerné ; pas de mutation du cache d'ordre ou de la collection. |
| Exemplaires | Invalidations possession/progression existantes conservées ; token structurel inchangé. |
| Suppression du parent | Nettoyage existant du détail étendu aux contenus/status/aperçus et relecture centre/compteur ; pas de données privées recréées par réponse tardive. |

Nouvelles clés centrées sur viewer/collection ou viewer/notification, par exemple `['collections','update-status',viewerId,collectionId]`, `['collections','update-preview',viewerId,collectionId]`, `['notifications','center',viewerId,...pagination]`, `['notifications','unread-count',viewerId]`. Réutiliser `collectionStructureMutationKey` pour bloquer les mutations structurelles concurrentes de l'UI ; les verrous DB restent la garantie réelle.

`retry:false` conservé pour mutations. Après échec/issue incertaine : consulter reçu si pertinent et invalider les lectures affectées, même si le serveur a pu engager l'action. Après `preview_stale`, retirer l'ancien token et présenter un aperçu neuf avant confirmation. Attendre les relectures **réussies**, pas seulement la résolution d'`invalidateQueries`, comme le hook livré. Une erreur de lecture bloque la mutation et masque le cache privé périmé. Logout, changement de viewer et navigation gardent la purge/portée actuelles. Aucune invalidation globale ni cache d'un destinataire distant prétendument actualisé par le propriétaire ; celui-ci relira sous ses RLS lors de sa consultation.

## 11. Transition, déploiement et retour arrière

### 11.1 Collections de test et compatibilité

Pas de récupération des gestes historiques depuis `sort_position`. Ajouter les colonnes/structures sans modifier items ni positions ; marquer les collections existantes contrat 1. Elles restent consultables et leurs writers legacy restent valables **uniquement pour ces collections**. Aperçu/application Phase 8 et masquage exigent contrat 2. Aucun passage automatique 1→2 avec journal vide sur une collection déjà personnalisée.

Au basculement, les nouvelles créations sont contrat 2 par défaut backend, y compris création libre via insertion à colonnes autorisées ; création automatique initialise journal vide/révision zéro. Les manuels sont ensuite introduits par le writer v2. La RPC de création existante retournant un parent legacy le retourne intact : elle ne le met pas à niveau silencieusement.

Modifier les **corps** des anciens writers reorder/add/remove dans une future migration pour vérifier le mode après verrou parent : contrat 2 → refus d'upgrade, contrat 1 → comportement legacy. Pas de wrapper v1 sur v2 qui inventerait un UUID neuf à chaque retry. Nouveaux writers refusent contrat 1. Ainsi aucun ancien client ne peut déplacer un item v2 sans journal. Les migrations historiques restent inchangées ; gardes et nouvelles APIs sont engagées atomiquement avant activation des créations v2.

Propriétaire peut supprimer/recréer ses collections de test selon son accord métier. **Aucune suppression, commande de reset ou opération DB pendant 8A.3 ; future intervention destructive à annoncer et autoriser séparément dans son périmètre.** Pas de script de purge automatique. Conserver les copies/notes et partager seulement les nouveaux parents explicitement ; la suppression d'une collection retire ses relations de partage selon le contrat déjà livré.

### 11.2 Séquence future

1. **Étendre en Local autorisé** : structures privées, colonnes/contraintes, fonction de calcul et APIs v2 ; contrats legacy protégés, création encore legacy tant que clients non prêts. Vérifier permissions, algorithme et reprises. Générer types réels.
2. **Adapter clients** : services stricts, gestion des UUID/révisions et relectures ; nouvelle lecture v2 sans changer payload v1. Vérifier coexistence et erreurs explicites des anciens writers.
3. **Activer nouvelles créations v2** par migration backend ; aucun transfert destructif des collections existantes. Valider création, ajout initial, conversion future et journal complet avant E/F. Transition des tests uniquement à la demande du propriétaire.
4. **Masquage/progression** : lecteur/agrégats/mutation en C puis UI D, coordonnés ; aucun booléen masqué accepté sur legacy. Réutiliser Dashboard/overview, droits partagés inchangés.
5. **Actualisations E/F** : statut/aperçu puis application avec token/reçus ; pas d'application accessible tant que les preuves transactionnelles manquent.
6. **Notifications G/H** : stockage/suivi/publication puis UI ; intégrer ACK d'aperçu et version appliquée. Publication après contrats de ciblage et tests de sécurité, sans fanout.
7. **Cloud** : checkpoint explicitement autorisé ultérieur, migrations vérifiées et clients coordonnés ; aucune preuve Local ne vaut déploiement Cloud. Ne pas promouvoir vers production ni retirer les compatibilités dans ce cadrage.

### 11.3 Retour arrière non destructif

Avant activation : retirer consommateurs nouveaux puis révoquer nouvelles APIs si nécessaire ; conserver colonnes/tables et collections. Avant commit d'une migration atomique : rollback SQL intégral.

Après gestes v2 : conserver journal, reçus, masquages, positions et versions appliquées. Revenir aux lectures v1 est possible, car elles lisent encore `sort_position`, mais **ne jamais réautoriser un writer v1 sur un parent v2**. Rollback recommandé = interfaces Phase 8 retirées, collections v2 temporairement consultatives, gardes backend maintenues ; legacy continue normalement. À la reprise, les données v2 et leur journal permettent de continuer sans perte.

Masquages déjà acceptés : garder leurs effets de progression même si bouton/filtre retiré ; ne pas remettre silencieusement les comptes historiques. Si l'ancien client ne peut présenter correctement ce contrat, conserver la version frontend de lecture compatible ou désactiver temporairement cette consultation, pas supprimer les booléens. Application déjà engagée : aucune « annulation » automatique réintroduisant les anciens items ; un rollback logiciel ne revient pas sur une décision propriétaire. Notifications : retirer UI/EXECUTE de publication, garder contenus/suivis, pas de reset non lu.

Toute contraction de colonnes/tables, restitution d'une ancienne structure ou conversion des parents v2 vers legacy exige une conception distincte, sauvegarde/preuve de préservation et autorisation adaptée. Aucun de ces gestes n'est implicite dans le retour arrière.

## 12. Matrice des risques et preuves futures

**Tests à écrire/exécuter dans leurs blocs de développement, aucun test ajouté ou exécuté ici.**

| Risque | Preuve indispensable | Bloc |
|---|---|---|
| Mauvais rejeu / compression | 36 scénarios 8A.2 dont A/B, S08/S35 ; permutation, ordre hors sujet par placement, répétition depuis même base, contexte immuable ; refus d'entrées impossibles. | B/E/F |
| Mauvaise traduction filtrée | `A H B C` → `A H C B`, H/K aux extrémités S26/S27, après avec sujet successeur, clavier/souris/tactile Liste/Cartes ; recherche seule bloque. | B/D |
| Retry devenant second geste | Même UUID/paramètres avant et après autre mutation ; réponses perdues add/remove/move/hide/apply ; deux connexions même UUID ; collision d'UUID avec autre payload ; no-op reçu sans journal. | B/C/F |
| Cycle de vie erroné | Conversion conserve UUID/placements ; retrait/réintroduction crée UUID sans intentions/masquage anciens ; ancienne ancre réintroduite reste distincte ; nettoyage sujets sans perdre suffixes d'autres sujets ; copies/notes exactes. | B/F |
| Aperçu/apply divergents | Même plan/hash/rangs/origines/masquages et IDs maintenus ; plusieurs nouveaux UUID ; cible vide avec/sans manuels ; version nouvelle sans delta, retour à ancienne structure ; état manquant/hash faux. | E/F |
| Concurrence / deadlock | Attente réelle observée par multi-connexion, sync ↔ preview/apply/add, reorder/hide/remove/apply ↔ parent delete ; ordre des verrous ; lecture après attente ; autre collection indépendante ; snapshots fixes refusés. | B/C/E/F |
| Échec partiel | Injection après conversion/insertion/retrait puis avant reçu ; rollback intégral, aucune nouvelle version/notification traitée ni copie/note altérée. | F |
| Progression divergente | Auto masqué possédé/manquant, manuel, multiples copies, zéro total, toutes masquées, propriétaire/destinataire/tiers ; Dashboard et overview mêmes comptes sous les deux filtres et recherche. | C/D |
| Classeur compactant la recherche | 3 formats, masqués en début/milieu/fin, changement de filtre/page/occurrence, recherche sans compactage supplémentaire, réaffichage/relecture ; aucun sort persisté. | D |
| Fuite de données / grants | MFA aal1, profil supprimé, anon, propriétaire, destinataire, tiers ; DML direct interdit, journal/reçus privés ; DEF/INVOKER/search_path/ACL ; ACK de version future refusé ; révocation de partage. | Tous |
| Notifications incohérentes | Une clé par collection, versions successives sans écritures massives, v2 lue pendant arrivée v3, application seule traite ; supprimée/delta nul exclue ; badge total et centre même snapshot. | G/H |
| Audience / publication | Inscrit avant/après publication, déconnecté, profil tardif, exception nouvelle inscription active, expiration/retrait, double publication identique/divergente/concurrente ; aucun utilisateur ordinaire publiant ni secret frontend. | G |
| Decoder/cache incompatibles | V1 15 clés / v2 enveloppe et 16 clés ; BIGINT > MAX_SAFE_INTEGER ; champs inconnus/doublons ; viewer quitté, conflit d'aperçu, relecture échouée, ancien writer sur v2. | B à H |
| Rollback perdant les intentions | Ancien client refusé en écriture v2, ordre v1 lisible ; rollback lecture seule puis reprise journal/reçus intacts ; progression masque maintenue. | B/I |

Coût : contexte R1 peut croître avec taille de collection × gestes vivants, reçu avec mutations. Mesurer volume réel avant optimisation ; pas de dernier placement par sujet ni purge de suffixes sans preuve d'équivalence. Requête d'événements ciblée par propriétaire/index de collection ; aucune nouvelle dépendance, diffusion massive ou fréquence arbitraire.

## 13. Dépendances 8B à 8H et première intervention 8B

| Bloc futur | Préconditions / sortie préparée |
|---|---|
| **8B — persistance/reorder** | Validation 8A.3 ; modèle de révision, journal, reçus, mode legacy/v2 et gardes ; adaptation commune création/ajout/retrait/reorder/services. Sortie : journal complet dès création et tests R1–R4. Ne pas lancer d'actualisation ici. |
| **8C — masquage backend/progression** | Révision/reçus/gardes B ; booléen, invariant parent, RPC, lecture v2 et agrégats coordonnés. |
| **8D — masquage vues** | B + C ; séparation visibilité/recherche, DnD avec ancres visibles, Classeur compacté, lecture partagée. |
| **8E — détection/aperçu** | B + C pour calcul complet, canonique existant ; fonction pure et token. D n'est pas nécessaire au calcul backend, mais doit être intégré avant parcours final. |
| **8F — application** | B + C + E ; reçus, verrous et mêmes calculs. UI de confirmation intègre D. Notification dérivée pourra constater version appliquée après installation G. |
| **8G — notifications backend** | Versionnement existant + status E + application F ; suivi G raccordé à aperçu/application sans changer leur calcul. Publication annonces peut être préparée indépendamment des vues D, sans l'activer hors bloc autorisé. |
| **8H — centre/header** | G, E/F et D ; affichage, lecture observée, compteur et erreurs/refocus. Aucun nouveau parcours de partage. |

Première intervention B recommandée : inventaire final des writers et fixtures du HEAD alors courant, puis migration additive Local explicitement autorisée pour révision/mode/journal/reçus et calcul interne. Garder créations legacy tant que clients non prêts ; prouver permissions, contextes et rejouabilité avant activation. Intervention suivante : APIs v2 + gardes atomiques sur anciens writers, types réels et services ; enfin consommateurs/relectures et activation coordonnée des nouvelles créations. Chaque périmètre doit être demandé/validé avant réalisation ; aucun ordre historique inféré ni collection supprimée pour faire passer les tests.

## 14. Arbitrages restant réellement ouverts

R1–R4 ne sont **plus ouverts**. Aucun autre arbitrage métier ne bloque les fondations B/C/E/F décrites.

- Quelles annonces importantes bénéficieront de l'exception pour nouveaux inscrits, pendant quelle période, et quelle action permettra de traiter une annonce exigeant une action ? Décision par publication avant emploi de ces options ; aucun critère universel inventé ici. Publications ordinaires consultables/traitables restent définies.
- Quelle fraîcheur visible attendue du badge lorsque l'utilisateur demeure connecté sans consulter le centre ? Connexion/focus/ouverture/actions définis ; intervalle de polling éventuel à valider avant H, sans impact sur réception hors connexion.
- Présentation détaillée du résumé et libellé lorsque la progression est `0 / 0` parce que toutes les automatiques sont masquées ; conserver règle de calcul, terminer UX avant D/F/H.

Les durées de rétention légale et l'exploitation des sauvegardes restent dans leurs cadrages existants. Pas de nouvelles catégories, push, email, administration UI, restauration de cartes supprimées ou parcours de partage dans ce contrat.

## 15. Vérification documentaire et arrêt

R1–R4 reportées comme validées dans les six références ; algorithme chronologique 8A.2 préservé, notamment S08/S35, normalisation complète et contextes immuables. Contrats futurs distincts du socle livré jusqu'à Phase 7. Rapport 8A.2 historique, `package.json` et `package-lock.json` vérifiés sans diff.

| Vérification exécutée | Résultat |
|---|---|
| Liens locaux des sept documents | **323 références, aucune destination manquante** |
| Ancres Markdown locales | **70 références, aucune ancre manquante** |
| Espaces de fin de ligne / caractère Unicode de remplacement | **PASS**, rapport non suivi inclus dans un contrôle séparé en mémoire |
| `git diff --check` | **PASS** |
| Périmètre Git final | Six références suivies modifiées + ce rapport nouveau non suivi ; aucun fichier staged ni modification hors documentation |
| Version package / lock / racine lock | **0.7.21**, inchangée |
| Branche / HEAD final | **`dev` / `ab35b8f3cc5a6af4b1eb1322121e0d7b06d4f8ae`**, inchangés |

Documents modifiés : `01-FEATURES.md`, `03-DATA-MODEL.md`, `04-UX-UI.md`, `05-ARCHITECTURE.md`, `06-DATABASE.md`, `08-ROADMAP.md`. Document créé : ce rapport. Vérification documentaire uniquement ; aucune nouvelle preuve backend, navigateur ou de déploiement. Les tests projetés de la matrice restent à réaliser dans leurs sous-phases autorisées.

**Aucune modification de code, test, script, migration, schéma ou donnée ; aucun accès aux bases Local/Cloud, changement de version, commit ou push. Arrêt à 8A.3, validation requise avant développement.**
