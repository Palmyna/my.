# PROD.7B.2.3 — Clôture documentaire Preview / Supabase Cloud

## Verdict et provenance

**Validations Vercel Preview avec Supabase Cloud acquises selon la confirmation du propriétaire du 15 octobre 2026, version applicative `0.8.33`.** Connexion, authentification, MFA et exception métier du compte `super_admin` pendant le gel ont été éprouvées dans le périmètre décrit ci-dessous. Cette clôture documentaire ne vaut ni répétition complète PROD.7C ni GO de publication Production.

Les résultats distants sont fournis par le propriétaire dans la demande PROD.7B.2.3. Codex ne les a pas rejoués ni revérifiés sur les plateformes pendant cette intervention. Aucun identifiant de déploiement, SHA distant ou journal brut n'est fourni avec cette confirmation ; le HEAD local ne doit pas être assimilé au commit servi par Vercel. Les rapports antérieurs restent inchangés et conservent leur portée historique.

## État du dépôt vérifié

| Élément | Constat documentaire local |
|---|---|
| Branche | `dev` |
| HEAD initial et final | `975dc33cc6a3f90282793a9a42e222629968e3c7` ; aucun commit ni push |
| Worktree initial | Propre |
| Version package / lockfile / entrée racine du lockfile | `0.8.33` / `0.8.33` / `0.8.33`, lecture avec Node ; fichiers conservés |
| Migrations versionnées | 52 fichiers SQL ; aucun accès à la base Local ni nouvelle vérification de son historique appliqué |
| Modification livrée | Markdown uniquement : présent rapport, README et références 05/06/08/10/11/12 |

## Validations distantes confirmées par le propriétaire

| Contrôle | Résultat confirmé | Portée |
|---|---|---|
| Version applicative | `0.8.33` | Version du parcours Preview confirmé ; aucune identité de déploiement Production déduite |
| Historique Supabase Cloud | **52 migrations appliquées** | Remplace le checkpoint courant de 48 ; les rapports Phase 8 restent historiques. Aucune parité exhaustive des corps SQL/ACL déduite du nombre |
| Variables Supabase Vercel | Disponibles en **Preview et Production** | Remplace « Production uniquement » ; ne prouve pas un parcours frontend Production |
| Connexion Preview à Cloud | Réussie | Backend Cloud existant ; aucune branche Supabase Preview ajoutée |
| Authentification et MFA depuis Preview | Fonctionnelles | Parcours de connexion Cloud confirmé, distinct d'une restauration Auth/MFA |
| Compte Cloud `super_admin` | Attribution effectuée et vérifiée | Rôle applicatif privé ; aucun rôle PostgreSQL ni bypass de maintenance frontend déduit |
| Gel Cloud activé | Création puis suppression d'une collection depuis Preview réussies, effets vérifiés en base | Validation du chemin métier autorisé du `super_admin` pendant le gel, conformément à PROD.7B.2.2 |
| Nouvelle connexion avec MFA pendant le gel | Réussie | Authentification disponible malgré le gel métier ; aucune preuve d'arrêt des écritures internes Auth |
| État Cloud final | Gel désactivé, **`frozen = false`, révision `4`** | État final rapporté par le propriétaire, non relu par Codex ; aucune conclusion sur `maintenance_production` |

Les écritures réussies du `super_admin` sont attendues pendant le gel. Elles ne démontrent pas le refus des écritures d'un utilisateur ordinaire, des RPC ou des accès directs Cloud. Le drainage, les anciennes sessions, la concurrence, les permissions et la couverture des autres writers ne sont pas validés à nouveau par ce seul parcours.

## Frontières de preuve conservées

- **Local et synthétique :** les matrices de sécurité, concurrence et métier des [rôles](2026-10-15-PROD7B21-APP-ROLES.md) et de l'[exception au gel](2026-10-15-PROD7B22-SUPERADMIN-FREEZE.md), la capture native [PROD.7B.1](2026-10-14-PROD7B1-NATIVE-BACKUP-TRANSPORT.md) et la restauration [PROD.5](2026-10-13-PROD5-RESTORE.md) conservent leurs résultats historiques ; aucune de ces campagnes n'est relancée ici.
- **Preview avec Cloud :** les validations du tableau précédent sont acquises sur déclaration du propriétaire. Preview utilise le backend Cloud existant ; ce n'est pas une base de test isolée.
- **Frontend Production :** le parcours Preview ne prouve ni le build Production exact servi sur le domaine, ni l'accès de contrôle avant réouverture, ni le parcours complet après réouverture. La limite T1 de [PROD.7B.2](2026-10-14-PROD7B2-FRONTEND-VERIFICATION.md) reste ouverte dans cette portée. Aucun contournement du middleware n'est ajouté ou autorisé.
- **Sauvegarde et récupération :** aucune capture Cloud, restauration d'une vraie archive Cloud ou récupération du projet Production attestée par cette confirmation. Un login/MFA réussi sur la base active ne constitue pas un essai après restauration. `production_recovery_proven=false` reste applicable.
- **Publication coordonnée :** aucune PR/merge de livraison, promotion, publication réelle de changelog ni réouverture Production coordonnée n'est démontrée par ces essais.

Les réglages d'intégration et le check publisher déjà confirmés par le propriétaire dans [PROD.7A](2026-10-14-PROD7A-PUBLICATION-AUDIT.md#confirmations-manuelles-reçues-pour-prod7a) sont repris dans la procédure avec cette provenance antérieure. Ils ne sont pas reconfirmés par PROD.7B.2.3. Le check publisher ne prouve toujours pas une publication visible.

## Contrôles nécessaires pour PROD.7C

Suivre la [procédure unique de publication](../11-PUBLICATION-PRODUCTION.md), sans créer de second runbook. PROD.7C reste à effectuer ; cette clôture n'autorise aucune opération distante supplémentaire.

1. **Relever les cibles et états actuels :** historique Cloud détaillé, version PostgreSQL, identités/ACL, intégrations, SHA et identifiant du build Production, variables, domaines et protections. Relever le nouvel état du gel : la révision `4` est un checkpoint daté, pas une valeur à réutiliser aveuglément.
2. **Éprouver la fermeture dans la portée retenue :** refus pour utilisateurs ordinaires, sessions/onglets existants, RPC et accès directs, drainage et coordination des exceptions `super_admin`/opérateurs/publisher et des writers Auth. Vérifier le contrôle protégé du frontend Production réellement servi avant réouverture ; Preview ne lève pas T1.
3. **Effectuer une sauvegarde Cloud autorisée :** cible exacte, transport/client compatible, CA/TLS, droits et snapshot, périmètre Auth/configuration/clés/Storage/Vault, archive chiffrée hors Git et intégrité contrôlée. Les preuves synthétiques de transport ne prouvent pas la capture Cloud réelle.
4. **Restaurer cette archive en isolation adaptée :** destination jetable distincte du Cloud et du Local personnel, sorties externes désactivées, accès indépendant aux clés ; contrôler SQL/données/sécurité, Auth/MFA et application. Distinguer ces résultats d'une récupération du projet Cloud existant, encore à cadrer et prouver séparément.
5. **Valider la publication coordonnée autorisée :** réglages effectifs des intégrations, PR/merge, migrations et build du commit attendu, promotion manuelle après contrôle backend, vraie notification/changelog et relecture par une identité éligible sans doublon. Reprendre les résultats incertains avec les mêmes identifiants.
6. **Décider puis vérifier la réouverture :** contrôles préalables complets, levée explicite du gel puis de la maintenance, domaine/version/routes, Auth/MFA, lectures/écritures et notification. Aucun succès de test ne déclenche une réouverture automatique.

Une répétition sans publication réelle reste partielle. Sauvegarde, essai isolé avec données réelles et publication Production nécessitent leur propre périmètre et autorisation ; aucune de ces actions n'est effectuée ici.

## Vérifications de cette clôture

État Git, versions via Node et inventaire des fichiers de migration contrôlés. Les **8 fichiers Markdown** livrés ont passé le contrôle de **551 liens relatifs et 110 ancres**, sans erreur ; `git diff --check` passe. Périmètre Markdown et absence de changement des fichiers exécutables vérifiés. Aucun test applicatif, build, SQL, campagne Local ou contrôle distant relancé : aucun comportement exécutable ne change.

Version `0.8.33` conservée. Aucun code, migration, donnée Cloud ou configuration distante modifié ; aucun commit ni push. Phases 9 et 10 inchangées.
