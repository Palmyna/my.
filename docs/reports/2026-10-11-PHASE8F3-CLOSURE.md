# Phase 8F.3 — Parcours d’actualisation et clôture 8F

11 octobre 2026 — version **0.8.13**. **8F terminée et validée exclusivement Local.** Parcours livré : **Vérifier les mises à jour → aperçu → confirmation unique → application transactionnelle → relectures autoritatives**. Actualisation toujours explicitement confirmée. Arrêt à 8F.3 ; notifications 8G/8H futures, aucun commit ni push.

## État initial et périmètre

| Contrôle | Résultat |
|---|---|
| Branche / HEAD initial et final | `dev` / `f6a3fdb3d01d8f8694234d4980de7e0a32798ba1`, inchangés |
| Worktree initial | Propre, aucun changement préexistant |
| Worktree final | 20 fichiers ajoutés/modifiés, aucun staged |
| Version package / lock | `0.8.12` → **`0.8.13`**, trois champs synchronisés |
| Dépendances et outillage | Identiques à HEAD ; Node 24.20.0, npm 12.1.0, CLI 2.120.0 |
| Supabase | Local conservé : API `127.0.0.1:55321`, PostgreSQL `127.0.0.1:55322` |
| Migrations | **43 / 43 appliquées Local**, aucune migration ajoutée ou appliquée ici |
| Collections / éléments / exemplaires personnels | **2 / 257 / 3**, identiques avant/après |
| Intentions / reçus préexistants | **7 / 14**, identiques avant/après |

Lecture préalable : `AGENTS.md`, [8E](2026-10-11-PHASE8E-CLOSURE.md), [8F.1](2026-10-11-PHASE8F1-APPLY-WRITER.md), [8F.2](2026-10-11-PHASE8F2-APPLICATION-SERVICE.md), [contrats 8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md#6-détection-aperçu-et-application), décisions UX, composants Collection/actions/aperçu/dialogues, hooks, caches et tests. Skills lean-build, Supabase, agent-browser et revue React utilisés ; documentation TanStack Query/CLI consultée via Context7, changelog Supabase consulté. Aucune dépendance ajoutée.

## Parcours livré

[`CollectionActions`](../../src/features/collections/CollectionActions.tsx) ajoute **Vérifier les mises à jour** uniquement au propriétaire d’une collection automatique. Collections libres et destinataires partagés sans entrée. Menu compact existant conservé : fermeture, focus initial, Escape, extérieur, clavier et responsive. Point d’accès discret, sans Dashboard, badge, cloche, nouvelle route ou notification.

[`CollectionUpdateDialog`](../../src/features/collections/CollectionUpdateDialog.tsx) réutilise le dialogue natif [`CollectionItemDialog`](../../src/features/collections/CollectionItemDialog.tsx). Au clic explicite : statut, état « à jour » si aucun delta utile, état legacy sans proposition v2, puis contenu complet frais et aperçu compatible. Aucun polling, préchargement ou statut/aperçu déclenché par la consultation ordinaire de la page.

[`CollectionUpdatePreview`](../../src/features/collections/CollectionUpdatePreview.tsx) reste une présentation du plan backend complet. Ajouts, retraits, conversions, rangs, positions, préservation des exemplaires/notes/personnalisations/masquages et cible vide explicités. Filtre `Non masquées` / `Toutes` indépendant : masqués et manuels restent dans le plan, les comparaisons de position utilisent le contenu complet.

Listes d’aperçu par pages de **20**, sans troncature du plan ou du token. Métadonnées du contenu complet réutilisées. Seuls les détails manquants des premières pages (ajouts et ordre complet) puis des pages demandées passent par `getVariantDetail` et son cache existants ; **quatre lectures simultanées maximum**, pagination sérialisée. Aucun chargement de milliers de fiches ou N+1 illimité. Une page en erreur conserve le plan présenté et propose une nouvelle consultation explicite.

Un seul bouton principal **Mettre à jour la collection**, sans seconde modal. `presentPreview` appelé après rendu réussi du plan et de ses métadonnées. Consentement lié à l’objet/cache/version de consultation exacts ; token exact capturé puis revalidé par le hook commun à l’envoi. L’invalidation du cache est observée directement : un observer désactivé peut conserver le même résultat public et ne suffit pas à signaler la perte de validité. Un aperçu invalidé encore affiché ne permet donc plus d’appliquer.

Double soumission et gestes v2 concurrents bloqués ; aucun writer automatique. Focus initial au titre, Tab/Shift+Tab incluant les disclosures, Escape/Annuler hors mutation, fermeture bloquée pendant application/reprise, focus sur la confirmation durable puis retour au déclencheur connecté avec `preventScroll`. Scroll Collection conservé. Chargements, erreurs et succès annoncés par statuts/alertes accessibles.

## Péremption, incertitude et relecture

`preview_stale` : message sûr, aucun nouveau plan appliqué automatiquement. Ancien aperçu conservé pendant une nouvelle consultation, remplacé uniquement après ses lectures réussies ; nouveau clic requis. Aucun UUID de remplacement pour une opération incertaine.

[`useCollectionUpdateMutation`](../../src/features/collections/useCollectionUpdateMutation.ts) reste délégué au [`hook structurel commun`](../../src/features/collections/useCollectionStructureMutation.ts). La reprise expose seulement le type et la confirmation de la demande conservée. Recherche de reçu/relecture incluse dans la même clé de mutation et exclusion que move/add/remove/hide/apply. `refresh` retourne vrai seulement après confirmation et relectures réussies.

À la réouverture après navigation ou reload du **même onglet**, une requête retenue prime sur toute demande de nouveau statut/token : **Vérifier le résultat** consulte le reçu historique ; **Reprendre l’opération enregistrée** réutilise UUID/token/requête identiques, avec reçu recherché en premier. NULL ne libère jamais la demande. Écriture déjà confirmée mais relecture échouée : confirmation persistée, reprise par lecture seule, aucun second writer. Stockage corrompu ou indisponible n’autorise aucun remplacement. Portée viewer/parent et limites sessionStorage 8F.2 conservées ; aucun mécanisme inter-onglets.

Succès discret seulement après confirmation technique et relectures contenu v2, ordre et résumés actifs overview/Dashboard ; caches inactifs invalidés. Statut/aperçu annulés et invalidés avec `refetchType:'none'`, sans refetch automatique. Perte d’accès : dialogue/contenu privés retirés, caches consultatifs également purgés. Liste, Cartes et Classeur gardent leurs moteurs et pagination existants.

## Preuves exécutées

| Validation | Résultat final |
|---|---|
| PostgreSQL complet | **33 fichiers / 3 350 assertions PASS** |
| Frontend/services/outils complet, `--maxWorkers=2` | **71 fichiers / 2 195 tests PASS** ; 3 fichiers / 5 tests Local opt-in exclus par défaut |
| Nouveaux tests React du parcours | **19 tests PASS**, inclus dans la suite complète |
| [Intégration réelle React/SDK/PostgREST](../../src/services/collection-update-apply.local.test.tsx) | **3 tests PASS** : normal, réponse perdue/reload, relecture échouée/reload |
| [API PostgREST réelle 8F.1](../../scripts/test-collection-update-apply-api.ts) | PASS : HTTP 409/40001, droits, legacy, token/BIGINT, reprise/collision/reçu historique |
| Concurrence pertinente | **7 campagnes PASS**, quatre connexions PostgreSQL réelles par campagne, attentes observées |
| SQL lint public/private | PASS, aucune erreur ou warning |
| Advisors sécurité Local | **0 WARN/ERROR** ; quatre INFO attendues RLS sans policy sur tables privées fermées |
| Typecheck/build | PASS ; avertissement existant bundle >500 kB conservé |
| ESLint | Complet PASS, puis contrôle final des fichiers de pagination modifiés PASS |
| Schéma / ACL / RLS / fonctions | **20 relations avec colonnes/droits et 45 fonctions avec définitions/ACL identiques** ; tests SQL signature/droits/invariants PASS |
| Données | **23 tables comparées**, compte/empreinte de chaque ligne ordonnée identiques ; lignes personnelles complètes également égales |
| Package/lock | Seuls trois champs de version changés, comparaison JSON exacte hors version |
| `git diff --check` / liens documentaires locaux | PASS |

Campagnes rejouées : [apply](../../scripts/test-collection-update-apply-concurrency.ts), [aperçu/catalogue](../../scripts/test-collection-update-concurrency.ts), [reorder v2](../../scripts/test-relative-order-writer-concurrency.ts), [ajout v2](../../scripts/test-manual-collection-items-v2-concurrency.ts), [retrait v2](../../scripts/test-manual-collection-removal-v2-concurrency.ts), [masquage](../../scripts/test-collection-item-hidden-concurrency.ts), [reçu](../../scripts/test-collection-operation-result-concurrency.ts). Catalogue avant parent, trois transactions superposées, même UUID concurrent, révision après attente, rollback/COMMIT réels, historiques et droits actuels exercés. Anciennes campagnes indépendantes Auth, writers legacy, bootstrap/catalogue complet non relancées par principe. Aucun changement SQL ou moteur motivant leur extension ; garanties SQL détaillées 8F.1 réutilisées et incluses dans la suite DB complète.

Tests React : conditions d’accès, libre/automatique/legacy/partagée, absence de préchargement, statut sans changement, chargement/erreur/réessai, métadonnées exactes et pagination bornée, confirmation unique, verrou/double clic, aperçu invalidé et refus serveur stale, remplacement après lecture réussie/consentement neuf, issue incertaine/reçu/reprise après remontage et QueryClient neuf, commit confirmé avec relecture échouée, focus/Tab/Escape/retour/scroll lock, invalidations exactes et trois vues. QueryClient et composants réels, services/Auth simulés pour ces tests unitaires.

## Navigateur sur Supabase Local

Navigateur Chromium isolé, application réelle Vite, SDK/PostgREST/DB Local réels. Sessions/comptes/catalogue/collections réservés **synthétiques** ; utilisateur propriétaire puis destinataire dans le navigateur de test. JWT AAL2 signés Local et facteurs/sessions fixtures, résolution Auth réelle ; aucun parcours d’enrôlement/challenge MFA revendiqué.

Desktop **1280 × 900**, mobile émulé **390 × 844** : métadonnées lisibles, aucun overflow horizontal, focus initial, clavier/disclosure/Tab/Shift+Tab, Escape, retour du focus et scroll conservés. Parent verrouillé par une vraie transaction pendant le clic d’application : bouton/fermeture bloqués, puis commit et relecture. **Axe : zéro violation** sur aperçu mobile et état final mobile. Aperçu : zéro contrôle incomplet ; état final : un contrôle de contraste incomplet sur huit nœuds, Axe ne déterminant pas le fond dégradé. Aucun test sur matériel tactile physique.

Le catalogue synthétique évolue réellement : activation/retrait/réordonnancement des variantes et recalcul hash/version avec le véritable canonique, sous verrou catalogue exclusif de la sync. Le pipeline d’import catalogue complet n’est pas relancé.

1. Gestes clavier v2 en vue Non masquées : contexte historique incluant les masqués, deux intentions chronologiques ajoutées. Journal conservé après application et retry historique ; aucune intention de remplacement.
2. Premier plan : **1 nouvel automatique, 1 retrait, 1 conversion**, rangs modifiés. Conversion sur le même UUID, masque de l’automatique conservé intact, supprimé absent, nouvel UUID stable et permutation identique au plan. Exemplaires/notes et intentions survivantes inchangés.
3. Liste/Cartes/Classeur : séquences DOM comparées aux UUID SQL autoritatifs, sous les deux filtres ; progression **2 / 4**, statut explicite sans changement utile.
4. Mobile : hide v2 réel après aperçu → **HTTP 409 `preview_stale`**, aucune écriture apply ; nouvelle consultation explicite et nouveau clic, résultat comparé au nouveau plan.
5. Perte de réponse simulée **après commit réel**, reçu temporairement rendu indisponible par interception. Aucun succès annoncé. Navigation Dashboard, retour, reload du même onglet, puis récupération du **même reçu historique**, même UUID/token/requête, malgré une révision plus récente ; aucun second writer ni nouveau token.
6. Cible devenue vide : tous les retraits explicités, parent et manuel conservés, copies/notes intactes, progression **1 / 1**, puis statut à jour.
7. Nouvelle application réelle avec relecture contenu rendue indisponible : écriture confirmée persistée ; reload puis relecture seule, sans lookup de reçu, preview ou writer supplémentaires.
8. Libre sans entrée ; legacy avec statut seul ; destinataire partagé sans action/consultation d’actualisation dans les trois vues, progression propriétaire **2 / 3**. Révocation du partage synthétique puis reload : contenu privé retiré.

Comparaisons aperçu/application : tableau intégral des variantes, identités conservées/converties, origines, rangs et masquages égaux ; les ajouts NULL du plan sont remplacés seulement par les UUID du résultat engagé. Positions `1…N` contrôlées après application. Les modifications postérieures utilisées pour éprouver un reçu historique sont distinguées de l’état au commit initial.

Preuves et captures locales dans `.cache/phase8f3/` : logs DB/frontend/API/concurrence, résultats navigateur desktop/mobile/extra/shared, plans/résultats/traces RPC, captures et Axe, snapshots initiaux/finals. Erreurs intermédiaires du harness (attente CLI, lancement d’un second contexte, assertion avant fin de mutation) corrigées ; seules campagnes finales PASS font preuve. Aucune vraie coupure réseau revendiquée : interruptions/réponses perdues/relectures indisponibles simulées côté transport, commits et récupération Local réels.

## Conservation et fichiers

Snapshots avant toute fixture puis après tous les nettoyages : deux collections personnelles, leurs **257 items, 3 exemplaires et notes, masquages, ordre, versions, 7 intentions, 14 reçus et préférences** exactement conservés. Comparaison des lignes personnelles complètes et des empreintes ordonnées de 23 tables ; catalogue **31 904 variantes** inchangé. Zéro résidu synthétique ; fichiers d’état Auth de fixtures supprimés. Types générés, migrations, RPC et moteur inchangés. Aucun reset, conversion legacy, migration Cloud, déploiement Vercel, commit ou push.

| Fichiers | Changement |
|---|---|
| `src/features/collections/CollectionActions.tsx`, `CollectionPage.tsx` | Accès propriétaire automatique et purge des caches consultatifs sur perte d’accès |
| `src/features/collections/CollectionUpdateDialog.tsx` | Nouveau raccordement statut/aperçu/confirmation/reprise/relectures |
| `src/features/collections/CollectionItemDialog.tsx`, `CollectionUpdatePreview.tsx` | Dialogue partagé accessible, pages d’aperçu et métadonnées ciblées |
| `src/features/collections/useCollectionStructureMutation.ts`, `useCollectionUpdateMutation.ts` | Reprise visible sans aperçu, récupération dans l’exclusion commune, présentation stable |
| `src/features/collections/CollectionUpdateDialog.test.tsx`, `useCollectionUpdateMutation.test.tsx` | Tests fonctionnels et contrat booléen de récupération |
| `src/services/collection-update-apply.local.test.tsx` | Trois intégrations réelles opt-in |
| `package.json`, `package-lock.json` | Version 0.8.13 uniquement |
| `README.md`, `docs/01-FEATURES.md`, `03-DATA-MODEL.md`, `04-UX-UI.md`, `05-ARCHITECTURE.md`, `06-DATABASE.md`, `08-ROADMAP.md` | État courant, parcours confirmé, reprise et limites, roadmap macro |
| Ce rapport | Clôture, provenance des preuves et conservation |

## Conclusion et limites

**8F clôturée Local** : writer SQL 8F.1, services/reprise 8F.2 et parcours utilisateur 8F.3 reliés et validés. Détection/aperçu 8E distincts, actualisation jamais automatique, confirmations et relectures autoritatives obligatoires. Limites : reprise au même onglet, réseau défaillant simulé, mobile émulé, contrôle de contraste Axe indéterminé sur le fond dégradé de l’état final, avertissement de bundle existant. Cloud/Vercel non consultés ni modifiés ; aucune preuve distante dérivée de `migration list --local`. Rapports historiques conservés. **8G/8H non commencées ; arrêt à 8F.3, sans commit ni push.**
