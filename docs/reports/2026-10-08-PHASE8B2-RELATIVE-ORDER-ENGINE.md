# Phase 8B.2 — Moteur PostgreSQL de fusion et rejeu relatif

Date : **8 octobre 2026**. Version applicative : **0.8.1**.

## Résultat et périmètre

**Moteur interne livré et testé sur Supabase Local uniquement.** Reconstruction depuis le canonique cible, puis rejeu intégral des intentions avec contextes R1 immuables. **36/36 scénarios 8A.2 conformes au véritable moteur PostgreSQL**. Aucune collection réelle modifiée, aucun contrat 2 activé, aucun writer v2, aperçu/application public, capture de geste, allocation de révision, traitement de reçu, masquage persistant, notification, composant React ou service frontend livré.

Références intégralement lues : [8A.2](2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md), [8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), [8B.1](2026-10-08-PHASE8B1-RELATIVE-ORDER-FOUNDATIONS.md). Rapports historiques inchangés. `AGENTS.md`, documentation pertinente, migration/tests 8B.1, canonique/création Phase 5, writers 6A.3/6C.1, lecteur 7F.1, types et lanceurs existants inspectés avant modification. R1–R4 acquis selon validation propriétaire et 8A.3.

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `86ed6b503c3443341b41471c8d9ae1f01214f6a6` | Identique, aucun commit |
| Git | Arbre propre, aucun changement préexistant/staged | 8 fichiers suivis modifiés, 4 nouveaux non suivis, aucun staged |
| Package / lock / racine du lock | `0.8.0` / `0.8.0` / `0.8.0` | `0.8.1` / `0.8.1` / `0.8.1` |
| Outillage réel | Node `24.20.0`, npm `12.1.0`, Supabase CLI `2.120.0` | Identique, aucun changement de dépendance |
| Local | Volume existant actif, PostgreSQL `17.6`, `127.0.0.1:55322/postgres` | Même base/volume, sans reset |
| Migrations Local | 30/30, jusqu’à `20261008153458` | 31/31, jusqu’à `20261008180634` |
| Collections réelles | 4, contrat 1/révision zéro | Identiques, même contrat/révision |
| Cloud | Dernier checkpoint propriétaire documenté : 29 | Aucun accès pendant 8B.2 ; état distant non revérifié |

Stack DB/API/Auth active ; Realtime, imgproxy et pooler indiqués arrêtés par le statut Local, vector observé en redémarrage. Aucun de ces services n’est requis par le calcul SQL ni les preuves exécutées. Aucun changement de configuration/service entrepris.

`migration list --local` compare dépôt et base Local ; sa colonne `Remote` ne prouve aucun état Cloud. Aucun reset, suppression/recréation de collection réelle, commit, push ou déploiement.

## Migration et signature interne

Création par la CLI installée :

```sh
node node_modules/supabase/dist/supabase.js migration new phase8b2_relative_order_engine
node node_modules/supabase/dist/supabase.js migration up --local
```

Migration : [20261008180634_phase8b2_relative_order_engine.sql](../../supabase/migrations/20261008180634_phase8b2_relative_order_engine.sql). Une seule transaction `BEGIN`/`COMMIT`, deux types composites privés et une fonction ; aucune table, colonne, policy, position, rang, journal ou reçu modifiés. Les 30 migrations antérieures restent inchangées.

```sql
private.merge_collection_relative_order(
  p_collection_id uuid,
  p_canonical private.collection_order_canonical_entry[],
  p_items private.collection_order_item_entry[],
  p_intents private.collection_order_intents[]
) returns jsonb
```

`STABLE`, `PARALLEL SAFE`, `SECURITY INVOKER`, `search_path=''`. La volatilité respecte les constructeurs JSONB PostgreSQL ; déterminisme obtenu par les entrées et les tris explicites, sans horloge ni aléatoire. Aucun accès aux tables : `collection_order_intents[]` réutilise uniquement le **type de ligne** du journal 8B.1. Le helper pur `collection_order_fallback_is_valid` de 8B.1 est réutilisé. Aucun nouvel helper de production nécessaire.

Les deux types ajoutés sont des projections en mémoire, sans stockage. Ils évitent la confusion entre une position matérialisée et une intention, et permettent de transporter les vrais UUID/BIGINT PostgreSQL sans JSON numérique intermédiaire.

### Entrées

| Paramètre | Champs / règles |
|---|---|
| `p_collection_id` | UUID non NULL ; portée explicite commune aux items et intentions. Le calcul pur ne recherche pas le parent en base. |
| `p_canonical` | `(variant_id BIGINT, automatic_rank BIGINT)[]`, complet et ordonné. Variantes uniques, rangs exactement `1…N` dans cet ordre. Vide autorisé. L’appelant doit avoir obtenu/vérifié ce canonique depuis le contrat autoritatif existant. |
| `p_items` | `(collection_id UUID, collection_item_id UUID, variant_id BIGINT, origin TEXT, automatic_rank BIGINT, introduced_revision BIGINT, is_hidden BOOLEAN)[]`. Ensemble vivant complet avant actualisation, sans ordre de lecture requis, masqués compris. IDs/variantes uniques. Automatiques : rangs appliqués uniques continus `1…K`. Manuels : rang NULL, introduction positive, masquage false. Introduction conservée pour un ancien manuel converti ; NULL pour un automatique natif. |
| `p_intents` | Lignes 8B.1 : parent, `sequence`, UUID opération/sujet, `kind`, destination, ancre, suffixe UUID[], `accepted_at`. Séquences positives **strictement croissantes dans le tableau**, trous autorisés ; opérations uniques. Timestamps obligatoires mais informatifs, égalités autorisées, aucun départage temporel/UUID. |

Tous les tableaux sont non NULL, unidimensionnels, indexés depuis 1 ; tableaux vides acceptés. Membres/composants obligatoires non NULL. Identifiants catalogue : domaine BIGINT signé complet, sans lookup de catalogue dans ce moteur. Les casts natifs refusent UUID/types/overflow invalides avant l’appel ; sortie BIGINT uniquement sous forme de chaînes décimales exactes.

Chaque item avec `introduced_revision` doit avoir **exactement un** `manual_add` à cette séquence, y compris après conversion. Une introduction ne peut être partagée par deux items. Aucun move du sujet avant son introduction ; aucune ancre/un successeur manuel connu avant son introduction, même quand celle-ci n’est connue que par un ajout historique d’un sujet actuellement absent.

`before` exige ancre distincte du sujet. Suffixe complet fourni, ordonné, sans NULL, doublon, sujet ni ancre. `end` exige ancre NULL et suffixe vide. Toutes les intentions sont validées, y compris celles devenues inapplicables. Parent incorrect, rangs, origines, chronologie, doublons, introduction/placement initial incohérents et contextes mal formés → **`22023 / collection_order_input_invalid`**, catégorie en DETAIL.

Un UUID historique absent n’est pas assimilé à une référence invalide : il peut désigner un sujet, une ancre ou un successeur réellement retiré. Le calcul n’a pas de tombstones ni d’historique global pour prouver sa présence passée. **L’appartenance historique au parent et l’exhaustivité réelle du suffixe R1 doivent être garanties par les futurs writers à l’acceptation.** Le moteur refuse les impossibilités vérifiables dans ses entrées ; il ne recalcule pas un contexte depuis l’ordre actuel.

### Sortie

Objet JSONB contenant exactement six tableaux, sans position numérique matérialisée :

| Clé | Forme des entrées / ordre |
|---|---|
| `final_order` | `{collection_item_id: UUID ou NULL, variant_id: string, origin: manual ou automatic, automatic_rank: string ou NULL, is_hidden: boolean}` dans l’ordre final complet. NULL seulement pour les nouveaux automatiques. |
| `added` | `{variant_id, automatic_rank}`, rang cible croissant. Aucun UUID alloué/réservé. |
| `removed` | `{collection_item_id, variant_id, automatic_rank}`, ancien rang croissant ; automatiques sortant de l’univers. |
| `converted` | `{collection_item_id, variant_id, automatic_rank}`, rang cible croissant ; UUID manuel conservé. |
| `rank_changes` | `{collection_item_id, variant_id, previous_rank, next_rank}`, rang cible croissant ; automatiques conservés uniquement. |
| `replay` | `{sequence: string, subject_item_id: UUID, resolution, resolved_anchor_item_id: UUID ou NULL}`, ordre chronologique. Résolution `anchor`, `fallback`, `end`, `fallback_end` ou `subject_absent`. Trace interne ; aucun payload public créé. |

Ajouts/retraits/conversions/changements de rang disjoints selon leur classification structurelle. Informations `introduced_revision` et journal conservées dans les entrées ; elles ne sont pas écrasées ni transformées en un second ordre stocké. Les objets JSONB n’ont pas d’ordre métier de clés ; tous les tableaux ont un ordre explicite.

## Calcul, invariants et décisions R1–R4

1. Parcourir tout le canonique cible. Réutiliser chaque item par variante exacte ; manuel correspondant → conversion du même UUID, sinon nouvel automatique symbolique avec UUID NULL. Rangs depuis le canonique exclusivement. Automatiques conservés gardent leur masquage ; nouveaux/convertis visibles.
2. Ajouter les manuels vivants hors canonique, par introduction croissante. Exclure les automatiques devenus inéligibles. Cette base ne contient aucun ordre personnalisé ancien.
3. Rejouer **chaque** intention chronologique, placement initial manuel compris. Sujet hors univers → trace inapplicable, jamais de résurrection. Ancre vivante → sa position courante ; sinon premier UUID du suffixe R1 encore vivant dans l’univers ; aucun → fin.
4. Extraire/réinsérer le seul sujet. Aucun bloc entraîné, aucun changement de variante/origine cible/rang/masquage pendant ce déplacement. Retourner permutation et classifications complètes.

Une seule occurrence par variante finale ; identité conservée lors du maintien/conversion ; ensemble inchangé pendant le simple rejeu ; ordre relatif exact des autres éléments préservé à chaque déplacement ; masqués inclus dans base, ancres et replis. Aucun filtre, possession, Liste/Cartes/Classeur, `sort_position`, comparaison d’UUID ou aléatoire ne détermine l’ordre.

- **R1** : références de secours fournies telles que capturées, jamais régénérées. S17 et S32–S34 distinguent les époques historiques.
- **R2** : moteur consomme uniquement les destinations normalisées `before/end` ; avant/après/start et vues filtrées relèvent de la future capture serveur. S25–S27 prouvent le rejeu attendu dans l’ordre complet.
- **R3** : les intentions référencent l’UUID d’item, jamais sa variante. UUID absent → intention propre ignorée ou repli d’ancre ; nouvel UUID de même variante n’hérite pas des anciens gestes. Conversion garde UUID et introduction.
- **R4** : moteur consomme les intentions enregistrées, n’en invente aucune. Annulations/no-ops/retries doivent être filtrés/dédupliqués par les futurs writers ; un rejeu peut devenir sans effet dans une nouvelle base sans supprimer l’intention historique.

Algorithme par tableaux et projections en mémoire : scans des items pour correspondances et références, extraction/insertion de listes, sans index ou optimisation spéculative. Aucun benchmark de grand journal ni seuil produit fixé. Les futurs volumes pourront justifier une optimisation conservant exactement ces résultats.

## Matrice PostgreSQL exécutée

[Suite pgTAP dédiée](../../supabase/tests/database/024_relative_order_engine.test.sql) et [fixtures statiques](../../supabase/tests/database/relative_order_engine.fixtures.inc). Fixtures synthétiques uniquement dans des tables temporaires sous `BEGIN`/`ROLLBACK`, sans insertion/modification de collection réelle. Symboles de 8A.2 traduits en variantes et UUID déterministes ; contextes historiques écrits explicitement. Attentes copiées de la matrice validée ; elles ne sont pas calculées par le moteur testé.

**Les 36 résultats suivants proviennent des appels PostgreSQL exécutés pendant 8B.2.** Ils sont distincts des simulations abstraites historiques de 8A.2. Trois reconstructions par scénario : **108 résultats identiques**. Une vérification supplémentaire a appelé les 36 cas en transaction SQL **READ ONLY**, tous conformes.

| Cas | Résultat PostgreSQL complet | Conformité |
|---|---|---|
| S01 | `A B C D` | PASS |
| S02 | `A X Y B C Z D` | PASS |
| A | `C A X B D` | PASS |
| B | `A X C B D` | PASS |
| S05 | `X D A B C` | PASS |
| S06 | `A X C Y D Z B` | PASS |
| S07 | `C A X D B` | PASS |
| S08 | `D A X C B` | PASS |
| S09 | `A X D C B` | PASS |
| S10 | `A X C D B` | PASS |
| S11 | `A X B C D` | PASS |
| S12 | `A X Y Z D C B` | PASS |
| S13 | `A D C` | PASS |
| S14 | `D C` | PASS |
| S15 | `B C A` | PASS |
| S16 | `A B C` | PASS |
| S17 | `D A C` | PASS |
| S18 | `A X M B C` | PASS |
| S19 | `N M A X B C` | PASS |
| S20 | `A X M B C` | PASS |
| S21 | `A B C M` | PASS |
| S22 | `D C B A` | PASS |
| S23 | `D B C A` | PASS |
| S24 | `A X C H B` | PASS |
| S25 | `A H C B` | PASS |
| S26 | `H B A K` | PASS |
| S27 | `H B A K` | PASS |
| S28 | `X B C A` | PASS |
| S29 | `X B C A N` | PASS |
| S30 | `M` | PASS |
| S31 | `X Y N M` | PASS |
| S32 | `A X C B D` | PASS |
| S33 | `A D X Y C B` | PASS |
| S34 | `A D X Y C` | PASS |
| S35 | `C A B D` | PASS |
| S36 | `A D H C` | PASS |

S08 : suppression volontaire du premier geste de C → `A X C B D`, au lieu de `D A X C B`. S35 : canonique remplacé volontairement par la sortie personnalisée → `D C A B`, au lieu de `C A B D`. Ces deux contre-exemples sont aussi des appels du moteur PostgreSQL.

Preuves complémentaires : permutations/rangs/origines/masquages/IDs sur chaque scénario ; ordre d’entrée des items inversé sans effet ; nombre d’intentions rejouées exact ; comparaisons de préfixes chronologiques avant/après les moves après introduction des manuels concernés. Primitive vérifiée exhaustivement sur **24 permutations × 16 destinations = 384 cas**, avec ensemble, placement immédiatement avant/en fin et ordre hors sujet indépendants des attentes de fusion. Cycles de vie sujet/ancre automatique réintroduits et manuel réajouté avec nouvel UUID ; conversion déjà matérialisée ; frontières BIGINT signées et séquence maximale ; entrées malformées et appels API refusés.

## Validations Local et sécurité

| Contrôle exécuté | Résultat |
|---|---|
| `npm run db:test -- supabase/tests/database/024_relative_order_engine.test.sql` | **PASS — 498 assertions** |
| `npm run db:test` | **PASS — 24 fichiers / 2 157 assertions**, writers/lecteurs v1 compris |
| Parité canonique incluse dans les tests DB | **1 213 cibles, zéro divergence** |
| `npm run db:lint` | **PASS — public,private**, aucun warning/erreur |
| `supabase db advisors --local --type security --level info --fail-on warn` | **PASS — zéro WARN/ERROR** ; quatre INFO attendues sur tables privées RLS sans policy |
| ACL moteur/types et appels SQL réels | **PASS** — PUBLIC/anon/authenticated/service_role fermés ; service_role refusé malgré BYPASSRLS |
| Rejeu des 36 cas en transaction READ ONLY | **PASS**, aucune écriture requise |
| Recréation transactionnelle des seuls nouveaux objets depuis le fichier final, puis ROLLBACK | **PASS**, définition et ACL du moteur identiques, objets installés préservés |
| `npm run db:types` | **PASS**, génération réelle depuis `public` Local ; aucune différence avec HEAD |
| Services v1 ciblés Collections/items/manuels/contenu | **PASS — 4 fichiers / 304 tests Vitest** |
| `npm run build` | **PASS**, typecheck inclus ; warning connu bundle >500 kB |
| `npm run lint` | **PASS** |
| Package/lock | **0.8.1** aux trois emplacements ; seules ces versions changent, dépendances/outillage conservés |
| `migration list --local` | **31/31**, aucune migration en attente |
| Empreintes et contrats historiques après migration/tests | **PASS**, voir ci-dessous |
| `git diff --check`, périmètre, whitespace et liens locaux des fichiers modifiés/nouveaux | **PASS — 12 fichiers, 344 destinations locales / 72 ancres** |

Premier lint du nouveau moteur : initialisations littérales nécessitant casts explicites JSONB/text[]. Correction dans cette seule migration en cours de développement, puis refresh local de sa fonction avec définition finale. Rejeu transactionnel du fichier complet vérifié depuis absence des nouveaux objets, rollback effectué ; aucune migration antérieure modifiée, aucune réparation d’historique ni donnée utilisateur réécrite. Une erreur de priorité d’opérateurs dans le test S08 a été corrigée avant le passage complet ; aucun comportement moteur changé pour satisfaire une attente.

Tables/types privés non exposés dans `config.toml`. Révocation explicite EXECUTE et USAGE aux quatre rôles ; aucun changement des grants/RLS existants. Pas de nouveau DEFINER ni API, ni requête Auth, ni secret dans le SQL. La suite DB existante couvre les lecteurs et writers v1, MFA/propriété/RLS. Les contrôles de sécurité portent sur Supabase Local ; aucun contrôle Cloud déduit de ces résultats.

## Conservation des données réelles

Snapshot en lecture seule avant application, comparaison après migration et tests : **toutes** les tables applicatives `public/private`, leurs données complètes (nouvelles colonnes 8B.1 incluses), ACL de tables/colonnes, RLS/policies, définitions/ACL des fonctions préexistantes et vues. Seule la fonction nouvelle est exclue de la comparaison des fonctions.

| Donnée Local | Nombre identique | MD5 identique |
|---|---|---|
| Collections | 4 | `c56e6bb565e69a361b2efb0c68fadd3e` |
| Items | 660 | `73d33bb3ba435b6daba15008376109c1` |
| Variantes | 31 904 | `340e5ae3aad2633ab1a513538c293b38` |
| Exemplaires | 3 | `1639a715f67e664bff99396b0ce39771` |

Journal et reçus réels vides ; 4 parents toujours contrat 1/révision zéro. IDs, versions appliquées, positions, origines, rangs, notes, dates et partages intacts. Les MD5 d’items/collections diffèrent des projections historiques de 8B.1 parce que cette preuve inclut désormais toutes leurs colonnes ; comparaison avant/après **8B.2** exacte.

Scripts/projections de vérification temporaires et logs dans `.cache/phase8b2/`, ignoré par Git. Aucun seed, tombstone ou ordre supplémentaire persisté.

## Fichiers et références documentaires

Nouveaux : migration, suite 024, fixtures associées, ce rapport. Modifiés : `package.json`, `package-lock.json` et six références courantes : [README](../../README.md), [Fonctionnalités](../01-FEATURES.md), [Modèle](../03-DATA-MODEL.md), [Architecture](../05-ARCHITECTURE.md), [Database](../06-DATABASE.md#phase-8b2--moteur-postgresql-interne-local), [Roadmap](../08-ROADMAP.md). Roadmap maintenue au niveau macro ; rapports 8A.2/8A.3/8B.1 inchangés. Types générés identiques, aucun fichier frontend/service/script versionné modifié.

## Dépendances des futurs writers v2 et retour arrière

Le moteur peut être réutilisé **sans duplication** par aperçu/application : appelants fourniront canonique vérifié, items complets et journal en ordre explicite depuis un état transactionnel cohérent. Restent à développer dans leurs périmètres autorisés :

- normalisation des gestes sur l’ordre complet et capture R1 immuable sous verrou ; validation de la présence historique des références ; no-op sans intention et UUID de retry stable ;
- allocation monotone de révision, placement initial obligatoire et contrainte différée du manuel vivant ; conservation de l’introduction lors d’une conversion ;
- journal/reçus idempotents et conflits d’opération, nettoyage des intentions propres après retrait, nouvel UUID à la réintroduction ;
- gardes atomiques des writers v1 et v2, lecteurs/services adaptés et activation coordonnée des nouvelles créations contrat 2 ; aucun upgrade silencieux du legacy ;
- aperçu et application utilisant ce même moteur, vérifications de canonique/hash/version/révision, verrous catalogue puis parent, token/plan, allocation UUID à l’application seulement, matérialisation de la permutation et reçu atomiques ;
- masquage persistant/progression en 8C, notifications et autres fonctionnalités dans leurs blocs futurs.

Le déterminisme du moteur n’est pas une preuve d’idempotence d’application, de capture correcte, de concurrence des writers ou d’atomicité de mutations encore absentes. Aucun test multi-connexion, parcours navigateur, suite Vitest UI complète, pipeline de sync ou checkpoint Cloud entrepris : responsabilités inchangées ou hors périmètre ; preuve PostgreSQL et services v1 exécutées séparément.

Avant commit de migration : rollback SQL intégral. Après commit : conserver les nouveaux objets privés inutilisés et le stockage préparatoire, sans mutation des données ni changement de contrat. En cas de retrait logiciel futur, fermer les consommateurs et vérifier les dépendances avant une migration additive adaptée ; aucune suppression de collections/journal ou restauration de positions implicite. Reprise : mêmes entrées, mêmes résultats.

**Arrêt à 8B.2. Validation propriétaire attendue avant toute poursuite.**
