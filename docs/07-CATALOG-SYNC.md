# Pipeline catalogue et synchronisation TCGdex de la V1 de MY.

## Rôle du document

Ce document constitue la source de vérité concernant l'import et la synchronisation du catalogue Pokémon TCG de **MY.**. Il définit la source technique principale, l'identification des snapshots, la normalisation, la politique française, les corrections propres à MY., la comparaison avec PostgreSQL, la mise à jour des structures automatiques et les garde-fous du pipeline.

Il complète la [vision](00-VISION.md), les [fonctionnalités](01-FEATURES.md), la [politique d'intégration de TCGdex](02-TCGDEX.md), le [modèle de données conceptuel](03-DATA-MODEL.md), les [principes UX/UI](04-UX-UI.md), l'[architecture technique](05-ARCHITECTURE.md) et le [schéma PostgreSQL / Supabase](06-DATABASE.md).

Ce document ne constitue ni un script d'import, ni une procédure de déploiement finale, ni une spécification de code ligne par ligne. Les choix explicitement laissés ouverts ne doivent pas être inventés lors de l'implémentation.

## Architecture générale

Le catalogue est construit selon le flux suivant :

```text
tcgdex/cards-database
          ↓
Snapshot identifié par commit Git
          ↓
Parsing et normalisation
          ↓
Politique française
          ↓
Corrections MY. versionnées dans Git
          ↓
Validation
          ↓
Catalogue effectif MY.
          ↓
PostgreSQL / Supabase
          ↓
Structures automatiques versionnées
```

Le frontend React ne récupère, ne construit et ne synchronise jamais directement le catalogue global. Il consomme les valeurs effectives déjà produites par le pipeline et enregistrées dans le catalogue local MY.

## Source technique principale

### `tcgdex/cards-database`

Le dépôt open source `tcgdex/cards-database` est la source technique principale du pipeline catalogue de la V1. Il fournit le dataset amont utilisé pour construire le catalogue local.

Le dépôt est privilégié parce qu'il permet :

- de traiter un ensemble cohérent de données ;
- d'identifier précisément la version importée ;
- de reproduire un import ;
- d'éviter des milliers d'appels réseau unitaires ;
- de parser et valider localement les données ;
- de comparer les évolutions ;
- de faciliter les diagnostics.

### Place de l'API REST TCGdex

L'API REST TCGdex n'est pas la source principale des synchronisations. Elle peut servir à une vérification ponctuelle, un diagnostic, une comparaison, un test, une investigation manuelle ou un besoin futur spécifique.

Elle ne doit pas être fusionnée silencieusement avec `cards-database` comme une seconde source automatique. Chaque exécution normale repose sur une source et un snapshot clairement identifiables.

## Identification du snapshot

Chaque synchronisation conserve une référence immuable à la version de `cards-database` utilisée. La référence principale est le commit SHA Git.

Le run doit pouvoir enregistrer conceptuellement :

- le dépôt source ;
- le commit SHA ;
- la date du commit lorsqu'elle est utile.

Une valeur vague comme `latest` ou « dernière version » ne suffit pas. Une branche peut évoluer ; le commit effectivement importé doit rester identifiable pour permettre l'audit et la reproduction du résultat.

La méthode concrète de récupération du snapshot — clone Git, archive ou mécanisme équivalent — reste ouverte.

## Reproductibilité et déterminisme

À partir :

- du même commit `cards-database` ;
- de la même version des corrections MY. ;
- du même code de pipeline ;

le résultat fonctionnel doit être identique. Les parsings, normalisations, clés de rapprochement, tris et calculs de structures doivent donc tendre vers un comportement déterministe.

## Stratégie de synchronisation de la V1

### Retraitement complet du catalogue utile

Pendant la phase initiale, chaque synchronisation peut retraiter l'ensemble du catalogue utile à MY. Cette stratégie simple est privilégiée à un moteur incrémental complexe, car elle facilite la fiabilité, les tests, la comparaison et la reproductibilité.

Le retraitement complet signifie :

1. lire tout le snapshot pertinent ;
2. construire l'état souhaité ;
3. le comparer au catalogue PostgreSQL existant ;
4. appliquer uniquement les différences nécessaires.

Il ne signifie jamais vider les tables, recréer toutes les entités ou casser les références utilisateur.

### Idempotence

Le pipeline est idempotent. Relancer le même snapshot avec les mêmes corrections et le même code ne doit produire :

- aucun doublon ;
- aucun nouvel ID pour une entité déjà connue ;
- aucun changement fonctionnel supplémentaire ;
- aucune nouvelle version automatique lorsque la structure n'a pas changé.

```text
sync(snapshot X) + sync(snapshot X) = même état fonctionnel
```

## Étapes du pipeline

Une synchronisation suit conceptuellement les étapes suivantes :

1. identifier le snapshot `cards-database` ;
2. lire les données source ;
3. sélectionner les données pertinentes pour MY. ;
4. parser et normaliser les données ;
5. construire les séries ou blocs ;
6. construire les extensions ou sets ;
7. construire les cartes sources ;
8. construire les variantes ;
9. déterminer leur disponibilité française ;
10. construire les rattachements entre cartes et Pokémon ;
11. appliquer les corrections MY. versionnées ;
12. valider l'état final ;
13. comparer cet état avec PostgreSQL ;
14. produire un plan de changements ;
15. appliquer les changements ;
16. recalculer les structures des cibles automatiques ;
17. mettre à jour leurs hashes et versions uniquement si nécessaire ;
18. produire un rapport de synchronisation.

Une erreur bloquante pendant la lecture, le parsing, les corrections ou la validation interrompt le processus avant toute écriture.

## Politique française

### Périmètre de la V1

Les collections automatiques de la V1 utilisent uniquement les variantes actives et confirmées comme réellement disponibles en français.

La présence d'un set en français ne prouve pas que toutes ses variantes existent dans cette langue. Une variante ne devient pas française par simple analogie avec une version anglaise, une habitude éditoriale ou les autres variantes de la même carte.

### États de disponibilité

La disponibilité française conserve trois états conceptuels, ou des noms techniques équivalents :

| État | Signification | Éligibilité automatique |
|---|---|---|
| `confirmed` | La variante est confirmée disponible en français | Oui, si les autres critères sont satisfaits |
| `unknown` | Les informations sont insuffisantes | Non |
| `unavailable` | La variante est connue comme indisponible en français | Non |

En cas de doute, le pipeline choisit `unknown`. Une disponibilité `confirmed` doit venir d'une donnée suffisamment fiable ou d'une correction MY. validée.

## Séries, sets et noms

### Séries ou blocs

Le pipeline importe les séries ou blocs nécessaires à la hiérarchie, à la recherche, à l'ordre chronologique, à la vue classeur et aux relations avec les sets.

Une série ou un bloc — par exemple *Sun & Moon*, *Sword & Shield* ou *Scarlet & Violet* — ne doit jamais être confondu avec une extension précise.

### Extensions ou sets

Pour chaque set pertinent, le pipeline conserve les données utiles disponibles, notamment :

- l'identifiant TCGdex ;
- le nom français et le nom source ;
- la série ou le bloc ;
- la date de sortie ;
- les abréviations ;
- le nombre officiel de cartes ;
- le logo et le symbole ;
- les informations nécessaires à un ordre stable.

Une collection automatique Extension cible un set précis.

### Noms français

Lorsqu'une traduction française fiable est présente dans TCGdex, elle constitue la valeur source privilégiée. Une correction MY. peut néanmoins la remplacer lorsqu'elle est incorrecte.

## Cartes sources

Chaque carte pertinente du snapshot produit ou met à jour une `source_card`. Le pipeline conserve seulement les données utiles au produit et à la synchronisation, notamment :

- l'identifiant TCGdex ;
- le `local_id` ;
- le set ;
- le nom français ;
- la catégorie ;
- la rareté ;
- la référence d'image ;
- les données de tri ;
- les rattachements Pokémon ;
- les informations nécessaires aux variantes ;
- les métadonnées techniques ciblées utiles à la synchronisation.

Les attaques, coûts d'énergie, faiblesses, retraites, règles de combat et autres données de gameplay ne sont pas importés par défaut sans besoin produit.

### Identité et préservation des cartes

Le `tcgdex_id` est la référence externe principale pour reconnaître une carte source existante.

- Si la carte est déjà connue, son ID interne MY. est conservé.
- Si un ID TCGdex inconnu apparaît, une nouvelle `source_card` reçoit un nouvel ID interne.
- Une correction de nom, rareté ou autre métadonnée ne crée pas une nouvelle carte.

Une carte connue qui disparaît d'un snapshot n'est pas supprimée automatiquement. Elle peut être marquée comme absente de la source, notamment via `source_present = false`, puis être activée ou désactivée selon les règles du catalogue. Les références utilisateur restent intactes.

## Construction des variantes

### Une variante par objet collectible

Chaque variante réelle constitue une entité de catalogue distincte. Le pipeline exploite les propriétés structurées pertinentes disponibles, notamment :

- type ;
- subtype ;
- taille ;
- stamp ;
- foil ;
- autres propriétés réellement identitaires.

Il ne réduit pas systématiquement toutes les variantes aux seuls libellés Normal, Holo et Reverse.

### Label d'affichage

Le pipeline peut construire un label lisible tel que Normal, Reverse, Holo ou Staff. Ce label sert à l'UX mais n'est pas nécessairement l'identité technique de la variante.

### `variant_key`

Chaque variante possède un `variant_key` stable à l'intérieur de sa carte source. Il permet de rapprocher une variante du snapshot de la `catalog_variant` MY. existante.

Sa génération doit être :

- déterministe ;
- normalisée ;
- stable autant que possible.

Lorsqu'un identifiant de variante source stable et exploitable existe, il peut participer au rapprochement. Le pipeline ne doit toutefois pas dépendre exclusivement d'un champ absent sur certaines cartes.

En fallback, la clé peut être construite à partir d'une combinaison normalisée du type, subtype, format ou taille, stamp, foil et des autres propriétés identitaires réelles. Son format exact reste ouvert.

Un nom, une traduction ou un label purement descriptif ne doit pas constituer seul l'identité. Leur correction ne doit pas créer une nouvelle variante.

### Cartes sans variante détaillée

Lorsque TCGdex ne fournit pas de structure de variantes suffisante, le pipeline ne doit pas inventer toutes les variantes théoriquement possibles.

Une variante de base peut être représentée lorsqu'elle est nécessaire pour que la carte réelle existe dans le catalogue. Toute variante supplémentaire doit provenir d'une donnée fiable ou d'une correction MY. validée.

Le cas de Pikachu 28/73 de *Légendes Brillantes* illustre cette prudence : l'absence d'une Reverse dans la source ne prouve pas qu'aucune Reverse française réelle n'existe, mais elle n'autorise pas non plus le pipeline à l'inventer. Une correction MY. peut la documenter.

## Rattachements Pokémon

Le champ `dexId` est la source principale des relations entre cartes et Pokémon.

- Plusieurs `dexId` produisent plusieurs rattachements.
- Une carte multi-Pokémon devient éligible aux collections automatiques de chacun des Pokémon concernés.
- L'absence de `dexId` ne déclenche pas une recherche textuelle agressive sur le nom.
- Une carte peut rester sans rattachement tant qu'aucune information fiable n'est disponible.

Les corrections MY. permettent d'inclure un rattachement manquant ou d'exclure un rattachement source erroné. La relation effective issue de ces corrections a priorité.

## Corrections MY. versionnées dans Git

### Source de vérité des corrections

Dans la V1, les corrections et extensions propres au catalogue MY. sont versionnées dans le dépôt Git du projet. Elles ne doivent pas exister uniquement comme des modifications manuelles invisibles dans Supabase.

Des commandes SQL ponctuelles exécutées dans le dashboard Supabase sans correction correspondante dans Git ne constituent jamais une source de vérité acceptable.

```text
Snapshot TCGdex
    + normalisation MY.
    + corrections MY. versionnées
          ↓
Catalogue effectif MY.
```

Git fournit l'historique principal des décisions de correction : chaque ajout, modification ou retrait est lisible, révisable et reproductible comme un changement normal du dépôt.

### Emplacement et format

Le dépôt devra disposer d'un emplacement clairement identifié pour ces corrections. Un dossier tel que `data/catalog-overrides/` est un exemple conceptuel, pas un nom imposé par ce document.

Le format doit être textuel, structuré, versionnable, lisible et validable automatiquement. JSON, YAML ou un format équivalent sont envisageables ; le choix final reste ouvert.

Aucun dossier ni fichier d'override n'est créé tant que son emplacement et son format ne sont pas choisis lors de l'implémentation.

### Types de corrections

Les fichiers doivent pouvoir représenter au minimum :

- une correction de champ : nom français, rareté, catégorie, date, set, image, disponibilité française ou propriété de variante ;
- l'ajout d'une variante réelle absente de TCGdex ;
- l'ajout exceptionnel d'une carte française réelle entièrement absente de TCGdex ;
- l'inclusion ou l'exclusion d'un rattachement Pokémon ;
- la désactivation fonctionnelle d'une donnée source incorrecte sans suppression physique.

Une carte ou variante locale doit fonctionner comme toute autre entité dans la recherche, les collections, les exemplaires et les structures automatiques.

### Références stables

Une correction cible une entité au moyen de références stables, par exemple :

- l'identifiant TCGdex d'une carte ou d'un set ;
- un identifiant de carte associé au `variant_key` ;
- un numéro Pokédex ;
- un identifiant local MY. lorsqu'il est approprié.

Elle ne doit pas dépendre uniquement d'un nom affiché, d'une traduction, d'une position de fichier ou d'un index de tableau fragile.

### Validation

Toutes les corrections sont validées avant toute écriture PostgreSQL. Une correction impossible à appliquer provoque un échec explicite, notamment en cas :

- d'entité ciblée inexistante ;
- de set invalide ;
- de `variant_key` dupliqué ;
- d'action inconnue ;
- de champ non pris en charge ;
- de structure de fichier invalide.

Une correction devenue invalide après une évolution de TCGdex ne doit jamais être ignorée silencieusement.

### Priorité et corrections redondantes

L'ordre de calcul du catalogue effectif est :

1. données TCGdex ;
2. normalisation MY. ;
3. corrections MY. ;
4. validation finale.

Une correction MY. validée a priorité sur la donnée source concernée.

Si TCGdex corrige ultérieurement le problème, l'override MY. n'est pas supprimé automatiquement. Le rapport peut signaler qu'il paraît redondant ; son retrait reste une action contrôlée dans Git.

### Workflow d'une correction

Le flux de maintenance est conceptuellement :

1. identifier une erreur ou une absence dans TCGdex ;
2. ajouter ou modifier la correction dans le dépôt ;
3. committer la correction ;
4. lancer un dry-run ;
5. vérifier le rapport ;
6. lancer la synchronisation réelle ;
7. vérifier le rapport final et les cibles affectées.

### Représentation dans PostgreSQL

Les structures privées telles que `private.catalog_overrides` peuvent refléter les corrections effectivement appliquées. Elles ne remplacent jamais les fichiers versionnés dans Git comme source de vérité de la V1.

Le frontend consomme une seule valeur effective. Il ne choisit jamais lui-même entre donnée source et override.

## Comparaison avec PostgreSQL

### État souhaité et plan de changements

Le pipeline construit d'abord l'état catalogue souhaité, puis le compare au catalogue existant. Il doit distinguer au minimum :

- création ;
- modification ;
- absence de la source ;
- désactivation ;
- réactivation ;
- ajout local ;
- correction locale ;
- changement de disponibilité française ;
- ajout ou retrait d'un rattachement Pokémon ;
- ajout ou retrait de variante.

Cette comparaison produit un plan de changements avant l'écriture.

### Préservation des IDs internes

Toute entité reconnue comme existante conserve son ID interne MY. Le pipeline ne recrée pas arbitrairement les Pokémon, séries, sets, cartes ou variantes.

Cette stabilité préserve les relations portées par les éléments de collection, les exemplaires et les structures automatiques.

### Persistance et transactions

Les différences peuvent être appliquées au moyen d'upserts ou d'opérations contrôlées équivalentes respectant les contraintes de `06-DATABASE.md`.

Les changements sont transactionnels autant que raisonnablement possible. Si une transaction globale devient trop importante, plusieurs phases transactionnelles clairement ordonnées sont acceptables, à condition de garantir la cohérence de l'état final et la reprise explicite après une erreur.

Une donnée source disparue est normalement inactivée ou marquée absente, pas supprimée physiquement. Aucune écriture catalogue ne doit supprimer des données utilisateur.

## Historique et rapport de synchronisation

### `private.catalog_sync_runs`

Chaque synchronisation importante produit une entrée dans `private.catalog_sync_runs` ou une structure équivalente. Elle doit pouvoir conserver :

- le début et la fin ;
- le statut ;
- le dépôt source ;
- le commit SHA ;
- la version du pipeline lorsqu'elle est utile ;
- les compteurs et statistiques pertinents ;
- un résumé d'erreur.

Les états conceptuels principaux sont `running`, `success` et `failed`.

### Rapport mainteneur

Chaque exécution produit un rapport lisible, distinct des logs techniques bruts. Il doit permettre de comprendre le passage de l'état précédent au nouvel état et couvrir notamment :

- **source** : dépôt, commit SHA et date ;
- **séries et sets** : ajouts, modifications et disparitions ;
- **cartes** : ajouts, modifications et absences de la source ;
- **variantes** : ajouts, modifications, variantes devenues françaises ou non françaises, variantes restées inconnues et désactivations ;
- **corrections** : overrides appliqués, invalides ou potentiellement redondants ;
- **Pokémon** : rattachements ajoutés, retirés ou corrigés ;
- **cibles automatiques** : hashes modifiés, anciennes versions et nouvelles versions.

Le format exact du rapport reste ouvert.

## Dry-run

Le pipeline doit idéalement proposer un mode dry-run. Ce mode exécute :

- la lecture du snapshot ;
- le parsing et la normalisation ;
- l'application en mémoire des corrections ;
- les validations ;
- la comparaison avec PostgreSQL ;
- le calcul des structures automatiques ;
- la génération du rapport.

Il n'écrit rien dans PostgreSQL.

Une commande comme `catalog:sync --dry-run` n'est qu'un exemple conceptuel. Son nom et sa syntaxe restent ouverts ; npm est le gestionnaire de paquets du projet retenu en Phase 0.

## Import initial

L'import initial utilise autant que possible le même pipeline que les synchronisations suivantes. La V1 ne doit pas reposer sur un script jetable d'initialisation suivi d'un second mécanisme différent.

Sur une base vide, le pipeline doit pouvoir :

1. remplir le catalogue utile ;
2. appliquer les corrections Git ;
3. construire les états initiaux des cibles automatiques ;
4. produire un rapport initial.

Chaque Pokémon possédant au moins une variante éligible et chaque set pertinent doit disposer d'un état courant après l'import. La version initiale doit être cohérente ; sa représentation exacte sera fixée avec l'implémentation.

Le rapport initial doit notamment permettre de connaître le nombre de séries, sets, cartes, variantes et relations Pokémon. La taille réelle de PostgreSQL sera ensuite mesurée dans Supabase.

## Structures automatiques

### Cible Pokémon

```text
Rattachements carte-Pokémon effectifs
          ↓
Cartes actives
          ↓
Variantes actives et confirmées françaises
          ↓
Ordre canonique
          ↓
Structure automatique Pokémon
```

### Cible Extension

```text
Cartes actives du set
          ↓
Variantes actives et confirmées françaises
          ↓
Ordre canonique
          ↓
Structure automatique Extension
```

Une cible Extension désigne toujours un set précis, non une série ou un bloc.

### Ordre canonique

L'ordre produit est déterministe : un même catalogue génère toujours le même ordre.

Pour une Extension, l'ordre suit principalement l'ordre des cartes dans le set, puis l'ordre stable de leurs variantes.

Pour un Pokémon, l'ordre doit pouvoir exploiter l'ordre chronologique des séries ou blocs, celui des sets, l'ordre des cartes et celui des variantes.

L'ordre des variantes doit fonctionner au-delà de Normal, Holo et Reverse et tenir compte de leurs propriétés réelles. Les algorithmes finaux restent ouverts.

## Hash et version des cibles

### Construction du `content_hash`

Pour chaque cible, le pipeline produit la séquence stable et ordonnée des IDs internes de variantes qui constituent sa structure automatique. Le `content_hash` est calculé à partir de cette séquence.

Le hash dépend :

- des variantes présentes ;
- de leur ordre.

Il ne dépend pas du nom, de l'image, de la rareté, du label ou d'une autre métadonnée descriptive.

### Mise à jour de la version

Lors de la première génération, la cible reçoit une version initiale cohérente. Ensuite :

- si le nouveau hash est identique, `generation_version` reste inchangée ;
- si le hash diffère, `generation_version` est incrémentée.

Pour la V1 privée, le pipeline peut recalculer toutes les structures automatiques après une synchronisation complète si cette opération reste rapide. Un moteur sophistiqué de dépendances incrémentales n'est pas requis.

### Métadonnées et structure

Une correction de nom, rareté, image, nom de set ou autre métadonnée descriptive devient immédiatement visible puisque les collections référencent le catalogue. Elle ne change pas la version si la séquence ordonnée de variantes reste identique.

Un passage de `unknown` à `confirmed` peut ajouter la variante aux structures concernées. Un passage de `confirmed` à `unavailable` peut l'en retirer. Ces changements modifient le hash et incrémentent les versions correspondantes.

## Séparation avec les collections utilisateur

Le pipeline catalogue modifie :

- le catalogue global ;
- les états et versions des cibles automatiques.

Il ne modifie jamais directement les `collection_items` des utilisateurs en réponse à une évolution du catalogue. Chaque collection conserve son `applied_target_version` jusqu'à ce que son propriétaire consulte le résumé puis applique explicitement la mise à jour prévue par `06-DATABASE.md`.

Le pipeline ne crée ou ne modifie pas non plus :

- les exemplaires physiques ;
- les notes utilisateur ;
- les profils ;
- les partages.

## Exécution manuelle initiale

La synchronisation de la V1 privée est déclenchée manuellement. Le mainteneur choisit quand lancer :

1. un dry-run ;
2. la synchronisation réelle après lecture du rapport ;
3. la vérification du rapport final et des cibles affectées.

Aucun cron externe, worker permanent, scheduler payant, Edge Function planifiée ou traitement quotidien n'est nécessaire au départ.

Lors de l'implémentation, une courte procédure devra expliquer comment récupérer le projet et le snapshot, exécuter le dry-run, lire le rapport, lancer l'écriture puis vérifier le résultat. Les commandes exactes seront documentées seulement lorsque le pipeline existera.

Le projet devra alors proposer une commande principale claire pour la synchronisation et une variante explicite pour le dry-run. `catalog:sync` et `catalog:sync --dry-run` ne sont que des exemples conceptuels ; la syntaxe finale reste ouverte, avec npm comme gestionnaire de paquets du projet.

## Sécurité et environnements

### Exécution privilégiée

Le pipeline peut écrire dans le catalogue global et s'exécute donc uniquement dans un environnement de confiance. Ses privilèges ne sont jamais exposés au navigateur.

La clé Supabase `service_role`, ou tout secret équivalent :

- n'est jamais utilisée dans React ;
- n'est jamais placée dans une variable `VITE_*` ;
- n'est jamais commitée dans Git ;
- provient de variables d'environnement privées.

Les logs et rapports ne doivent afficher aucune clé, aucun token ni aucun autre secret.

### Protection de la base cible

Le pipeline doit rendre difficile une synchronisation accidentelle vers la mauvaise base. L'environnement cible — développement ou production — doit être clairement identifiable. Le mécanisme précis de vérification et de confirmation reste ouvert.

Les évolutions importantes sont testées en développement, avec le même pipeline, les mêmes règles et les mêmes fichiers de corrections qu'en production. Seule la configuration d'environnement change.

## Contrôles de qualité et garde-fous

Avant toute écriture, le pipeline vérifie notamment :

- la validité des séries et des sets ;
- la cohérence des identifiants TCGdex ;
- l'absence de doublons source ;
- l'absence de `variant_key` dupliqué dans une carte ;
- la validité des rattachements Pokémon ;
- la validité des états de disponibilité française ;
- la validité de toutes les corrections.

Il signale les situations suspectes, notamment :

- plusieurs variantes produisant la même clé ;
- une carte sans set ;
- une correction ciblant une entité inexistante ;
- une disparition massive de cartes ;
- une variation anormale du nombre de variantes françaises ;
- l'absence totale de cartes françaises ou de sets importés.

Des seuils d'alerte ou de refus peuvent être ajoutés. Leurs valeurs exactes restent ouvertes. Le principe prioritaire est de préférer un échec explicite à la corruption silencieuse du catalogue.

### Gestion des erreurs

Une erreur bloquante détectée avant l'écriture laisse PostgreSQL inchangé.

Une erreur pendant l'écriture doit être contenue par les transactions autant que possible. L'exécution est marquée `failed` et produit un résumé exploitable ; aucun état intermédiaire ne doit être masqué comme une réussite.

## Maîtrise du coût et du volume

Le pipeline respecte l'objectif Free Tier et la compacité définie dans l'architecture :

- il ne télécharge ni ne stocke toutes les images TCGdex ;
- il ne conserve pas systématiquement les payloads JSON bruts ;
- il n'importe pas les données de gameplay inutiles ;
- il utilise les IDs internes compacts du catalogue ;
- il ne duplique pas le catalogue par utilisateur.

Il conserve seulement les références ou URL d'images nécessaires. Les mesures prises après l'import initial permettent de confirmer la taille des tables, des index et du catalogue complet.

## Organisation future du code

Le pipeline sera isolé du frontend React. Son implémentation pourra séparer conceptuellement :

- la récupération de la source ;
- le parsing ;
- la normalisation ;
- la politique française ;
- la construction des variantes ;
- les rattachements Pokémon ;
- les corrections ;
- la comparaison avec la base ;
- la persistance ;
- le calcul des structures automatiques ;
- le reporting.

Ce découpage décrit des responsabilités, pas une structure de dossiers imposée.

## Automatisation future

La V1 privée ne fixe aucune fréquence de synchronisation. Un run peut être lancé lors d'une nouvelle extension, de nouvelles cartes, d'une correction TCGdex importante ou d'une correction MY.

Plus tard, le même pipeline pourra être déclenché par GitHub Actions, une capacité Supabase ou un autre mécanisme adapté. Cette automatisation devra idéalement changer seulement l'origine du déclenchement, pas la manière dont le catalogue est construit.

La fréquence, le mécanisme et l'éventuelle CI restent ouverts.

## Tests prioritaires

Les tests du pipeline doivent couvrir en priorité :

- l'idempotence ;
- la correspondance entre IDs source et IDs internes MY. ;
- la préservation des IDs existants ;
- la génération stable du `variant_key` ;
- les trois états de disponibilité française ;
- l'application et la persistance des overrides ;
- le signalement d'un override devenu redondant ;
- l'ajout d'une variante ou d'une carte locale ;
- les cartes multi-Pokémon ;
- la disparition d'une donnée source ;
- le calcul du `content_hash` ;
- l'évolution de `generation_version`.

Scénarios essentiels :

- resynchroniser le même snapshot ne produit aucun changement fonctionnel ;
- une erreur TCGdex reste corrigée tant que l'override Git est présent ;
- une correction devenue redondante est signalée sans être supprimée ;
- une variante locale n'est pas dupliquée lors d'une nouvelle synchronisation ;
- une modification de nom conserve le même hash et la même version ;
- une nouvelle variante française modifie le hash et incrémente la version.

## Reconstruction complète

Une base doit pouvoir être reconstruite à partir de :

1. ses migrations ;
2. un snapshot `cards-database` identifié ;
3. les corrections MY. versionnées dans Git ;
4. le code du pipeline ;
5. la génération du catalogue effectif et des états automatiques.

Le résultat doit être fonctionnellement équivalent à celui de la synchronisation d'origine.

## Hors responsabilité du pipeline

Le pipeline ne doit pas :

- modifier les exemplaires, notes, profils ou partages ;
- appliquer automatiquement une mise à jour aux collections utilisateur ;
- télécharger toutes les images TCGdex ;
- stocker systématiquement les données gameplay ou payloads complets ;
- gérer le Premium, les abonnements ou les paiements.

## Décisions désormais figées

- `tcgdex/cards-database` est la source technique principale.
- Chaque synchronisation référence un snapshot par commit SHA Git.
- Le retraitement complet du catalogue utile est acceptable dans la V1.
- Le pipeline est déterministe autant que possible et idempotent.
- Les IDs internes MY. existants sont préservés.
- La politique française est stricte et conservatrice.
- Aucune variante n'est supposée française sans preuve fiable.
- Les corrections MY. sont versionnées dans Git et prioritaires sur la source.
- Une correction invalide ou inapplicable provoque un échec explicite.
- Le dry-run est recommandé et chaque synchronisation produit un rapport lisible.
- La synchronisation est déclenchée manuellement dans la phase initiale.
- Les structures automatiques sont recalculées, hashées et versionnées.
- Une évolution du catalogue ne modifie jamais silencieusement une collection utilisateur.

## Éléments laissés ouverts

Les choix suivants seront réalisés lors de l'implémentation ou d'un cadrage ultérieur :

- le langage et l'emplacement exacts du code ;
- le nom et la syntaxe de la commande ;
- la récupération par clone Git, archive ou autre mécanisme ;
- l'emplacement final des corrections ;
- JSON, YAML ou autre format structuré ;
- le schéma précis de validation des corrections ;
- l'algorithme final de `variant_key` et les propriétés exactes par type de variante ;
- l'ordre final des variantes et des collections Pokémon ;
- le traitement des cas TCGdex particulièrement atypiques ;
- le SQL exact des upserts ;
- la taille et le découpage des transactions ;
- le format exact du rapport et des logs ;
- les seuils d'alerte ou de refus ;
- la protection exacte contre une mauvaise base cible ;
- la fréquence future et le mécanisme d'automatisation ;
- l'éventuelle intégration continue.

## Synthèse

MY. construit son catalogue depuis un snapshot immuable de `tcgdex/cards-database`, identifié par commit SHA. Le pipeline normalise les données, applique une politique française conservatrice, fusionne les corrections MY. versionnées dans Git, valide l'état souhaité puis le compare à PostgreSQL en préservant les IDs internes.

Chaque exécution est traçable, reproductible et idempotente. Un dry-run et un rapport lisible permettent au mainteneur de contrôler les changements avant l'écriture. Les anomalies importantes provoquent un échec explicite plutôt qu'une modification silencieuse.

Le pipeline recalcule les structures automatiques Pokémon et Extension, puis n'incrémente leur version que si leur séquence ordonnée de variantes change. Il ne modifie jamais les collections, exemplaires ou autres données utilisateur. La V1 reste manuelle et compacte ; une automatisation future pourra réutiliser exactement le même pipeline.
