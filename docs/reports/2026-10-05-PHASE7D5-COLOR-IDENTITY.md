# Phase 7D.5 — Identité couleur Catalogue ↔ Collections

Livraison locale du 5 octobre 2026, **0.7.11**. Arrêt strict à 7D.5 ; 7E non commencée.

## État et migration

- Branche **dev**, HEAD initial/final **51206df377ead5ccf253545de2a55e9b67e29e53 — v0.7.10** ; worktree initial propre. Versions package/lockfile initiales 0.7.10, finales 0.7.11 ; footer toujours injecté depuis le package.
- Instructions, documents concernés, historique Git/migrations, contrats SQL/TS/services, palette, consommateurs Catalogue/Collection et tests inspectés avant édition. CLI Supabase installée **2.119.0**, aides consultées avec Context7 et `--help`. Supabase local actif, historique initial **25/25**.
- Migration CLI [20261005181925_phase7d5_collection_identity.sql](../../supabase/migrations/20261005181925_phase7d5_collection_identity.sql), créée par `migration new`, puis appliquée exclusivement via `migration up --local`. Historique final **26/26** ; un seul BEGIN/COMMIT. Types régénérés par `npm run db:types`, sans édition manuelle.
- `CREATE OR REPLACE VIEW` ajoute **en fin de contrat** `target_primary_type TEXT NULL` et `target_secondary_type TEXT NULL`. Valeurs directes de la jointure `pokemon` existante pour une cible Pokémon ; Extension/libre : NULL. Aucun stockage sur `collections`, couleur, gradient, fetch supplémentaire ou N+1.
- `security_invoker=true`, ACL `authenticated=SELECT`, révocations PUBLIC/anon/service_role, politiques MFA/profil/partage et possession du propriétaire conservés. Aucun SECURITY DEFINER ni changement RLS. Comparaison avant/après : mêmes anciens champs/compteurs, ACL, politiques et hashes des 11 tables inspectées, y compris structures automatiques, catalogue et données utilisateur. Après tests : mêmes données persistantes.
- Compatibilité : anciens lecteurs SQL conservés ; déployer schéma avant nouveau frontend. Retour arrière : frontend précédent, schéma additif/données conservés ; aucune contraction ou suppression implicitement autorisée.

## Contrats et architecture

`DashboardCollection` ajoute `targetPrimaryType` et `targetSecondaryType`, chacun `PokemonType | null`. `CollectionOverview` hérite toujours du même contrat. Les deux lecteurs du service Collections sélectionnent ces champs, utilisent `isPokemonType` et refusent types inconnus, secondaire orphelin/identique et métadonnées sur cible non-Pokémon via l'erreur sûre `CollectionsError('unexpected')`. Les types générés restent des chaînes nullables, validées à la frontière runtime.

Source unique : [catalog-identity.ts](../../src/lib/catalog-identity.ts). `resolvePokemonIdentity(primary, secondary)` distingue mono/double-type et fallback neutre ; `resolveFunctionalIdentity(kind)` distingue explicitement Extension, Personnalisée et Partagée. Plus d'appel sans argument confondant ces intentions. `resolveCollectionIdentity` est pur : **shared → free → automatic set → automatic pokemon → neutre**. Noms, IDs et réseau n'interviennent jamais. Ancienne palette de huit couleurs, hash FNV/modulo et classes historiques supprimés ; tests remplacés par règles sémantiques.

`collectionPresentation` fournit accent, secondary, surface, border, gradient et compagnons texte/FAB. Surfaces `color-mix()` : primaire **12 %**, secondaire **10 %** dans graphite ; primaire dominant jusqu'à 35 % du gradient, bordure **35 %**. Texte coloré : 75 % accent / 25 % texte clair, sans modifier la palette. Progression unie primaire ; FAB propriétaire primaire, libellé blanc pour rouge MY., graphite pour types/Extension. Danger et succès restent indépendants.

## Palette finale

**Toutes les valeurs de départ sont conservées**, après comparaison des vraies tuiles dans les mêmes conditions. Aucune translation de famille chromatique ni ajustement HEX. Les valeurs représentent MY., pas une palette Pokémon officielle universelle.

| Type | light | dark |
|---|---|---|
| Normal | #AEB5B8 | #555B5E |
| Feu | #E58A4A | #7E3E21 |
| Eau | #6DA7CF | #285B80 |
| Électrik | #E2C84A | #7C6920 |
| Plante | #93BD63 | #46672D |
| Glace | #78C8DE | #326A7A |
| Combat | #C97842 | #6F3B25 |
| Poison | #B185C1 | #654572 |
| Sol | #D2B85A | #715F29 |
| Vol | #77BDD7 | #4E6873 |
| Psy | #D97AB2 | #7E3F65 |
| Insecte | #88A95C | #465D2A |
| Roche | #A9974C | #5C5024 |
| Spectre | #917BB2 | #4D3F66 |
| Dragon | #719FC9 | #744B5E |
| Ténèbres | #9B979E | #48464B |
| Acier | #A8BEC0 | #536B6D |
| Fée | #E6A7D3 | #81506E |

Accents fonctionnels finaux : **Extension #44C7B7**, **Personnalisée #E22B35**, **Partagée #6366F1**. Fallback neutre : #8FA8BD. Indigo distinct de Dragon/Spectre, teal distinct des familles Eau/Glace/Acier ; rouge MY. inchangé. Les compagnons de texte et surfaces dérivées assurent contraste et intégration graphite.

## Comportement livré

Dashboard : structure, ordre serveur et contenu des tuiles conservés ; bord gauche, bordure, surface/gradient subtil, type, progression et focus utilisent l'identité. Libellé **Partagée · Lecture seule** conservé.

Collection : overview graphite teinté, primaire → secondaire subtil, séparation, progression, focus/actions contextuelles, sélecteur actif et FAB cohérents avec Dashboard. Partagée entièrement indigo, sans couleur Pokémon/Extension derrière et sans menu/FAB propriétaire. Contenu, recherche, Liste/Cartes/Classeur, reorder et règles de possession inchangés ; aucune recoloration générale des cartes ou lignes.

Catalogue : Pokémon utilise exactement la palette des Collections ; Extension et Carte utilisent explicitement la même famille teal, sur surfaces graphite subtiles. Recherche, préférences, vues, liens, images et Détail existants conservés ; Carte reste sans recherche locale ni CTA Collection. Catalogue toujours couleur, sans état de possession.

## Validation exécutée

| Contrôle | Résultat |
|---|---|
| DB ciblés Dashboard/identité | **PASS — 2 fichiers / 40 assertions** |
| Suite DB complète | **PASS — 21 fichiers / 1 181 assertions** |
| `db:lint` | **PASS — aucune erreur de schéma** |
| Types Supabase | **PASS — deux colonnes attendues générées localement** |
| Tests ciblés palette/resolver/service | **PASS — 3 fichiers / 205 tests** |
| Suite complète frontend + catalogue/pipeline + fonctions | **PASS — 58 fichiers / 1 675 tests** |
| `typecheck` / `lint` | **PASS — aucun avertissement ESLint** |
| `build` | **PASS — principal 740,65 kB / 209,73 kB gzip** |
| `git diff --check` | **PASS** |

Les tests existants sont conservés, y compris sécurité/MFA/profil/retrait de partage, compteurs/propriétaire, Catalogue Pokémon/Extension/Carte, recherche/vues/préférences/Détail, Liste/Cartes/Classeur, partage et feedback FAB. Nouveaux tests : 18 types, sept doubles types, identités/priorités/fallback, indépendance nom/ID, validation stricte des métadonnées, thème rendu Dashboard/Collection et FAB propriétaire. pgTAP vérifie mono/double-type, NULL appropriés, métadonnées live, absence de fuite/stockage redondant et révocation immédiate.

Revue React selon le skill `vercel:react-best-practices` : identité dérivée sans nouvel état métier, requêtes/cache/hooks existants, types/props et frontières Auth conservés, liens/contrôles accessibles sans modification des parcours.

## Preuve visuelle et accessibilité

Navigateur Chrome isolé via `agent-browser`. Desktop **1440×1000**, mobile **390×844**, complément **320×740**. Harness ignoré temporaire avec composants de production ; 18 types sous forme de vraies tuiles, accents/surfaces/bordures/progression/focus comparés, puis Dashboard mixte et Collection dans les cinq contextes, y compris partage Extension.

Doubles types issus du snapshot réel : **Dracaufeu Feu/Vol, Léviator Eau/Vol, Bulbizarre Plante/Poison, Fantominus Spectre/Poison, Dracolosse Dragon/Vol, Obalie Glace/Eau, Racaillou Roche/Sol**. Mono : Pikachu Électrik. Trois identités fonctionnelles comparées simultanément. Catalogue réellement rendu depuis les payloads RPC locaux Pokémon, Légendes Brillantes/Alliance Infaillible et Cancrelove et Mouscoto GX.

Le Dashboard local dispose de **9 collections libres, aucun partage ni collection automatique** : leurs lignes RLS réelles sont rendues dans le harness. Les autres collections, la session, les préférences et possessions sont **simulées**, avec types et cartes du snapshot réel. Validation navigateur = preuve de rendu ; aucune nouvelle preuve HTTP Auth/MFA ou mutation personnelle réelle revendiquée. Preuve backend distincte = pgTAP sur vraie DB locale, rôle caller/RLS, transactions annulées.

- Liste/Cartes/Classeur desktop/mobile, recherche positive Chenipan et conservation entre vues, menus, dialog FAB + Escape/restauration du focus vérifiés. Les images chargées possédées restent couleur ; manquantes **grayscale(1), opacity .55** dans les trois vues ; Catalogue sans filtre.
- Progression mesurée sans gradient saturé ; FAB jaune/or, orange Feu, teal et rouge suivant contexte. Partages Pokémon/Extension : indigo et aucun FAB. Règle footer : FAB au-dessus du footer, **16 px mobile / 24 px desktop**. Aucun débordement horizontal mesuré sur les cas contrôlés.
- Mesures navigateur sur **31 tuiles** : texte coloré ≥ **4,81:1**, accent/focus sur gradient ≥ **3,53:1**, progression Dashboard ≥ **4,20:1**. Tests de contraste des rôles : texte/FAB ≥4,5, focus/progression ≥3. Couleur jamais seule : textes, compteurs, aria-pressed et état partagé conservés.
- Axe **4.12.1**, WCAG2 A/AA : **0 violation détectée** sur Dashboard mixte, Collection libre/partagée et les quatre fiches Catalogue contrôlées. Une catégorie `incomplete` liée aux gradients, complétée par les mesures de contraste. Aucune erreur JavaScript applicative relevée.
- Émulation réelle CDP : `forced-colors: active` et `prefers-reduced-motion: reduce`. Focus/progression/sélection utilisent Highlight, bordures ButtonText ; menu à trois carrés maintenu visible. Animation Classeur `none`. Styles danger/succès, tactile, responsive et footer conservés.

Assets CDN préexistants parfois absents/échoués, notamment Légendes Brillantes ; placeholder commun opérationnel. Cartes Alliance Infaillible réellement chargées utilisées pour contrôler couleur/N&B. Aucun asset corrigé ou synchronisation Catalogue effectuée.

## Clôture

Harness, HTML, services simulés, configuration Vite et scripts temporaires supprimés ; aucune route de fixture livrée. Captures/mesures locales ignorées conservées comme preuve, navigateur isolé et serveur de validation fermés. Avertissements préexistants conservés : bundle >500 kB, conseil Vitest jsdom, notice de formatage CLI/types, notices Git LF/CRLF.

**Aucune écriture ou migration Supabase Cloud, aucun reset, aucun commit, aucun push.** Worktree final non indexé, branche/HEAD inchangés. Migration prête pour audit et checkpoint Cloud explicite en fin de Phase 7. Aucun travail 7D.5 restant identifié ; validation complémentaire possible en session locale Auth réelle, distincte de cette preuve de rendu. 7E non commencée.
