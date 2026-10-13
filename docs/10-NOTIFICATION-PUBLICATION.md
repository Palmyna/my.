# Publication des notifications depuis le terminal

Backend livré et validé sur **Supabase Local** en 8G.3, version `0.8.16`. Aucun droit de publication dans le navigateur. Centre et raccordement aux parcours livrés et validés Local en [8H.3](reports/2026-10-12-PHASE8H3-CLOSURE.md). Rôle et fonctions présents Cloud selon le checkpoint fourni ; adaptation Cloud du script toujours non implémentée. [Clôture Phase 8](reports/2026-10-12-PHASE8I2-CLOSURE.md). [Clôture 8G](reports/2026-10-11-PHASE8G3-CLOSURE.md).

## Changelog des publications Production

La [procédure Production](11-PUBLICATION-PRODUCTION.md) est la référence unique de l’ordre des opérations. Codex prépare le changelog public et le fichier de notification lors de chaque clôture publiable, avec la version correspondant à la livraison réelle. Une **publication de catégorie `changelog`** porte notification et contenu public dans le centre MY. ; aucune seconde annonce parallèle ni nouvelle page publique nécessaire.

Préparer/valider localement sans diffusion réelle ni publication Cloud. Après maintenance et gel effectifs, backup, merge, réussite Supabase et promotion manuelle du build Vercel Production, vérifier la version effectivement déployée puis publier une seule fois **avant réouverture**. Relire le centre avec identité éligible, contrôler présence/contenu/version et absence de doublon ; lever ensuite gel Supabase puis maintenance Vercel. Échec ou réponse incertaine : fermeture conservée, même fichier/clé/hash pour reprise, jamais nouvelle clé pour contourner l’incertitude.

Audience existante seulement : date d’inscription Auth ≤ publication ; exception `include_new_users=true` justifiée pour les nouveaux inscrits tant que l’annonce est active. Durée définie par `expires_at` valide ou `null`, retrait définitif et traitement individuel selon les contrats Phase 8 ; lire ne traite pas. Aucun ciblage arbitraire, délai fixe, polling ou notification externe ajouté.

**Ce parcours Cloud n’est pas encore opérationnel.** Le script ci-dessous reste Local uniquement ; son adaptation sécurisée est un [bloc futur](11-PUBLICATION-PRODUCTION.md#blocs-futurs-de-réalisation), avec rôle dédié/authentification/TLS/permissions. **PROD.2 démontre Local la publication, le rejeu et le retrait pendant le gel**, sans rouvrir les écritures ordinaires ni ajouter de droits au publisher. L'exception utilise la connexion PostgreSQL réelle `session_user=my_notification_publisher` et seulement INSERT/UPDATE de `private.notification_announcements` via les deux fonctions existantes ; les utilisateurs ne peuvent ni marquer lu ni traiter pendant le gel. Les confirmations de présence du rôle Cloud ne prouvent pas une connexion publisher réelle ni l'installation du gel. [Matrice et preuves](reports/2026-10-13-PROD2-WRITE-FREEZE.md).

## Préparer et valider un fichier

Copier [l’exemple d’annonce](../scripts/notifications/examples/announcement.json) ou [l’exemple de changelog](../scripts/notifications/examples/changelog.json) dans un fichier local. Les exemples sont documentaires ; aucune publication réelle ne découle de leur présence dans Git.

Tous les champs sont obligatoires, avec `null` explicite pour les options. Aucun champ supplémentaire accepté, y compris dans les objets imbriqués.

| Champ | Contrat |
|---|---|
| `publication_key` | ASCII `[a-z0-9][a-z0-9._:-]{0,119}` ; identité définitive, jamais réutilisée pour corriger un contenu |
| `category` | `announcement` ou `changelog` |
| `title`, `body` | Texte brut utile, respectivement 1–200 et 1–20 000 caractères Unicode ; titre sur une seule ligne |
| `app_version` | SemVer stricte, maximum 64 caractères ; obligatoire pour changelog, sinon SemVer ou `null` |
| `action` | `null` ou exactement `{"kind":"notification_content"}` : consultation du contenu de cette publication. Aucun UUID, chemin, URL ou code fourni par l’opérateur |
| `requires_action` | **`false` seulement**. Aucune condition de résolution d’annonce n’est cadrée et réalisable dans le métier actuel ; `true` refusé par script et PostgreSQL |
| `include_new_users` | Booléen ; `true` étend l’audience tant que la publication reste active |
| `expires_at` | Date ISO avec fuseau, année 0001–9999 et maximum six décimales, ou `null` ; nouvelle publication exige une date strictement future au moment de son insertion serveur |
| `publication_context` | Exactement `reason` (texte utile 1–1000) et `include_new_users_justification` (`null` si exception désactivée, texte utile 1–1000 obligatoire sinon) |

Normalisation commune Node/PostgreSQL : CRLF/CR vers LF, Unicode NFC, trim du jeu d’espaces ECMAScript, expiration UTC à six décimales. Longueurs comptées en caractères Unicode, pas en unités UTF-16. Angle brackets, syntaxes de liens (`scheme://`, `www.`, protocoles HTTP/javascript/data/file/mailto, `//`), contrôles et directionnels invisibles interdits. Cette frontière n’est pas un assainisseur HTML : le corps reste du **texte**, à afficher comme texte en 8H. Les lecteurs 8G.2 construisent eux-mêmes `{kind:'notification_content',announcement_id}` ; ils ne recopient aucune action de stockage. Aucun lien complémentaire vers une autre route n’est livré.

```powershell
node scripts/notifications/publish.ts --file annonce.json --validate
```

Validation hors connexion : aucune URL PostgreSQL nécessaire, aucune base modifiée. Synthèse : clé, catégorie/version, longueurs, action, audience, expiration normalisée et SHA-256. Ni corps ni contexte privé affichés. Fichier local limité à 1 Mo. Une expiration passée peut encore valider structurellement : seul le serveur connaît l’existence d’une publication historique et son horloge au moment d’une écriture.

Empreinte v1 = SHA-256 UTF-8 du tableau JSON compact ordonné : `['my.notification.publication.v1',publication_key,category,title,body,app_version,action.kind ou null,requires_action,include_new_users,expires_at,reason,include_new_users_justification]`. Pas de date générée, UUID ou acteur dans cette empreinte. Elle inclut le contexte métier normalisé.

## Provisionner les identifiants hors Git

La migration crée `my_notification_publisher` LOGIN, **sans mot de passe**, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, limite de quatre connexions et aucune appartenance à un rôle. Avant provisionnement, l’authentification par mot de passe est inutilisable. Droits ajoutés : CONNECT à la base de la migration, USAGE sur `private`, EXECUTE sur les deux fonctions de publication/retrait uniquement. Aucun SELECT/DML/TRUNCATE sur les tables métier/Auth, aucune RPC utilisateur exécutable, aucun accès au helper de préparation. Le USAGE de `public` et les fonctions système ordinaires accessibles via PUBLIC ne donnent aucun droit métier ; ils ne sont pas retirés globalement aux autres rôles.

L’opérateur provisionne un secret long et unique dans son gestionnaire de secrets. Depuis un terminal de confiance équipé de `psql`, ouvrir une connexion administrative **Local**, avec saisie interactive du mot de passe :

```powershell
psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -W
```

Dans `psql` :

```text
SET password_encryption = 'scram-sha-256';
\password my_notification_publisher
\q
```

`\password` demande le nouveau secret et transmet son vérificateur chiffré, sans placer le mot de passe en clair dans une commande SQL, l’historique ou les logs serveur. Ne pas utiliser une commande `ALTER ROLE ... PASSWORD 'secret'`, une URL en argument de processus, un transcript PowerShell ou une variable `VITE_*`. Vérifier l’authentification SCRAM et les restrictions réseau de la base ; garder les seuls opérateurs de confiance sur cet hôte. Identité tracée = **`session_user` PostgreSQL réel**, ici `my_notification_publisher`, sans identité humaine auto-déclarée ou JWT. Un identifiant partagé ne distingue pas plusieurs personnes ; conserver cette responsabilité dans l’organisation opérateur.

Dans PowerShell, saisir le secret puis fournir la connexion uniquement à l’environnement du processus courant :

```powershell
$notificationCredential = Get-Credential -UserName my_notification_publisher -Message 'Publication Supabase Local'
$notificationPassword = [Uri]::EscapeDataString($notificationCredential.GetNetworkCredential().Password)
$env:MY_NOTIFICATION_DATABASE_URL = "postgresql://my_notification_publisher:${notificationPassword}@127.0.0.1:55322/postgres"
Remove-Variable notificationPassword, notificationCredential
```

Ne jamais afficher la variable ni la sauvegarder dans Git. Elle contient encore un secret dans la mémoire du processus ; fermer ce terminal après usage. La validation n’importe aucune connexion depuis le frontend ni depuis le statut Supabase. La commande d’écriture exige cette variable et vérifie `session_user=current_user=my_notification_publisher`, attributs non privilégiés et absence d’appartenance à un rôle.

## Publier, reprendre et retirer

```powershell
node scripts/notifications/publish.ts --file annonce.json --apply --environment local
node scripts/notifications/publish.ts --withdraw cle-publication --environment local
Remove-Item Env:\MY_NOTIFICATION_DATABASE_URL
```

En écriture, environnement explicite obligatoire. Modes mutuellement exclusifs, arguments inconnus/répétés refusés. Local uniquement : boucle locale, port `55322`, base `postgres`, aucun paramètre de connexion URL. Aucun appel Cloud possible avec cette version du script. Requêtes paramétrées aux seules `private.publish_notification_announcement(jsonb)` et `private.withdraw_notification_announcement(text)`, après vérification d’identité par `pg_catalog`. Timeout connexion 10 secondes, statement 15 secondes ; aucune relance automatique.

Publication réussie retourne `outcome='published'`, clé, UUID, date serveur et empreinte. **Un retry identique retourne exactement le même résultat**, sans nouvel UUID/date, y compris après expiration ou retrait. Le résultat est historique ; il ne promet pas que la publication demeure active. Même clé avec contenu/contextes différents : `publication_key_conflict`, sans écrasement. En cas de rupture de connexion ou réponse incertaine, conserver fichier/clé exacts et reprendre la même commande. Ne jamais contourner une incertitude avec une nouvelle clé.

Retrait réussi retourne `outcome='withdrawn'`, clé, UUID et date serveur. Retry conserve la première date. Clé inconnue : `notification_publication_not_found`. Retrait définitif : pas de réactivation, contenu/provenance et états individuels conservés ; nouvelle lecture du centre/compteur/contenu exclut immédiatement l’annonce. Une transaction de lecture déjà ouverte conserve son snapshot ; le writer de suivi revalide après toute attente et renvoie `obsolete` si le retrait a gagné.

Correction : retirer l’ancienne publication puis préparer une nouvelle clé. Aucune mutation de texte historique. L’expiration d’une nouvelle insertion déjà atteinte produit `notification_expiration_invalid`. `requires_action=true` produit `notification_action_unsupported` ; aucune action générique, bouton de validation libre ou endpoint de forçage. `process_announcement_notification` conserve les règles sûres de 8G.2.

Erreurs/outputs assainis, aucun objet d’erreur driver, SQL brut, secret, URL de connexion ou donnée Auth journalisé. Codes de sortie : 0 succès, 1 échec. UUID/date/hash identiques sur reprise permettent de reconnaître l’idempotence ; aucune valeur `replayed` variable ne modifie le résultat historique.

## Publication Cloud future

L’[audit 8I.1](reports/2026-10-12-PHASE8I1-AUDIT-CLOUD-READINESS.md#8-publication-cloud-future-des-notifications) conserve les prérequis. Le checkpoint fourni confirme désormais rôle `my_notification_publisher` et migrations Cloud : attributs non administratifs, absence d’héritage/appartenance supérieure et d’accès aux tables métier contrôlées, deux EXECUTE privés autorisés, préparateur interne et publication par `anon`/`authenticated` refusés. [Résultats et limites 8I.2](reports/2026-10-12-PHASE8I2-CLOSURE.md#checkpoint-supabase-cloud-fourni). Ces contrôles ne prouvent ni connexion publisher/TLS réelle ni provisionnement de secret. `NOINHERIT` ne soustrait pas aux privilèges PUBLIC ; revérifier les ACL effectives lors de la préparation dédiée. Ne pas recréer ce rôle ou réappliquer ses migrations pour adapter le script.

Publication future : environnement/projet explicitement sélectionnés, identifiants hors Git et frontend, rotation et révocation, identité PostgreSQL préservée, TLS vérifiant chaîne et nom d’hôte, puis validation du contrat et de l’audience. Même clé/contenu pour reprise incertaine ; correction par retrait puis nouvelle clé, aucun écrasement. Valider consultation/lecture/traitement/retrait sur fixtures isolées selon les limites de l’audit 8I.1 : une clé synthétique ne restreint pas l’audience et ne justifie pas une annonce de test visible aux utilisateurs réels. Le changelog produit est publié seulement après contrôle de la version effectivement déployée, vérifié actif puis conservé pour la réouverture. Aucun privilège `service_role` utilisé pour remplacer le rôle dédié.

**Adaptation décidée pour le workflow futur, non implémentée dans cette sous-phase documentaire.** Une future intervention explicitement autorisée devra adapter le script avec une cible Cloud explicite, vérifier à nouveau rôle/ACL et réseau, provisionner les secrets hors Git avec rotation, utiliser connexion directe ou mode de pool conservant l’identité PostgreSQL, puis exiger TLS avec validation du certificat et du nom d’hôte. CA de confiance si nécessaire ; jamais `rejectUnauthorized:false`, `sslmode=no-verify` ou désactivation TLS. Avec `pg`, paramètres `sslmode/sslcert/sslkey/sslrootcert` dans l’URL peuvent remplacer l’objet TLS : les refuser ou configurer explicitement une voie garantissant la validation. Aucun navigateur, `service_role`, frontend, Cloud ou Vercel utilisé par le parcours actuel.

Tests : `npm run db:test` et `npm test -- --maxWorkers=2`. Intégration réelle dédiée : `$env:MY_SUPABASE_LOCAL_TEST='1'; npm test -- --project notifications --maxWorkers=1`. Ce test est réservé à Local sans identifiants opérateur provisionnés : secret SCRAM éphémère du rôle dédié, trois connexions publisher et une connexion fixture, publications synthétiques générées par le test, nettoyage exact des identités de ce run puis mot de passe remis à NULL. Ne pas lancer ce provisionnement de test sur un rôle portant déjà des identifiants opérateur à conserver.
