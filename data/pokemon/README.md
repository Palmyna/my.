# Noms français des espèces Pokémon

`pokemon-fr.json` est le référentiel versionné `dex_number → nom français`. PokéAPI est autorisée exclusivement pour ces noms d'espèces. Les cartes, variantes, rattachements, disponibilités, images et dates restent issus de TCGdex et des overrides MY.

## Source et format

La [documentation officielle PokéAPI v2](https://pokeapi.co/docs/v2#pokemon-species) décrit les seules ressources utilisées :

- `https://pokeapi.co/api/v2/pokemon-species/` pour découvrir toutes les espèces par pagination ;
- `https://pokeapi.co/api/v2/pokemon-species/{id}/` pour lire `id` et le nom dont `names[].language.name` vaut exactement `fr`.

Les ressources `pokemon`, `pokemon-form`, les noms anglais et les noms de cartes ne sont jamais utilisés. Le numéro national correspond à l'ID de l'espèce, jamais à une forme.

Le fichier est un objet JSON plat UTF-8, trié par numéro croissant, indenté avec deux espaces et terminé par LF :

```json
{
  "1": "Bulbizarre",
  "25": "Pikachu",
  "150": "Mewtwo"
}
```

Cet exemple est abrégé ; le fichier contient toutes les espèces récupérées. Aucun payload brut, timestamp de génération ou métadonnée volatile n'y figure. Les caractères du nom source sont conservés exactement, sans trim, normalisation Unicode, changement de casse ni remplacement typographique.

## Mise à jour manuelle

Depuis la racine du dépôt, après `npm ci` :

```sh
npm run pokemon:update
npm test
git diff -- data/pokemon/pokemon-fr.json
```

Cette commande n'accède à aucune base. Node 24 utilise son `fetch` natif, sans dépendance HTTP supplémentaire. Les pages sont lues séquentiellement par lots demandés de 200 ; le total est découvert à chaque exécution, sans plafond fixé à 1 025. Les espèces sont lues avec six requêtes simultanées maximum.

Chaque tentative a un timeout de 15 secondes, couvrant la lecture du corps. Les erreurs réseau/timeouts et HTTP 408, 429 ou 5xx autorisent trois tentatives maximum, avec attente de 500 puis 1 000 ms ; `Retry-After` peut allonger l'attente jusqu'à 30 secondes. Les autres erreurs HTTP, JSON ou de validation sont bloquantes. Les redirections sont refusées et les liens de pagination/espèces sont limités aux endpoints autorisés.

Zod vérifie les données utiles, les entiers positifs compatibles avec `dex_number`, les noms non vides et la forme exacte du mapping. Le générateur vérifie aussi la cohérence du total paginé, les IDs uniques et leur correspondance aux réponses, ainsi que l'unicité du nom `fr`. Le chargeur détecte les clés JSON dupliquées, y compris après décodage d'échappements Unicode, avant tout accès DB.

Une espèce sans nom français non vide est signalée avec son numéro ; la génération échoue et conserve l'ancien fichier. Aucun fallback anglais ni nom inventé n'est publié. Toutes les requêtes en cours sont terminées avant de retourner un échec. Après validation complète, le contenu est écrit dans un fichier temporaire voisin, synchronisé sur disque puis renommé atomiquement ; une erreur préalable laisse l'ancien référentiel intact. Les données pertinentes inchangées produisent exactement les mêmes octets.

Dans l'environnement Windows vérifié, `NODE_USE_SYSTEM_CA=1` permet à Node d'utiliser les autorités de certification du système. La vérification TLS reste activée.

## Consommation par le catalogue

`catalog:validate` et `catalog:sync` chargent une fois le fichier local validé via `pokemon-reference.ts`. Le générateur HTTP est un point d'entrée indépendant, jamais importé par la synchronisation ; PokéAPI n'est jamais appelée par le catalogue ou le frontend. Il n'existe aucun déclenchement automatique de cette maintenance.

Le rapprochement reste fondé sur `dex_number` et préserve `pokemon.id`. Le nom du référentiel remplace le nom précédent, y compris pour une ligne historique devenue inactive. Un dex absent du fichier produit `name_fr=NULL`, le diagnostic `pokemon-name-missing` et un compteur dans le rapport ; le Pokémon reste conservé.

Le SHA-256 du mapping canonique validé est enregistré dans `pokemon_reference.hash` des rapports locaux et du JSON `private.catalog_sync_runs.report` pour les applications réussies. Canonisation : clés triées lexicalement sans locale, valeurs JSON exactes, sans espaces. L'empreinte est indépendante de la mise en page ; aucun nouveau champ SQL n'est nécessaire.

La reproductibilité du catalogue dépend du snapshot TCGdex, du contenu de ce référentiel, des overrides Git, du code et de l'état initial de la base pour les IDs. Un nom corrigé est une métadonnée : il ne modifie aucun rattachement, liste ordonnée, hash ou `generation_version` de cible.

## Génération vérifiée le 7 septembre 2026

1 025 espèces découvertes, 1 025 noms français, zéro nom absent ; numéros de 1 à 1 025. Le dernier nom obtenu est `Pêchaminus`. Empreinte canonique :

```text
753e1abca4935bdd6ea4d2c3757b23ae518778678466eb94af8a730f3df393f5
```

Les preuves de synchronisation locale sont dans le [complément du rapport Phase 2](../../docs/reports/2026-09-07-PHASE2-POKEMON-NAMES.md).
