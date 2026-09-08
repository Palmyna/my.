# Phase 2 — Recherche locale dans le catalogue

Vérifications réalisées le **7 septembre 2026**, depuis le commit MY. `97240ad6d3a07e06ddcd01e6438f094d7b35e54a`. Restitution finalisée le **8 septembre 2026** après une interruption de session, depuis le working tree existant.

**Résultat : `catalog:find` est implémenté, testé et strictement en lecture seule sur Supabase local.** Le cas réel Pikachu 28/73 retourne `tcgdex:sm3.5-28` avec **5 variantes**. La reprise a uniquement ajouté ce rapport, déjà référencé par les autres documents, puis contrôlé les liens, le diff et l'arrêt local. Aucun code n'a été réimplémenté et aucune suite réussie n'a été relancée pendant la reprise.

## Commande et architecture

```powershell
npm run catalog:find -- "<recherche libre>"
npm run catalog:find -- "Pikachu Légendes Brillantes"
npm run catalog:find -- "Pikachu 28"
npm run catalog:find -- "legendes brillantes"
npm run catalog:find -- "Pikachu SérieQuiNExistePas"
npm run catalog:find -- "Pikachu 28" --limit 2
```

La limite vaut 20 par défaut et accepte un entier de 1 à 100. Le total est calculé avant limitation.

- [Moteur générique](../../scripts/catalog/search-catalog.ts) : fonctions pures de normalisation, tokenisation, recherche et classement ; aucun import, accès SQL, dépendance Node, réseau ou affichage.
- [Adaptateur local](../../scripts/catalog/search-catalog-db.ts) : une projection par carte, ses Pokémon réellement liés, son set et son nombre de variantes standard ; validation Zod, transaction `REPEATABLE READ READ ONLY`, délai SQL de 15 secondes et fermeture avec `ROLLBACK`.
- [CLI](../../scripts/catalog/catalog-find.ts) : validation des arguments, chargement de la projection, appel du moteur, tableau lisible, total et erreurs explicites sans secrets.

La connexion réutilise les protections locales existantes : loopback, port 55322, base `postgres`, contrôle du serveur et du schéma attendu. La requête SQL est constante et ne reçoit pas le texte libre de l'utilisateur.

Les cartes inactives restent consultables pour la maintenance et leur état est affiché lorsqu'un résultat est inactif. Les variantes comptées sont toutes les variantes standard présentes, y compris celles inactives ou sans confirmation française. Aucun rapprochement Pokémon n'est déduit du texte.

Le moteur reçoit des objets indépendants de la base et peut être réutilisé ultérieurement. Le chargement de la projection complète concerne cette CLI de maintenance ; aucune API, RPC, interface ou décision de transport du futur moteur du site n'est ajoutée. Le navigateur ne devra pas charger le catalogue complet, conformément à l'[architecture](../05-ARCHITECTURE.md).

## Normalisation, champs et classement

Normalisation Unicode NFKD, suppression des marques combinatoires, minuscules, `œ → oe`, `æ → ae`, harmonisation des apostrophes et tirets, réduction des espaces. Les valeurs affichées restent les valeurs originales. Les tokens conservent la ponctuation utile aux identifiants et fractions ; les doublons sont supprimés.

Chaque terme doit correspondre à la même carte, éventuellement dans un champ différent. Champs recherchés : nom français de carte, noms français des Pokémon liés, numéro local, nom français du set, abréviations du set et identifiants techniques de carte/set, y compris le sélecteur copiable `tcgdex:<id>` ou l'alias local réel.

Le meilleur score de chaque terme est retenu : égalité complète du nom de carte 120, Pokémon 110, numéro textuel 100, set 90, abréviation 85, identifiant 80 ; mot entier 60, préfixe de champ ou de mot 40, fragment 15. Les scores sont additionnés, avec au plus un bonus d'égalité de la phrase formée par les termes normalisés et dédupliqués, utilisant les mêmes poids. Les égalités sont départagées lexicalement par nom de carte, set, numéro, identifiant source puis identifiant interne, après normalisation des champs textuels. Le résultat ne dépend ni de l'ordre SQL ni de la locale système.

Les termes numériques utilisent exclusivement le numéro local structuré :

- `28` correspond à `28` et `028` ; les zéros initiaux sont ignorés.
- Une composante numérique exacte avec préfixe/suffixe, comme `TG028` ou `28A`, reste reconnue.
- Un préfixe numérique comme `280` ou `SWSH285` est moins bien classé ; `128` ne correspond pas à `28`.
- Les scores respectifs sont 200 pour un numéro simple exact, 160 pour une composante exacte avec préfixe/suffixe et 80 pour un préfixe numérique.
- `28/73` exige le numéro exact et un total officiel de 73 ; aucun préfixe numérique n'est accepté pour une fraction.
- Un nombre ne correspond pas accidentellement à un nom, un identifiant technique ou au seul total du set.

Le contrat détaillé et la politique de scoring sont documentés dans le [pipeline catalogue](../07-CATALOG-SYNC.md#recherche-de-maintenance-catalogfind).

## Résultats réels conservés

Les tableaux suivants restituent les résultats de la base locale existante, conservés dans `.cache/find-integration.json`. Ils n'ont pas nécessité de redémarrage ni de nouvelle recherche pendant la reprise.

### « Pikachu Légendes Brillantes »

**1 résultat.**

| Card | Nom | Pokémon | Set | N° | Variantes |
| --- | --- | --- | --- | --- | --- |
| tcgdex:sm3.5-28 | Pikachu | Pikachu | Légendes Brillantes | 28/73 | 5 |

Le sélecteur `tcgdex:sm3.5-28` se copie directement dans le champ `card` d'un override.

### « Pikachu 28 »

**7 résultats, dans cet ordre.**

| Card | Nom | Pokémon | Set | N° | Variantes |
| --- | --- | --- | --- | --- | --- |
| tcgdex:sm3.5-28 | Pikachu | Pikachu | Légendes Brillantes | 28/73 | 5 |
| tcgdex:swsh10.5-028 | Pikachu | Pikachu | Pokémon GO | 028/78 | 2 |
| tcgdex:basep-28 | Pikachu surfeur | Pikachu | Wizards Black Star Promos | 28/53 | 2 |
| tcgdex:sv08.5-028 | Pikachu-ex | Pikachu | Évolutions Prismatiques | 028/131 | 1 |
| tcgdex:tk-xy-p-28 | Dynavolt | Dynavolt | XY Kit du dresseur (Pikachu Libre) | 28/30 | 1 |
| tcgdex:swshp-SWSH285 | Pikachu V | Pikachu | Promo SWSH | SWSH285/307 | 1 |
| tcgdex:swshp-SWSH286 | Pikachu VMAX | Pikachu | Promo SWSH | SWSH286/307 | 1 |

Dynavolt est un résultat cohérent : « Pikachu » correspond au nom de son set et « 28 » à son numéro. Les numéros SWSH285 et SWSH286 apparaissent après les correspondances numériques exactes.

### « legendes brillantes »

**20 résultats affichés sur 78**, malgré l'absence d'accents dans la requête.

| Card | Nom | Pokémon | Set | N° | Variantes |
| --- | --- | --- | --- | --- | --- |
| tcgdex:sm3.5-36 | Abo | Abo | Légendes Brillantes | 36/73 | 1 |
| tcgdex:sm3.5-20 | Aligatueur | Aligatueur | Légendes Brillantes | 20/73 | 1 |
| tcgdex:sm3.5-37 | Arbok | Arbok | Légendes Brillantes | 37/73 | 1 |
| tcgdex:sm3.5-57 | Arceus Brillant | Arceus | Légendes Brillantes | 57/73 | 1 |
| tcgdex:sm3.5-64 | Attrape-Pokémon | — | Légendes Brillantes | 64/73 | 1 |
| tcgdex:sm3.5-51 | Baggaïd | Baggaïd | Légendes Brillantes | 51/73 | 1 |
| tcgdex:sm3.5-50 | Baggiguane | Baggiguane | Légendes Brillantes | 50/73 | 1 |
| tcgdex:sm3.5-4 | Balignon | Balignon | Légendes Brillantes | 4/73 | 1 |
| tcgdex:sm3.5-1 | Bulbizarre | Bulbizarre | Légendes Brillantes | 1/73 | 1 |
| tcgdex:sm3.5-48 | Chacripan | Chacripan | Légendes Brillantes | 48/73 | 1 |
| tcgdex:sm3.5-5 | Chapignon | Chapignon | Légendes Brillantes | 5/73 | 1 |
| tcgdex:sm3.5-11 | Chartor | Chartor | Légendes Brillantes | 11/73 | 1 |
| tcgdex:sm3.5-65 | Chrys | — | Légendes Brillantes | 65/73 | 1 |
| tcgdex:sm3.5-19 | Crocrodil | Crocrodil | Légendes Brillantes | 19/73 | 1 |
| tcgdex:sm3.5-58 | Déplace Dégâts | — | Légendes Brillantes | 58/73 | 1 |
| tcgdex:sm3.5-69 | Double Énergie Incolore | — | Légendes Brillantes | 69/73 | 1 |
| tcgdex:sm3.5-67 | Échange | — | Légendes Brillantes | 67/73 | 1 |
| tcgdex:sm3.5-31 | Électrode | Électrode | Légendes Brillantes | 31/73 | 1 |
| tcgdex:sm3.5-63 | Éleveuse de Pokémon | — | Légendes Brillantes | 63/73 | 1 |
| tcgdex:sm3.5-73 | Éleveuse de Pokémon | — | Légendes Brillantes | 73/73 | 1 |

### Recherche inexistante et autres cas

`Pikachu SérieQuiNExistePas` retourne **0 résultat**, avec le message :

```text
Aucun résultat pour "Pikachu SérieQuiNExistePas".
```

La CLI termine normalement avec le code 0. Une recherche vide ou des arguments invalides produisent l'aide d'utilisation et le code 1. Supabase arrêté produit une erreur explicite invitant à exécuter `npm run supabase:start`, sans exposer d'URL de connexion, mot de passe ou trace du pilote. Ces comportements ont également été exécutés avant l'interruption.

| Requête | Total | Affichés | Temps moteur mesuré |
| --- | ---: | ---: | ---: |
| Pikachu Légendes Brillantes | 1 | 1 | 141 ms |
| Pikachu 28 | 7 | 7 | 124 ms |
| Pikachu | 221 | 20 | 114 ms |
| legendes brillantes | 78 | 20 | 104 ms |
| Pikachu SérieQuiNExistePas | 0 | 0 | 102 ms |
| Pikachu Zekrom | 5 | 5 | 104 ms |
| Raichu GX | 9 | 9 | 112 ms |
| Évoli Promo | 24 | 20 | 106 ms |

La projection a chargé **19 907 cartes** en **1543 ms**, connexion locale comprise. Mesures ponctuelles du 7 septembre sur cette machine, sans garantie de performance. Le cas « Pikachu Zekrom » confirme la recherche sur deux Pokémon réellement liés à une même carte.

## Tests et validations réellement exécutés

Résultats acquis avant l'interruption, après les dernières modifications de code :

| Vérification | Résultat |
| --- | --- |
| `npm test` | **125 tests réussis**, 6 fichiers, dont **41 nouveaux tests** de recherche |
| `npm run typecheck` | Réussi |
| `npm run lint` | Réussi, aucun avertissement |
| `npm run build` | Réussi |
| Intégration sur la base locale existante | **28 assertions réussies**, 8 requêtes |
| Comparaison complète avant/après | Identité des audits, `FIND_READ_ONLY_VERIFIED` |
| CLI ciblée | Requêtes demandées, limite 2, absence de résultat, requête vide et Supabase indisponible vérifiés |

Les tests couvrent notamment normalisation, AND entre champs, numéros et fractions, scoring, stabilité avec ordre d'entrée inversé, absence de mutation des entrées, alias locaux, cartes inactives, valeurs absentes, limites, transaction en lecture seule, fermeture de connexion et erreurs sans secrets.

**Pendant la reprise du 8 septembre : aucune exécution de `npm test`, `typecheck`, `lint` ou `build` ; aucun reset, reconstruction, réimport ou nouvelle exécution de l'intégration.** Seuls l'inspection du working tree, la restitution des preuves, les liens Markdown, `git diff --check` et une lecture du statut Supabase ont été nécessaires.

## Conservation des données et arrêt local

Les audits `.cache/find-before.json` et `.cache/find-after.json` sont identiques. Ils couvrent les données catalogue complètes, identifiants, dates, relations, états de génération des cibles, séquences, journaux et clés privées, données utilisateur et fichier d'override existant.

| Donnée | Avant et après |
| --- | ---: |
| Pokémon | 1 025 |
| Séries | 18 |
| Sets | 188 |
| Cartes | 19 907 |
| Variantes standard | 31 904 |
| Relations carte/Pokémon | 16 820 |
| Cibles automatiques | 1 213 |

Empreinte SHA-256 de la représentation canonique du catalogue, identique avant et après :

```text
6757bc68b39152e2eb9fa139a8dd8cccaf728d540a376e215b9d470d1cad2dee
```

Le fichier [pikachu-sm3.5-28.json](../../data/catalog-overrides/pikachu-sm3.5-28.json) n'a pas été modifié. Les audits confirment l'identité de son contenu avant et après les recherches ; il ne figure pas dans les fichiers modifiés du working tree.

Les **5 variantes** de Pikachu étaient déjà présentes après l'application réelle de cet override : la recherche n'en ajoute aucune. Aucune donnée catalogue ou utilisateur n'a été modifiée ; aucun appel de synchronisation, validation/application d'override ou accès en écriture au cloud n'a été effectué par cette tâche. La Phase 3 n'a pas commencé. Aucun commit automatique.

L'arrêt `npm run supabase:stop` avait déjà réussi avant l'interruption avec `backup: true` pour `my-local`. La lecture de statut effectuée pendant la reprise confirme l'absence du conteneur `supabase_db_my-local`. **Supabase local est arrêté, avec conservation des données du volume local.** Aucun nouveau démarrage ni nouvel arrêt n'a été nécessaire.

## Fichiers livrés

Créés :

- [scripts/catalog/search-catalog.ts](../../scripts/catalog/search-catalog.ts)
- [scripts/catalog/search-catalog-db.ts](../../scripts/catalog/search-catalog-db.ts)
- [scripts/catalog/catalog-find.ts](../../scripts/catalog/catalog-find.ts)
- [scripts/catalog/search-catalog.test.ts](../../scripts/catalog/search-catalog.test.ts)
- [Ce rapport](2026-09-07-PHASE2-CATALOG-FIND.md)

Modifiés :

- [package.json](../../package.json) : commande npm.
- [README.md](../../README.md) : état réel, commandes et lien de restitution.
- [data/catalog-overrides/README.md](../../data/catalog-overrides/README.md) : recherche puis copie du sélecteur dans le workflow d'override.
- [docs/05-ARCHITECTURE.md](../05-ARCHITECTURE.md) : séparation moteur, adaptateur et CLI.
- [docs/07-CATALOG-SYNC.md](../07-CATALOG-SYNC.md) : contrat, règles de recherche, limites et maintenance.

Vérifiés sans modification : override Pikachu, autres données versionnées, frontend, migrations SQL, configuration Supabase, types générés et lockfile. Les scripts et résultats d'audit sous `.cache/` sont des fichiers de travail locaux ignorés par Git. Aucun autre fichier suivi n'a été modifié.
