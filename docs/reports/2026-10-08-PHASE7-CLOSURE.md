# Phase 7 — Mise à jour de l’outillage et clôture finale

Date : **8 octobre 2026**. Version applicative conservée : **0.7.21**.

## Statut et attribution des preuves

**PHASE 7 TERMINÉE ET VALIDÉE. Phases 0 à 7 terminées et validées.** Prochaine phase : **Phase 8 — Mise à jour des collections automatiques**, planifiée et non commencée.

Cette clôture distingue trois sources : l’[audit technique 7G.1](2026-10-07-PHASE7G1-AUDIT.md) exécuté précédemment par Codex et validé, le checkpoint Cloud exécuté **manuellement par le propriétaire** et communiqué dans sa demande, puis les validations **locales exécutées par Codex pendant 7G.2**. Aucun accès au projet Supabase Cloud, déploiement, nouvelle migration, reset, commit ou push pendant cette clôture. La consultation des documentations publiques npm/Supabase et des sources CLI ne constitue pas un contrôle Cloud du projet.

## État initial Git et version

| Contrôle | État réellement constaté |
|---|---|
| Branche | `dev` |
| HEAD | `4f652930746ed3e0147f22ea349769ee542fbf2d` — `v0.7.21 audit phase 7` |
| Working tree | Volontairement non propre : `package.json` et `package-lock.json` modifiés, rien de staged |
| Version | `package.json`, racine du lock et `packages[""]` : **0.7.21** |
| Node.js / npm / Supabase CLI | **24.20.0 / 12.1.0 / 2.120.0**, vérifiés avant édition |
| Déclarations npm initiales | `engines.npm = ^11.19.0`, `packageManager = npm@11.19.0`, à aligner sur le choix explicite npm 12 du propriétaire |

Le propriétaire avait exécuté `npm install -D supabase@latest`, puis `npm audit fix`. Inspection des diffs avant toute modification : Supabase et ses huit packages binaires passent à 2.120.0 ; seuls `brace-expansion` et `source-map-js` changent parmi les autres dépendances. Ces mises à jour sont conservées.

Instructions `AGENTS.md`, package/lock, documentation active et rapports de clôture des Phases 5/6 examinés. Aucun fichier applicatif, composant, CSS, contrat métier, RPC, migration ou type généré n’est modifié.

## Périmètre livré Phase 7

| Périmètre | Bilan livré |
|---|---|
| 7A — Préférences et version/footer | Préférences globales Catalogue/Collection, derniers modes indépendants, format Classeur global et override viewer + collection. Héritage override → global → `3x3`, retour au défaut par suppression. Footer commun, version injectée depuis le package. |
| 7B — Liste, Cartes, Classeur | Contenu, ordre et possession autoritatifs communs ; recherche conservée entre vues. Reorder propriétaire Liste/Cartes ; Classeur continu consultatif, formats `2x2`, `3x3`, `4x3`, livre desktop et page mobile, occurrences/halo sans compactage, pochettes vides sans image. |
| 7C — Réglages Affichage | Trois sauvegardes indépendantes : défaut Catalogue, défaut Collection, format Classeur global. États chargement/erreur/retry, derniers modes et overrides préservés ; préférences propres au viewer, y compris en partage. |
| 7D — Catalogues | Pokémon, Extension et Carte authentifiés, RPC/services stricts et BIGINT texte, ordre canonique serveur, socle Liste/Cartes/Détail partagé. Création/ouverture automatique personnelle sur Pokémon/Extension, aucun CTA Collection sur Carte. Palette sémantique commune et partage indigo prioritaire. |
| 7E — Recherche et harmonisation | Recherche globale du header : seuil 3 caractères Unicode, debounce 300 ms, maximum 10, quotas et ordre backend, collections accessibles sous RLS, choix explicite sans navigation sur Entrée. Présentation enrichie, images/logos, identité Carte et métadonnées partagées, listes/progression/vocabulaire harmonisés. |
| 7F — Navigation | `← Retour` partagé via historique réel, conservé après refresh, fallback Dashboard. Liens Carte/Extension/Pokémon par IDs contractuels, contrôles indépendants du Détail et du reorder. |
| 7G — Validation et clôture | Audit technique 7G.1 acquis, checkpoint Cloud manuel confirmé, outillage npm/Supabase mis en cohérence et validé Local, documentation finale. |

Correction **0.7.20 conservée** : badges visibles Auto/Perso supprimés sans repère de remplacement ; `item.origin` et ses valeurs `automatic` / `manual` restent métier. Retrait manuel réservé aux éléments autorisés du propriétaire ; automatiques non supprimables manuellement, partage en lecture seule. Les exemplaires restent globaux au compte et sont conservés au retrait d’un item.

Décisions V1 maintenues : **Précédente/Suivante, swipe entre cartes, séquence de cartes et navigation rapide contextuelle abandonnés**. La pagination Classeur reste indépendante. Aucun développement Phase 8.

## Résultats acquis de l’audit 7G.1

Ces résultats viennent du rapport du **7 octobre** ; la clôture ne refait pas l’audit complet ni ses parcours navigateur, concurrence, reconstruction shadow ou intégrations Catalogue isolées.

| Validation antérieure | Résultat acquis |
|---|---|
| DB / pgTAP | **1 438 assertions / 22 fichiers — PASS** |
| Concurrence | **13 contrôles — PASS** |
| Parité canonique | **1 213 cibles, zéro divergence** |
| Catalogue | Snapshot exact validé ; intégration isolée **33 assertions**, métadonnées Pokémon et idempotence validées |
| Suite Vitest | **1 846 tests / 62 fichiers — PASS** |
| Typecheck, build, lint | PASS |
| Migrations | 29 fichiers reproductibles, reconstruction isolée et shadow ; **diff DB vide** |
| Types, contrats et sécurité | Génération sans diff ; BIGINT, décodage strict, droits, RLS, grants et MFA vérifiés |
| Navigateur / responsive | Parcours authentifiés et partage, desktop/mobile 1440/390/320 px, focus et contrôles vérifiés ; limites d’accessibilité consignées dans l’audit |

Les corrections minimales 7G.1 sont déjà dans HEAD : validation BIGINT de création automatique, fixture Catalogue compatible avec le trigger Auth, corrections documentaires. Elles ne sont pas réimplémentées pendant 7G.2.

## Checkpoint Supabase Cloud manuel

**Confirmations communiquées par le propriétaire, sans vérification distante ni push par Codex pendant 7G.2.**

| Étape | Résultat communiqué |
|---|---|
| Avant | **29 Local / 23 Remote** |
| Dry-run initial | Exactement les six migrations Phase 7 ci-dessous |
| Push Cloud manuel | Réussi selon le propriétaire |
| Contrôle final `migration list` | **29 Local / 29 Remote**, alignés jusqu’à `20261007085921` |
| Dry-run final | `Remote database is up to date.` |

Six migrations déployées, complétant les 23 migrations antérieures :

- [20261001132144_phase7a3_view_preferences.sql](../../supabase/migrations/20261001132144_phase7a3_view_preferences.sql) ;
- [20261004161759_phase7d1_catalog_foundation.sql](../../supabase/migrations/20261004161759_phase7d1_catalog_foundation.sql) ;
- [20261005181925_phase7d5_collection_identity.sql](../../supabase/migrations/20261005181925_phase7d5_collection_identity.sql) ;
- [20261006085902_phase7e1_global_search.sql](../../supabase/migrations/20261006085902_phase7e1_global_search.sql) ;
- [20261006120339_phase7e31_presentation_contracts.sql](../../supabase/migrations/20261006120339_phase7e31_presentation_contracts.sql) ;
- [20261007085921_phase7f1_navigation_contracts.sql](../../supabase/migrations/20261007085921_phase7f1_navigation_contracts.sql).

État courant documenté : **29 Local / 29 Cloud**. La commande `migration list --local` exécutée pendant cette clôture confirme seulement les fichiers et la **base locale** ; sa colonne `Remote` ne constitue pas une nouvelle preuve Supabase Cloud.

## Mise à jour de l’outillage et sécurité npm

| Outil / dépendance | Avant | État final |
|---|---|---|
| Node.js | Référence 24.20.0 | **24.20.0**, `engines.node = ^24.20.0` conservé |
| npm | Déclarations 11.19.0, runtime déjà 12.1.0 | **12.1.0**, `engines.npm = ^12.1.0`, `packageManager = npm@12.1.0` |
| `supabase` | 2.119.0 / plage `^2.119.0` | **2.120.0** installé et verrouillé, plage `^2.120.0` conservant la convention existante |
| Huit `@supabase/cli-*` optionnels | 2.119.0 | **2.120.0**, versions/résolutions/intégrités et références optionnelles cohérentes |
| `brace-expansion` | 5.0.9 | **5.0.12** |
| `source-map-js` | 1.2.1 | **1.2.2** |

Les huit binaires : darwin-arm64, darwin-x64, linux-arm64, linux-arm64-musl, linux-x64, linux-x64-musl, windows-arm64, windows-x64. Aucune autre dépendance ajoutée, supprimée ou mise à jour ; aucun override, `audit fix --force` ou nouvelle mise à jour globale.

Métadonnées racine synchronisées par **`npm install --package-lock-only --ignore-scripts --no-audit --no-fund --offline`**, avec npm 12. Comparaison JSON : nom, version, dépendances, devDependencies et engines concordent entre package et racine du lock. Seule la déclaration npm racine est ajoutée aux changements du propriétaire ; les entrées de dépendances déjà corrigées sont conservées.

**`npm ci` réussi**, 280 packages installés / 281 audités. Premier essai en échec avec `UNABLE_TO_VERIFY_LEAF_SIGNATURE` sur le registre npm ; relance réussie avec **`NODE_USE_SYSTEM_CA=1`**, utilisant les certificats système Windows sans désactiver TLS et sans modifier la configuration du dépôt. SHA-256 du package et du lock identiques avant/après `npm ci` : installation figée reproductible.

**`npm audit` exécuté après `npm ci` : `found 0 vulnerabilities`.** Les deux correctifs transitoires sont cohérents avec les contraintes de leurs parents ; arbre installé vérifié. Aucun correctif applicatif requis.

Documentation actuelle consultée via Context7 pour `npm ci`/lockfile et les validations Supabase Local. [Release CLI 2.120.0](https://github.com/supabase/cli/releases/tag/v2.120.0) et changelog public examinés. Comparaison des sources officielles 2.119.0/2.120.0 : `packages/config/src/auth/sessions.ts`, `packages/config/src/auth/email.ts`, `apps/cli-go/pkg/config/auth.go` **identiques**. Références courantes mises à jour, descriptions `timebox`/`inactivity_timeout`, absence de durée `aal1` et distinction `secure_password_change`/`current_password` conservées. Aucun nouveau test Auth réel revendiqué. Les changements de typegen annoncés par la release ne justifient pas de régénérer les types sans changement de schéma dans ce périmètre.

Chemin de retour arrière de l’outillage, non exécuté : rétablir ensemble les versions/déclarations package et lock d’une révision validée, puis `npm ci` ; aucun rollback DB ni restauration de données nécessaire. npm 12.1.0 reste le choix explicite du propriétaire pour cette livraison.

## Validations exécutées pendant 7G.2

Supabase Local était déjà démarré au début des contrôles. Volume de travail conservé ; aucun démarrage, arrêt, reset, migration ou modification de configuration nécessaire.

| Commande / contrôle local | Résultat de cette clôture |
|---|---|
| `node --version` | **v24.20.0** |
| `npm --version` | **12.1.0** |
| `npx supabase --version` | **2.120.0**, CLI du projet (`--no-install`) |
| Cohérence package/lock et arbre installé | PASS, application **0.7.21**, seules versions prévues modifiées |
| `npm ci` | PASS après utilisation des certificats système ; package/lock inchangés |
| `npm audit` | **0 vulnérabilité** |
| `npm test` | **PASS — 1 846 tests / 62 fichiers** |
| `npm run build` | **PASS**, `typecheck` inclus ; principal **752,59 kB**, gzip **213,09 kB** |
| `npm run lint` | **PASS**, zéro warning ESLint autorisé |
| `npm run db:test` | **PASS — 1 438 assertions / 22 fichiers** ; parité **1 213 cibles / 0 divergence**, incluse dans la suite |
| `npm run db:lint` | **PASS — aucun problème de schéma**, `public,private`, niveau warning avec échec sur warning |
| `npx supabase migration list --local` | **29 fichiers / 29 entrées de la base locale**, concordants jusqu’à `20261007085921` |
| Liens Markdown locaux et ancres | **PASS — 384 destinations locales / 64 ancres / 15 fichiers**, documents actifs et ce rapport, aucune erreur |
| Mentions obsolètes actives | Aucune Phase 7 en cours ni état courant Cloud 23 restant ; références historiques identifiées conservées |
| `git diff --check` | PASS ; espaces de fin de ligne du rapport non suivi contrôlés séparément |

Sous PowerShell, les commandes npm/npx utilisent `npm.cmd`/`npx.cmd`. Les commandes de validation ont toutes terminé avec code zéro. Les suites de concurrence, intégrations Catalogue, smoke navigateur, `db:types` et shadow diff de 7G.1 ne sont pas relancés : leurs preuves acquises restent distinctes.

## Points connus non bloquants

- **Warning Vite du bundle >500 kB**, déjà consigné en 7G.1. Le principal reste **752,59 kB / gzip 213,09 kB**, identique à l’audit ; optimisation reportée à la finalisation V1, aucun découpage ajouté ici.
- JSDOM émet trois diagnostics de navigation de document non implémentée ; assertions réussies. Recommandation Vitest sur le coût de création JSDOM, sans modification de configuration.
- Chaîne de certificats npm résolue par utilisation des certificats système ; aucun contournement TLS.
- Conteneur auxiliaire Local `supabase_vector_my-local` observé en redémarrage dès l’inspection avant `npm ci`. DB et services essentiels actifs, suites DB/lint réussies ; aucune intervention sur les conteneurs, aucune régression attribuée à l’installation npm démontrée.
- Limites d’accessibilité, contraste axe incomplet et diagnostics navigateur historiques restent ceux de 7G.1 ; cette clôture n’est pas une nouvelle certification d’accessibilité.

Aucun blocage de mise à jour de l’outillage ou de clôture identifié.

## Documents actualisés

- [README](../../README.md) : clôture, version conservée, checkpoint 29/29, outillage courant, audit acquis et prochaine phase.
- [Fonctionnalités](../01-FEATURES.md) : Phase 7 terminée, correction d’origine métier conservée.
- [UX/UI](../04-UX-UI.md) : statut livré et checkpoint 29/29, décisions V1 conservées.
- [Architecture](../05-ARCHITECTURE.md) : CLI 2.120.0, sources Auth vérifiées, compatibilité des décodeurs et environnement 29/29.
- [Database](../06-DATABASE.md) : six migrations Phase 7 Local/Cloud, attribution du checkpoint et contrats de déploiement/retour arrière.
- [Pipeline](../07-CATALOG-SYNC.md) : état déployé 29/29, périmètre local/protégé inchangé.
- [Roadmap](../08-ROADMAP.md) : Phases 0 à 7 terminées, Phase 7 retirée d’EN COURS, Phase 8 prochaine et non commencée.
- [Contrats Catalogue](../09-CATALOG-CONTRACTS.md) : état final des migrations et application Cloud confirmée.

[Modèle de données](../03-DATA-MODEL.md) inspecté et conservé : aucun changement conceptuel requis. Rapports historiques intacts ; anciens chiffres et versions restent exacts dans leur contexte daté.

## État Git final

Branche **dev**, HEAD **`4f652930746ed3e0147f22ea349769ee542fbf2d` inchangé**, aucun fichier staged. **10 fichiers suivis modifiés et 1 rapport nouveau non suivi** : huit documents actifs, package/lock et ce rapport. Aucun commit ni push.

```text
 M README.md
 M docs/01-FEATURES.md
 M docs/04-UX-UI.md
 M docs/05-ARCHITECTURE.md
 M docs/06-DATABASE.md
 M docs/07-CATALOG-SYNC.md
 M docs/08-ROADMAP.md
 M docs/09-CATALOG-CONTRACTS.md
 M package-lock.json
 M package.json
?? docs/reports/2026-10-08-PHASE7-CLOSURE.md
```

Les modifications npm initiales du propriétaire sont conservées et complétées uniquement par les déclarations npm 12.1.0. Application **0.7.21**, fichiers `src/`, scripts, configuration, migrations et types générés inchangés. Les fixtures transactionnelles des suites DB sont annulées ; les inclusions temporaires du lanceur sont supprimées.

## Conclusion et prochaine phase

**PHASE 7 CLÔTURÉE — PRÊTE POUR PR `dev` → `main`**

Audit 7G.1 acquis, checkpoint Cloud manuel 29/29 confirmé par le propriétaire, installation npm 12 reproductible, zéro vulnérabilité, validations Local réussies et documentation cohérente. La PR n’est ni créée ni fusionnée pendant cette tâche.

**Phase 8 — Mise à jour des collections automatiques** reste la prochaine phase, planifiée et non commencée. Aucun nouveau choix d’algorithme ou de comportement produit n’est fixé pendant cette clôture.
