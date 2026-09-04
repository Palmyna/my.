# Intégration de TCGdex dans MY.

## Rôle du document

Ce document constitue la source de vérité concernant le rôle de **TCGdex / cards-database** dans **MY.**, l'interprétation des cartes et de leurs variantes et la construction des collections automatiques. Le [pipeline catalogue](07-CATALOG-SYNC.md) précise la source technique et le fonctionnement des synchronisations.

Il complète la [vision générale](00-VISION.md) et les [fonctionnalités de la V1](01-FEATURES.md). Il définit une politique de données et des règles fonctionnelles, sans imposer de schéma SQL, d'architecture technique ou de mécanisme d'implémentation.

## Rôle de TCGdex

TCGdex constitue la **source de référence principale** des données Pokémon TCG utilisées par MY. Il permet d'éviter la maintenance manuelle d'une base exhaustive et fournit notamment des informations sur :

- les cartes et les Pokémon représentés ;
- les séries, blocs et sets ;
- les numéros de cartes et les dates de sortie ;
- les raretés ;
- les images ;
- les variantes ;
- les identifiants Pokédex ;
- les autres métadonnées disponibles.

TCGdex n'est toutefois pas considéré comme une source parfaite ou suffisante pour tous les besoins. MY. doit pouvoir compléter ou corriger localement des données identifiées comme incomplètes ou incorrectes, sans cesser de considérer TCGdex comme sa source principale.

### Source technique du pipeline

Le dépôt `tcgdex/cards-database` est la source technique principale des imports et synchronisations de la V1. Chaque exécution repose sur un snapshot identifié par son commit SHA Git.

L'API REST TCGdex reste un outil auxiliaire de vérification, diagnostic, comparaison ou investigation. Elle n'est pas fusionnée silencieusement avec `cards-database` comme une seconde source automatique.

## Périmètre linguistique de la V1

La V1 de MY. est exclusivement centrée sur les **cartes Pokémon TCG disponibles en français**. Les collections automatiques par Pokémon comme celles par extension ne doivent inclure que les cartes et variantes réellement disponibles pour l'édition ou le marché français.

Une carte disponible en français n'implique pas que toutes ses variantes le soient également. La disponibilité linguistique doit donc être évaluée pour chaque variante avant son ajout automatique.

Lorsqu'une information fiable de disponibilité en français existe dans la source, MY. doit l'utiliser. Lorsqu'elle est absente ou insuffisante, une correction locale peut compléter la source. Les cartes uniquement disponibles dans d'autres langues ne sont pas intégrées automatiquement dans la V1. Une éventuelle prise en charge multilingue relève d'un cadrage futur.

## Séparation des niveaux de données

MY. repose sur trois niveaux distincts :

```text
TCGdex / cards-database
          ↓
Catalogue local MY.
          ↓
Collections et données utilisateur
```

### Données source TCGdex

TCGdex fournit les données externes de référence et leurs identifiants.

### Catalogue local MY.

MY. maintient son propre catalogue synchronisé à partir de TCGdex. L'application ne doit pas dépendre d'un appel direct à TCGdex pour chaque consultation d'une collection.

Le catalogue local sert notamment à :

- assurer des performances régulières ;
- alimenter la recherche ;
- construire les collections automatiques ;
- détecter les nouveautés ;
- distinguer les variantes ;
- conserver les informations utiles ;
- appliquer et tracer des corrections locales ;
- réduire la dépendance à la disponibilité instantanée de TCGdex.

### Collections et données utilisateur

Les informations descriptives des cartes et variantes appartiennent au catalogue global. Les informations personnelles appartiennent aux utilisateurs.

Exemples de données du catalogue :

- la carte Pikachu 28/73 ;
- le set *Légendes Brillantes* ;
- une variante Reverse ;
- une date de sortie ;
- une image.

Exemples de données utilisateur :

- l'état possédé ou manquant ;
- le nombre d'exemplaires ;
- l'état de conservation ;
- une information de grading telle que PSA 9 ;
- une note personnelle ;
- la position manuelle d'une carte dans une collection.

Cette séparation doit être préservée dans le futur modèle de données.

## Carte TCGdex, variante et exemplaire utilisateur

### Carte TCGdex et unité de collection

Une carte de base identifiée dans TCGdex n'est pas nécessairement une seule unité à collectionner dans MY. **Chaque variante pertinente constitue une entrée de collection distincte.**

Par exemple, une même carte peut générer les entrées suivantes lorsqu'elles existent réellement en français :

- Pikachu 28/73 — Normal ;
- Pikachu 28/73 — Reverse ;
- Pikachu 28/73 — Holo.

Une variante avec un stamp particulier ou toute autre différence pertinente constitue également une entrée distincte lorsque son existence et sa pertinence sont confirmées.

Les variantes ne sont donc pas de simples attributs visuels secondaires : elles représentent des objets de collection distincts et occupent chacune leur propre emplacement.

### Variante de catalogue et exemplaires physiques

Une entrée correspondant à une variante n'apparaît qu'une fois dans la structure d'une collection. Elle peut ensuite avoir zéro, un ou plusieurs exemplaires physiques appartenant à l'utilisateur.

Il ne faut jamais confondre :

- la carte et sa variante dans le catalogue ;
- les exemplaires physiques enregistrés par l'utilisateur.

Cette distinction respecte la règle définie dans `01-FEATURES.md` : l'entrée de référence est unique dans la collection, tandis que chaque exemplaire peut porter ses propres informations personnelles.

## Interprétation des variantes

MY. doit utiliser en priorité les informations détaillées fournies par TCGdex lorsqu'elles existent. Une variante peut notamment être caractérisée par :

- son type ;
- son subtype ;
- sa taille ;
- son stamp ;
- son foil ;
- son identifiant de variante.

Ces propriétés doivent pouvoir être conservées de manière suffisamment structurée pour différencier correctement les variantes. MY. ne doit pas ramener systématiquement cette richesse à de simples indicateurs Normal, Holo ou Reverse.

Les variantes normales, holo, reverse et autres variantes pertinentes sont des entrées séparées dès lors qu'elles sont confirmées pour la version française.

## Limites des données TCGdex

Les données TCGdex peuvent être :

- incomplètes ;
- en cours d'enrichissement ;
- ponctuellement incorrectes ;
- insuffisamment détaillées pour certaines anciennes cartes ou variantes.

L'absence d'une variante dans TCGdex ne prouve donc pas systématiquement qu'elle n'existe pas. Inversement, MY. ne doit pas créer automatiquement une variante sur la seule base de son existence théorique.

Le catalogue local et les corrections MY. doivent permettre de traiter explicitement ces situations.

## Identifiants et rattachement à la source

MY. doit conserver les identifiants TCGdex utiles pour relier les données locales à leur source, notamment :

- l'identifiant TCGdex de la carte ;
- le `localId` de la carte ;
- l'identifiant du set ;
- l'identifiant de la série ;
- l'identifiant de variante lorsqu'il existe ;
- les autres identifiants externes utiles.

Ils servent à synchroniser les données, détecter les nouveautés, éviter les doublons, retrouver une carte dans la source et suivre ses évolutions. MY. peut disposer en parallèle de ses propres identifiants internes.

## Identification des Pokémon

### Référence principale : `dexId`

Les collections automatiques basées sur un Pokémon utilisent principalement les identifiants Pokédex fournis par TCGdex. Le champ de type `dexId` constitue la référence principale pour déterminer qu'une carte représente un Pokémon donné.

Par exemple, une carte contenant l'identifiant Pokédex national `25` est candidate pour une collection automatique Pikachu. Cette méthode doit être privilégiée par rapport à une recherche textuelle sur le nom.

### Cartes représentant plusieurs Pokémon

Une carte peut posséder plusieurs identifiants Pokédex. Elle appartient alors aux collections automatiques de chacun des Pokémon concernés.

Une carte représentant Pikachu et Zekrom peut ainsi apparaître à la fois dans une collection automatique Pikachu et dans une collection automatique Zekrom.

### Mécanismes complémentaires

Les données `dexId` peuvent être absentes ou incomplètes. MY. doit pouvoir recourir à des mécanismes complémentaires pour rattacher une carte pertinente à un Pokémon, notamment :

- une correction locale ;
- un rattachement manuel ;
- d'autres informations structurées disponibles dans la source.

Le mécanisme de fallback exact reste à définir. Une simple comparaison textuelle du nom ne doit pas devenir la règle principale d'identification.

## Séries, sets et blocs

MY. conserve la hiérarchie utile fournie par TCGdex entre séries, sets et cartes. Elle alimente notamment :

- l'affichage ;
- la recherche ;
- l'ordre des collections ;
- la vue classeur ;
- l'organisation par blocs ou ères.

Des groupes tels que *Base*, *EX*, *Diamond & Pearl*, *Black & White*, *XY*, *Sun & Moon*, *Sword & Shield* ou *Scarlet & Violet* illustrent les blocs et séries concernés. La nomenclature affichée peut être adaptée en français lorsque nécessaire.

### Noms français

Lorsqu'une traduction française est disponible dans TCGdex, MY. doit l'utiliser en priorité pour les noms de cartes, les noms de sets et les informations textuelles présentées dans l'interface.

Par exemple, `Shining Legends` doit être affiché comme `Légendes Brillantes` lorsque cette traduction est disponible.

### Numéros et abréviations

MY. conserve les données nécessaires à l'identification claire d'une carte, notamment :

- le numéro local ;
- le nombre officiel de cartes du set lorsqu'il est disponible ;
- l'abréviation du set ;
- l'abréviation française lorsqu'elle existe ;
- l'identifiant du set.

Leur présentation exacte relève du cadrage UX.

## Images

MY. exploite les images de cartes disponibles via TCGdex pour la vue cartes, la vue classeur, les détails d'une carte et la recherche visuelle.

Lorsque plusieurs qualités ou formats sont disponibles, une qualité adaptée au contexte peut être utilisée. La stratégie technique exacte n'est pas définie ici.

TCGdex ne fournit pas nécessairement une image différente pour chaque variante. Plusieurs variantes peuvent donc utiliser l'image principale de la même carte, accompagnée d'un indicateur permettant d'identifier la variante concernée, par exemple Normal, Reverse, Holo ou Staff.

MY. ne doit jamais fabriquer artificiellement une image censée représenter une variante qui n'existe pas dans la source.

## Données utiles à la recherche

Le catalogue local doit conserver suffisamment d'informations pour alimenter la recherche interne aux collections définie dans `01-FEATURES.md`, notamment :

- le nom de la carte ;
- le set ;
- la série ou le bloc ;
- le numéro ;
- la variante ;
- la rareté ;
- les autres métadonnées textuelles pertinentes.

La liste définitive des champs recherchés sera précisée avec le modèle de données et l'UX.

## Construction des collections automatiques

Le catalogue local MY. permet deux stratégies de sélection automatique dans la V1 : par rattachement à un Pokémon ou par appartenance à une extension précise.

### Collection automatique par Pokémon

Lorsqu'un utilisateur choisit un Pokémon, MY. doit :

1. identifier le Pokémon ;
2. rechercher dans son catalogue local les cartes françaises pertinentes ;
3. déterminer les variantes françaises pertinentes de chaque carte ;
4. créer une entrée distincte pour chaque variante ;
5. appliquer l'ordre automatique défini par MY.

La sélection utilise principalement les rattachements issus de `dexId`, complétés si nécessaire par les corrections locales MY.

```text
Pokémon → cartes rattachées → variantes françaises → collection automatique
```

### Collection automatique par extension

Lorsqu'un utilisateur choisit une extension, MY. doit :

1. identifier le set précis dans son catalogue local ;
2. rechercher toutes les cartes de ce set pertinentes pour la V1 française ;
3. déterminer leurs variantes françaises pertinentes ;
4. créer une entrée distincte pour chaque variante ;
5. appliquer l'ordre automatique défini par MY.

Cette génération inclut toutes les catégories de cartes présentes dans l'extension, notamment les Pokémon, Dresseurs, Énergies et autres catégories. Elle cible un set précis, et non une série ou un bloc TCGdex.

La hiérarchie déjà conservée entre série ou bloc, set, carte et variante suffit conceptuellement à cette sélection ; aucune nouvelle source externe fondamentale n'est requise.

```text
Set → cartes du set → variantes françaises → collection automatique
```

Dans les deux cas, le catalogue local MY., et non un appel direct à TCGdex lors de la consultation ou côté navigateur, constitue la source de la génération.

### Ordre stable et reproductible

L'ordre d'une collection automatique doit rester stable et reproductible. Une synchronisation ne doit pas produire un ordre différent de manière arbitraire lorsque la cible et l'état du catalogue n'ont pas changé.

Pour une collection par Pokémon, la convention future pourra notamment exploiter :

- la chronologie des séries ;
- la chronologie des sets ;
- les dates de sortie ;
- les numéros de cartes ;
- les variantes d'une même carte.

Pour une collection par extension, elle pourra notamment exploiter :

- l'ordre officiel ou local du set ;
- les numéros de cartes ;
- l'ordre stable des variantes d'une même carte.

La logique exacte d'ordre des cartes et des variantes reste à définir.

## Synchronisation du catalogue

MY. doit pouvoir synchroniser son catalogue local avec les évolutions de TCGdex. Cette synchronisation peut notamment détecter :

- de nouvelles cartes ;
- de nouveaux sets ou de nouvelles séries ;
- de nouvelles variantes ;
- des corrections de métadonnées ;
- des traductions mises à jour ;
- des changements d'images ;
- d'autres corrections de données.

Une information de date de mise à jour fournie par TCGdex peut contribuer à cette détection, mais elle ne doit pas être supposée suffisante à elle seule. MY. doit pouvoir comparer les données nécessaires pour déterminer les changements pertinents.

Dans la phase initiale, la synchronisation retraite le catalogue utile de manière idempotente et reste déclenchée manuellement. Son fonctionnement est défini dans le [pipeline catalogue](07-CATALOG-SYNC.md) ; la cadence et l'automatisation futures restent ouvertes.

## Catalogue et collections utilisateur : deux mises à jour distinctes

La synchronisation du catalogue ne doit jamais modifier automatiquement la structure des collections utilisateur existantes.

### Mise à jour du catalogue

```text
TCGdex → catalogue local MY.
```

Cette opération peut être automatique.

### Mise à jour d'une collection automatique

```text
Catalogue local MY. → collection utilisateur
```

Cette opération suit obligatoirement le processus défini dans `01-FEATURES.md` :

1. MY. détecte qu'une mise à jour est disponible ;
2. l'utilisateur en est informé ;
3. il consulte un résumé des changements ;
4. il choisit explicitement d'appliquer la mise à jour.

Pour une collection existante, MY. compare sa structure avec l'état actuel du catalogue correspondant à sa cible Pokémon ou Extension. Les nouveautés peuvent notamment comprendre :

- une nouvelle carte éligible pour le Pokémon ou le set ciblé ;
- une nouvelle variante française d'une carte existante ;
- une carte ou variante précédemment absente mais désormais connue ;
- une correction TCGdex ou locale rendant une carte ou variante éligible.

Ces nouveautés doivent apparaître dans le résumé présenté à l'utilisateur.

## Corrections et extensions locales MY.

MY. peut conserver des corrections ou extensions locales lorsque les données TCGdex sont incomplètes ou incorrectes. Elles peuvent notamment concerner :

- une variante française manquante ;
- une disponibilité linguistique incorrecte ;
- un rattachement à un Pokémon manquant ;
- une information de variante incorrecte ;
- une métadonnée nécessaire à l'ordre ou au regroupement.

Ces corrections répondent à des cas identifiés et ne remplacent pas TCGdex comme source principale.

### Priorité et synchronisation

Une synchronisation ne doit jamais écraser aveuglément une correction locale. Dans la V1, les corrections MY. sont versionnées dans Git et appliquées après la normalisation de la source, avant la validation finale. Elles ont priorité sur les valeurs TCGdex concernées. Leur format et le mécanisme technique exact de fusion restent à définir.

### Traçabilité

Il doit être possible de déterminer qu'une donnée a été corrigée ou complétée localement, de distinguer la valeur TCGdex originale de la donnée locale et, lorsque nécessaire, de conserver l'origine ou la raison de la correction.

Cette traçabilité sert principalement à la maintenance du catalogue et n'a pas nécessairement à être exposée aux utilisateurs finaux.

### Contribution à TCGdex

Lorsqu'une erreur ou une donnée manquante est identifiée, une contribution au projet open source TCGdex peut être envisagée afin d'améliorer la source originale. Cette contribution éventuelle ne doit jamais bloquer MY. : une correction locale nécessaire peut être appliquée sans attendre son acceptation externe.

## Données prioritaires pour la V1

Les données TCGdex prioritaires comprennent notamment :

- l'identifiant de carte et le `localId` ;
- le nom français ;
- l'image ;
- le set et la série ;
- la date de sortie ;
- le numéro ;
- la rareté et la catégorie ;
- le `dexId` ;
- les variantes détaillées et leurs identifiants ;
- la disponibilité française ;
- les informations nécessaires à la recherche ;
- les informations nécessaires à l'ordre automatique ;
- les informations de mise à jour utiles.

Le [modèle de données conceptuel](03-DATA-MODEL.md) et le [schéma PostgreSQL / Supabase](06-DATABASE.md) définissent la structure retenue. Les champs source exacts du pipeline restent à préciser.

## Données non prioritaires pour la V1

MY. est un outil de collection. Les données TCGdex liées au gameplay ne doivent être conservées ou exploitées que si un besoin produit futur le justifie, notamment :

- les attaques et dégâts ;
- les coûts d'énergie ;
- les faiblesses et résistances ;
- le coût de retraite ;
- la légalité en tournoi ;
- les effets de capacités.

La synchronisation doit privilégier les informations réellement utiles à MY.

## Robustesse et protection des données

Une donnée optionnelle absente de TCGdex ne doit pas rendre une carte inutilisable. MY. doit pouvoir fonctionner avec des données partielles, par exemple en cas d'image absente, de variante non renseignée, de traduction partielle, de `dexId` manquant ou de rareté absente ou inhabituelle.

Les données indispensables à une collection automatique doivent pouvoir être corrigées localement lorsqu'elles sont insuffisantes.

Une carte déjà utilisée dans une collection ne doit pas disparaître silencieusement parce qu'elle n'est plus retournée ou qu'elle a changé dans TCGdex. Les suppressions et changements destructeurs de la source doivent être traités avec prudence afin de préserver les données utilisateur et d'éviter toute perte automatique.

La stratégie technique de traitement de ces cas reste à définir.

## Principes fondamentaux

- **TCGdex reste la source principale** : MY. ne reconstruit pas manuellement le catalogue Pokémon TCG.
- **MY. utilise un catalogue local** : les données utiles sont synchronisées avant d'alimenter les collections.
- **La V1 est française** : seules les cartes et variantes réellement disponibles en français alimentent automatiquement les collections.
- **Deux cibles automatiques existent** : une collection automatique sélectionne les variantes par rattachement à un Pokémon ou par appartenance à un set précis.
- **Une variante est une unité de collection** : chaque variante pertinente occupe un emplacement distinct.
- **Les exemplaires restent des données utilisateur** : une variante peut avoir zéro, un ou plusieurs exemplaires physiques.
- **Le `dexId` est la référence principale** : il rattache une carte aux collections automatiques des Pokémon représentés.
- **Les corrections locales sont autorisées et tracées** : elles complètent TCGdex sans le remplacer et résistent aux synchronisations aveugles.
- **Les données utilisateur sont protégées** : une évolution de TCGdex ne supprime ou ne modifie jamais silencieusement les informations personnelles ou la structure d'une collection existante.

## Éléments laissés ouverts

Les sujets suivants seront définis dans des documents ultérieurs ou lors de l'implémentation concernée :

- le SQL final des migrations, politiques RLS et RPC au-delà des principes définis dans le [schéma PostgreSQL / Supabase](06-DATABASE.md) ;
- la structure physique finale des corrections locales ;
- le mécanisme physique exact de fusion entre TCGdex et les corrections MY. ;
- la fréquence future et le mécanisme d'automatisation des synchronisations ;
- la stratégie de cache éventuelle ;
- l'ordre automatique exact des cartes ;
- l'ordre exact des variantes d'une même carte ;
- les critères détaillés d'ordre propres aux collections par Pokémon et par extension ;
- les critères détaillés d'inclusion des anciennes cartes particulières ;
- le fallback exact lorsque `dexId` est absent ou incomplet ;
- les critères précis de validation d'une variante française ;
- l'interface éventuelle d'administration des corrections ;
- le traitement technique des cartes supprimées ou renommées ;
- le stockage détaillé du versionnement source et le format final des rapports et journaux ;
- la gestion des erreurs d'API ;
- la méthode de récupération du snapshot `cards-database` ;
- les détails d'implémentation de l'import initial avec le pipeline commun ;
- les fonctions, tâches planifiées et autres mécanismes d'exécution.

Ces éléments ne doivent pas être inventés ou considérés comme décidés avant leur cadrage et leur validation.
