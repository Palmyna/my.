# Phase 4D.3 — Checkpoint Supabase Cloud

## Date, périmètre et état initial

Exécution réelle le **19 septembre 2026**. Le nom de fichier daté du 15 septembre est conservé conformément à la demande.

- Dépôt `Palmyna/my.`, branche `dev`, arbre de travail initialement propre.
- HEAD attendu et constaté : `8a5db07 — delete header page name`.
- Lecture des références produit, UX, architecture et SQL, ainsi que des rapports [4B.2](2026-09-13-PHASE4B2-ACCOUNT-AUTH.md), [4B.3](2026-09-14-PHASE4B3-ACCOUNT-DELETION.md), [4C](2026-09-14-PHASE4C-PROFILE.md), [4D.1](2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) et [4D.2](2026-09-15-PHASE4D2-ACCOUNT-DELETION-UX.md).
- Inspection du service/store Auth, du Profil, d'AccountDeletion, de la fonction de suppression, de sa migration et des tests concernés.
- Aucun commit, push, travail Phase 5, déploiement ou changement de configuration Cloud.

## Projet et prérequis

Le projet ciblé est exactement **`xvtiwhxvtfxvvokquttu`**, nommé **MY.**, région `eu-west-1`, état `ACTIVE_HEALTHY`. Concordance vérifiée entre les métadonnées distantes, le lien CLI et les clés chargées uniquement en mémoire, avant la création des fixtures.

Constats distants en lecture seule :

- huit migrations présentes, dont `20260914102414_phase4b3_account_deletion` ;
- Edge Function `delete-account` active, version 1, `verify_jwt = false` ;
- trigger `auth_user_deleting_account` présent ;
- 13 policies restrictives `require_my_profile` présentes.

Les réglages suivants sont déclarés déjà appliqués par le propriétaire : Email activé, Secure Email Change activé, Secure Password Change désactivé, Require current password when updating activé, minimum de 6 caractères, aucune composition supplémentaire. Ils ne sont pas modifiés. Les tests ci-dessous vérifient les effets nécessaires du réglage de mot de passe et de la MFA ; ils ne constituent pas un nouvel audit exhaustif des paramètres du Dashboard ni du changement d'email.

La connexion CLI a été effectuée par le propriétaire. `NODE_USE_SYSTEM_CA=1` a permis l'accès avec les certificats système, sans désactiver la vérification TLS. Aucune clé n'est affichée ou persistée.

## Méthode et protection des données

Les helpers TOTP, création de fixture, conservation des données et contrôle des JWT des scripts [4B.2](../../scripts/test-account-auth.js) et [4B.3](../../scripts/test-account-deletion.js) ont servi de base. Leurs gardes locales restent intactes. Un script temporaire ignoré sous `.cache/phase4d3/`, sans nouvelle dépendance, charge les vrais [service Auth](../../src/services/auth.ts) et [store Auth](../../src/features/auth/auth-store.ts) via Vite SSR.

Chaque compte utilise une adresse synthétique unique, un mot de passe aléatoire, un profil créé par le trigger Auth et un facteur TOTP temporaire. Les accès administrateur sont limités à ces fixtures. Identifiants de connexion, clés, tokens et secrets TOTP restent en mémoire, sans journal ni fichier de credentials. Les sorties ne contiennent que des assertions, codes d'erreur et résultats non sensibles.

Chaque fixture possède un profil, des préférences, une collection libre, un élément de collection et un exemplaire physique avec note/gradation synthétiques. La Variante référencée est seulement lue dans le catalogue. Aucun utilisateur réel, aucune donnée catalogue ni configuration ne sont modifiés. Les empreintes des lignes de 13 tables publiques et de 3 tables privées du pipeline sont relevées avant/après ; les agrégats seuls sortent de la base.

Le `finally` relit l'identité synthétique par Auth Admin avant nettoyage, accepte une suppression déjà effectuée et vérifie l'absence des données propres. Une réponse destructive ambiguë impose d'abord cette lecture d'état, sans retry destructif automatique.

## Changement volontaire du mot de passe

Sur une session ordinaire confirmée, facteur TOTP vérifié et `aal2` réel :

| Cas | Réponse et état Auth vérifiés |
|---|---|
| `current_password` absent | HTTP 400, `current_password_required` ; ancien mot de passe encore accepté par une connexion distincte de contrôle |
| `current_password` incorrect | HTTP 400, **`current_password_invalid`** ; ancien mot de passe encore accepté |
| `current_password` correct | Vrai `changePassword(currentPassword, newPassword)` réussi ; nouveau mot de passe accepté et ancien refusé avec `invalid_credentials` |

La trace réseau du service montre un seul `PUT /auth/v1/user`, avec `password` et `current_password`, sans login de vérification, challenge/verify TOTP supplémentaire, nonce ou autre opération Auth parallèle. Le SDK ajoute ses deux champs PKCE nuls ; ils ne constituent pas un autre mécanisme. Les connexions servant à vérifier les mots de passe sont séparées de l'appel MY. et leurs sessions sont fermées localement.

## Ajustements du contrôle et correction minimale

Les premières exécutions du script temporaire se sont arrêtées sur des assertions de contrôle trop strictes : nom du code de refus (`current_password_invalid` observé au lieu de `current_password_mismatch`), champs PKCE nuls ajoutés par le SDK, puis hypothèse sur le nom interne de la méthode AMR recovery. Ces arrêts ne sont pas des acceptations de mot de passe incorrect ni des échecs serveur de mutation. Chaque fixture concernée a été nettoyée avant la suite ; les cas volontaires complètement validés ne sont ensuite pas rejoués.

Le code Cloud observé démontre un petit défaut local de traduction : [auth-ui.ts](../../src/features/auth/auth-ui.ts) ne reconnaissait pas `current_password_invalid` et affichait l'erreur générique. Une seule branche est ajoutée vers le message existant `Le mot de passe actuel est incorrect.`, en conservant `current_password_mismatch`. Deux cas de régression couvrent propagation/traduction et affichage avec nouvel essai dans Profil. Aucun contrat, contrôle d'accès ou backend n'est changé. La publication de cette correction frontend nécessitera un déploiement manuel ; aucun déploiement n'est effectué ici.

## Validations locales finales

Après la correction minimale :

```sh
npm test -- --project frontend src/features/profile/ProfilePage.test.tsx src/features/profile/AccountDeletion.test.tsx src/services/auth.test.ts src/services/account-deletion.test.ts src/features/auth/auth-store.test.ts src/features/auth/AuthProvider.test.tsx src/app/AppRoutes.test.tsx src/app/App.test.tsx
npm run lint
npm run build
```

- **209 tests réussis, 8 fichiers, code de sortie 0**.
- Lint : réussi, aucune erreur ni warning, code de sortie 0.
- Build et typecheck : réussis, 278 modules, code de sortie 0. Bundle JS 645,94 kB (185,77 kB gzip) ; avertissement Vite de chunk supérieur à 500 kB, sans optimisation hors périmètre.
- Le premier passage avant correction comptait 207 tests réussis. La reprise des validations est justifiée par les deux nouveaux cas et l'ajout de traduction.
- Le header reste sans nom de page. `useLocation()` sert toujours à la clé du menu utilisateur ; aucun nettoyage n'est nécessaire.
- Aucun changement de composant ou de mise en page : aucune nouvelle campagne visuelle multi-breakpoints. Les tests Profil couvrent le message corrigé.

## Recovery et MFA

Un lien recovery est généré par l'[API Auth Admin officielle](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), uniquement pour la fixture. Son token est consommé par `verifyOtp({ type: 'recovery', token_hash })`, sans envoi ni lecture d'un vrai email et sans modification des URLs Cloud. Une session valide et l'événement `PASSWORD_RECOVERY` sont obtenus.

Le vrai store MY. reçoit cette session par son callback recovery et passe à `mfa_challenge_required`, avec `passwordRecovery = true` et une session réelle `aal1`. Un appel à `updatePassword` avant MFA est refusé par le service sans requête de mutation. Après challenge/verify normal du facteur TOTP, le JWT et l'API d'assurance Auth attestent `aal2` ; le store passe à `password_reset_required`.

`store.actions.updatePassword(newPassword)` appelle le vrai service `updatePassword(newPassword)` avec uniquement `password` (hors champs PKCE nuls ajoutés par le SDK). Aucun ancien mot de passe, nonce ou login parallèle. Le store revient à `authorized`, conserve la session, termine le contexte recovery et signale le changement réussi. Une nouvelle connexion accepte le nouveau mot de passe et refuse l'ancien. **Recovery validé sans ancien mot de passe.**

Les sessions ordinaires, recovery après MFA et suppression atteignent toutes réellement `aal2`, par enrollment puis challenge/verify Supabase, sans simulation frontend. Le code TOTP de suppression valide provient d'une nouvelle fenêtre temporelle.

## Suppression Cloud

Sur une nouvelle session ordinaire `aal2` de la fixture, chaque appel utilise exactement `currentPassword`, `totpCode`, `confirmConsequences: true`, `confirmDeletion: true`. Le JWT est transmis dans l'en-tête d'autorisation ; aucun UUID, email, facteur, challenge ou rôle n'est ajouté au corps.

| Cas | Résultat Cloud | Conservation vérifiée |
|---|---|---|
| Mauvais mot de passe, TOTP valide | HTTP 403, `password_verification_failed` | Utilisateur Auth présent ; profil, préférences, collection, élément et exemplaire identiques au snapshot initial |
| Bon mot de passe, mauvais TOTP | HTTP 403, `totp_verification_failed` | Même conservation du compte et des cinq catégories de données |
| Bon mot de passe, TOTP frais, deux confirmations | HTTP 200, exactement `{ "deleted": true }` | Suppression réelle observée via Auth Admin et les données propres |

Après succès :

- utilisateur Auth absent ; profil, préférences, collection, élément et exemplaire absents ;
- connexion avec le dernier mot de passe refusée (`invalid_credentials`) ;
- ancien access token refusé par `getUser` ; ancien refresh token refusé ;
- ancien JWT conservé uniquement en mémoire et envoyé directement à PostgREST : HTTP 200 avec tableau vide pour chacune des 13 tables protégées par `require_my_profile` (`pokemon`, `tcg_series`, `tcg_sets`, `source_cards`, `catalog_variants`, `card_pokemon`, `automatic_target_states`, `profiles`, `collections`, `collection_items`, `physical_copies`, `collection_shares`, `user_preferences`).

Le JWT ne récupère donc plus de données, même si sa signature n'est pas encore expirée. La matrice locale d'atomicité, d'écritures, de concurrence et de partages entre plusieurs utilisateurs n'est pas recréée sur Cloud ; ses preuves restent dans le rapport 4B.3. Le dernier passage recovery/suppression termine avec **43 assertions réussies, 0 échec** ; les cas du changement volontaire ont déjà réussi lors du passage précédent.

## Nettoyage et préservation

**Quatre comptes synthétiques au total**, créés successivement et nettoyés après chaque passage. Les trois premiers sont retirés par le `finally` après arrêt du contrôle ; le dernier disparaît par la suppression réelle, puis le `finally` confirme son absence. Aucun compte test orphelin.

Une lecture SQL finale indépendante confirme le retour exact aux agrégats initiaux : **0 utilisateur Auth, 0 session, 0 facteur MFA, 0 challenge MFA, 0 identité**. Les six tables applicatives utilisateur sont vides comme avant les essais. Les journaux techniques gérés par Supabase ne sont pas purgés ; ils ne sont ni utilisés comme stockage de credentials par le script ni assimilés à des comptes/sessions applicatifs.

Les volumes **et empreintes du contenu complet** sont identiques avant/après pour les 13 tables publiques et les 3 tables privées du pipeline. En particulier : 31 904 variantes, 19 907 cartes source, 1 025 Pokémon, 188 sets, 18 séries, 16 820 associations carte/Pokémon et 1 213 états de cible ; les 8 runs, 4 overrides et 4 clés d'entités du pipeline sont également inchangés. Aucune donnée réelle touchée.

Les scripts temporaires de préflight, de checkpoint, de mise à jour documentaire et de vérification des liens sont retirés. Aucun secret, token ou credential de fixture n'a été écrit dans le dépôt ou ce rapport.

## Clôture documentaire

README, fonctionnalités, UX, architecture, base de données et roadmap sont alignés sur les résultats observés. Les rapports historiques restent inchangés. La roadmap conserve son niveau macro et marque **Phase 4 — TERMINÉE** ; **Phase 5 — Dashboard, création et gestion des collections** est la prochaine phase, non commencée.

`git diff --check` réussit (code de sortie 0). **52 liens locaux vérifiés dans les ajouts/modifications des 7 fichiers Markdown**, cibles et ancres valides, aucune erreur. Les seuls changements de code sont la traduction de `current_password_invalid` et ses deux cas de test. Aucun header, service/store Auth, composant de suppression, migration, Edge Function, type généré, dépendance ou configuration n'est modifié.

**Phase 4 clôturée.** Aucun réglage Auth, secret, schéma, RLS, SMTP, URL ou déploiement Cloud n'a été effectué. La correction locale du message d'erreur devra être publiée manuellement avec le frontend ; aucun redéploiement backend n'est requis. Aucun commit ni push.
