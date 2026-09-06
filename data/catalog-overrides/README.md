# Corrections du catalogue MY.

Les fichiers `*.json` de ce dossier contiennent des tableaux d'actions validés strictement par [`overrides.ts`](../../scripts/catalog/overrides.ts). `overrides.json` est volontairement vide : aucun correctif réel n'a été inventé pour l'import initial.

Chaque correction nécessite une raison factuelle, un identifiant durable et une cible connue. Ajouter/modifier le JSON, puis exécuter `catalog:validate` et un dry-run au SHA voulu. Lire le rapport avant `--apply`. Les corrections redondantes ne sont jamais supprimées automatiquement ; leur retrait se fait dans Git.

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

`card.patch` accepte `name`, `category`, `rarity`, `image`, `date`, `active`. Les champs descriptifs peuvent être `null`. `variant.patch` accepte `type`, `subtype`, `size`, `stamp`, `foil`, `label`, `image`, `availability`, `active`. Disponibilités : `confirmed`, `unknown`, `unavailable`. Pour désactiver : `active: false`. Pour retirer un rattachement : `mapping.exclude`.

`variant.add` requiert `type` et `availability`, avec taille standard implicite. `card.add` requiert set, numéro local, nom, date complète ou `null`, et au moins une variante. La carte devient `my:<id-override>` ; une variante ajoutée séparément est sélectionnable par `my:<id-override>`. Utiliser les propriétés canoniques TCGdex, pas les traductions. Les stamps sont un tableau.

Un patch de variante source cible sa clé **avant correction**. L'alias privé préserve l'ID si foil ou stamps changent. Les cibles inconnues, doublons et conflits bloquent avant écriture. Les ajouts retirés sont conservés inactifs. Pour maintenir une carte disparue, cibler la carte historique et ses variantes explicitement ; son set doit encore être reconnu.

Les traces appliquées résident dans `private.catalog_overrides`. Git reste l'autorité ; une modification manuelle de PostgreSQL ne le remplace pas.
