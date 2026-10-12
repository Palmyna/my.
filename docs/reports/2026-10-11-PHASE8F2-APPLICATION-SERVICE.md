# Phase 8F.2 — Service et orchestration d'application

11 octobre 2026 — version **0.8.12**. Intégration applicative livrée et validée par tests ciblés. **Arrêt strict à 8F.2 ; 8F reste en cours, UI et validation globale réservées à 8F.3.**

## État Git et périmètre

- Branche `dev`, HEAD initial/final `fa832c496900ff97661646161c56cc0e31e8bc1c`.
- Worktree initial propre ; final : **17 fichiers ajoutés/modifiés, rien staged**. Aucun commit ni push.
- `AGENTS.md`, rapports [8E](2026-10-11-PHASE8E-CLOSURE.md), [8F.1](2026-10-11-PHASE8F1-APPLY-WRITER.md), contrats [8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), migration et couches applicatives relus avant modification. Documentation Supabase/TanStack Query consultée via Context7 ; changelog Supabase consulté.
- Aucune migration, modification SQL/moteur/schéma, génération de types, connexion à la DB, conversion legacy, intervention sur les deux collections personnelles, reset, Cloud ou Vercel.

## Contrat et reprise

[Types](../../src/types/collection-update.ts) : `CollectionUpdateApplyRequest` conserve UUID, token et variantes ajoutées d'origine ; `CollectionUpdateApplyResult` porte les cinq champs du résultat `applied`.

[Service](../../src/services/collection-update.ts) : `applyCollectionUpdate` utilise la signature Supabase générée existante et encode exactement les six clés SQL `snake_case`. Versions/révisions/variantes restent des chaînes BIGINT exactes. Décodeur strict : clés exactes, UUID canoniques, bornes PostgreSQL, identités uniques ; validation contre UUID original, révision du token +1, version cible et ensemble exact des nouvelles variantes. Aucun usage du résultat à quatre clés des gestes ordinaires. La [consultation générale des reçus](../../src/services/collection-items.ts) reconnaît cette union sans affaiblir les anciens décodeurs ni accepter un reçu `apply` pour un geste ordinaire.

Refus définitifs distincts : `preview_stale`, absence de delta, collision d'UUID, inéligibilité/legacy, droits, incohérence, conflit structurel et erreurs SQL internes assainies. Aucun retry automatique. Transport interrompu, réponse absente ou succès JSON invalide → consultation de `get_collection_operation_result`. Reçu valide → résultat historique, sans second writer ; NULL/indisponible/invalide → incertitude conservée. `getCollectionUpdateOperationResult` valide toujours contre la requête d'origine, indépendamment des items/révisions actuels.

## Hook commun et caches

[`useCollectionUpdateMutation`](../../src/features/collections/useCollectionUpdateMutation.ts) délègue à [`useCollectionStructureMutation`](../../src/features/collections/useCollectionStructureMutation.ts), étendu par l'action `apply`. Même clé de mutation, slot de requête et exclusion viewer/collection pour `move/add/remove/hide/apply`, consultation/relecture comprise. Avant une nouvelle application : Auth autorisée, propriétaire automatique contrat 2, contenu frais et aperçu réussi explicitement présenté, associé au viewer/parent et à sa consultation.

Requête complète conservée dans le `sessionStorage` existant **avant l'envoi** : viewer/parent, UUID, token exact, variantes ajoutées et contexte de présentation. Aucun email, mot de passe, JWT ou secret Auth. Stockage bloqué/corrompu → aucun writer de remplacement. Confirmation technique également persistée après résultat valide : une relecture échouée puis un reload ne répètent pas l'écriture. Demandes incertaines bloquent réciproquement gestes ordinaires et applications ; navigation/logout/changement de compte/cache clear conservent leur scope. Une identité ou route changée pendant la recherche d'un reçu interdit l'envoi ultérieur. Persistance limitée au même onglet, sans nouveau mécanisme inter-onglets.

`refresh` consulte le reçu et relit ; `retry` reprend explicitement l'original, exploite d'abord son reçu valide, sinon renvoie uniquement le même UUID/token. NULL ne libère jamais la demande. Succès seulement après contenu v2 et lectures actives nécessaires ordre/overview/Dashboard réussies. Caches inactifs restent invalidés. [Statut/aperçu](../../src/features/collections/collection-update-query.ts) annulés et invalidés avec `refetchType:'none'`, sans consultation automatique. `previewStale` expose le refus obsolète ; nouvel aperçu explicitement demandé et présenté, jamais recalculé/appliqué automatiquement.

## Preuves exécutées

| Validation ciblée | Résultat |
|---|---|
| Vitest, huit fichiers, `--maxWorkers=2` | **303 tests PASS** |
| `npm.cmd run build`, incluant `tsc -b` | PASS ; avertissement existant bundle >500 kB |
| ESLint, huit fichiers TypeScript concernés, zéro avertissement | PASS |
| `git diff --check` | PASS |
| Package/lock comparés à HEAD | Seuls trois champs de version changés ; dépendances/configuration identiques |
| Types générés et migration 8F.1 comparés à HEAD | Identiques byte à byte ; régénération non nécessaire |

Suites exécutées : `collection-update.test.ts`, `collection-update-apply.test.ts`, `collection-items-v2.test.ts`, `collection-items.test.ts`, `manual-collection-items.test.ts`, `useCollectionStructureMutation.test.tsx`, `useCollectionUpdateMutation.test.tsx`, `collection-update-query.test.tsx`.

Preuves frontend avec QueryClient/React réels et services/Auth simulés. Un test utilise le SDK Supabase réel avec `fetch` intercepté pour prouver POST/JSON exact et absence de répétition automatique du writer. Perte de réponse/reçu historique simulés : **aucun commit SQL réel ni coupure réseau réelle attribué à 8F.2**. Pas d'intégration PostgREST Local supplémentaire, suite DB/frontend complète, concurrence SQL, campagne navigateur ou nouvel audit de conservation ; preuves SQL 8F.1 non rejouées.

## Fichiers et suite 8F.3

Réalisation : deux services, types d'actualisation, hook commun, nouveau hook d'application, commentaire d'invalidation ; deux nouveaux fichiers de tests. Version : package/lock synchronisés. Documentation : ce rapport, README, Fonctionnalités, Modèle, Architecture, Database et Roadmap, uniquement références courantes concernées. Types générés et RPC inchangés.

8F.3 doit brancher la consultation et présentation réelle de l'aperçu (`presentPreview`), confirmation explicite (`apply`), récupération/retry de l'original (`refresh`/`retry`), états d'incertitude/relecture/péremption et retour de focus. Bouton, modale, entrée Dashboard, notifications et application automatique absents de 8F.2. Validation globale et clôture restent 8F.3.
