# Phase 3A — Socle Auth Supabase et identité MY.

Réalisée le **9 septembre 2026**, sur `main`, depuis le dépôt propre `Palmyna/my.` au commit `2fb3763b3cc4eaa0a9da4398ee7bc5bb974b9138`.

**Phase 3A implémentée et validée localement et dans Supabase cloud**, selon la validation cloud fournie ensuite par le propriétaire. L'implémentation initiale n'a effectué aucun déploiement Supabase/Vercel, changement de configuration cloud, reset DB, rechargement catalogue ou démarrage des Phases 3B/3C. Aucun commit automatique.

## Changements

- Service Auth email/mot de passe : signup, login, logout, restauration de session, événements, renvoi de confirmation, récupération/réinitialisation du mot de passe.
- Confirmation email obligatoire ; distinction entre attente de confirmation, absence de session et utilisateur confirmé. Une réponse signup sans session ne révèle pas si un compte existe déjà.
- Service MFA TOTP : AAL courant/prochain, liste des facteurs, enrollment avec QR/secret, challenge et vérification. Aucun OAuth, SMS, magic link de connexion, passkey, recovery code ou outil admin ajouté au frontend.
- Provider Auth et état unique accessibles par `useAuth()` : démarrage fermé, enrollment ou challenge requis, accès autorisé après email confirmé/TOTP `aal2`/profil chargé, erreurs explicites et état de récupération du mot de passe. Réponses obsolètes ignorées, écouteurs nettoyés et cache de données purgé lors des transitions.
- Création automatique transactionnelle du profil, backfill des anciens utilisateurs sans profil, réutilisation de l'identifiant SQL immuable et restriction MFA sur les 13 tables applicatives.
- Documentation des décisions V1, du contrat pour 3B et de la récupération administrative. Le statut cloud de la migration des préférences est corrigé selon l'information du propriétaire.

## Migration

Créée par la CLI standard : `supabase migration new phase3a_auth_identity`.

[20260909184529_phase3a_auth_identity.sql](../../supabase/migrations/20260909184529_phase3a_auth_identity.sql) :

- `private.create_profile_for_auth_user()` et trigger `AFTER INSERT` sur `auth.users`. `SECURITY DEFINER`, `search_path` vide, aucun appel privilégié exposé à la Data API. L'UUID provient de `NEW.id`, sans lecture des métadonnées client.
- Collision sur la seule contrainte `profiles_public_id_key` : nouvelle génération, cinq tentatives maximum ; autre erreur propagée. Un échec de profil annule le signup.
- Backfill atomique des profils manquants, sous verrou temporaire des écritures Auth, sans modifier les profils existants.
- Policy `require_mfa AS RESTRICTIVE FOR ALL TO authenticated`, `USING` et `WITH CHECK` exigeant `auth.jwt()->>'aal' = 'aal2'` sur les 13 tables `public`. Policies métier, grants, contraintes et maintenance privilégiée conservés.

Cette nouvelle migration a été appliquée au volume **local**, puis déployée et validée dans **Supabase cloud** par le propriétaire. Le cloud possède désormais les **sept migrations** listées dans le [README](../../README.md#état-du-projet). Les six migrations antérieures sont inchangées. La génération des types a été exécutée une fois ; `database.generated.ts` est identique, car aucun type public n'a changé.

## Fichiers principaux

Créés :

- [Service Auth](../../src/services/auth.ts), [état Auth](../../src/features/auth/auth-store.ts), [contexte/useAuth](../../src/features/auth/auth-context.ts) et [AuthProvider](../../src/features/auth/AuthProvider.tsx).
- Tests [service](../../src/services/auth.test.ts), [état](../../src/features/auth/auth-store.test.ts), [provider](../../src/features/auth/AuthProvider.test.tsx) et [mocks communs](../../src/test/auth-fixtures.ts).
- Tests SQL [identité/MFA](../../supabase/tests/database/007_auth_identity.test.sql) et [rejeu/backfill de migration](../../supabase/tests/database/008_auth_migration.test.sql), ainsi que la migration et ce rapport.

Modifiés : [client Supabase](../../src/services/supabase.ts) et son test, [AppProviders](../../src/app/AppProviders.tsx), [configuration locale](../../supabase/config.toml), [lanceur DB](../../scripts/test-database.js), fixtures SQL 001/002/006, `.gitignore`, `.env.example`, README et références 01/03/05/06. Dans [07-CATALOG-SYNC.md](../07-CATALOG-SYNC.md), seule la phrase de statut cloud des préférences est synchronisée.

Vérifiés sans modification : six migrations antérieures, types DB générés, `src/assets/brand/my-logo.svg`, bootstrap visuel et code/pipeline catalogue. Aucun autre fichier suivi par Git n'est modifié.

## Validations

| Contrôle | Résultat |
| --- | --- |
| pgTAP ciblé Auth/MFA | 65 assertions réussies |
| pgTAP ciblé migration/backfill | 7 assertions réussies |
| `npm run db:test` final | **8 suites, 446 assertions réussies** |
| `npm run db:lint` | Aucun avertissement ni erreur sur `public,private` |
| `supabase db advisors --local --type security --level warn --fail-on warn` | Aucun problème signalé |
| `npm run db:types` | Une génération, fichier public inchangé |
| `npm run build` | Réussi, TypeScript inclus ; bundle principal ~543 kB (~156 kB gzip), avertissement Vite >500 kB |
| `npm run lint` | Réussi, zéro erreur/avertissement ESLint |
| `npm test -- --project frontend` | **6 fichiers, 36 tests réussis**, une passe frontend globale |
| Tests Auth après corrections de lint | 25 tests ciblés réussis ; build et lint revérifiés |
| Contrôle Git et liens Markdown locaux | Réussi |

Les tests SQL vérifient notamment le format et l'immutabilité du public ID, le rejet des métadonnées client, les collisions simulées, l'atomicité d'un signup en échec, le backfill et la préservation exacte d'un profil existant. Ils opposent lectures/écritures `aal1` et `aal2`, y compris catalogue, préférences et partage, et conservent les scénarios métier existants et `service_role`. Toutes les fixtures pgTAP sont annulées par rollback. Le lanceur prépare les migrations réelles dans des fichiers ignorés pour le rejeu des tests, puis les supprime ; il accepte désormais un chemin de test ciblé.

Une sonde temporaire sur l'API **locale réelle** a aussi vérifié :

1. Signup avec session absente, profil créé par le véritable rôle Auth et refus `email_not_confirmed` avant validation.
2. Email capturé par le serveur local et lien de confirmation retournant vers `localhost:5173` ; login `aal1`, lectures profil/catalogue invisibles et insertion de préférences refusée.
3. Enrollment TOTP, QR/secret reçus, code vérifié, session `aal2`, profil lisible et préférences insérables.
4. Restauration et refresh conservant `aal2` ; logout/login revenant à `aal1` avec challenge requis.
5. Email réel de récupération donnant `aal1` ; MFA puis changement du mot de passe, sans accès prématuré au profil.
6. Suppression administrative du facteur, révocation explicite des sessions, refus du refresh, nouvelle connexion puis enrollment obligatoire, avec le même identifiant MY.

Les comptes, profils, préférences et emails de cette sonde ont été supprimés. Le contrôle final retrouve 0 utilisateur Auth, session, profil et préférence, 13 policies MFA et 7 migrations locales. Les **31 904 variantes** présentes avant migration restent présentes ; aucune synchronisation catalogue n'a été lancée. `db:reset` et `catalog:test:db` n'ont pas été exécutés. Supabase local a été arrêté en fin de tâche avec conservation du volume, comme à l'arrivée.

## Configuration locale

CLI `2.116.0`, `supabase-js` `2.115.0`, serveur Auth local `v2.196.0`.

- Signup global/email activé ; `auth.email.enable_confirmations = true`.
- `auth.mfa.totp.enroll_enabled = true` et `verify_enabled = true` ; téléphone/SMS, anonyme, OAuth et autres providers restent désactivés.
- Site URL `http://localhost:5173` ; retours autorisés vers cette URL et `http://127.0.0.1:5173`. Emails locaux capturés sur `55324`.
- Expiration JWT préexistante de 3 600 secondes, rotation des refresh tokens et autres réglages inchangés. Aucun secret ajouté aux variables frontend ou à Git.
- Sans `.env.local`, le bootstrap reste utilisable sans réseau. Avec configuration, le client restaure les sessions et traite les liens de confirmation/reset via le flux implicite Supabase de la SPA. Les chemins de retour définitifs restent le travail de 3B.

## Validation cloud

Validation fournie par le propriétaire après le push de `20260909184529_phase3a_auth_identity` ; cette mise à jour documentaire n'effectue aucune nouvelle intervention cloud :

- Migration 3A déployée et validée ; **sept migrations cloud** au total.
- Trigger Auth → profil présent et **13 policies `require_mfa`** présentes.
- Catalogue intact à **31 904 variantes**, aucun utilisateur/profil/préférence parasite et aucun nouveau problème de sécurité bloquant.
- Provider Email, inscriptions et **confirmation obligatoire de l'adresse email** activés.
- **TOTP/App Authenticator activé**, maximum de facteurs MFA fixé à **1** : un seul facteur TOTP autorisé par utilisateur en V1.
- Limitation des sessions **`aal1` activée à 15 minutes** ; **Phone/SMS MFA désactivé**. L'obligation d'accès MY. en `aal2` reste appliquée par les policies restrictives.

Les URLs de retour pour confirmation email et récupération/réinitialisation du mot de passe sont volontairement reportées à la **Phase 3B**, lorsque les routes correspondantes existeront. Le projet n'est pas encore déployé sur Vercel ; le déploiement et la configuration des URLs de production Vercel sont réservés à la **phase finale de mise en production**. Aucune URL de production n'est documentée ici.

## Limites et points restant à valider

**Écart Supabase observé :** la [référence officielle `deleteFactor`](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor) annonce une déconnexion après suppression d'un facteur vérifié. Sur Auth local `v2.196.0`, le facteur disparaît mais une session et un refresh utilisable subsistent. Le test l'a reproduit ; la [procédure opérateur](../05-ARCHITECTURE.md#récupération-mfa-administrative) impose donc une révocation administrative explicite des sessions du seul utilisateur concerné, validée localement. Le comportement cloud doit être vérifié, sans supposer qu'il correspond à cette version locale.

Les access tokens déjà émis restent potentiellement utilisables jusqu'à leur expiration après révocation ; les policies 3A contrôlent `aal` et n'ajoutent pas de contrôle de session serveur à chaque requête. Cette limite Supabase est documentée dans la procédure et doit être prise en compte par l'opérateur.

Aucune contradiction produit ne bloque 3A, validée localement et dans Supabase cloud. Les URLs des futurs écrans et la configuration réelle d'envoi email restent à réaliser dans leurs étapes prévues. L'avertissement de taille du bundle reste non bloquant ; le découpage des futures pages pourra être traité avec le routing. Phase 3 dans son ensemble n'est pas terminée ; 3B n'est pas commencée.
