# Phase 4D.2 — UX de suppression du compte

## Périmètre et état de départ

Intervention locale sur `dev`, dépôt initialement propre au commit `6b9d8ce` (`Add voluntary password change to the profile`). Seule l'intégration frontend de suppression est ajoutée. Le backend [4B.3](2026-09-14-PHASE4B3-ACCOUNT-DELETION.md), sa migration et sa configuration restent inchangés ; les acquis [4C](2026-09-14-PHASE4C-PROFILE.md) et [4D.1](2026-09-15-PHASE4D1-PASSWORD-PROFILE.md) sont conservés.

## Parcours et présentation

L'action discrète `Supprimer mon compte` se situe tout en bas de `/profile`, après **Sécurité du compte** et l'information Authenticator. Aucun bloc « Zone dangereuse » ni nouvelle dépendance.

Le composant [AccountDeletion](../../src/features/profile/AccountDeletion.tsx) ouvre un `<dialog>` natif en trois étapes :

1. **Conséquences** : suppression définitive du compte, profil, préférences, collections possédées, éléments, partages sortants, accès reçus, exemplaires physiques, état, notes et gradation. Les destinataires perdent leurs accès ; catalogue Pokémon MY. et données d'autrui sont conservés. La case obligatoire active `Continuer`.
2. **Identité** : mot de passe actuel, `type=password`, `autocomplete=current-password`, requis ; code Authenticator texte, clavier numérique, six chiffres, longueur maximale six, collage possible. Ce sont des saisies : aucun contrôle d'identité serveur n'est prétendu à cette étape.
3. **Confirmation finale** : bouton distinct `Supprimer définitivement mon compte`. Aucun texte `SUPPRIMER` à recopier. Un code expiré ramène à la saisie pour un nouvel essai explicite.

Titre/description accessibles, focus initial, focus sur le champ en erreur, fond inerte natif et bouclage explicite de Tab/Maj+Tab, restauration au bouton source, Échap et fermeture hors modal avant envoi. Corps de page immobilisé, scroll interne de la modal, boutons tactiles d'au moins 50 px. Le rouge reste limité à l'action principale et au focus ; Retour/Annuler sont secondaires.

Pendant l'appel final : verrou synchrone contre les doubles soumissions, fieldset désactivé, statut de progression, fermeture/Échap/fond bloqués. Le data router React Router remplace le `BrowserRouter` dans `App`, initialisé une seule fois hors React pour éviter les doublons StrictMode, pour autoriser `useBlocker` sans modifier les routes. Navigation SPA et retour historique sont bloqués ; `beforeunload` demande la protection native avant fermeture/rechargement. Un utilisateur peut toujours forcer la fermeture du navigateur ; aucun succès n'est déduit d'une interruption.

## Contrat et frontière de sécurité

`Profile → useAuth().actions.deleteAccount → service Auth → invokeAccountDeletion → client Supabase existant`.

L'unique appel destructif, déclenché seulement à l'étape finale, est `functions.invoke('delete-account')`. Le SDK transmet la session existante ; le corps contient exactement :

```ts
{
  currentPassword,
  totpCode,
  confirmConsequences: true,
  confirmDeletion: true,
}
```

Aucun UUID, email, facteur, challenge, JWT de ré-authentification ou preuve n'est envoyé dans ce corps. Aucun `signInWithPassword`, `mfa.challenge` ou `mfa.verify` n'est ajouté au frontend de suppression. Les guards frontend vérifient l'état autorisé, la session, l'identité Auth, l'email confirmé, `aal2` et un seul TOTP vérifié ; le handler 4B.3 reste autoritaire et refait toutes les vérifications.

Mot de passe et code restent dans l'état local de la modal, jamais dans le store Auth, TanStack Query, les URLs ou un stockage durable. Fermeture/succès les effacent ; un refus de mot de passe vide ce champ, les reprises TOTP vident le code. Le service limite l'appel à 60 secondes, sans relance automatique. Les erreurs SDK/HTTP sont réduites à des codes connus, sans message brut, cause sensible ou journalisation.

## Erreurs et reprise

| Code / situation | Traitement UX |
|---|---|
| `authentication_required` | Session expirée, retour à la connexion |
| `authorized_account_required` | Email confirmé et vérification Authenticator requis, reconnexion |
| `verified_totp_required` | Authenticator vérifié requis, reconnexion/contact administratif |
| `password_required`, `password_verification_failed` | Retour identité, message et focus mot de passe |
| `totp_required`, `totp_challenge_failed`, `totp_verification_failed` | Retour identité, message et focus code récent |
| `identity_mismatch` | Identité non confirmée, reconnexion |
| `consequences_confirmation_required` | Retour aux conséquences, case décochée |
| `final_confirmation_required` | Nouvelle confirmation explicite, aucune relance automatique |
| `session_revocation_failed` | Compte non supprimé, révocation échouée, reconnexion nécessaire |
| `deletion_failed` | Compte non supprimé, sessions révoquées, reconnexion nécessaire |
| `service_unavailable` | Indisponibilité temporaire, attendre puis ressaisir un code récent |
| HTTP 429 | Trop de tentatives, attendre avant un nouvel essai |
| Réseau, timeout, réponse inconnue/illisible ou sans `deleted: true` | **Résultat incertain**, suppression peut-être effectuée ; reconnexion pour vérifier l'état avant toute nouvelle tentative |

Les refus gardent la modal ouverte. Une erreur d'identité conserve les conséquences acceptées. Un résultat incertain n'affirme ni succès ni conservation du compte et n'offre pas un nouveau bouton destructif immédiat. Le retour à la connexion utilise la purge Auth/cache existante puis le nettoyage SDK local.

## Succès et cycle Auth/cache

Seul `{ deleted: true }` constitue une confirmation. Le store invalide immédiatement ses résolutions en vol, appelle son `clearData` existant (`queryClient.clear()`, requêtes et mutations), vide session/utilisateur/profil/MFA et contexte recovery, puis publie `signed_out` avec un indicateur de résultat sans secret. Le guard quitte le shell authentifié pour `/` et affiche `Votre compte a été définitivement supprimé.`

Le nettoyage `auth.signOut({ scope: 'local' })` est secondaire : un rejet ou une réponse d'erreur ne rétrograde jamais le succès confirmé. Les événements/restaurations tardifs du compte supprimé ne rouvrent pas le Profil. Aucun `localStorage.clear()`, `sessionStorage.clear()`, effacement manuel des clés Supabase ou second cache/logout n'est ajouté.

Les événements Auth pendant l'envoi sont différés, afin qu'une révocation ne démonte pas la modal inerte avant son résultat. Après refus, la fermeture reprend l'événement différé ; une nouvelle tentative revalide Auth. Un autre compte connecté pendant l'appel est repris sans le déconnecter à la réception de la réponse tardive du compte précédent.

## Validations

Commande finale des suites affectées :

```sh
npm test -- --project frontend src/features/profile/ProfilePage.test.tsx src/features/profile/AccountDeletion.test.tsx src/services/auth.test.ts src/services/account-deletion.test.ts src/features/auth/auth-store.test.ts src/features/auth/AuthProvider.test.tsx src/app/AppRoutes.test.tsx src/app/App.test.tsx
```

| Vérification | Résultat |
|---|---|
| Commande ci-dessus | **207/207 tests, 8 fichiers**, sortie 0 |
| `npm run lint` | Zéro erreur et zéro avertissement, sortie 0 |
| `npm run build` | Typecheck et build réussis, 278 modules, sortie 0 |
| `git diff --check` | Aucune erreur de whitespace, sortie 0 |
| Liens Markdown des 7 documents modifiés/créés | **152 liens locaux et leurs ancres vérifiés, zéro lien cassé** |
| `node .cache/phase4d2/verify.mjs` | Cinq largeurs, parcours et console : réussi |
| `node .cache/phase4d2/details.mjs` | Clavier, presse-papiers, retour navigateur, interactions et scroll : réussi |

Bundle principal final : **646,12 kB / 185,84 kB gzip**. L'avertissement Vite préexistant de dépassement des 500 kB reste présent ; le data router et le parcours ajoutent du code. Aucun chantier de découpage de bundle hors périmètre.

Les passes intermédiaires ont servi à corriger les typages/lint, le focus cyclique natif Edge et le focus de progression après désactivation des contrôles. Le routeur est finalement créé hors des initialisations de composants pour éviter deux instances en StrictMode. Les suites affectées ont été rejouées après ces corrections ; aucun résultat intermédiaire en échec n'est présenté comme validation finale.

Les tests ciblent le contrat exact, les gardes, l'absence de ré-auth frontend, toutes les familles d'erreurs, les trois étapes, les secrets, reprises, doubles appels, événements Auth concurrents, purge du vrai QueryClient dans AuthProvider, nettoyage SDK refusé et interdiction de retour au Profil. Les tests existants Profil/Auth/recovery/routes restent inclus. Le shim de dialog jsdom ne prétend pas tester le piège de focus natif : celui-ci est vérifié dans Edge.

### Supabase réel et fixtures

Aucun E2E destructif réel relancé : les ports locaux configurés `55321`/`55322` n'écoutent pas lors du contrôle et `docker` n'est pas accessible dans le PATH de cette session. Aucun utilisateur principal ou temporaire n'est touché, aucune fixture à nettoyer, aucun `db reset`. Les preuves transactionnelles, catalogue et second utilisateur restent celles du rapport backend 4B.3, sans nouvelle revendication de validation réelle. Aucun pgTAP ni grosse suite backend parallèle.

### Navigateur

Passe réelle locale dans **Microsoft Edge 153.0.4234.32**, piloté avec le Playwright déjà disponible, sans nouvelle dépendance (CLI agent-browser absente). L'aperçu temporaire utilise les vrais composants, routes, service et store ; seules les réponses SDK Auth/Functions sont simulées. Il ne démontre pas une suppression serveur réelle.

- Largeurs **320, 390, 768, 1024 et 1440 px**, hauteur 900 px : Profil, séparation de 24 px après Sécurité, conséquences, identité, confirmation, mot de passe incorrect, TOTP incorrect, indisponibilité, progression, succès, révocation/suppression refusée et résultat incertain.
- Aucun overflow horizontal ; modal contenue dans le viewport, fond inerte, focus initial et retour au déclencheur après Échap. Bouclage Tab/Maj+Tab vérifié en réel : le seul comportement natif d'Edge laissait temporairement le focus passer par la barre du navigateur, d'où le complément explicite livré.
- Collage réel de six chiffres via le presse-papiers ; validation native d'un code court ; nouveau code après refus. Champs et contrôles désactivés pendant l'appel, focus maintenu sur le titre, Échap/fond/navigation SPA/retour historique bloqués.
- Succès explicite même si le nettoyage SDK échoue, purge du cache et impossibilité de revenir à `/profile` ; refus/transport incertain vers la reconnexion sans nouvelle destruction automatique.
- Survol, focus clavier et état pressé desktop inspectés ; transformation pressée `0.98`, supprimée avec `prefers-reduced-motion: reduce` (transition `0s`).
- À **320 × 667** et **390 × 667**, modal à 16 px du haut, hauteur intérieure 633 px, contenus de 757/720 px : scroll interne réel et boutons accessibles dans le viewport, cibles d'au moins 50 px.
- **Zéro erreur console applicative ou de page** dans la passe finale. Le seul 404 initial venait du favicon absent du banc d'aperçu ; sa correction reste dans le fichier HTML temporaire.

Captures et mesures `visual-results.json` / `details-results.json` conservées localement dans `.cache/phase4d2/`, ignoré par Git. Inspection visuelle des captures desktop/mobile, erreurs et scroll effectuée. Serveur arrêté, navigateurs fermés et fichiers exécutables temporaires retirés après la passe finale.

## Fichiers

**Créés :**

- `src/features/profile/AccountDeletion.tsx` et `AccountDeletion.test.tsx` ;
- `src/services/account-deletion.ts` et `account-deletion.test.ts` ;
- ce rapport.

**Modifiés :**

- `src/features/profile/ProfilePage.tsx` et `ProfilePage.test.tsx` ;
- `src/features/auth/auth-store.ts`, `auth-store.test.ts`, `AuthPages.tsx` ;
- `src/services/auth.ts`, `src/test/auth-fixtures.ts`, `src/styles.css` ;
- `src/app/App.tsx`, `App.test.tsx`, `AppProviders.tsx`, `AppRoutes.tsx` ;
- `README.md`, `docs/01-FEATURES.md`, `docs/04-UX-UI.md`, `docs/05-ARCHITECTURE.md`, `docs/06-DATABASE.md`, `docs/08-ROADMAP.md`.

**Vérifiés mais inchangés :** `AGENTS.md`, identité/email/password 4D.1 (hors insertion de l'action et attente du test de périmètre), AuthProvider/contexte/callback/recovery, tests AuthProvider/routes/service Auth existants, client Supabase unique, backend `delete-account`/tests, schéma/migrations/RLS/types générés/configuration, rapports historiques, dépendances. Aucun autre fichier versionné modifié. Les sondes et captures temporaires de navigateur sont sous `.cache/phase4d2/`, ignoré par Git.

## Reste exact

**Phase 4 toujours en cours. Il reste uniquement 4D.3 — checkpoint Cloud final** : validation ciblée des protections serveur restantes, notamment refus du changement volontaire sans mot de passe actuel et avec une valeur incorrecte, succès avec une valeur correcte, guards, non-régression recovery et contrôles de clôture des parcours du compte. La limitation locale du mot de passe actuel documentée en 4D.1 reste inchangée. Aucun résultat Cloud n'est revendiqué.

Aucun Cloud, secret, migration, réglage Auth, déploiement, Phase 5, remplacement Authenticator, commit ou push.
