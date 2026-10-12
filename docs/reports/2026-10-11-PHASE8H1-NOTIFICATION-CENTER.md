# Phase 8H.1 — Cloche, compteur et liste des notifications

Intervention du 12 octobre 2026 — version **0.8.17**. Interface consultative livrée ; **8H reste en cours**. Actions de lecture/traitement et raccordements Collection réservés à 8H.2, validation globale et clôture à 8H.3. Vérification visuelle responsive non exécutée : aucun navigateur disponible dans cette session.

## État réel et sources

- Branche `dev`, HEAD initial/final `1e2644f8c44c92380634f8db4d90ba5428218c9f`, worktree initial propre.
- `AGENTS.md`, décisions Fonctionnalités/UX, architecture, rapports 8G.2/8G.3 et conventions header/recherche/menu/focus examinés avant modification.
- Types, décodeurs et services notifications 8G.2 réutilisés sans modification du transport ou des contrats backend. Documentation TanStack Query consultée via Context7 pour déduplication et annulation ; skills lean-build, Supabase, Context7 et contrôle React appliqués. Aucun agent délégué.
- Package et deux champs de version du lock passent de `0.8.16` à `0.8.17`, sans changement de dépendances. Version injectée dans le footer par Vite, sans constante supplémentaire.

## Fichiers et comportement

| Fichiers | Responsabilité |
|---|---|
| `src/app/AuthenticatedHeader.tsx`, `src/styles.css` | Cloche entre recherche et compte, grille desktop à quatre colonnes ; recherche conserve la seconde ligne sous 1 100 px, cloche/compte restent sur première ligne |
| `src/features/notifications/NotificationCenter.tsx` | Garde viewer autorisé, confidentialité du cache, compteur exact/compact, ouverture/fermeture, interactions extérieures et fermeture sur navigation |
| `src/features/notifications/NotificationPanel.tsx` | Panneau dédié non modal, titre/focus, liste de métadonnées backend, états et contrôles de lecture/pagination |
| `src/features/notifications/useNotificationCenter.ts` | Lectures explicitement déclenchées, fraîcheur/déduplication, pagination vivante et fusion sans tri client |
| `src/features/notifications/notifications.css` | Tokens graphite/rouge existants, boutons secondaires partagés, largeur/hauteur bornées, scroll interne et cibles tactiles |
| `src/features/notifications/notification-query.ts` | Commentaire de consommation actualisé ; options/keys/mutations/invalidations 8G.2 inchangées |
| `src/features/notifications/NotificationCenter.test.tsx`, `src/app/AuthenticatedHeader.test.tsx` | Tests du centre intégré au header et adaptation des mocks existants |
| README, Fonctionnalités, Modèle, UX, Architecture, Database, roadmap | Références de version/livraison et frontières 8H.2/8H.3 actualisées ; rapports historiques conservés |

Compteur issu de `get_notification_unread_count`, total global indépendant des pages affichées. Décimale canonique conservée en chaîne, jamais convertie en Number. Zéro sans badge, 1–99 exacts, valeurs supérieures affichées `99+` avec nombre complet dans le nom accessible. Erreur : indicateur discret et nom « compteur indisponible », aucun ancien badge présenté comme confirmé ; retry dans le panneau. Le chargement reste distinct du zéro.

Session autorisée uniquement via la garde existante `useAuth().isAuthorized` : statut délivré après résolution MFA AAL2 et profil. Consultation du compteur à l’entrée ; QueryClient partage les requêtes en vol et réutilise une lecture de moins de 30 secondes pour les remontages/focus/visibility. Ouverture et commande Actualiser forcent une lecture fraîche. Focus/retour visible actualise aussi la tête d’un panneau ouvert si celle-ci est périmée ou invalidée. Aucun polling, préchargement de contenu ou retry réseau implicite.

Panneau : trois catégories, titre backend rendu comme texte, état Lu/Non lue et date française. Les notifications lues restent visibles ; aucune projection parallèle des événements traités/obsolètes. Première page de 20 via `get_notification_center`, pages suivantes sur clic avec le curseur exact. Fusion par `notificationKey`, première occurrence conservée, ordre backend inchangé. Une actualisation réussie remplace toutes les pages/cursors ; même après erreur d’actualisation, l’ancien curseur reste bloqué jusqu’à une nouvelle tête réussie. Un échec de page supplémentaire conserve la liste et le curseur exact pour retry. Fin annoncée seulement après réussite ; aucun état vide sur erreur.

Focus initial au titre, Tab/Shift+Tab natifs dans le panneau non modal, Escape et fermeture explicite rendent le focus à la cloche. Clic extérieur ferme ; le focus extérieur conserve sa destination, selon les conventions recherche/compte. Ces surfaces se ferment mutuellement par leurs interactions extérieures. Navigation remonte seulement la surface du panneau, en conservant le consommateur du compteur ; aucune requête supplémentaire de route. Boutons ≥44 px, cloche de 54 px homogène au compte, styles de focus existants. Aucun mouvement ou animation ajoutée.

Sur changement de viewer ou perte d’autorisation : rendu précédent immédiatement absent, panneau et état local démontés, annulation logique React Query de toutes les lectures notifications de l’ancien viewer avant retrait de ses clés centre/compteur/contenu. `cancelQueries` annule les retryers synchroniquement avant `removeQueries`, sans nettoyage différé pouvant effacer une nouvelle session A → B → A. Les requêtes HTTP déjà parties peuvent terminer côté transport ; leurs résultats ne peuvent plus repeupler le cache annulé ni l’interface. Au logout réel, la purge globale préexistante d’AuthProvider détruit/annule aussi les queries avant la sortie du shell. Aucun stockage privé supplémentaire.

## Validation ciblée exécutée

| Contrôle | Résultat |
|---|---|
| Vitest centre/header, contrats Query et recherche globale directement concernée | **4 fichiers / 81 tests PASS**, dont 29 tests du centre intégré |
| Typecheck/build à `0.8.17` | PASS ; avertissement Vite préexistant sur chunk >500 kB |
| ESLint fichiers TS/TSX touchés | PASS, zéro warning |
| Versions/dépendances | PASS : comparaison JSON avec HEAD hors trois versions |
| `git diff --check` | PASS |
| Clavier/focus/interactions | PASS sous React/jsdom ; ne constitue pas une preuve géométrique de navigateur |
| Responsive desktop/mobile | Styles inspectés ; **validation visuelle et mesures d’absence de débordement non exécutées** : inventaire navigateur vide et ouverture du navigateur intégré refusée (`Browser is not available: iab`) |

Commande ciblée : `npm.cmd exec -- vitest run src/features/notifications/NotificationCenter.test.tsx src/app/AuthenticatedHeader.test.tsx src/features/notifications/notification-query.test.tsx src/features/global-search/GlobalSearch.test.tsx`. Build : `npm.cmd run build`. ESLint limité aux sept fichiers TypeScript/TSX touchés.

Preuves : présence/position, zéro/positif/BIGINT, nom/ARIA, focus initial/restauration/Escape/clic extérieur/Tab, coexistence des trois surfaces, absence de lectures sans autorisation, StrictMode/remontage/navigation/rafales focus, erreur de compteur et retry, chargement/vide/erreur de centre, pagination/chargement/retry/déduplication/ordre/globalité, remplacement de tête et blocage du curseur après erreur, trois types et états, texte sans injection HTML, nettoyage d’un viewer ayant déjà des données affichées, logout/perte d’autorisation/changement de compte et réponses tardives, retour rapide A → B → A. Chaque test du centre vérifie l’absence de consultation détaillée et d’écriture de suivi.

Tests de services/backend réels non relancés : leur transport/contrat reste inchangé, preuves 8G conservées. Aucune assertion DB, ancienne concurrence ou suite frontend complète exécutée ; validation globale réservée à 8H.3. Aucun parcours navigateur ou preuve Local RPC réelle nouveau présenté comme acquis.

## Frontière et suite

8H.2 raccordera ouverture de l’aperçu Collection, consultation annonce/changelog, lecture manuelle et traitement après consultation, ainsi que les relectures explicites centre/compteur après action. Les options existantes restent désactivées ; `invalidateNotificationQueries` annule et invalide sans refetch automatique. Les fonctions de rafraîchissement du consommateur fournissent le chemin explicite de relecture ; aucun writer n’est appelé à l’ouverture, à la pagination ou à l’actualisation.

Aucun changement SQL, migration, rôle, type DB généré, service 8G, writer 8F ou `CollectionUpdateDialog`. Aucune publication réelle, modification de collection personnelle, connexion DB, reset, Cloud, Vercel, push/email/Realtime ou polling. Aucun commit/push. **Arrêt à 8H.1**, avec contrôle visuel responsive restant à exécuter dans un environnement navigateur disponible.
