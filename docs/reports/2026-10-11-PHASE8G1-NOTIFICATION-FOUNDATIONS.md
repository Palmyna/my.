# Phase 8G.1 — Fondations backend des notifications

11 octobre 2026 — version **0.8.14**. **8G.1 livrée et validée exclusivement Local ; 8G reste en cours.** Trois tables privées, projection dérivée des mises à jour de collection, invariants de stockage/publication et tests ciblés. Aucun consommateur utilisateur ni annonce publiée. Arrêt à 8G.1, sans commit ni push.

## État réel et sources

| Contrôle | Résultat |
|---|---|
| Branche / HEAD initial et final | `dev` / `63e503dc4da5a8bb588a738d7a576b3027051e47`, inchangés |
| Worktree initial | Propre, aucun changement préexistant |
| Worktree final | 13 fichiers : sept modifiés, six ajoutés, aucun staged |
| Version | Package et deux champs du lock `0.8.13` → `0.8.14` ; comparaison JSON exacte hors ces trois champs |
| Dépendances | Inchangées ; Node 24.20.0, npm 12.1.0, Supabase CLI 2.120.0 |
| Supabase Local | API `127.0.0.1:55321`, PostgreSQL `127.0.0.1:55322`, volume conservé |
| Historique | 43/43 avant, **45/45 après**, deux migrations additives, aucun reset |
| Données réelles | Deux collections, 257 items, trois exemplaires, sept intentions, quatorze reçus, intégralement préservés |

Avant modification : `AGENTS.md`, [section 8 de 8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md#8-notifications-et-publication), [clôture 8E](2026-10-11-PHASE8E-CLOSURE.md), [clôture 8F](2026-10-11-PHASE8F3-CLOSURE.md), Fonctionnalités, Modèle, Architecture, Database et roadmap ; inspection des états cibles, calcul canonique, création automatique, contexte/statut/aperçu 8E, writer 8F, schéma privé, ACL/RLS et fixtures pgTAP. Documentation CLI obtenue via Context7, changelog Supabase consulté. Skills migration, Supabase et procédure Local de génération des types utilisés.

État des collections du propriétaire, relevé en base avant/après :

| Collection | Type / contrat | Version appliquée | Révision personnelle | Items | Masqués |
|---|---|---|---|---|---|
| `Pikachu` (`71b7cc99-3ebf-4c02-81f5-20ac55a08d01`) | Automatique / 2 | 2 | 7 | 254 | 5 |
| `test` (`7e9ea664-40f9-4acb-a7aa-95f63275d5c2`) | Libre / 2 | NULL | 7 | 3 | 0 |

Ces contrats actuels sont constatés, pas activés ici. Aucun parent personnel converti, supprimé ou actualisé.

## Migrations et compatibilité

Fichiers créés avec `supabase migration new`, appliqués avec `migration up --local`, chacun avec un unique BEGIN/COMMIT :

1. [20261011171608 — fondations](../../supabase/migrations/20261011171608_phase8g1_notification_foundations.sql) : trois tables, index, RLS/ACL, trigger d’immuabilité, prédicat structurel partagé, projection et factorisation du contexte 8E.
2. [20261011172335 — validation](../../supabase/migrations/20261011172335_phase8g1_notification_validation.sql) : correction additive du warning SQL lint (`to_json(text)` STABLE), refus des textes entièrement composés d’espaces/tabulations/sauts de ligne. Première migration appliquée conservée telle quelle ; aucun historique réécrit.

`migration list --local` confirme 45 fichiers appliqués, dernier `20261011172335`. La colonne nommée remote dans ce résultat désigne ici l’historique de la connexion Local ; aucune preuve Cloud déduite.

Expansion uniquement, sans backfill. Compatibilité des chemins 8E/8F conservée ; nouvelles tables vides, aucune signature publique changée. Retour arrière logiciel futur : fermer les futurs consommateurs tout en conservant données/suivis ; aucune suppression, réversion de collection ou contraction automatique. Aucune procédure destructive exécutée.

## Stockage livré

| Structure | Invariants |
|---|---|
| `private.collection_notification_reads` | Exactement UUID collection PK/FK cascade, BIGINT version lue positive, TIMESTAMPTZ lecture obligatoire et finie. Aucun propriétaire dupliqué. Absence de ligne = jamais lue. |
| `private.notification_announcements` | UUID PK, clé ASCII unique `[a-z0-9][a-z0-9._:-]{0,119}`, catégories fermées, titre/corps non vides limités à 200/20 000 caractères après trim, SemVer ≤64 obligatoire pour changelog, hash SHA-256 minuscule, auteur non vide, action JSONB objet nullable et provenance JSONB objet obligatoire. `requires_action` obligatoire, `include_new_users=false` par défaut. Dates finies : expiration strictement après publication, retrait au moins à publication. |
| `private.notification_announcement_states` | PK profil/annonce, deux FK cascade, lecture/traitement nullable et fini ; traitement exige lecture et date ≥ lecture. Contenu d’annonce partagé, sans duplication par destinataire. |

Index de pagination annonces `(published_at DESC,id)`, PK des états par utilisateur et index de FK `announcement_id` pour cascade efficace. Aucun index booléen isolé, journal générique ou date d’inscription recopiée.

Trigger `private.guard_notification_announcement_publication` : tout champ de publication hors `withdrawn_at` est immuable, y compris identité/clé, contenu/hash, audience, action, provenance et dates. Premier retrait autorisé, répétition identique sans effet ; changement/effacement du retrait interdit. Correction par retrait puis nouvelle publication avec nouvelle clé. Suppressions dans les tests concernent uniquement des fixtures synthétiques.

La validation complète de publication est délibérément réservée à 8G.3 : union stricte des actions/liens internes, schéma exact du contexte, justifications d’audience, conditions de résolution supportées, comparaison du hash normalisé, horodatage serveur, rôle opérateur et fonctions/script de publication. Le stockage vérifie les enveloppes JSON et contraintes scalaires ; aucun chemin de publication exposé ne permet de les contourner.

## Projection des mises à jour

`private.collection_update_available` possède l’unique prédicat structurel, partagé avec `private.read_collection_update_context` 8E. Fonction sans lecture de table ni mutation ; STABLE à cause de la conversion JSON textuelle. Vérification du hash canonique, des IDs/rangs, de l’ordre appliqué et des versions. NULL pour une incohérence, false sans changement utile, true uniquement pour version supérieure **et** séquence canonique ordonnée différente. Le statut/aperçu garde son erreur sûre pour NULL ; la projection exclut ce parent. Aucun nouveau moteur de fusion ni calcul à partir du seul numéro de version.

`private.read_collection_update_notifications(owner_uuid)` : SQL STABLE SECURITY INVOKER, `search_path=''`, aucun accès API. Retour privé : `notification_key`, `collection_id`, `collection_name`, `applied_target_version`, `target_version`, `updated_at`, `is_read`. Les versions restent des BIGINT SQL exacts ; leur sérialisation publique en chaînes décimales appartient à 8G.2.

Un snapshot de statement couvre parents, états cibles, catalogue, items et suivi lu. CTE matérialisées : sélection des parents du propriétaire, cibles distinctes, un calcul canonique par cible, agrégation des items par parent. Aucun appel du statut verrouillé pour chaque collection, aucune boucle de locks ou de journal, aucun N+1 par item. Le centre et le compteur futurs pourront réutiliser cette projection.

Éligibilité : propriétaire actuel, automatique contrat 2, delta utile valide non appliqué. Partage reçu, collection libre/legacy et états incohérents exclus. Clé `collection:<UUID>` stable, révision courante `target_version`, date issue de l’état cible. Suivi absent ou inférieur → non lu ; suivi au moins égal → lu. Version nouvelle repasse non lu sans écrire le suivi. Application 8F traite par `applied_target_version` atomique ; suppression et retour à structure identique rendent absent/obsolète.

Aucun verrou row/advisory dans la projection. Statut/aperçu/application conservent catalogue partagé `771402` avant parent. Writers, synchronisation et moteur de fusion inchangés. Aucun reçu ou suivi créé à la consultation, sync ou préchargement.

## Sécurité et préparation 8G.2

RLS active sur les trois tables, aucune policy utilisateur. Grants hérités explicitement révoqués pour PUBLIC, anon, authenticated et service_role ; EXECUTE révoqué aussi sur les nouvelles fonctions. Schéma private toujours absent des schémas Data API. Fonctions nouvelles INVOKER, aucun nouveau DEFINER, rôle opérateur ou secret. Les futures RPC devront contrôler identité/AAL2/profil et passer exclusivement l’UUID de l’appelant au lecteur privé ; celui-ci est un outil backend fermé, pas une API acceptant un destinataire arbitraire.

Annonces : stockage prêt pour publication partagée et état individuel. Les lecteurs 8G.2 détermineront l’éligibilité depuis `auth.users.created_at` du seul appelant (inscription ≤ publication), ou exception `include_new_users=true` tant que publication active. Retrait, expiration et traitement excluront l’annonce. Aucun lecteur d’annonce incomplet, API de dates d’inscription, trigger signup, worker, Cron, Realtime ou fanout implémenté.

## Preuves ciblées exécutées

| Validation | Résultat |
|---|---|
| [034 stockage](../../supabase/tests/database/034_notification_storage.test.sql) | **177 assertions PASS** : colonnes/types, CHECK, NOT NULL, FK/unicités, BIGINT, dates, SemVer, immuabilité, index, RLS/ACL et cascades fixtures |
| [035 projection](../../supabase/tests/database/035_collection_notification_projection.test.sql) | **61 assertions PASS** : Extension/Pokémon, delta/rang, version seule, retour identique, lecture/nouvelle version, application 8F réelle, suppression, libre/legacy/partage, isolation, corruption, pureté et absence d’API 8G.2 |
| Contrats existants directement touchés | **265 assertions PASS** sur 032 aperçu et 033 application ; exécution finale commune **4 fichiers / 503 assertions PASS** |
| [Concurrence ciblée](../../scripts/test-collection-notification-concurrency.ts) | **Deux scénarios PASS**, trois connexions PostgreSQL réelles ; sync et application |
| SQL lint public/private | PASS, zéro erreur/warning |
| Advisors sécurité Local | **0 WARN/ERROR**, sept INFO `rls_enabled_no_policy` attendues sur les tables privées fermées, dont les trois nouvelles |
| RLS/ACL et compatibilité | Trois tables sans accès API/policy ; **45 ACL de fonctions existantes identiques** ; seules les instructions du contexte privé 8E sont factorisées, autres 44 définitions identiques |
| Plan SQL ciblé | EXPLAIN ANALYZE du corps SQL sur le propriétaire réel : un parent automatique, une cible, **un appel canonique / 254 lignes**, agrégat items unique ; environ 52 ms sur ce passage Local, sans extrapolation de charge |
| Types Local | Génération via script existant, deux résultats comparés octet par octet ; types publics identiques à HEAD, aucune édition manuelle |
| Typecheck | `npm.cmd run typecheck` PASS |
| Package/lock | Comparaison JSON exacte hors trois champs de version ; dépendances inchangées |
| Données avant/après | **19 tables existantes**, chaque ligne complète ordonnée comparée, identiques ; trois nouvelles tables vides ; fixtures nettoyées |
| `git diff --check` | PASS |

Concurrence : lecture ne bloque pas pendant sync exclusive non engagée ; barrière advisory **uniquement dans le test**, attente réelle observée par `pg_blocking_pids`, commit sync entre snapshot externe et calcul imbriqué. Résultat garde version/hash/canonique du même snapshot ; statement suivant voit la nouvelle version. Application 8F non engagée laisse l’événement actif sans attente sur parent ; commit le retire, sans écriture de lecture. Aucun test de concurrence simulé présenté comme preuve réelle.

Erreurs de premier passage corrigées : overloads pgTAP de contrôle de colonnes, deux opérations de fixtures refusées par les invariants existants (version appliquée NULL, transfert à un destinataire partagé), puis volatilité signalée par SQL lint. Aucun invariant existant désactivé pour rendre les tests verts.

Suites DB/frontend complètes, campagnes générales des writers, navigateur, Cloud et Vercel **non exécutés**, conformément au périmètre. Aucun commit/push. Aucune cloche, service TypeScript, RPC de centre/compteur/lu/traité ou annonce ajoutée. **Contrats préparés pour 8G.2, aucune livraison 8G.2 commencée ; 8G non déclarée terminée.**
