# Phase 4D.1 — Réorganisation du Profil et changement volontaire du mot de passe

## Résultat et point de départ

**Phase 4D.1 réalisée et validée localement. La Phase 4 reste en cours.**

Avant modification : dépôt `Palmyna/my.`, branche **`dev`**, arbre de travail propre et dernier commit **`1bb9a4d — Align profile tests with MY.ID and close Phase 4C`**, conformes à la demande. `AGENTS.md`, README, fonctionnalités, UX/UI, architecture, base, roadmap et rapports 4B.2/4C ont été relus, ainsi que les composants et tests Profil/Auth concernés.

Le périmètre est limité à la hiérarchie du Profil et au changement volontaire du mot de passe. Aucune suppression de compte, configuration Supabase, migration, intervention Cloud, Phase 5, modification du Dashboard, catalogue, recherche, partage, Vercel ou production. Aucun commit ni push.

## Organisation du Profil

1. **Identité MY.** : date d'inscription issue d'Auth, `MY.ID` readonly, copie complète, coche pendant 2,2 secondes, feedback accessible et rendu responsive 4C conservés.
2. **Adresse email** : composant, fonctionnement, textes, attente `user.new_email` et contrat Auth 4B.2 conservés.
3. **Sécurité du compte** : formulaire de mot de passe principal, séparation fine, puis Authenticator secondaire.

L'ancien bloc autonome Authenticator disparaît. Son statut réel reste dérivé de `mfa.verifiedFactors` : `Authenticator configuré`, aucun facteur vérifié ou donnée indisponible. Le texte existant demande de contacter un administrateur pour le modifier ou le remplacer. Aucun bouton, modale, enrollment, remplacement ou suppression de facteur n'est ajouté.

La présentation reprend les champs, boutons, palette, typographie, états de focus/hover/pressed et responsive de 4C. Les trois seules règles CSS ajoutées concernent la séparation Authenticator, sa dernière marge et l'espacement des erreurs password. Les styles globaux d'inputs, boutons, header et focus restent inchangés.

## Formulaire et retours

| Champ | Attributs |
|---|---|
| Mot de passe actuel | `type=password`, `autocomplete=current-password`, requis |
| Nouveau mot de passe | `type=password`, `autocomplete=new-password`, requis, minimum 6 caractères |
| Confirmer le nouveau mot de passe | `type=password`, `autocomplete=new-password`, requis |

La validation contrôle les champs requis, le minimum existant de 6 caractères, la confirmation identique et un nouveau mot de passe différent de la saisie actuelle. Aucune règle de composition supplémentaire. Cette comparaison entre deux saisies ne vérifie pas le mot de passe réel du compte. Les valeurs sont transmises sans trim.

Le bouton `Modifier le mot de passe` devient `Un instant…` pendant l'envoi ; le fieldset et le bouton sont désactivés. Les doubles soumissions sont bloquées, y compris pendant le remontage de la page provoqué par `USER_UPDATED`.

Après résolution réussie de `auth.updateUser()` uniquement : message accessible **`Mot de passe modifié.`**, champs vidés et session conservée. Aucun logout, recovery ou TOTP supplémentaire. Une erreur affiche une traduction Auth maîtrisée et rend le formulaire réutilisable ; aucun message brut, payload ou secret n'est affiché.

Les codes simulés couvrent notamment `current_password_mismatch`, `current_password_required`, `weak_password`, `same_password`, session absente/expirée, `bad_jwt`, `insufficient_aal`, rate limit et erreur inconnue. Les scénarios de refus SDK sont des tests de propagation/traduction, pas une preuve de contrôle du mot de passe par le serveur local.

## Contrat Auth

`changePassword(currentPassword, password)` est une nouvelle action distincte du recovery. L'action du store exige `authorized` ; le service relit la session et vérifie email confirmé, facteur TOTP vérifié et `aal2`, puis transmet exactement :

```ts
auth.updateUser({
  password,
  current_password: currentPassword,
})
```

Supabase Auth reste responsable de la vérification du mot de passe actuel, selon sa [documentation de sécurité](https://supabase.com/docs/guides/auth/password-security#require-current-password-when-changing-password). Aucun `signInWithPassword`, challenge TOTP, nonce email, stockage de mot de passe ou preuve d'authentification temporaire n'est ajouté.

Le store conserve uniquement `accountPasswordChange` (`idle`, `pending`, `success`) comme **état de présentation en mémoire**. Il n'accorde aucun droit et ne contient aucun secret. Cela conserve le verrou de formulaire et le retour de succès après le démontage/remontage Auth, sans modifier les gardes ni le traitement de `USER_UPDATED`. Le statut est réinitialisé à la prochaine soumission, à la déconnexion, au changement de compte ou à l'arrêt du provider. Une réponse tardive d'un ancien cycle de connexion ne publie aucun succès dans le compte courant.

Le recovery conserve son action `updatePassword(password)`, son payload `updateUser({ password })`, la MFA préalable et la session après succès. Le formulaire email, son service, les callbacks et leurs messages conservent le contrat 4B.2. Aucun second client Supabase, accès privilégié ou écriture de profil n'est ajouté.

## Vérification réelle dans le navigateur

Contrôle effectué avec **Microsoft Edge 153.0.4234.32**, piloté par le Playwright fourni par l'environnement, en mode headless. Le CLI `agent-browser` n'était pas installé ; aucune dépendance du dépôt n'a été ajoutée. L'aperçu Vite temporaire charge les **vrais composants, routes, service et store**, avec un client SDK Auth simulé et des données fictives. Les requêtes externes sont bloquées par la sonde ; aucun backend Auth réel n'est contacté.

Les captures ont été produites puis inspectées visuellement aux cinq largeurs demandées :

| Largeur | Largeur du document | Largeur des 3 champs password | Hauteur des champs |
|---|---|---|---|
| 320 px | 320 px | 238 px | 50 px |
| 390 px | 390 px | 308 px | 50 px |
| 768 px | 768 px | 670 px | 50 px |
| 1 024 px | 1 024 px | 670 px | 50 px |
| 1 440 px | 1 440 px | 670 px | 50 px |

- Aucun débordement horizontal ; trois champs alignés et de même largeur/hauteur.
- Boutons de pleine largeur sur mobile ; taille au contenu sur desktop/tablette.
- Labels et textes longs reviennent à la ligne, y compris la confirmation à 320 px et une adresse en attente volontairement longue.
- Séparation Authenticator de 1 px, sans carte imbriquée ni encart administratif.
- Focus clavier vérifié sur les trois champs et le bouton à 320 et 1 440 px, avec le halo existant ; hover, pressed et réduction des mouvements contrôlés.
- Validation requise/mismatch, loading, erreur simulée, retry, succès après `USER_UPDATED` et champs vidés vérifiés dans le navigateur.
- Copie entière, coche temporaire, retour initial et focus conservé contrôlés ; attente email 4B.2 également affichée.
- Dernière correction visuelle : marge de 20 px avant l'erreur password, revérifiée à 320, 390 et 1 440 px, sans modifier les erreurs email.
- **Zéro erreur ou avertissement console**, zéro overlay Vite et zéro requête externe pendant la sonde complète.

Les sondes temporaires ont été exécutées par `node .cache/phase4d1/verify.mjs` et `node .cache/phase4d1/focus.mjs`, puis une vérification ciblée de l'espacement final. Captures et mesures JSON sont conservées localement sous `.cache/phase4d1/`, ignorées par Git. Serveur arrêté, navigateurs fermés et fichiers exécutables de l'aperçu supprimés après vérification.

## Tests et résultats

Les tests de contrat ne supposent jamais que le backend local refuse un mauvais `current_password`. Les tests Profil conservent les scénarios 4C et ajoutent ordre des sections, champs, validations, payload, doublons, succès, erreur/retry et absence des parcours hors périmètre. Le store et les routes vérifient le remontage `USER_UPDATED`, le maintien des gardes/recovery et les réponses tardives après déconnexion ou changement d'identité.

| Commande | Résultat |
|---|---|
| `npm test -- --project frontend src/features/profile/ProfilePage.test.tsx src/services/auth.test.ts src/features/auth/auth-store.test.ts src/features/auth/AuthProvider.test.tsx src/app/AppRoutes.test.tsx` | **154/154 tests réussis, 5 fichiers**, sortie 0 |
| `npm test -- --project frontend src/features/profile/ProfilePage.test.tsx src/app/AppRoutes.test.tsx` | Dernière passe ciblée après finitions des tests et espacement d'erreur : **95/95 tests réussis, 2 fichiers**, sortie 0 ; sous-ensemble des 154 |
| `npm run lint` | Réussi, **zéro erreur et zéro avertissement**, sortie 0 |
| `npm run build` | Typecheck et build réussis, sortie 0 ; 276 modules ; bundle JS principal **579,33 kB / 165,68 kB gzip** |
| `git diff --check` | Réussi, sortie 0 ; aucune erreur de whitespace |

L'avertissement Vite préexistant concernant un bundle supérieur à 500 kB reste présent. Les erreurs de lint rencontrées dans les deux nouveaux tests asynchrones ont été corrigées, puis ces tests et le lint ont été rejoués avec succès. Relecture React/accessibilité ciblée, cohérence des documents et vérification des liens Markdown locaux concernés effectuées. Aucune suite pgTAP complète, catalogue, delete-account ou intégration Supabase réelle n'a été lancée.

## Fichiers

**Créé :** le présent rapport.

**Modifiés :**

- `src/features/profile/ProfilePage.tsx` et `ProfilePage.test.tsx` ;
- `src/services/auth.ts` et `auth.test.ts` ;
- `src/features/auth/auth-store.ts`, `auth-store.test.ts` et `auth-ui.ts` ;
- `src/app/AppRoutes.test.tsx` ;
- `src/styles.css` ;
- `README.md`, `docs/01-FEATURES.md`, `docs/04-UX-UI.md`, `docs/05-ARCHITECTURE.md`, `docs/06-DATABASE.md` et `docs/08-ROADMAP.md`.

**Vérifiés mais inchangés :** `AGENTS.md`, composants d'identité et d'email 4C, `AuthLayout.tsx`/politique password existante, `AuthPages.tsx`, `AuthProvider.tsx`, `AuthProvider.test.tsx`, contexte/callback Auth, `AppRoutes.tsx`, client Supabase et fixtures existants, rapports historiques 4B.2/4C, modèle de données, migrations/RLS/types générés, configuration et dépendances. Aucun autre fichier versionné modifié.

## Limite locale et reste de 4D

La limitation fournie pour **Supabase CLI 2.117.0** est conservée : l'exigence serveur **Require current password when changing password** ne peut pas être correctement validée avec le lancement local connu. Aucun nouvel examen CLI/TOML/Docker ni backend alternatif.

- **4D.2** : UX de suppression du compte et intégration au backend 4B.3, non commencées ici.
- **4D.3** : vérification ciblée Supabase Cloud du refus sans mot de passe actuel et avec une valeur incorrecte, succès avec une valeur correcte, gardes et non-régression recovery, puis contrôles de clôture de Phase 4. Aucun résultat Cloud n'est revendiqué.

La roadmap conserve son niveau macro et **Phase 4 : en cours**. La Phase 5 n'est pas commencée. Aucun changement Cloud, secret, réglage Auth, migration, déploiement, commit ou push.
