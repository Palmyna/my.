# Phase 8I.1 — Audit transversal et préparation du checkpoint Cloud

12 octobre 2026 — version **0.8.20**. Intervention d’audit, de préparation et de documentation uniquement. **Phase 8 reste en cours.**

**Verdict : GO sous conditions pour préparer le checkpoint manuel.** Aucun défaut bloquant connu dans les interactions Local examinées. Avant toute application Cloud, le propriétaire devra confirmer l’historique Remote, une récupération réellement disponible, les privilèges managés et le périmètre exact du dry-run. Ce verdict ne constitue aucune autorisation de migration ou de déploiement.

## 1. État initial et frontières

| Contrôle exécuté avant l’audit | État réel |
|---|---|
| Branche | `dev` |
| HEAD | `d9e794b4d02e8c2edaa0b5a26e1011e419ffdbf3` — `v0.8.19` |
| Derniers commits | `d9e794b` 0.8.19 ; `f35b920` 0.8.18 ; `c85b313` 0.8.17 ; `1e2644f` 0.8.16 ; `21271cf` 0.8.15 ; `fb3a2d0` 0.8.14 |
| Git initial | Worktree propre, aucun fichier staged ou changement préexistant |
| Instructions | `AGENTS.md` lu ; documentation du dépôt prioritaire, frontières de cette intervention conservées |
| Package et lock | `0.8.19` dans les trois champs de version ; passage à `0.8.20` seulement, dépendances conservées |
| Outillage | Node 24.20.0, npm 12.1.0, Supabase CLI installé 2.120.0 ; aucune mise à niveau |
| Supabase Local | PostgreSQL 17.6, base `postgres`, port 55322 ; API 55321, Auth/PostgREST accessibles |
| Migrations | **48 fichiers / 48 versions appliquées Local**, dernière `20261011191625` |
| Services complémentaires | Edge Runtime observé en fonctionnement, sans exécution de parcours Edge ; Vector en redémarrage, problème Local préexistant. Aucun service réparé ou relancé par cet audit |
| Cloud | Dernier checkpoint documenté : **29 migrations jusqu’à `20261007085921`**, communiqué par le propriétaire à la fin de Phase 7. État Remote actuel inconnu |

La colonne `remote` de `migration list --local` décrit l’historique de la connexion **Local**. Elle n’est pas une vérification Cloud. Aucune connexion Supabase Cloud, requête Remote, commande `db push`, dry-run distant, opération de provisioning ou configuration Vercel/GitHub/DNS n’a été exécutée.

Volume actuel : **deux collections contrat 2, 257 items, trois exemplaires, sept intentions, quatorze reçus**. Les trois tables notifications sont vides. Les quatre collections legacy / 660 items décrits dans les premiers rapports 8B/8C ne sont plus présents dans ce volume ; l’écart avait déjà été signalé en 8E. Aucune cause ni conservation de lignes absentes n’est inventée. Aucun parent historique n’est recréé ou converti ici.

## 2. Sources étudiées et méthode

Références : README, [Fonctionnalités](../01-FEATURES.md), [Modèle](../03-DATA-MODEL.md), [UX/UI](../04-UX-UI.md), [Architecture](../05-ARCHITECTURE.md), [Database](../06-DATABASE.md), [Pipeline](../07-CATALOG-SYNC.md), [Roadmap](../08-ROADMAP.md), [contrats Catalogue](../09-CATALOG-CONTRACTS.md), [publication terminal](../10-NOTIFICATION-PUBLICATION.md).

Rapports de conception et preuves consultés : [8A.2](2026-10-08-PHASE8A2-RELATIVE-ORDER-ALGORITHM.md), [8A.3](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md), fondations et contrats 8B.1 à 8B.7, [clôture 8B.8](2026-10-10-PHASE8B8-CLOSURE.md), [8C](2026-10-10-PHASE8C-CLOSURE.md), [8D](2026-10-10-PHASE8D-CLOSURE.md), [8E](2026-10-11-PHASE8E-CLOSURE.md), [writer 8F.1](2026-10-11-PHASE8F1-APPLY-WRITER.md), [services 8F.2](2026-10-11-PHASE8F2-APPLICATION-SERVICE.md), [clôture 8F.3](2026-10-11-PHASE8F3-CLOSURE.md), [8G.1](2026-10-11-PHASE8G1-NOTIFICATION-FOUNDATIONS.md), [8G.2](2026-10-11-PHASE8G2-NOTIFICATION-API.md), [clôture 8G.3](2026-10-11-PHASE8G3-CLOSURE.md), [8H.1](2026-10-11-PHASE8H1-NOTIFICATION-CENTER.md), [8H.2](2026-10-12-PHASE8H2-NOTIFICATION-ACTIONS.md), [clôture 8H.3](2026-10-12-PHASE8H3-CLOSURE.md), [checkpoint Phase 7](2026-10-08-PHASE7-CLOSURE.md).

L’audit croise les rapports avec les migrations versionnées, les **définitions et ACL réellement présentes Local**, les assertions pgTAP 023 à 038, les services/décodeurs, les caches et hooks de mutation, les trois vues, les dialogues d’aperçu/contenu, les consommateurs notifications, le pipeline catalogue et la fonction Edge `delete-account`. Une clôture antérieure seule ne suffit pas à conclure sur une interaction.

Skills de vérification, Supabase, Context7 et préparation des déploiements Vercel utilisés. Mémoire antérieure utilisée pour localiser les mécanismes ; les constats courants proviennent du dépôt et de Local. Aucun agent délégué. Documentation officielle obtenue via Context7 après résolution des bibliothèques Supabase/CLI, Vite, Vercel et node-postgres ; aide de la CLI **installée** consultée pour les flags réellement disponibles. Le changelog public Supabase a été récupéré ; l’annonce TLS du 10 novembre 2026 et les tokens à périmètre restreint ne justifient aucun changement applicatif dans cet audit.

Sources officielles de préparation, consultées le 12 octobre 2026 :

- [CLI migrations et push](https://supabase.com/docs/reference/cli/supabase-db-push), [historique](https://supabase.com/docs/reference/cli/supabase-migration-list), [dump](https://supabase.com/docs/reference/cli/supabase-db-dump) ;
- [rôles PostgreSQL](https://supabase.com/docs/guides/database/postgres/roles), [restrictions superuser](https://supabase.com/docs/guides/database/postgres/roles-superuser), [privilèges hérités de PUBLIC](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c) ;
- [sauvegardes/restauration](https://supabase.com/docs/guides/platform/backups), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [URLs Auth](https://supabase.com/docs/guides/auth/redirect-urls), [changelog](https://supabase.com/changelog.md) ;
- [Vite sur Vercel et fallback SPA](https://vercel.com/docs/frameworks/frontend/vite), [branche de production](https://vercel.com/docs/git), [domaine](https://vercel.com/docs/domains/add-a-domain), [retour arrière](https://vercel.com/docs/instant-rollback) ;
- [variables Vite](https://vite.dev/guide/env-and-mode), [TLS node-postgres](https://node-postgres.com/features/ssl).

## 3. Livraisons et audit transversal

### 3.1 Inventaire

| Bloc | Livraison conservée | Frontière actuelle |
|---|---|---|
| 8A | R1–R4, 36 scénarios, conception du journal/rejeu, révisions, reçus, token et notifications | Conception validée ; pas une preuve d’exécution Cloud |
| 8B | Fondations privées, moteur pur, writers move/add/remove v2, reçu, lecteur et hooks, activation des nouvelles créations | Parents existants v1 conservés ; pas de conversion implicite |
| 8C | `is_hidden`, mutation propriétaire, progression Dashboard/overview autoritative | Automatiques des parents automatiques v2 seulement |
| 8D | Actions Liste/Cartes, filtres communs, reorder filtré, Classeur compacté | Classeur consultatif ; recherche partielle interdit reorder |
| 8E | Détection structurelle, contexte cohérent, plan/token et aperçu pur | Statut legacy lisible ; preview v2 seulement |
| 8F | Application atomique, reçu et reprise, consentement UI et relectures | Aucune application automatique ; requête exacte conservée |
| 8G | Stockage privé, projection, cinq RPC utilisateur, publication/retrait dédiés | Script publisher Local seulement ; annonces exigeant action refusées |
| 8H | Cloche, compteur exact, panneau paginé, lecture/traitement, navigation aperçu/application | Pas de polling ; limites axe et autres moteurs explicites |

### 3.2 Ordre, révisions et compatibilité

**Cohérence confirmée par inspection croisée et preuves applicables.** Les lecteurs affichent `sort_position,id`, jamais un second ordre reconstruit dans React. Le moteur de fusion reconstruit le canonique cible complet puis rejoue **toutes** les intentions dans leur chronologie totale. R1 conserve le suffixe historique immuable ; R2 résout les gestes dans la séquence complète, masqués compris ; R3 conserve UUID/introduction/intentions à la conversion et renouvelle l’identité après retrait réel ; R4 exclut annulations/no-ops et déduplique les retries, tout en conservant le premier placement manuel.

Les trois writers v2 partagent parent, révision et magasin de reçus. Les writers legacy prennent le même verrou parent et refusent un parent v2. Les nouvelles collections libres/automatiques deviennent v2/révision zéro ; retrouver une automatique existante conserve son contrat et son état. L’activation ne reconstitue aucun geste historique. Le reader v2 et les services restent compatibles avec les deux contrats ; caches et décodeurs historiques/v2 ne sont pas confondus.

Chaque requête v2 lie UUID et paramètres exacts à une empreinte. Autorisation actuelle obligatoire ; reçu historique consulté avant comparaison avec la révision ou la présence actuelle du sujet. Résultat incertain : sessionStorage du même onglet conserve UUID/requête/token ; reçu puis relectures autoritatives confirment l’état. **NULL de reçu n’autorise aucune nouvelle opération.** Fermeture définitive de l’onglet et stockage corrompu restent des limites documentées, pas une reprise entre onglets livrée.

Les exemplaires appartiennent au compte et à la variante, indépendamment de l’item. Reorder, retrait, conversion et application ne suppriment ni exemplaire ni note. Le lecteur partagé consulte possession/progression du propriétaire ; les mutations de collection et d’exemplaires restent interdites au destinataire par UI et backend. Le volume actuel ne permet pas de tester de vrais parents legacy ; les fixtures legacy et preuves de conservation des premières campagnes restent la source de validation de ce cas.

### 3.3 Masquage, progression, filtres et navigation

Le writer hide modifie le booléen et la révision/reçu seulement : aucune intention, position, origine, rang ou copie. Le CHECK et le trigger parent interdisent manuel masqué et parent libre. `dashboard_collections`, **SECURITY INVOKER**, exclut les automatiques masquées des deux agrégats, garde les manuels et compte une variante possédée une seule fois, même avec plusieurs exemplaires. Dashboard, overview et partage lisent cette même projection. Le booléen `owned` demeure vrai sur une carte masquée possédée.

`CollectionContentView` filtre d’abord le contenu complet par `Non masquées`/`Toutes`, puis applique la recherche. Le choix est commun aux trois vues et réinitialisé à un autre viewer/parent. Reorder Liste/Cartes en vue masquée utilise les gestes serveur sur l’ordre complet : enlever le seul sujet donne le même ordre relatif des autres éléments. Une recherche textuelle réellement partielle bloque toujours le reorder. Sous `Toutes`, cartes masquées et possession gardent leurs indications distinctes.

Classeur pagine la séquence du filtre, sans écrire l’ordre. Recherche garde ces pochettes, navigue par occurrences et remappe page/halo après changement de filtre. Les préférences de vue/format et la navigation par IDs restent indépendantes. Tout masqué produit `0 / 0`, sans division ou progression React alternative. Partage propose filtres/recherche, sans œil ou reorder. Aucun effet sur exemplaires constaté dans les preuves 8C/8D/8F.

### 3.4 Catalogue, aperçu, consentement et application

Le pipeline écrit catalogue, mappings, aliases, overrides, journal technique et états canoniques ; **aucun writer de collection ni suivi de notification n’est appelé**. Hash = SHA-256 du JSON compact des IDs exacts ordonnés. Une description seule ne modifie pas la structure ; un numéro de version supérieur avec structure identique ne suffit pas à proposer une actualisation. Le prédicat `private.collection_update_available` est partagé entre contexte 8E et projection 8G : pas de deux règles de disponibilité.

L’aperçu réutilise `merge_collection_relative_order`, tous les items/masques et intentions. Pas d’UUID réservé, mutation, révision, reçu ou acquittement par la RPC preview. Maintien/conversion garde identité ; nouveaux automatiques et convertis visibles, automatiques maintenus gardent leur masque ; retrait automatique ne convertit pas arbitrairement en manuel. Manuels hors canonique restent présents. Une cible vide peut actualiser un parent existant ; nouvelle création automatique vide reste refusée.

Token strict à six champs, BIGINT décimaux exacts. Catalogue partagé **771402 avant parent**, puis relecture après attente ; même contexte/plan/hash recalculé par apply. Déplacement, ajout, retrait, hide ou catalogue concurrent rendent le token obsolète. `preview_stale` et `collection_structure_conflict` sont rendus en HTTP 409 sans retry PostgREST silencieux. Copies, notes, nom et préférences ne périment pas le plan structurel.

Le dialogue ne confirme qu’un aperçu frais **rendu** avec ses métadonnées et contenu complet. Cache invalidé, révision différente ou erreur imposent une nouvelle consultation. Une relecture encore en vol suspend la confirmation ; la correction 8H.3 évite une fausse alerte/fuite de focus si la même révision revient. Une seule confirmation ; aucun nouveau token au retry. Apply matérialise exactement l’ordre complet `1…N`, alloue seulement les ajouts, convertit/retire, avance une révision et une version, puis enregistre un reçu dans la même transaction. Aucune réussite UI avant les relectures ; reprise connue ne renvoie pas un deuxième writer.

### 3.5 Notifications, confidentialité et publication

Une notification Collection est une **projection**, une clé stable par collection propriétaire automatique v2, révision = version cible. Aucun événement par version persisté, aucun fan-out lors d’une sync. Une incohérence cible est exclue de la projection ; le statut/aperçu la refuse de façon sûre. L’UI marque lue la seule version du plan effectivement présenté et frais ; une version ultérieure reste non lue. Cet acquittement ne donne aucun consentement 8F. Après apply/reprise et relectures confirmées, invalidation puis relecture du centre/compteur retirent la notification désormais appliquée ; aucune soustraction optimiste.

Annonce/changelog : audience par date d’inscription Auth serveur, non par création tardive du profil. `include_new_users` exige justification explicite. Expiration, retrait, publication future, inéligibilité et traitement excluent centre/contenu. Hash immuable lie consultation et suivi. Marquer lue ne traite pas ; contenu texte frais rendu déclenche traitement de ce hash pour une annonce sans action obligatoire. Une annonce exigeant une résolution non implémentée ne devient pas traitable par clic ; la publication de `requires_action=true` est refusée.

Pagination serveur `(updated_at DESC,notification_key)`, curseur fermé, compte global exact en chaîne décimale indépendant de la page. UI pages de 20, déduplication sans tri ; nouvelle tête remplace pages/curseurs et annule les réponses tardives. Badge absent à zéro, `99+` visuel au-delà de 99, nom accessible exact. Lectures explicites au montage/focus/visibilité avec fraîcheur de 30 secondes, à ouverture/actualisation et après invalidation. C’est le comportement autorisé en 8H ; les options de lecture 8G restent désactivées et il n’existe aucun polling.

Clés viewer-scoped, purge Auth globale, démontage immédiat et cancellation avant retrait des caches privés. Le scope de mutation recontrôle viewer/autorisation au dispatch. Navigation vers aperçu conserve une intention en mémoire jusqu’à la destination, relit les droits et annule une navigation concurrente gagnante. Pas de token dans URL, route administrative, HTML interprété ou corps privé dans la liste.

Publication séparée des utilisateurs : rôle dédié, deux fonctions privées, contenu normalisé et hash recalculé côté serveur, timestamp/auteur serveur. Même clé/contenu retourne le même résultat historique ; collision différente refuse ; retrait conserve provenance et états, sans réactivation. Les verrous clé/publication/état et revalidation d’expiration après attente sont compatibles avec les lecteurs/transitions. Ni annonce ni changelog ne sont publiés automatiquement par build ou sync.

### 3.6 Résultats et anomalies réelles

Aucun défaut fonctionnel bloquant connu dans les interactions examinées. Anomalies documentaires corrigées : compte courant Local resté à 40 dans README et 39 dans architecture, aperçu encore décrit « futur » dans Database, mentions d’interface 8H future dans pipeline/publication, mise en ligne encore reportée à la fin V1.

Reports historiques conservés. Les limites suivantes sont **volontaires ou encore non validées**, pas des fonctionnalités ajoutées implicitement : legacy sans preview/apply/hide v2, reprise limitée au même onglet, absence de notifications externes ou de gestion UI des partages, annonces avec action obligatoire non supportées, outils Cloud de publication/sync non implémentés, campagne manuelle exhaustive réservée à la première mise en ligne.

## 4. Preuves historiques et nouveaux contrôles

### 4.1 Preuves historiques réutilisées

Le HEAD initial est le commit de livraison 8H.3. Le backend, services, UI et tests ne sont pas modifiés en 8I.1. Les contrôles récents restent applicables ; leurs résultats ne sont pas additionnés aux anciens totaux.

| Preuve réutilisée | Exécution réelle / limites |
|---|---|
| 8H.3 pgTAP | **3 790 assertions PASS / 38 fichiers**, zéro ignorée ; parité des 1 213 cibles. Pas relancée en 8I.1 |
| 8H.3 Vitest | **2 421 PASS**, dix tests ignorés sur 2 431 ; 76 fichiers PASS et six conditionnels ignorés sur 82. Pas relancé en 8I.1 |
| 8H.3 intégrations opt-in | **Sept tests / trois fichiers PASS** : cinq RPC notifications, trois parcours actions 8H, trois parcours apply/reprise 8F. jsdom + SDK/PostgREST/PostgreSQL réels ; aucune preuve visuelle déduite |
| Opt-in non relancés en 8H.3 | `collection-hidden.local.test.tsx`, `collection-update.local.test.tsx`, `scripts/notifications/publication.local.test.ts` : un test chacun. Preuves anciennes 8C/8D/8E et 8G.3 conservées ; pas un nouveau PASS 8I.1 |
| Concurrence backend | Campagnes indépendantes 8B/8C/8E/8F avec connexions réellement superposées et waits observés. 8G.3 : dix scénarios publication/retrait et neuf transitions API. Réutilisées en 8H.3 puis ici ; aucune nouvelle concurrence multi-session revendiquée |
| 8H.3 lint/advisors/types/build/ESLint | PASS ; sept INFO attendues `rls_enabled_no_policy`, zéro WARN/ERROR ; chunk >500 kB préexistant. Pas de nouvelle exécution de lint SQL/advisors/ESLint en 8I.1 |
| Chrome 8H.3 | Session GoTrue/TOTP réelle, API Local réelle ; 1280×900, 820×1180, 390×844, focus/pagination/contenu/aperçu/apply. Pas de nouveau navigateur en 8I.1 |
| Accessibilité | Axe 8H.3 zéro violation détectée mais `color-contrast` et une règle ARIA incomplets ; vérifications ponctuelles distinctes. Ni certification, ni autre moteur, lecteur d’écran ou appareil physique. Erreurs HTTP visuelles restent à compléter |
| Conservation | Snapshots Local avant/après de chaque campagne. 8H.3 : 23 tables, 59 fonctions/ACL, rôle et migrations identiques. Pas une conservation prouvée sur Cloud |

8H.1/8H.2 ne fournissaient pas de parcours navigateur validé ; leur absence est couverte seulement par les contrôles **effectivement acquis en 8H.3**, sans réécrire ces rapports. Réponses perdues après commit SQL réel et erreurs de relecture étaient injectées dans le transport ; aucune panne réseau physique n’est revendiquée.

### 4.2 Contrôles nouveaux 8I.1

| Vérification nouvellement exécutée | Résultat |
|---|---|
| Git / version / historique Local | État initial confirmé ; 48 versions appliquées, 19 fichiers Phase 8, chacun avec un seul BEGIN/COMMIT |
| Inspection PostgreSQL read-only | **22 tables applicatives + une vue**, 53 policies, 135 contraintes toutes validées, 58 index tous valides/prêts, 22 triggers non internes ; trois composites privés inspectés |
| Fonctions | **59 corps installés comparés aux dernières définitions versionnées : tous identiques**. Attributs, owner, ACL et `search_path` inspectés ; aucun DEFINER sans `search_path=''` |
| Sécurité tables / colonnes / vue | RLS activée sur les 22 tables ; policies restrictives AAL2/profil et ACL de colonnes/default ACL inspectées. Journal/reçus/notifications privés fermés ; exception canonique Catalogue décrite ci-dessous. `dashboard_collections` conserve `security_invoker=true` |
| Publisher effectif | LOGIN/NOINHERIT, aucun attribut administratif, limite quatre, mot de passe absent ; aucun rôle dont il soit membre, aucun privilège table public/private/Auth ; deux seuls EXECUTE métier, aucun CREATE schema ni USAGE Auth |
| Séparation publication/utilisateurs | Zéro EXECUTE publication/retrait/préparation pour anon/authenticated/service_role/authenticator |
| Intégrité courante read-only | Zéro item masqué invalide, manuel v2 sans introduction, placement initial manquant, intention/reçu à révision future, item/copie orphelin |
| Parité canonique courante | **1 213 états recalculés, zéro divergence de hash** ; aucune synchronisation lancée |
| Types générés en mémoire | Identiques au fichier : SHA-256 `8fba623654865589f1abb6191cc0d0f6a1dc768659a3e6ee91c3a9ab86c935a4`. Aucune écriture ou édition manuelle des types |
| Version / dépendances / build documentaire | Contrôles finaux consignés en section 13 après exécution |
| Conservation avant/après | Comparaison finale des 23 empreintes de tables complètes, fonctions/ACL, rôle et historique consignées en section 13 |

Le compte administratif `postgres` apparaît **membre du rôle publisher**, accordé par `supabase_admin`. Sens opposé d’une élévation du publisher : celui-ci n’est membre d’aucun rôle. Le test d’identité du script contrôle bien les appartenances où **publisher est le membre**. USAGE `public` via PUBLIC reste sans CREATE ou privilège métier. La connexion réelle publisher/TLS n’a pas été retestée ici, aucun mot de passe provisionné.

Exception privée préexistante et nécessaire au canonique INVOKER : `authenticated` peut lire seulement `private.catalog_entity_keys.entity_key` et `source_card_id`, sous policy `catalog_card_keys_read`, limitée aux cartes accessibles par RLS. Aucun SELECT sur `variant_id`, privilège table ou écriture accordé ; schéma privé hors Data API. Cette exception, attendue dans pgTAP 004, ne concerne ni journal/reçus ni notifications. Les ACL de colonnes ne doivent pas être ignorées au profit des seules ACL de table. Publisher n’a **aucun accès colonne** public/private/Auth ; les sept autres tables privées n’ont aucun accès utilisateur/API. Les défauts du propriétaire `postgres` ferment les nouveaux objets applicatifs ; ceux des rôles système restent distincts et seront revérifiés Remote.

Écarts de capture de l’historique Local : **46/48** fichiers correspondent au SQL enregistré après normalisation des séparateurs. 7F.1 contient deux copies identiques des quatre statements, sous une seule version. 8B.2 conserve la définition initiale avant **sept casts explicites d’initialisation JSONB/text[]** ; la section sécurité de son rapport explique le refresh Local de la fonction finale et le rejeu transactionnel de la migration. Hors ces sept casts, le SQL enregistré correspond au fichier ; types déclarés identiques, comportement d’initialisation équivalent. La fonction réellement installée correspond intégralement au fichier final. Aucune dérive restante de corps de fonction détectée, aucune réparation d’historique ou modification de migration appliquée effectuée. Comparer l’historique Remote réel avant toute interprétation de ces captures Local.

Artefacts techniques ignorés par Git dans `.cache/8i1/` : métadonnées Local, empreintes de lignes sans contenu personnel, parité sources/fonctions, contrôle d’intégrité et sources publiques. Les lectures PostgreSQL utilisent transactions `REPEATABLE READ READ ONLY` puis rollback ; statut Local capturé en mémoire et cible loopback/port vérifiée. Aucun secret ni ligne Auth détaillée publié dans ce rapport.

## 5. Inventaire des 19 migrations Phase 8

Ordre chronologique après le dernier checkpoint **documenté** `20261007085921` : **10 migrations 8B, une 8C, deux 8E, une 8F, cinq 8G**. 8A/8D/8H ne créent aucune migration. Le nombre réellement manquant sur Cloud dépendra de son historique ; ne pas pousser aveuglément les 19.

Prérequis communs : socle Phase 7 cohérent (`public/private`, Auth/profils/AAL2, canonique, catalogue/états, lecteurs et writers legacy, vue Dashboard à onze colonnes), PostgreSQL/encodage compatibles, extensions requises, ownership/grant options vérifiés. Lire chaque fichier complet, dans cet ordre. Toutes les transactions sont explicites ; pas de `INDEX CONCURRENTLY`, reset, truncate, backfill de contrat ou destruction de collection utilisateur. DDL/validation de contraintes peuvent prendre des verrous et attendre des transactions : prévoir fenêtre calme, observation et stratégie d’arrêt. Les dépendances ci-dessous s’ajoutent à ce socle commun.

| Migration / bloc | Objets et dépendances | Données et RLS/ACL | Prérequis particulier, risque et contrôle après application |
|---|---|---|---|
| [20261008153458 — phase8b1_relative_order_foundations](../../supabase/migrations/20261008153458_phase8b1_relative_order_foundations.sql) / 8B.1 | Colonnes `personal_revision`, `order_contract_version`, `introduced_revision` ; journal/intents, receipts, PK/FK/CHECK, index sujet, immuabilité et helper de suffixe | Existants reçoivent **contrat 1/révision 0**, introduction NULL ; aucune intention reconstruite. Deux nouvelles tables privées RLS sans policies, révoquées aux rôles API | Colonnes/tables absentes et ownership correct ; risque verrou ALTER/UNIQUE. Vérifier défauts, contraintes, FK sujet cascade et références historiques sans FK vers ancres, zéro conversion |
| [20261008180634 — phase8b2_relative_order_engine](../../supabase/migrations/20261008180634_phase8b2_relative_order_engine.sql) / 8B.2 | Deux composites de projection, `merge_collection_relative_order` ; dépend B.1/helper/type de ligne intents | Calcul pur STABLE INVOKER, aucune donnée ; USAGE des types/EXECUTE du moteur révoqués aux API | Types/noms absents ; contrôler corps final avec casts explicites, signature/volatilité/ACL et cas R1–R4. Pas d’API publique de fusion |
| [20261008185717 — phase8b3_reorder_writer_v2](../../supabase/migrations/20261008185717_phase8b3_reorder_writer_v2.sql) / 8B.3 | `reorder_collection_item_v2` ; remplacement des trois writers legacy avec garde de contrat ; dépend B.1/B.2 | Aucune mutation à la migration. Nouveau DEFINER authenticated seul, anciens droits conservés | Gardes coordonnées avant activation. Vérifier v1 sur legacy, refus v1 sur v2, R1/no-op/reçu et ordre parent/items |
| [20261009061226 — phase8b4_manual_add_v2](../../supabase/migrations/20261009061226_phase8b4_manual_add_v2.sql) / 8B.4 | `add_manual_collection_item_v2`, protection introduction et triggers d’invariant initial différés ; dépend B.1/B.3 | Legacy exempt ; pas de backfill. Helpers fermés, writer DEFINER authenticated seul | Contrôle invariant au COMMIT sur v2 ; vérifier placement initial fin/début, masque inclus, introduction immuable et catalogue avant parent. Objets différés doivent être actifs |
| [20261009083806 — phase8b5_manual_remove_v2](../../supabase/migrations/20261009083806_phase8b5_manual_remove_v2.sql) / 8B.5 | `remove_manual_collection_item_v2` ; dépend journal/reçus et cycle initial B.4 | Aucune suppression pendant migration. Writer authenticated seul ; intentions propres supprimées seulement lors d’un retrait métier | Vérifier refus automatique, UUID de reçu conservé, retrait/réintroduction sans héritage, ancres historiques et copies intactes |
| [20261009092328 — phase8b6_operation_result](../../supabase/migrations/20261009092328_phase8b6_operation_result.sql) / 8B.6 | `get_collection_operation_result` ; dépend B.1 et formats des writers | Reader DEFINER authenticated seul, autorisation actuelle, parent verrouillé ; pas de donnée écrite | Vérifier résultat historique après sujet supprimé et révision avancée, refus tiers/AAL1/legacy ; NULL jamais transformé en succès |
| [20261009124754 — phase8b7_collection_content_v2](../../supabase/migrations/20261009124754_phase8b7_collection_content_v2.sql) / 8B.7 | Reader v2 enveloppant reader Phase 7 ; dépend B.1, contenu v1 actuel | INVOKER/RLS ; EXECUTE authenticated ; aucune modification du reader v1/donnée | Vérifier clé contrat/révision exacts, BIGINT et mêmes ordre/possession/partage ; client compatible nécessaire avant mutations v2 |
| [20261010064645 — phase8b8_activate_relative_order](../../supabase/migrations/20261010064645_phase8b8_activate_relative_order.sql) / 8B.8 | Défaut parent **2**, remplacement `create_automatic_collection` avec insert explicite 2/0 ; dépend B.3–B.7 | Parents existants inchangés ; aucune conversion ou remise à zéro. ACL création conservée | Suspendre créations par ancien client pendant transition. Vérifier nouveau libre/auto v2, existant retourné intact, création atomique/race et cible vide refusée |
| [20261010065918 — phase8b8_postgrest_structure_conflicts](../../supabase/migrations/20261010065918_phase8b8_postgrest_structure_conflicts.sql) / 8B.8 | Helper de conflit, remplacement des trois writers v2 ; dépend B.3–B.5 | Aucun DML ; helper privé fermé ; ACL writers conservées | Présence PostgREST et rendu PGRST/HTTP409 à vérifier. SQL direct 40001 ; pas de boucle automatique masquant stale |
| [20261010072938 — phase8b8_conflict_return_contract](../../supabase/migrations/20261010072938_phase8b8_conflict_return_contract.sql) / 8B.8 | DROP **sans CASCADE** du seul helper précédent, recréation en JSONB et writers adaptés ; dépend migration précédente | Pas de donnée supprimée ; ACL helper réappliquée, writers conservés | Toute dépendance inattendue bloque la transaction : ne pas ajouter CASCADE. Vérifier type de retour JSONB, trois writers et exceptions exhaustives |
| [20261010140428 — phase8c_persistent_hiding](../../supabase/migrations/20261010140428_phase8c_persistent_hiding.sql) / 8C | `is_hidden` false, CHECK/trigger parent, writer hide, reader v2 enrichi, vue Dashboard révisée ; dépend B v2 + vue Phase 7 | Existants visibles, aucune position/copie changée. Hide authenticated seul ; vue INVOKER et ACL conservées | Risque remplacement de vue : conserver **onze colonnes dont target_id**. Vérifier manuel/libre/legacy refusés, progression propriétaire/partage, 0/0, aucun accès DML direct |
| [20261011065009 — phase8e_collection_update_preview](../../supabase/migrations/20261011065009_phase8e_collection_update_preview.sql) / 8E | Composite contexte, helpers contexte/plan/hash, statut et preview ; dépend moteur, hide et conflit | Lectures/verrous seuls, pas de stockage preview ; helpers/type privés, RPC DEFINER authenticated | Hash/versions canoniques cohérents. Vérifier pureté, token six champs, statut legacy vs preview v2, conversion/masques/cible vide et ordre catalogue-parent |
| [20261011070549 — phase8e_context_conflict_guard](../../supabase/migrations/20261011070549_phase8e_context_conflict_guard.sql) / 8E | Remplacement du helper contexte avec garde d’exception explicite ; dépend E précédente/helper conflit | Aucun DML ou élargissement ACL ; correction additive de lint | Vérifier corps final, refus d’isolation fixe et exceptions, aucun chemin sans RETURN ; ne pas supprimer la garde comme redondante |
| [20261011081317 — phase8f1_apply_collection_update](../../supabase/migrations/20261011081317_phase8f1_apply_collection_update.sql) / 8F.1 | Helper stale et writer apply ; dépend E/B/C, reçus `kind=apply` déjà prévus dans B.1 | Pas d’apply pendant migration. Writer DEFINER authenticated, helper fermé ; copies/notes non concernées | Vérifier token recalculé, reçu avant contexte sur retry, rollback, HTTP409 stale, conversion même UUID et application/relectures ; un seul incrément |
| [20261011171608 — phase8g1_notification_foundations](../../supabase/migrations/20261011171608_phase8g1_notification_foundations.sql) / 8G.1 | Trois tables notifications, contraintes/index/trigger immuable, prédicat partagé, projection, contexte E factorisé ; dépend E/F et Auth | Tables vides, sans fan-out/backfill ; privées RLS sans policies, API révoquées. Aucun suivi créé par sync/preview | Vérifier unicité clé, dates/suivi, owner-only/v2-only, disponibilité commune statut/projection ; états appliqués/structure identique exclus |
| [20261011172335 — phase8g1_notification_validation](../../supabase/migrations/20261011172335_phase8g1_notification_validation.sql) / 8G.1 | Prédicat STABLE et contraintes texte utile ; dépend G.1 | Validation des lignes de la nouvelle table, normalement vide si appliqué d’un bloc ; ACL inchangées | Si G.1 a déjà été utilisé Remote, vérifier contenus avant CHECK. Contrôler volatilité et refus texte blanc ; ne pas modifier le schéma pour masquer INFO RLS |
| [20261011182146 — phase8g2_notification_api](../../supabase/migrations/20261011182146_phase8g2_notification_api.sql) / 8G.2 | Helpers caller/audience/projection, cinq RPC centre/compteur/contenu/lecture/traitement ; dépend G.1 + B/F | Auth/AAL2/profil ; helpers fermés, RPC authenticated seules. États sparse écrits seulement à utilisation | Vérifier audience Auth, compteur global, curseur/microsecondes, ancienne observation vs nouvelle version, traitement non forcé et inéligibilité sans fuite |
| [20261011185605 — phase8g3_notification_publication](../../supabase/migrations/20261011185605_phase8g3_notification_publication.sql) / 8G.3 | CREATE ROLE publisher sans mot de passe, CONNECT/USAGE private, préparation + publication/retrait ; dépend G.1/G.2 | Aucun contenu publié. Deux EXECUTE privés pour publisher ; zéro droit table. Helpers/publication révoqués aux API/authenticator | **Privilèges managés, collision de nom, grant CONNECT/USAGE et ACL PUBLIC à vérifier avant push.** Pas de rôle homonyme provisionné en amont. Vérifier identité, NOINHERIT/non-admin, deux fonctions, clé/hash/idempotence/retrait |
| [20261011191625 — phase8g3_notification_expiration_validation](../../supabase/migrations/20261011191625_phase8g3_notification_expiration_validation.sql) / 8G.3 | Remplacement préparation avec bornes UTC/microsecondes/année ; dépend publication précédente | Aucun DML/ACL supplémentaire ; helper privé conservé | Vérifier dates frontières, expiration serveur d’une nouvelle publication et retry historique expiré/retiré ; hash Node/SQL et contrat strict |

Compatibilité Phase 7 : expansion du schéma, nouveaux chemins v2 et gardes legacy, remplacement conservateur des fonctions/vues. Les anciens parents gardent leur contenu et leurs writers v1 ; valeurs des nouvelles colonnes sur ces parents contrôlées explicitement. La compatibilité est étayée Local, **pas démontrée sur l’état Remote inconnu**. Aucune migration préventive créée.

## 6. Procédure préparatoire du checkpoint manuel

**Procédure à exécuter ultérieurement par le propriétaire, accompagné de ChatGPT. Aucune commande distante ci-dessous n’a été exécutée en 8I.1.**

### A. Cible, historique et sauvegardes

1. Figer le dépôt validé et la liste des fichiers/empreintes ; relever version CLI, projet/organisation et ref Cloud réelle dans un environnement de confiance. Ne pas utiliser une cible inférée depuis une variable ou un projet précédemment lié. Vérifier qu’aucune création/mutation/sync/publication concurrente n’est prévue pendant la fenêtre.
2. Lire l’historique Remote puis le schéma réel : versions manquantes/supplémentaires, noms, objets, ownership, extensions, version PostgreSQL, encodage, profils/cibles cohérents. Si déjà partiellement migré, inventorier le préfixe réel et les données v2 existantes ; ne pas supposer 29 versions. Divergence, trou ou objets sans historique : arrêt et diagnostic, aucun `migration repair` automatique.
3. Vérifier dans le plan **réel** les sauvegardes accessibles, date, rétention, PITR éventuellement activé et borne restaurable. Selon la documentation actuelle : backups journaliers Pro/Team/Enterprise, export régulier recommandé sur Free ; ne pas supposer une restauration Dashboard disponible sur Free. PITR est une option distincte, pas une capacité acquise du projet.
4. Préparer une copie/export chiffré hors Git et une procédure de restauration **éprouvée sur environnement isolé autorisé** ou une preuve récente applicable. Vérifier couverture de `public/private`, Auth, historique de migrations et rôles ; un dump par défaut ou un simple fichier de schéma ne garantit pas cette couverture. Conserver séparément configuration Auth, déploiements/secrets Edge et objets Storage s’ils existent. Les backups DB n’incluent pas les fichiers Storage ; les mots de passe des rôles personnalisés sont absents des backups journaliers. Mesurer perte potentielle d’écritures et indisponibilité d’une restauration. Absence de récupération praticable : arrêt avant application.

Commandes de consultation proposées, à confirmer par `--help` au moment du checkpoint :

```powershell
npm.cmd exec -- supabase migration list --linked
npm.cmd exec -- supabase db push --linked --dry-run --skip-vault
```

Le CLI installé 2.120.0 expose **`--skip-vault`** : à conserver pour cette opération limitée aux migrations. Le dry-run affiche les migrations prévues ; **il n’exécute pas le SQL et ne prouve ni CREATE ROLE ni permission/contrainte ni absence de verrou**. Les sources CLI develop peuvent évoluer ; l’aide de la version utilisée prime pour les flags.

### B. Privileges managés et inspection SQL

5. Vérifier l’identité administrative, `CREATEROLE` et capacité effective à créer le rôle non privilégié avec les attributs de la migration, donner CONNECT/USAGE/EXECUTE et remplacer les fonctions/vues appartenant au rôle attendu. Supabase managé ne fournit pas superuser ; Local `postgres` est déjà non-superuser mais cela ne prouve pas des droits Cloud identiques. Examiner les restrictions du fournisseur et les grants effectifs, sans tenter de contourner une permission.
6. Vérifier absence de rôle homonyme si la migration publisher manque. Si le rôle existe sans historique correspondant, arrêter ; ne pas lui attribuer un secret ni le supprimer aveuglément. Vérifier memberships dans les deux sens : une appartenance administrative à publisher n’accorde pas des droits administratifs au publisher. Refuser toute appartenance du publisher à un rôle plus puissant. Contrôler aussi les droits via PUBLIC/default ACL sur tous les schémas applicatifs et extensions pertinentes. Ne pas révoquer globalement CONNECT de PUBLIC : services Supabase en dépendent.
7. Lire les SQL réellement annoncés par dry-run, y compris correctifs successifs de conflit/volatilité/expiration. Confirmer un seul BEGIN/COMMIT par fichier, aucune commande externe/seed/rôle issu d’un autre fichier. Ne pas ajouter `--include-all`, `--include-seed`, `--include-roles`, `--yes` pour forcer un alignement ; le rôle prévu est créé **dans sa migration**. Identifier transactions longues, DDL bloquant et limites d’attente compatibles avec la fenêtre ; si impossibilité de borne/observation sûre, reporter.
8. Capturer avant application : comptes/empreintes des lignes catalogue et utilisateur, valeurs de contrats/révisions/versions/items/positions/masques, exemplaires et notes, préférences/partages, intents/receipts déjà présents, définition/ACL des objets, rôles et historique. Comparer les anciennes colonnes avant/après, puis vérifier séparément les colonnes ajoutées attendues (v1/0, introduction NULL, visible false). Ne pas attendre une égalité JSON de lignes enrichies de nouvelles colonnes.

### C. Application, arrêt et récupération

9. Après satisfaction des conditions et décision manuelle du propriétaire, exécuter le push contrôlé sur le projet vérifié, depuis le dépôt figé, en gardant l’invite de confirmation. Commande préparée :

```powershell
npm.cmd exec -- supabase db push --linked --skip-vault
```

10. Conserver sorties assainies et code de sortie ; relire l’historique et les objets après chaque erreur ou interruption. Chaque fichier est transactionnel, **l’ensemble des 19 n’est pas une transaction unique** : un préfixe peut être engagé et une migration ultérieure échouer. Un `db push` terminé n’est pas seul une preuve métier. Refus de CREATE ROLE/grant, conflit d’objet, dépendance du DROP sans CASCADE, données invalides, lock durable, migration non annoncée, fuite de privilèges ou altération personnelle : **stop**, aucune répétition aveugle.
11. Diagnostiquer transaction et état engagé ; reprendre uniquement les fichiers réellement non appliqués après clarification de la cause et nouveau dry-run. Si la définition doit changer, préparer une correction additive dans une intervention autorisée ; ne pas réécrire un fichier déjà appliqué, marquer une migration appliquée sans preuve ou utiliser CASCADE pour passer.
12. Garder les tables, masques, journal, reçus et versions engagés. Si nécessaire, suspendre les nouveaux callers/mutations, conserver consultation compatible et préparer correction vers l’avant. **Jamais reset, truncate, suppression globale des structures nouvelles, downgrade de parent v2 ou réactivation writer v1 sur v2.** Restaurer une sauvegarde seulement si réellement nécessaire, avec choix explicite du propriétaire, borne connue, maintenance et prise en compte des écritures postérieures ; pas comme rollback automatique.

Après succès : contrôle de l’historique réel, dry-run final attendu sans migration restante, schema/ACL/RLS/typecheck Cloud et smoke tests section 7. Comparer avant/après et nettoyer seulement les fixtures. Toute condition non satisfaite reste visible dans le compte rendu propriétaire remis à 8I.2.

## 7. Contrôles Cloud post-migration préparés

Objectif : preuve du checkpoint, sans campagne manuelle exhaustive. **Aucun de ces contrôles Cloud n’a été exécuté ici.** Préparer un manifeste `__my_phase8_checkpoint_<UUID>__` avec deux comptes synthétiques owner/reader, parents libres/automatiques, cibles catalogue synthétiques isolées, variantes, exemplaire/note et annonce synthétique si ce contrôle est autorisé. Noms/clés portent le run ; IDs exacts consignés hors Git. Vérifier toutes les collisions avant insertion ; reprendre les formes des fixtures existantes, pas les lancer telles quelles contre Cloud.

Les tests et scripts d’intégration du dépôt restent **Local-only**. Pas de substitution d’URL, pas d’exécution de la suite pgTAP complète sur la production, pas de mot de passe publisher remis à NULL par un test Local. Pour parcourir le backend avec Auth, créer des comptes via administration Auth autorisée, connecter/challenger TOTP réellement et vérifier AAL2 ; une identité JWT injectée ou `SET ROLE` ne prouve pas ce parcours. Confirmation/réception réelle d’emails relève aussi de la préparation hébergée.

| Contrôle court | Réussite attendue |
|---|---|
| Historique / schéma | Versions réellement attendues appliquées, aucun trou/supplément inexpliqué ; tables/colonnes/composites/contraintes/index/triggers/RPC et ACL concordants ; types publics générés depuis Cloud comparés sans éditer le fichier Local |
| Sécurité | RLS active, privé hors Data API, DEFINER owner/search_path corrects, invokers conservés, refus anon/AAL1/tiers/profil absent ; tables de journal/reçus/notifications inaccessibles directement |
| Legacy / nouvelle création | Baseline des vrais parents inchangée ; nouveau libre et auto v2/révision zéro ; retrouver même cible retourne le même parent intact. Fixture legacy spécifique si nécessaire, aucune conversion d’une vraie collection |
| Ajout/reorder/reçu/retrait | Ajouter manuel, déplacer dans ordre complet, relire ; retry UUID/paramètres identiques donne même reçu/révision ; stale HTTP409 rapide ; retrait suivi d’un retry ne ressuscite rien ; exemplaire/note intacts |
| Masquage/progression/partage | Masquer automatique puis consulter contenu complet et Dashboard/overview owner/reader : progression concordante, copie encore possédée, filtre sans write d’ordre ; refus manuel/legacy/reader. Accès partagé synthétique préparé par admin, pas une UI de Phase 9 livrée |
| Détection/preview | Faire évoluer **seulement la cible synthétique** sous verrou catalogue correct, avec hash/version cohérents ; aucun item personnel ou version appliquée ne change. Preview pur, conversion/ajout/retrait explicites, masks conservés, nouveaux/convertis visibles |
| Apply/concurrence | Mutation synthétique après preview → token stale sans effet ; nouveau preview puis confirmation/apply → ordre exactement proposé, un incrément et reçu. Répéter UUID/token historique, obtenir même résultat et relire. Ajouter une seule attente parent/apply réelle si risque de pool/isolation identifié, sans rejouer toutes les campagnes Local |
| Notifications Collection | Notification owner-only pour cible synthétique ; lecture de version présentée sans apply, évolution suivante non lue ; après application confirmée et relecture, ligne absente et compteur exact. Rien pour reader/legacy/libre |
| Annonce / changelog | Si test SQL synthétique autorisé **dans une transaction annulée**, contenu texte, hash exact, lecture sans traitement puis consultation/traitement ; pagination/compteur, retrait et compte inéligible. Pas de diffusion engagée ou changelog produit au checkpoint |
| Publisher | Attributs, memberships, CONNECT/USAGE et **deux seuls EXECUTE métier**, zéro droit table/publication aux rôles utilisateur. Test SQL sous rôle depuis admin seulement si possible : l’indiquer comme preuve ACL, **pas comme LOGIN/TLS publisher**. Provisionnement/connexion permanente réservés au futur workflow sécurisé |
| Edge existant | Inventaire déployé ; `delete-account` et ses secrets serveur requis, `verify_jwt=false` avec validation Auth/AAL2/réauth dans le handler, refus non autorisé et suppression d’un seul compte synthétique avec cascades. Aucune nouvelle Edge pour Phase 8 ; tests unitaires functions ≠ preuve runtime Cloud |

L’audience livrée des annonces ne permet **pas** de cibler arbitrairement les deux comptes du manifeste : une publication engagée pourrait être visible aux vrais utilisateurs déjà inscrits. Nom ou clé synthétique ne restreint pas cette audience. Tester annonces/publication/transitions en transaction SQL annulée, avec contexte Auth de fixture explicitement distingué d’un vrai parcours de connexion. La validation HTTP complète de publication sera réalisée dans un environnement isolé autorisé, ou lors d’une publication produit explicitement décidée ; ne pas diffuser une annonce de test générale pour compléter ce checkpoint.

Fixtures backend isolées peuvent être testées en transaction annulée lorsqu’aucun parcours HTTP n’est requis. Pour les parcours HTTP engagés de collection, nettoyer par **IDs exacts du manifeste**, dans l’ordre des dépendances : supprimer parents/copies/comptes de ce run, puis catalogue/cibles synthétiques sans références restantes. Toute publication synthétique exceptionnellement engagée dans un environnement isolé autorisé exige retrait puis suppression administrative de sa seule clé exacte. Les cascades utilisateur ne suppriment pas le catalogue global. Recompter les résidus du manifeste et comparer les empreintes réelles ; jamais DELETE par préfixe large, compteur global remis à zéro ou suppression de collections du propriétaire.

Critère de checkpoint acquis : historique final expliqué, schema/sécurité conformes, smoke tests exécutés explicitement, données réelles préservées, fixtures nettoyées et réserves documentées. Le propriétaire fournit commandes/codes de sortie, projet vérifié, versions appliquées, résultats de contrôles et limites. 8I.2 ne déduit aucune preuve absente.

## 8. Publication Cloud future des notifications

Le script [publish.ts](../../scripts/notifications/publish.ts) refuse Remote, exige `--environment local`, rôle dédié, boucle locale/port/base et aucun paramètre URL. **Aucune adaptation effectuée en 8I.1.** Le checkpoint peut installer le rôle/fonctions sans rendre cet outil capable de publier Cloud.

À cadrer et réaliser dans une intervention distincte :

| Adaptation | Exigence |
|---|---|
| Provisionnement | Rôle créé par la migration vérifiée, attributs/memberships/default ACL contrôlés ; password long/unique via procédure hors historique, SCRAM, rotation/révocation et gestion des opérateurs |
| Cible / secrets | Environnement et projet explicitement choisis, allowlist de cible, credentials hors Git/logs/arguments/frontend ; aucune détection Remote implicite ou `service_role` de substitution |
| Connexion | Directe ou session conservant identité PostgreSQL réelle ; réseau autorisé, timeouts, isolation READ COMMITTED. Vérifier capacité de connexion du rôle sur le mode choisi |
| TLS | Chaîne CA et nom d’hôte vérifiés ; refuser `rejectUnauthorized:false`, no-verify et URL dont `sslmode/sslcert/sslkey/sslrootcert` remplaceraient l’objet TLS `pg`. Ni simple chiffrement ni réussite Local ne suffit |
| Privilèges | CONNECT + USAGE private + deux EXECUTE métier ; aucun DML/Auth/catalogue/CREATE, aucune appartenance privilégiée, helpers fermés. PUBLIC et extensions audités sur l’instance managée |
| Audience | Date Auth serveur, nouveaux utilisateurs seulement avec justification explicite, contenu texte et contrat strict ; `requires_action=true` toujours refusé tant qu’aucune résolution métier n’est livrée |
| Doublons/incertitude | Fichier normalisé/clé/hash conservés ; retry identique historique, collision différente refusée. Ne jamais produire une nouvelle clé pour masquer un résultat incertain |
| Retrait | Retrait définitif/idempotent de la clé ; historique conservé, correction par nouvelle clé ; procédure d’urgence et contrôle centre/compteur/contenu après relecture |
| Changelog | Seulement après vérification de la version réellement servie sur production. Clé/version distinctes par publication, contrôle d’audience et cycle de consultation ; aucune annonce au simple build ou sync |

Sans cet outil sécurisé et son test de connexion réelle, publication Cloud n’est pas prête. Ce point **ne bloque pas l’installation du schéma**, mais bloque la première publication de changelog par ce workflow. Aucun secret publisher permanent, annonce réelle ou provisionnement préparé en fichier versionné.

## 9. Première mise en ligne après Phase 8

**Décision validée : première publication après la clôture officielle de Phase 8, sans attendre Phase 10.** Elle permettra de tester environnement hébergé, Auth/MFA, notifications de version, futures synchronisations TCGdex et exploitation. **Elle ne signifie pas V1 terminée.** Phase 9 conserve création/gestion/retrait des partages ; Phase 10 finalisation, qualité et stabilisation avec retours de production. Campagne manuelle complète après première publication, séparée du smoke test de lancement.

Architecture retenue : GitHub **`Palmyna/my.`**, `dev` développement/intégration, `main` version publiée ; frontend Vercel, backend Supabase Cloud ; domaine acquis **`collectrealm.com`**, application **`my.collectrealm.com`**. Ce sont les décisions du propriétaire, pas des configurations vérifiées à distance en 8I.1.

| Prérequis | État / préparation |
|---|---|
| GitHub/Vercel | Import futur du dépôt exact, ownership/accès Git vérifiés, Production Branch **main** explicitement choisie malgré dev par défaut. PR dev → main ; aucun changement de branche/ruleset/config dans cet audit |
| Build Vite | Preset Vite, racine du dépôt, install reproductible `npm ci`, build `npm run build`, sortie `dist`, Node/npm compatibles package (`^24.20.0`/`^12.1.0`). Disponibilité exacte sur builder à confirmer ; ne pas désactiver engines/TLS ou mettre à jour les dépendances pour forcer |
| SPA React Router | Aucun `vercel.json`/`vercel.ts` présent. Prévoir fallback vers `/index.html` pour les deep links ; avec cleanUrls, destination adaptée selon doc. Config minimale à réaliser plus tard, aucune dépendance de configuration ajoutée ici |
| Variables publiques | **`VITE_SUPABASE_URL`** Cloud HTTPS et **`VITE_SUPABASE_PUBLISHABLE_KEY`** `sb_publishable_`. Valeurs intégrées au build ; toute modification exige nouveau build. Décodeur actuel n’accepte pas ancienne clé anon comme remplacement implicite |
| Secrets | Aucun secret administratif observé dans les sources frontend ; ne jamais injecter service_role, sb_secret, mot de passe DB, token CLI, SMTP, URL publisher/catalogue dans VITE_* ou bundle. Secrets Edge uniquement dans Supabase ; secrets de maintenance hors frontend |
| Environnements | Production Cloud vérifiée après checkpoint. Previews et leurs URLs/backend restent à décider ; ne pas distribuer automatiquement configuration de production aux builds dev/PR ou copier `.env.local` Local |
| Auth Cloud | Vérifier projet réellement utilisé, confirmation email, TOTP obligatoire/un facteur et contrôle AAL2. Paramétrages historiques ne prouvent pas état actuel. Site URL **`https://my.collectrealm.com`** ; Redirect URLs exactes vers `/auth/confirm-email`, `/auth/confirm-email-change`, `/reset-password`, plus retours effectivement utilisés justifiés. Aucun localhost, wildcard de production non nécessaire ou token en log |
| Emails | SMTP adapté aux destinataires réels, expéditeur et domaine validés, SPF/DKIM/DMARC et quotas contrôlés, templates/routes des liens et double confirmation d’email inspectés. SMTP Supabase par défaut est limité aux adresses d’équipe préautorisées et au test ; Mailpit Local n’est aucune preuve de livraison réelle |
| Edge | `delete-account` requise par le parcours existant, handler/version/secrets et JWT vérifié via Auth à confirmer. Aucun backend Vercel Functions ajouté par défaut |
| DNS / HTTPS | Associer sous-domaine my au projet ; configurer CNAME recommandé **pour ce projet**, sans inventer valeur générique ni déplacer apex/MX. Vérifier autorité DNS, éventuelle validation TXT/CAA, propagation, certificat automatique et domaine final en HTTPS |
| Reprise / exploitation | Identifier deployment/commit/version, build/logs sans secrets, retour arrière frontend compatible schéma v2, disponibilité selon plan réel. Instant Rollback réutilise ancien build et ses variables, ne révertit pas DB/Edge/DNS/annonces ; réexaminer auto-assignment après rollback |

Exemple documentaire minimal du fallback, **non ajouté au dépôt et non configuré** :

```json
{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}
```

Contrôle court de lancement : domaine HTTPS et version footer/commit, assets/chunks, accès direct/refresh des routes public/Auth/Dashboard/Collection/Catalogue/Profil/Paramètres, confirmation email/changement d’email/recovery, challenge TOTP avant données, connexion/logout/isolation, API et fonction Edge synthétiques, aperçu/apply/notifications synthétiques. Vérifier URLs finales et erreurs réelles ; ne pas transformer les contrôles Chrome Local en résultats Vercel. Aucun import Vercel, DNS, email réel ou déploiement exécuté ici.

## 10. Procédures futures de publication et de synchronisation

### Publication applicative

1. Développer sur `dev`, version package/lock cohérente ; valider changements et compatibilité schéma, conserver preuves.
2. Préparer PR `dev` → `main`, respecter règles du dépôt et décision de merge du propriétaire. Aucune migration DB déclenchée automatiquement par build frontend.
3. Après merge/déploiement autorisés, vérifier deployment READY, commit attendu, **version réellement servie** sur `my.collectrealm.com`, deep links/Auth/AAL2 et smoke test. En cas d’échec, suspendre promotion/publication, diagnostiquer ou revenir au build compatible.
4. Si changelog souhaité **et outil Cloud sécurisé livré**, préparer/valider fichier, audience, version et clé ; publier sous rôle dédié, jamais avant vérification du déploiement. Vérifier notification avec compte synthétique, contenu, lecture/traitement et retrait si erreur. Un échec de notification ne justifie aucun secret frontend.

### Synchronisation TCGdex

1. Figer snapshot Git exact, contrôler source/AST/FR/variantes, overrides et référentiel Pokémon versionnés, licences et hashes ; conserver le manifeste.
2. Obtenir diff à partir du **véritable état Cloud**, inspecter créations/modifications/inactivations, identités, réservations de séquences et structures affectées. Un diff Local n’est pas une prédiction garantie de Cloud.
3. **Prérequis non livré : mode Cloud explicite et sûr du pipeline.** `assertLocalUrl` refuse déjà les URLs distantes, même via `CATALOG_DATABASE_URL`. Adapter dans une intervention dédiée avec TLS vérifié, rôle/droits de maintenance appropriés distincts du publisher, cible contrôlée et erreurs assainies ; ne pas contourner la garde existante.
4. Après validation du diff et décision opérateur, exécuter transaction catalogue sous verrou exclusif **771402**, relire le plan/réserver les IDs, conserver trace du run et gérer rollback/éventuels trous de séquences. Aucun appel de writer collection ou notification individuelle.
5. Vérifier hashes/versions canoniques : descriptions seules et noop ne les avancent pas ; identités et copies/notes utilisateur conservées. Identifier les collections concernées par projection/statut, versions appliquées encore inchangées.
6. Utilisateur consulte l’aperçu frais puis confirme application ; si état concurrent, nouveau preview et consentement requis. Vérifier maintien/conversion/masque/ordre, relectures, version appliquée et disparition de la notification. Une nouvelle sync reste une nouvelle version non lue si utile.

Ces procédures ne programment ni synchronisation, publication, worker, polling ou déploiement. Mode Cloud du pipeline et du publisher sont des préparations futures distinctes ; leur absence ne doit pas être présentée comme une fonctionnalité déjà exploitable.

## 11. Matrice des risques Local vers Cloud

« Condition checkpoint » bloque l’exécution tant que non vérifiée ; « lancement » bloque seulement le parcours hébergé concerné. Aucun risque hypothétique n’est transformé en refonte ou migration préventive.

| Risque concret / impact | Preuve ou limite | Contrôle nécessaire | Bloque checkpoint ? |
|---|---|---|---|
| Historique Remote différent de 29, objets déjà présents ou migration hors ordre | Cloud non consulté ; 48 Local alignées ; écarts de capture Local décrits | Relever Remote et objets, expliquer toute divergence, exact dry-run sans force/repair | **Condition checkpoint** |
| Perte de données ou restauration impossible sur le plan réel | Conservation Local prouvée, aucune backup Cloud vérifiée | Backup/export couvrant données/roles/Auth, restauration praticable, fenêtre et RPO/RTO connus | **Condition checkpoint** |
| Privilèges CREATE ROLE/grants différents ou rôle homonyme | Local non-superuser réussit ; aucune équivalence managée présumée | Vérifier capacités administratives, collision, owners/grant options ; arrêt sur refus | **Condition checkpoint** |
| PUBLIC/default ACL/extensions donnent droits supplémentaires au publisher | Deux EXECUTE métier/zéro tables Local ; ACL Cloud inconnues | Audit effectif tous schémas pertinents, membership dans bon sens, pas de révocation globale cassant Supabase | **Condition checkpoint** |
| DDL bloqué ou préfixe seulement engagé | Un BEGIN/COMMIT par fichier ; ensemble non atomique | Fenêtre calme, transactions/locks observables, reprise après lecture de l’historique ; correction additive si nécessaire | **Condition checkpoint** |
| Legacy converti ou client v1 utilisé sur nouveau v2 | Conservation/fixtures legacy 8B ; volume actuel contient seulement v2 | Snapshot anciens parents, défaut/insert 2 pour nouveaux, client compatible et gardes ; aucune conversion | Oui si divergence constatée |
| Pool/isolation ou lock order produit stale/attente erronée | Vraies concurrences Local historiques, READ COMMITTED et catalogue avant parent | Vérifier connexion API/managée ; petit test réel si risque identifié ; reçus/HTTP409/rollback | Oui si fonctionnement non conforme |
| Incertitude après fermeture d’onglet | Reprise sessionStorage même onglet prouvée, pas de récupération inter-onglets | Conserver requête/UUID, aucune opération nouvelle pendant incertitude ; garder limite visible | Non, limite connue |
| Hash/version catalogue incompatible, notification exclue silencieusement sur incohérence | 1 213 hashes Local conformes ; Remote inconnu | Recalculer parité Remote, vérifier états avant fixtures ; diagnostiquer incohérence au statut | **Condition checkpoint** |
| Publication/changelog Cloud non exploitable | CLI Local-only, TLS/credentials Cloud non implémentés | Intervention dédiée section 8 avant publication réelle | Non pour schéma ; **lancement de ce parcours** |
| Synchronisation TCGdex Cloud non exploitable | Pipeline Local-only explicite, aucune sync effectuée | Mode Cloud sécurisé et dry-run sur état Remote dans périmètre séparé | Non pour schéma ; **première sync Cloud** |
| Auth/MFA ou email de production mal configurés | Historique Cloud antérieur, AAL2 Local ; SMTP réel non vérifié | Réinspecter Auth, comptes synthétiques/TOTP, URLs et SMTP pour hébergement | AAL2 : **condition checkpoint** ; emails : lancement |
| Edge déployée absente/obsolète ou secrets inadaptés | `delete-account` anciennement validée Cloud ; runtime Local non exercé ici | Smoke test sur compte synthétique, version/secrets/validation interne JWT | Oui si parcours existant cassé ; lancement également |
| Contraste, lecteur d’écran, mobile physique ou erreurs réseau visuelles insuffisamment vérifiés | Limites axe/Chrome 8H.3 conservées | Tests ciblés après hébergement, sans prétendre certification | Non pour migrations |
| Volumes/long journal et bundle >500 kB | Petits journaux réels, aucun benchmark Cloud ; warning connu | Observer coût/latence/locks en exploitation, stabilisation Phase 10 selon mesures | Non, pas de défaut bloquant mesuré |
| Rollback frontend incompatible avec données v2 | Rollback logiciel prévu consultatif, pas downgrade ; Vercel ancien build réutilisé | Identifier build compatible, suspendre writers si nécessaire, garder données/journal/reçus | Condition de lancement/exploitation |

## 12. Organisation et verdict

Ordre retenu : **8I.1 audit/préparation Codex** → **checkpoint Supabase Cloud manuel propriétaire accompagné de ChatGPT, sans numéro Codex** → **8I.2 vérifications finales/documentation/clôture officielle Codex**. Première publication Vercel après clôture Phase 8 ; ensuite gestion des partages Phase 9 et finalisation/stabilisation V1 Phase 10.

**GO sous conditions.** Conditions minimales avant exécution : cible/historique/schema Remote expliqués, récupération disponible, privilèges publisher et ownership/grants compatibles, fenêtre d’application maîtrisée et dry-run limité aux migrations réellement manquantes. Le propriétaire devra aussi produire les validations post-migration et comparaisons de conservation. Une condition échouée fait suspendre le checkpoint ; une anomalie bloquante avérée impose diagnostic/correction dans un périmètre autorisé.

Aucune autorisation Cloud implicite, aucun checkpoint réalisé, aucune Phase 8 déclarée terminée. 8I.2 reste non commencée. Les adaptations Cloud du publisher/pipeline et la configuration Vercel/DNS/Auth/SMTP seront réalisées séparément ; aucune nouvelle sous-phase n’est inventée pour ces opérations.

## 13. Version, documentation et vérification finale

Package et deux champs du lock passés de `0.8.19` à **`0.8.20`**, sans dépendance modifiée. Aucun code applicatif, test, script, migration ou type généré modifié. README, Fonctionnalités, Architecture, Database et Roadmap alignés ; pipeline et guide de publication corrigés uniquement pour leurs statuts/preparations concernés. Rapports historiques intacts.

| Contrôle final nouvellement exécuté | Résultat |
|---|---|
| `npm.cmd run build` | **PASS**, `tsc -b` inclus ; Vite 8.2.2, version `0.8.20` injectée dans le bundle. Chunk principal 821,00 kB, warning >500 kB préexistant conservé ; aucun navigateur ou déploiement inféré |
| Comparaison JSON package/lock avec HEAD | **PASS**, exactement les trois champs de version diffèrent, tous les autres champs/dependencies identiques |
| Liens et ancres des huit documents touchés | **496 liens locaux, 75 ancres, zéro destination/fragment manquant** ; aucun caractère Unicode de remplacement |
| Conservation PostgreSQL read-only finale | **23 empreintes de tables identiques** ; historique, 59 fonctions/définitions/ACL, rôles/memberships/password-absent, tables/RLS/ACL, policies, contraintes, colonnes et index identiques |
| Empreinte agrégée des 23 tables | Avant = après : `2e52fcb40512cfc1e639790e02ac2ad1dd039a8dadfe53a7325a8489a9ed93e3` ; empreinte propre à la méthode 8I.1, non assimilée aux hashes de méthodes historiques différentes |
| Scan du bundle généré | Version présente ; aucun motif de clé administrative `sb_secret_` concrète détecté. Ce contrôle limité ne remplace pas la vérification des variables d’un futur build Cloud |
| `git diff --check` et périmètre | PASS ; neuf fichiers suivis modifiés et ce rapport nouveau, rien staged. Aucun fichier applicatif/SQL/test ou rapport historique modifié |

Commandes réellement exécutées : `git branch --show-current`, `git status --short`, `git rev-parse HEAD`, `git log -6 --oneline`, CLI installé `supabase status -o json` (sortie secrète capturée en mémoire), `supabase migration list --local`, aides `db push --help`/`db dump --help`, requêtes de métadonnées/intégrité/empreintes sous transaction read-only, `supabase gen types --local --lang typescript --schema public` comparé en mémoire, `npm.cmd run build`, comparaisons package/lock et liens, `git diff --check`. Aucun appel distant d’une CLI de projet.

Branche et HEAD finaux conservés : **`dev` / `d9e794b4d02e8c2edaa0b5a26e1011e419ffdbf3`**. Version finale **`0.8.20`**. Aucun commit, push, changement de branche, mutation Local, nouvelle migration, accès Cloud ou opération de déploiement. **Arrêt strict à 8I.1.**
