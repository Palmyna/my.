# Corrections du catalogue MY.

Les fichiers `*.json` de ce dossier contiennent des tableaux d'actions validés strictement par [`overrides.ts`](../../scripts/catalog/overrides.ts). `overrides.json` est volontairement vide : aucun correctif réel n'a été inventé pour l'import initial.

Chaque correction nécessite une raison factuelle, un identifiant durable et une cible connue. Ajouter/modifier le JSON, puis exécuter `catalog:validate` et un dry-run au SHA voulu. Lire le rapport avant `--apply`. Les corrections redondantes ne sont jamais supprimées automatiquement ; leur retrait se fait dans Git.

## Retrouver une carte et préparer une correction

La recherche utilise le catalogue Supabase **local déjà importé**, avec ses corrections appliquées. Démarrer d'abord Supabase avec `npm run supabase:start` si nécessaire. Elle n'écrit rien et ne consulte ni le dépôt TCGdex ni PokéAPI.

1. Retrouver la carte avec une seule recherche entre guillemets :

   ```sh
   npm run catalog:find -- "Pikachu 28"
   ```

2. Copier la colonne **Card** : `tcgdex:sm3.5-28`. La recherche peut aussi combiner le nom et le set : `"Pikachu Légendes Brillantes"`. Les accents et la casse sont facultatifs ; tous les termes doivent correspondre à la même carte. Les 20 premiers résultats sont affichés avec le total ; `--limit 10` permet d'ajuster ce nombre.

3. Utiliser cette valeur comme cible dans le JSON de la correction :

   ```json
   "card": "tcgdex:sm3.5-28"
   ```

4. Valider le fichier et ses cibles :

   ```sh
   npm run catalog:validate
   ```

5. Produire puis lire le plan sans écrire dans la base :

   ```sh
   npm run catalog:sync -- --dry-run
   ```

6. Après vérification du rapport, appliquer explicitement :

   ```sh
   npm run catalog:sync -- --apply
   ```

Pour garder le même snapshot pendant ces étapes, ajouter `--snapshot <SHA_COMPLET>` à la validation, au dry-run et à l'apply. Sans SHA explicite, chaque commande résout le HEAD TCGdex ; une évolution upstream entre deux commandes peut modifier le plan. `catalog:find` n'utilise pas de snapshot : il montre ce qui est déjà présent en base. Un JSON modifié mais non appliqué n'y apparaît pas encore.

## Export CSV pour audit humain

```powershell
npm run catalog:find -- "Pikachu Légendes Brillantes" --export
npm run catalog:find -- "Pikachu" --export
```

Le moteur de recherche est inchangé. Toutes les cartes correspondant à la requête sont exportées, sans limite de 20 ou de 100 ; chaque variante standard stockée produit une ligne, y compris inactive ou non confirmée en français. `--export` et `--limit` sont incompatibles ; sans export, l'affichage compact et sa limite restent inchangés.

| Colonne | Contenu |
| --- | --- |
| Card | Sélecteur `tcgdex:<id>` ou alias MY réel de la carte |
| Nom | Nom français, cellule vide si absent |
| Set | Nom français, sinon identifiant du set |
| N° | Numéro local / total officiel, ou numéro local seul |
| Variante | Label persisté, sans reconstruction |
| Date | Date effective de variante ISO `YYYY-MM-DD`, cellule vide si NULL |
| Origine date | Provenance persistée : `variant`, `card`, `product`, `set`, `override`, `unknown` |
| Variant Key | Sélecteur exact du champ `key` de `variant.patch` |

`Variant Key` n'est pas l'ID PostgreSQL. Une variante source non corrigée utilise sa clé canonique ; si son identité a été corrigée, le sélecteur du patch appliqué permet de retrouver la clé d'origine via les aliases privés. Une variante ajoutée séparément par MY utilise `my:<id-ajout>`. Les variantes internes à `card.add` utilisent leur clé intra-carte, ou le sélecteur d'un patch appliqué. Pour une variante historique, la clé persistée ou son alias reconnu est réutilisé ; le pipeline relit l'entité conservée, sans la réactiver implicitement. Le set d'une carte historique doit toujours être reconnu par le snapshot utilisé lors d'une future correction.

Copier **Card** et **Variant Key** ensemble dans une correction JSON avec un nouvel `id` durable et une raison factuelle. Si une correction du même champ existe déjà, la modifier plutôt qu'ajouter un patch en conflit. La clé décrit le catalogue et les corrections actuellement appliqués ; un changement ultérieur du snapshot ou des overrides nécessite un nouvel audit.

Les fichiers résident dans `.cache/catalog-exports/`, déjà ignoré par Git. Le nom est `catalog-find-<slug>-<empreinte>.csv` : recherche normalisée, slug ASCII borné à 70 caractères, puis 10 caractères de SHA-256 de la recherche normalisée pour distinguer les ponctuations significatives. Les caractères interdits sous Windows sont écartés. Le remplacement passe par un fichier temporaire voisin puis un renommage ; fermer le CSV dans Excel si Windows empêche son remplacement.

Encodage UTF-8 avec BOM, séparateur `;`, huit colonnes exactement, cellules entre guillemets avec guillemets internes doublés, fins de ligne CRLF. Accents, virgules, points-virgules et retours à la ligne contenus dans une valeur sont conservés. Aucun résultat donne une sortie normale et aucun fichier ; un ancien export éventuel reste conservé, ce que précise la console.

Workflow :

```text
catalog:find --export
→ CSV de référence du catalogue
→ audit humain
→ fichier séparé *_override.csv limité aux ajouts/corrections souhaités
→ maintenance manuelle des corrections JSON validées
```

Le CSV exporté est une photographie de référence. Il n'est pas destiné à être modifié puis réimporté. Le fichier `*_override.csv` sert uniquement de liste de corrections humaines : **aucun importeur CSV, aucune application automatique et aucune écriture DB**.

## Distinguer `id` et `card`

| Champ | Qui fournit sa valeur ? | Exemple |
|---|---|---|
| `id` | Le mainteneur choisit un identifiant durable et unique pour **la correction**. Il ne provient ni de PostgreSQL ni de TCGdex. | `pikachu-sm3.5-28-holo-cosmos-fr` |
| `card` | La cible catalogue réelle, copiée depuis **Card** dans `catalog:find`, avec son préfixe. | `tcgdex:sm3.5-28` |

Plusieurs corrections peuvent viser la même `card`, mais chacune conserve son propre `id`. Pour une carte créée localement, la recherche restitue son alias réel `my:<id-override>`. Le cas `card.add`, qui décrit une nouvelle carte sous forme d'objet, reste détaillé plus bas.

Le fichier réel [`pikachu-sm3.5-28.json`](pikachu-sm3.5-28.json), ajouté manuellement, contient quatre ajouts de variantes vérifiés. Il est conservé tel quel. Avec la Normal déjà importée, la recherche de Pikachu 28/73 affiche **5 variantes**. Cette colonne compte les variantes standard stockées, sans limiter le nombre aux seules variantes éligibles à une collection automatique.

Une recherche sans résultat n'est pas une erreur technique. Préciser ou raccourcir les termes, puis vérifier que la carte a déjà été importée. Une recherche vide est refusée et n'affiche jamais le catalogue entier. Les Pokémon affichés sont les rattachements réels ; aucun rattachement n'est déduit du nom de carte.

## Actions et exemples

Exemples **synthétiques, non chargés** : remplacer les références et raisons par celles d'une correction vérifiée avant de créer un JSON actif.

```json
[
  {
    "id": "sample-date",
    "reason": "Exemple synthétique : date du coffret vérifiée, référence de preuve",
    "action": "card.patch",
    "card": "tcgdex:fixture-set-10",
    "patch": { "date": "2020-02-29", "name": "Nom corrigé" }
  },
  {
    "id": "sample-variant",
    "reason": "Exemple synthétique : variante française réelle manquante",
    "action": "variant.add",
    "card": "tcgdex:fixture-set-10",
    "variant": { "type": "holo", "foil": "cosmos", "stamp": ["pre-release", "staff"], "availability": "confirmed" }
  },
  {
    "id": "sample-unavailable",
    "reason": "Exemple synthétique : disponibilité incorrecte",
    "action": "variant.patch",
    "card": "tcgdex:fixture-set-10",
    "key": "v1:[\"reverse\",null,\"standard\",[],null]",
    "patch": { "availability": "unavailable" }
  },
  {
    "id": "sample-mapping",
    "reason": "Exemple synthétique : Pokémon principal manquant",
    "action": "mapping.include",
    "card": "tcgdex:fixture-set-10",
    "dex": 25
  },
  {
    "id": "sample-local-card",
    "reason": "Exemple synthétique : carte française réelle absente",
    "action": "card.add",
    "card": {
      "set": "fixture-set", "localId": "TG01", "name": "Carte locale", "date": null, "dex": [25],
      "variants": [{ "type": "normal", "availability": "confirmed" }]
    }
  }
]
```

`card.patch` accepte `name`, `category`, `rarity`, `image`, `date`, `active`. Les champs descriptifs peuvent être `null`. `variant.patch` accepte `type`, `subtype`, `size`, `stamp`, `foil`, `label`, `image`, `date`, `availability`, `active`. Disponibilités : `confirmed`, `unknown`, `unavailable`. Pour désactiver : `active: false`. Pour retirer un rattachement : `mapping.exclude`.

`variant.add` requiert `type` et `availability`, avec taille standard implicite. `card.add` requiert set, numéro local, nom, date complète ou `null`, et au moins une variante. La carte devient `my:<id-override>` ; une variante ajoutée séparément est sélectionnable par `my:<id-override>`. Utiliser les propriétés canoniques TCGdex, pas les traductions. Les stamps sont un tableau.

Un patch de variante source cible sa clé **avant correction**. L'alias privé préserve l'ID si foil ou stamps changent. Les cibles inconnues, doublons et conflits bloquent avant écriture. Les ajouts retirés sont conservés inactifs. Pour maintenir une carte disparue, cibler la carte historique et ses variantes explicitement ; son set doit encore être reconnu.

Les traces appliquées résident dans `private.catalog_overrides`. Git reste l'autorité ; une modification manuelle de PostgreSQL ne le remplace pas.

## Date effective d'une variante

Une variante peut être sortie après la carte de base. La date appartient à la variante et ne participe ni à `variantKey` ni à son identité ou son ID.

- `variant.add` sans `date` : hérite de la date résolue de la carte et de sa provenance réelle.
- `variant.add` avec `"date": "2018-03-15"` dans l'objet `variant` : date explicite, provenance `override`.
- `variant.patch` avec `"patch": { "date": "2018-03-15" }` : correction explicite, provenance `override`.
- `variant.patch` avec `"patch": { "date": null }` : supprime la correction spécifique et restaure le fallback de carte, éventuellement NULL si la carte n'a aucune date fiable.
- Champ absent d'un patch : la date n'est pas corrigée par cette action. `null` est accepté uniquement pour le patch, pas pour `variant.add` où l'absence exprime le fallback.

Ces dates sont des exemples synthétiques, pas une correction à appliquer à Pikachu. Une date doit être complète et valide en ISO `YYYY-MM-DD`, étayée par une raison factuelle ; aucune date approximative n'est inventée. Les variantes dans `card.add` acceptent aussi la date facultative.

Le fallback conserve `card`, `product`, `set`, `override` ou `unknown`, sans le présenter comme une date spécifique `variant`. Une correction de carte met à jour les variantes courantes qui en héritent, même si l'ajout de variante est traité avant ce patch ; les dates spécifiques ne sont pas remplacées. Les variantes historiques conservent leur valeur persistée sauf demande explicite de correction ou de fallback.

La date agit sur le classement Pokémon uniquement. Le classement Set reste numéro puis rang de variante. Les versions changent uniquement si la liste ordonnée des IDs change. Le fichier réel `pikachu-sm3.5-28.json` reste inchangé : ses quatre ajouts sans date héritent temporairement de la date de carte, avec la provenance de cette date.
