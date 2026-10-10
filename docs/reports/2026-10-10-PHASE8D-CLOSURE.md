# Phase 8D — Interface de masquage et filtres Collection

Date : **10 octobre 2026**. Version : **0.8.9**. **8D terminée et validée Local.** Actions Liste/Cartes, filtres communs, réorganisation avec masquées, Classeur compacté, focus et états vides livrés. Actualisation automatique, aperçu/application et notifications restent futurs. **Prochaine étape : 8E, non commencée.**

## État initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `e852a0a54d0dc102fd024a806a1235aee4010cdb` | Identique |
| Git | Worktree propre, aucun changement préexistant | 20 fichiers suivis modifiés, deux nouveaux ; rien indexé |
| Version package/lock | `0.8.8` | **`0.8.9`**, dépendances identiques |
| Node / npm / Supabase CLI | `24.20.0` / `12.1.0` / `2.120.0` | Inchangés |
| Migrations Local | 40, dernière `20261010140428` | 40 identiques, aucune migration créée/appliquée |
| API / PostgreSQL Local | `127.0.0.1:55321` / `127.0.0.1:55322` | Volume conservé, services utilisés réellement |
| Collections historiques | Quatre, contrat 1 / révision 0 | Identiques, 660 items visibles, trois exemplaires |

Avant modification : lecture de `AGENTS.md`, [conception 8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), [clôture 8B](2026-10-10-PHASE8B8-CLOSURE.md), [rapport 8C](2026-10-10-PHASE8C-CLOSURE.md), références Fonctionnalités/UX/Architecture/Database/Modèle/Roadmap. Inspection des vues, toolbar, recherche, capteurs DnD, pagination, hooks, services et tests. L’état Git réel a confirmé le repère fourni. Mémoire utilisée seulement pour localiser les mécanismes, puis contrats revérifiés dans le dépôt. Guides lean-build, Supabase, agent-browser et revue React appliqués ; documentation CLI consultée via Context7, changelog Supabase inspecté. Aucun accès Cloud/Vercel, reset, conversion de parent historique, commit ou push.

## Composants et responsabilité

- [CollectionContentView](../../src/features/collections/CollectionContentView.tsx) : choix `Non masquées` / `Toutes`, séquence de consultation puis recherche, eligibility des actions, état d’action exacte à reprendre, feedback et focus, état toutes masquées.
- [CollectionContentRow](../../src/features/collections/CollectionContentRow.tsx) : contrôle œil de 44 px, nom accessible, pending/coche et badge `Masquée`, sans modifier l’état de possession.
- [useBinderNavigation](../../src/features/collections/useBinderNavigation.ts) : bornage durable de la page après réduction, remappage de l’occurrence et du halo au changement de filtre.
- [CollectionContentBinder](../../src/features/collections/CollectionContentBinder.tsx) : indication de masquage sous `Toutes`, également annoncée dans le nom accessible ; aucune nouvelle action sur les pochettes.
- [CollectionProgress](../../src/features/collections/CollectionProgress.tsx) : total nul affiché `0 / 0`, `Aucune carte comptabilisée`, aucun pourcentage.
- Styles [collection-content.css](../../src/features/collections/collection-content.css) et [collection-binder.css](../../src/features/collections/collection-binder.css) : sélecteur commun MY., contrôles secondaires existants, badge indépendant, responsive et focus.

Aucun changement des services ou du hook structurel 8C, du composant DnD, des writers, du journal, du moteur PostgreSQL, du schéma ou des types générés. Tests adaptés dans Collection/Classeur/Dashboard et helper de fixture commun ; nouveau [CollectionVisibility.test.tsx](../../src/features/collections/CollectionVisibility.test.tsx).

## Filtres, masquage et focus

Le contenu complet `content.items` reste chargé dans l’ordre backend. `Non masquées` retire seulement les automatiques masquées ; les manuels restent présents. `Toutes` conserve tout. La recherche textuelle s’applique ensuite, sans écrire le cache ni trier. Le choix appartient au contenu commun monté sous la frontière viewer + collection : conservé entre les trois vues, réinitialisé à une autre collection/utilisateur, aucune préférence globale ou écriture DB.

Le propriétaire d’une collection automatique contrat 2 dispose de Masquer/Réafficher sur ses seuls automatiques en Liste/Cartes. Aucun œil pour manuel, libre, legacy, destinataire, Classeur, Détail Variante ou Exemplaires. Les actions réutilisent directement `useCollectionStructureMutation.submit({type:'hide',…})`, donc `setCollectionItemHidden`, UUID stable, révision autoritative, occupation commune, validation de résultat/reçu et relectures de contenu/ordre/résumés. Aucun second protocole de mutation/idempotence.

Carte retirée de la consultation seulement après lecture autoritative du nouvel état. Succès annoncé après confirmation complète ; sous `Toutes`, coche discrète pendant deux secondes. Sous `Non masquées`, si le contrôle disparaît et que le focus est abandonné, restitution au sélecteur stable avec `preventScroll`. Un autre contrôle déjà focalisé n’est pas interrompu. Erreur, conflit ou relecture échouée : aucun succès ; reprise explicite de l’action exacte disponible même si la carte a disparu. Réponse incertaine : mêmes UUID/état/révision ; jamais action inverse ou nouvelle intention automatique. Les tests vérifient aussi la reprise sans deuxième writer quand son succès était déjà connu mais la relecture avait échoué.

Le badge `Masquée` ne désature pas l’image et ne change pas `owned`. Une automatique masquée possédée reste identifiable comme possédée, tandis que l’atténuation des cartes manquantes conserve sa signification. Styles secondaires existants : révélation hover/focus avec pointeur fin, actions visibles avec pointeur tactile ; hauteur réelle 44 px contrôlée dans Chromium.

## Réorganisation R2

Disponibilité comparée aux correspondances textuelles et à la séquence du filtre de masquage, jamais au contenu complet. Le filtre seul et une recherche correspondant à toutes ses cartes autorisent le DnD. Une recherche réellement partielle garde la restriction existante. Capteurs, poignées, annonces, annulation et absence d’effet restent ceux de Phase 7/8B.

Preuves UI et backend navigateur :

| Geste | Ordre complet relu | Observation |
|---|---|---|
| Initial `A H B C`, H masquée ; C avant B au clavier | **`A H C B`** | Visible `A C B`, H inchangée |
| Depuis `C A H B`, C après A à la souris | **`A C H B`** | Writer reçoit `after A`, H reste avant B |
| Cartes mobile, C après une ancre visible, masquées en début/milieu/fin | Permutation engagée/relecture contrôlée | Retirer C des deux séquences donne exactement les mêmes IDs, états de masquage et ordre |

Les tests React utilisent les vrais capteurs Liste et Cartes, géométrie jsdom représentative et writers simulés. Le navigateur utilise des événements souris/clavier natifs et des événements CDP tactiles `isTrusted=true`, avec PostgreSQL/PostgREST réels. Le backend possède la traduction dans l’ordre complet ; aucun nouvel algorithme d’ordre React. Les suites DnD antérieures restent exécutées pour annulation, no-op, clavier, tactile, déplacements entre rangées et focus après relecture.

## Classeur et états vides

Le Classeur pagine la séquence du filtre choisi ; la recherche ne retire aucune carte supplémentaire des pochettes. Non-correspondances atténuées, occurrences et halo suivent cette même séquence. Changement de filtre : occurrence conservée si encore présente, sinon remplacée ; position recalculée, page réduite bornée. Aucun saut vers une page inexistante, aucune boucle ni écriture de position.

Fixture navigateur : 29 automatiques, dont onze masquées au moment de la campagne Classeur, donc 18 consultables. Ordre des premières pochettes comparé aux IDs autoritatifs ; cartes masquées replacées exactement sous `Toutes`.

| Format | Pochettes par page | Pages `Toutes` | Pages `Non masquées` |
|---|---:|---:|---:|
| `2×2` | 4 | 8 | 5 |
| `3×3` | 9 | 4 | 2 |
| `4×3` | 12 | 3 | 2 |

Pour chaque format : compactage, page directe, double ouverture 2/3, réduction depuis dernière page, borne droite, recherche Card 13, halo et non-correspondances non compactées vérifiés. Mobile : page unique, flèches clavier et swipe tactile natif, sans boucle. Tests React supplémentaires : 49 items, 20 masqués, remappage d’une occurrence conservée entre filtres et noms accessibles des cartes masquées.

Quatre états distincts : réellement vide ; cartes toutes masquées avec `Afficher toutes les cartes` ; recherche sans résultat dans le filtre ; aucun élément comptabilisé dans la progression. Toute la collection synthétique ensuite masquée via le writer existant : contenu complet de 29 items, progression `0 / 0`, texte neutre, aucune pochette/page fictive sous `Non masquées`, contenu/pages rétablis sous `Toutes`.

## Navigateur Local et partage

Chromium réel sur Vite + Supabase Local, comptes/catalogue/parents synthétiques seulement. Sessions AAL2 avec facteurs vérifiés installées pour cette campagne ; `/auth/v1/user` les reconnaît. Aucun parcours d’inscription, enrôlement ou challenge MFA prétendu testé.

Parcours propriétaire : masquer en Liste, retrouver sous `Toutes`, réafficher en Cartes, progression rechargée, R2 au clavier/souris/tactile, recherche totale/partielle, trois formats Classeur, manual non masquable, parent personnalisé vide, parent legacy, états toutes masquées. Réponse du writer volontairement perdue après commit HTTP réel : récupération du reçu, **un seul appel hide**, succès après relecture. Perte réseau simulée, aucune panne physique.

Parcours partagé à 390 px : mêmes masquages, possession et progression `0 / 18` du propriétaire ; manuel consultable, filtres et recherche Classeur, exemplaire et note autorisés d’Alpha même masquée sous `Toutes`. Aucun œil, DnD, FAB ou contrôle d’édition. Les refus HTTP/security restent vérifiés par l’intégration Local et les scripts API.

Desktop `1280×900`, mobile `390×844` : absence d’overflow horizontal, toolbar commune, focus et contrôles de 44 px. Pointeur tactile réellement émulé (`pointer: coarse`), actions Cartes d’opacité 1. Captures inspectées visuellement. Aucun matériel tactile physique testé.

Des essais de harness intermédiaires ont nécessité correction : champs Auth synthétiques NULL, vérificateur SQL triant une projection texte de position, coordonnées/transition du geste souris et attentes sur une note repliée. Aucun correctif produit/backend justifié par ces erreurs. Seuls les parcours finalement réussis avec permutation engagée et relue constituent les preuves ci-dessus.

## Validation exécutée

| Contrôle | Résultat |
|---|---|
| Frontend complet `npm run test -- --maxWorkers=2` | **65 fichiers / 1 982 tests PASS**, un fichier/test Local opt-in sauté dans cette commande |
| Tests UI masquage/Classeur ciblés | **36 tests PASS** |
| Intégration services/hooks Local opt-in | **1 test PASS**, SDK/PostgREST/PostgreSQL réels, progression, reçus, conflits et refus |
| PostgreSQL complet `npm run db:test` | **31 fichiers / 3 085 assertions PASS** |
| Concurrence masquage | PASS : quatre connexions, attentes parent observées, hide/reorder/add/remove, UUID simultané, rollback, autorisations relues |
| API lecteur v2 | PASS : 1 005 items, snapshot concurrent, BIGINT exact, contrats/reçus et partage |
| API activation | PASS : nouvelles créations v2, coexistence legacy, cycles de vie, copies/notes, droits et HTTP 409 |
| SQL lint public/private | PASS, aucun warning |
| Security advisors Local | **0 WARN/ERROR**, quatre INFO privées attendues |
| Build/typecheck / ESLint | PASS |
| Régénération des types | Identiques à HEAD, aucun diff de types/migrations |
| Graphe package/lock | Identique après exclusion des trois champs de version |
| `git diff --check` et liens documentaires locaux | PASS |
| Données/droits/backend avant/après nettoyage | PASS, snapshots exacts |

Les sept autres scripts historiques de concurrence n’ont pas été relancés individuellement en 8D : aucun backend changé ; suite PostgreSQL complète, script masquage interopérant avec tous les writers, deux scripts API et intégration Local exécutés. Leurs preuves 8C demeurent historiques, non attribuées à cette campagne. Warning existant de taille de bundle conservé, aucun travail de bundle engagé.

## Conservation et documentation

Snapshots avant/après de toutes les lignes des 19 tables public/private, `auth.users`/`auth.sessions`, ACL tables/colonnes/fonctions, RLS/policies, définitions de vues et fonctions. Comparaison exacte sans exclusion de colonne. Fixtures browser/HTTP/concurrence supprimées, fichiers privés de session retirés, sessions navigateur fermées. Supabase Local reste en fonctionnement ; serveur Vite lancé pour l’audit arrêté.

| Données historiques | Avant = après | MD5 JSON ordonné |
|---|---:|---|
| Collections | **4**, contrat 1 / révision 0 | `c56e6bb565e69a361b2efb0c68fadd3e` |
| Items | **660**, aucun masqué | `21f9ea3990e6f522a72565b8d3710cf9` |
| Variantes catalogue | **31 904** | `340e5ae3aad2633ab1a513538c293b38` |
| Exemplaires/notes | **3** | `1639a715f67e664bff99396b0ce39771` |

Profils, préférences, partages, états catalogue, intentions/reçus, positions, origines, rangs, versions appliquées et timestamps historiques identiques. Aucun writer, moteur, schéma, migration ou type backend modifié. Retour arrière logiciel : retirer les consommateurs UI/CSS 8D si nécessaire, conserver les contrats/données 8C et les writers adaptés à chaque parent ; aucune contraction ou conversion exécutée.

Version `package.json`/`package-lock.json` **0.8.8 → 0.8.9**, aucune dépendance mise à jour. README, références 01/03/04/05/06 et roadmap 08 synchronisés ; rapports 8A/8B/8C préservés. Roadmap macro : Phase 8 reste en développement, 8D livrée, 8E prochaine étape. Les futures actualisation et notifications restent explicitement non implémentées.

Artefacts Local ignorés dans `.cache/phase8d/` : snapshots avant/après, logs des suites et contrôles, traces RPC, permutations et événements tactiles, captures desktop/mobile et scripts du harness. Les tests React et adaptations de fixtures sont versionnables ; secrets/session Auth ne sont pas versionnés.

**8D clôturée Local : comportements essentiels vérifiés, aucun défaut bloquant restant dans le périmètre.** Limites conservées : matériel tactile physique et Cloud non exercés ; incertitude/reçus limitée au même onglet selon le contrat 8B/8C, fermeture permanente et stockage corrompu inchangés. Arrêt à 8D ; **8E non commencée, aucun commit ni push**.
