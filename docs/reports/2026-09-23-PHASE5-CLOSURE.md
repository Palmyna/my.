# Phase 5 — Documentation et clôture

## État de référence

Clôture documentaire du 23 septembre 2026, sur `dev`, à partir du commit `8359cea661aef177af55db40a3b6ede36df033c7` (`phase 5E.1`). Le working tree initial était propre. Les changements de 5E.1 sont présents dans ce commit.

L'audit 5E.1 est terminé, validé et poussé sur `dev`, selon la confirmation du propriétaire. Il n'identifie aucun blocage avant clôture : contrats UI/services/DB et owned/shared cohérents, migrations reproductibles, parité canonique et protections vérifiées. Le présent rapport consigne ces acquis ; il ne constitue pas une nouvelle exécution de l'audit technique ni un checkpoint Cloud.

## Périmètre livré et limites

| Élément | Statut à la clôture |
|---|---|
| Dashboard Collections | **Livré** : collections personnelles et partagées, type/cible, progression du propriétaire, états chargement/erreur/vide et navigation |
| Création personnalisée | **Livré** depuis Dashboard, nom validé, dialog accessible et rafraîchissement des collections ; `Personnalisée` en interface, `free` en base |
| Consultation Collection | **Livré** : `/collections/:collectionId`, accès direct, overview, type/cible, progression, retour Dashboard et états erreur/indisponibilité |
| Owned/shared | **Livré** : accès propagé depuis la DB/RLS ; collections réellement partagées en lecture seule, sans actions propriétaire |
| Renommage | **Livré** pour le propriétaire, collections personnalisées comme automatiques ; nom/titre et cache Dashboard synchronisés |
| Suppression | **Livré** pour le propriétaire, confirmation puis retour Dashboard ; items et partages supprimés en cascade, exemplaires physiques conservés |
| Identité et actions contextuelles | **Livré** : accent de collection, bouton à trois carrés décoratifs sans arrondi, actions `Renommer` et `Supprimer la collection`, danger distinct, dialogs/clavier/focus accessibles |
| Backend automatique | **Livré** : structure et calcul canonique PostgreSQL, état/version de cible, contrôle du hash, parité, création atomique et sûre en concurrence, RPC `create_automatic_collection(...)` et service TypeScript |
| UI automatique | **Encore futur** : création/ouverture depuis les pages catalogue Pokémon/Extension, prévue en Phase 7 |
| Création/gestion utilisateur du partage | **Encore futur** : parcours de destinataire, création et retrait des accès en Phase 9 ; le socle DB/RLS et la consultation shared sont déjà livrés |
| Contenu des collections | **Encore futur** : consultation des éléments et interactions prévues en Phase 6 ; les mises à jour automatiques restent en Phase 8 |
| Migrations Phase 5 | **Livré** : trois migrations présentes, validées localement et déployées sur Supabase Cloud |
| Supabase Cloud | **Livré** pour le socle Phase 5 : historique Local/Remote confirmé aligné jusqu'à `20260920194903` par le propriétaire ; aucune opération Cloud pendant 5E.2 |

La recherche du header reste visuelle, Paramètres reste minimal et aucun déploiement Vercel n'est en place. Ces limites correspondent à la [roadmap](../08-ROADMAP.md), sans extension du périmètre de Phase 5.

## Migrations et sécurité

Les trois migrations Phase 5 complètent les huit migrations précédentes :

- [20260920134607_phase5_canonical_collection_structure.sql](../../supabase/migrations/20260920134607_phase5_canonical_collection_structure.sql) ;
- [20260920140934_phase5_create_automatic_collection.sql](../../supabase/migrations/20260920140934_phase5_create_automatic_collection.sql) ;
- [20260920194903_phase5_dashboard_collections.sql](../../supabase/migrations/20260920194903_phase5_dashboard_collections.sql).

Le déploiement manuel Cloud et l'alignement des historiques sont des acquis confirmés par le propriétaire, sans nouvelle vérification distante lors de cette clôture.

L'audit 5E.1 juge le `SECURITY DEFINER` de la RPC contrôlé et justifié : identité `auth.uid()`, exigence `aal2`, profil MY., `search_path = ''`, droits retirés à `public`/`anon` et exécution accordée à `authenticated`. L'avertissement advisor associé ne constitue pas, à lui seul, un défaut démontré. Les détails du contrat et de ses protections restent dans [06-DATABASE.md](../06-DATABASE.md#création-transactionnelle).

## Validations acquises de 5E.1

Résultats transmis et validés par le propriétaire, non réexécutés pendant 5E.2 :

| Validation | Résultat acquis |
|---|---|
| `npm test` | 623 tests réussis |
| Tests frontend | 442 tests réussis |
| `npm run lint` | Réussi |
| `npm run build` | Réussi, avec typecheck inclus |
| `npm run db:test` | 627 assertions / 12 suites réussies |
| `npm run db:test:concurrency` | 13 contrôles réussis |
| `npm run db:lint` | Réussi |
| `supabase db diff --local --schema public,private` | Aucun diff après reconstruction locale |
| Parité canonique | 1 213 cibles / 0 divergence |
| `git diff --check` | Réussi |

La seule correction 5E.1 concerne une course lors de la création personnalisée pendant le premier chargement Dashboard. `CreateCollection.tsx` annule la lecture en cours avant l'invalidation après succès ; `CreateCollection.test.tsx` couvre la réponse initiale tardive qui pouvait masquer la nouvelle collection. Cette correction et son test sont déjà inclus dans `8359cea`, sans nouvelle modification en 5E.2.

## Clôture documentaire 5E.2

Le README et la roadmap reflètent la Phase 5 terminée. Les références produit, architecture, DB et pipeline distinguent les opérations livrées des parcours futurs ; les descriptions UX déjà exactes et les rapports historiques sont conservés.

La validation de cette passe porte sur le diff documentaire, les liens locaux des documents modifiés, la cohérence croisée des statuts et `git diff --check`. Aucun code fonctionnel, test, fichier généré, lockfile ou migration n'est modifié. Aucune opération Supabase Cloud, aucun commit ni push n'est réalisé.

**Phase 5 terminée et documentée.** Aucun problème bloquant identifié. La prochaine étape reste la Phase 6 définie par la roadmap ; elle n'est pas commencée pendant cette clôture.
