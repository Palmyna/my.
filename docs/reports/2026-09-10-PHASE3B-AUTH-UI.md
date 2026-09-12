# Phase 3B — Auth UI et routing

Réalisée le **10 septembre 2026** sur `main`, dans `Palmyna/my.`, à partir du socle 3A validé localement et dans Supabase cloud.

**Phase 3B implémentée et validée localement.** Le workflow validé utilise Supabase local uniquement pour le développement et les tests ; le cloud est réservé à la future production avec Vercel. Aucune modification Supabase cloud, migration SQL, synchronisation catalogue, déploiement Vercel ou implémentation de Phase 3C pendant cette phase. Aucun commit automatique.

## Changements et fichiers

- [AppRoutes](../../src/app/AppRoutes.tsx) : routes pilotées par `useAuth()`, chargement fermé, redirections selon email/MFA/recovery, erreur récupérable et URL inconnue. La vue `BootstrapPage` est remplacée.
- [AuthPages](../../src/features/auth/AuthPages.tsx), [AuthLayout](../../src/features/auth/AuthLayout.tsx), [utilitaires UI](../../src/features/auth/auth-ui.ts), [styles](../../src/styles.css) : formulaires accessibles, réponses génériques, erreurs sans contenu serveur sensible, double soumission bloquée, QR et clé manuelle uniquement dans l'état de l'écran.
- [État Auth](../../src/features/auth/auth-store.ts), [callbacks email](../../src/features/auth/auth-callback.ts), [provider](../../src/features/auth/AuthProvider.tsx), [service Auth](../../src/services/auth.ts) et [client Supabase](../../src/services/supabase.ts) : adaptations ciblées du socle 3A, sans second état Auth ni nouveau client.
- Poppins 400/600 auto-hébergées dans [assets/fonts](../../src/assets/fonts/), avec licence OFL ; environ 16 kB au total. Logo `src/assets/brand/my-logo.svg` inchangé. Aucune dépendance ajoutée.
- Tests services/état/provider préservés et complétés, nouveaux tests [routing/UI](../../src/app/AppRoutes.test.tsx) et [callbacks](../../src/features/auth/auth-callback.test.ts), mocks et test du bootstrap adaptés.
- [Configuration Supabase locale](../../supabase/config.toml), README et documents 01/04/05 mis à jour. SQL, types DB et pipeline catalogue inchangés.

## Routes et parcours

| Route | Rôle |
| --- | --- |
| `/` | Homepage publique minimale |
| `/signup` | Email/mot de passe, puis attente de confirmation |
| `/login` | Premier facteur email/mot de passe |
| `/auth/confirm-email` | Attente/renvoi ou succès du callback de confirmation |
| `/forgot-password` | Demande de récupération avec réponse générique |
| `/auth/mfa/enroll` | Configuration et vérification du TOTP obligatoire |
| `/auth/mfa/challenge` | Challenge du TOTP déjà vérifié |
| `/reset-password` | Nouveau mot de passe après MFA dans le parcours recovery |
| `/dashboard` | Destination protégée temporaire : succès, identifiant MY. et logout |

**Confirmation :** signup → email → callback → adresse confirmée → fin de la session technique avec `signOut({ scope: 'local' })` → « Adresse email confirmée » → login email/mot de passe → MFA. Aucun passage direct du lien vers MFA ou vers le profil. Les liens invalides, expirés ou déjà consommés donnent un état d'erreur récupérable. Un événement `INITIAL_SESSION` tardif ne doit pas effacer le succès de confirmation ; ce cas découvert en réel est corrigé et testé.

**Connexion :** sans TOTP vérifié, enrollment ; avec TOTP vérifié et `aal1`, challenge ; après `aal2`, lecture du profil et accès au dashboard. Chaque tentative crée un challenge neuf. Une configuration abandonnée peut remplacer seulement les facteurs TOTP non vérifiés, sans suppression de facteur vérifié ni récupération MFA automatisée.

**Récupération :** email générique → session technique recovery → challenge TOTP, ou enrollment si aucun facteur vérifié → `aal2` → nouveau statut `password_reset_required` → changement du mot de passe → session conservée → profil/dashboard. Le formulaire et l'action d'état sont fermés avant ce statut ; le service vérifie également email/MFA avant `updateUser`. Le profil reste absent pendant le parcours recovery. Un marqueur de navigation en `sessionStorage`, contenant uniquement le `session_id`, conserve ce parcours au rechargement sans persister de token supplémentaire. Il n'accorde aucune autorisation et disparaît au logout ou après succès.

Les callbacks implicites sont consommés explicitement par le store : `detectSessionInUrl = false`, suppression immédiate des paramètres sensibles de l'URL, validation du type et du chemin, puis API Supabase. Les événements restent différés hors du verrou Auth ; la révision, le nettoyage des listeners et la purge TanStack Query de 3A sont conservés. Les 13 policies RLS exigent toujours `aal2`. Aucune autorisation ne dépend de `user_metadata`.

## Configuration locale et séparation des environnements

- `auth.mfa.max_enrolled_factors` passe de **10 à 1** ; TOTP reste activé, Phone/SMS désactivé, confirmation email obligatoire.
- La politique locale reste à 6 caractères minimum, sans composition supplémentaire. JWT et autres paramètres préexistants inchangés.
- La [CLI 2.116.0](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/pkg/config/auth.go) n'expose pas la durée propre à `aal1` dans sa structure `sessions` : aucune clé inventée. Les **15 minutes** restent configurées côté cloud selon la validation 3A du propriétaire.
- Le frontend construit ses retours depuis l'origine courante. Ces quatre URLs exactes ont été ajoutées **uniquement à la configuration locale** :

```text
http://localhost:5173/auth/confirm-email
http://127.0.0.1:5173/auth/confirm-email
http://localhost:5173/reset-password
http://127.0.0.1:5173/reset-password
```

Les parcours de développement et de test utilisent les seules URL/clé publishable locales. Aucune URL `localhost` ou `127.0.0.1` ne doit être ajoutée aux Redirect URLs du cloud. Celui-ci reste la future instance de production associée à Vercel ; les réglages Email, confirmation, TOTP, maximum 1, limite `aal1` de 15 minutes et Phone/SMS désactivé déjà validés en 3A sont conservés. Aucun utilisateur cloud n'a été créé pour ces tests.

Aucune URL Vercel n'est définie. Vercel, SMTP de production et URLs de production restent réservés à la phase finale.

## Validations

| Contrôle | Résultat |
| --- | --- |
| Tests ciblés pendant le développement | Corrections validées sur services, état, callbacks et routing |
| `npm test -- --project frontend` final | **8 fichiers, 69 tests réussis** |
| `npm run build` | Réussi, TypeScript inclus ; JS principal 561,68 kB, gzip 161,91 kB |
| `npm run lint` | Réussi, zéro erreur/avertissement |
| `npm run db:test -- supabase/tests/database/007_auth_identity.test.sql` | **65 assertions réussies**, rollback des fixtures |
| `git diff --check` | Réussi |
| Navigateur local | Parcours ci-dessous réussis ; rendu desktop et inscription à 390 px sans débordement, Poppins chargée et focus clavier de 3 px |

Les tests couvrent les redirections et la restauration sans flash privé, signup/erreurs/renvoi, confirmation et déconnexion technique, credentials invalides, enrollment/challenge/erreurs, absence de secret dans le store ou le stockage, `PASSWORD_RECOVERY`, contexte recovery restauré, MFA avant reset, maintien de session après succès, logout/purge et nettoyage des listeners sous StrictMode.

Les contrôles SQL ciblés revérifient profil automatique/identifiant, refus `aal1`, droits `aal2` et maintenance. Aucun schéma n'ayant changé, ni génération de types ni suite catalogue/DB complète n'a été relancée. Aucun `db:reset` ni rechargement du catalogue.

## Validation réelle Supabase local / Mailpit

Effectuée via l'interface Vite sur `127.0.0.1:5173`, l'API locale `55321` et Mailpit `55324` :

1. Signup réel, email Mailpit et callback de confirmation. Session technique terminée, succès visible et login requis. Seconde utilisation d'un lien consommé refusée.
2. Login email/mot de passe, enrollment TOTP, QR/secret reçus, code calculé en mémoire et vérifié, accès au profil/dashboard.
3. Rechargement de la session `aal2`, logout, nouvelle connexion `aal1`, challenge TOTP puis retour au dashboard.
4. Forgot password, email Mailpit, callback recovery `aal1`, challenge requis. Rechargement du navigateur conservant le parcours recovery. MFA validée, nouveau mot de passe enregistré et session conservée avec succès affiché.
5. Sur un compte confirmé sans facteur vérifié : email recovery, enrollment imposé, vérification TOTP, reset puis session conservée et dashboard.

Trois comptes jetables et cinq emails de test ont été supprimés par une sonde locale ciblée. État final : **0 utilisateur, session, profil et préférence**, **31 904 variantes intactes** ; les **13 policies MFA** sont présentes. Aucune clé privilégiée ni donnée TOTP n'a été ajoutée au frontend, à Git ou aux logs applicatifs.

Un `.env.local` ignoré a été préparé avec uniquement l'URL et la clé publishable **locales**. Vite et Supabase local ont été arrêtés après validation, avec conservation du volume. Pour reprendre : `npm run supabase:start`, puis `npm run dev`.

## Points restants

La validation de développement reste locale ; les Site URL et Redirect URLs de production seront configurées lors de la mise en production, sans retours localhost dans le cloud. La limite `aal1` de 15 minutes n'est pas reproduite par cette version de la configuration CLI locale. Les limites de révocation des JWT et la récupération MFA administrative documentées en 3A restent applicables.

Aucun blocage local connu à la clôture de 3B. La Phase 3C, réalisée ensuite, est décrite dans son [rapport de clôture](2026-09-12-PHASE3C-SHELL.md) ; les interfaces métier restent hors périmètre de ces phases.
