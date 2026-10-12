# Phase 8H.2 — Consultation, lecture et traitement des notifications

12 octobre 2026 — version **0.8.18**. Actions et raccordements métier livrés. **8H reste en cours** : validation globale et clôture réservées à 8H.3. Aucun changement backend 8G ou transactionnel 8F.

## État réel et sources

- Branche `dev`, HEAD `c85b31380985b1657f0a5e7824aced6bcc8d59cc`, worktree initial propre ; aucun commit/push.
- `AGENTS.md`, décisions 8A.3 section 8, rapports 8G.2/8G.3/8H.1 et documents Fonctionnalités/UX/Architecture/Database examinés ; parcours notifications, dialogue, présentation/confirmation/reprise 8F et mutations communes tracés avant modification.
- Version package et deux champs du lock : `0.8.17` → `0.8.18`. Comparaison JSON avec HEAD hors versions : aucune dépendance ni autre champ modifié.
- Skills lean-build, Supabase, Context7 et revue React appliqués ; documentation actuelle TanStack Query, React Router, React StrictMode et SDK Supabase consultée. Aucun agent délégué.
- Local vérifié pendant les intégrations : API `http://127.0.0.1:55321`. **22 tables public/private, deux collections personnelles, 257 items, trois exemplaires** après nettoyage. Snapshots complets des lignes des 22 tables identiques avant installation et après nettoyage de chacun des trois scénarios 8H.2.

## Parcours livrés et responsabilités

| Surface | Comportement |
|---|---|
| `NotificationPanel` | Trois catégories, boutons indépendants « Voir la mise à jour », « Lire », « Marquer comme lue ». Lecture manuelle avec clé/révision affichées ; aucune ouverture ou traitement implicite. Exclusion des doubles clics pendant le suivi et reprise explicite de la requête exacte. |
| `NotificationContentDialog` | Dialogue modal natif partagé avec les dialogues existants. Consultation fraîche explicite via `get_notification_content`, chargement, contenu, indisponibilité sûre, erreur et nouvel essai. Texte brut, retours à la ligne conservés, défilement et coupure des chaînes longues. |
| `AuthenticatedLayout` / `CollectionPage` / `CollectionActions` | Intention en mémoire associée au viewer et à la collection, transmise par contexte d’Outlet. Fermeture du panneau, navigation si nécessaire, relecture réelle de l’overview et vérification propriétaire/automatique, puis ouverture du même dialogue 8F. Consommation unique, sans URL state, token ou stockage persistant ; retour historique sans nouvelle consultation. |
| `CollectionUpdateDialog` / `usePresentedCollectionNotification` | Acquittement après présentation réussie de l’aperçu frais et de ses métadonnées initiales. Version issue exclusivement du token du plan présenté. Suivi séparé de la confirmation/application 8F. |
| `useCollectionStructureMutation` | Ajout de l’invalidation notifications après application confirmée **et relectures autoritatives réussies**, y compris reprise par reçu. Aucun changement du writer, du token, du consentement, des UUID ou de l’exclusion mutuelle. |
| `useNotificationUnreadCount` / `useNotificationPages` | Abonnement aux invalidations des clés exactes du viewer ; `fetchQuery` explicite pour compteur et tête du panneau monté. Une tête réussie remplace pages/curseur ; requête de suite dépassée ignorée. |

L’entrée actuelle du menu « Vérifier les mises à jour » reste disponible. Une collection déjà ouverte ne subit aucune navigation artificielle ; ses droits sont tout de même relus. Collection supprimée, accès refusé, partage ou propriétaire différent : aucun aperçu ni acquittement. Intention annulée sur départ, changement de compte ou perte d’autorisation.

## Garanties de lecture et de traitement

Une annonce ordinaire est traitée seulement après que le contenu d’une consultation fraîche réussie a été rendu. Un composant de présentation déclenche `process_announcement_notification` avec **le hash du contenu consulté**. Le setup survivant de StrictMode envoie une seule fois ; rerenders sans second envoi, serveur idempotent en protection supplémentaire. Liste, cache préchargé, chargement, erreur, fermeture/navigation avant présentation : aucun traitement.

`recorded` invalide et provoque les relectures réelles du compteur et du panneau ouvert ; la ligne traitée disparaît par projection serveur. `obsolete` fait de même, sans réintroduction locale. Échec de suivi : contenu conservé, information explicite et bouton « Réessayer le suivi » utilisant le même hash. Contenu NULL : indisponibilité neutre et actualisation des notifications. Ancienne fixture `requiresAction=true` : contenu consultable, validation indisponible annoncée, aucun traitement automatique ni bouton fictif.

La lecture manuelle n’ouvre ni contenu ni aperçu et ne traite aucun événement. Révision capturée au clic ; un retry conserve cette révision même si le centre change. Après retrait du bouton devenu inutile, focus sur l’action de consultation de la même ligne, ou titre du panneau si la ligne disparaît ; aucun déplacement si l’utilisateur a déjà choisi un autre contrôle.

L’aperçu acquitte `plan.preview.token.targetVersion`, jamais la révision actuellement retournée par le centre. **Notification 2 affichée, arrivée de 3, aperçu 2 présenté : seule 2 est acquittée, 3 demeure non lue.** Cette séquence est prouvée sous React avec réponses contrôlées ; ce n’est pas une nouvelle preuve de concurrence PostgreSQL. En Local réel, l’aperçu de version 8 envoie exactement `8`. Aperçu échoué, legacy, simple navigation ou fermeture avant présentation : aucun acquittement. Un refus/obsolete de suivi actualise les notifications ; un plan 8F valide conserve sa possibilité d’application. Reprise du suivi avec version présentée exacte.

Une application confirmée et relue traite l’événement par la projection 8G. Aucun endpoint générique de traitement collection. Raccordement au propriétaire commun de mutation : valable depuis cloche, menu et reprise d’opération incertaine, sans nouvelle consultation/confirmation ou nouveau writer.

## Cache, annulation et accessibilité

`notificationReadMutationOptions`, `announcementProcessMutationOptions` et `invalidateNotificationQueries` réutilisés. Options 8G toujours désactivées, `retry:false`, aucune consultation implicite/prefetch/polling. Annulation avant invalidation `refetchType:'none'` ; les consommateurs montés réagissent par lectures explicites, car un observateur désactivé ne se rafraîchit pas par cette seule invalidation.

Badge exclusivement issu du compteur serveur, jamais déduit des lignes. Pagination dédupliquée par clé, première occurrence conservée, ordre backend. Numéro de consultation côté panneau empêche une ancienne page annulée de remplacer/compléter la nouvelle tête. Isolation viewer, purge/cancellation 8H.1 et AuthProvider conservées ; contenus/intentions démontés ou neutralisés sur navigation/compte/logout, réponses tardives sans présentation ni suivi automatique. `useNotificationMutationScope` revalide le viewer autorisé au dispatch de chaque suivi : un clic suivi d’un changement de compte pendant le yield TanStack n’envoie aucune écriture sous la nouvelle session.

Détail : focus initial au titre, Tab/Shift+Tab et Escape natifs via le dialogue partagé, fermeture possible pendant chargement/suivi, retour à Lire si présent ou titre du panneau après retrait de la ligne. Les listeners extérieurs/Escape du panneau sont suspendus pendant le détail modal. Styles de dialogue existants réutilisés, boutons de ligne ≥44 px, aucun HTML interprété ou animation ajoutée.

## Validation ciblée

| Contrôle | Résultat |
|---|---|
| Vitest React/hooks/services directement concernés | **12 fichiers / 456 tests PASS**, dont **35 nouveaux tests de raccordement 8H.2** |
| Nouvelle intégration React → SDK → PostgREST Local | **3 tests PASS** : cloche, menu, réponse perdue après commit puis reprise par reçu ; suivi manuel, contenu/traitement, aperçu/lecture et disparition après application |
| Intégration 8F.3 existante directement concernée | **3 tests PASS** : normal, réponse perdue/rechargement, erreur de relecture/rechargement |
| Préservation Local 8H.2 | **22 snapshots de tables identiques** avant/après chaque scénario ; nettoyage des identités synthétiques ; deux collections et leurs données conservées |
| Typecheck/build `0.8.18` | PASS ; avertissement Vite préexistant sur chunk >500 kB |
| ESLint des fichiers concernés | PASS, zéro warning |
| Versions/dépendances et `git diff --check` | PASS |
| Navigateur | Chrome détecté ; ouverture des fixtures frontend sur `127.0.0.1:5198` **refusée automatiquement par politique de sécurité, permission refusée**. Aucun contournement. Serveur arrêté et fichiers de préparation retirés ; aucun parcours visuel exécuté. |

Tests React : trois catégories/actions, lecture sans traitement, révision exacte, contenu rendu avant suivi, erreurs/obsolete/fixtures action, StrictMode, préchargement, fermeture/navigation, viewer/logout et réponses tardives, droits relus, collection déjà ouverte/supprimée/révoquée/partagée, aperçu réussi/échoué/legacy/fermé, version 2/3, refus d’acquittement sans bloquer 8F, application depuis cloche/menu, reprise incertaine, compteur/tête réellement relus, pagination après retrait avec suite annulée, focus/Tab/Escape/restauration.

Commandes :

```powershell
npm.cmd exec -- vitest run src/features/notifications/NotificationActions.test.tsx src/features/notifications/NotificationCenter.test.tsx src/features/notifications/notification-query.test.tsx src/features/collections/CollectionUpdateDialog.test.tsx src/features/collections/useCollectionUpdateMutation.test.tsx src/features/collections/CollectionActions.test.tsx src/features/collections/CollectionPage.test.tsx src/features/collections/useCollectionStructureMutation.test.tsx src/services/notifications.test.ts src/services/collection-update-apply.test.ts src/app/AuthenticatedHeader.test.tsx src/app/AppRoutes.test.tsx
$env:MY_SUPABASE_LOCAL_TEST='1'
npm.cmd exec -- vitest run src/services/notification-actions.local.test.tsx
npm.cmd exec -- vitest run src/services/collection-update-apply.local.test.tsx
npm.cmd run build
git diff --check
```

Intégrations conditionnelles réservées à Local, fixtures `a250…/c250…/f360…` et cibles catalogue synthétiques existantes. Perte de réponse injectée **après commit SQL réel**, reçu lié au même UUID ; conservation de la requête/token et relectures réelles. Le harness React fournit l’identité AAL2 synthétique ; ce n’est pas une preuve de connexion/MFA navigateur. Aucun test PostgreSQL de publication/transaction ou concurrence backend relancé, leur code restant inchangé.

## Frontière

Aucune migration, RPC, ACL, rôle, type DB généré, logique transactionnelle 8F ou moteur modifié. Aucun reset, accès Cloud/Vercel, publication réelle, administration, partage, push/email/Realtime/polling, commit/push. Références courantes de livraison actualisées ; rapports historiques conservés.

**Arrêt strict à 8H.2.** 8H.3 conserve suites DB/frontend complètes, audit responsive, accessibilité navigateur, preuve visuelle et clôture documentaire globale. Les contrôles jsdom ne constituent pas cette preuve navigateur ; 8H n’est pas déclarée terminée.
