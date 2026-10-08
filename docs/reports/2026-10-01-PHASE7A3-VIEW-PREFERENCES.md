# Phase 7A.3 — socle des préférences de vues et du format Classeur

Livraison locale du 1er octobre 2026. Persistance, types, services et helpers uniquement. Aucun composant, hook React Query final, sélecteur de vue, vue Cartes/Classeur ou Paramètres fonctionnel ajouté. Version applicative conservée à `0.7.0`.

## État Git et inspection initiale

- Branche `dev`, suivie par `origin/dev` ; `git status --short --branch` : `## dev...origin/dev`, aucun changement.
- HEAD `644e48896839f11cf65bec1b9a43a465322200b8` — `Phase 7A.1`, identique au repère distant fourni, sans fetch.
- Six commits récents inspectés : `644e488`, `26f161c`, `e136d5f`, `653603a`, `2d1b17b`, `723d077`.
- `AGENTS.md`, `package.json`, configuration Vitest, migrations locales et tests DB existants inspectés. Historique local initial : 23/23 migrations appliquées jusqu'à `20260928083830`.
- Lectures ciblées : migrations schema/security, préférences, Auth/MFA, suppression/profil ; tests `001`, `006`, `007`, `009`, `013`, `018` et fixtures Collection ; services Supabase commun, Collections, exemplaires et leurs tests ; types générés ; `CollectionPage`, `SettingsPage` ; scripts de tests, génération des types et preuve API Collection.
- Documentation examinée : README et `01-FEATURES`, `03-DATA-MODEL`, `04-UX-UI`, `05-ARCHITECTURE`, `06-DATABASE`, `08-ROADMAP`.
- Documentation publique Supabase et Zod consultée via Context7 ; changelog Supabase lu. Aucun accès au projet Supabase Cloud.

## Migration et persistance

Migration additive : [`20261001132144_phase7a3_view_preferences.sql`](../../supabase/migrations/20261001132144_phase7a3_view_preferences.sql), créée via la CLI locale, puis appliquée avec `migration up --local`.

`user_preferences.binder_default_format` : `TEXT NOT NULL DEFAULT '3x3'`, CHECK limité à `2x2`, `3x3`, `4x3`. Grant INSERT/UPDATE de cette colonne pour `authenticated`, sans modifier les droits des anciennes colonnes ou les policies existantes. Une ligne absente retourne `catalogDefaultView = last_used`, `collectionDefaultView = last_used`, `lastCatalogView = list`, `lastCollectionView = list`, `binderDefaultFormat = 3x3`. Aucune création au signup.

`collection_view_preferences` : `user_id`, `collection_id`, `binder_format`, `created_at`, `updated_at`. PK `(user_id, collection_id)` ; FK vers `profiles.id` et `collections.id`, toutes deux `ON DELETE CASCADE`. Index `collection_id` pour la cascade et trigger `private.set_updated_at()` existant. Format obligatoire sans défaut implicite, CHECK identique aux trois formats V1. Seuls les overrides explicitement enregistrés sont stockés.

Résolution exacte : **override du viewer + collection → défaut global du compte → `3x3`**. Absence = héritage dynamique, jamais copie du défaut global. Retour au défaut = suppression de l'override. Nombre d'emplacements dérivé du format : 4, 9, 12, sans colonne dédiée. Aucun choix de mode de vue par collection.

## RLS et grants

RLS explicitement activée. Policy propre au viewer : `user_id = auth.uid()`. Restrictions pour toutes les opérations, avec `USING` et `WITH CHECK` :

- collection actuellement lisible, via `EXISTS` sur `collections` sous ses policies owner/destinataire existantes ;
- `aal2`, selon le pattern `require_mfa` ;
- profil présent, via le helper existant `private.has_my_profile()`.

Aucune nouvelle RPC, fonction `SECURITY DEFINER` ou modification des policies Collection. Le lecteur métier en lecture seule gère seulement sa propre préférence. Révocation du partage : override stocké invisible, non modifiable et incapable de donner accès à la collection. Aucun accès inter-utilisateur.

Grants `authenticated` : SELECT/DELETE, INSERT des identités et du format, UPDATE du seul format. Identités et timestamps immuables. Aucun grant table/colonne à `anon` ou `PUBLIC`. `service_role` conserve le pattern CRUD privilégié existant.

## Types, helpers et services

- [`src/types/view-preferences.ts`](../../src/types/view-preferences.ts) : `CatalogView`, `CollectionView`, `BinderFormat`, `UserPreferences`, patch ciblé et ensembles V1 uniques.
- [`src/lib/view-preferences.ts`](../../src/lib/view-preferences.ts) : validation stricte, valeurs initiales, résolution des vues fixes/`last_used`, résolution du format et calcul des emplacements.
- [`src/services/view-preferences.ts`](../../src/services/view-preferences.ts) : lecture/sauvegarde globale, lecture/sauvegarde/suppression de l'override, client Supabase commun et factory injectée pour les tests. UUID/payloads/identités retournées validés ; seuls des codes applicatifs sont exposés.

Sauvegarde ciblée : UPDATE puis INSERT si absent, avec une reprise unique de l'UPDATE sur conflit de création concurrente. Le merge-upsert PostgREST réécrirait aussi les clés, interdites par les grants ; cette stratégie préserve les colonnes omises et les changements concurrents indépendants. Le DELETE d'un override absent est idempotent si la collection demeure accessible.

Migration déployée avant tout futur consommateur UI. Anciens lecteurs et écrivains restent compatibles : colonnes existantes, defaults et grants conservés. Retour arrière applicatif possible en laissant ce schéma additif inutilisé ; une contraction SQL demanderait une nouvelle migration après retrait des consommateurs et sauvegarde des nouvelles préférences. Aucune contraction ou suppression de données exécutée pour la livraison finale.

## Documentation

README et les six documents examinés sont alignés : formats exacts, défaut `3x3`, Classeur **continu uniquement**, compte + override viewer/collection, héritage dynamique, suppression au retour au défaut, indépendance propriétaire/lecteur et pagination calculée frontend sans table `binder_pages`.

Les modes par série/bloc/ère et les décisions de persistance présentées comme ouvertes sont retirés de la V1/Phase 7. Aucun regroupement Extension/Pokémon/catégorie.

Contrat de recherche futur uniquement documenté : emplacements conservés, résultats visibles et non-correspondances atténuées ; nouvelle recherche avec résultat → un seul saut à la première occurrence ; navigation ensuite libre sans recentrage permanent ; aucun résultat ou effacement → page courante conservée.

## Validation exécutée

| Contrôle | Résultat final |
|---|---|
| `npx supabase migration list --local` après application | PASS, 24/24 concordantes jusqu'à `20261001132144` ; colonne `Remote` = base locale |
| `npm run db:test` | PASS, 19 fichiers / 1 070 assertions |
| Suite pgTAP 7A.3 seule | PASS, 93 assertions |
| `npm run db:lint` | PASS, aucune erreur ni avertissement SQL |
| `npm run db:types` | PASS, génération officielle depuis `127.0.0.1:55322` |
| Diff des types | Seulement table d'override/relations et colonne globale dans Row/Insert/Update ; contrôle AST contre HEAD réussi |
| Reproductibilité des types | Nouvelle génération : SHA256 inchangé |
| `supabase db diff --local --schema public,private` | PASS, reconstruction shadow des 24 migrations, aucun diff |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, zéro avertissement |
| Tests TypeScript 7A.3 ciblés | PASS, 2 fichiers / 87 tests |
| `npm test` | PASS, 43 fichiers / 1 291 tests |
| `npm run build` | PASS ; bundle principal 680,13 kB, gzip 194,92 kB |
| Services sur API locale réelle | PASS, scénario temporaire utilisant la factory réelle et PostgREST local ; fixtures et fichier temporaire supprimés |
| `git diff --check` | PASS |

Les tests couvrent valeurs/defaults, payloads invalides, `last_used`, priorité du format, créations et modifications ciblées, suppression, refus/erreurs assainis. pgTAP couvre owner/lecteur, inter-utilisateur, partage révoqué, MFA/profil, unicité, FK/cascades et absence de mutation des collections/items. La preuve API confirme aussi les defaults SQL, la conservation des champs omis, la création globale concurrente, le CRUD du lecteur et les refus après révocation.

## Échecs rencontrés et corrigés

- CLI initialement bloquée par l'écriture de sa télémétrie hors dépôt ; commandes locales exécutées ensuite avec autorisation d'escalade. Lecture réseau du changelog également reprise après refus du sandbox.
- Premier fichier SQL accidentellement dupliqué : premier bloc exécuté, seconde occurrence refusée, sans inscription de migration. Récupération contrôlée après preuve de zéro override et zéro défaut modifié : retrait des seuls objets 7A.3 vides/non utilisés, conservation des préférences existantes, correction du fichier avant application enregistrée. Historique et reconstruction shadow finaux concordants ; aucune migration historique modifiée.
- Lint TypeScript : trois throws d'erreurs `unknown`, corrigés par conversion centralisée en `PreferencesError`.
- Première passe DB globale : trois assertions historiques attendaient 13 policies, contre 14 avec la nouvelle table. Attentes `007_auth_identity` et `009_account_deletion` actualisées ; seconde passe globale réussie.

## Limites et état final

Aucun accès Supabase Cloud, `--linked`, `db push`, reset applicatif, Realtime, localStorage de préférence compte, commit, push ou PR. État Cloud non revérifié : dernier checkpoint historique fourni par le propriétaire, distinct de cette livraison locale.

Hors périmètre conservé : sélecteur Liste/Cartes/Classeur, vues Cartes/Classeur, pagination graphique, contrôle des formats, pochettes, recherche visuelle Classeur, Paramètres fonctionnel, catalogue/recherche globale/navigation précédente-suivante, Phases 8 et 9. Ordre des collections/items inchangé. Optimisation du bundle existant non traitée.

Fichiers modifiés : README ; `docs/01-FEATURES.md`, `03-DATA-MODEL.md`, `04-UX-UI.md`, `05-ARCHITECTURE.md`, `06-DATABASE.md`, `08-ROADMAP.md` ; types générés ; tests DB `007` et `009`.

Fichiers ajoutés : types/primitives/services `view-preferences` et leurs deux suites TypeScript ; migration 7A.3 ; test DB `019` ; présent rapport. Aucun composant ou configuration applicative modifié.

Branche et HEAD inchangés. Worktree final : **10 fichiers suivis modifiés, 8 fichiers nouveaux non suivis**, sans staging. Les fichiers de preuve temporaires sont supprimés.
