# PROD.7B.2.2 — Exception permanente au gel pour super_admin

## Verdict et portée

**Livré et validé sur Supabase Local en `0.8.32`.** Le `super_admin` applicatif éligible peut automatiquement effectuer ses opérations métier habituelles pendant le gel. Aucun réglage supplémentaire pendant une publication. Le rôle suit le compte, indépendamment du frontend ; aucune configuration Preview.

Seule la décision centrale du gel change. RLS, propriété, MFA, services/RPC métier, reçus et permissions SQL restent conservés. Aucun accès privé d'autrui ni pouvoir sur les attributions ou protections du gel. L'exception ne traverse pas la maintenance frontend Vercel. Les limites hébergées de PROD.7A/PROD.7B.2 restent distinctes : aucun GO global de publication déduit de cette livraison.

Aucun accès Supabase Cloud, changement Vercel/GitHub, reset, commit ou push. Aucun développement frontend, Premium, abonnement, administration UI, PROD.7B.2.3 ou PROD.7C. Rapports et migrations historiques non modifiés.

## État initial et final

| Élément | Initial | Final |
|---|---|---|
| Branche | `dev` | `dev` |
| HEAD | `84c3ec638a38aa8dfe9ef5bf7c61877b88ebec2e` | Identique, aucun commit |
| Worktree | Seul `?? supabase/snippets/` préexistant | 18 fichiers livrés modifiés/créés ; snippets conservés |
| Version package / lockfile / entrée racine du lockfile | `0.8.31` dans les trois champs | `0.8.32` dans les trois champs, validation Node |
| Migrations Local | 51, dernière `20261015103447` | 52, dernière `20261015123024` |
| Gel | Ouvert, révision `144` | Ouvert, révision `190`, relecture indépendante |
| Comptes Auth / profils / collections personnels | 1 / 1 / 2 | 1 / 1 / 2, empreintes identiques |
| Attribution personnelle `super_admin` | 1 attribution déjà présente | Même ligne et même provenance, empreinte identique |
| CLI / cible | Supabase `2.120.0` ; `my-local`, HTTP `127.0.0.1:55321`, PostgreSQL `127.0.0.1:55322/postgres` | Identiques |

La révision du gel progresse normalement avec les essais de fermeture/réouverture ; elle n'est pas artificiellement remise à sa valeur initiale. L'état fonctionnel initial ouvert est retrouvé. Aucune attribution/révocation ni mutation du compte personnel pour tester l'exception.

Inspection préalable : `AGENTS.md`, état Git, versions via Node, documentation 03/05/06/08/10/11/12 et README ; rapports PROD.2, PROD.7A, PROD.7B.2 et PROD.7B.2.1 ; migrations réelles, écrivains RPC, triggers, Auth/Edge, tests et contrats maintenance. Le constat courant prime sur les rapports historiques, notamment concernant l'attribution personnelle déjà réalisée.

## Implémentation et invariants

La migration additive [20261015123024_prod7b22_superadmin_freeze.sql](../../supabase/migrations/20261015123024_prod7b22_superadmin_freeze.sql), créée par le CLI puis appliquée avec `migration up --local`, remplace uniquement `private.require_business_writes_open()`. Elle actualise aussi les commentaires SQL du contrat ; aucune modification de données, d'ACL, de trigger ou de signature.

Ordre de décision :

1. Exception historique des vraies sessions PostgreSQL opérateur `postgres` / `supabase_admin`.
2. Admission partagée transactionnelle `771403`, puis singleton lu `FOR SHARE`.
3. État absent : `PT503/business_write_freeze_unavailable`, même pour `super_admin`.
4. État ouvert : comportement précédent, sans nouveau contrôle métier.
5. État fermé : session réelle `authenticator`, rôle API `authenticated` du JWT vérifié par Supabase, et `private.is_super_admin()` vrai ; sinon `PT503/business_writes_frozen`.

Le prédicat PROD.7B.2.1 est réutilisé sans modification : UUID `auth.uid()`, attribution privée effective, AAL2, profil vivant. Aucun UUID passé en argument à ce prédicat, email, header libre, préférence frontend, `user_metadata` ou `app_metadata` ne confère de rôle. Le claim API `role=authenticated` identifie le rôle PostgreSQL sélectionné par la plateforme ; il ne porte pas le rôle MY. Un JWT falsifié est refusé par l'API avant l'exécution SQL.

`SECURITY DEFINER` peut changer `current_user` sans changer `session_user` ni l'identité Auth. Le rôle MY. ne donne aucun rôle PostgreSQL ou droit supplémentaire. Le setter privé des rôles conserve son contrôle opérateur, y compris derrière un wrapper owner `postgres`. Les contrôles de gel, tables privées et triggers ne deviennent pas accessibles à l'application.

La barrière reste avant catalogue `771402`, parent et autres verrous métier. Les opérations `super_admin` conservent admission et verrou de ligne jusqu'au commit/rollback. Elles attendent derrière une fermeture en file, puis peuvent être admises lorsque le gel fermé est relu. Une fermeture draine également celles déjà admises. Les anciens snapshots RR/SERIALIZABLE échouent toujours avec `40001` ; aucune admission à partir d'un ancien état ouvert.

Révocation : refus à la requête suivante avec le même token signé, sans refresh nécessaire. Une requête déjà commencée n'est pas interrompue rétroactivement ; la visibilité des snapshots SQL reste celle de PostgreSQL, comme dans le socle des rôles existant.

## Matrice vérifiée

| Identité / cas | Gel ouvert | Gel fermé |
|---|---|---|
| Utilisateur ordinaire AAL2 | Opérations normales réussies | Refus conservés |
| `super_admin` Auth AAL2 | Mêmes opérations normales | Mêmes opérations autorisées automatiquement |
| Attribution révoquée | Aucun privilège MY. | Refus avec même JWT signé |
| AAL1, identité/assurance absentes | Contrôles existants conservés | Aucune exception |
| JWT modifié ou non signé | HTTP 401 | JWT modifié : HTTP 401 |
| Métadonnées de rôle manipulées | Aucun privilège avant attribution | Token Auth rafraîchi avec métadonnées manipulées toujours refusé |
| Collections privées d'autrui | Lecture refusée par RLS | Lecture vide, UPDATE sans effet, RPC propriétaire refusée et données inchangées |
| Auto-attribution / contrôle du gel / désactivation de trigger | Droits inchangés | Refus, même pour `super_admin` et via wrapper definer |
| `service_role` | Contrat existant | Refus API ; refus SQL même avec sujet attribué/AAL2 et rôle API service |
| Création Auth / destruction du compte attribué | Contrat existant | Refus atomiques, compte et attribution conservés |
| Opérateur SQL | Exception existante | Exception existante |
| Publisher SQL dédié | Deux fonctions existantes | Publication/rejeu/retrait autorisés, DML direct et bascule refusés |

Les trois matrices métier utilisent les mêmes endpoints applicatifs avec de vrais tokens Auth/TOTP AAL2 : utilisateur ordinaire ouvert, `super_admin` ouvert, `super_admin` fermé. Vérifications au-delà du statut HTTP :

- Ajout manuel de deux cartes, reorder réellement changé et ordre relu, retrait effectif, révisions exactes et reçu de reorder rejoué à l'identique.
- Création, modification du nom/de la note et suppression d'exemplaire ; possession dérivée effectivement vraie puis fausse dans le lecteur de collection.
- Création automatique normale, masquage persisté, évolution du seul catalogue synthétique, preview fraîche, application explicite ; versions, variantes finales, masque conservé et reçu/rejeu sans double mutation vérifiés.
- Lecture de notification de collection persistée à la version observée ; lecture/traitement d'annonce persistés pour le compte synthétique. Une annonce distincte par matrice respecte l'obsolescence des annonces déjà traitées.
- Suppression des collections de test par le chemin applicatif normal et contrôle SQL de leur disparition.

## Résultats des vérifications

| Commande / campagne | Résultat |
|---|---|
| SQL gel/rôles avant modification, fichiers 039/040 | 148 assertions PASS |
| `npm.cmd run db:test -- supabase/tests/database/039_business_write_freeze.test.sql supabase/tests/database/040_app_roles.test.sql supabase/tests/database/041_superadmin_freeze.test.sql` | **164 assertions / 3 fichiers PASS** |
| `node scripts/test-app-roles.js` (alias `roles:test:local`) | **11 scénarios PASS** ; Auth/TOTP réels, PostgREST, matrices métier, sécurité, concurrence ; dernière exécution après renforcement du contrat opérateur |
| `node scripts/test-business-write-freeze.js` | **13 scénarios PASS, 101 refus SQL, 78 refus REST**, 23 tables MY., 11 RPC writers et 15 lecteurs ; publisher et Auth/Edge réels |
| `npm.cmd run maintenance:test` | **5 tests PASS** |
| `npm.cmd run maintenance:test:local` | **10 scénarios PASS** ; 52 migrations, drainage, interruption, timeout, erreurs, reprise Phase 8 et relecture indépendante |
| Services frontend concernés, 11 fichiers ciblés | **743 tests PASS** : Auth, suppression de compte, collections/contenu, items/v2/manuels, actualisation/application, exemplaires, notifications |
| `npm.cmd run db:lint` | Aucun problème public/private |
| `supabase db advisors --local --type security --level info --fail-on warn` | **9 INFO** RLS sans policy sur tables privées intentionnellement fermées ; **0 WARN / 0 ERROR** |
| `npm.cmd run lint` | PASS, zéro warning ESLint |
| `npm.cmd run build` | PASS, inclut `npm run typecheck` ; avertissement Vite de chunk supérieur à 500 kB, sans erreur |

Le contrôle opérateur inclut désormais **17 définitions exactes** : les 15 fonctions PROD.2 avec leur évolution centrale, le prédicat et le setter des rôles. Il vérifie propriétaires, modes invoker/definer, `search_path`, signatures, ACL fermées et RLS sans policy des attributions. Les injections transactionnelles d'un prédicat retournant toujours vrai ou d'un droit API sur la table de rôles font échouer le précontrôle ; toutes sont annulées par rollback.

Concurrence réellement observée avec `pg_blocking_pids` : un `super_admin` admis fermé bloque la réouverture jusqu'au commit ; un writer ordinaire déjà admis bloque la fermeture ; un `super_admin` arrivé après la fermeture en attente reste en file puis passe après son commit ; l'utilisateur ordinaire est ensuite refusé. RR et SERIALIZABLE anciens refusés, timeout d'une réouverture sans changement persistant. La suite PROD.2 confirme également drainage ordinaire, fermeture provisoire, rollback/timeout, lecture des reçus sous gel et reprise idempotente après ouverture.

pgTAP se connecte comme opérateur : `SET ROLE` n'est pas une simulation de `session_user=authenticator`. Les assertions SQL distinguent donc contrat structurel/prédicat/ACL des décisions de session démontrées par les connexions réelles et HTTP. Les claims injectés dans les seuls scénarios SQL de verrouillage ne sont jamais présentés comme une preuve de signature JWT ou de MFA.

Un essai intermédiaire fermé a rencontré une assertion de test incompatible avec la garde `safeupdate`. Le gel est resté fermé. Empreintes personnelles et contrat installés relus depuis une connexion indépendante, puis réouverture explicite et vérifiée avant reprise. Les suites finales passent. Le cleanup de la suite historique PROD.2 ne rouvre plus implicitement après échec ; ses scénarios réussis rouvrent explicitement.

## Conservation du Local personnel

Comparaison avant/après des **24 relations** (23 MY. hors singleton, plus `auth.users`) par compte et empreinte de toutes les lignes, ainsi que des six séquences catalogue. Toutes identiques. Les snapshots ne stockent que comptes/empreintes, pas le contenu personnel. Les vérifications des suites gel/maintenance conservent aussi les ACL, owners et définitions de sécurité hors évolution livrée.

Le compte personnel n'a servi ni au login, ni au MFA, ni à aucune mutation de test. Sa ligne Auth, son profil, ses deux collections et toutes les informations métier sont conservés. La ligne `private.app_role_assignments`, y compris provenance/date d'attribution, est identique. Seules les identités synthétiques ont reçu/révoqué le rôle pour les tests ; elles et leurs données sont supprimées. Aucun secret publisher existant remplacé : la suite historique a vérifié son absence avant credential synthétique éphémère, puis l'a retiré.

Gel final ouvert relu indépendamment, révision `190`. Aucun reset, suppression globale de journaux ou recréation de lignes historiques. Auth peut conserver ses journaux techniques concernant les fixtures ; ces journaux gérés ne sont pas effacés globalement.

## Fichiers livrés et compatibilité

- [Migration additive](../../supabase/migrations/20261015123024_prod7b22_superadmin_freeze.sql) : décision centrale et commentaires SQL.
- [041_superadmin_freeze.test.sql](../../supabase/tests/database/041_superadmin_freeze.test.sql) : contrat d'admission, rôle, ACL et refus d'administration.
- [test-app-roles.js](../../scripts/test-app-roles.js), [superadmin-freeze-scenarios.js](../../scripts/superadmin-freeze-scenarios.js) : matrices Auth/MFA/PostgREST, métier et concurrence avec conservation.
- [database.js](../../scripts/maintenance/database.js), [local.integration.js](../../scripts/maintenance/local.integration.js) : contrat exact des dépendances du gel et injections de dérive.
- [test-business-write-freeze.js](../../scripts/test-business-write-freeze.js) : inventaire actuel des tables, retrait de la réouverture implicite du cleanup.
- README, documents 03/05/06/08/10/11/12 : contrat courant, procédure, notification, coordination des exceptions et limites de backup ; présent rapport nouveau.
- `package.json`, `package-lock.json` : PATCH `0.8.32` uniquement, dépendances inchangées.

Migration atomique, pas de migration de données ni de changement d'API ; anciens clients compatibles. Retour arrière éventuel : migration additive rétablissant le corps central précédent et adaptation du contrat opérateur, sans supprimer rôles, attributions ou données. Aucun rollback réalisé.

## Limites restantes

L'exception permanente signifie qu'un gel fermé n'interdit pas les nouvelles écritures des `super_admin` éligibles. Ils prennent toujours les verrous PROD.2. Leur coordination relève des préconditions existantes du snapshot cohérent, comme les autres writers autorisés ; aucune activation/désactivation ou réattribution supplémentaire du rôle pendant publication. `backup_authorized=false` et `global_closure=not_attested` restent conservés par l'outillage.

Aucun test navigateur nécessaire à cette modification serveur ; API/Auth/Edge Local sont réels. Campagnes backup/restauration et déploiements non relancés : aucun moteur de capture/restauration, middleware ou service hébergé modifié. Validation d'installation, identité API/SQL et parcours Cloud, frontend servi pendant fermeture et récupération Production restent non démontrés. Le warning de taille du bundle reste hors périmètre. Aucun problème bloquant observé dans le périmètre Local demandé.

Documentation fournisseur consultée via Context7 : [RLS et métadonnées](https://supabase.com/docs/guides/database/postgres/row-level-security), [fonctions et sécurité](https://supabase.com/docs/guides/database/functions), [MFA TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp). Index du changelog public consulté et CLI découvert par `--help` ; aucune consultation de projet Cloud.
