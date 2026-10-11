# Phase 8G.3 — Publication sécurisée et clôture backend

11 octobre 2026 — version **0.8.16**. **Backend notifications 8G terminé et validé exclusivement sur Supabase Local.** Publication/retrait depuis le terminal, rôle PostgreSQL dédié, contenu/provenance immuables, reprises idempotentes, cinq RPC et transitions vérifiées ensemble. **8H reste à réaliser** : cloche, badge, panneau et raccordements session/contenu/aperçu/application. Aucun commit ni push.

## État réel et sources

| Contrôle | Résultat |
|---|---|
| Branche / HEAD initial et final | `dev` / `21271cf66ac62932c5e8e8850483bc11beca6802`, inchangés |
| Worktree initial | Propre, aucun changement préexistant |
| Version | Package et deux champs du lock `0.8.15` → `0.8.16` ; comparaison JSON exacte hors ces trois champs, dépendances inchangées |
| Outils | Node 24.20.0, npm 12.1.0, Supabase CLI 2.120.0 ; `pg` 8.23.0 et Zod 4.5.4 déjà installés |
| Local | API `127.0.0.1:55321`, PostgreSQL `127.0.0.1:55322`, volume conservé |
| Historique | 46/46 avant, **48/48 après**, dernier `20261011191625` |
| Données personnelles | Deux collections, 257 items, trois exemplaires, sept intentions, quatorze reçus, intégralement conservés |
| Fonctions préexistantes | **56 définitions et ACL identiques** avant/après, dont les moteurs/writers de collection et les cinq RPC 8G.2 |

Avant modification : `AGENTS.md`, [conception 8A.3 section 8.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md#83-publication-sécurisée), [8G.1](2026-10-11-PHASE8G1-NOTIFICATION-FOUNDATIONS.md), [8G.2](2026-10-11-PHASE8G2-NOTIFICATION-API.md), migrations/constraints/lecteurs/transitions, conventions du pipeline catalogue, scripts Node, dépendances et état réel Local. Sources actuelles Supabase CLI, node-postgres, Zod et PostgreSQL/psql obtenues via Context7 ; changelog Supabase consulté. Skills Supabase, lean-build, Context7 et procédure de migration/types Local appliqués. Aucun agent délégué.

## Livraison des trois jalons

| Jalon | Responsabilité acquise |
|---|---|
| **8G.1 — 0.8.14** | Trois stockages privés, contraintes/immuabilité et projection dérivée des mises à jour utiles de collection, sans diffusion massive |
| **8G.2 — 0.8.15** | Cinq RPC, prédicat commun centre/compteur/audience, contenu texte, pagination et transitions individuelles monotones ; services/décodeurs/cache stricts préparés |
| **8G.3 — 0.8.16** | Publication/retrait privés par rôle dédié, contrat terminal strict, provenance/horodatage serveur, hash normalisé/idempotence et validation globale backend |

Aucun consommateur utilisateur ajouté en 8G.3. Les contrats et comportements sûrs 8G.2 restent inchangés. Le backend fonctionne ensemble sur Local ; aucune preuve Cloud déduite de la colonne `remote` de `migration list --local`.

## Migrations additives

Créées par `supabase migration new`, relues avec un unique BEGIN/COMMIT, appliquées via `migration up --local`, puis historique Local vérifié :

1. [20261011185605 — publication](../../supabase/migrations/20261011185605_phase8g3_notification_publication.sql) : rôle, helper de préparation fermé, deux fonctions privées et ACL ciblées. Aucun DML de données métier dans la migration.
2. [20261011191625 — expiration](../../supabase/migrations/20261011191625_phase8g3_notification_expiration_validation.sql) : correction additive du seul nouveau helper 8G.3. Un décalage de fuseau à la borne d’année pouvait produire UTC 10000 ou une date BC que `to_char` rendait sans ère ; Node refusait déjà. Régression reproduite en SQL, bornes UTC 0001–9999 désormais validées avant normalisation/hash. ACL conservées ; première migration appliquée laissée intacte. Commentaire de stockage mis à jour.

Premier essai de la première migration : syntaxe CASE dans un IF corrigée **avant application réussie** ; transaction refusée sans historique/données persistés. pgTAP initial : casts explicites text ajoutés dans deux appels `to_jsonb` de test. Validation globale a ensuite révélé trois attentes historiques de schéma devenues périmées : liste exhaustive des tables privées en 001 et absence du rôle/fonction en 034. Assertions actualisées vers présence privée et ACL fermées, aucun invariant affaibli. ESLint complet a révélé l’ancienne campagne 8G.1 absente du projet TypeScript ; fichier ajouté à `tsconfig.node.json`, code inchangé. Remplacements documentaires écrits par fichiers Node UTF-8 après deux échecs de quoting/encodage PowerShell, sans corruption des documents.

Retour arrière logiciel futur : migration additive révoquant EXECUTE/LOGIN et fermeture des consommateurs, conservation du contenu historique et des états acquis. Aucune contraction, suppression de données réelles, remise à zéro ou réversion de collection exécutée.

## Rôle et droits constatés

`my_notification_publisher` : LOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, limite de quatre connexions, aucune appartenance à un rôle. Créé **sans mot de passe** ; aucun secret de connexion dans les migrations ou le dépôt.

| Surface | Droits réels |
|---|---|
| Base `postgres` Local | CONNECT |
| Schéma `private` | USAGE, aucun CREATE |
| `private.publish_notification_announcement(jsonb)` | EXECUTE à `postgres` et `my_notification_publisher` seulement |
| `private.withdraw_notification_announcement(text)` | Même ACL ciblée |
| `private.prepare_notification_publication(jsonb)` | EXECUTE à `postgres` seulement |
| Tables public/private/Auth | Aucun SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ou TRIGGER pour le publisher |
| Schéma Auth | Aucun USAGE pour le publisher |
| RPC utilisateur public | Aucun EXECUTE pour le publisher ; exactement deux fonctions métier exécutables au total |
| PUBLIC, anon, authenticated, service_role, authenticator | Aucun EXECUTE sur publication/retrait |

ACL de publication/retrait réellement lues : `{postgres=X/postgres,my_notification_publisher=X/postgres}`. ACL du helper : `{postgres=X/postgres}`. Le USAGE de `public` hérité de PUBLIC et les fonctions système ordinaires ne donnent aucun droit métier ; aucun retrait global de privilèges existants effectué.

Fonctions de publication/retrait VOLATILE `SECURITY DEFINER`, `search_path=''`, objets qualifiés, READ COMMITTED exigé. Contrôle explicite du `session_user` dédié ou du propriétaire SQL `postgres`. Autorisation PostgreSQL, aucune confiance dans un JWT ou `auth.uid()` de publication. Aucun RPC utilisateur ne les appelle. Schéma privé hors Data API ; appels PostgREST aux noms de publication/retrait répondent 404, y compris avec JWT `service_role`.

Le test réel provisionne un secret aléatoire éphémère sous forme de vérificateur SCRAM, dans la mémoire du test/son environnement enfant seulement ; mauvais secret réellement refusé (`28P01`). Les tests finissent par PASSWORD NULL. Aucun identifiant opérateur permanent fourni ou conservé. [Guide de provisionnement sécurisé](../10-NOTIFICATION-PUBLICATION.md#provisionner-les-identifiants-hors-git) : `psql -W`, `\password`, saisie interactive, gestionnaire de secrets et variable de processus hors Git. Ce test de provisionnement est réservé à Local sans identifiants opérateur déjà configurés à conserver.

## Contrat et provenance

`private.publish_notification_announcement(p_publication jsonb)` accepte exactement dix champs : `publication_key,category,title,body,app_version,action,requires_action,include_new_users,expires_at,publication_context`. Toutes les options présentes avec `null` explicite. Contexte exact : `reason` utile obligatoire et `include_new_users_justification` obligatoire si l’exception d’audience est activée, sinon NULL.

Clé ASCII 1–120, catégories announcement/changelog fermées, titre utile 1–200 sur une ligne, corps utile 1–20 000, SemVer ≤64 obligatoire pour changelog. Action NULL ou exactement `{kind:'notification_content'}`, désignant le propre contenu ; aucun ID/chemin/URL/code libre. Les lecteurs 8G.2 construisent l’action canonique avec leur UUID, sans recopier le JSON privé. Aucun lien complémentaire vers d’autres routes n’a été ajouté.

LF, Unicode NFC et trim ECMAScript communs SQL/Node ; longueurs en caractères Unicode. Expiration ISO/fuseau/microsecondes stricts, UTC 0001–9999, nouvelle insertion strictement avant expiration. Syntaxes HTML/URL/code, contrôles et champs inconnus rejetés ; **corps conservé comme texte brut**, rendu texte requis en 8H. Validation et normalisation indépendantes au serveur, sans faire confiance au hash du script.

Serveur seul attribue `published_at`, UUID et auteur `session_user`. Aucun champ de publication rétroactive accepté. Provenance = identité PostgreSQL, contexte validé, SHA-256 métier et date serveur ; aucune connexion ou donnée Auth recopiée. L’identité PostgreSQL du compte dédié est réelle ; elle ne distingue pas des personnes utilisant ce même identifiant partagé.

Empreinte SHA-256 UTF-8 du tableau JSON compact ordonné v1 : marqueur `my.notification.publication.v1`, clé, catégorie, titre/corps normalisés, version, kind d’action ou NULL, deux booléens, expiration UTC ou NULL, reason et justification. Timestamp/UUID/acteur générés exclus. Accents combinés, espaces Unicode, LF, guillemets/backslash/tabulations et microsecondes ont une empreinte identique dans SQL et Node.

**Aucune condition métier d’annonce nécessitant une action n’est définie et supportée. `requires_action=true` est donc refusé** (`22023/notification_action_unsupported`) par PostgreSQL et par le contrat Zod. Pas de condition générique, bouton « Action effectuée » ou traitement forcé. `process_announcement_notification` 8G.2 reste strictement inchangé ; les anciennes fixtures directes exigeant une action demeurent non traitables sans résolution.

## Idempotence, retrait et concurrence

Advisory transactionnel par clé, avant toute première insertion/relecture/retrait, puis snapshot/horloge frais après attente. Clés différentes indépendantes ; collision de hash advisory peut seulement sérialiser davantage. Même clé et contenu normalisé → même UUID/date/résultat historique `{outcome:'published',publication_key,announcement_id,published_at,content_hash}`, sans seconde publication. Contenu ou contexte différent → `23505/publication_key_conflict`, aucun écrasement.

Retry identique **après expiration ou retrait** retourne ce même résultat historique ; ne réactive rien. Vérification de l’expiration actuelle seulement pour une nouvelle insertion. Une issue de connexion incertaine impose le même fichier et la même clé ; aucune relance automatique ni clé de remplacement.

`private.withdraw_notification_announcement(p_publication_key text)` prend clé puis ligne FOR UPDATE, compatible avec SHARE des writers 8G.2. Première date serveur conservée ; retry retourne exactement le même `{outcome:'withdrawn',publication_key,announcement_id,withdrawn_at}`. Contenu/provenance et suivi lu/traité intégralement conservés. Au prochain snapshot du lecteur, retrait exclut centre/compteur/contenu ; un statement déjà ouvert conserve son snapshot. Writers ayant attendu revalident : retrait gagnant → obsolete sans suivi créé ; lecture/traitement gagnant → état acquis conservé, puis retrait.

Correction par nouvelle clé après retrait, jamais UPDATE de contenu historique. Clé inconnue au retrait → `P0002/notification_publication_not_found`. Aucun tombstone ou remplacement silencieux.

## Script terminal et documentation

[`scripts/notifications/publish.ts`](../../scripts/notifications/publish.ts) et [contrat](../../scripts/notifications/contract.ts), `pg`/Zod existants, aucune dépendance ajoutée. Scalaires date/SemVer/microsecondes extraits dans [`notification-scalars.ts`](../../src/lib/notification-scalars.ts), réutilisés par le décodeur 8G.2 avec comportement identique.

```powershell
node scripts/notifications/publish.ts --file annonce.json --validate
node scripts/notifications/publish.ts --file annonce.json --apply --environment local
node scripts/notifications/publish.ts --withdraw cle-publication --environment local
```

Validation hors connexion : fichier JSON ≤1 Mo, schéma strict, normalisation/hash et synthèse des longueurs/catégorie/version/action/audience/expiration. Aucune connexion ou écriture. Publication/retrait : environnement explicite, `MY_NOTIFICATION_DATABASE_URL` hors Git, boucle locale/port/base fixes sans paramètres URL, identité session/current user et attributs/appartenances vérifiés, seules fonctions privées autorisées, paramètres liés. Timeouts connexion 10 s/statement 15 s. Arguments incohérents/répétés, rôle incorrect et cible distante refusés. Outputs limités aux métadonnées sûres, erreurs fixes ou couples SQLSTATE/message connus ; aucune sérialisation brute des erreurs driver.

[Guide opérateur](../10-NOTIFICATION-PUBLICATION.md) : préparation, validation, provisionnement/connexion locale sans secret en commande, publication, retrait, reprise/erreurs, limites et précautions Cloud futures. [Exemple annonce](../../scripts/notifications/examples/announcement.json), [exemple changelog](../../scripts/notifications/examples/changelog.json), sans identifiant ou secret réel. Aucune annonce documentaire appliquée telle quelle : tests uniquement avec clés synthétiques générées.

Cloud **non implémenté et non utilisé** dans ce script. Futur raccordement exige autorisation distincte, réseau/identité/ACL contrôlés et TLS avec certificat/nom d’hôte vérifiés ; jamais désactivation ou `rejectUnauthorized:false`. Paramètres URL pouvant écraser la configuration TLS de `pg` à refuser ou contrôler strictement.

## Preuves exécutées sur état final

| Vérification | Résultat |
|---|---|
| Suite pgTAP complète | **38 fichiers / 3 790 assertions PASS**, dont 68 nouvelles publication ; parité canonique globale 1 213 cibles, zéro divergence |
| Suite frontend/services/outils complète | **74 fichiers PASS, 5 conditionnels Local ignorés ; 2 349 tests PASS, 7 ignorés** |
| Contrat/CLI ciblés | **58 tests PASS** : JSON strict, normalisation/hash, textes/actions/URL/versions/expirations malveillants, commandes invalides, sécurité connexion/logs, CLI validate réel sans connexion |
| Publication réelle + intégration 8G.2 ciblée | **Trois fichiers / 60 tests PASS**, soit les 58 contrats + **deux intégrations Local réelles** : publisher/CLI/pg/HTTP et services/SDK/PostgREST/cache |
| Parcours publication → centre → contenu → lecture → traitement → retrait | PASS avec comptes/JWT synthétiques AAL2 ; cinq RPC réelles, audience Auth anciens/nouveaux, changelog, expiration et retrait d’une annonce encore non traitée |
| Nouvelle concurrence publication/retrait | **Dix scénarios PASS**, trois connexions publisher + connexion fixture/observation, waits réels `pg_blocking_pids`, isolation fixe refusée en plus |
| Campagne transitions 8G.2 existante | **Neuf scénarios PASS**, trois connexions réelles ; [script](../../scripts/test-notification-api-concurrency.ts), refus d’isolation fixe également |
| ACL/RLS et rôle | PASS : deux seuls EXECUTE métier, attributs/memberships, connexion réelle et mauvais secret refusé, DML/Auth/catalogue/RPC/préparation/SET ROLE interdits ; refus SQL réel anon/Auth/service_role/authenticator et PostgREST privé inaccessible |
| SQL lint public/private | PASS, zéro warning/erreur après dernière migration |
| Advisors sécurité Local | **Zéro WARN/ERROR**, sept INFO `rls_enabled_no_policy` attendues sur les tables privées fermées ; contrôle répété après migration corrective |
| Types Supabase | Générés depuis Local, reproductibles, **identiques à HEAD** ; SHA-256 `8FBA623654865589F1ABB6191CC0D0F6A1DC768659A3E6EE91C3A9AB86C935A4`. Publication reste privée, aucune surface publique ajoutée |
| Typecheck/build | PASS ; avertissement Vite préexistant de bundle >500 kB conservé, hors périmètre |
| ESLint complet | PASS, zéro warning |
| Version et dépendances | Comparaison JSON package/lock PASS, seuls trois champs de version changés |
| `git diff --check` | PASS |
| Données complètes et fonctions anciennes | **23 tables identiques, 56 fonctions/ACL identiques**, comparaison détaillée ci-dessous |

Commandes principales : `npm run db:test`, `npm test -- --maxWorkers=2`, `MY_SUPABASE_LOCAL_TEST=1` avec tests notifications ciblés, `node scripts/test-notification-api-concurrency.ts`, `npm run db:lint`, `supabase db advisors --local --type security`, `npm run db:types`, `npm run build`, `npm run lint`, `git diff --check`. Toutes connexions SQL/HTTP contrôlées Local. Les tests conditionnels restants ne sont pas présentés comme exécutés ; anciennes campagnes indépendantes 8B–8F non relancées. Les deux tests Local propres aux notifications ignorés dans le passage global ont ensuite été explicitement exécutés.

Concurrence nouvelle : publication/retry même clé, autre clé indépendante pendant verrou, collision concurrente, publication/retrait, retrait/retrait, retrait/retry de publication, retrait/lecture et ordre inverse, retrait/traitement et ordre inverse. Expiration réelle puis reprise historique également vérifiées. Campagne 8G.2 : sync/ancienne lecture, versions nouvelles/anciennes, application/lecture, deux ordres lecture/traitement, retrait/lecture, retrait/traitement, publication pendant lecture au snapshot et expiration pendant attente. Aucune simulation de chevauchement présentée comme preuve réelle.

## Conservation des données et arrêt

Snapshot initial/final sur **23 tables complètes** public/private et `auth.users`, lignes ordonnées, comparaison d’égalité JSONB côté PostgreSQL, puis représentations sérialisées identiques. SHA-256 avant/après : **`8280067239f2d0758ec3378cef26515e7e3f77c75c9f8b3ca044685e584ecfae`**. Snapshots et preuves techniques dans cache Local ignoré par Git ; aucune donnée Auth détaillée publiée dans le rapport.

Deux collections personnelles conservées intégralement : parents/contrats/versions/révisions, ordre/items/masquage, trois exemplaires, notes/préférences, sept intentions et quatorze reçus. Catalogue, états cibles, profils et données Auth également identiques. Aucun parent converti/supprimé/actualisé, aucun moteur/writer modifié. Trois tables notifications vides avant/après ; aucune annonce réelle préexistante présente, aucune publication réelle destinée aux utilisateurs conservée.

Fixtures réservées existantes isolées puis nettoyées ; publications nouvelles à clés UUID propres au run, suppression uniquement de ces clés exactes par le test administratif et retrait testé auparavant. Aucun effacement global pour rétablir un compteur. Les suppressions de tests concernent uniquement leurs données synthétiques ; droits de suppression jamais accordés au publisher. Secret temporaire révoqué, aucun fichier de fixture actif résiduel.

README, Fonctionnalités, Modèle, UX, Architecture, Database et documentation catalogue synchronisés ; guide opérateur ajouté, roadmap **macro** garde Phase 8 en développement et marque 8G terminé Local. Rapports historiques conservés. Aucun navigateur utilisateur inventé pour une cloche/panneau encore absents : validation visuelle prévue en 8H.

**Arrêt à la clôture backend 8G.** Aucun début 8H, cloche/badge/panneau, branchement Collection sur lecture, email/push/notification navigateur, worker/Realtime/Cron, interface d’administration, secret frontend, reset, Cloud, Vercel, commit ou push.
