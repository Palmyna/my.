# Phase 3C — Shell authentifié et clôture

Clôturée le **12 septembre 2026** sur `main`, dans `Palmyna/my.`.

**Phase 3C terminée et validée localement.** Les pages restent volontairement minimales. Aucune nouvelle logique Auth/MFA, migration, modification Supabase locale ou cloud, synchronisation catalogue ni intervention Vercel.

## 3C.1 — Shell et routes protégées

- [AuthenticatedLayout](../../src/app/AuthenticatedLayout.tsx) accueille `/dashboard`, `/profile` et `/settings`, séparément d'`AuthLayout`. Le dashboard temporaire a quitté `AuthPages.tsx`.
- [AppRoutes](../../src/app/AppRoutes.tsx) conserve la destination authentifiée demandée ; les routes publiques/Auth redirigent un utilisateur autorisé vers `/dashboard`.
- Les protections existantes restent intactes : email confirmé, TOTP vérifié et `aal2`, priorité aux parcours MFA/recovery, aucun contenu privé pendant la restauration ou après perte d'autorisation.

## 3C.2 — Header authentifié

- [AuthenticatedHeader](../../src/app/AuthenticatedHeader.tsx) associe le logo blanc, toujours lié à `/dashboard`, au nom de la page : MY.Dashboard, MY.Profil et MY.Paramètres. Leur hauteur visuelle reste proportionnelle, avec un écart de 8 px.
- Recherche centrée dans l'espace disponible sur desktop, sur une seconde ligne sur tablette/mobile : champ et placeholder uniquement, sans requête, suggestion ni moteur.
- Bouton « Mon compte » avec l'initiale de l'email et un menu Profil / Paramètres / Déconnexion utilisant l'action Auth existante. Navigation clavier, fermeture par Escape, clic extérieur, sortie du focus et changement de route ; listeners nettoyés.
- Style sombre/rouge/blanc conservé : boutons au dégradé du logo, sans bordure, halo de focus des inputs, micro-animations discrètes avec règles de réduction des mouvements. Aucune navigation temporaire dans le contenu.

## 3C.3 — Finitions

- [Dashboard](../../src/features/dashboard/DashboardPage.tsx), [Profil](../../src/features/profile/ProfilePage.tsx) et [Paramètres](../../src/features/settings/SettingsPage.tsx) partagent une largeur de lecture maximale de **720 px**, dans le contenu du shell limité à 1 264 px. Le padding vertical varie de 32 à 48 px selon l'écran.
- Chaque page conserve une région nommée, un unique `h1` et le focus de navigation existant. Les paragraphes introductifs et espacements sont harmonisés via [styles.css](../../src/styles.css).
- Dashboard conserve le statut éventuel après changement de mot de passe. Son identifiant public MY. est regroupé avec son libellé dans une liste de description, reste sélectionnable et revient à la ligne sur petit écran.
- Profil et Paramètres restent des placeholders sans formulaire métier. Le footer commun et le design validé du header sont conservés ; la passe ciblée n'a révélé aucun autre correctif nécessaire.
- Les [tests routing/layout](../../src/app/AppRoutes.test.tsx) vérifient également le titre unique, la région accessible, le footer, l'identifiant et la conservation du message après reset.

## Validations exécutées

| Contrôle | Résultat |
| --- | --- |
| `npm test -- --project frontend src/app/AppRoutes.test.tsx src/app/AuthenticatedHeader.test.tsx` | **70 tests réussis**, routing, layout, header/menu et protections existantes |
| `npm test -- --project frontend` | **117 tests réussis**, 9 fichiers |
| `npm run build` | TypeScript et build Vite réussis ; avertissement non bloquant pour le bundle JS de **568,39 kB** minifié, **163,31 kB** gzip |
| `npm run lint` | Réussi, aucun avertissement |
| `git diff --check` | Réussi |

Vérification navigateur locale sur les **vrais composants et routes**, avec un état Auth simulé et sans appel Supabase : les trois pages ont été contrôlées à **320, 390, 768, 1 024 et 1 440 px**. Aucun débordement horizontal ; header, recherche, bouton, contenu et footer restent dans la largeur disponible. Le footer reste en bas des pages courtes. Le message de succès et l'identifiant restent lisibles à 320 px.

Navigation par le menu et le logo, focus du `h1` après navigation, focus visibles du bouton et du menu, halo du champ de recherche, ouverture clavier, retour à la recherche avec `Maj+Tab`, Escape et clic extérieur vérifiés. Aucune erreur ou alerte dans la console. Les règles `prefers-reduced-motion` ont été contrôlées dans la feuille CSS chargée : transitions et transformation du bouton désactivées, animation du menu supprimée ; la préférence système n'a pas été modifiée.

L'aperçu temporaire avec session simulée a été supprimé et son serveur arrêté. Aucun test DB/catalogue ni nouveau parcours Auth contre une base n'a été exécuté pour cette clôture UI.

## Environnements et documentation

Le README, l'architecture et le rapport 3B sont corrigés : **développement et tests = Supabase local uniquement**. Les retours de confirmation email et reset `localhost` / `127.0.0.1` restent locaux et ne doivent pas être ajoutés au cloud.

**Supabase cloud = future instance de production avec Vercel.** Site URL et Redirect URLs de production seront configurées à la mise en production. Aucune URL Vercel n'est inventée et aucun réglage distant n'a été modifié.

## Hors périmètre et suites

La vraie recherche globale et ses suggestions, les collections, le catalogue UI, le vrai Dashboard, l'édition du profil et les paramètres fonctionnels restent à construire dans leurs phases respectives. Aucun nouveau flux Auth/MFA, changement de schéma ni déploiement n'est introduit. L'optimisation du découpage du bundle pourra être étudiée avec les futures pages métier ; elle ne bloque pas 3C. Aucun autre point bloquant identifié dans le périmètre de cette clôture.
