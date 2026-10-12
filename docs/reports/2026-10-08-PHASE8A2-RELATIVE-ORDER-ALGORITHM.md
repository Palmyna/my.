# Phase 8A.2 — Conception de l’algorithme d’ordre relatif

Date : **8 octobre 2026**. Version applicative conservée : **0.7.21**.

## Statut et périmètre

**Proposition algorithmique et documentaire, soumise à validation du propriétaire.** Les règles de 8A.1 restent acquises ; les recommandations R1 à R4 ci-dessous ne deviennent pas des décisions approuvées par la rédaction de ce rapport. Aucun développement 8A.3/8B n’est engagé.

Le livrable décrit des données et opérations **logiques** : aucune table, colonne, RPC, signature frontend, migration ou stratégie de stockage n’est choisie. Les mots « journal », « identité » et « contexte » désignent les informations nécessaires au calcul, indépendamment de leur future représentation.

## État initial et sources inspectées

| Contrôle | Constat local |
|---|---|
| Branche | `dev` |
| HEAD | `c59b28095111ad8c1174aefa11de13e64caed0fe` — `Phase 8A.1` |
| Git initial | Arbre propre ; aucune modification préexistante ni fichier staged |
| Consignes | `AGENTS.md` lu ; aucune autre instruction `AGENTS.md` trouvée dans le dépôt |
| Portée des preuves | Lecture des fichiers du dépôt et calculs abstraits en mémoire ; aucune consultation de base Local ou Cloud |

Décisions de référence lues : [Fonctionnalités](../01-FEATURES.md#réordonnancement-relatif--décisions-phase-8), [Modèle de données](../03-DATA-MODEL.md#ordre-dune-collection), [Database](../06-DATABASE.md#contrats-projetés-phase-8--non-implémentés), [Roadmap](../08-ROADMAP.md#phase-8--actualisation-masquage-et-notifications). Les sections d’actualisation, conversion, masquage, exemplaires et ordre ont également été examinées.

### Mécanismes livrés à préserver

| Responsabilité actuelle | Sources et comportement inspectés |
|---|---|
| Canonique | [Calcul Phase 5](../../supabase/migrations/20260920134607_phase5_canonical_collection_structure.sql) et [tests](../../supabase/tests/database/010_canonical_collection_structure.test.sql) : variantes éligibles uniques, rangs continus ; Pokémon par date effective puis numéro/famille/départages stables ; Extension sans date. Le calcul canonique demeure autoritatif. |
| Création automatique | [Migration](../../supabase/migrations/20260920140934_phase5_create_automatic_collection.sql), [tests](../../supabase/tests/database/011_create_automatic_collection.test.sql), [service](../../src/services/collections.ts) et [tests du service](../../src/services/collections.test.ts) : contrôle identité/MFA/profil, cible/version/hash cohérents, `sort_position` initialisé au rang ; une collection personnelle existante est retournée intacte. Unicité propriétaire/cible et atomicité. |
| Ajout/retrait manuel | [Migration 6C.1](../../supabase/migrations/20260926070705_phase6c1_manual_collection_items.sql), [pgTAP](../../supabase/tests/database/016_manual_collection_items.test.sql), [service](../../src/services/collection-items.ts) et [tests](../../src/services/manual-collection-items.test.ts) : variante exacte, ajout début/fin, origine manuelle sans rang, doublon refusé ; retrait manuel seulement, sans compaction ni suppression d’exemplaires. Les manuels devenus inéligibles restent présents jusqu’au retrait propriétaire. |
| Réorganisation | [Migration 6A.3](../../supabase/migrations/20260923195220_phase6a3_reorder_collection_item.sql) et [pgTAP](../../supabase/tests/database/014_collection_reorder.test.sql) : retirer le seul élément déplacé puis insérer début/fin/avant/après ; midpoint exact ou rééquilibrage conservant l’ordre logique ; `sort_position, id` départage les égalités existantes. Origine, rang, catalogue, cible/version et autres collections préservés. |
| Sérialisation | Ajout, retrait et déplacement verrouillent le même parent avant lecture des voisins ; lectures après attente sous `READ COMMITTED`. Le verrou de catalogue de la création empêche la lecture d’une sync partielle. Les contrôles futurs devront articuler ces responsabilités, sans décider leurs mécanismes ici. |
| Lecteurs/UI | [Contenu autoritatif](../../supabase/migrations/20261007085921_phase7f1_navigation_contracts.sql), [DnD commun Liste/Cartes](../../src/features/collections/CollectionItemReorderList.tsx), [hook](../../src/features/collections/useCollectionItemReorder.ts), [vue](../../src/features/collections/CollectionContentView.tsx) : ordre backend, geste portant sur un élément et une ancre, relectures après succès ou erreur ; aucune position numérique calculée par le frontend. Recherche partielle bloque le reorder ; partage reste consultatif. |

Tests UI/services examinés également : [ordre](../../src/services/collection-items.test.ts), [Liste](../../src/features/collections/CollectionItemReorderList.test.tsx), [Cartes](../../src/features/collections/CollectionCardsReorder.test.tsx), [hook](../../src/features/collections/useCollectionItemReorder.test.tsx). Ils couvrent notamment les destinations logiques, gestes annulés, blocage concurrent, ordre temporaire et confirmation par relecture. **Inspection de leurs assertions, pas nouvelle exécution de ces suites.**

Les writers actuels ne mémorisent **aucune intention relative**. Une position matérialisée ne permet pas de retrouver la chronologie des gestes. Aucune reconstruction des anciennes intentions ni intervention sur les collections de test pendant 8A.2.

## Règles validées et invariants

### Règles métier acquises

1. Construire d’abord toute la nouvelle séquence canonique, nouveaux éléments et nouveaux rangs compris ; appliquer ensuite les personnalisations chronologiquement.
2. Une intention personnelle signifie « cet élément avant cet autre élément », ou **fin explicite**. Les placements manuels suivent la même règle.
3. Une ancre disparue se replie sur la prochaine carte encore présente dans l’ancien ordre ; aucun successeur → fin.
4. Préserver les manuels restant hors canonique, les exemplaires physiques globaux au compte et toutes leurs informations, dont les notes.
5. Manuel devenu éligible → conversion du **même élément**, sans doublon ; conserver sa personnalisation autant que possible. Un ancien automatique devenu inéligible est retiré après validation, sans conversion automatique → manuel inventée.
6. Automatiques conservés → masquage conservé ; nouveaux automatiques et manuels convertis → visibles par défaut. Le masquage ne modifie ni l’ordre ni les exemplaires.
7. Tous les éléments, masqués compris, participent au calcul. Possession, filtres et recherche ne changent pas le canonique ni le journal des intentions.
8. Résultat déterministe et reproductible pour les mêmes entrées ; nouvelle application identique ne doit pas faire dériver l’ordre.
9. Validation propriétaire, aperçu cohérent, contrôle de concurrence et application atomique restent obligatoires autour du calcul.

### Identités et deux ordres distincts

Dans les exemples, une lettre désigne un **élément pour une variante exacte**, pas une carte source regroupant plusieurs variantes. Une même variante apparaît une seule fois. Deux variantes d’une même carte restent deux éléments distincts, éventuellement non adjacents.

L’identité de variante sert à trouver l’élément existant à conserver ou convertir. L’identité d’élément sert à référencer une intention personnelle : la conversion conserve cette identité. Une suppression puis un nouvel ajout de la même variante n’est pas une conversion ; voir R3.

Le canonique est une liste ordonnée indépendante des intentions. L’ordre personnel résultant est une autre liste. Après rejeu, une nouvelle automatique peut ne plus être adjacente à son prédécesseur canonique : celui-ci peut avoir été déplacé personnellement. L’insertion « après le prédécesseur canonique » décrit la **construction initiale**, pas une contrainte finale qui déplacerait un groupe avec son prédécesseur.

### Invariants du calcul

| Moment | Invariant |
|---|---|
| Avant fusion | Canonique ancien et cible sans doublon de variante ; items actuels uniques ; chronologie totale des intentions acceptées ; contextes de repli complets et immuables ; aucune référence inter-collection ou auto-ancre. |
| Après constitution de l’univers cible | Exactement une identité par variante cible ou manuelle conservée. Identités des automatiques conservés et des convertis inchangées ; automatiques retirés absents ; manuels non éligibles toujours présents. |
| Avant/après chaque placement | Même ensemble d’éléments, une occurrence de chacun. Seul l’élément désigné est extrait/réinséré. Supprimer cet élément des deux séquences donne exactement la même liste, masqués compris. |
| Après placement avant ancre | Élément immédiatement avant l’ancre résolue dans l’ordre complet ; aucun déplacement d’un bloc de voisins. |
| Après placement en fin | Élément dernier dans l’ordre complet, masqués compris. |
| Pendant tout le rejeu | Aucun changement de variante, origine cible, rang canonique, masquage, exemplaire ou note ; aucune mutation du canonique ni du journal. |
| En sortie | Liste = permutation exacte de l’univers cible ; rangs automatiques issus uniquement du canonique cible ; résultat indépendant des filtres, de la possession et de l’ordre physique de lecture des données. |

L’invariant de préservation des autres éléments porte sur leur **ordre relatif**, pas sur leurs indices absolus : déplacer un élément fait nécessairement varier certains indices. Un rééquilibrage numérique futur peut réécrire des positions tout en respectant cette permutation ; il ne constitue pas un geste personnel sur les éléments masqués.

## Entrées logiquement nécessaires

| Information | Nécessité |
|---|---|
| Canonique de la version réellement appliquée | Identifier ajouts, retraits, conversions et changements de rang dans l’aperçu ; jamais déduire cet ordre du rendu filtré. |
| Canonique cible complet, ordonné, avec identité de variante et rang | Fournir la base autoritative de reconstruction ; inclure toutes les nouvelles automatiques en une seule séquence. |
| Ensemble actuel complet des éléments | Identité stable, variante exacte, origine actuelle et masquage ; inclure masqués et manuels même devenus inéligibles. Sert à conserver les identités et déterminer les retraits. |
| Placements personnels acceptés dans un ordre total | Sujet, destination `avant(ancre)` ou `fin`, identité de l’opération, rang chronologique ; insertion manuelle initiale comprise. Les opérations sur des éléments désormais absents restent identifiables. |
| Contexte historique de chaque destination avant | Sous recommandation R1 : ordre complet juste avant l’opération, ou information équivalente donnant tous les successeurs de l’ancre dans cet ordre, en excluant le sujet. Inclure automatiques, manuels et masqués. |
| Cycle de vie des éléments manuels | Reconnaître les éléments toujours vivants, ceux retirés et les nouveaux ajouts ; ordre d’introduction des manuels conservés. Ne jamais ressusciter un élément supprimé en rejouant son ajout. |
| État cohérent présenté/accepté | Version cible et révision de l’état personnel utilisées par l’aperçu ; nécessaires au contrôle externe, sans fixer leur représentation. |

Les exemplaires et leurs notes ne sont pas des entrées du **tri** : aucune branche de l’algorithme ne les consulte. Leur préservation intégrale est une condition du futur traitement transactionnel.

Un timestamp seul avec des égalités ne définit pas une chronologie. Exiger un ordre total correspondant à l’ordre effectif d’acceptation des mutations ; ne pas départager arbitrairement des gestes concurrents par l’ID de la carte. Le choix technique relève de 8A.3.

## Normalisation des gestes en intentions

Cette étape décrit ce que le futur writer doit savoir au moment du geste, sans choisir son contrat :

- `avant(a)` reste `avant(a)` ; sujet et ancre distincts, présents dans la collection.
- `après(a)` devient `avant(s)` où `s` est le successeur de `a` dans **l’ordre complet après extraction du sujet** ; sans successeur, devenir `fin`.
- `début` devient `avant(premier)` dans l’ordre complet après extraction du sujet ; collection restante vide → `fin`.
- `fin` reste explicite ; elle ne signifie pas « après la dernière carte actuelle ».
- Ajout manuel : créer l’identité, enregistrer aussi son premier placement. Début/fin actuels se normalisent de la même façon ; un placement précis ultérieur reste une opération distincte.

Le placement initial d’un manuel doit être conservé **même lorsqu’il est fin par défaut**. Sinon sa conversion ultérieure perdrait cette personnalisation. Un ajout dans une collection vide se normalise en fin : lors d’une future arrivée d’automatiques, l’élément reste en fin par ce principe relatif.

« Début » n’est donc pas une contrainte permanente de tête absolue : `D avant A` suivi d’un canonique commençant désormais par `X A` donne `X D A …`. C’est une conséquence du vocabulaire validé avant/fin, illustrée par S05.

La normalisation se fait une fois depuis l’état autoritatif du geste ; les actualisations ultérieures ne recalculent pas un ancien « après » avec de nouveaux voisins. Une requête refusée/annulée ne crée aucune intention. Déduplication des retries et traitement des gestes sans effet : voir R4 et exigences 8A.3.

## Algorithme proposé

**Le calcul ci-dessous adopte la recommandation R1 pour définir l’ancien ordre de repli.** R2 concerne la traduction d’un geste dans une vue partielle ; R3 son identité en cas de réintroduction. Une fois les entrées normalisées fixées, la fusion produit un résultat unique sans choix supplémentaire.

### 1. Constituer l’univers et la base

Parcourir le canonique cible dans son ordre autoritatif. Pour chaque variante :

- réutiliser l’automatique actuel correspondant s’il existe ;
- sinon réutiliser et convertir le manuel correspondant s’il existe ;
- sinon prévoir un nouvel automatique, avec une identité logique distincte des éléments retirés.

Ne pas créer de seconde occurrence pour une conversion. Affecter aux automatiques leurs nouveaux rangs, indépendamment de leur future position personnelle. Préserver le masquage des automatiques conservés ; nouveaux/convertis visibles.

Ajouter provisoirement à la fin de cette base les manuels vivants hors canonique, dans leur ordre d’introduction. Cette fin provisoire est une **initialisation du calcul**, pas leur destination personnelle finale. Tous leurs placements initiaux et déplacements seront rejoués. Les éléments manuels retirés sont absents de l’univers, même si un ancien ajout figure dans la chronologie.

Tous les manuels vivants sont donc disponibles dès le début du calcul, y compris ceux introduits tard dans le journal. Une intention antérieure ne peut légalement les désigner comme ancre avant leur introduction ; les contextes historiques de repli ne les contiennent pas non plus. Les placements initiaux des manuels sont indispensables pour que cette base neutre ne devienne pas un placement arbitraire.

### 2. Rejouer toute la chronologie

Pour chaque placement personnel, dans l’ordre d’acceptation :

1. Si le sujet n’appartient plus à l’univers cible, ne rien déplacer ; signaler ce placement comme inapplicable au calcul courant. Ne pas ressusciter le sujet.
2. Destination fin → extraire le sujet puis l’ajouter en fin.
3. Destination avant et ancre toujours présente → utiliser sa **position actuelle dans le rejeu**, même si une opération antérieure l’a déplacée.
4. Ancre absente → parcourir ses successeurs historiques sous R1, dans l’ordre mémorisé, et retenir le premier élément encore présent, différent du sujet. Les masqués et les manuels sont des candidats comme les autres.
5. Aucun successeur présent → fin.
6. Extraire seulement le sujet, puis l’insérer immédiatement avant l’ancre résolue, ou en fin.

Le repli ne suit ni le rang actuel du sujet, ni le nouvel ordre canonique, ni une chaîne de contraintes personnelles. Un successeur historique déplacé reste admissible : insertion devant sa position courante. On ne fabrique pas de repli vers une nouvelle automatique qui n’existait pas dans le contexte historique.

### 3. Déplacements répétés et dépendances

Rejouer **toutes** les opérations, y compris les déplacements antérieurs du même sujet. La dernière opération du sujet intervient en dernier pour ce sujet, mais les opérations intermédiaires ont pu modifier la position d’une autre ancre.

Exemple S08 : `C avant A`, puis `D avant C`, puis `C avant B`, sur `A X B C D`, donne `D A X C B`. Ne garder que le dernier placement de chaque élément laisse `D avant C`, puis `C avant B`, et donne `A X C B D`. La simplification « un dernier placement par élément » est donc incorrecte sans preuve d’équivalence pour la totalité des entrées futures.

Les relations sont des **actions chronologiques**, pas des contraintes éternelles à satisfaire simultanément. `C avant B`, puis `B avant C` est valide : la seconde action peut défaire la première. Un déplacement ultérieur de l’ancre n’entraîne pas le sujet avec elle (S10). Aucun tri topologique ni résolution de cycle n’est nécessaire.

### 4. Sortie et application externe

Le calcul retourne la séquence finale complète et les classifications ajout/retrait/conversion/rangs, avec la trace logique des replis et placements inapplicables utile à la vérification. Le format de cette information demeure ouvert.

L’aperçu et l’application doivent calculer la même séquence pour le même état accepté. Si catalogue, ordre personnel, manuels ou masquage ont changé entre les deux, le futur protocole doit empêcher l’application d’un aperçu incohérent ; aucune politique de confirmation concurrente n’est choisie ici.

## Pseudo-code indépendant de la technologie

```text
NORMALISER_GESTE(ordre_complet, sujet, geste):
    vérifier identité du sujet, variante et droits avant acceptation
    pour un déplacement, exiger sujet présent dans ordre_complet
    pour un ajout, exiger nouvelle identité et variante non déjà présente
    reste := ordre_complet sans sujet

    si geste = FIN:
        destination := FIN
    sinon si geste = DEBUT:
        destination := AVANT(premier(reste)) si reste non vide, sinon FIN
    sinon si geste = AVANT(ancre):
        exiger ancre dans reste
        destination := AVANT(ancre)
    sinon si geste = APRES(ancre):
        exiger ancre dans reste
        suivant := successeur(ancre, reste)
        destination := AVANT(suivant) si suivant existe, sinon FIN

    si destination = AVANT(ancre):
        contexte := suffixe de ordre_complet strictement après ancre,
                    en excluant sujet                    # recommandation R1
    sinon:
        contexte := liste vide

    retourner intention(sujet, destination, contexte)
    # Acceptation, ordre chronologique et déduplication : exigences externes.

FUSIONNER(canonique_cible, elements_actuels, placements_ordonnes):
    VALIDER_ENTREES(canonique_cible, elements_actuels, placements_ordonnes)
    sequence := liste vide
    classement := correspondances logiques vides

    pour chaque variante dans canonique_cible, par rang canonique:
        existant := unique élément actuel de cette variante, si présent
        si existant existe:
            element := existant                         # identité conservée
            noter conservation ou conversion selon origine actuelle
        sinon:
            element := nouveau symbole d’élément pour cette variante
            noter ajout
        noter origine cible AUTOMATIQUE et rang canonique
        noter masquage conservé seulement si existant était automatique
        ajouter element en fin de sequence

    manuels := éléments actuels MANUELS hors canonique_cible,
               par ordre d’introduction
    ajouter manuels en fin de sequence
    noter retrait des automatiques actuels hors canonique_cible
    univers := ensemble(sequence)                       # fixe pendant le rejeu

    pour chaque intention dans placements_ordonnes:
        sujet := intention.sujet
        si sujet absent de univers:
            noter intention inapplicable
            continuer

        si intention.destination = FIN:
            ancre_resolue := aucune
        sinon:
            ancre := intention.destination.ancre
            si ancre présente dans univers:
                ancre_resolue := ancre
            sinon:
                ancre_resolue := premier candidat de intention.contexte
                                 présent dans univers et différent de sujet
                # Aucun candidat => aucune ancre, donc FIN.

        avant := copie(sequence)
        sequence := sequence sans sujet
        si ancre_resolue existe:
            insérer sujet juste avant ancre_resolue dans sequence
        sinon:
            ajouter sujet en fin de sequence

        exiger ensemble(sequence) = univers et aucune occurrence multiple
        exiger (avant sans sujet) = (sequence sans sujet)
        # Métadonnées, canonique et intentions inchangés par cette opération.

    vérifier permutation exacte de univers et classifications cohérentes
    retourner sequence, classement
```

`nouveau symbole` signifie une identité logique à matérialiser ultérieurement. Le calcul d’ordre n’utilise aucun UUID aléatoire comme départage. La génération et la stabilité des identités lors d’un retry relèvent de 8A.3 ; la séquence de variantes et les identités réutilisées doivent rester reproductibles.

Entrées invalides → échec explicite, pas réparation silencieuse : canonique dupliqué, chronologie indéterminée, identité incompatible, ancre égale au sujet, contexte nécessaire manquant, manuel vivant sans placement initial, référence historiquement impossible ou inter-collection. Une ancre historiquement valide devenue absente est un cas normal de repli, distinct d’une entrée invalide.

Une implémentation simple par listes suffit à spécifier le comportement : coût du rejeu proportionnel à la longueur des listes déplacées et des contextes parcourus. Aucun choix d’indexation, compression ou optimisation n’est exigé ici ; une optimisation future doit préserver exactement ce calcul.

## Matrice de scénarios

Notation commune : `u<v` = placement de `u` avant `v` ; `u>` = fin explicite ; `+M>` / `+M<A` = ajout manuel puis premier placement ; `-M` = retrait manuel, qui fixe son absence de l’univers final ; `;` sépare les opérations chronologiques. `@…` indique une actualisation intermédiaire déjà acceptée, **sans créer une intention personnelle**. `∅` = liste vide.

Les noms `M` et `N` désignent des manuels, sauf conversion explicitée. Les autres lettres sont automatiques. Les contextes R1 sont calculés depuis l’ordre complet **juste avant chaque opération** ; une insertion manuelle capture le contexte avant introduction de son sujet. Les opérations précédentes et les actualisations intermédiaires sont prises en compte. Les contextes sont ensuite immuables. Les résultats ci-dessous incluent toujours les masqués.

**Résultats attendus sous R1 ; traduction des gestes filtrés explicitée sous R2.** Les colonnes de résultats sont les attentes de conception vérifiées, pas des résultats d’une application livrée.

| ID | Ancien canonique | Personnalisations chronologiques | Nouveau canonique | Contexte particulier | Résultat complet attendu | Justification |
|---|---|---|---|---|---|---|
| S01 | `A B C D` | ∅ | `A B C D` | Aucun manuel | `A B C D` | Reconstruction identique sans intention. |
| S02 | `A B C D` | ∅ | `A X Y B C Z D` | Ajouts multiples | `A X Y B C Z D` | Tous les ajouts restent à leurs rangs canoniques. |
| A | `A B C D` | `C<A` | `A X B C D` | Exemple obligatoire A | **`C A X B D`** | Extraire C de la nouvelle base, puis l’insérer avant A. |
| B | `A B C D` | `C<B` | `A X B C D` | Exemple obligatoire B | **`A X C B D`** | X est initialement avant B ; C vient ensuite immédiatement avant B. |
| S05 | `A B C D` | `D<A` | `X A B C D` | D placé en début au moment du geste | `X D A B C` | Intention avant A ; X nouvellement en tête reste devant D. |
| S06 | `A B C D` | `B>` | `A X B C Y D Z` | Plusieurs ajouts, dont nouvelle dernière carte | `A X C Y D Z B` | Fin explicite dépasse aussi la nouvelle fin canonique Z. |
| S07 | `A B C D` | `C<A; D<B` | `A X B C D` | Deux sujets | `C A X D B` | Rejeu C puis D ; aucun déplacement de bloc. |
| S08 | `A B C D` | `C<A; D<C; C<B` | `A X B C D` | Même sujet C répété, dépendance D→C | `D A X C B` | Le premier geste de C influence D ; le dernier ne transporte pas D. |
| S09 | `A B C D` | `B>; C<B` | `A X B C D` | Ancre déplacée avant utilisation | `A X D C B` | C se place devant la position courante de B, déjà en fin. |
| S10 | `A B C D` | `C<B; B>` | `A X B C D` | Ancre déplacée après utilisation | `A X C D B` | Déplacer B ne déplace pas C avec lui. |
| S11 | `A B C D` | `C<B; B<C` | `A X B C D` | Relations réciproques | `A X B C D` | Actions chronologiques valides, pas contraintes simultanées. |
| S12 | `A B C D` | `D<B; C<B` | `A X Y Z B C D` | X/Y/Z partagent le même intervalle canonique | `A X Y Z D C B` | Leur ordre canonique reste X/Y/Z ; D puis C se placent devant B. |
| S13 | `A B C D` | `D<B` | `A C D` | B disparaît ; contexte `[C]` | `A D C` | Repli devant C, première survivante après B hors sujet. |
| S14 | `A B C D` | `D<A` | `C D` | A et B disparaissent ; contexte `[B C]` | `D C` | Ignorer B absent, retenir C ; D lui-même ne peut être repli. |
| S15 | `A B C D` | `A<D` | `A B C` | D disparaît sans successeur | `B C A` | Repli en fin. |
| S16 | `A B C D` | `D<A` | `A B C` | D automatique retiré | `A B C` | Opération de D inapplicable ; aucune résurrection, exemplaires conservés. |
| S17 | `A B C D` | `D<A; C<B` | `A C D` | Avant C<B, ancien ordre complet `D A B C` | `D A C` | Suffixe de B = C, sujet exclu → fin ; ne pas utiliser l’ancien canonique comme repli. |
| S18 | `A B C` | `+M>; M<B` | `A X B C` | M manuel | `A X M B C` | Le placement initial et le déplacement du manuel sont rejoués. |
| S19 | `A B C` | `+M<A; +N>; N<M` | `A X B C` | Deux manuels, ancre manuelle | `N M A X B C` | M avant A ; N ensuite devant M. |
| S20 | `A B C` | `+M>; M<B` | `A M X B C` | M converti en automatique | `A X M B C` | Même identité de M, rang canonique 2, position personnelle avant B conservée. |
| S21 | `A B C` | `+M>` | `A M B C` | M converti, aucun déplacement ultérieur | `A B C M` | L’ajout en fin est lui-même une intention ; conversion ne l’efface pas. |
| S22 | `A B C D` | ∅ | `D C B A` | Rangs seuls changés | `D C B A` | Aucun geste à préserver : suivre le nouvel ordre canonique. |
| S23 | `A B C D` | `C<A` | `D C B A` | Rangs seuls changés, personnalisation présente | `D B C A` | Extraire C de la nouvelle base et le placer devant A ; les autres suivent le canonique cible. |
| S24 | `A H B C` | `C<H` | `A X H B C` | H automatique masqué | `A X C H B` | H reste une ancre valide ; affichage Non masquées = A X C B. |
| S25 | `A H B C` | `C<B` | `A H B C` | H masqué ; geste visible C avant B | `A H C B` | Extraire C seulement ; liste des autres = A H B avant/après. |
| S26 | `H A B K` | `B<A` | `H A B K` | H/K masqués ; B déplacé au début visible | `H B A K` | Avant première visible A, pas avant le masqué H. |
| S27 | `H A B K` | `A<K` | `H A B K` | H/K masqués ; geste après dernière visible B | `H B A K` | Normaliser après B en avant son successeur complet K ; fin visible ≠ fin explicite. |
| S28 | `A B C` | `+M>; A<M; -M` | `A X B C` | Ancre manuelle retirée, aucun successeur | `X B C A` | M reste absent ; A se replie en fin, ajout historique de M inapplicable. |
| S29 | `A B C` | `+M>; +N>; A<M; -M` | `A X B C` | M retiré, N manuel survivant ; contexte `[N]` | `X B C A N` | Le successeur manuel N est un repli valide. |
| S30 | `A B C` | `+M>; M<A` | ∅ | Tous les automatiques retirés ; M demeure manuel | `M` | Sujet préservé, aucun repli survivant ; aucun exemplaire supprimé. |
| S31 | ∅ | `+M>; +N<M` | `X Y` | Ancienne cible vide après actualisation ; deux manuels | `X Y N M` | N devant M, M en fin après les nouvelles automatiques. |
| S32 | `A B C D` | `C<B` | `A X B C D` | Première actualisation d’une série | `A X C B D` | Contexte de C<B enregistré à l’origine : `[D]`. |
| S33 | `A B C D` | `C<B; @A X B C D; D<X` | `A X Y B C D` | Deuxième actualisation après nouveau geste | `A D X Y C B` | Garder C<B d’origine ; D<X est enregistré sur A X C B D, contexte `[C B]`. |
| S34 | `A B C D` | `C<B; @A X B C D; D<X` | `A X Y C D` | Deuxième actualisation avec B désormais absent | `A D X Y C` | C<B se replie sur D d’après son contexte d’origine ; D<X est rejoué ensuite. |
| S35 | `A B C D` | `D<C; C<B; A<B` | `A B C D` | Même fusion calculée deux fois | `C A B D` | Deux reconstructions depuis ABCD donnent CABD ; voir preuve d’idempotence ci-dessous. |
| S36 | `A B H C D` | `D<B` | `A H C D` | B disparaît ; H masqué, contexte `[H C]` | `A D H C` | Le premier successeur survivant H compte malgré son masquage. |

S30/S31 prouvent que le **calcul** est défini pour une liste canonique vide. La création automatique livrée refuse une nouvelle cible vide ; cette restriction de création ne doit pas être copiée implicitement dans l’actualisation future. Le protocole 8A.3 devra rendre ce cas explicite, conformément aux retraits et à la préservation des manuels, sans autoriser ici une création vide.

### Vérification explicite des exemples A/B

```text
Base cible commune : A X B C D
A : extraire C → A X B D ; insérer avant A → C A X B D
B : extraire C → A X B D ; insérer avant B → A X C B D
```

Aucun cas spécial pour A, B ou X : même primitive d’extraction/insertion que pour un manuel, une conversion ou une ancre masquée.

### Idempotence et actualisations successives

Soit `F(C, U, E)` la reconstruction depuis le canonique cible C, l’univers vivant U et les intentions E avec leurs contextes immuables. Mêmes entrées → même base → mêmes ancres résolues → mêmes opérations → même sortie. Le calcul ne modifie ni C ni E. Une nouvelle exécution complète reconstruit la base, même si un ordre personnel était déjà matérialisé.

**Ne pas confondre avec le rejeu du journal sur sa propre sortie.** S35 donne :

```text
Reconstruction 1 depuis A B C D → C A B D
Reconstruction 2 depuis A B C D → C A B D
Rejeu incorrect sur C A B D     → D C A B
```

Le deuxième résultat erroné montre pourquoi un retry ne doit pas partir du rendu déjà personnalisé. Une conversion précédemment appliquée garde l’identité et les mêmes placements ; un ajout précédemment appliqué ne recrée pas d’item ; les manuels hors canonique gardent leur ordre logique d’introduction. Ces conditions sont nécessaires à l’idempotence de l’application, distincte du déterminisme de la fonction pure.

Après une première actualisation, les nouveaux gestes sont enregistrés avec le contexte complet de cette nouvelle époque et ajoutés à la chronologie. Les contextes des gestes précédents restent inchangés. Les actualisations elles-mêmes ne sont ni des gestes propriétaires ni des remplacements du journal. S32–S34 couvrent cette succession, y compris le repli ultérieur d’une vieille intention.

## Arbitrages métier ouverts

### R1 — Quel « ancien ordre » et à quel instant ?

**Ambiguïté avérée.** 8A.1 ne précise pas si le repli utilise l’ancien canonique, l’ordre personnel avant l’actualisation, ou l’ordre complet au moment de chaque intention. Ces listes peuvent avoir des successeurs différents.

S17 : ancien canonique `A B C D`, gestes `D avant A`, puis `C avant B`, nouveau canonique `A C D`.

- Ancien canonique : après B viennent C/D ; exclure le sujet C → D. Rejeu D<A puis C<D → **`C D A`**.
- Ordre complet au moment du second geste : `D A B C` ; après B ne reste que le sujet C → aucun successeur. Rejeu → **`D A C`**.

L’instant de capture importe aussi entre actualisations. À l’origine, `C avant B` sur `A B C D` a le repli D. Après actualisation vers `A B Y C D`, l’ordre personnel est `A C B Y D`. Lors d’un retrait ultérieur de B avec cible `A Y C D`, le contexte d’origine mène à **`A Y C D`** ; le suffixe de l’ordre personnel juste avant cette deuxième actualisation mène à **`A C Y D`**. Les deux lectures de « ancien » sont possibles sans précision supplémentaire.

**Recommandation à valider :** ordre complet autoritatif **juste avant chaque intention acceptée**, masqués/manuels compris ; conserver la liste des successeurs de l’ancre, sujet exclu, ou un contexte logiquement équivalent. Choisir à chaque fusion le premier survivant de cette liste immuable. Cette lecture conserve le contexte du geste et évite qu’un retry ou une actualisation sans nouveau geste réécrive l’intention.

L’algorithme et les résultats conditionnels de la matrice utilisent cette recommandation. Si le propriétaire choisit un autre ancien ordre, préciser également son instant, sa conservation entre versions et le traitement des candidats ajoutés après le geste ; réviser les attentes concernées avant 8A.3.

### R2 — Destination dans un intervalle contenant des masqués

**Ambiguïté de geste, pas du rejeu normalisé.** Avec `A H B C`, H masqué, placer C entre A/B dans la vue `Non masquées` peut signifier :

- après A dans l’ordre complet → `A C H B` ;
- avant B dans l’ordre complet → `A H C B`.

Les deux rendent `A C B` et conservent l’ordre relatif de A/H/B. « Ne pas déplacer implicitement les masqués » n’impose donc pas à lui seul une frontière unique dans cet intervalle. Figer les indices absolus des masqués serait une autre règle, incompatible avec la primitive d’extraction/insertion actuelle ; elle n’est pas adoptée ici.

**Recommandation à valider :** préserver la sémantique actuelle du geste DnD : déplacement vers le haut → avant la carte visible de destination ; vers le bas → après cette carte visible. Résoudre ensuite son successeur dans l’ordre **complet**, jamais dans la liste filtrée. Seul le sujet bouge. S25–S27 explicitent cette recommandation, y compris les extrémités visibles qui ne sont pas les extrémités structurelles.

L’ajout début/fin explicite et une vraie commande de fin structurelle restent normalisés sur la collection complète. Une recherche textuelle cachant effectivement des éléments continue de bloquer le reorder. Aucun nouveau parcours UI n’est choisi pendant 8A.2.

### R3 — Suppression puis réintroduction de la même variante

Une conversion conserve le même élément : cas déjà tranché. En revanche, un automatique retiré lors d’une actualisation puis redevenu éligible plus tard, ou un manuel supprimé puis réajouté, pose la question de la survie des anciennes intentions.

Exemple : `C avant A` sur `A B C`, retrait de C → `A B`, puis retour canonique `A B C`. Rattacher l’ancienne intention par variante donnerait **`C A B`** ; une nouvelle identité sans ancienne intention donnerait **`A B C`**. Une ancienne ancre retirée puis réintroduite pose la même question de rattachement.

**Recommandation à valider :** intentions attachées au cycle de vie de l’élément, identité conservée pour maintien/conversion ; nouvel élément après retrait, sans réactivation automatique de l’ancien journal. Un manuel réajouté reçoit son nouveau placement initial ; une ancre réintroduite avec une nouvelle identité ne remplace pas silencieusement l’ancienne, son repli reste applicable. Les exemplaires de la variante demeurent préservés dans tous les cas.

Cette recommandation rend les suppressions explicites et empêche qu’un ancien ajout ressuscite un élément. Elle ne prétend pas que l’abandon d’une personnalisation lors d’une réapparition est déjà approuvé. Un choix de restauration exigerait de définir précisément sujet, ancre, masquage et priorité des intentions de la nouvelle époque avant persistance.

### R4 — Geste sans changement visible et retry technique

Une requête identique rejouée après une réponse réseau incertaine ne constitue pas un second geste chronologique. La déduplication est nécessaire ; son mécanisme reste à choisir en 8A.3.

Un **nouveau geste intentionnel** sans changement d’ordre est différent : avec canonique `A C B`, le propriétaire confirme `C avant B`, déjà vrai. Après passage au canonique `A C X B`, ignorer ce geste donne **`A C X B`** ; enregistrer une nouvelle intention donne **`A X C B`**. Le writer livré traite une destination déjà réalisée sans effet ; il ne tranche pas la création future d’une intention.

**Recommandation à valider :** pas de nouvelle intention pour un geste annulé ou sans changement de séquence, conformément au comportement DnD actuel ; distinguer toujours un retry d’un vrai nouveau geste. Les placements initiaux manuels restent enregistrés, car l’ajout crée un élément et n’est pas un déplacement sans effet. Si une confirmation de relation sans déplacement doit exister, son caractère explicite devra être cadré, sans l’inventer dans ce rapport.

## Autres cas limites et résolution

| Cas | Résolution proposée ou règle acquise |
|---|---|
| Ancre présente mais déplacée | Utiliser sa position au moment du rejeu ; aucune contrainte permanente d’adjacence. |
| Plusieurs intentions avant la même ancre | Rejeu en ordre total : chaque nouvelle insertion juste devant l’ancre suit les insertions précédentes devant elle, sauf autres déplacements intercalés. S12. |
| Plusieurs intentions en fin | Chaque opération ajoute son seul sujet après tous les éléments présents ; ordre chronologique, pas bloc fixé à l’ancienne fin. |
| Sujet dans les successeurs historiques | Exclure le sujet, sinon auto-ancre artificielle après disparition de l’ancre. S14/S17. |
| Successeur historique déplacé/masqué/manuel | Toujours admissible s’il appartient à l’univers ; insérer devant sa position courante, sans revenir au rang historique. |
| Nouvelles cartes entre l’ancienne ancre et un successeur | Elles appartiennent à la base canonique, mais pas au contexte historique ; ne pas les inventer comme repli. R1. |
| Manuel devenu inéligible hors canonique | Préservé ; éligibilité d’un nouvel ajout et conservation d’un manuel existant restent distinctes. |
| Conversion servant d’ancre à un autre élément | Même identité : toutes les références demeurent valides ; conversion ne réécrit aucun placement. |
| Élément retiré avec exemplaires et notes | Item absent de l’ordre ; exemplaires, notes et catalogue intacts. Possession dans les autres collections inchangée. |
| Aucun élément / un seul élément | Le calcul accepte une liste vide ou singleton et les fins correspondantes ; aucune division, midpoint ou position numérique dans cet algorithme logique. |
| Canonique inchangé mais geste personnel nouveau | Rejeu de la chronologie enrichie ; la version canonique ne représente pas une version des personnalisations. |
| Positions numériques égales héritées | La lecture actuelle utilise `sort_position, id`. Ne pas convertir ces égalités en intentions ni inférer un journal ; la transition reste à définir en 8A.3. |
| Historique incomplet ou impossible | Échec explicite pour les données nécessaires absentes ; aucune invention d’ancre, reset d’ordre ou récupération des anciens gestes de test. |

Les valeurs d’origine, les droits de retrait et les réglages de visibilité ne se déduisent jamais du fait qu’un élément apparaît en fin ou devant une ancre particulière.

## Exigences à transmettre à 8A.3

1. **Faire valider R1–R4 avant de figer les contrats.** Conserver les attentes conditionnelles de la matrice comme référence et modifier seulement celles qu’un arbitrage explicite change.
2. Représenter les intentions avant/fin, leur ordre total, le placement initial de chaque manuel et les données de repli suffisantes. Respecter l’identité stable des conversions et le cycle de vie choisi ; aucun rapprochement ambigu par carte source ou position.
3. Conserver la chronologie utile. Toute compression doit prouver l’équivalence sur les ancres interdépendantes, les disparitions et les conversions futures ; S08 interdit une simple conservation du dernier geste de chaque sujet.
4. Utiliser l’ordre complet pour les gestes, le calcul et les relectures autoritatives. Garder filtres et possession hors du tri ; préserver masqués non déplacés selon l’invariant d’extraction. Adapter les writers/lecteurs existants au lieu de créer un ordre parallèle par vue.
5. Définir un protocole aperçu/application portant sur l’état canonique **et personnel** pertinent. Catalogue concurrent, ajout/retrait/reorder/masquage et suppression de collection ne doivent pas produire un résultat accepté partiellement ou sous une confirmation devenue incohérente.
6. Préserver atomicité, propriété, MFA/profil, RLS, partage consultatif, grants restreints et erreurs assainies. Ne pas ouvrir d’écriture directe ni exposer de données d’une autre collection pour résoudre une ancre. Articuler la sérialisation actuelle du parent avec la cohérence catalogue, sans fixer ici de nouveau verrou.
7. Matérialiser la séquence finale sans changer les rangs canoniques pendant le rejeu. Préserver IDs maintenus/convertis, manuels, masquage des automatiques maintenus, exemplaires et notes ; nouveaux/convertis visibles. Garantir unicité par variante et traiter explicitement cible devenue vide.
8. Distinguer calcul pur reproductible et application idempotente : dédupliquer les requêtes, ne pas journaliser deux fois un retry, ne pas recréer les nouveaux items déjà appliqués, ne pas rejouer sur la sortie personnalisée. Un échec partiel ne doit laisser aucun changement engagé ; une réponse réseau incertaine doit être vérifiable.
9. Définir la transition depuis les writers actuels sans reconstruction des gestes historiques. Collections de test recréables selon la décision propriétaire, **sans autorisation de suppression/reset ici**. Prévoir compatibilité des lecteurs/décodeurs stricts et des versions de writers pouvant coexister ; éviter toute mutation sans intention une fois le nouveau modèle actif.
10. Décrire chemin de déploiement et retour arrière avant migration : préserver ordre matérialisé et données personnelles ; empêcher anciens writers de rendre un journal incohérent ; conserver les informations nécessaires à une reprise. Ne pas supprimer un journal ou des éléments comme simple rollback technique. Choix de persistance et séquence de migration restent 8A.3.
11. Transformer ultérieurement la matrice en preuves ciblées de 8B et de l’actualisation : A/B, chronologie complète, contextes par époque, conversions, masqués, idempotence, refus d’entrées invalides, préservation des données et concurrence. Aucun test applicatif ajouté pendant 8A.2.

## Vérifications et état final

La matrice contient **36 scénarios**. Un vérificateur en mémoire lit directement les lignes du rapport, reconstitue les contextes chronologiques et compare chaque sortie à son attente écrite : **36/36 PASS**, dont A/B sans exception, replis R1, dépendances, manuels/conversions, masqués et actualisations successives. Aucune création/modification de script ou fichier de test.

| Contrôle exécuté | Résultat |
|---|---|
| Matrice lue depuis le rapport | **36 scénarios / 36 attentes correctes** |
| Reconstruction répétée depuis les mêmes entrées | **108 calculs**, trois par scénario, mêmes sorties |
| Permutation et conservation exacte de l’ordre hors sujet | **PASS**, 160 placements abstraits contrôlés dans les reconstructions et contre-exemples |
| Contextes et intentions immuables après calcul | **PASS** |
| Compression au dernier geste par sujet, S08 | Contre-exemple confirmé : `A X C B D` au lieu de `D A X C B` |
| Rejeu sur la sortie au lieu de reconstruction, S35 | Contre-exemple confirmé : `D C A B` au lieu de `C A B D` |
| Liens locaux et ancres du rapport | **24 destinations / 4 ancres, aucune erreur** |
| Espaces de fin de ligne du nouveau fichier non suivi | **PASS**, contrôle séparé du contenu |
| Version lue dans le package | **0.7.21**, inchangée |

Les contrôles de permutation, conservation de l’ordre hors sujet et répétition de la reconstruction portent sur des séquences abstraites. Ils ne constituent ni preuve backend authentifiée, ni test navigateur, ni contrôle de Supabase Local/Cloud, ni validation métier des recommandations ouvertes.

**`git diff --check` PASS** ; contrôle séparé du nouveau rapport non suivi PASS. Périmètre final : **ce seul rapport**, non suivi et non staged ; aucun fichier suivi modifié. Documents de référence conservés : aucune contradiction avérée nécessitant leur modification ; règles de 8A.1 inchangées et arbitrages nouveaux maintenus dans ce rapport.

Branche/HEAD inchangés : **`dev` / `c59b28095111ad8c1174aefa11de13e64caed0fe`**. Aucun code, test, script, migration, base, version ou donnée de test modifié ; aucune opération Cloud, aucun commit ni push. Retour arrière de ce livrable documentaire : retrait de ce seul fichier nouveau, sans effet sur l’application ou les données ; non exécuté.

**Arrêt à 8A.2. Validation propriétaire du rapport et des arbitrages requise avant poursuite vers 8A.3.**
