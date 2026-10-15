# PROD.7C.1 — Préparation de la première activation maintenance Production

## Décision proposée et portée

**Retenir une installation initiale fermée : préparer `maintenance_production: true`, merger classiquement `dev` vers `main`, attendre les deux intégrations, puis promouvoir manuellement le build Vercel Production du SHA de merge. Vérifier le 503 MY. sur le domaine Production et conserver cet état fermé.** Aucun nouveau mécanisme nécessaire.

Cette séquence est une **exception initiale d'installation**, préalable à la répétition complète : l'ancien déploiement sans middleware ne peut pas être fermé par Global Config avant le merge. Elle ne constitue ni l'exécution normale A–E ni une publication complète validée sans sauvegarde. Elle nécessite une autorisation future explicite couvrant le merge, ses effets Supabase et l'indisponibilité créée par la promotion. La présente préparation n'autorise aucune de ces actions.

La procédure courante reste dans [11-PUBLICATION-PRODUCTION.md](../11-PUBLICATION-PRODUCTION.md). Ce rapport documente seulement l'exception initiale, ses préconditions et ses preuves. **Aucune réouverture, notification, sauvegarde, restauration ou répétition complète PROD.7C engagée ici.** Version `0.8.33` conservée ; documentation uniquement.

## État réellement vérifié le 15 octobre 2026

### Dépôt et GitHub

| Élément | Observation directe pendant PROD.7C.1 |
|---|---|
| Instructions | `AGENTS.md` racine lu ; seul fichier de ce nom trouvé dans les fichiers non ignorés. Documentation source de vérité, développement sur `dev`, PR puis merge classique vers `main`, aucune action distante de modification autorisée |
| Worktree initial | Propre, branche `dev` |
| HEAD et branche GitHub `dev` | `e9c0f6f6e56accee92290a98a9a6fc6796a2130e` ; HEAD, référence `origin/dev` et `git ls-remote origin refs/heads/dev` concordants |
| `main` local et GitHub | `d9b7bcc9364235c700b7b6d668824a6e68d37035` ; référence `origin/main` concordante ; lecture distante par `git ls-remote`, sans fetch ni mutation de référence |
| Branche GitHub par défaut | `git ls-remote --symref origin HEAD` indique `refs/heads/main` |
| Versions | Node confirme package / lockfile / entrée racine : `0.8.33` / `0.8.33` / `0.8.33`. `git show main:package.json` : `0.8.23` |
| Écart de branches | 16 commits propres à `dev`, 2 à `main` selon `git rev-list --left-right --count main...dev` ; le futur SHA de merge sera à relever, sans l'assimiler au SHA de `dev` |
| Maintenance sur `main` | Aucun `middleware.ts` dans son arbre ; `vercel.json` ne contient que le fallback SPA vers `/index.html` |
| Maintenance sur `dev` | `middleware.ts`, page autonome et `proxy.entrypoint` présents. Commandes install/build épinglent npm `12.1.0` ; fallback SPA conservé |
| SDK versionnés | `@vercel/functions@3.9.11`, `@vercel/global-config@1.5.1` |
| Configuration des intégrations | Aucun fichier suivi sous `.github/` ou `.vercel/`. Branche Production, assignation des domaines, protections et variables restent des réglages distants à relire |
| Supabase versionné | 52 migrations SQL ; `main` en contient 48. Quatre ajouts, aucune migration historique modifiée entre les deux branches |
| Configuration et Edge | Aucun diff `main..dev` de `supabase/config.toml` ni de `supabase/functions/`. Projet Local `my-local`, migrations activées, seed désactivé, aucun bloc `[remotes]` actif ni bucket déclaré ; fonction `delete-account` déclarée avec `verify_jwt=false` |

Les quatre migrations supplémentaires sont :

- `20261013133423_prod2_business_write_freeze.sql` ;
- `20261013135415_prod2_freeze_admission_barrier.sql` ;
- `20261015103447_prod7b21_app_roles.sql` ;
- `20261015123024_prod7b22_superadmin_freeze.sql`.

L'écart Supabase contient aussi des tests et un fichier sous `supabase/snippets/`. Ce ne sont pas des migrations : leur présence ne demande pas d'exécuter leur SQL pendant cette installation.

### Checkpoints distants conservés, sans nouvelle campagne

Le [checkpoint PROD.7B.2.3](2026-10-15-PROD7B23-PREVIEW-CLOUD.md) reste la dernière preuve **rapportée par le propriétaire** : 52 migrations Cloud, variables Supabase Preview/Production, Preview avec Cloud fonctionnelle, Auth/MFA, rôle `super_admin` et création/suppression sous gel vérifiés. Gel final déclaré `frozen=false`, révision `4`. Cette révision n'est pas une valeur opérationnelle à réutiliser sans relecture.

[PROD.7A](2026-10-14-PROD7A-PUBLICATION-AUDIT.md) rapporte branche Vercel Production `main`, **Auto-assign Custom Production Domains désactivé**, intégration Supabase GitHub Production activée sur `main`, working directory `.`, aucune branche Supabase Preview. Domaine déclaré : `my.collectrealm.com` ; protection Vercel Authentication / All Deployments à conserver. Ces réglages ne sont pas déduits du dépôt ni revérifiés dans les consoles ici.

**Non vérifiés en direct ici :** déploiement réellement assigné au domaine, son ID/SHA, état des clés Global Config et connexion serveur Production, paramètres effectifs des deux intégrations, historique détaillé Cloud, fonction Edge déployée et état actuel du gel. La branche GitHub `main` vérifiée ne prouve pas à elle seule la version actuellement servie.

[PROD.1](2026-10-13-PROD1-MAINTENANCE.md) reste la preuve historique locale du middleware et de son packaging ; ses tests ne sont pas rejoués. [PROD.7B.2](2026-10-14-PROD7B2-FRONTEND-VERIFICATION.md) conserve le blocage T1 avant réouverture. La clôture Preview/Cloud ne prouve pas le frontend Production exact ni la récupération Cloud.

## Problème exact de première mise en service

La séquence normale demande fermeture frontend et gel backend avant sauvegarde et merge. Or Global Config est une donnée lue par le middleware **du déploiement qui reçoit la requête**. Ajouter une clé ou changer sa valeur ne peut pas installer du code dans le déploiement `0.8.23`.

Ainsi, préparer `maintenance_production=true` avant le merge ne ferme pas l'ancien site. Même après construction du nouveau build, le domaine reste sur l'ancien tant que la promotion manuelle n'a pas eu lieu. C'est **la première promotion d'un build équipé** qui rend la fermeture MY. effective sur le domaine. Vercel Authentication protège l'admission séparément ; une page de login Vercel n'est pas un 503 MY.

Le middleware existant possède déjà les invariants nécessaires : environnement serveur `VERCEL_ENV`, clé Production indépendante de Preview, seul booléen JSON `false` ouvrant, lecture cohérente sans ancien état de repli, fermeture sur erreur ou dépassement de trois secondes, aucune exception de domaine, chemin, utilisateur ou header. L'import de page utilise bien l'extension émise `.js`.

La fermeture frontend n'arrête ni un ancien onglet ni les accès directs Supabase. Cette installation ne modifie pas le gel Cloud et ne certifie pas une fermeture coordonnée pour sauvegarde.

Les URLs générées d'anciens déploiements sans middleware ne sont pas modifiées par la promotion. Elles peuvent encore servir leur ancien frontend après admission Vercel ; conserver leur inventaire et All Deployments. Le 503 du domaine courant ne démontre pas leur fermeture. Toute URL historique accessible aux utilisateurs dans le périmètre d'une future fermeture globale doit être traitée explicitement avant de déclarer cette fermeture acquise, sans suppression de déploiement ou changement de protection implicite dans ce bootstrap.

## Options comparées

| Option réaliste | Effet et limite | Choix |
|---|---|---|
| Changer Global Config sur l'ancien déploiement | Aucun lecteur middleware : aucun effet sur ses réponses | Insuffisant |
| Installer avec `false`, promouvoir, puis passer à `true` | Permettrait un cycle ouvert/fermé sur le même build, mais sert d'abord le nouveau frontend et ajoute une ouverture à autoriser et contrôler | Écarté pour cette première installation fermée |
| **Préparer `true`, build Production en attente, promotion manuelle** | Nouveau build fermé sur son URL générée puis sur le domaine ; réutilise exactement le mécanisme futur. Ancien domaine reste sans maintenance jusqu'à promotion | **Retenu** |
| Extraire seulement le middleware dans une livraison séparée | Réduit la livraison initiale mais ajoute sélection de commits, version intermédiaire et réconciliation des branches ; ne supprime pas la première promotion nécessaire | Complexité inutile ici, sous réserve des préconditions Supabase |
| Promouvoir la Preview déjà validée | Peut déclencher un rebuild avec les variables Production ; autre identité d'artefact, aucun avantage sur PR/merge normal | Écarté |
| Changer branche Production, projet ou architecture | Modifie le workflow pour un problème ponctuel déjà couvert | Écarté |

**Pourquoi retenir cette option :** aucun code supplémentaire, aucun outil ajouté, même projet Vercel et même Supabase Cloud, état persistant indépendant du build. Après installation, les futures publications retrouvent A–E : le déploiement courant lit déjà Global Config avant tout nouveau merge. Seuls les anciens déploiements sans middleware restent incompatibles avec cette garantie.

## Effets Supabase du premier merge

La documentation officielle actuelle confirme que l'intégration GitHub peut traiter **migrations nouvelles, fonctions Edge déclarées et buckets déclarés**. Le déploiement Vercel en attente ne suspend pas ce travail backend ; les intégrations ne sont pas une transaction commune.

1. **Historique :** si les 52 identifiants versionnés correspondent exactement aux 52 entrées Cloud, aucune migration SQL n'est attendue. Les fichiers arrivant pour la première fois sur `main` ne sont pas automatiquement « nouveaux » pour la base. Le nombre 52 seul ne prouve pas cette correspondance ; vérifier les versions exactes et la provenance des fichiers appliqués. L'historique n'est pas une certification de l'égalité complète du schéma.
2. **Aucun rattrapage implicite :** une migration manquante, un historique incompatible ou un SQL inattendu fait sortir de cette installation frontend. Arrêter avant merge si l'écart est connu ; après merge, arrêter avant promotion et examiner les effets. Aucun `repair`, reset, rejeu forcé ou modification historique proposé.
3. **Configuration :** sans bloc `[remotes]` visant Production, les réglages de services API/Auth et seed sont ignorés par défaut sur une branche persistante. Les URLs localhost du fichier Local ne constituent donc pas un écrasement Auth/SMTP attendu. Ne pas réécrire ce fichier pour cette préparation ; confirmer ce traitement dans les journaux de l'intégration.
4. **Edge :** `delete-account` reste déclarée ; son source et le TOML sont identiques entre `main` et `dev`, mais cela ne démontre pas leur égalité avec le déploiement Cloud. Un déploiement ou une prise en compte du paramètre `verify_jwt=false` reste possible. Examiner identité du bundle, configuration et présence des secrets existants sans les exporter. Le contrôle utilisateur/password/TOTP appartient au handler ; aucune suppression de sécurité n'est proposée.
5. **Autres effets :** aucun bucket déclaré, seed désactivé ; aucun reset, import de catalogue, script de test ou snippet SQL demandé. Attendre le statut et les journaux de **tout** le workflow Supabase, y compris après l'étape migrations.

Le backend est déjà utilisé avec succès depuis Preview selon le checkpoint acquis. Il n'est pas nécessaire de rejouer ces validations ; les contrôles futurs ci-dessous portent sur **la cible, les changements prévus et le nouveau déploiement**, sans nouvelle mutation métier de test. Si un changement backend effectif non couvert apparaît, cette procédure minimale ne suffit plus : arrêter et recadrer, sans commencer ici sauvegarde ou restauration.

## Manipulations futures, dans l'ordre — non exécutées

### 1. Préflight de lecture et décision d'installation

**Manuel, avec Codex en lecture si disponible :** relever équipe/projet Vercel, domaine exact et alias, ID/SHA/environnement du déploiement courant ; vérifier s'il est effectivement dépourvu de middleware. S'il en possède déjà un opérationnel, le bootstrap est inutile : revenir à la procédure courante.

Relire Production / Branch Tracking : `main`, **Auto-assign Custom Production Domains désactivé** ; conserver Authentication / All Deployments. Vérifier framework Vite, racine, sortie, commandes et disponibilité serveur de `GLOBAL_CONFIG` en Production avec token de lecture, ainsi que variables Supabase attendues. Ne pas copier leurs valeurs dans le rapport ou dans Git. Une connexion ajoutée ou corrigée devra être présente **avant la construction** du nouveau build ; un changement de variable n'est pas un changement d'item à chaud.

Relire l'intégration Supabase : projet Cloud existant, dépôt, branche `main`, working directory `.`, Deploy to production, absence de branche Preview. Comparer en lecture les **52 versions** à la liste Git, examiner l'Edge actuellement déployée et relever l'état réel du gel. Ne changer ni intégration ni gel. Préparer l'inventaire des origins et chemins publics à contrôler, dont vrais JS/CSS de l'ancien et du futur build.

**Point de décision :** autoriser séparément l'installation initiale de la livraison `dev` complète `0.8.33`, avec absence de fermeture MY. de l'ancien site avant promotion, éventuel traitement Edge par l'intégration et maintien fermé après installation. Ce n'est pas un cherry-pick du seul middleware. En l'absence de cette décision ou des préconditions, rester à ce stade.

### 2. Préparer l'état fermé dans Global Config

**Manuel, après autorisation :** ouvrir le store existant connecté au projet, Items ; mettre uniquement `maintenance_production` au booléen JSON **`true`**, puis **Save Items**. Conserver `maintenance_preview` et les autres items. Relire la valeur enregistrée et noter heure/store, sans connexion ni token dans la trace.

La propagation fournisseur peut prendre jusqu'à dix secondes ; ce délai n'est pas une preuve. L'ancien déploiement reste dans son état antérieur. Ne pas annoncer « Production fermée » à ce stade.

### 3. PR puis merge classique via GitHub Desktop / GitHub

**Codex :** relire branche, statut, versions, diff de PR et inventaire des migrations ; comparer aux préconditions, sans relancer les tests Preview/Cloud acquis. Tout écart intervenu depuis ce rapport impose une nouvelle lecture ciblée. La préparation ne demande pas de nouvelle version applicative.

**Manuel :** lorsqu'ils seront autorisés, commit/push des documents sur `dev`, puis GitHub Desktop : préparer une Pull Request avec **base `main`, compare `dev`**, vérifier le diff sur GitHub et effectuer **Create a merge commit**, sans squash/rebase ni push direct sur `main`. Relever le SHA final du merge. Aucun de ces gestes n'est effectué dans PROD.7C.1.

### 4. Attendre et contrôler les déploiements sans promouvoir

**Manuel, avec lecture Codex possible :** suivre Supabase jusqu'au succès complet ; vérifier historique toujours conforme, aucune migration inattendue, traitement Edge et configuration prévus. Une étape « migrations à jour » ne suffit pas si Deploy échoue ensuite.

Identifier le nouveau build Vercel : environnement **Production**, SHA final du merge, version attendue `0.8.33`, état Ready, middleware effectivement empaqueté, variables et réglages attendus. Vérifier que le domaine reste attaché à l'ancien déploiement et que le nouveau attend la promotion. Ne pas sélectionner la Preview de `dev`.

Sur **l'URL propre au nouveau déploiement Production**, avec admission Vercel normale, contrôler le 503 MY. et les headers définis ci-dessous ; examiner les Runtime Logs après ces requêtes. Cette URL lit elle aussi `maintenance_production`. Aucun besoin de mettre la clé à `false` pour tester la fermeture. Si la connexion Global Config est mauvaise, corriger seulement dans une intervention autorisée et produire un build identifié contenant la bonne configuration ; ne pas masquer l'erreur par un bypass.

### 5. Promouvoir le build Production fermé

**Manuel :** après réussite des contrôles Supabase et du nouveau build, menu du déploiement **Production** attendu → **Promote** ; vérifier la cible dans le dialogue. La promotion d'un build Production en attente assigne les domaines **sans rebuild**. Aucun CLI supplémentaire nécessaire.

Relever l'ID devenu Current, SHA, version et assignations. Ils doivent correspondre au déploiement contrôlé à l'étape 4. `maintenance_production` reste `true`. **C'est ici que la fermeture MY. devient attendue sur le domaine.**

### 6. Vérifier le domaine et arrêter cette installation

**Manuel, avec préparation Codex possible :** contrôler les réponses réseau sur le domaine Production exact, puis alias/origins compatibles inventoriés, après admission Vercel normale. Nouvelle navigation et cache navigateur désactivé ; un ancien onglet React ne prouve pas la réponse actuelle du serveur. Conserver heure, ID/SHA, chemins et observations, sans cookie, secret, HTML personnel ou token.

**État final visé :** même déploiement Production promu, domaine fermé par MY., `maintenance_production=true` conservé ; aucune modification du gel Cloud par cette installation. **S'arrêter ici**, sans notification ni ouverture temporaire. La coordination backend et les étapes sauvegarde/restauration/publication relèvent des sous-phases suivantes autorisées séparément.

## Contrôles de réussite et limites de preuve

| Contrôle ciblé | Réussite exigée |
|---|---|
| Identité | Build Production du SHA final de merge, même ID avant/après promotion, domaine assigné à cet ID ; version corroborée par sources/sorties du build, pas par une version affichée sur la page 503 |
| GET | `/`, `/login`, `/dashboard`, `/index.html`, chemin inconnu, vrais JS/CSS ancien et nouveau, favicon/robots : **HTTP 503** avec page MY. autonome, titre exact `Maintenance en cours · MY.` ; pas de SPA ni asset servi normalement |
| HEAD | Même statut et headers, corps vide, pour les chemins contrôlés |
| Headers | `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`, `Pragma: no-cache`, `Expires: 0`, HTML, `X-Robots-Tag: noindex, nofollow, noarchive`, CSP de fermeture avec `default-src 'none'` |
| CDN | Relever les headers CDN et les éléments de cache/logs accessibles. Vercel peut consommer ses headers CDN ; leur seule absence dans le navigateur ne prouve ni cache ni absence de cache |
| Runtime | Absence de HTTP 500/`ERR_MODULE_NOT_FOUND` ; connexion/clé enregistrées et diagnostics Global Config examinés. Un 503 issu de `config_unavailable`, `state_invalid` ou d'un timeout démontre une fermeture de sécurité, **pas une configuration fonctionnelle validée** |
| Frontière Vercel | Accès normal habilité, sans bypass ; 401/403, login Vercel, redirection, 304, erreur réseau ou 503 générique ne valident pas le middleware MY. |

Réutiliser [l'outil HTTP existant](../../scripts/maintenance/http-check.js), si utile. La commande suivante **génère uniquement du code hors connexion** ; son exécution distante appartient à l'intervention future :

```powershell
npm.cmd run maintenance:http -- --print-browser --expect closed
```

Le snippet utilise une session Vercel normale sur le même origin. La CSP de la page maintenance interdit fetch : si elle bloque le snippet, utiliser navigation et panneau Network pour les mêmes GET/HEAD, sans désactiver CSP/Authentication. Compléter la liste par les vrais assets publics. Ne pas employer `vercel curl` ou un secret/header de bypass.

**La première promotion déjà fermée prouve installation et réponses fermées, pas un cycle `false → true → false` sans déploiement.** Aucun tel cycle ni réouverture n'est proposé dans ce bootstrap. La capacité de changement à chaud est documentée par Vercel et implémentée, mais sa validation réelle en Production restera distincte. Échantillons HTTP : `worldwide_propagation_verified=false`.

**T1 reste ouvert :** cette preuve de fermeture ne montre pas le frontend applicatif Production servi sous maintenance. Ne pas transformer `maintenance_production=false` en test d'accès opérateur, ni substituer Preview/Ready/inspection d'artefact au critère E. Aucun bypass, changement de niveau de preuve ou assouplissement d'E retenu ici. Réouverture et preuve complète du parcours Production restent conditionnées à la décision et aux contrôles de la procédure courante.

## Conditions d'arrêt et reprise

- Avant merge : cible, état actif, protection, promotion manuelle, variable Production ou historique exact inconnus ; modification SQL/Edge non couverte ; absence d'autorisation de cette exception initiale → **ne pas merger**.
- Après merge : Supabase incomplet/incertain, migration inattendue, mauvais SHA/environnement, build incorrect ou 503 non conforme → **ne pas promouvoir**. L'ancien domaine n'est pas fermé par MY. ; ne pas prétendre le contraire.
- Après promotion : identité incertaine ou réponse normale sur un chemin à fermer → **ne pas déclarer l'installation réussie**, conserver `true`, examiner assignations/logs/cache et décider explicitement de la correction. La clé seule ne garantit pas la fermeture si le mauvais déploiement sert le domaine.
- Erreur de Global Config : garder l'état fermé, réparer la cause ; aucun passage à `false`, timeout d'ouverture ou suppression de garde.
- Ancien déploiement sans middleware : **pas un rollback compatible maintenance**. Le rollback vers `0.8.23` peut rouvrir le frontend malgré `true` ; aucun rollback automatique proposé. Il ne restaure pas Supabase.
- Un ancien onglet et un accès direct Supabase peuvent rester actifs ; aucune preuve de gel/drainage, autorisation de backup ou sécurité de récupération déduite du 503. Aucun arrêt ou gel backend implicite ajouté.

## Sources, vérification documentaire et prochaine action

Documentation publique consultée le 15 octobre 2026 via Context7, bibliothèques `/websites/vercel`, `/supabase/supabase` et `/websites/supabase`. Elle établit les capacités des fournisseurs, pas leur activation dans MY. :

- [Vercel : staging Production et promotion manuelle sans rebuild](https://vercel.com/docs/deployments/promoting-a-deployment) ; [promotion Preview avec rebuild](https://vercel.com/docs/deployments/promote-preview-to-production).
- [Vercel : middleware avant cache](https://vercel.com/docs/routing-middleware), [Global Config](https://vercel.com/docs/global-config/using-global-config), [dashboard](https://vercel.com/docs/global-config/global-config-dashboard) et [propagation](https://vercel.com/docs/global-config/global-config-limits).
- [Supabase : intégration GitHub Production](https://supabase.com/docs/guides/deployment/branching/github-integration), [portée des déploiements](https://supabase.com/docs/guides/deployment), [historique des migrations](https://supabase.com/docs/guides/local-development/cli-workflows).
- [Changelog Supabase](https://supabase.com/changelog.md) consulté ; aucune modification de SDK, CLI, protocole TLS ou configuration demandée par cette préparation.

Vérifications de cette sous-phase : lectures Git locales et références GitHub distantes, versions par Node, diff des configurations/Edge et inventaire des migrations, analyse des chemins middleware/HTTP et des checkpoints. Aucun test applicatif ni campagne Local/Preview/Cloud rejoué : seul Markdown change. Liens locaux du rapport et de la procédure contrôlés ; `git diff --check` réussi. Aucun accès aux projets Vercel/Supabase, secret lu, migration appliquée, paramètre modifié, commit ou push.

**Prochaine action proposée : effectuer uniquement le préflight de lecture de l'étape 1**, dans les consoles Vercel et Supabase, pour consigner déploiement courant, connexion Global Config Production, promotion manuelle et correspondance exacte des 52 migrations/Edge. Puis présenter la cible et le SHA de livraison pour autoriser séparément l'installation initiale fermée. **Aucun merge, changement d'item, déploiement ou promotion à ce stade ; ne pas commencer sauvegarde, restauration ou publication complète.**
