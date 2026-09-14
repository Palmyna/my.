# Phase 4C — Page Profil

## Résultat et périmètre

`/profile` est construite dans le shell authentifié existant. Le dépôt était propre sur `dev`, commit `70a7b93` (`Document the Git workflow and future Vercel deployment`), après `22ffe35` (`phase 4B.3`). Les règles réelles d'`AGENTS.md` et les références produit, modèle, UX, architecture, base, roadmap et rapports 4B.2/4B.3 ont été relues avant modification.

La page contient trois sections :

- **Identité MY.** : date d'inscription française et identifiant permanent dans un champ multiligne en lecture seule ; bouton de copie à droite, avec icône de deux pages et nom accessible.
- **Adresse email** : adresse courante, demande Auth déjà en attente si présente, formulaire de nouvelle adresse et retours locaux de soumission/erreur.
- **Authenticator** : statut réel et information générique invitant à contacter MY. pour un remplacement.

Poppins, palette sombre/rouge/blanc, boutons et styles Auth sont réutilisés. Aucun nouveau design system, bibliothèque ou système global de notifications. Le `h1` unique conserve le focus géré par `AppRoutes`. Les actions restent accessibles au clavier et tactiles ; email et identifiant peuvent revenir à la ligne.

## Sources de données et états

Toutes les données passent par `useAuth()` et l'état Auth existant, sans second client ni état persistant parallèle.

| Affichage | Source |
|---|---|
| Adresse actuelle | `user.email` |
| Nouvelle adresse demandée, non courante | `user.new_email` |
| Identifiant MY. | `profile.public_id` |
| Membre depuis | `user.created_at`, formaté avec `Intl.DateTimeFormat('fr-FR')` |
| Authenticator configuré | `mfa.verifiedFactors`, déjà dérivé des facteurs TOTP vérifiés par le service Auth |

La date technique `profile.created_at` n'est jamais utilisée pour l'inscription. Une date Auth absente/invalide, un profil absent ou un statut MFA indisponible produisent des messages explicites. Le formulaire email est inaccessible sans utilisateur autorisé et adresse courante disponible. Les gardes de routes existantes restent prioritaires pendant chargement, perte d'accès ou récupération.

La copie utilise `navigator.clipboard.writeText` avec la valeur complète et annonce son succès uniquement après résolution. Si l'API manque ou refuse l'accès, un message explique la sélection/copie manuelle depuis le champ toujours sélectionnable. Les retours sont annoncés avec `role="status"` ; la copie ne déplace pas le focus. Aucun identifiant n'est modifiable ou régénéré par React.

## Changement d'email

Le formulaire appelle l'action existante `requestEmailChange(email, authRedirectUrl('/auth/confirm-email-change'))`. Il réutilise `AuthForm`, `SubmitButton`, `useAuthTask` et ses messages d'erreur. Validation native `type="email"`/`required`, trim, refus de l'adresse actuelle sans distinction de casse, `autocomplete="email"`, verrou de soumission et désactivation du champ/bouton pendant l'envoi.

Le service 4B.2 reste propriétaire de l'appel Supabase et de la vérification d'accès. Aucun mot de passe ni code TOTP n'est demandé. Aucune mise à jour optimiste de l'adresse courante, aucune écriture dans `profiles`, aucun nouveau callback.

Le succès local indique que la demande attend les confirmations sur **l'ancienne et la nouvelle adresse**. Quand Auth fournit `user.new_email`, le message « Changement en attente » affiche cette adresse comme une demande, explicitement différente de l'adresse courante. Il n'infère pas quelle confirmation manque. L'événement `USER_UPDATED` relance la résolution du store et remonte le Profil : l'attente reste alors visible grâce à la donnée Auth, même si les feedbacks locaux sont réinitialisés. La nouvelle adresse n'est présentée comme courante qu'après mise à jour effective de `user.email` par Auth.

Le callback 4B.2, ses confirmations partielle/finale, le signup et le recovery sont inchangés. Leurs garanties serveur réelles restent celles du [rapport 4B.2](2026-09-13-PHASE4B2-ACCOUNT-AUTH.md), cohérentes avec la [référence Supabase `updateUser`](https://supabase.com/docs/reference/javascript/auth-updateuser). La Phase 4C ne rejoue pas les confirmations dans Mailpit et ne revendique pas un nouveau test réel des emails Supabase.

## Authenticator et éléments différés

Le statut distingue une donnée indisponible, aucun facteur vérifié et « Authenticator configuré ». Le texte de contact est affiché directement. Le bouton `Modifier` est omis pour ne pas suggérer une action disponible alors que le moyen de contact final reste ouvert. Aucun enrollment, remplacement, désactivation ou suppression de facteur ; aucun email de support, ticket ou formulaire inventé.

Restent pour **4D et le checkpoint cloud de clôture de Phase 4** : changement volontaire du mot de passe avec vérification serveur du mot de passe actuel, UX complète de suppression et branchement au backend 4B.3, confirmations finales et purge client après suppression, puis validations finales correspondantes. Aucun contrôle inactif de mot de passe/suppression n'est ajouté. Le recovery n'est pas détourné et le problème CLI `current_password` n'est pas réétudié.

La roadmap conserve **Phase 4 : Cadrée — implémentation en cours**, sans grande phase 4C séparée. Le contact support, les détails UX des parcours restants et les éventuelles exigences légales/rétentions demeurent ouverts. Aucun point ne bloque la livraison de cette page dans le périmètre 4C.

## Validations exécutées

| Commande | Résultat |
|---|---|
| `npm test -- --project frontend src/features/profile/ProfilePage.test.tsx` | **18 tests réussis, 1 fichier**, revérifiés après correction de l'usage d'`act` dans le test asynchrone |
| `npm test -- --project frontend src/features/profile/ProfilePage.test.tsx src/services/auth.test.ts src/features/auth/auth-store.test.ts src/features/auth/auth-callback.test.ts src/features/auth/AuthProvider.test.tsx src/app/AppRoutes.test.tsx` | **130 tests réussis, 6 fichiers**, dont les 18 tests Profil |
| `npm run lint` | **Réussi, zéro avertissement** après correction de l'attente superflue dans un test |
| `npm run build` (inclut `npm run typecheck`) | **Réussi**, 276 modules ; JS principal **575,68 kB / 165,04 kB gzip** |
| Liens Markdown locaux et `git diff --check` | **101 liens locaux résolus** ; aucune erreur de diff |

L'avertissement Vite préexistant de bundle supérieur à 500 kB demeure ; aucun changement de découpage hors périmètre. Les tests couvrent sources/date Auth distincte du profil, lecture seule, copie réussie/refusée/absente, attente préexistante, erreurs propres et retry, validation, doubles soumissions, finalisation Auth, données manquantes, facteur non vérifié et absence des actions hors 4C. Le test d'intégration AppRoutes vérifie la soumission suivie de `USER_UPDATED`, le retour au même Profil avec attente, le focus `h1` et l'abonnement Auth unique.

### Navigateur local

Vérification via le navigateur intégré, `agent-browser` n'étant pas disponible dans l'environnement. Un aperçu temporaire ignoré par Git sert les **vrais composants, routes et store**, avec un **service Auth simulé**, à `http://127.0.0.1:5174/profile`. Aucun client Supabase ni compte réel n'est utilisé par cet aperçu.

- Largeurs **320, 390, 768, 1 024 et 1 440 px** : aucun débordement horizontal ; aucun identifiant tronqué dans le champ.
- Inspection visuelle desktop/mobile, longues adresses courante et en attente à 320 px : retours à la ligne sans débordement.
- Copie au clavier et feedback, focus visibles du champ/du bouton de copie, soumission par Entrée, désactivation pendant l'envoi, erreur simulée puis nouvel essai et attente Auth vérifiés.
- Navigation Profil → Dashboard par le logo puis retour Profil par le menu au clavier : attente conservée dans Auth et focus du `h1` restauré.
- **Aucune erreur ni alerte console.** Ce contrôle ne remplace pas une validation manuelle avec lecteur d'écran ni un parcours Auth réel.

L'aperçu est arrêté, l'onglet de test fermé, la taille temporaire du navigateur réinitialisée et les fichiers de fixture supprimés. Aucun démarrage/reset Supabase ni changement de volume/catalogue. Les suites PostgreSQL, catalogue et suppression 4B.3 ne sont pas relancées, puisqu'aucun backend/SQL n'a changé.

## Fichiers

**Créés :**

- `src/features/profile/ProfilePage.test.tsx` ;
- ce rapport, `docs/reports/2026-09-14-PHASE4C-PROFILE.md`.

**Modifiés :**

- `src/features/profile/ProfilePage.tsx` ;
- `src/styles.css` : styles limités au Profil ;
- `src/app/AppRoutes.test.tsx` : attentes du Profil réel et soumission avec remontage Auth ;
- `README.md` ;
- `docs/01-FEATURES.md`, `docs/04-UX-UI.md`, `docs/05-ARCHITECTURE.md`, `docs/08-ROADMAP.md`.

**Vérifiés mais inchangés :** `AGENTS.md`, `docs/03-DATA-MODEL.md`, `docs/06-DATABASE.md`, rapports historiques 4B.2/4B.3, shell/header et routes de production, services/provider/store/callbacks/helpers Auth, schéma/migrations/types générés, backend de suppression, dépendances et lockfile.

Aucun autre fichier versionné modifié. Aucun travail fonctionnel Paramètres, Dashboard, recherche, catalogue, collections ou Phase 5. Aucun changement Supabase Cloud, déploiement Vercel, commit ou push.
