# Référentiel des espèces Pokémon

`pokemon-reference.json` remplace `pokemon-fr.json` : référentiel local versionné `dex_number → {name_fr, types}`. PokéAPI fournit uniquement ces métadonnées d'espèce ; cartes, variantes, rattachements, disponibilités, images et dates restent issus de TCGdex et des overrides MY.

## Source et format

La [documentation PokéAPI v2](https://pokeapi.co/docs/v2) décrit les ressources utilisées : liste paginée `pokemon-species`, puis `pokemon-species/{id}` pour le nom FR et les variétés. Exactement une variété `is_default` requise. Le générateur suit son URL `pokemon` contrôlée, vérifie ID/nom et rattachement à l'espèce, puis ordonne les types par `slot`. Il ne suppose jamais que l'ID de variété égale le numéro Pokédex. Raichu conserve les types de sa variété principale, même sur une carte représentant Raichu d'Alola. Formes alternatives et `past_types` ignorés.

```json
{
  "6": {"name_fr":"Dracaufeu","types":["fire","flying"]},
  "25": {"name_fr":"Pikachu","types":["electric"]}
}
```

Fichier complet UTF-8, une entrée par ligne, dex croissants, deux espaces d'indentation, LF final. Aucun payload brut/timestamp/valeur volatile. Typographie FR exacte, sans trim, changement de casse ni normalisation Unicode ; noms absents/vides/caractères de contrôle refusés.

Types autorisés : `normal`, `fire`, `water`, `electric`, `grass`, `ice`, `fighting`, `poison`, `ground`, `flying`, `psychic`, `bug`, `rock`, `ghost`, `dragon`, `dark`, `steel`, `fairy`. Un ou deux types distincts par espèce ; slot 1 principal, slot 2 secondaire. Slots manquants/répétés, types inconnus/absents/dupliqués, défaut absent/multiple et incohérences d'IDs/noms/ressources bloquent la génération.

## Mise à jour manuelle

```sh
npm run pokemon:update
npm test -- --project catalog --maxWorkers=4
git diff -- data/pokemon/pokemon-reference.json
```

Commande indépendante de PostgreSQL, jamais automatique. Node `fetch` natif ; pages séquentielles, total découvert sans plafond, six requêtes maximum espèces/variétés comprises. URLs limitées aux endpoints PokéAPI attendus, pagination contrôlée, aucune redirection.

Timeout de 15 secondes par tentative, corps compris. Erreurs réseau/timeouts et HTTP 408/429/5xx : trois tentatives maximum, délais 500 puis 1 000 ms, `Retry-After` plafonné à 30 secondes. Autres erreurs HTTP/JSON/validation bloquantes. Toutes les requêtes en cours terminées avant échec. Validation complète, temporaire voisin, synchronisation disque puis rename atomique : aucune publication partielle, ancien fichier conservé sur erreur. Le chargeur rejette les clés JSON répétées, même échappées ou imbriquées. Source pertinente identique : mêmes octets.

Sur Windows, `NODE_USE_SYSTEM_CA=1` utilise les certificats système sans désactiver TLS.

## Consommation Catalogue

`catalog:validate` et `catalog:sync` chargent uniquement le fichier local validé. Générateur HTTP jamais importé par le pipeline ; frontend et synchronisation ne contactent jamais PokéAPI. Fichier absent/invalide : échec avant DB, aucun fallback.

Rapprochement par `dex_number`, IDs conservés. Le référentiel alimente `name_fr`, `primary_type`, `secondary_type`, même sur les lignes historiques inactives. Dex absent : trois NULL et diagnostic `pokemon-reference-missing`. Rapport : compteurs sans nom/type, mono-types et doubles types. DB : 18 identifiants seulement, secondaire exige un primaire différent, colonnes nullables. Aucune couleur PostgreSQL.

Hash canonique SHA-256 : **nom + types ordonnés**, clés d'objets triées lexicalement sans locale, JSON exact sans espaces. Mise en page/ordre des propriétés sans effet. Empreinte dans `pokemon_reference.hash` des rapports et du JSON `private.catalog_sync_runs.report`.

Nom/type corrigé : métadonnée seule, sans changement de `card_pokemon`, variantes éligibles, ordre, hash structurel ni `generation_version`. Reproductibilité : snapshot TCGdex, référentiel, overrides, code et état initial des IDs fixés. Retrouver le dernier `source_sha` réussi local puis réutiliser ce SHA ; ne pas résoudre silencieusement HEAD distant.

## Résultat local 7D.1 — 4 octobre 2026

1 025 espèces/noms FR, 499 mono-types, 526 doubles types, 18 types représentés, zéro anomalie, dex 1 à 1 025. Deux générations réelles comparées octet par octet. Hash canonique :

```text
b4370983bd398b23863001bbe5ad76f49f54c7d8c7afe0786d6c9683f38d7268
```

Même snapshot TCGdex `1c30c50253756bafecf0f065fc377f77016ad12f` : uniquement 1 025 lignes Pokémon enrichies, 1 213 structures inchangées. Aucune application Cloud. Premier référentiel de noms archivé dans le [rapport Phase 2](../../docs/reports/2026-09-07-PHASE2-POKEMON-NAMES.md).
