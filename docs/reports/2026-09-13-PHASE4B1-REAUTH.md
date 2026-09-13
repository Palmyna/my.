# Phase 4B.1 — Vérification de la ré-authentification fraîche

## Résultat

**Implémentation arrêtée sur un blocage de sécurité confirmé localement.** Les primitives mot de passe puis TOTP fonctionnent, mais les endpoints natifs Auth acceptent une session `aal2` existante pour modifier le mot de passe ou demander un changement d'email, sans nouvelle vérification des deux facteurs pour chaque opération. Le socle demandé n'est donc pas livré ; aucune preuve frontend ne peut être présentée comme imposant cette protection à ces endpoints.

Le cadrage fonctionnel est conservé. La suppression du compte n'a pas été implémentée ni évaluée comme workflow métier : son futur endpoint privilégié pourrait contrôler ses propres conditions, mais ne fermerait pas les accès natifs email/mot de passe. La Phase 4 reste non livrée et la Phase 5 n'a pas commencé.

## Environnement et références

- Dépôt initial propre sur `c80bb9c` (`phase 4A`).
- SDK installé `@supabase/supabase-js` / `@supabase/auth-js` **2.115.0**, CLI **2.116.0**, version Auth **v2.196.0** relue sur `/auth/v1/health` local.
- API locale `http://127.0.0.1:55321`, pile `my-local` démarrée depuis ses volumes conservés. Aucun `db:reset`, changement de configuration ou appel cloud.
- Configuration versionnée conservée : `double_confirm_changes = true`, `secure_password_change = false`.
- Consultation du [changelog officiel](https://supabase.com/changelog), des références [JWT/AMR](https://supabase.com/docs/guides/auth/jwt-fields), [sécurité des mots de passe](https://supabase.com/docs/guides/auth/password-security), du code Auth correspondant et du SDK installé. Le changelog Markdown indisponible a été remplacé par sa page HTML.

## Capacités vérifiées

`signInWithPassword` passe exclusivement par Auth. Après succès, le SDK remplace sa session et émet `SIGNED_IN`. La sonde observe un nouveau `session_id`, `aal1` et une méthode AMR `password`. Un mauvais mot de passe renvoie `invalid_credentials` sans supprimer la session précédente. Cette opération est une nouvelle connexion ; elle n'est pas un contrôle silencieux sans effet de session. Voir le [password grant Auth](https://github.com/supabase/auth/blob/v2.196.0/internal/api/token.go).

Sur le même facteur vérifié, chaque appel `mfa.challenge` produit un nouvel identifiant. Un mauvais TOTP renvoie `mfa_verification_failed` et laisse la session `aal1`. `mfa.verify` réussie conserve le nouveau `session_id`, fournit `aal2` avec les méthodes AMR `password` et `totp`, remplace les tokens du SDK et émet `MFA_CHALLENGE_VERIFIED`. Un challenge déjà vérifié est refusé. Aucun facteur vérifié n'a été remplacé pour ces contrôles. Voir les [primitives MFA Auth](https://github.com/supabase/auth/blob/v2.196.0/internal/api/mfa.go).

Auth construit les horodatages AMR depuis les vérifications enregistrées dans la session ; un refresh observé conserve méthodes et horodatages. Ces claims signés peuvent renseigner une vérification autoritative, mais ne constituent pas une autorisation à usage unique liée à l'action MY. Leur simple décodage côté client ne suffit pas. Voir le [calcul AMR](https://github.com/supabase/auth/blob/v2.196.0/internal/models/sessions.go) et la [mise à jour des méthodes](https://github.com/supabase/auth/blob/v2.196.0/internal/models/amr.go).

## Contre-exemple natif et portée du blocage

La sonde crée un compte confirmé temporaire, se connecte et vérifie son facteur TOTP pour obtenir une session normale `aal2`. Avec **le même access token**, sans nouvel appel password grant ni MFA entre les requêtes suivantes :

1. `PUT /auth/v1/user` avec uniquement une nouvelle valeur `password` renvoie **HTTP 200**. Une connexion ultérieure avec ce mot de passe réussit : la mutation est effective.
2. `PUT /auth/v1/user` avec uniquement une nouvelle adresse `email` renvoie **HTTP 200**. L'adresse courante reste identique et `new_email` porte l'adresse demandée : la demande est acceptée, pas le changement final. Aucun lien de confirmation n'est consommé.

Le contrôle négatif avec une nouvelle session `aal1` et un facteur déjà vérifié renvoie **HTTP 401, `insufficient_aal`** pour la mutation de mot de passe. Le contrôle MFA natif fonctionne donc ; il ne porte pas sur une nouvelle preuve par opération.

Le [handler `UserUpdate` de v2.196.0](https://github.com/supabase/auth/blob/v2.196.0/internal/api/user.go) confirme l'absence d'exigence d'un TOTP frais propre à l'action. L'option `current_password` concerne le changement de mot de passe, avec exception recovery ; elle n'ajoute pas de nouveau TOTP. `Secure password change` utilise un nonce avec exemption des sessions de moins de 24 heures. Ces options ne satisfont pas ensemble le contrat MY. Les options désactivées n'ont pas été activées/testées dans cette tâche.

La sonde n'a pas vieilli artificiellement les sessions ni attendu 24 heures : elle démontre la réutilisation d'une session entre opérations sans nouvelle vérification ; la portée des contrôles temporels est établie par le code versionné. Cette conclusion concerne la version locale vérifiée, sans extrapoler la configuration de production.

Une abstraction frontend en mémoire, une durée courte ou une RPC applicative ne bloquerait pas ces appels directs. Avant reprise, il faut choisir et vérifier un contrôle Auth/serveur applicable à **tous les chemins accessibles** des actions concernées, qui préserve le recovery existant. Aucune solution de remplacement structurante n'est décidée dans cette tâche.

## Validations et nettoyage

- Sonde temporaire Node hors application, sans nouvelle dépendance : **18 assertions réussies** lors de l'exécution complète. Les clients de test conservent leurs sessions en mémoire uniquement ; la sonde n'écrit sur disque ni ne journalise les clés, mots de passe, tokens et secret TOTP de la fixture. Le calcul de codes ne sert qu'à simuler l'Authenticator de cette fixture ; Auth effectue toutes les vérifications et gère ses propres données.
- Une première invocation s'est arrêtée avant création de fixture sur le garde-fou du port local. Une première exécution réelle s'est arrêtée sur une assertion qui attendait HTTP 403 au lieu du HTTP 401 officiel ; son nettoyage a réussi. Après correction de la sonde, l'exécution complète a réussi.
- Comptes temporaires supprimés avec leurs facteurs et challenges, profils temporaires supprimés en respectant la FK, emails temporaires retirés de Mailpit. Les données préexistantes ont été conservées.
- Comptages identiques avant/après chaque exécution réelle : **1 utilisateur, 1 session, 1 facteur, 13 challenges, 1 profil, 0 préférence ; 31 904 variantes et 7 migrations**.
- `npm test -- src/services/auth.test.ts src/features/auth/auth-store.test.ts src/features/auth/AuthProvider.test.tsx` : **3 fichiers, 28 tests réussis**, incluant les garde-fous et transitions existants. Aucune relance de toute la batterie Phase 3.
- Aucun mécanisme de preuve n'étant livré, les tests de sa durée, de son invalidation et de sa persistance sont **non réalisés**, sans assimilation aux tests de session existants.
- Aucun code applicatif modifié : lint et build non relancés. Contrôles finaux : liens Markdown locaux et `git diff --check`.
- Supabase local arrêté après vérification, avec conservation des volumes, comme à l'arrivée. La sonde temporaire est retirée après usage.

## Fichiers et limites de livraison

Ce rapport est créé. `README.md`, `05-ARCHITECTURE.md`, `06-DATABASE.md` et `08-ROADMAP.md` sont synchronisés sur le constat ; la roadmap conserve uniquement le statut de la grande Phase 4, sans sous-phase.

Les règles produit, modèle et UX, les rapports historiques, le service Auth, le provider, le store, les tests versionnés, le schéma, les migrations, les types générés et les dépendances restent inchangés. Aucun formulaire métier, changement volontaire email/mot de passe, suppression de compte, UI Profil, workflow Authenticator, catalogue, déploiement cloud/Vercel, commit ou push n'est livré par cette tâche. Les mutations du compte temporaire sont exclusivement les sondes de capacité décrites ci-dessus.
