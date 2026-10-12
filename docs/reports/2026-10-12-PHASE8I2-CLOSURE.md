# Phase 8I.2 — Clôture officielle de la Phase 8

12 octobre 2026 — version **0.8.21**. Validation finale Local et clôture documentaire après le checkpoint Supabase Cloud manuel préparé en [8I.1](2026-10-12-PHASE8I1-AUDIT-CLOUD-READINESS.md).

**Verdict : GO pour clôturer la Phase 8.** Les fonctionnalités prévues sont livrées, les validations finales Local passent et le checkpoint fourni confirme les 48 migrations Cloud. Aucun défaut fonctionnel bloquant découvert. Application non déployée ; aucune campagne applicative complète Cloud avec de vrais utilisateurs revendiquée.

**Phase 8 clôturée — prête pour PR `dev` → `main` et préparation de la première mise en production.**

## État Git initial et final

| Contrôle | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev`, inchangée |
| HEAD | `2ce4184107c928e26ccff0579ab6db26d7079260` — `v0.8.20` | Identique ; aucun commit |
| Worktree | Propre, aucun changement préexistant ni fichier staged | Neuf fichiers suivis modifiés et ce rapport nouveau ; rien staged |
| Version package / lock racine / lock package racine | `0.8.20` / `0.8.20` / `0.8.20` | `0.8.21` / `0.8.21` / `0.8.21` |
| Opérations distantes | Aucune | Aucun accès Cloud/Vercel/GitHub distant, commit, push, merge ou déploiement |

Derniers commits pertinents vérifiés : `2ce4184` v0.8.20, `d9e794b` v0.8.19, `f35b920` v0.8.18, `c85b313` v0.8.17, `1e2644f` v0.8.16, `21271cf` v0.8.15. Aucun fetch ni vérification du distant pendant cette intervention ; le HEAD réel correspond au repère fourni.

`AGENTS.md`, scripts npm, convention de versionnage et références produit/architecture/SQL/pipeline/roadmap/publication examinés avant modification. Les sources applicatives, migrations, scripts, tests et configuration Vite sont inchangés depuis la clôture 8H.3. Les rapports historiques, particulièrement 8I.1, restent intacts. Skills `verify-and-stop`, Supabase, Context7 et `investigate-first` appliqués ; aucune délégation.

## Périmètre livré et validé

| Bloc | Acquis de Phase 8 | Frontière conservée |
|---|---|---|
| 8A | Cadrage, algorithme et invariants R1–R4, contrats techniques | Conception validée, preuves d’exécution séparées |
| 8B | Journal privé, moteur de fusion/rejeu, révisions, writers move/add/remove v2, reçus, reader/services/hooks et activation des nouvelles créations | Contrat 2 pour nouvelles collections seulement ; parents legacy contrat 1 conservés ; `sort_position` seul ordre affiché |
| 8C | Masquage persistant, droits propriétaire et progression backend autoritative | Automatiques de collections automatiques v2 seulement ; exemplaires indépendants |
| 8D | Œil Liste/Cartes, filtres communs, reorder filtré R2 et Classeur compacté | Partage consultatif ; Classeur sans écriture d’ordre ; recherche partielle interdit reorder |
| 8E | Détection structurelle, aperçu pur, plan/hash et token strict | Aucune application, allocation de requête ou notification par preview |
| 8F | Application atomique, consentement sur aperçu frais présenté, reçu et reprise idempotente | Pas d’application automatique ni second consentement ; requête exacte conservée, relectures avant succès UI |
| 8G | Stockage privé, projection dérivée Collection, cinq RPC utilisateur, rôle et publication/retrait privés | Publication terminal Local uniquement ; annonces exigeant une action non supportées |
| 8H | Cloche, compteur exact, centre paginé, contenu/lecture/traitement et raccordement aperçu/application/reprise | Pas de polling, administration UI ou notification externe ; limites navigateur/accessibilité conservées |
| 8I | Audit transversal 8I.1, checkpoint manuel Cloud fourni, validations finales et clôture officielle | Aucun développement fonctionnel ni préparation technique du déploiement |

La [documentation fonctionnelle](../01-FEATURES.md), l’[architecture](../05-ARCHITECTURE.md) et la [référence SQL](../06-DATABASE.md) restent les sources détaillées. L’inventaire transversal 8I.1 et les rapports 8B à 8H gardent leurs preuves historiques : ils ne sont pas réécrits ni additionnés aux résultats ci-dessous.

## Validations finales Local exécutées

Outillage constaté : **Node 24.20.0, npm 12.1.0, Supabase CLI installé 2.120.0, PostgreSQL 17.6**. Aucune mise à niveau ou installation de dépendance. La CLI est celle du dépôt ; aide installée et documentation Context7 consultées pour les cibles explicites Local.

| Contrôle exécuté en 8I.2 | Résultat et portée |
|---|---|
| `npm.cmd run build` | **PASS**, `tsc -b` inclus puis Vite 8.2.2 ; version 0.8.21 injectée. Chunk principal **821,00 kB**, gzip 230,71 kB ; warning >500 kB préexistant, non bloquant |
| `npm.cmd run lint` | **PASS**, ESLint avec `--max-warnings 0` |
| `npm.cmd test -- --maxWorkers=2`, passe stabilisée | **2 421 PASS, dix tests conditionnels ignorés / 2 431** ; 76 fichiers PASS, six ignorés / 82 ; aucun échec, 113,04 secondes |
| Footer ciblé après stabilisation | **Deux tests PASS** : version injectée depuis package et année dynamique ; aucun changement de composant |
| Intégrations frontend opt-in, `MY_SUPABASE_LOCAL_TEST=1`, `--maxWorkers=1` | **Neuf tests / cinq fichiers PASS**, 44,60 secondes : notifications, actions, apply/reprise, hide et preview ; jsdom avec SDK/PostgREST/PostgreSQL Local réels |
| `npm.cmd run db:test` | **38 fichiers / 3 790 assertions pgTAP PASS**, aucune assertion ignorée ; 104 secondes ; fixtures transactionnelles annulées |
| `npm.cmd run db:lint` | **PASS**, public/private, zéro warning ou erreur SQL |
| `supabase db advisors --local --type security --level info --fail-on warn` | **PASS**, sept INFO `rls_enabled_no_policy`, zéro WARN/ERROR avec le linter installé ; résultat Local distinct des advisors Cloud |
| `supabase migration list --local` et lecture read-only de l’historique | **48 fichiers / 48 versions appliquées**, dernière `20261011191625`, aucun écart de versions Local |
| Contrôle des migrations Phase 8 | **19 fichiers**, chacun avec un seul `BEGIN` et un seul `COMMIT`, aucun fichier SQL modifié |
| Parité canonique read-only | **1 213 états recalculés, zéro divergence de hash**, avant et après ; aucun run catalogue |
| Définitions installées et sources | **59 définitions identiques au relevé 8I.1**, dont la parité avec les sources avait été vérifiée ; sources backend inchangées depuis 8H.3 |
| Types générés en mémoire | **Identiques** à `src/types/database.generated.ts`, SHA-256 `8fba623654865589f1abb6191cc0d0f6a1dc768659a3e6ee91c3a9ab86c935a4` ; aucune écriture des types |
| Version / dépendances | **Trois seuls champs de version modifiés** dans les JSON package/lock ; autres champs et dépendances identiques à HEAD |
| Conservation Local | **23 empreintes de tables complètes identiques** avant/après ; historique, 59 fonctions/définitions/ACL, tables/RLS/policies, attributs publisher/memberships et absence de mot de passe identiques |
| Liens, ancres et périmètre documentaire | **PASS**, huit documents, **470 liens locaux / 87 ancres**, aucune destination manquante ; `git diff --check` sans erreur |

Les neuf intégrations opt-in exécutent les cinq RPC notifications, trois tests d’actions, trois tests apply/reprise, un test hide et un test preview. Leurs assertions d’interface jsdom ne constituent pas une nouvelle preuve visuelle navigateur ni un parcours complet GoTrue/TOTP. Les identités synthétiques réservées sont nettoyées par les suites existantes ; aucune donnée préexistante supprimée, réinitialisée, réensemencée ou recréée.

Le test conditionnel `scripts/notifications/publication.local.test.ts` n’est pas relancé : il provisionne temporairement un secret publisher et sa preuve réelle figure déjà en [8G.3](2026-10-11-PHASE8G3-CLOSURE.md), backend inchangé. Les campagnes de concurrence multi-session 8B/8C/8E/8F/8G et les contrôles Chrome desktop/tablette/mobile de [8H.3](2026-10-12-PHASE8H3-CLOSURE.md) restent historiques et applicables ; aucune nouvelle campagne de concurrence ou navigateur revendiquée. Aucun reset, shadow rebuild, seed ou migration nécessaire pour cette clôture.

### Échec intermédiaire expliqué

Première passe Vitest : **2 420 PASS, un échec, dix ignorés**. Le test footer a reçu la constante Vite `0.8.20` capturée au lancement et lu `0.8.21` dans le package modifié pendant la suite. Cette concurrence entre validation et changement de version a été introduite pendant 8I.2, sans défaut applicatif démontré. Aucun test ou code modifié pour masquer l’échec. Après stabilisation du package : footer ciblé **2/2 PASS**, puis nouvelle passe complète **2 421 PASS**. Seule cette seconde passe constitue la validation finale.

### Conservation du volume réel

Lectures PostgreSQL sous transactions `REPEATABLE READ READ ONLY`, cible loopback/port `55322` et base `postgres` contrôlées ; statut CLI et secrets de connexion capturés en mémoire, sans sortie de credentials. Empreintes SHA-256 de lignes triées, sans publication du contenu personnel. Artefacts de preuve et logs dans `.cache/8i2/`, ignorés par Git.

Avant = après : **un compte Local, un profil, deux collections, 257 items, trois exemplaires, sept intentions, quatorze reçus** ; trois tables notifications vides. Préférences, partages, catalogue et journaux privés inclus dans les 23 empreintes. Les parents legacy absents du volume actuel ne sont pas recréés : preuves par fixtures et campagnes historiques conservées. Les empreintes concernent les lignes et les métadonnées listées, pas un inventaire exhaustif de l’état des services Auth ou des séquences PostgreSQL.

## Checkpoint Supabase Cloud fourni

**Source : résultats communiqués par le propriétaire dans la demande 8I.2.** Le checkpoint manuel, postérieur à 8I.1, est terminé ; les contrôles suivants ont été réalisés directement sur Supabase Cloud en lecture seule. **Aucune connexion ni opération Cloud pendant 8I.2.** La colonne `remote` de `migration list --local` concerne la connexion Local et n’est jamais utilisée comme preuve Cloud.

### Migrations

**48 migrations appliquées Cloud**, correspondant aux 48 attendues Local ; les **19 migrations Phase 8** sont appliquées. Dernière : `20261011191625_phase8g3_notification_expiration_validation`. Aucun écart d’historique signalé. [Inventaire chronologique et dépendances 8I.1](2026-10-12-PHASE8I1-AUDIT-CLOUD-READINESS.md#5-inventaire-des-19-migrations-phase-8).

Les deux écarts de capture SQL Local déjà expliqués en 8I.1 restent documentés : doublon identique 7F.1 sous une version et capture 8B.2 précédant sept casts explicites d’initialisation. Définitions réellement installées Local conformes à l’audit ; aucune réparation d’historique ou réécriture de migration. L’alignement de versions Cloud fourni n’est pas une comparaison textuelle nouvelle de tous les corps de fonctions/captures Remote.

### Catalogue et données

| Objet | Cloud, checkpoint fourni | Local, 8I.2 |
|---|---:|---:|
| Pokémon | 1 025 | 1 025 |
| Séries | 18 | 18 |
| Extensions | 188 | 188 |
| Cartes sources | 19 907 | 19 907 |
| Variantes catalogue | 31 904 | 31 904 |
| Associations Pokémon/cartes | 16 820 | 16 820 |
| États canoniques | 1 213 | 1 213 |
| Comptes utilisateurs | 0 | 1 |
| Collections | 0 | 2 |

Principaux volumes concordants avec les relevés Local antérieurs et la passe actuelle. Cloud n’a aucun utilisateur ni collection : le projet n’a jamais été déployé publiquement. Les comptages ne démontrent ni identité intégrale des lignes/empreintes ni recalcul des hashes Cloud ; aucune de ces preuves absentes n’est inventée.

### Rôle de publication et fonction Edge

`my_notification_publisher` créé Cloud ; contrôles fournis :

- Non-superutilisateur, sans `CREATEROLE`, `CREATEDB` ou `BYPASSRLS`.
- Aucun héritage de privilèges ni appartenance à un rôle supérieur.
- Aucun accès direct aux tables métier contrôlées.
- EXECUTE des deux fonctions privées publication/retrait autorisé ; préparateur interne non exécutable directement.
- Fonctions de publication non exécutables par `anon` ou `authenticated`.
- Fonction Edge `delete-account` toujours active.

Création/permissions du rôle ne prouvent ni provisionnement de credentials, connexion publisher/TLS réelle ou publication d’annonce Cloud. Fonction Edge active ne signifie pas nouveau test de suppression de compte Cloud. Les outils terminal de publication et de synchronisation TCGdex restent **Local uniquement** ; aucune URL distante, garde retirée ou secret provisionné en 8I.2.

### Security Advisors

Cloud : **sept INFO** de tables privées avec RLS sans policy et **18 WARN** génériques de RPC SECURITY DEFINER exécutables par `authenticated`. Ces catégories correspondent en principe aux choix existants : stockage interne fermé et opérations métier via fonctions privilégiées contrôlées. Les tests et l’audit Local étayent les gardes d’authentification/AAL2, propriété/autorisation, validation des paramètres, grants explicites et `search_path` fixé.

**Ni vulnérabilités démontrées, ni preuve absolue de sécurité.** La liste détaillée des 18 signatures n’est pas fournie. Avant ouverture, inventorier ces signatures Cloud et vérifier corps/owners, grants effectifs/PUBLIC, schémas exposés, `search_path`, refus anon/AAL1/tiers et parcours autorisé sur comptes synthétiques. Absence de WARN avec le linter Local installé ne résout pas les avertissements du linter Cloud. [Justification et frontières SQL](../06-DATABASE.md#security-advisors-et-frontières-de-preuve). Aucune policy, ACL ou configuration de sécurité Cloud modifiée pour supprimer un signal.

## Modifications documentaires et version

| Fichier | Modification |
|---|---|
| [README](../../README.md) | État Phase 8 terminé, version, 48 migrations, prochaines opérations et renvois ; commande pgTAP corrigée à 38 fichiers |
| [Fonctionnalités](../01-FEATURES.md) | Livraison/clôture, frontière Local/Cloud et première publication après PR |
| [Architecture](../05-ARCHITECTURE.md) | État des environnements, production sur backend existant, procédure coordonnée et exigences de maintenance |
| [Database](../06-DATABASE.md) | Checkpoint réalisé, rôle/Edge, advisors et contrôles résiduels, historique conservé |
| [Synchronisation catalogue](../07-CATALOG-SYNC.md) | État migrations/volumes, garde Local et future adaptation Cloud dédiée |
| [Roadmap](../08-ROADMAP.md) | Phase 8 terminée, prochaine préparation de production, phases 9/10 conservées |
| [Publication notifications](../10-NOTIFICATION-PUBLICATION.md) | Rôle déjà présent Cloud distingué du script encore Local, adaptation/provisionnement futurs |
| `package.json`, `package-lock.json` | PATCH `0.8.21`, exactement trois champs ; convention conservée |
| Ce rapport | Preuves de clôture, limites, verdict et opérations manuelles |

Modèle conceptuel, UX, contrats Catalogue et cadrages existants examinés : aucune décision fonctionnelle changée, donc aucune réécriture nécessaire. Aucun rapport historique modifié. Pas de nouvelle migration, composant, workflow, dépendance ou configuration. Injection Vite, présentation du footer et année dynamique inchangées.

## Première mise en production : décision documentée

Préparation **après clôture Phase 8 et PR `dev` → `main`** : GitHub `Palmyna/my.`, React/Vite hébergé sur Vercel, Supabase Cloud existant conservé, `my.collectrealm.com` sur le domaine détenu `collectrealm.com`. Connexions GitHub/Vercel/Supabase à étudier pour simplifier les futures publications, sans seconde base de production ni perte des données actuelles.

Procédure décidée : développement/validation `dev`, contrôle PR, activation maintenance, merge vers `main`, déploiements Supabase/Vercel selon mécanisme retenu, vérifications version/base, puis désactivation maintenance après validation uniquement. Référence unique des exigences détaillées : [publication coordonnée et maintenance](../05-ARCHITECTURE.md#publication-coordonnée-et-maintenance).

Maintenance à concevoir : page MY., activation/désactivation sans nouveau déploiement applicatif, persistance pendant déploiement/échec, HTTP approprié idéalement 503 et contrôles protégés. **Frontend seul ne bloque pas Supabase** : protection temporaire des écritures métier sensibles à concevoir et tester avant d’en faire une garantie. Coordination et ordre explicites nécessaires ; intégration GitHub ne garantit pas l’ordre Supabase/Vercel. Faisabilité et limites des offres gratuites à confirmer lors de cette préparation.

Aucune maintenance implémentée, GitHub Actions créée, configuration Vercel modifiée, intégration activée, production ouverte ou sécurité Cloud changée. TCGdex et publisher Cloud nécessitent leurs adaptations sécurisées propres. Auth/SMTP/DNS/HTTPS, contrôles applicatifs Cloud, sauvegarde/restauration et compatibilité de reprise seront vérifiés lors de la préparation autorisée ; leur validation n’est pas déduite de la clôture.

## Anomalies, risques résiduels et limites

- Aucun défaut fonctionnel bloquant découvert ; seul échec intermédiaire lié au changement de version pendant la suite, expliqué et relancé sans contournement.
- Warning de bundle principal >500 kB conservé ; optimisation selon mesures en Phase 10, sans refactor opportuniste.
- Cloud sans comptes/collections : pas de tests complets avec vrais utilisateurs, de concurrence Cloud ou de validation applicative de production. Les résultats fournis ne constituent pas un audit indépendant exécuté par Codex en 8I.2.
- Security Advisors Cloud documentés avec justification et vérifications restantes ; sécurité absolue non revendiquée.
- Reprise limitée au même onglet ; stockage corrompu/fermeture définitive restent des limites connues. Legacy sans preview/apply/hide v2 ; aucune conversion implicite.
- Limites axe 8H.3 conservées : contraste et une règle ARIA incomplets, pas de certification, lecteur d’écran, autre moteur ou appareil physique ; erreurs réseau visuelles à compléter.
- Maintenance et protection backend, coordination des déploiements, adaptations Cloud TCGdex/publisher et faisabilité des offres gratuites non livrées. Phase 9 garde les partages ; Phase 10 garde finalisation, qualité et stabilisation V1.

## Contrôle documentaire final

**PASS : huit documents, 470 liens locaux, 87 ancres, zéro erreur et aucun caractère Unicode de remplacement.** `git diff --check` passe ; exactement neuf fichiers suivis modifiés et ce rapport nouveau, rien staged. Contrôle JSON : seuls les trois champs de version diffèrent de HEAD. Sources applicatives/SQL/tests/scripts et rapports historiques intacts. Les logs de validation et empreintes restent dans `.cache/8i2/` ; aucun secret ni donnée personnelle inclus dans ce rapport.

## Verdict et prochaines opérations manuelles

**GO — Phase 8 techniquement et documentairement clôturée.** Validation finale Local suffisante, conservation prouvée et checkpoint Cloud fourni intégré ; aucune anomalie bloquante restante. Cette décision n’ouvre pas la production et ne déclare pas la V1 terminée.

1. Propriétaire : relire les fichiers, enregistrer les changements par commit puis effectuer le **push sur `dev`** ; aucun commit/push réalisé par Codex.
2. Préparer et contrôler la **PR `dev` → `main`** selon le workflow du dépôt ; aucune PR créée ou fusionnée ici.
3. Après cette étape, préparer la **première mise en production** et valider ses mécanismes/protections avant toute ouverture. Aucun travail de Phase 9/10 commencé.

**Phase 8 clôturée — prête pour PR `dev` → `main` et préparation de la première mise en production.**
