# Publication de MY. en Production

## Rôle et statut

Ce document est la **référence opérationnelle unique des futures publications** de MY. Il complète l’[architecture](05-ARCHITECTURE.md), la [base de données](06-DATABASE.md) et le [contrat de publication des notifications](10-NOTIFICATION-PUBLICATION.md), qui conserve les détails du payload, des permissions et de l’idempotence.

**Décisions formalisées le 13 octobre 2026 ; procédure encore non validée de bout en bout en Production.** PROD.1 à PROD.3 livrent maintenance frontend, gel backend et coordination avec preuves Local ; maintenance Preview déjà confirmée par le propriétaire. La [clôture PROD.7B.2.3](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md) consigne désormais ses validations réelles Vercel Preview avec Supabase Cloud en `0.8.33` : 52 migrations, variables Preview/Production, connexion/Auth/MFA, attribution `super_admin`, création/suppression sous gel vérifiées en base, nouvelle connexion MFA pendant le gel. Gel final rapporté **`frozen = false`, révision `4`**. Sauvegarde Cloud, restauration adaptée d’une vraie archive, contrôles Production sous fermeture, publication/visibilité du changelog et répétition PROD.7C restent nécessaires.

Version du dépôt : **`0.8.33`**, après correctif local du build Vercel (types Node déclarés dans le tsconfig racine, installation/build avec npm `12.1.0` épinglé), sur le socle PROD.7B.2.2 exception permanente au gel pour `super_admin` ; socle privé des rôles applicatifs PROD.7B.2.1 en `0.8.31` ; PROD.7B.1 transport Windows du moteur de sauvegarde existant en `0.8.30`, PROD.6 publisher sécurisé en `0.8.29`, PROD.5 en `0.8.28`, PROD.4 en `0.8.27`, PROD.3 en `0.8.26`, PROD.2 en `0.8.25`, PROD.1 en `0.8.24` et cadrage initial en `0.8.23`. PROD.7B.1 éprouve capture native Windows/TLS et snapshot synthétiques, sans accès Cloud. PROD.5 éprouve restauration et Auth/TOTP synthétiques ; PROD.6 adapte le même publisher avec cible/consentement Cloud, identité/ACL et TLS vérifiés, preuves Supabase Local et PostgreSQL/TLS isolé uniquement. Aucun accès aux projets Cloud, secret réel, changement de configuration distante, commit, push, PR, merge ou déploiement effectué ici. La consultation de documentation publique des fournisseurs ne constitue pas une vérification de leurs projets.

## État connu et provenance

**AUTO.4A/B/C, 16 octobre 2026 :** `npm run prod:open` livré : préparation AUTO.4A, publication/relecture PROD.6 et preuve éligible AAL2 AUTO.4B, puis consentements de réouverture distincts, dégel AUTO.1 et réouverture Vercel AUTO.2. Même session/verrou AUTO.3 conservé jusqu'aux contrôles finaux et à la clôture, reprises partielles sans doublon ni bascule inutile. Ancien `ready` ou reçu historique insuffisants. Tests mocks/isolés uniquement, aucune notification ou opération réelle. [Commande, configuration et limites](13-PRODUCTION-AUTOMATION.md#auto4c--commande-finale-prodopen). Exigences E, PROD.4/5/6 et exception permanente `super_admin` inchangées ; AUTO.5 non commencé.

**AUTO.3, 16 octobre 2026 :** `npm run prod:backup` orchestre les API AUTO.2/AUTO.1 et PROD.4, avec configuration et session protégées hors Git, consentements distincts, drainage technique et vérification indépendante. Validation sur mocks/secrets synthétiques uniquement ; aucune opération Cloud ni capture Production. [Usage, préparation initiale et reprise](13-PRODUCTION-AUTOMATION.md). Selon le propriétaire à l'ouverture d'AUTO.2, `maintenance_production=true` ; aucune lecture distante ne rafraîchit cette déclaration ici. [Contrat Vercel, exclusivité et limites](#auto2--pilotage-vercel-production).

### Observations dans le dépôt

Inspection historique du cadrage : branche **`dev`**, HEAD **`590d9fb827948ee694e181fa2654d427442cff8d`**, worktree propre. Inspection initiale PROD.1 : **`dev`**, HEAD **`312ff061c7d9783b1b689ab3c45bf7bcdb614895`**, worktree propre. Inspection initiale PROD.2 : **`dev`**, HEAD **`ceb3cf97ce5ba110867f2d28696eff4eff6e0f1a`**, worktree propre. Inspection initiale PROD.3 : **`dev`**, HEAD **`603460596a8b5ab434dc7519402bd9bb2c493b75`**, worktree propre, version `0.8.25`, 50 migrations Local et gel ouvert. Remote Git : `Palmyna/my.` ; référence locale `origin/HEAD` vers `origin/main`. Cette référence locale ne remplace pas une lecture actuelle des paramètres GitHub. Le tableau distingue le dépôt courant des preuves Local historiques. Inspection initiale PROD.7B.2.3 : `dev`, HEAD `975dc33cc6a3f90282793a9a42e222629968e3c7`, worktree propre ; documentation uniquement.

| Élément observé | Portée de l’observation |
|---|---|
| `package.json`, `package-lock.json` et entrée racine du lockfile | Version `0.8.33` dans les trois champs après correctif du build Vercel ; version injectée par Vite depuis le package |
| [vercel.json](../vercel.json) | Fallback SPA `/(.*)` vers `/index.html` conservé ; `proxy.entrypoint` vers [middleware.ts](../middleware.ts), sans exclusion de chemin ; installation et build via `npm exec --yes --package=npm@12.1.0 -- …` ; aucun réglage d’attente de promotion ajouté |
| [Migrations](../supabase/migrations/) | 52 fichiers, dernier `20261015123024_prod7b22_superadmin_freeze` ; 52 appliqués Local selon le rapport historique PROD.7B.2.2. **52 appliqués Cloud confirmés par le propriétaire en PROD.7B.2.3**, sans nouvelle lecture SQL ici |
| [supabase/config.toml](../supabase/config.toml) | Configuration Local `my-local`, URLs Auth locales, seed applicatif désactivé ; ne décrit pas à elle seule la configuration Cloud |
| Configurations GitHub/Vercel versionnées | Aucun workflow `.github/` ou réglage `.vercel/` suivi observé ; intégrations et réglages des consoles non déduits de cette absence |
| [Publisher](../scripts/notifications/publish.ts) et [contrat](../scripts/notifications/contract.ts) | Validation hors connexion, Local conservé ; cible Cloud explicite avec rôle réel, cluster, TLS et ACL contrôlés, consentement lié au hash/version ; check Cloud réel confirmé par le propriétaire en PROD.7A, sans publication visible démontrée |

### Configurations et opérations confirmées par le propriétaire

Les éléments suivants proviennent des confirmations du propriétaire, avec provenance datée. **Codex ne les revérifie pas sur les services pendant cette clôture documentaire.** Les [confirmations propriétaire PROD.7A](reports/2026-10-14-PROD7A-PUBLICATION-AUDIT.md#confirmations-manuelles-reçues-pour-prod7a) remplacent les anciens états des intégrations et du publisher ; PROD.7B.2.3 actualise historique Cloud, variables et parcours Preview. Les autres réglages conservent leur provenance antérieure et doivent être relus avant PROD.7C.

| Service | État actuel déclaré |
|---|---|
| GitHub | Dépôt `Palmyna/my.` ; **`main` branche par défaut** et Production, alimentée par PR depuis `dev` et merge classique ; `dev` reste développement et validations locales |
| Vercel | Previews depuis `dev`, builds Production depuis `main` ; **Auto-assign Custom Production Domains désactivé** selon PROD.7A, futurs builds Production en attente de promotion manuelle ; réglage non revérifié en PROD.7B.2.3 |
| Domaine et protection Vercel | `my.collectrealm.com`, HTTPS actif ; Vercel Authentication activée sur tous les déploiements |
| Variables Vercel | Variables Supabase disponibles en **Preview et Production**, confirmation propriétaire PROD.7B.2.3 ; remplace « Production uniquement » |
| Routage | Fallback SPA livré en `0.8.23` et routes directes vérifiées par le propriétaire |
| Supabase | Projet Cloud existant conservé ; **52 migrations appliquées** selon PROD.7B.2.3. Intégration GitHub liée à `Palmyna/my.`, working directory `.`, **Deploy to production activé**, branche `main`, sans branche Preview selon PROD.7A ; réglages non revérifiés ici |
| Auth et emails Cloud | Connexion/Auth/MFA depuis Preview avec Cloud confirmées en PROD.7B.2.3, y compris nouvelle connexion MFA sous gel. URLs/redirections du domaine définitif et Resend déclarés configurés antérieurement ; pas de nouvelle campagne emails |
| Rôle et gel Cloud | `super_admin` attribué/vérifié ; création puis suppression d’une collection depuis Preview sous gel réussies et vérifiées en base. État final déclaré : **`frozen = false`, révision `4`** (PROD.7B.2.3) |
| Publisher Cloud | Rôle/SCRAM, connexion directe IPv6, CA/TLS `verify-full` et `--check` réel `TLS=verified`/`permissions=verified` confirmés en PROD.7A ; aucune publication/visibilité de notification attestée |

Aucune branche Supabase Preview n’est prévue. Preview Vercel utilise ici le **backend Cloud existant**, sans isolation de données supplémentaire. Ce parcours ne prouve ni la maintenance ni le frontend Production réellement servi.

### Validations acquises et limites

La [clôture Phase 8I.2](reports/2026-10-12-PHASE8I2-CLOSURE.md) conserve les tests Local exécutés, les preuves navigateur historiques et le checkpoint Cloud fourni par le propriétaire : 48 migrations, dont 19 Phase 8, rôle publisher et permissions contrôlés. Sa version de clôture **`0.8.21`** et ses conclusions restent historiques.

La présence du rôle Cloud au checkpoint Phase 8 ne prouvait pas une connexion publisher réelle ; celle-ci et TLS ont été confirmés depuis dans PROD.7A, sans publication visible. La [clôture PROD.7B.2.3](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md) acquiert sur déclaration propriétaire le parcours Preview/Auth/MFA et l’exception métier `super_admin` sous gel. **Aucun test complet de compte réel sur le frontend Production n’est démontré par ces essais.** Refus ordinaires SQL/REST/RPC, anciennes sessions, drainage Cloud et coordination de tous les writers restent à éprouver. Production, sauvegarde/restauration Cloud et workflow coordonné ne sont pas clos. [Preuves historiques PROD.1](reports/2026-10-13-PROD1-MAINTENANCE.md), [coordination Local PROD.3](reports/2026-10-13-PROD3-COORDINATION.md).

## Conditions avant utilisation du workflow

Les cinq [blocs futurs](#blocs-futurs-de-réalisation) doivent être réalisés et validés. En particulier, ne pas considérer la fermeture Vercel comme un gel Supabase, ni un fichier SQL exporté comme une restauration éprouvée.

Deux réglages ont été **confirmés appliqués par le propriétaire dans PROD.7A**, sans revérification ici ; contrôler leur état réel avant la répétition autorisée :

- déploiements Supabase Production depuis `main` activés dans l’intégration GitHub existante, sans branches Preview ;
- builds Vercel de `main` en environnement **Production**, avec variables Production, assignation automatique des domaines désactivée pour attendre une promotion manuelle.

La documentation Vercel décrit ce second réglage dans **Production / Branch Tracking / Auto-assign Custom Production Domains**. Une promotion d’un build Production en attente assigne les domaines **sans rebuild**. Promouvoir un Preview reconstruit avec les variables Production : ce n’est pas le mécanisme retenu.

Avant utilisation de l’intégration Supabase déclarée activée, contrôler ses effets réels : migrations, éventuelles fonctions Edge et configuration. Le `config.toml` actuel est Local ; ses URLs localhost et ses réglages ne doivent pas écraser Auth/SMTP/configuration Production. Le traitement de la configuration par l’intégration doit être cadré et vérifié dans le bloc dédié, sans modifier ce fichier pendant la présente sous-phase. Aucun seed, reset ou réimport du catalogue n’est prévu.

## Exception initiale — installation du middleware Production

La fermeture B suppose un déploiement courant déjà équipé du middleware. L'inspection [PROD.7C.1](reports/2026-10-15-PROD7C1-PRODUCTION-BOOTSTRAP.md) confirme `main` GitHub en `0.8.23`, sans middleware ; le déploiement réellement assigné au domaine reste à identifier. Global Config ne peut pas fermer un ancien déploiement sans lecteur.

**Installation initiale proposée, à autoriser séparément :** préparer `maintenance_production=true`, PR `dev` vers `main` et merge classique, contrôler le succès Supabase et le build **Production** en attente, vérifier son 503 MY., puis promouvoir ce même ID sans rebuild et vérifier le 503 sur le domaine. Jusqu'à cette première promotion, l'ancien site reste sans maintenance MY. Cette exception ne vaut pas exécution A–E ni publication complète sans sauvegarde ; elle exige parité exacte de l'historique Cloud et examen des effets Edge de l'intégration. Arrêter l'installation en état fermé, sans notification ni réouverture.

Le [rapport de préparation](reports/2026-10-15-PROD7C1-PRODUCTION-BOOTSTRAP.md) précise ordre, préconditions et arrêts ; aucune action distante n'y est exécutée. Après installation, la séquence normale ci-dessous reste applicable. T1 et les exigences avant E restent inchangés ; l'ancien déploiement sans middleware n'est pas un rollback compatible maintenance.

## Procédure officielle

L’opérateur conserve une trace simple de chaque livraison : version, commit attendu, résultats de clôture, sauvegarde et empreintes, migrations réellement appliquées, identifiant du déploiement Vercel, fichier/clé/hash de notification et contrôles de réouverture. Aucun secret ni backup dans Git ou les logs publics. Chaque étape doit réussir avant la suivante ; une incertitude maintient la fermeture.

### A — Préparation locale

1. Développer et tester sur `dev`, selon le processus habituel du projet.
2. Réaliser l’audit et la clôture habituels, avec preuves et limites explicites, y compris compatibilité frontend/backend et reprise des opérations métier.
3. Codex prépare le **changelog public de la version publiable**, en langage compréhensible pour les utilisateurs, à partir des changements réellement livrés.
4. Codex prépare aussi le fichier de publication de la notification : catégorie `changelog`, version, clé stable, contenu, audience, expiration et contexte selon [10-NOTIFICATION-PUBLICATION.md](10-NOTIFICATION-PUBLICATION.md).
5. Valider ces éléments localement, notamment le payload par le mode `--validate` hors connexion du publisher. Aucune annonce réelle ni publication Cloud pendant les tests. Les éventuelles fixtures des suites Local restent synthétiques et isolées selon leurs contrats.
6. Vérifier que tous les changements attendus sont présents sur `dev` et que package, lockfile, changelog et payload décrivent la même livraison. Aucun incrément de version pour la présente documentation.

**Sortie attendue :** livraison et contenu validés localement, aucune notification diffusée, aucun merge de publication effectué.

### B — Mise en maintenance

**Entrée opérateur livrée : `npm run prod:backup`**, après configuration initiale hors Git. Cette commande orchestre B puis C, demande les attestations réellement nécessaires et conserve les protections fermées. [Procédure AUTO.3](13-PRODUCTION-AUTOMATION.md). Les exigences et étapes ci-dessous restent applicables ; une lecture du plan de contrôle ne vaut pas preuve HTTP ou fermeture globale.

1. Activer le mode maintenance depuis la configuration Vercel, sans nouveau déploiement.
2. Activer le gel des écritures métier Supabase par le dispositif indépendant prévu.
3. Vérifier que le site est indisponible pour les utilisateurs ordinaires et que les mutations Supabase sont refusées, **y compris RPC et accès directs**, avec sessions et onglets déjà ouverts.
4. Attendre la propagation des deux protections et la fermeture effective des opérations en cours. Contrôler transactions et écritures en vol ; un délai arbitraire ou une page visible ne constitue pas une preuve de gel.

Les opérations déjà engagées doivent avoir terminé ou été annulées selon la procédure validée avant la sauvegarde. Leur réponse peut rester incertaine côté client : conserver les garanties UUID/token/reçu de Phase 8. **Ne pas poursuivre vers C tant que fermeture et gel effectifs ne sont pas établis.**

### C — Sauvegarde manuelle Supabase Cloud

Après maintenance effective, effectuer **un backup déclenché par l'opérateur avant chaque publication**, avant création de la PR de livraison et avant toute nouvelle migration Production. AUTO.3 le réalise par `prod:backup`, avec moteur PROD.4 inchangé et `verify` indépendant. Les commandes PROD.4 séparées restent disponibles selon leurs contrats.

L’[outillage PROD.4](12-SUPABASE-BACKUP.md), livré en `0.8.27` puis enrichi pour PROD.5 en `0.8.28`, prépare les futurs exports manuels avec archive PostgreSQL native complète, snapshot partagé, inventaires et chiffrement immédiat. Restauration et Auth/TOTP éprouvés exclusivement sur données synthétiques isolées ; aucun accès ou backup Cloud. Une vraie sauvegarde Cloud doit encore subir son propre essai isolé adapté. Le périmètre cible reste :

| Élément à conserver | Exigence de restauration |
|---|---|
| Schéma applicatif et sécurité | Schémas `public`/`private`, tables, séquences, contraintes, index, fonctions, triggers, RLS, policies, propriétaires et grants ; vérifier les exclusions et limites de l’export choisi |
| Données | Catalogue, utilisateurs MY., collections/items, exemplaires, préférences, partages, masques, versions/révisions, intentions, reçus et notifications/états ; préserver IDs exacts et séquences |
| Historique des migrations | Export explicite du schéma et des données `supabase_migrations`, distinct si l’outil l’exclut ; conserver aussi commit et fichiers de migrations correspondant au backup |
| Auth | Données Auth nécessaires aux comptes, identités et MFA selon les possibilités de l’outil ; vérifier effectivement leur inclusion, restauration et liens avec les profils. Inventorier sessions/tokens et besoin de réauthentification après restauration |
| Objets MY. sur schémas gérés | Relever séparément les personnalisations de `auth`/`storage` exclues d’un dump standard, notamment triggers MY. de création du profil et suppression du compte sur `auth.users` |
| Rôles et secrets | Attributs/permissions des rôles dédiés, dont publisher ; ne pas supposer leurs mots de passe restaurés. Secrets conservés séparément dans le gestionnaire de secrets, avec procédure de reprovisionnement/rotation |
| Configuration hors SQL | Auth, Site URL/redirections, SMTP/Resend, MFA, clés et paramètres nécessaires, Edge `delete-account` et secrets, Data API/réseau et intégrations ; inventaire protégé et instructions de réapplication, un dump SQL ne les sauvegarde pas tous |
| Storage et chiffrement, si utilisés | Les objets Storage ne sont pas inclus dans un backup DB ; vérifier leur besoin et copie séparée. Pour Vault/chiffrement éventuel, vérifier les clés nécessaires : données chiffrées seules ne garantissent pas une restauration portable |

Le gel métier ne prouve pas que les services Auth ou des processus privilégiés ont cessé toute écriture. La procédure devra préciser leur périmètre et garantir la cohérence du snapshot entre exports, selon les possibilités de l’outil, sans affaiblir les protections existantes.

Conserver les fichiers **hors du dépôt**, en stockage protégé avec accès restreint et chiffrement adapté aux données Auth/personnelles. Relever projet source, date/borne, version PostgreSQL et outils, commit/version, historique des migrations, périmètre/exclusions, taille, résultat des exports et empreintes SHA-256. Vérifier lecture et intégrité ; comparer les empreintes avant une restauration.

Avant de déclarer la récupération opérationnelle, effectuer une restauration d’essai dans un environnement isolé approprié, sans reset du volume Local utilisé et sans branche Supabase Preview imposée. Contrôler données/séquences, historique, fonctions/RLS/ACL, Auth/MFA, rôles, Edge, notifications/reçus et compatibilité applicative. Documenter durée, perte potentielle et étapes manuelles. L’intégrité des fichiers et la réussite d’une restauration sont deux preuves distinctes.

**Supabase Free n’offre pas de restauration historique automatique équivalente à Instant Rollback.** La documentation recommande des exports manuels conservés hors site ; backups quotidiens accessibles et PITR relèvent d’offres payantes. La restauration synthétique isolée MY. est éprouvée en PROD.5 ; aucun backup ou essai de récupération Cloud réalisé ici. Aucun système complexe de sauvegardes automatiques n’est prévu pour ce workflow.

Aucun backup manuel des builds Vercel : utiliser l’historique des déploiements et **Instant Rollback**, seulement vers un déploiement éligible et compatible avec la base migrée ou restaurée. Sur Hobby, le rollback est limité à la précédente production éligible ; l’historique n’offre pas un choix illimité de retours arrière.

**Sortie attendue :** sauvegarde identifiée et intégrité validée, procédure de récupération déjà éprouvée, maintenance et gel toujours actifs.

### D — Publication et promotion

1. Maintenance active et sauvegarde validée : créer la PR **`dev` vers `main`** et contrôler contenu, migrations, version et risques de reprise.
2. Effectuer le **merge classique après validation**, selon le workflow Git ; `main` reste protégé, aucun push direct dans le workflow normal.
3. Dans la configuration déclarée en PROD.7A, à revérifier, le merge déclenche le déploiement Supabase Production des migrations versionnées et la construction Vercel **Production** du même commit.
4. La nouvelle version Vercel attend sans assignation automatique au domaine. Ancien frontend et nouveau build restent soumis à la maintenance.
5. Attendre la **réussite effective du déploiement Supabase** : contrôler statut/logs, historique réellement appliqué et compatibilité du backend, pas seulement la présence des fichiers Git.
6. Si Supabase a réussi et le build Vercel attendu est prêt, promouvoir manuellement **ce build Production**, sans rebuild. Vérifier identifiant, commit, version et variables d’environnement du build promu.

Les deux intégrations peuvent travailler en parallèle ; elles ne constituent pas une transaction distribuée et ne garantissent pas leur ordre mutuel. **La promotion est le point de contrôle manuel après réussite Supabase.** Échec ou résultat incertain d’un déploiement : aucune promotion ni réouverture automatique.

Activation Supabase depuis `main` et attente de promotion Vercel sont **déclarées configurées par le propriétaire dans PROD.7A**. Le succès réel de cette séquence reste à démontrer en PROD.7C ; ni la déclaration des réglages ni les essais Preview ne prouvent une publication Production coordonnée.

### E — Notification et réouverture

Déroulement automatisé livré : **`prod:backup` → PR `dev` vers `main`, merge, déploiements, promotion et tests → `prod:open`**. AUTO.4C compose les étapes suivantes sous le même verrou/session, avec autorisations et preuves propres à chacune ; aucune exigence E supprimée. [Usage/reprise](13-PRODUCTION-AUTOMATION.md#auto4c--commande-finale-prodopen). PR/merge, déploiements et promotion restent hors automatisation.

1. Maintenance toujours active : vérifier rapidement la version réellement déployée et servie par le domaine après promotion, le commit et la compatibilité backend. Utiliser le moyen de contrôle opérateur protégé prévu par la maintenance.
2. Après mise en service Cloud explicitement autorisée et vérifiée, utiliser le [publisher PROD.6](10-NOTIFICATION-PUBLICATION.md#cloud--commandes-powershell-et-autorisations) : `--check` avec cible/projet/version puis consentement `--authorize-publish --expect-hash` sur fichier examiné. Publier **une seule fois** notification et changelog public, comme **une publication de catégorie `changelog`**, pendant maintenance et gel toujours actifs. Aucune deuxième annonce parallèle.
3. Vérifier, par relecture autoritative avec identité éligible, présence, version, contenu et absence de doublon. Ne pas traiter automatiquement la notification des utilisateurs lors de ce contrôle. Si réponse incertaine, reprendre avec fichier/clé/hash exacts selon le contrat.
4. Lever le gel des écritures Supabase uniquement après ces vérifications.
5. Désactiver la maintenance Vercel par action contrôlée.
6. Vérifier le retour au fonctionnement normal : domaine/version/routes, accès Auth/MFA selon la politique en vigueur, lectures et mutations autorisées, notification disponible pour son audience.

Les utilisateurs éligibles doivent trouver le changelog dès leur retour sur MY. Aucun ajout de polling ou de nouveaux comportements de notification : les lectures explicites Phase 8 restent le contrat.

Si notification, contrôles ou levée d’une protection échouent, identifier les états réellement confirmés et suivre la procédure de reprise validée. Une protection déjà levée ne doit jamais être annoncée fermée. Maintien ou rétablissement éventuel exigent décision opérateur ; aucune opération inverse automatique. **Aucune réouverture sans consentement explicite**, y compris après succès d’un build.

## Contrat du changelog et prérequis Cloud

Codex rédige le changelog lors de chaque clôture publiable. Il décrit les changements utiles aux utilisateurs, sans détails privés ni promesse de fonctionnalité non livrée. `app_version` correspond à la livraison réellement vérifiée, pas à une version simplement envisagée ou à celle d’un exemple historique.

Le [contrat complet](10-NOTIFICATION-PUBLICATION.md) reste inchangé : payload fermé, texte brut normalisé, `category='changelog'`, SemVer obligatoire, `requires_action=false`, action limitée à la consultation autorisée ou `null`. Le corps de cette publication est le changelog public consultable par l’audience du centre authentifié ; aucune page publique distincte ou notification externe n’est ajoutée.

- **Identité :** `publication_key` unique et stable, conforme au contrat ASCII, fixée avec le fichier validé avant publication. Même clé et contenu normalisé donnent le même UUID/date/hash ; même clé avec contenu différent est refusée.
- **Audience :** utilisateurs dont la date réelle d’inscription Auth est antérieure ou égale à la publication. `include_new_users=true` étend l’audience aux nouveaux inscrits tant que la publication reste active, uniquement avec justification explicite. Aucun ciblage arbitraire de comptes ou nouvelle audience.
- **Disponibilité :** `expires_at=null` ou expiration future valide ; une publication retirée, expirée ou traitée par le viewer sort du centre selon les contrats existants. Lire ne signifie pas traiter. Aucune durée fixe ou exception permanente décidée ici.
- **Moment :** préparation/validation locales sans diffusion ; publication Cloud après vérification du déploiement, **avant réouverture**. Aucune annonce au simple build, merge ou test local.
- **Reprise :** conserver fichier normalisé, clé et hash exacts après une réponse incertaine. Reprendre la même publication, jamais une nouvelle clé pour contourner l’incertitude. Un résultat idempotent historique ne prouve pas une visibilité active : relire le centre. Correction par retrait définitif puis nouvelle clé, pas écrasement du contenu historique.

**PROD.6 livre le code et la procédure Cloud ; aucun système hébergé opérationnel revendiqué.** Cible/projet/environnement et autorisation de connexion explicites, rôle `my_notification_publisher` existant sans recréation, secret séparé en saisie protégée Windows, cluster réel et droits effectifs contrôlés. Connexion directe ou Supavisor session conservant l’identité ; transaction pooler refusé. **TLS avec CA épinglée, chaîne et hostname vérifiés**, sans URL ni downgrade. Publication exige version attendue/hash examinés et consentement métier ; retrait exige consentement distinct. Le CLI ne certifie ni version Vercel servie, ni maintenance, ni gel. [Procédure détaillée et limites](10-NOTIFICATION-PUBLICATION.md#publication-cloud--cible-et-contrôles).

Le gel PROD.2 permet déjà les opérations SQL opérateur nécessaires et les deux fonctions publisher dédiées. PROD.6 redémontre publication/rejeu/conflit/retrait sous gel Local, états utilisateur et DML/RPC/bascule refusés ; aucune permission ni garde modifiée. Mise en service et mêmes preuves Cloud restent nécessaires. Ne jamais désactiver temporairement le gel pour publier.

## Exigences du mode maintenance

Ces objectifs conservent le [cadrage architectural](05-ARCHITECTURE.md#publication-coordonnée-et-maintenance) et les contraintes de l’[audit 8I.1](reports/2026-10-12-PHASE8I1-AUDIT-CLOUD-READINESS.md). PROD.1 sélectionne Routing Middleware et Global Config pour la fermeture frontend ; le mécanisme de gel backend reste à concevoir séparément.

- Page personnalisée aux couleurs de MY., réponse **HTTP 503** et absence de cache navigateur/CDN pendant la maintenance. Ni succès HTTP 200 déguisé, ni fallback SPA contournant la fermeture.
- Activation/désactivation depuis la configuration Vercel **sans redéploiement**, avec état indépendant du build et persistant pendant builds, déploiements, erreurs et rollbacks compatibles. Les variables Vite intégrées au bundle ou une modification de variables exigeant un rebuild ne suffisent pas.
- État de fermeture conservé en cas d’échec du dispositif ; aucun timeout ou automatisme ne rouvre le site. Propagation et caches doivent être contrôlés avant sauvegarde et réouverture, sur le domaine et les URLs de déploiement exposées aux utilisateurs ordinaires.
- Gel backend des mutations métier, RPC privilégiées et accès directs compris ; couvrir aussi les mutations depuis ancien frontend, sessions et onglets ouverts, et les chemins Edge/Auth susceptibles d’écrire dans les données MY. Une page Vercel seule ne les bloque pas.
- Conserver RLS, MFA/AAL2, propriété, permissions et autorisation courante. La maintenance ne remplace aucun contrôle de sécurité et ne rend pas le publisher administrateur.
- Contrôles opérateur protégés avant réouverture, sans contournement accessible aux utilisateurs ordinaires ; moyen exact à valider. Vercel Authentication reste distincte de la maintenance et de Supabase Auth. Vérifier l’accès des futurs testeurs selon cette protection avant les tests réels.
- Réouverture exclusivement contrôlée dans l’ordre E ; vérifier compatibilité frontend/backend et reprise des opérations interrompues.
- Respecter possibilités, limites et quotas **Vercel Hobby / Supabase Free**, revérifiés lors de l’implémentation. Aucun achat ou service supplémentaire présumé ; aucune interface d’administration dans MY. sauf nécessité démontrée.

## PROD.1 — Maintenance frontend Vercel

### Architecture livrée et comportement

**Implémentée en `0.8.24`, validée Local et partiellement Preview selon les contrôles manuels fournis par le propriétaire ; validation Production restante.** Le [middleware](../middleware.ts) Node.js s’exécute selon `proxy.entrypoint`, sans matcher restrictif. La documentation Vercel décrit son exécution avant cache pour tout framework, dont une SPA Vite. Maintenance inactive : `next()` laisse le routage, les assets et le fallback existants poursuivre sans modification. Maintenance active : réponse `Response` HTTP **503**, sans rewrite ni passage par React.

Une seule lecture de Global Config par requête concernée. Seul le booléen JSON **`false`** ouvre ; `true` ferme. Aucun paramètre, cookie, header utilisateur, identité Supabase ou exception de chemin ne permet de passer. Le contrôle porte sur l’environnement serveur `VERCEL_ENV`, pas sur le hostname ou une valeur transmise par le navigateur.

| Environnement | Connexion/état | Résultat |
|---|---|---|
| `production` | `GLOBAL_CONFIG` valide et `maintenance_production: false` | Poursuite normale |
| `production` | `maintenance_production: true` | 503 |
| `production` | Connexion absente/invalide, clé absente, valeur non booléenne, erreur de lecture/JSON ou délai dépassé | 503, diagnostic fixe sans URL/token |
| `preview` | `GLOBAL_CONFIG` absent ou vide | Poursuite sans lecture distante : Preview non équipée de maintenance |
| `preview` | Connexion fournie | Même règle stricte, clé **`maintenance_preview`** uniquement ; défaut de lecture/clé/valeur : 503 |
| `development` | Toute configuration | Poursuite sans lecture distante ; le serveur Vite n’exécute pas ce middleware |
| Environnement absent/inconnu | Toute configuration | 503 ; aucune ouverture implicite en cas de mauvais réglage serveur |

Le SDK officiel `@vercel/global-config@1.5.1` lit avec `consistentRead: true`, `cache: 'no-store'`, `staleIfError: false`, cache de développement désactivé. Ce choix contourne les copies locales/CDN du SDK et demande l’origine : un ancien `false` ne sert pas de repli après une erreur. **Coût : latence réseau supérieure aux lectures répliquées annoncées sous la milliseconde.** Aucun cache applicatif ni mémorisation d’un ancien état ouvert. Lecture non terminée en **3 secondes** : 503 ; une réponse tardive ne peut plus rouvrir cette requête. Le SDK ne fournit pas de signal d’annulation à `get` : la lecture distante peut finir en arrière-plan, sans écriture ni effet sur l’état persistant.

La [page autonome](../vercel/maintenance-page.ts) contient styles intégrés, couleurs graphite/rouge et copie exacte du SVG officiel, contrôlée par test. Police système, aucun script, formulaire, lien métier, asset ou appel Supabase. GET et autres méthodes retournent la page ; HEAD conserve statut/headers avec corps vide. Headers : `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`, `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`, `Pragma`, `Expires`, `X-Robots-Tag: noindex, nofollow, noarchive`. CSP bloque scripts, connexions, ressources externes, formulaires et embedding ; styles inline nécessaires à la page autonome. Aucun `Retry-After` arbitraire, délai de réouverture ou expiration de l’état.

### Préparation manuelle avant le premier déploiement

**Ne pas publier le middleware en Production avant ces préparatifs.** Sans eux, la fermeture de sécurité est intentionnelle et pourrait rendre indisponible un environnement non préparé. Aucun de ces réglages n’est effectué par PROD.1.

1. Vérifier le plan réel **Hobby**, la disponibilité des fonctions Node et les quotas restants. Conserver framework Vite, commande `npm run build`, sortie `dist` et configuration Supabase Production existante.
2. Conserver **Vercel Authentication / All Deployments**. Inventorier domaines, alias, URLs des déploiements exposés et identités autorisées pour les contrôles. Ne pas modifier l’assignation automatique des domaines dans PROD.1.
3. Créer ou réutiliser **un seul Global Config** dans le bon compte/projet, par exemple `my-maintenance`. Hobby permet un seul store au total : s’il existe déjà, utiliser deux clés distinctes dans ce store, sans supprimer les autres données. Préparer les items suivants ; `false` signifie ouvert, pas chaîne de caractères :

   ```json
   {
     "maintenance_production": false,
     "maintenance_preview": false
   }
   ```

4. Ajouter dans le dashboard le schéma de validation ci-dessous, en l’adaptant si le store possède déjà un schéma. Il protège les deux clés sans exclure les autres items :

   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "type": "object",
     "required": ["maintenance_production", "maintenance_preview"],
     "properties": {
       "maintenance_production": { "type": "boolean" },
       "maintenance_preview": { "type": "boolean" }
     }
   }
   ```

5. Connecter le store au projet ; vérifier **`GLOBAL_CONFIG`**, connexion avec token de lecture seul, disponible côté serveur en **Production**. Pour les essais, connecter aussi **Preview** au même store : deux clés isolent les états malgré le quota Hobby. Ne pas créer `VITE_GLOBAL_CONFIG`, intégrer le token au frontend, transmettre la connexion dans Git/logs/URL de navigation ou provisionner un token d’écriture dans le runtime. Le middleware n’utilise pas implicitement `EDGE_CONFIG`.
6. Activer **Enable access to System Environment Variables** et vérifier `VERCEL_ENV` réel, notamment sur les builds Production non encore promus. Ne pas définir manuellement `preview` sur un build Production.
7. Préparer la première validation **Preview** avec ces valeurs et le code compatible. Aucun besoin de variables Supabase pour tester la page 503. Après les contrôles ci-dessous, planifier séparément l’installation Production autorisée. Les variables de connexion sont des prérequis de déploiement : leur création/rotation exige de nouveaux déploiements concernés ; les changements d’items ensuite n’en exigent aucun.
8. Relever store et tokens encore utilisés par chaque déploiement de rollback compatible. Les garder valides pendant leur durée d’utilisation. Un ancien déploiement **sans middleware**, ou utilisant un autre store, ne conserve pas cette fermeture ; ne pas le considérer comme un rollback maintenance compatible.

### Activation et désactivation futures sans rebuild

Ces opérations restent à éprouver ensemble ; aucune activation Production effectuée ici.

1. Dans Vercel **Storage / Global Config**, sélectionner le store connecté puis **Items**. Modifier seulement `maintenance_production` de `false` à `true` et **Save Items**. Pour la campagne Preview, modifier exclusivement `maintenance_preview`.
2. Contrôler l’état réellement sauvegardé, l’horodatage et les réponses HTTP du domaine, des alias et des URLs de déploiement concernées. Conserver commit et identifiant de déploiement : ils doivent rester identiques après la bascule. Un affichage du dashboard ou un délai seul ne prouve pas la fermeture globale.
3. Garder `true` pendant builds, promotion, erreurs et rollback **compatibles**. Ne pas supprimer la clé/connexion pour rouvrir, ni restaurer un backup Global Config contenant `false` pendant une fermeture requise.
4. Réouverture seulement après les conditions de la [séquence E](#e--notification-et-réouverture) : modifier explicitement la même clé à `false`, **Save Items**, puis vérifier les réponses normales et les parcours prévus. Erreur de lecture : réparer la configuration, sans neutraliser le middleware. Aucune minuterie de réouverture.

### Quotas, propagation et limites

Documentation officielle consultée le **13 octobre 2026** : Routing Middleware disponible sur tous les plans, runtime Node et tarification Fluid Compute. Hobby inclut par mois **100 000 lectures / 100 écritures Global Config**, un store total et un store connecté par projet, taille maximale **1 MB**, clés jusqu’à 256 caractères. Fonctions : **1 000 000 invocations**, **4 h CPU actif**, **360 GB-h mémoire provisionnée** ; CDN **1 000 000 requêtes**, transfert rapide **100 GB**, transfert origine **10 GB**. Ce sont des quotas inclus, pas une preuve de capacité restante du compte. Les essais Preview et les requêtes d’assets consomment aussi des lectures. À 100 000 requêtes concernées, le quota lecture peut être atteint bien avant les invocations. Pas de cache `false` ajouté pour réduire ce coût au détriment de la fermeture.

Hobby est gratuit pour usage personnel non commercial ; dépassement peut suspendre une fonctionnalité jusqu’au renouvellement de la limite, sans achat automatique prévu ici. La disponibilité de la page personnalisée n’est pas garantie si Vercel suspend le projet, les fonctions ou échoue avant leur exécution : une erreur de plateforme peut remplacer notre 503. Aucun engagement de SLA ajouté.

Vercel documente une propagation des écritures **jusqu’à 10 secondes mondialement** et déconseille les usages exigeant une visibilité immédiate après écriture. Les lectures cohérentes visent l’origine, mais PROD.1 ne démontre pas de fermeture atomique mondiale, d’ordre avec Vercel Authentication ni de latence réelle. Vérifier effectivement les réponses, sans traiter « attendre 10 s » comme preuve. Une lecture lancée avant la bascule peut encore terminer selon son état antérieur ; requêtes déjà engagées et opérations en vol doivent être traitées dans le workflow coordonné.

Les routes directes, `/index.html`, fichiers `/assets/*`, favicon, robots, API éventuelles et chemins inconnus ne sont pas exclus par le code. Les chemins réservés, redirections/canonicalisation et réponses servies par Vercel avant middleware nécessitent des contrôles réels : ils peuvent présenter une réponse plateforme différente. Authentication peut afficher sa propre page avant le middleware ; **ne jamais désactiver All Deployments pour forcer l’affichage de MY.** Ne pas confondre un bypass Vercel Authentication avec un bypass maintenance : le code ne lui accorde aucun passage.

Un navigateur possédant déjà HTML/JS ou un onglet ouvert peut utiliser son cache et naviguer sans nouvelle requête Vercel. Une réponse 503 sans cache empêche de mémoriser cette réponse, mais ne révoque pas les anciennes ressources déjà chargées. **Supabase reste directement accessible selon ses protections existantes ; aucun gel backend livré dans PROD.1.** Preview non connectée reste ouverte au niveau maintenance et sous Vercel Authentication ; elle n’est pas un environnement complet Auth/MFA/Supabase.

### Contrôles opérateur et campagne réelle restante

**Aucun bypass opérateur livré.** L’opérateur reçoit également 503 sur toutes les URLs Production compatibles pendant maintenance, même après Vercel Authentication. Le dashboard permet de contrôler commit, build et configuration ; une Preview séparée peut éprouver le dispositif mais ne prouve pas les parcours Supabase Production.

**PROD.7B.2 — investigation du 15 octobre 2026 : T1 reste bloquant pour E.** [Solutions, preuves et décision nécessaire](reports/2026-10-14-PROD7B2-FRONTEND-VERIFICATION.md). Les URLs générées d’un build Production restent soumises à `maintenance_production` ; inspection de build, exécution isolée de ses octets exacts, frontend hébergé réellement servi et parcours complet après réouverture sont quatre preuves distinctes. L’export intégral du build Git et son exécution isolée ne sont pas démontrés. Cette voie sans bypass est recommandée seulement si le propriétaire accepte explicitement le changement de niveau de preuve avant E ; sinon, une capacité opérateur temporaire vérifiée côté serveur doit être cadrée et approuvée. Aucun critère E, exception de maintenance ou mécanisme fonctionnel modifié ici.

**Contrôles disponibles en PROD.3 :** PostgreSQL privé avec identité réelle, observation et relecture indépendantes ; HTTP depuis une session Vercel normalement autorisée, sans passage au travers de la maintenance. Aucun bypass frontend livré ou ajouté. Les lectures Supabase autorisées avec compte synthétique MFA peuvent vérifier données/reçus/notification directement, sans écrire ni lever le gel. **Le contrôle du frontend Production réellement servi et les parcours applicatifs prévus dans E restent à éprouver par un moyen protégé validé séparément.** Dashboard/build `Ready` et parité du commit ne remplacent pas cette preuve. Tant que cette condition manque, ne pas déclarer le workflow complet opérationnel ni autoriser sa réouverture. Ne pas ajouter de secret client, paramètre public ou exception de hostname pour contourner ce prérequis.

Campagne manuelle à réaliser **d’abord en Preview**, store connecté et clé Preview isolée :

- Contrôler le middleware réellement compilé et invoqué, le plan/runtime, `VERCEL_ENV`, la connexion serveur, les quotas et absence de token dans les assets/l’HTML/logs. Vérifier navigation non autorisée sous Authentication puis accès opérateur autorisé, sans en déduire l’ordre d’exécution.
- État `false` : routes directes et refresh `/`, `/login`, `/forgot-password`, `/dashboard`, favicon et vrais assets du build ; fallback normal, aucun 503 maintenance. Sans Supabase Preview, limiter la preuve au shell/configuration attendue, pas aux fonctions métier.
- Mettre **Preview seulement** à `true` sans rebuild : GET et HEAD obtiennent 503/headers attendus sur ces chemins, `/index.html`, JS/CSS réels, chemins inconnus, requêtes avec Range/ETag et tentatives paramètre/cookie/header. Page visible sans ressources, responsive, pas de cache 200/304 contournant le dispositif. Examiner headers client et logs/cache Vercel : certains headers CDN peuvent être consommés par la plateforme.
- Garder fermeture pendant un build Preview compatible puis réutiliser un ancien déploiement compatible. Contrôler chaque URL et la stabilité de l’état ; ne pas déclarer Instant Rollback Production vérifié par cet essai Preview.
- Tester clé invalide/absente avec les protections du schéma en place ; si son retrait est nécessaire, le limiter au test Preview planifié et restaurer le schéma. Tester perte de connexion/token avec des credentials Preview distincts : **ne pas révoquer un token partagé avec Production**. Modifier une variable de connexion exige un déploiement de test, contrairement à la bascule d’item.
- Repasser Preview à `false`, vérifier réouverture sans changement de build, y compris après plusieurs requêtes ayant reçu 503. Relever durées, emplacement des clients, identifiants et résultats ; compléter séparément les contrôles domaine/CDN/rollbacks Production lors d’une intervention explicitement autorisée.

## PROD.2 — Gel backend Supabase

**Implémenté et démontré sur Local uniquement.** Le [contrat SQL](06-DATABASE.md#prod2--gel-des-écritures-métier) et le [rapport PROD.2](reports/2026-10-13-PROD2-WRITE-FREEZE.md) portent la matrice exhaustive des écritures et les résultats. Aucun déploiement Edge nécessaire : `delete-account` reste protégé par sa destruction Auth transactionnelle. Ce dispositif est indépendant de Global Config et de Vercel.

### Activer, vérifier et désactiver sur Local

Depuis un terminal de confiance, ouvrir une **connexion PostgreSQL opérateur**. Aucune clé Supabase API, JWT utilisateur ou identité `service_role` ne remplace cette connexion :

```powershell
docker exec -it supabase_db_my-local psql -U postgres -d postgres
```

Dans psql, conserver l'autocommit et vérifier l'identité avant bascule :

```sql
\set AUTOCOMMIT on
select session_user, current_user;
select private.get_business_write_freeze();
select private.set_business_write_freeze(true);
```

Seuls `session_user=postgres` ou `supabase_admin` sont opérateurs SQL prévus. La table privée ne possède aucun droit API et les fonctions de contrôle ne sont pas exposées dans `public`. Elles vérifient l'identité de connexion malgré leur ACL. Ne jamais implémenter une RPC publique de bascule ou un passage par claim, header, métadonnée, rôle courant ou variable de session.

La bascule attend le verrou exclusif transactionnel `771403`, derrière les writers déjà admis. Leurs verrous partagés durent jusqu'au commit/rollback ; les nouvelles admissions attendent derrière la bascule. La mise à jour du singleton vient après ce drainage. **Attendre la réussite de la commande et son commit**, puis ouvrir une seconde connexion et relire :

```sql
select private.get_business_write_freeze();
```

Exiger `frozen=true`, relever révision, date et identité SQL, puis contrôler les gardes/grants effectivement installés et les refus d'une identité synthétique autorisée. Un `true` produit dans une transaction non committée reste provisoire ; un simple état sauvegardé ne prouve pas que le bon backend, les gardes et les exceptions ont été vérifiés. Aucun délai fixe ne remplace ces observations.

Pendant une attente, observer depuis une autre connexion opérateur :

```sql
select pid, usename, state, xact_start, wait_event_type, wait_event,
       pg_blocking_pids(pid) as blockers
from pg_stat_activity
where datname = current_database() and backend_type = 'client backend';

select pid, mode, granted
from pg_locks
where locktype = 'advisory' and classid = 0 and objid = 771403 and objsubid = 1;
```

Ces requêtes n'affichent ni SQL ni secrets. `ShareLock` accordés identifient les writers admis ; `ExclusiveLock` en attente identifie la bascule. Après commit, un état fermé et des gardes en place interdisent les nouvelles mutations ordinaires ; pas besoin d'attendre artificiellement des requêtes REST dont la réponse réseau arriverait encore. Une lecture avec verrou ou une transaction longue peut retarder un writer et donc la bascule. Diagnostiquer les blockers ; une éventuelle annulation administrative exige une décision opérateur, jamais un kill automatique ou une réouverture automatique.

Timeout, deadlock, rollback, perte de connexion ou réponse incertaine : ne pas annoncer le gel effectif. Relire l'état sur une connexion fraîche ; inspecter les transactions/locks et reprendre la même bascule si nécessaire. Ne pas effectuer d'autres écritures métier dans la transaction de bascule. Une transaction ordinaire qui a déjà acquis son verrou peut continuer pendant l'attente, mais **aucune de ses écritures ne peut committer après le commit réussi de la fermeture**. Une transaction commencée avant, sans admission préalable, relit l'état fermé ou échoue `40001` si son snapshot est ancien.

Les migrations, imports catalogue et opérations SQL exécutées par les opérateurs sont des exceptions explicites. Le publisher est également autorisé seulement pour publication/retrait. **Arrêter/coordonner ces opérations avant backup.** La barrière ne draine pas ces exceptions ni les écritures internes Auth ; le futur dispositif de sauvegarde devra définir son snapshot cohérent et son périmètre. La fin des écritures métier ordinaires ne vaut pas arrêt de toute la base Supabase.

Réouverture après les conditions de la séquence E, en autocommit :

```sql
select private.set_business_write_freeze(false);
```

Relire depuis une seconde connexion puis vérifier lectures et mutations légitimes. Aucune modification d'ACL, migration ou redéploiement n'est nécessaire pour une bascule. Garder le gel pendant une erreur de publication. Ne pas supprimer le singleton pour rouvrir : son absence provoque un refus fermé. UUID, requête et token Phase 8 restent ceux de l'opération incertaine ; les reçus sont consultables pendant le gel. Le replay d’un writer ordinaire est refusé tant que le gel reste actif, puis retrouve son contrat historique après réouverture. Le `super_admin` éligible conserve les mêmes règles de reçu et d’idempotence pendant le gel.

### Auth, Edge et limites

Les comptes existants peuvent continuer à se connecter, vérifier/enrôler MFA selon Auth, rafraîchir ou révoquer les sessions et suivre les contrôles natifs email/password. Ces chemins modifient des tables gérées par Supabase mais aucune donnée métier MY. actuelle. Signup/admin création et suppression physique déclenchent les gardes sur `auth.users` : échec atomique avant les triggers métier. Auth masque l'erreur SQL : Local retourne HTTP 500 avec un message générique `Database error` pour ces refus, sans compte/profil partiel ni code SQL public. PostgREST expose HTTP 503 `PT503` pour les mutations MY.

L'Edge conserve vérifications initiales, password/TOTP frais et révocation globale avant destruction physique. Pendant le gel, elle retourne 503 `deletion_failed`, compte/données conservés ; **les sessions déjà révoquées ne sont pas rétablies**. L'utilisateur doit se reconnecter. Cette révocation reste nécessaire aussi lors d'une course : gel activé entre révocation et suppression. Aucune vérification frontend de maintenance ne constituerait une protection atomique supplémentaire.

Le gel ne bloque pas les UPDATE internes d'`auth.users`, dont suppression administrative **soft** (`deleteUser(..., true)`), confirmations et métadonnées, ni les tables `auth.sessions`/MFA/identités. La suppression soft n'est pas le parcours MY. exposé aux utilisateurs ; elle ne déclenche aucun nettoyage MY. et reste une opération Auth administrative à exclure/coordonner pendant publication. Ne pas modifier arbitrairement les mécanismes Auth internes pour obtenir un arrêt global. Aucun Storage ou writer Realtime applicatif actuellement recensé ; leurs éventuels futurs chemins devront rejoindre l'inventaire. Un superuser/owner SQL de confiance peut modifier la sécurité : le dispositif ne prétend pas résister à un administrateur malveillant.

### Installation Cloud confirmée et contrôles restants

**Installation désormais confirmée par le propriétaire : 52 migrations appliquées Cloud et essais du gel/exception `super_admin` depuis Preview en PROD.7B.2.3.** Ne pas réappliquer les migrations enregistrées. Avant PROD.7C, relire historique détaillé, version PostgreSQL, contrats des RPC, propriétaires/ACL, identités réelles des services, garde Auth et permissions ; un nombre de migrations et deux mutations réussies ne constituent pas une parité exhaustive. [clôture PROD.7B.2.3](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md).

Pour toute cible où l’installation serait réellement absente, préparer séparément sauvegarde/reprise et fenêtre autorisée ; installer les deux migrations PROD.2 du même commit, sans préfixe volontairement partiel. Pour le Cloud déjà confirmé installé, contrôler les gardes et permissions effectives, anciennes sessions, Auth/Edge et publisher avec identités réelles/TLS. Les scripts Local refusent toute connexion distante ; ne pas transposer leur provisionnement synthétique au Cloud. Essais distants uniquement avec périmètre/fixtures/audience explicitement approuvés.

Une activation puis désactivation du gel Cloud a déjà été confirmée en PROD.7B.2.3, état final ouvert révision `4`. Lors de la prochaine fermeture coordonnée autorisée, relever bascule, relecture indépendante, sécurité, blockers et refus ordinaires directs ; coordonner exceptions/Auth et snapshot. Cette clôture ne prouve pas ces contrôles, le frontend Production sous fermeture, la sauvegarde/restauration ou la publication complète.

## PROD.7B.2.1 — Attribution manuelle future des rôles

**Socle Local livré en `0.8.31`, puis exception permanente au gel backend en `0.8.32` (PROD.7B.2.2).** Le compte personnel Local déjà attribué avant cette sous-phase est conservé sans réattribution/révocation. `super_admin` reste un statut MY. privé ; aucun rôle SQL, accès privé d’autrui, droit Premium actif ou bypass frontend. Le compte Cloud `super_admin` est désormais attribué et vérifié selon le propriétaire, avec essais Preview/Cloud clos dans la [clôture PROD.7B.2.3](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md). Critère frontend Production avant réouverture et PROD.7C restent ouverts ; aucun accès Cloud par Codex pendant cette clôture. [Contrat SQL](06-DATABASE.md#rôles-applicatifs--prod7b21), [rapport du socle](reports/2026-10-15-PROD7B21-APP-ROLES.md).

Procédure de référence pour une future attribution séparément autorisée ; ne pas réattribuer le compte Cloud déjà vérifié en PROD.7B.2.3 :

1. Créer le compte par le parcours Auth normal, confirmer l'email, terminer TOTP/AAL2. Relever son UUID Auth réel dans une source opérateur fiable et recouper l'identité avec le propriétaire. Aucun email fixe, premier inscrit privilégié ou UUID présent dans Git.
2. Ouvrir une connexion PostgreSQL autorisée à la cible examinée, avec une vraie session `postgres` ou `supabase_admin`. Les identités `service_role`, `authenticator`, Auth et publisher ne sont pas opérateurs. Garder les identifiants de connexion hors Git, arguments et journaux. Vérifier hôte/cluster/base, `session_user` et `current_user` ; un `SET ROLE postgres` depuis une autre session ne suffit pas.
3. Avec `psql`, saisir l'UUID, contrôler le compte et appeler le setter privé. Arrêter si l'identité ne correspond pas ou si compte/profil/TOTP ne sont pas vérifiés. Le setter exige lui-même compte existant non anonyme, email confirmé et profil ; le prédicat exige AAL2 au moment d'utiliser le rôle.

```sql
select session_user, current_user, current_database();
\prompt 'UUID Auth réel du propriétaire vérifié : ' my_role_user_id
begin;
select u.id, u.email_confirmed_at, p.id is not null as has_my_profile,
  exists (select 1 from auth.mfa_factors f where f.user_id = u.id
    and f.factor_type = 'totp' and f.status = 'verified') as totp_verified
from auth.users u left join public.profiles p on p.id = u.id
where u.id = :'my_role_user_id'::uuid for update of u;
select private.set_app_role(:'my_role_user_id'::uuid, 'super_admin');
commit;
```

4. Ouvrir **une autre connexion** à la même cible. Ressaisir l'UUID, puis lire l'attribution persistée :

```sql
\prompt 'UUID Auth à relire : ' my_role_user_id
select user_id, role, granted_at, granted_by
from private.app_role_assignments where user_id = :'my_role_user_id'::uuid;
```

Une réponse SQL avant commit ne prouve pas l'attribution. En cas d'erreur ou réponse incertaine, relire l'état depuis une nouvelle connexion avant tout retry. Répéter `super_admin` conserve la ligne et sa provenance ; aucune modification de métadonnées ni rotation de JWT n'est nécessaire. Le prédicat interne `private.is_super_admin()` utilise uniquement l'UUID authentifié, l'AAL2 et l'état serveur vivant. Il ne constitue pas une RPC ou une interface frontend dans cette sous-phase ; sans contexte Auth, il retourne faux.

5. Pour révoquer, utiliser le même type de session opérateur, l'UUID vérifié et une transaction explicite :

```sql
begin;
select private.set_app_role(:'my_role_user_id'::uuid, 'user');
commit;
```

Confirmer l'absence de ligne depuis une autre connexion. La révocation est idempotente. La suppression physique normale du compte enlève aussi l'attribution par cascade dans la transaction Auth. Pendant le gel PROD.2, cette destruction reste bloquée ; login et MFA restent sous leurs contrôles existants. Les opérateurs SQL gardent leur exception PROD.2 préexistante pour administrer la table ; le statut applicatif `super_admin` reçoit uniquement l’exception métier décrite ci-dessous, aucun accès administratif.

## PROD.7B.2.2 — Exception permanente au gel pour super_admin

**Livrée et vérifiée uniquement Local en `0.8.32`.** [Migration additive](../supabase/migrations/20261015123024_prod7b22_superadmin_freeze.sql), [preuves](reports/2026-10-15-PROD7B22-SUPERADMIN-FREEZE.md). Aucun réglage supplémentaire à activer ou désactiver pendant publication. Le rôle suit le compte, quel que soit le frontend utilisé ; aucune configuration Preview. La maintenance Vercel reste inchangée.

La garde centrale réutilise `private.is_super_admin()` après acquisition partagée de `771403` et lecture du singleton `FOR SHARE`. Gel fermé, seules les requêtes applicatives de la vraie session `authenticator`, portant un JWT Supabase vérifié de rôle API `authenticated`, d'UUID attribué côté PostgreSQL, AAL2 et profil vivant, passent cette décision. Le rôle MY. ne vient jamais d'un claim de rôle, d'une adresse email ou de métadonnées. Un singleton absent refuse également ce compte. Un JWT falsifié est refusé par l'API avant SQL.

| Identité pendant le gel | Résultat |
|---|---|
| Compte ordinaire, révoqué, AAL1, non connecté | Écritures métier refusées |
| `super_admin` Auth AAL2 éligible | Opérations métier déjà autorisées admises automatiquement |
| `service_role`, session privilégiée sans identité applicative éligible | Refus existants conservés, aucun emprunt du rôle MY. |
| Auth création/destruction, y compris compte `super_admin` | Refus transactionnels existants conservés |
| SQL direct `postgres` / `supabase_admin` | Exception opérateur existante |
| Publisher SQL dédié | Publication/retrait seuls, exception existante |

Les services/RPC, signatures, politiques RLS, contrôles de propriété, consentement Phase 8 et reçus restent inchangés. Reorder, ajout/retrait manuel, possession/exemplaires, masquage, actualisation et lecture/traitement de notifications utilisent leurs chemins normaux. Aucun droit sur les collections privées d'autrui, aucun rôle PostgreSQL, aucune attribution de rôles ni bascule/modification des protections du gel depuis l'application.

La révocation prend effet à la requête suivante sans refresh JWT ; aucune interruption rétroactive d'une requête déjà commencée. Les transactions `super_admin` gardent les verrous jusqu'au commit/rollback, attendent derrière une bascule en file et participent à son drainage. Les snapshots anciens restent refusés. `closed_and_drained` atteste le refus ordinaire, sans interdire de nouvelles écritures des exceptions permanentes : leur coordination et le snapshot cohérent restent requis pour le backup. Aucun contrôle supplémentaire de rôle pendant une publication.

Retour arrière éventuel : nouvelle migration additive rétablissant le corps central de `20261013135415`, sans supprimer table, rôle, données ou historique ; adapter aussi le contrat exact de l'outillage opérateur. Aucun rollback effectué ici. L'ancienne application reste compatible, puisque cette évolution est entièrement interne. Livraison PROD.7B.2.2 historiquement Local uniquement ; installation et essais Preview/Cloud confirmés depuis par le propriétaire dans la [clôture PROD.7B.2.3](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md). Aucun changement Vercel/GitHub ni développement pendant cette clôture ; PROD.7C reste à effectuer.

## PROD.3 — Coordination opérateur

**Livrée en `0.8.26`, répétée sur Local uniquement dans PROD.3.** [CLI](../scripts/maintenance/cli.js), [contrôles SQL](../scripts/maintenance/database.js), [contrôles HTTP](../scripts/maintenance/http-check.js), [rapport](reports/2026-10-13-PROD3-COORDINATION.md). Aucun mécanisme PROD.1/PROD.2, RPC publique, frontend ou droit publisher modifié. Les commandes Local refusent les cibles distantes ; [AUTO.1](#auto1--pilotage-cloud-du-gel) ajoute une sélection Cloud distincte au même moteur. Aucune bascule Global Config automatisée. Les contrôles HTTP sont générés hors connexion, jamais exécutés sur Cloud par ces sous-phases.

### Précontrôle et dossier opérateur

Une publication doit identifier **les deux cibles**, pas seulement une URL ou une version. Conserver dans un dossier d'exploitation protégé hors Git : opérateur responsable et autorisation, UTC, version/commit/build attendus et précédents, projet/organisation Vercel, domaine/alias/URLs de déploiements et rollback compatibles, store et clés Global Config, environnement serveur et connexion disponible (identifiant, jamais valeur secrète), projet PostgreSQL et son identité stable, historique réel des migrations, writers privilégiés recensés et preuves requises pour le backup/la réouverture.

Pour Local, stack `my-local` déjà démarrée, port hôte `55322`, base `postgres`. CLI réutilise la connexion Local du pipeline ; une variable `MY_MAINTENANCE_DATABASE_URL` peut fournir une connexion privée déjà disponible. La fournir uniquement dans l’environnement d’un terminal de confiance, jamais en argument, transcript, fichier suivi ou frontend. Aucun secret Cloud ajouté. Le statut CLI est capturé en mémoire, ses clés API ne sont pas affichées ni utilisées comme identité opérateur.

```powershell
npm.cmd run maintenance:db -- --command preflight --environment local --project my-local
npm.cmd run maintenance:db -- --command observe --environment local --project my-local
```

`preflight` contrôle version package/lock/racine du lock, branche/HEAD et état dirty, configuration Local, identité réelle `session_user=current_user=postgres|supabase_admin`, base/port serveur, version PostgreSQL, `system_id` exact, `session_replication_role=origin` et visibilité complète des sessions. Puis : 52 migrations identiques aux fichiers, corps/owner/definer/search_path des 17 fonctions (15 PROD.2 avec évolution centrale PROD.7B.2.2 et deux fonctions de rôles), 24 gardes actives y compris Auth, singleton et attributions sous RLS/ACL fermées, absence d'accès API aux contrôles, identité/permissions publisher inchangées. Une table/partition supplémentaire non cadrée, un overload, une définition altérée ou un historique divergent fait échouer le précontrôle. Adapter explicitement le contrat versionné lors d'une future évolution ; ne pas ignorer son échec.

`observe` reste disponible pour diagnostiquer sans exiger un contrat complet. Il expose uniquement état, PID, catégorie de session, état/borne transactionnelle, événement d'attente, blockers, locks `771403` et nombre/ancienneté de transactions préparées. Aucun texte SQL, adresse client, nom d'application libre, donnée personnelle ou secret. Catégories SQL : `authenticator` = `ordinary` (inclut les requêtes `super_admin`, sans révéler leur identité MY.) ; opérateurs/publisher = privilégiées ; `supabase_auth_admin` = Auth interne ; autres = non classées. La catégorie SQL ne détermine pas le rôle applicatif. L'observation est un échantillon, pas une preuve de cessation future des jobs. Visibilité insuffisante ou identité incorrecte interdit toute attestation.

Lire réellement la sortie avant de poursuivre. Pour lier les commandes à une cible et une révision déjà examinées :

```powershell
$maintenanceCheckpoint = node scripts/maintenance/cli.js --command preflight --environment local --project my-local | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Précontrôle refusé' }
# Examiner identity.system_id, repository, state et contract avant bascule.
```

### Fermeture et borne de commit

1. Vérifier le dossier opérateur, les protections installées et les résultats initiaux ouverts. Coordonner les propriétaires de jobs/imports/migrations/publisher ; aucun autre opérateur ne doit basculer pendant cette fenêtre.
2. **Frontend d'abord** : action manuelle Global Config sur la bonne clé, `Save Items`. Vérifier enregistrement puis HTTP autorisé sur les cibles inventoriées. Garder la fermeture sur tout déploiement compatible. Local ne possède pas Global Config : la répétition utilise un serveur HTTP isolé servant la vraie page PROD.1, sans prétendre reproduire Vercel/CDN.
3. **Backend ensuite** : demander le gel sur la cible et la révision relevées. Ne pas placer d'autres écritures métier dans cette transaction.

```powershell
node scripts/maintenance/cli.js --command close --environment local --project my-local --expect-system-id $maintenanceCheckpoint.identity.system_id --expect-revision $maintenanceCheckpoint.state.revision
```

Sortie NDJSON : `requested=true, recorded=unknown`, puis `provisional_before_commit`, puis `commit_acknowledged`, enfin `recorded=committed, verified=true, independent_read=true`. Une sortie intermédiaire ne vaut pas succès final. La transaction prend exclusivement `771403`, vérifie la révision sous verrou, appelle le setter PROD.2 seulement si l'état doit changer, puis commit. Depuis AUTO.1, une bascule déjà satisfaite renvoie `changed=false, idempotent=true` sans incrémenter la révision ; la comparaison de révision reste obligatoire. Une connexion fraîche au même `system_id` doit ensuite retrouver exactement l'état et la révision attendus. BIGINT et identifiant système restent des chaînes décimales.

`ShareLock` accordé = admission ordinaire encore détenue ; `ExclusiveLock` en attente et ses blockers = fermeture en attente. Les writers admis doivent finir jusqu'au commit/rollback avant la borne de gel. Un lecteur qui verrouille le parent peut indirectement retarder cette borne. Timeout, deadlock, réponse perdue ou interruption : état **inconnu**, aucune réouverture ni relance automatique. Refaire précontrôle/observation depuis une connexion indépendante. Une bascule peut avoir committé malgré une réponse perdue ; une répétition exige la nouvelle révision examinée. Aucun kill automatique. `--timeout-ms` borne la commande (100–60 000 ms, défaut 15 000), jamais la maintenance.

### Attestation backend et refus de commencer un backup

Après relecture du nouveau checkpoint et examen de ses résultats :

```powershell
$maintenanceCheckpoint = node scripts/maintenance/cli.js --command preflight --environment local --project my-local | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'État inconnu' }
node scripts/maintenance/cli.js --command verify-closed --environment local --project my-local --expect-system-id $maintenanceCheckpoint.identity.system_id --expect-revision $maintenanceCheckpoint.state.revision
```

La vérification reprend le contrat, tient un verrou partagé `771403` pour empêcher une bascule concurrente pendant l'observation, exige le gel et la révision attendus, refuse les autres locks d'admission et toute transaction préparée, puis ouvre une vraie session `authenticator`. Sous `authenticated` et `service_role`, SELECT zéro ligne reste autorisé et UPDATE zéro ligne doit retourner exactement `PT503/business_writes_frozen`. Aucune fixture, séquence, faux JWT ou MFA créé par ce probe opérateur. Il prouve la garde SQL de statement ; il ne prétend pas tester REST/MFA ni une mutation utilisateur réelle. Les tests d'intégration isolés vérifient en plus lecteur/RPC Phase 8 et reprise réelle.

Résultat `ordinary_writes=closed_and_drained` = **preuve backend Local, à cette borne**, pas fermeture globale. Chaque résultat, même réussi, conserve **`backup_authorized=false` et `global_closure=not_attested`**. Code de sortie 0 signifie seulement réussite du contrôle nommé ; 1 signifie inconnu/refus, 130 interruption gérée. Ni ce résultat, ni un statut `Ready`, dashboard, délai ou retour du setter avant commit n'autorise un backup Production.

Avant un backup futur, exiger ensemble :

- HTTP de maintenance réellement vérifié sur domaine, alias et déploiements concernés avec accès Vercel autorisé ; inventaire de couverture et limites de propagation consignés.
- Backend cible installé/vérifié, état fermé committé relu indépendamment, gardes/permissions et refus ordinaires établis, aucun drainage indéterminé.
- Chaque import catalogue, migration, session opérateur, publisher, session applicative `super_admin` éligible et autre writer privilégié recensé, arrêté ou placé sous une exclusion opérationnelle tenue pendant la sauvegarde ; transaction en cours terminée par son propriétaire. Un PID privilégié sans lock `771403` reste un writer possible. Aucune nouvelle publication pendant le backup ; la publication du changelog vient plus tard selon E.
- Auth interne explicitement pris en compte dans la future méthode de snapshot cohérent. Login/MFA/refresh/révocation/UPDATE Auth restent actifs ; le gel ne les arrête pas. Aucune suppression physique Auth pendant gel, aucune soft deletion administrative ou opération Auth non coordonnée. Observer leur absence à un instant ne les interdit pas ensuite.
- Périmètre/export/snapshot cohérent et restauration déjà éprouvés dans le bloc backup, autorisation Cloud explicite, cible/commit/version/historique exacts et toutes les preuves conservées.

Une condition absente ou inconnue interdit d'annoncer « fermeture validée pour backup ». PROD.3 n'effectue aucun backup et ne fournit aucun mode `--force`, certificat de sûreté Production ou mécanisme d'arrêt global Auth/PostgreSQL.

### Contrôles HTTP futurs sous Vercel Authentication

Préparer le code sans appel réseau :

```powershell
npm.cmd run maintenance:http -- --print-browser --expect closed
npm.cmd run maintenance:http -- --print-browser --expect open
```

Lors d'une intervention distante **autorisée séparément**, se connecter normalement à Vercel, avec identité habilitée et All Deployments conservé. Exécuter le code généré dans un onglet autorisé déjà ouvert du bon origin dont la CSP permet ces requêtes. Il utilise les cookies normaux `credentials=same-origin`, aucune clé, header de bypass ou automatisation Global Config. La CSP de la page maintenance bloque volontairement fetch : dans ce cas, utiliser navigation normale et panneau Network pour les mêmes contrôles, sans désactiver la CSP ni Authentication. `vercel curl` ajoute automatiquement un header de bypass de Deployment Protection selon sa documentation : il n'est pas retenu ici.

Le code relève GET/HEAD pour `/`, `/login`, `/dashboard`, `/index.html`. Ajouter pour la fermeture les vrais JS/CSS/favicon/robots et chemins directs/inconnus de l'inventaire, uniquement chemins publics sans query, token ou fragment. Répéter pour chaque origin/déploiement compatible, avec sa propre session normale. Les indices de cible dans la sortie correspondent à la liste conservée dans le dossier ; aucune URL, cookie, HTML ou donnée de session journalisée.

Fermé : HTTP 503, titre exact de la page MY. pour GET, HEAD vide, `Cache-Control` avec no-store/no-cache/max-age=0/must-revalidate, Pragma/Expires, noindex/nofollow/noarchive, type HTML et CSP de fermeture. Les headers CDN sont relevés ; Vercel peut les consommer : compléter par logs/cache autorisés, jamais déduire l'inexistence d'un cache de leur seule absence côté client. Ouvert : HTTP 200 et shell SPA sur les routes HTML ; assets et parcours Auth/MFA/backend nécessitent leurs contrôles dédiés. 401/403, redirection, opaque redirect, 304, page générique 503, erreur réseau/CSP ou header indispensable absent = contrôle non validé.

Conserver horodatage, identifiant/commit du même déploiement avant/après, localisation des clients et observations. **Un échantillon HTTP n'est pas une preuve de propagation mondiale** ; `worldwide_propagation_verified=false` reste explicite. Aucune mesure Production exécutée ici. Preview sans Supabase ne sert jamais à valider le backend.

### Réouverture explicite et contrôles de reprise

Décision opérateur obligatoire après vérification de tous les prérequis E : même commit/version de frontend et backend, migrations/config/Edge effectivement réussies, compatibilité et reprise Phase 8, notification active/version/audience/idempotence relues, absence de writer privilégié inattendu, aucun état inconnu, moyen de contrôle applicatif hébergé validé. Si ces preuves n'existent pas, conserver fermeture. Les exemples suivants sont **Local**, pas une autorisation Production.

```powershell
# Refaire/examiner preflight et assigner maintenanceCheckpoint avant cette décision.
node scripts/maintenance/cli.js --command reopen --environment local --project my-local --expect-system-id $maintenanceCheckpoint.identity.system_id --expect-revision $maintenanceCheckpoint.state.revision --authorize-reopen
# Refaire/examiner preflight : la révision a changé après commit ; arrêt si inconnu.
$maintenanceCheckpoint = node scripts/maintenance/cli.js --command preflight --environment local --project my-local | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'État inconnu' }
node scripts/maintenance/cli.js --command verify-open --environment local --project my-local --expect-system-id $maintenanceCheckpoint.identity.system_id --expect-revision $maintenanceCheckpoint.state.revision
```

`reopen` sans `--authorize-reopen`, avec ancienne révision/cible ou contrat incomplet est refusé. Commit et relecture indépendante sont obligatoires comme à la fermeture. `verify-open` vérifie lectures et UPDATE zéro ligne autorisé ; compléter par une vraie mutation légitime sur identité/donnée synthétique isolée et sa relecture. **Lever backend d'abord**, puis décision explicite manuelle sur la bonne clé Vercel à `false`, `Save Items`, HTTP/routes/ressources/version et parcours Auth/MFA/backend. La répétition Local couvre mutation persistée et RPC Phase 8, puis HTTP 200. Aucun `finally`, succès, erreur, timeout ou arrêt du CLI ne rouvre le gel.

Si levée backend confirmée mais frontend encore fermé : ne pas présumer la reprise ; diagnostiquer le frontend. En cas d'échec de reprise, l'opérateur décide explicitement de rétablir fermeture frontend puis gel, avec nouveau contrôle et drainage. Ce rétablissement n'est jamais automatique. Après `delete-account` refusée en gel, les sessions révoquées restent révoquées : reconnexion requise ; refus Auth natif 500 générique possible, distinct du REST 503. Pour Phase 8, garder UUID, payload/token, intention et reçu exacts ; réponse réseau incertaine ou reçu absent n'autorise aucune nouvelle opération aveugle.

## AUTO.1 — Pilotage Cloud du gel

**Implémenté et validé uniquement sur PostgreSQL/TLS synthétiques isolés. Aucune connexion ou bascule Cloud effectuée pendant AUTO.1.** [Rapport](reports/2026-10-16-AUTO1-CLOUD-FREEZE.md). Le moteur PROD.3, les fonctions/gardes/ACL PROD.2 et l'exception permanente `super_admin` sont conservés. Aucun orchestrateur de backup, publication, maintenance frontend ou réouverture automatique livré. Une réouverture reste une commande opérateur explicitement autorisée, pas une décision prise par l'outil.

### Cible et prérequis

Seul projet accepté : **`xvtiwhxvtfxvvokquttu`**. Préparer hors Git un fichier de cible strict selon [l'exemple volontairement inexécutable](../scripts/maintenance/examples/target.json), sans mot de passe, URL de connexion ni options libres. Renseigner `system_id` à partir d'une source opérateur indépendante et fiable ; ne pas déduire sa valeur d'un nombre de migrations ou d'une ancienne révision. Renseigner le chemin absolu de la CA approuvée et son SHA-256 vérifié. Aucun téléchargement automatique, acceptation du premier certificat ou valeur Production inventée.

- Connexion directe : `connection=direct`, `host=db.xvtiwhxvtfxvvokquttu.supabase.co`, `user=postgres`, port `5432`. Réseau IPv6 fonctionnel ou accès direct IPv4 effectivement configuré requis.
- Alternative choisie explicitement : `connection=session`, hostname exact Supavisor `aws-N-REGION.pooler.supabase.com` ou `gcp-N-REGION.pooler.supabase.com`, `user=postgres.xvtiwhxvtfxvvokquttu`, port `5432`. Aucun repli depuis direct, transaction pooler/port `6543` et dedicated pooler refusés. Supavisor réel reste à vérifier lors d'une intervention autorisée ; la répétition AUTO.1 utilise la connexion directe synthétique.
- Identité PostgreSQL réelle `session_user=current_user=postgres`, base `postgres`, port serveur `5432`, réplication `origin`, lecture de `pg_control_system()` et visibilité complète via superuser ou appartenance effective à `pg_read_all_stats`. Échec de permission : arrêt, jamais ajout automatique de GRANT ou changement de rôle.
- Parité exacte avec les migrations du dépôt et contrat vérifié : 17 fonctions, 24 gardes, ACL privées et publisher inchangés. Les confirmations historiques du propriétaire ne remplacent pas ces contrôles actuels.

Le transport partage la validation TLS du publisher PROD.6 : CA épinglée, chaîne et hostname, protocole TLS 1.2/1.3, inspection du vrai `TLSSocket` client après connexion. `pg_stat_ssl` ne prouve pas le transport opérateur–pooler. Aucun `connectionString` Cloud ; variables héritées `PG*`, `MY_MAINTENANCE_DATABASE_URL` et désactivation TLS refusées. Le mot de passe provient de `MY_MAINTENANCE_DATABASE_PASSWORD`, consommé et supprimé de l'environnement Node avant tout sous-processus Git. Il reste seulement en mémoire pour la relecture indépendante.

### Commandes Windows prévues, à exécuter seulement après autorisation Cloud

Ces commandes documentent l'usage futur ; AUTO.1 ne les exécute pas sur le projet distant. Le wrapper demande le mot de passe par saisie masquée, le transmet temporairement au processus enfant, efface le BSTR et retire la variable dans `finally`. Aucun transcript, argument contenant un secret, fichier de résultat sensible ou variable `VITE_*`. Stocker le secret dans le gestionnaire approuvé ; aucun secret persistant créé par ce wrapper.

```powershell
$cloudFreezeArgs = @('--environment', 'cloud', '--project', 'xvtiwhxvtfxvvokquttu',
  '--target', 'C:/MY-operator/maintenance/target.json', '--authorize-cloud-connect')
$cloudFreezeCheckpoint = & ./scripts/maintenance/secrets.ps1 -MaintenanceArgs (@('--command', 'preflight') + $cloudFreezeArgs) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Précontrôle Cloud non vérifié' }
# Examiner repository, identity, state, contract et observation avant toute suite.
& ./scripts/maintenance/secrets.ps1 -MaintenanceArgs (@('--command', 'observe') + $cloudFreezeArgs)
```

`--authorize-cloud-connect` est obligatoire pour **toutes** les commandes Cloud, lectures comprises. Il autorise la connexion sélectionnée, jamais une bascule. Un fichier absent/invalide, une erreur TLS, un secret manquant ou un refus d'identité ne déclenche jamais une connexion Local de secours.

Après décision distincte de fermer, utiliser la révision examinée ; prendre seulement la dernière sortie NDJSON comme résultat final et vérifier le code de sortie :

```powershell
$cloudFreezeBound = @('--expect-system-id', $cloudFreezeCheckpoint.identity.system_id,
  '--expect-revision', $cloudFreezeCheckpoint.state.revision)
& ./scripts/maintenance/secrets.ps1 -MaintenanceArgs (@('--command', 'close') + $cloudFreezeArgs + $cloudFreezeBound + @('--authorize-close'))
if ($LASTEXITCODE -ne 0) { throw 'Gel Cloud inconnu : préflight et observation frais requis' }
```

`close` et `reopen` prennent le même verrou exclusif transactionnel `771403`, comparent la révision **sous verrou**, évitent le setter si l'état est déjà satisfait, commit puis relisent sur un nouveau socket avec les mêmes contrôles TLS/cluster. Deux opérateurs utilisant la même révision avant une vraie bascule ne peuvent pas tous deux réussir. Une bascule idempotente conserve aussi contrôle de révision, commit et relecture indépendante.

Relire un **nouveau** checkpoint `preflight`, l'examiner et reconstruire `$cloudFreezeBound` avant `verify-closed`, `verify-open` ou une nouvelle bascule. Ne jamais reprendre une ancienne révision après fermeture, erreur ou interruption.

```powershell
# Après nouvelle lecture et examen du checkpoint fermé :
& ./scripts/maintenance/secrets.ps1 -MaintenanceArgs (@('--command', 'verify-closed') + $cloudFreezeArgs + $cloudFreezeBound)
# Réouverture seulement après décision explicite distincte et préconditions E :
& ./scripts/maintenance/secrets.ps1 -MaintenanceArgs (@('--command', 'reopen') + $cloudFreezeArgs + $cloudFreezeBound + @('--authorize-reopen'))
```

Le flag `--authorize-close` ne permet jamais `reopen` ; `--authorize-reopen` ne permet jamais `close`. Aucun flag `--force`, retry, timeout du gel ou réouverture en cleanup. Vérifier `$LASTEXITCODE` après chaque invocation. Code `0` : contrôle nommé réussi ; `1` : non vérifié/refus ; `130` : interruption gérée. Un arrêt forcé peut empêcher toute sortie ; absence de résultat final signifie état inconnu.

### Portée des résultats et reprise

`verify-closed` exige état fermé et révision actuelle, vérifie le contrat, tient la barrière partagée contre une bascule concurrente et refuse tout autre lock d'admission ou transaction préparée observés. Résultat Cloud : `evidence_scope=Cloud_SQL_state_and_barrier_only_at_observation`, `drainage=no_admission_locks_or_prepared_transactions_at_observation`. Les transactions privilégiées/Auth restent visibles sans SQL, adresse client ou identité MY. ; leur absence à cet instant ne les exclut pas durablement. L'exception `super_admin` peut admettre de nouveaux writers et n'est jamais désactivée par l'outil.

Cloud ne reprend pas la connexion de probe Local : son mot de passe `postgres` n'authentifie pas `authenticator`, et `SET ROLE` depuis `postgres` conserverait le bypass `session_user`. Ainsi `probes.verified=false`, `ordinary_writes=SQL_contract_verified_API_not_probed`, `super_admin_exception=preserved_not_probed` et `privileged_writer_exclusion=not_attested`. Les refus ordinaires réels REST/RPC et le parcours Auth/MFA restent des preuves séparées à recueillir. `verify-open` confirme de même état ouvert/contrat/barrière, sans inventer une mutation API Cloud.

Tous les résultats gardent **`backup_authorized=false` et `global_closure=not_attested`**. Ni le statut SQL, ni cette commande ne certifient frontend, arrêt durable des imports/publisher/opérateurs/`super_admin`, snapshot, sauvegarde ou récupération. Les contrats PROD.3/4 et les conditions E restent requis.

Échec, timeout, interruption, commit sans accusé ou relecture différente : état **inconnu**, `verified=false`, diagnostic fixe sans erreur serveur brute. Refaire `preflight` et `observe` sur connexion fraîche, examiner la révision réelle puis choisir explicitement la prochaine commande. Si le gel est déjà actif après un commit incertain, un nouveau `close` avec la révision fraîche vérifie l'état sans l'incrémenter. Jamais de réouverture automatique, même lorsque la fermeture n'est pas attestée.

## AUTO.2 — Pilotage Vercel Production

**Livraison d'outillage Windows, validation exclusivement simulée ; aucune opération sur Vercel réel.** [Rapport](reports/2026-10-16-AUTO2-VERCEL-MAINTENANCE.md). Projet `my`, domaine `my.collectrealm.com`, Global Config et middleware PROD.1 conservés. Aucune écriture Preview, déploiement, promotion, modification SSO, domaine, variable d'environnement, autre clé ou gel Supabase. Version applicative `0.8.33` conservée comme AUTO.1 : outillage opérateur, aucun changement de l'application déployée. Aucune dépendance ajoutée.

### Contrat API et concurrence

Documentation officielle consultée le **16 octobre 2026**, via Context7 puis documents fournisseur et OpenAPI courants : [Global Config REST API](https://vercel.com/docs/global-config/vercel-api), [PATCH items](https://vercel.com/docs/rest-api/global-config/update-global-config-items-in-batch), [OpenAPI](https://openapi.vercel.sh/), [tokens et scopes](https://vercel.com/docs/accounts/access-tokens). API retenue : `https://api.vercel.com/v1/global-config/{id}` et `/items`, authentifiée par **token API Vercel opérateur**, distinct du read token `GLOBAL_CONFIG` du middleware. Les routes historiques `edge-config` ne sont pas nécessaires.

Écriture : **un seul** `PATCH /items`, corps fixe `{"items":[{"operation":"update","key":"maintenance_production","value":true}]}` pour fermer, même corps avec `false` pour rouvrir. Pas d'upsert, création de clé, description, remplacement du store ou répétition automatique. `{"status":"ok"}` n'est qu'un accusé. Le moteur relit projet, liaison, domaine, métadonnées et items après le PATCH ; une contradiction ou un changement d'autre clé interdit le succès. Le moteur ne corrige jamais une valeur absente ou invalide, même pour fermer : intervention distincte nécessaire.

**Aucune comparaison atomique d'empreinte avant écriture n'est documentée dans ce contrat officiel** : OpenAPI décrit 409/412 sans fournir de précondition CAS, de champ digest attendu ou de header `If-Match`. AUTO.2 n'en invente aucun. Avec accord explicite du propriétaire pendant AUTO.2, chaque commande d'écriture exige **`--confirm-exclusive-writer`** : tous les autres opérateurs, consoles, intégrations et automates pouvant modifier cette Global Config doivent rester exclus pendant la lecture, l'écriture et la relecture. Arrêter si cette exclusivité n'est pas établie ; ce drapeau est une déclaration opérateur, pas une exclusion distante effectuée par Vercel.

Un verrou fichier exclusif par **équipe/store**, commun aux fichiers de cible et aux processus de ce poste, sérialise les commandes locales. Emplacement : `%LOCALAPPDATA%\MY\maintenance\vercel-<sha256-équipe/store>.lock`, chemin exact fourni par `preflight` dans `operator_lock_path`. Pas d'expiration ni de récupération automatique d'un PID ancien. Ce verrou ne couvre ni les autres postes/utilisateurs Windows ni le dashboard. Les empreintes de métadonnées avant/après lecture et la seconde lecture avant PATCH détectent les changements observables ; **elles ne rendent pas atomique l'intervalle lecture–PATCH**. Une écriture distante concurrente rétablissant la même valeur peut rester indétectable. La garantie repose donc sur l'exclusivité déclarée, pas sur une résistance à des writers distants non coordonnés. AUTO.3 doit conserver cette précondition.

### Configuration initiale et credentials

1. Copier [l'exemple sans secret](../scripts/maintenance/examples/vercel-target.json) **hors Git**, par exemple `D:\MY-operator\vercel-target.json`. Renseigner les vrais `project_id`, `team_id`, `global_config_id` et `global_config_slug` depuis les réglages approuvés du projet et du store. Les placeholders `REPLACE` bloquent. N'ajouter aucun champ, token, URL, endpoint alternatif ou clé libre.
2. Vérifier indépendamment que cette Global Config est bien celle de la Production. Le moteur exige sur `GET /v9/projects/{id}` : ID/nom/équipe exacts, `ssoProtection.deploymentType=all` et une seule variable `GLOBAL_CONFIG` ciblant Production dont la métadonnée **`edgeConfigId`** correspond au store. Il ne déchiffre pas de variable, ne crée ni ne répare la liaison. Métadonnée manquante ou liaison manuelle non identifiable : `production_config_binding_unverified`, arrêt ; la compatibilité de la liaison réelle reste à éprouver dans une intervention autorisée. Le domaine vérifié doit appartenir au même projet, sans redirection, branche ou environnement personnalisé. ID, owner et slug du store sont contrôlés à chaque lecture.
3. Créer/garder dans le gestionnaire de secrets approuvé un **token API opérateur**, avec expiration courte et autorisations minimales permettant lecture projet/domaine/store/items et écriture des items du store attendu. Préférer le scope minimal réellement compatible. Vercel documente des tokens projet, mais ceux-ci refusent les ressources d'équipe ; ne pas présumer leur compatibilité avec Global Config. Si le store nécessite un token limité à son équipe propriétaire, examiner explicitement cette portée ; aucun repli automatique vers Full Account, aucun provisionnement ou élargissement de droits par l'outil. Aucune restriction fournisseur par clé n'est établie ici : la restriction `maintenance_production` est imposée par le moteur. Un 403 reste bloquant.
4. Utiliser le wrapper Windows ci-dessous : saisie `Read-Host -AsSecureString`, secret temporaire dans l'environnement du seul enfant Node, BSTR effacé et variable retirée dans `finally`. Le processus Node consomme/efface `MY_VERCEL_MAINTENANCE_TOKEN` **avant Git ou autre sous-processus**. Aucun stockage persistant créé par le wrapper. Aucun token dans JSON, arguments, historique, transcript, logs, presse-papiers journalisé ou `VITE_*` ; aucun import de l'authentification de la CLI Vercel ni utilisation du read token du middleware. Le secret restant en mémoire de l'opérateur doit bénéficier des protections normales du poste et du gestionnaire approuvé. HTTPS et validation TLS conservés ; `NODE_TLS_REJECT_UNAUTHORIZED=0` refusé. Si la CA système est nécessaire : `NODE_USE_SYSTEM_CA=1`, jamais désactiver TLS.

Les prérequis ci-dessus sont réels et non validés sur le service pendant AUTO.2. Aucune cible contenant de vrais IDs ni credential réel n'est créée par cette livraison.

### Commandes Windows futures, uniquement après autorisation de l'intervention réelle

Ces exemples ne sont **pas exécutés** pendant AUTO.2. `npm.cmd run maintenance:vercel -- ...` expose la CLI Node ; le wrapper constitue l'entrée interactive sûre pour ses credentials et produit le même NDJSON, sans bannière npm.

```powershell
$vercelBase = @('--environment','production','--project','my',
  '--target','D:\MY-operator\vercel-target.json','--authorize-vercel-connect')
$vercelCheckpoint = & .\scripts\maintenance\vercel-secrets.ps1 -VercelArgs (@('--command','preflight') + $vercelBase) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $vercelCheckpoint.control_plane_confirmed) { throw 'État inconnu ou invalide : arrêt' }
# Examiner identité, état, checkpoint et éventuel verrou avant toute décision.
$vercelCheckpoint
```

Fermer, après exclusion de tous les autres writers et décision explicite ; relever une empreinte fraîche par `preflight` si une incertitude ou modification est survenue :

```powershell
& .\scripts\maintenance\vercel-secrets.ps1 -VercelArgs (@('--command','close',
  '--expect-checkpoint',$vercelCheckpoint.checkpoint,'--authorize-close','--confirm-exclusive-writer') + $vercelBase)
if ($LASTEXITCODE -ne 0) { throw 'Fermeture non vérifiée : nouvelle lecture requise' }
```

Rouvrir exige décision **distincte**, après toutes les conditions E et levée Supabase indépendamment vérifiée. Refaire la première commande `preflight`, examiner le résultat, puis seulement :

```powershell
& .\scripts\maintenance\vercel-secrets.ps1 -VercelArgs (@('--command','reopen',
  '--expect-checkpoint',$vercelCheckpoint.checkpoint,'--authorize-reopen','--confirm-exclusive-writer') + $vercelBase)
if ($LASTEXITCODE -ne 0) { throw 'Réouverture non vérifiée : nouvelle lecture requise' }
```

`--authorize-close` ne permet jamais `reopen`, ni l'inverse. La connexion exige aussi `--authorize-vercel-connect`. Sans empreinte exacte, exclusivité, bonne cible ou état booléen connu, aucune écriture. Timeout par requête complète, corps inclus : `--timeout-ms 15000` par défaut, plage `100`–`60000`. Aucun auto-retry, polling de propagation ou ouverture par défaut.

### États, preuves et reprise

| Résultat | Signification et suite |
|---|---|
| `state.maintenance_production=true` / `false`, `control_plane_confirmed=true` | Valeur booléenne relue dans le **plan de contrôle**, à `observed_at` ; `checkpoint` lie identité et version du store. Ce n'est pas un contrôle HTTP |
| `state.maintenance_production=invalid`, `verified=false` | Plan lu mais clé absente ou valeur non booléenne ; aucune réparation automatique, sortie CLI 1 |
| `state.maintenance_production=unknown`, `recorded=unknown`, `verified=false` | Cible, auth, API, réseau, timeout, interruption ou relecture non établie ; code 1, ou 130 sur signal géré ; nouvelle lecture indépendante obligatoire |
| `recorded=api_acknowledged`, `verified=false` | Accusé intermédiaire seulement ; ne permet aucune suite |
| `recorded=reread_confirmed`, `verified=true`, `independent_read=true` | Valeur cible confirmée par nouveaux GET après PATCH ; autres items/metadata de la clé conservés selon comparaison ; portée limitée au plan de contrôle |
| `recorded=already_satisfied`, `changed=false`, `idempotent=true` | Même vérification sans PATCH ni nouvelle version volontaire. Une ancienne empreinte reste refusée |

Les diagnostics sont fixes : notamment `authentication_failed` (401), `permissions_insufficient` (403), `api_conflict_fresh_read_required` (409/412), `production_config_binding_unverified`, `configuration_changed_fresh_read_required`, `reread_contradicts_update`, `network_or_timeout_state_unknown` et `local_operator_busy_or_interrupted`. Jamais d'erreur fournisseur brute, contenu d'autres clés ou header/URL sensible dans les sorties.

Après échec, interruption, accusé perdu ou résultat contradictoire :

1. Arrêter la suite et les autres writers. Ne pas déduire l'état de l'accusé ni lancer l'action inverse. Un arrêt forcé peut empêcher toute sortie : l'absence de résultat final vaut état inconnu.
2. Refaire `preflight`, autorisé même en présence du verrou. Examiner identité, valeur réelle, nouvelle empreinte et `operator_lock_path`. Diagnostic auth/permissions/cible : corriger la cause sans bascule distante implicite.
3. Si un verrou persiste, vérifier indépendamment que son processus et tout autre writer ont terminé. Le PID seul ne prouve pas l'identité du processus. Examiner le marqueur exact puis supprimer **ce seul fichier**, manuellement, après coordination. Ne jamais nettoyer par wildcard, TTL ou PID automatique. Exemple après ces contrôles : `Remove-Item -LiteralPath $vercelCheckpoint.operator_lock_path`. Si le processus peut encore agir, ne pas supprimer le verrou.
4. Refaire une lecture fraîche après cette coordination puis décider explicitement de la prochaine commande. Si une fermeture incertaine a bien appliqué `true`, `close` avec la nouvelle empreinte vérifie sans PATCH supplémentaire. Une réouverture incertaine ne déclenche jamais de refermeture ou réouverture compensatoire automatique. Maintenir le gel Supabase selon sa procédure indépendante ; AUTO.2 n'y touche pas.

### HTTP protégé et interface AUTO.3

**Vercel Authentication — All Deployments reste volontaire et inchangé.** Un HTTP anonyme `302` vers Vercel SSO signifie admission Vercel requise ; il ne prouve ni échec ni succès du middleware. AUTO.2 ne collecte pas de cookies, ne génère pas de bypass et n'automatise aucune requête authentifiée. Le token de gestion API n'est pas traité comme une session HTTP autorisée.

Réutiliser le contrôle PROD.3 existant : `npm.cmd run maintenance:http -- --print-browser --expect closed` (ou `open`) génère hors connexion un snippet à exécuter depuis une session Vercel normalement authentifiée et une origine autorisée, si sa CSP permet le fetch ; sinon, relever les navigations GET/HEAD dans Network. Voir les [contrôles HTTP existants](#contrôles-http-futurs-sous-vercel-authentication). Fermeture : 503 MY. et headers attendus, pas seulement un 503 générique. Tester domaine, build Production identifié et autres déploiements compatibles séparément. Propagation mondiale, couverture des déploiements, build/version réellement servis et critère T1 avant E restent distincts et non attestés. Tous les résultats AUTO.2 gardent `middleware_http=not_observed_requires_normal_authenticated_request`, `deployment_coverage=not_attested`, `worldwide_propagation_verified=false`, `backup_authorized=false`, `global_closure=not_attested`.

Interfaces réutilisables sans recopier les règles :

- [vercel.js](../scripts/maintenance/vercel.js) exporte `readTarget`, `createVercelMaintenance(target, token, { authorizeConnect: true, timeout, signal })`, `preflight()` puis `setMaintenance('close'|'reopen', { checkpoint, exclusiveWriter: true, authorizeClose, authorizeReopen }, emit)`. Le moteur possède validation distante, PATCH fixe, verrou local, idempotence, délais et relectures ; `unknownResult`/`safeDiagnostic` assainissent les erreurs. `fetchImpl`/`lockDirectory` sont des injections pour les tests, absentes de la configuration/CLI Production.
- [vercel-cli.js](../scripts/maintenance/vercel-cli.js) exporte `parseCommand` et `run(command, emit)` : résultat structuré et identité Git/version par helper AUTO.1 réutilisé ; flux NDJSON pour CLI/sous-processus. La variable de token est consommée en entrée.
- [cli.js AUTO.1](../scripts/maintenance/cli.js) conserve `parseCommand`/`run` pour gel Cloud, avec son propre projet, `system_id`, révision, autorisations, barrière SQL et relecture indépendante. Aucun moteur n'appelle l'autre.
- AUTO.3 enchaîne ces interfaces avec `prod:backup`, recueille déclarations HTTP authentifiées/couverture et exclusion durable séparément des preuves automatiques, puis exige le drainage PROD.4 avant capture. Aucun `verified` du plan de contrôle n'est converti en preuve de fermeture globale ; aucune levée Supabase depuis `setMaintenance`. [Session, configuration, reprise et limites AUTO.3](13-PRODUCTION-AUTOMATION.md). `prod:open` non implémenté.

Tests : `npm.cmd run maintenance:test` et `npm.cmd run maintenance:test:isolated`. La seconde commande crée un PostgreSQL jetable `network=none`, sans port/volume personnel, et route exclusivement les sockets de ses processus de test vers un proxy loopback. Tout autre endpoint est refusé avant DNS ; aucun mode de routage de test n'existe dans la CLI livrée. Elle exerce aussi les probes PROD.3 Local sur cette base isolée ; elle ne modifie pas `my-local`.

## PROD.4 — Outillage de sauvegarde

**Livré en `0.8.27`, validé sur PostgreSQL synthétique isolé seulement.** [Procédure détaillée, matrice exhaustive, Windows, manifeste et limites](12-SUPABASE-BACKUP.md), [rapport](reports/2026-10-13-PROD4-BACKUP.md). Archive native de toute la base, inventaire/roles/migrations sous snapshot partagé, comparaison des séquences non transactionnelles et chiffrement immédiat hors Git. `plan` ne connecte aucun service ; `capture` exige sélection Cloud explicite, cible examinée, preuves de fermeture et deux autorisations distinctes ; `verify` relit hors connexion, avec authentification GCM, SHA-256 et lecture intégrale de l'archive.

PROD.3 conserve `backup_authorized=false`. Aucun script de sauvegarde ne modifie maintenance ou gel, ni ne contourne les permissions. Storage/Vault utilisés, droits incomplets, snapshot perdu, séquences instables ou références externes inconnues nécessitent arrêt et cadrage complémentaire. Évidence opérateur et configurations externes restent des déclarations à contrôler manuellement ; aucune preuve Production déduite de Local. **Aucune sauvegarde Cloud réalisée.** `restore_proven=false` et `publication_authorized=false` conservés dans les succès de capture/verify PROD.4. Première sauvegarde Cloud dans une intervention manuelle autorisée ; résultat de récupération spécifique exigé avant publication.

**Transport de capture PROD.7B.1 livré en `0.8.30` :** cible Windows `my-backup-target-v2`, `transport=windows-native`, chemin bin absolu, trois EXEs et toutes DLL épinglés, versions réelles identiques, TLS `verify-full`/CA/hostname et SCRAM, environnement minimal sans PG hérité. Même snapshot, chiffrement immédiat, inventaires et sept fichiers ; manifeste v2 distingue ce choix, anciennes archives Docker v1 toujours lues selon leur contrat. **Capture synthétique Windows 17.11 contre PG17.6, `verify` complet et preflight PROD.5 réellement exécutés**, pas une simulation d'arguments. T2 réseau Docker contourné par transport Windows explicite, sans modifier Docker. [Configuration, PowerShell et limites Windows](12-SUPABASE-BACKUP.md#transport-natif-windows--sélection-et-sécurité), [preuves](reports/2026-10-14-PROD7B1-NATIVE-BACKUP-TRANSPORT.md).

Avant C Cloud : confirmer version serveur réelle, compatibilité des clients, provenance/ACL/pins du poste, CA/hostname/SCRAM, identité, droits complets d'export et snapshot ; établir PROD.2 et fermeture committée/drainée. Aucune preuve Cloud déduite de l'isolation ; **aucune capture Cloud en PROD.7B.1**. Restauration conserve destinations isolées et exigence de versions compatibles, sans adaptation automatique ni mécanisme Production. PROD.7B.2 documente la décision frontend encore nécessaire, sans bypass livré ; PROD.7C non commencée.

## PROD.5 — Restauration isolée

**Livrée en `0.8.28`, récupération SQL et parcours Auth/TOTP synthétiques éprouvés.** [Architecture, ordre, commandes Windows et préconditions Cloud](12-SUPABASE-BACKUP.md#prod5--architecture-et-frontières-de-restauration), [rapport](reports/2026-10-13-PROD5-RESTORE.md). CLI séparé limité aux destinations Docker neuves, jetables et identifiées explicitement ; aucun port publié, volume personnel, reset, restore Cloud ou adaptation automatique de rôles inconnus. Preflight authentifie avant écriture ; consentement lié à SHA du manifeste et cible réelle ; échec/interruption impose destination neuve et nouvel examen, jamais retry aveugle.

Capture native complète, owners/grants conservés ; extensions et privilèges d'initialisation plateforme réappliqués depuis inventaire authentifié, puis contenus/IDs/séquences et sécurité comparés à la borne. Gel sauvegardé maintenu par le CLI. Ouvertures et mutations seulement dans les parcours de test explicitement isolés. Rapport distingue `postgresql_restored`, `data_verified` et `application_recovery_proven` ; **`production_recovery_proven=false`, `publication_authorized=false` toujours**. SQL métier, password/TOTP chiffré/AAL2/refresh réels de GoTrue synthétique ne certifient ni Edge/SMTP/frontend ni Supabase managé.

Avant récupération opérationnelle : vraie sauvegarde Cloud éprouvée isolément, secrets accessibles indépendamment après sinistre, versions/rôles/extensions/managed schemas adaptés et autorisés, URLs/SMTP/Edge/Data API/intégrations reconfigurés, compatibilité applicative et parcours complets validés. Installation Cloud PROD.2 désormais confirmée par le propriétaire en PROD.7B.2.3 ; fermeture coordonnée et preuves complètes requises avant capture, aucun mécanisme de bootstrap Cloud ajouté.

## PROD.6 — Publisher sécurisé des notifications

**Livré en `0.8.29`, validé Supabase Local et TLS/PostgreSQL synthétiques isolés.** [Procédure Windows, cible/CA/identité/ACL/consentements/reprise](10-NOTIFICATION-PUBLICATION.md#publication-cloud--cible-et-contrôles), [rapport et tests](reports/2026-10-14-PROD6-NOTIFICATION-PUBLISHER.md). Local conserve ses commandes. Cloud exige fichier de cible fermé, projet et autorisation de connexion ; contrôle réel du cluster et des deux identités publisher ; deux seuls EXECUTE métier, sans tables/colonnes/états/gel/RPC/permissions supplémentaires. CA SHA-256, chaîne, hostname et socket négocié vérifiés ; jamais `postgres`, API role ou `service_role` de remplacement.

Changelog [préparé `0.8.29`](../scripts/notifications/releases/0.8.29.json), validable hors connexion, aucune diffusion. `--check` présente métadonnées/hash avec preuves Vercel/maintenance/gel explicitement absentes. Publication autorisée séparément, hash/version exacts ; retrait distinct. Même clé/fichier/hash après réponse incertaine ; receipt historique ne certifie pas visibilité actuelle. Relecture éligible par RPC pures, sans marquer lu/traité, puis ordre E de réouverture.

**Aucune connexion, secret réel, configuration, migration, publication/retrait ou preuve de visibilité Cloud en PROD.6.** Mise en service future : réseau/CA/system_id/droits/login et Supavisor éventuel réellement vérifiés, gel installé et essais Preview/Cloud confirmés en PROD.7B.2.3, refus ordinaires/drainage Cloud et déploiement/maintenance Production servis encore à contrôler, backup achevé, publication métier explicitement autorisée puis présence/non-duplication démontrées. Aucun bypass frontend livré, aucune modification PROD.1/2/3.

## Échecs, reprise et retour arrière

| Situation | Principe de reprise |
|---|---|
| Maintenance ou gel non effectif | Arrêter avant backup/publication ; établir les deux protections et fin des opérations en cours |
| Backup invalide ou récupération non éprouvée | Ne pas merger ; corriger et valider sauvegarde/procédure avant publication |
| Supabase échoue ou réponse incertaine | Garder fermeture/gel, ne pas promouvoir ; inspecter historique et effets réellement engagés. Plusieurs migrations ne forment pas une transaction globale : un préfixe peut avoir réussi |
| Build Vercel échoue après migration réussie | Garder fermeture/gel ; corriger le build ou choisir un ancien frontend compatible avec le schéma présent |
| Promotion échoue ou résultat incertain | Relire le déploiement réellement assigné ; garder maintenance, ne pas déduire la version servie d’un simple statut de build |
| Notification échoue ou réponse incertaine | Garder fermeture ; reprendre même fichier/clé/hash puis vérifier publication active et absence de doublon |
| Retour arrière nécessaire | Choisir explicitement rollback frontend compatible, correction vers l’avant ou restauration SQL selon effets réels et perte de données ; aucun rollback DB automatique |

Un **rollback Vercel ne restaure pas Supabase** : ni schéma, données, historique, Auth, Edge ou notifications. Il réutilise aussi les variables de l’ancien build. Contrôler éligibilité Hobby, compatibilité avec la base actuelle et conservation de la maintenance ; après rollback, revérifier que les futurs builds attendent toujours une promotion manuelle.

Privilégier migrations rétrocompatibles et corrections versionnées vers l’avant. Ne pas modifier les migrations historiques, réappliquer aveuglément celles déjà enregistrées ou réactiver un ancien writer sur un parent contrat 2. Conserver masques, journal, reçus, versions et garanties Phase 8.

Une **restauration SQL est une opération distincte, potentiellement longue**, avec fermeture maintenue et décision explicite du propriétaire. Elle peut perdre les données apparues après la borne du backup, y compris reçus et notifications ; inventorier ces effets, l’historique et la compatibilité avant reprise. Ne jamais présenter restauration comme automatique ou éprouvée sans essai réel. Le retour au projet Cloud existant reste la cible ; les choix techniques de restauration seront validés dans le bloc dédié.

Les opérations métier interrompues gardent leur UUID, payload/token exact et lecture de reçu, puis relectures autoritatives avant succès UI. Absence de reçu, erreur réseau ou gel ne prouve pas annulation ; aucune nouvelle opération pour contourner une incertitude. Après restauration, perte possible de reçus exige analyse de la borne et des opérations concernées avant toute reprise. La limite de récupération dans le même onglet reste celle de Phase 8 ; aucune reprise inter-onglets automatique ajoutée.

## Références et portée technique

Documentation fournisseur consultée pour ce cadrage ; elle décrit les capacités, pas leur configuration ou validation dans MY. Les détails seront revérifiés pendant les blocs d’implémentation :

- [Supabase : backups et limites selon l’offre](https://supabase.com/docs/guides/platform/backups)
- [Supabase : sauvegarde/restauration, historique et schémas gérés](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase : déploiement Production par intégration GitHub](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase : intégration GitHub et configuration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- [Vercel : build Production en attente et promotion](https://vercel.com/docs/deployments/promoting-a-deployment)
- [Vercel : Instant Rollback et déploiements éligibles](https://vercel.com/docs/instant-rollback)
- [Vercel : Routing Middleware](https://vercel.com/docs/routing-middleware), [API](https://vercel.com/docs/routing-middleware/api) et [configuration proxy](https://vercel.com/docs/project-configuration/vercel-json#proxy)
- [Vercel : Global Config](https://vercel.com/docs/global-config), [quotas/propagation](https://vercel.com/docs/global-config/global-config-limits), [dashboard](https://vercel.com/docs/global-config/global-config-dashboard), [SDK](https://vercel.com/docs/global-config/global-config-sdk)
- [Vercel : Hobby](https://vercel.com/docs/plans/hobby) et [variables système](https://vercel.com/docs/environment-variables/system-environment-variables)
- [SDK officiel : options de lecture cohérente](https://github.com/vercel/storage/blob/main/_autodocs/configuration.md) ; signatures et options vérifiées aussi dans le package verrouillé `@vercel/global-config@1.5.1`

Les [rapports Phase 8](reports/2026-10-12-PHASE8I2-CLOSURE.md) restent inchangés. Leurs états antérieurs de Vercel, GitHub, version et Auth ne décrivent pas les confirmations actuelles consignées ici. L’adaptation Cloud de la synchronisation TCGdex reste un chantier distinct ; elle n’est ni livrée ni ajoutée aux blocs de ce workflow.

## Blocs futurs de réalisation

Découpage **prévisionnel**, à affiner en petites sous-phases avant chaque implémentation :

1. **Maintenance Vercel et protection Supabase** : PROD.1/PROD.2 implémentées, PROD.3 coordination et outillage validés Local ; maintenance Preview et validations Preview/Cloud PROD.7B.2.3 confirmées par le propriétaire. Installation Cloud acquise dans cette portée ; refus ordinaires, drainage, contrôle protégé du frontend Production et répétition complète restent requis. Aucune fermeture globale déduite des seuls essais Preview.
2. **Sauvegarde/restauration manuelle** : **PROD.4 outillage livré et testé isolément**, snapshot PostgreSQL partagé, inventaire explicite, stockage chiffré hors Git et intégrité ; [matrice, procédures et limites](12-SUPABASE-BACKUP.md). Première sauvegarde Cloud manuelle encore requise dans une intervention autorisée. **PROD.5 restauration synthétique isolée éprouvée** avec données/Auth/historique/permissions et compatibilité SQL. Essai adapté de vraie sauvegarde Cloud et validation applicative/externe complète toujours nécessaires.
3. **Publication des notifications Cloud** : PROD.6 livré avec preuves Local/isolées ; connexion/TLS/permissions et check réel Cloud confirmés par le propriétaire dans PROD.7A. Publication/visibilité réelle pendant fermeture hébergée restent à vérifier lors d’une intervention autorisée.
4. **Réglages de déploiement** : Supabase automatique depuis `main` sans branche Preview et Vercel Production sans assignation automatique déclarés configurés en PROD.7A ; relire réglages et préserver configuration Cloud avant utilisation, puis prouver promotion manuelle sans rebuild du commit attendu.
5. **Validation complète du workflow** : préparation, fermeture effective, backup, PR/merge, migrations/build/promotion, notification, réouverture et reprises après échec, avant les premiers tests d’utilisateurs réels.

PROD.1 à PROD.3 livrées avec preuves Local ; capture/restauration PROD.4/5 synthétiques isolées et publisher PROD.6 sécurisé. La [clôture PROD.7B.2.3](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md) acquiert sur confirmation propriétaire les validations Preview/Cloud décrites plus haut. Aucun backup Cloud, restauration de vraie archive ou publication Production coordonnée démontré ; **PROD.7C reste à effectuer**. Ses contrôles nécessaires figurent dans le [rapport](reports/2026-10-15-PROD7B23-PREVIEW-CLOUD.md#contrôles-nécessaires-pour-prod7c). Phases 9/10 inchangées ; [roadmap](08-ROADMAP.md).
