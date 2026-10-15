# PROD.7B.2.1 — Fondations des rôles MY.

## Verdict et périmètre

**Socle livré et validé sur Supabase Local en `0.8.31`.** `user` est implicite ; `super_admin` exige une attribution privée par un opérateur PostgreSQL autorisé. Aucun utilisateur réel attribué, aucun rôle SQL créé, aucun consommateur frontend. Prêt pour un futur usage serveur ciblé, sous les contrôles de cette sous-phase.

PROD.2 conserve ses fonctions, décisions d'admission et exceptions SQL existantes. Aucun accès Premium, abonnement, écran d'administration, back-office ou exception applicative au gel. **PROD.7B.2.2 non commencée.** Les critères hébergés discutés en PROD.7B.2 restent ouverts ; ce socle ne résout pas le contrôle du frontend Vercel sous maintenance.

## État initial vérifié

| Élément | Observation directe |
|---|---|
| Branche | `dev` |
| HEAD initial et final, sans commit | `5acccf75137934e685f099adbe5e2cd43fd9a98d` |
| Worktree initial | Propre |
| Version initiale package / lockfile / racine du lockfile | `0.8.30` / `0.8.30` / `0.8.30` |
| CLI installée | Supabase `2.120.0` |
| Cible utilisée | Supabase Local `my-local`, HTTP `127.0.0.1:55321`, PostgreSQL `127.0.0.1:55322/postgres` |
| Migrations initiales | 50, jusqu'à `20261013135415_prod2_freeze_admission_barrier` |
| Données personnelles présentes | 1 compte Auth, 1 profil, 2 collections ; conservés |
| Gel initial | Ouvert |

Instructions `AGENTS.md`, références 03/05/06/08/11, rapport PROD.7B.2, migrations Auth/compte/PROD.2, politiques, fonctions, tests SQL et outillage opérateur examinés avant modification. État courant prioritaire sur les checkpoints historiques.

Documentation officielle consultée par Context7 : [fonctions et privilèges](https://supabase.com/docs/guides/database/functions), [RLS et métadonnées](https://supabase.com/docs/guides/database/postgres/row-level-security), [MFA](https://supabase.com/docs/guides/auth/auth-mfa), [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp). Index du changelog public consulté ; aucun changement pertinent imposant un autre modèle de rôles. Commandes CLI découvertes par `--help`. Aucune consultation des projets Cloud.

## Modèle et frontières de confiance

- `private.app_role_assignments` associe exclusivement un UUID `auth.users(id)` au statut `super_admin`. Clé primaire sur l'UUID, FK `ON DELETE CASCADE`, CHECK sur le seul rôle explicite, timestamp et identité de l'opérateur. Absence de ligne = `user`. Table vide après installation et après nettoyage des tests.
- Owner `postgres`, RLS sans policy, aucun droit PUBLIC, `anon`, `authenticated`, `service_role`, `authenticator`, `supabase_auth_admin` ou publisher. Aucun changement de rôle PostgreSQL, membership, SUPERUSER ou permission SQL générale.
- `private.set_app_role(uuid,text)` est privé, `SECURITY INVOKER`, `search_path=''`, exécutable uniquement par les opérateurs existants. Il contrôle aussi la vraie `session_user` : un appel via wrapper `SECURITY DEFINER` owner `postgres` ne transforme pas une session `authenticator` en opérateur. `super_admin` exige compte non anonyme, email confirmé et profil ; verrou sur la ligne Auth pour coordonner la suppression. `user` révoque. Grant et révocation répétés sont idempotents ; répéter un grant conserve sa provenance.
- `private.is_super_admin()` est interne, sans argument UUID, `STABLE SECURITY DEFINER`, owner `postgres`, `search_path=''`, sans EXECUTE API. Il lit l'attribution actuelle de `auth.uid()` et exige AAL2 ainsi qu'un profil vivant. Aucun claim de rôle MY., metadata Auth, paramètre frontend ou modification de profil ne donne de privilège. Supabase vérifie le JWT avant d'établir son contexte d'identité/assurance ; des GUC SQL injectées par l'opérateur dans pgTAP ne sont pas présentées comme une preuve HTTP.
- Révocation et suppression s'observent à la requête suivante avec le même token signé. Un ancien snapshot SQL peut conserver une vue antérieure ; une relecture opérateur doit utiliser une nouvelle connexion. Aucune promesse d'interruption rétroactive d'une requête déjà commencée.
- Aucune policy métier ne lit le nouveau statut. Propriété, partages, MFA et protection des profils supprimés continuent de décider l'accès aux collections. Le statut ne donne aucun accès aux collections privées d'autrui.
- La table rejoint le trigger PROD.2 existant : 23 tables MY. et `auth.users`, soit 24 relations vérifiées. Aucune fonction PROD.2 modifiée. Les sessions SQL opérateur conservent leur exception préexistante ; un utilisateur applicatif attribué reste gelé.
- La FK nettoie l'attribution dans la suppression Auth normale. Le trigger existant nettoie profil, collections et dépendances ; gel actif, la destruction Auth reste bloquée sans nettoyage partiel.

Les opérateurs PostgreSQL sont une frontière de confiance existante : ils peuvent administrer directement les objets qu'ils contrôlent. Le socle ne prétend pas résister à une compromission de ces identités. Aucun secret de connexion, token ou secret TOTP n'est conservé dans Git.

## Fichiers livrés

| Fichier | Changement |
|---|---|
| [Migration additive](../../supabase/migrations/20261015103447_prod7b21_app_roles.sql) | Table privée, setter, prédicat et rattachement à la garde existante |
| [040_app_roles.test.sql](../../supabase/tests/database/040_app_roles.test.sql) | 64 assertions rôles, permissions, MFA, RLS, révocation et suppression |
| [001_schema.test.sql](../../supabase/tests/database/001_schema.test.sql) | Inventaire des tables privées enrichi |
| [test-app-roles.js](../../scripts/test-app-roles.js) | Six scénarios Local réels Auth/TOTP/PostgREST et identité PostgreSQL, cleanup synthétique, refus de réouverture automatique après erreur |
| [database.js](../../scripts/maintenance/database.js), [local.integration.js](../../scripts/maintenance/local.integration.js) | Attentes de couverture actualisées : 24 relations et 51 migrations ; comportement de gel inchangé |
| [package.json](../../package.json), [package-lock.json](../../package-lock.json) | PATCH `0.8.31`, commande `npm run roles:test:local`, aucune dépendance ajoutée |
| [Modèle](../03-DATA-MODEL.md), [architecture](../05-ARCHITECTURE.md), [base](../06-DATABASE.md), [roadmap](../08-ROADMAP.md), [procédure](../11-PUBLICATION-PRODUCTION.md), [README](../../README.md) | Références cohérentes avec le modèle et la version ; procédure future sans attribution réelle |

Les types publics ont été régénérés par la commande officielle du dépôt : **aucun diff**, puisque tous les nouveaux objets sont privés. Aucune migration historique modifiée.

## Validations exécutées

| Validation | Résultat |
|---|---|
| `supabase migration up --local` | Une seule migration ajoutée ; 51 fichiers et 51 versions Local |
| `npm run db:test` | **3 938 assertions / 40 fichiers PASS**, dont 64 nouvelles ; corpus Auth/MFA/RLS et PROD.2 conservé |
| `node scripts/test-app-roles.js` | **6 scénarios PASS** : vrais comptes Auth synthétiques, metadata modifiable sans effet, TOTP/AAL2 réel, setter inaccessible malgré wrapper owner, JWT falsifié/non signé HTTP 401, collections privées invisibles, absence de RPC/profil de gestion, gel HTTP 503, suppression Auth bloquée sous gel, révocation/regrant sans refresh, destruction Auth puis ancien token sans privilège |
| `npm run maintenance:test` | **5 tests PASS** |
| `npm run maintenance:test:local` | **10 scénarios PASS**, 51 migrations/24 relations ; drainage, erreurs, interruption, HTTP Local et reprise Phase 8 ; état final ouvert |
| `npm run db:lint` | Aucun avertissement ni erreur sur `public,private` |
| `supabase db advisors --local --type security --level warn --fail-on warn` | Aucun problème signalé au niveau warning/error |
| `npm run db:types` | Génération réussie, fichier inchangé |
| `npm run lint` | PASS, zéro avertissement |
| `npm run build` | Typecheck et build PASS ; avertissement Vite sur taille de chunk, sans lien avec ce changement SQL |
| Versions via Node | Package, lockfile et racine du lockfile : `0.8.31` |

Premier test ciblé corrigé pour respecter le contrat existant du lecteur : collection invisible = SQL NULL. Premier passage global corrigé pour inclure la table ajoutée dans l'inventaire privé. Dernier passage global entièrement réussi ; aucune modification métier destinée à satisfaire une attente de test incorrecte.

Le script d'intégration crée deux comptes `example.test`, sans persistance de session côté client ni log des secrets. Une fonction de lecture publique et un wrapper privé aux noms aléatoires servent exclusivement aux preuves Local ; tous deux sont retirés après le test. Le produit livré ne contient aucun endpoint de rôles. La fermeture du gel est explicitement vérifiée depuis une connexion indépendante ; une erreur après cette fermeture ne déclenche aucune réouverture automatique.

## Conservation du Local personnel

Snapshots avant/après sous `.cache/prod7b21/`, non versionnés : 46 tables existantes et sept séquences, empreintes SHA-256 sans export des lignes Auth personnelles ; définitions/ACL/RLS de 146 objets de sécurité existants.

- **Toutes les tables existantes restent identiques**, sauf le singleton de gel volontairement basculé pour les tests et le journal Auth append-only des comptes synthétiques : 575 → 585 entrées. Ces dix événements restent comme preuves Auth normales ; aucun effacement des journaux.
- **146 objets de sécurité existants identiques** : fonctions, owners, ACL, policies et RLS. Les seuls objets permanents ajoutés sont la table et les deux fonctions privées, avec son trigger.
- Sept séquences avancent sans retour arrière : `auth.refresh_tokens_id_seq` 242 → 245 ; `public.automatic_target_states_id_seq` 1666 → 1680 ; `catalog_variants_id_seq` 31997 → 31999 ; `pokemon_id_seq` 1238 → 1244 ; `source_cards_id_seq` 20060 → 20064 ; `tcg_series_id_seq` 111 → 113 ; `tcg_sets_id_seq` 281 → 283. Les réservations SQL ne sont pas transactionnelles ; aucun `setval` de nettoyage.
- État final : **1 compte Auth, 1 profil, 2 collections personnels inchangés ; 0 attribution ; 0 fixture rôles ; gel ouvert**. La révision de gel avance normalement avec les répétitions de validation.

## Attribution manuelle future

Procédure complète avec saisie `psql` de l'UUID réel, vérification du compte/email/profil/TOTP, transaction et relecture indépendante : [PROD.7B.2.1 dans la référence opérateur](../11-PUBLICATION-PRODUCTION.md#prod7b21--attribution-manuelle-future-des-rôles).

Après création et vérification normales du futur compte propriétaire, un opérateur PostgreSQL autorisé appelle `private.set_app_role(uuid, 'super_admin')` sur la cible explicitement identifiée, committe et relit la ligne depuis une autre connexion. `private.set_app_role(uuid, 'user')` révoque, puis l'absence de ligne est relue. Aucun email fixe ni secret versionné. Aucun UUID réel n'est fourni dans ce rapport et aucune attribution persistante n'est effectuée pendant cette sous-phase.

## Compatibilité, retrait et limites

Migration additive uniquement : les anciens clients ignorent la table privée et conservent leurs contrats. Tout retrait futur commence par l'arrêt des consommateurs puis la révocation opérateur et une migration additive examinée ; aucun rollback destructif ni DROP exécuté ici.

Preuves **Local/synthétiques uniquement**. Aucun accès ou changement Supabase Cloud, Vercel ou GitHub ; aucun compte réel créé, reset Local, commit ou push. Aucun déploiement, backup ou reprise Cloud attesté. Les validations HTTP concernent Supabase Local et le harness de maintenance existant, sans preuve navigateur/Vercel hébergée. Aucun développement PROD.7B.2.2, Premium ou back-office.
