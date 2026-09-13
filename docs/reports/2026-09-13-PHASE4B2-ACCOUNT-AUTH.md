# Phase 4B.2 — Auth du compte : email livré, mot de passe bloqué localement

## Décision et résultat

Travail local sur le dépôt initialement propre au commit `f3d6f8d` (`phase 4B.1 start`). La décision finale V1 remplace l'ancienne vérification fraîche commune aux trois actions :

- accès MY. inchangé : email confirmé, facteur TOTP vérifié, session `aal2` et policies MFA/RLS existantes ;
- mot de passe volontaire : `aal2` + mot de passe actuel exigé et vérifié par Supabase Auth ;
- email : `aal2` + Secure Email Change + confirmation de l'ancienne **et** de la nouvelle adresse ;
- suppression future : confirmations explicites, mot de passe actuel, TOTP frais et opération serveur privilégiée contrôlée par MY.

Le [rapport 4B.1](2026-09-13-PHASE4B1-REAUTH.md) est conservé **sans modification**. Son blocage décrivait l'ancien contrat, désormais remplacé : la Phase 4 est en cours, sans blocage global. Aucun nouveau TOTP, nonce email supplémentaire, `freshAuth`, durée de fraîcheur, claim MY., table ou RPC de preuve n'est ajouté pour email/mot de passe.

**Livré :** service de demande de changement d'email, propagation de l'attente Auth, callback partiel/final et tests. **Non livré :** opération volontaire de changement du mot de passe, car le lancement local versionné n'active pas son exigence serveur. La sous-phase est donc partiellement réalisée ; les deux refus serveur requis ne sont pas validés.

## Email et callback

`requestEmailChange(email, emailRedirectTo)` prolonge le service Auth et les actions du store existant. L'action exige `authorized` ; le service vérifie la session avec Auth, l'email confirmé et le TOTP vérifié avec `aal2`, puis utilise `auth.updateUser({ email }, { emailRedirectTo })`. Aucun autre client applicatif n'est créé. L'événement `USER_UPDATED` relit `user.email` et `user.new_email` ; aucune mise à jour optimiste de l'email courant ni écriture dans `profiles`.

La route publique `/auth/confirm-email-change` réutilise le lecteur/store des callbacks existants, avec un résultat distinct de la confirmation d'inscription :

| État constaté | Réponse Auth et traitement MY. |
|---|---|
| Demande acceptée | Email courant inchangé ; `new_email` contient l'adresse demandée ; deux emails distincts sont envoyés |
| Ancienne adresse confirmée seule | Changement toujours en attente ; aucun token de session dans le retour |
| Nouvelle adresse confirmée seule | Même attente ; aucun token de session dans le retour |
| Deux adresses confirmées | Email courant remplacé, `new_email` vide ; callback `type=email_change` avec session technique |

Le premier retour contient un fragment `message` : MY. affiche seulement une invitation à terminer les deux confirmations. Ce résultat de navigation en mémoire ne prouve pas une mutation et ne crée pas de session. Le second utilise `setSession`, relit l'utilisateur Auth, vérifie l'absence de demande en attente, puis termine uniquement la session technique avec `signOut({ scope: 'local' })`. Le résultat `Adresse email modifiée` propose une connexion avec la nouvelle adresse, suivie de la MFA normale. Le SDK reste propriétaire des tokens. Les paramètres sensibles sont retirés de l'URL avant le traitement ; les textes serveur ne sont pas affichés directement.

Si l'ancienne boîte est inaccessible, le parcours autonome ne peut pas aboutir. La V1 prévoit une future procédure manuelle de récupération/support après vérification d'identité, avec contact restant à définir. Aucun bypass automatique, désactivation de Secure Email Change ou endpoint admin frontend n'est ajouté.

## Réglages vérifiés et blocage du mot de passe

Versions : `@supabase/supabase-js` / `@supabase/auth-js` **2.115.0**, CLI **2.116.0**, Auth **v2.196.0**, cette dernière relue sur `/auth/v1/health` local. Références officielles : [sécurité des mots de passe](https://supabase.com/docs/guides/auth/password-security), [configuration Auth versionnée](https://github.com/supabase/auth/blob/v2.196.0/internal/conf/configuration.go), [handler utilisateur](https://github.com/supabase/auth/blob/v2.196.0/internal/api/user.go) et [vérification des emails](https://github.com/supabase/auth/blob/v2.196.0/internal/api/verify.go).

Le réglage serveur recherché est **`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true`**. Auth sait l'utiliser pour vérifier le champ SDK/API `current_password`, avec exception pour les sessions recovery. Il est distinct du nonce de `Secure password change`.

La CLI 2.116.0 n'expose pas l'option dans son [schéma email TypeScript](https://github.com/supabase/cli/blob/v2.116.0/packages/config/src/auth/email.ts), ni dans son [schéma Go](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/pkg/config/auth.go). Son [constructeur d'environnement Auth](https://github.com/supabase/cli/blob/v2.116.0/apps/cli/src/legacy/commands/start/services/gotrue.service.ts) transmet le réglage du nonce, mais pas celui du mot de passe actuel. La lecture filtrée du conteneur confirme :

| Réglage local | Valeur effective |
|---|---|
| `auth.email.double_confirm_changes` | `true` → `GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true` |
| `auth.email.secure_password_change` | `false` → `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=false` |
| `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD` | Absent de l'environnement produit par le lancement CLI |

La configuration versionnée ajoute seulement les deux retours locaux `http://localhost:5173/auth/confirm-email-change` et `http://127.0.0.1:5173/auth/confirm-email-change`, plus un commentaire expliquant la limite du réglage mot de passe. Aucune clé TOML inventée, mise à niveau de dépendance, modification de binaire ou configuration Docker parallèle n'est introduite.

**Contre-exemple direct :** sur une session ordinaire `aal2` obtenue par mot de passe puis TOTP, `PUT /auth/v1/user` renvoie HTTP 200 sans `current_password` ; une requête avec une valeur incorrecte renvoie également HTTP 200. Les deux mots de passe de fixture sont effectivement modifiés. Ces résultats échouent au contrat demandé. Un succès avec une valeur correcte dans cette configuration ne prouve pas que celle-ci est vérifiée.

Le blocage porte sur le lancement local utilisé, pas sur une impossibilité générale d'Auth. Un moyen reproductible d'activer ce réglage reste à définir et vérifier avant de livrer l'opération volontaire. Le recovery est conservé ; sa compatibilité avec le réglage **activé** reste à tester, sans déduire cette preuve de la seule exception présente dans le code serveur.

## Tests et nettoyage

Le script versionné [test-account-auth.js](../../scripts/test-account-auth.js), exécuté par `node scripts/test-account-auth.js` après démarrage local, utilise des comptes et une collection temporaire par compte. Il est séparé des suites frontend/catalogue et retourne un code non nul quand une protection attendue est absente. Les clients privilégiés sont uniquement dans ce test Node, jamais dans l'application.

Résultat réel : **26 assertions réussies, 2 échouées, code de sortie 1**.

- Mot de passe et email refusés en `aal1` avec facteur vérifié : HTTP 401, `insufficient_aal`.
- Session ordinaire `aal2` obtenue normalement.
- **Échecs attendus au contrat, non masqués :** absence de mot de passe actuel et valeur incorrecte acceptées HTTP 200, au lieu des refus serveur requis.
- Mutation avec mot de passe courant fourni : HTTP 200 ; ancien mot de passe ensuite refusé et nouveau accepté, sans considérer cela comme une validation du contrôle manquant.
- Deux confirmations email distinctes reçues dans Mailpit, tests **nouvelle puis ancienne** et **ancienne puis nouvelle** : aucun changement après le premier lien, changement effectif après le second.
- Même UUID, même profil et identifiant MY., même collection et mêmes données/timestamps applicatifs avant/après le changement d'email ; aucun nouveau profil.
- Callback final réel traité par le service de l'application, session technique terminée.
- Recovery réel : email reçu, session `aal1`, TOTP, mise à jour sans ancien mot de passe, même session conservée. Ce test utilise le réglage du mot de passe actuel encore désactivé.

Les comptes, facteurs, challenges, profils, collections et emails de test ont été nettoyés. Comptages initiaux et finaux identiques : **1 utilisateur Auth, 1 session, 1 facteur, 13 challenges, 1 profil, 0 collection, 0 préférence, 31 904 variantes, 7 migrations**. Aucun reset ni changement de catalogue. Les mots de passe, secrets TOTP et tokens des fixtures ne sont pas écrits dans des fichiers ou logs par la sonde ; Auth gère ses propres données. Les volumes sont conservés et Supabase local est arrêté à la fin, comme à l'arrivée.

Vérifications frontend et intégration :

- `npm test -- src/services/auth.test.ts src/features/auth/auth-store.test.ts src/features/auth/auth-callback.test.ts src/features/auth/AuthProvider.test.tsx src/app/AppRoutes.test.tsx` : **5 fichiers, 111 tests réussis**. Les nouveaux scénarios couvrent refus avant autorisation, attente Auth, absence de nouveau TOTP, callbacks distincts et nettoyés, absence d'accès par le message partiel, remontage et événements tardifs. Les parcours signup/recovery/MFA existants restent couverts.
- `npm run lint` : réussi, zéro avertissement.
- `npm run build`, incluant `npm run typecheck` : réussi après correction d'un accès nullable dans un test. Avertissement Vite de taille du bundle, déjà présent, conservé ; bundle principal environ 571 kB, 164 kB gzip.
- Relecture ciblée des composants avec le skill React Best Practices ; liens Markdown locaux et `git diff --check`.
- Pas de relance des suites catalogue ou des tests PostgreSQL sans modification correspondante.

## Cloud et suites nécessaires

Aucune configuration cloud n'a été modifiée ni vérifiée. Avant livraison du changement volontaire, il faudra activer et contrôler l'exigence **Require current password when changing password** décrite par la [documentation Auth](https://supabase.com/docs/guides/auth/password-security#require-current-password-when-changing-password), correspondant à `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true`. Il faudra conserver **Secure email change** activé, puis refaire les refus directs et la non-régression recovery. Le nonce `Secure password change` n'est pas requis par la décision V1.

La production n'est pas déclarée protégée sur la base des seuls réglages locaux ou de la présence de `current_password` dans le SDK. Les retours de production seront configurés à leur étape avec le domaine réel ; aucune URL locale n'est ajoutée au cloud.

Restent ouverts : activation reproductible locale du réglage mot de passe actuel, opération volontaire correspondante, contact support, puis vérification renforcée et orchestration serveur de suppression. Aucune de ces opérations restantes n'est commencée ici.

## Fichiers et périmètre

Créés : ce rapport et `scripts/test-account-auth.js`.

Modifiés : `README.md`, les références `01-FEATURES`, `03-DATA-MODEL`, `04-UX-UI`, `05-ARCHITECTURE`, `06-DATABASE`, `08-ROADMAP`, `supabase/config.toml`, `src/services/auth.ts`, `src/features/auth/auth-callback.ts`, `auth-store.ts`, `auth-ui.ts`, `AuthPages.tsx`, `src/app/AppRoutes.tsx` et les quatre tests associés (`auth.test.ts`, `auth-callback.test.ts`, `auth-store.test.ts`, `AppRoutes.test.tsx`). La roadmap reste macro, sans sous-phases.

Vérifiés mais inchangés : `AGENTS.md`, `AuthProvider`, `useAuth()`/contexte, client Supabase unique, rapports historiques dont 4B.1, schéma/RLS/migrations/types générés et dépendances. Aucun autre fichier versionné modifié. Aucune suppression de compte, page Profil finale, remplacement d'Authenticator, Phase 5, publication Vercel, migration cloud, commit ou push.
