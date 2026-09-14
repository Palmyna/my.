# Phase 4B.3 — Suppression sécurisée du compte

## Résultat et environnement

Le backend de suppression définitive est **livré et validé localement**. Le dépôt était propre sur `main`, commit `0d0c202` (`update supabase cli`). Versions vérifiées : CLI **2.117.0**, SDK/Auth JS **2.115.0**, serveur Auth **v2.196.0** (`/auth/v1/health`), Edge Runtime **1.74.3**, compatible Deno **2.1.4**. Développement sur `my-local`, API `127.0.0.1:55321`, PostgreSQL `55322`, Mailpit `55324`.

La page Profil, les formulaires, les confirmations visuelles et leur intégration au store Auth restent à réaliser. Le changement volontaire de mot de passe reste non livré : selon le propriétaire, la CLI 2.117.0 ne résout pas sa limitation ; sa validation ciblée cloud est réservée à la clôture de Phase 4, avant Phase 5. Ce problème n'a pas été réétudié. Les rapports historiques 4B.1/4B.2 et le recovery restent inchangés.

## Architecture retenue

La solution combine une Edge Function interactive dédiée et un trigger PostgreSQL privé. La clé privilégiée demeure dans l'environnement Edge. L'API officielle [`auth.admin.deleteUser`](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) réalise la suppression physique ; le [handler Auth v2.196.0](https://github.com/supabase/auth/blob/v2.196.0/internal/api/admin.go) l'entoure d'une transaction. Le trigger applicatif rejoint cette transaction, ce qui évite une RPC de nettoyage validée séparément avant un appel Auth susceptible d'échouer.

La migration [20260914102414_phase4b3_account_deletion.sql](../../supabase/migrations/20260914102414_phase4b3_account_deletion.sql) a été créée avec `supabase migration new phase4b3_account_deletion`, puis appliquée par `migration up --local`. Les sept migrations historiques et toutes les FK sont conservées. Le total local est huit migrations ; aucune migration ni fonction n'a été déployée dans le cloud.

Le trigger `auth_user_deleting_account`, `BEFORE DELETE ON auth.users`, appelle `private.delete_account_data_for_auth_user()` sans paramètre. Sa cible est exclusivement `OLD.id` :

1. verrouiller le profil avec `FOR UPDATE` ;
2. supprimer les partages reçus ;
3. supprimer toutes les collections possédées, avec cascades vers éléments et partages sortants ;
4. supprimer les exemplaires physiques du compte, avec conditions, notes et grading ;
5. supprimer le profil, avec cascade vers ses préférences ;
6. laisser Auth terminer la suppression de l'identité et de ses dépendances internes.

La fonction utilise `SECURITY DEFINER`, `search_path = ''`, des noms qualifiés et les index FK existants. `EXECUTE` est révoqué à PUBLIC, anon, authenticated, service_role et supabase_auth_admin. PostgreSQL appelle le trigger dans le DELETE administratif ; aucune RPC de destruction n'est exposée au navigateur. Les administrateurs Auth existants restent des opérateurs de confiance : leur suppression physique déclenche elle aussi le nettoyage complet.

## Contrat serveur et fraîcheur

L'[Edge Function](../../supabase/functions/delete-account/index.ts) reçoit un unique appel final :

```text
POST /functions/v1/delete-account
Authorization: Bearer <JWT utilisateur courant>
Content-Type: application/json

currentPassword: chaîne non vide
totpCode: chaîne de six chiffres
confirmConsequences: true
confirmDeletion: true
```

Les champs supplémentaires sont refusés : aucun `user_id`, email cible, facteur, challenge ou token de ré-authentification n'est accepté dans le corps. Sa taille est limitée à 8 Kio. Les réponses ont `Cache-Control: no-store`. Le succès final est HTTP 200 `{ "deleted": true }` ; les refus renvoient uniquement un code contrôlé, sans détails SQL/Auth ni secrets.

Le [handler](../../supabase/functions/delete-account/handler.ts) applique successivement :

- `getUser(token)` et `getClaims(token)` pour vérifier l'identité courante et le JWT, email confirmé, `aal2`, un facteur TOTP vérifié unique et profil accessible sous RLS ;
- confirmation des conséquences et présence des deux saisies ;
- `signInWithPassword` sur un client Auth anonyme distinct par requête, avec l'email venant d'Auth et le mot de passe reçu : même UUID, nouvelle session `aal1`, nouveau `session_id` ;
- `mfa.challenge` créé côté serveur sur le même facteur, puis `mfa.verify` du code reçu : même UUID et même nouvelle session, devenue `aal2` ;
- contrôle de `confirmDeletion === true` après ces deux vérifications ;
- révocation globale via `auth.admin.signOut(tokenVérifié, 'global')`, puis `auth.admin.deleteUser(uuidVérifié, false)`.

Chaque appel refait ces opérations réelles. Il n'existe ni table de preuve, durée arbitraire, claim MY., autorisation frontend ni preuve intermédiaire réutilisable. Le futur frontend recueillera les saisies et les intentions successives avant l'appel final ; le backend ne prétend pas vérifier que la personne a lu un texte de modale. Aucun texte UX définitif n'est choisi.

Les clients sont isolés par requête ; le client privilégié ne sert jamais à une connexion utilisateur. Les sessions techniques restent en mémoire et ne sont pas renvoyées au navigateur. Un refus termine uniquement la session de ré-authentification serveur si elle existe. Aucune donnée sensible n'est écrite par le handler en SQL, dans un stockage durable ou dans des logs.

`verify_jwt = false` configure la passerelle pour laisser la vérification au handler, selon les [mécanismes Edge/Auth officiels](https://supabase.com/docs/guides/functions/auth). Cela permet les signatures asymétriques tout en exigeant `getClaims` et `getUser` : un simple décodage JWT n'autorise rien. Les requêtes POST sans authentification restent refusées. Le CORS n'accorde aucun droit d'accès et n'utilise pas de cookie.

## Atomicité, erreurs et retrait d'accès

La destruction des données MY. et d'Auth est transactionnelle. Une FK de test bloquant la suppression du profil **après** les DELETE des dépendances a provoqué un échec du véritable Auth Admin : toutes les données, y compris collections, éléments, partages et exemplaires, étaient restaurées. L'échec est renvoyé comme `deletion_failed`, jamais comme succès.

La révocation préalable des sessions reste distincte de cette transaction : si la destruction échoue, l'utilisateur existe toujours avec toutes ses données, mais doit se reconnecter pour réessayer. Le nouvel essai refait les deux facteurs. Le verrou du profil fait attendre les nouvelles références FK ; les conflits ou deadlocks éventuels échouent par rollback et nécessitent un nouvel essai. Aucun test de charge concurrente massif n'est revendiqué.

Un second DELETE SQL privilégié ne produit plus de mutation. Un nouvel appel Edge après suppression est refusé car l'utilisateur n'existe plus. Une réponse réseau perdue après commit peut laisser le client dans l'incertitude ; la future UX ne devra pas annoncer un succès sans résultat établi. Un objet Storage utilisateur pourrait également bloquer Auth Admin et préserver les données ; MY. ne stocke pas d'objet utilisateur de ce type actuellement.

Les [JWT déjà émis peuvent rester cryptographiquement valides](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users). La migration ajoute donc `require_my_profile`, restrictive pour lectures et écritures, aux 13 tables applicatives. Son prédicat `private.has_my_profile()` vérifie uniquement le profil de `auth.uid()`, sans argument. Il est stable, `SECURITY DEFINER`, avec `search_path` vide ; seul authenticated reçoit `EXECUTE`, sans `USAGE` général du schéma privé. Les policies MFA et métier préexistantes restent en place.

Après suppression, les nouvelles lectures avec l'ancien JWT sont vides dans les **13 tables**, catalogue compris, et les écritures échouent. Auth refuse aussi la restauration de l'utilisateur et le refresh. Le prédicat n'est pas une vérification générale de `auth.sessions` pour un compte encore existant. Une lecture déjà en cours peut terminer selon son snapshot ; les contrôles portent sur les nouvelles requêtes après commit.

## Tests exécutés

| Vérification | Résultat final |
|---|---|
| `npm test -- --project functions` | **21 tests réussis**, 1 fichier |
| `supabase test db --local supabase/tests/database/009_account_deletion.test.sql` | **72 assertions réussies** |
| pgTAP ciblés `002_rls`, `006_collection_preferences`, `007_auth_identity` | **252 assertions réussies**, 3 fichiers |
| `node scripts/test-account-deletion.js` | **49 vérifications réussies, 0 échec** |
| `npm run lint` | Réussi, zéro avertissement ; contrôle ciblé du script après correction du nettoyage également réussi |
| `npm run build` avec `npm run typecheck` | Réussi ; avertissement Vite préexistant du bundle d'environ 571 kB conservé |
| `deno check --config supabase/functions/delete-account/deno.json supabase/functions/delete-account/index.ts` | Réussi avec Deno 2.1.4 et certificats système ; dépendances verrouillées dans `deno.lock` |
| `db lint --local --schema public,private --level warning --fail-on warning` | Aucune erreur de schéma |
| `db advisors --local --type security --level warn --fail-on warn` | Aucun problème |
| Liens Markdown locaux et `git diff --check` | 149 liens locaux valides, aucune erreur de diff |

Le [script d'intégration](../../scripts/test-account-deletion.js) appelle le véritable endpoint Edge, Auth et PostgreSQL. Il couvre : session `aal2` seule ; absence/mauvais mot de passe ; TOTP absent/incorrect ; confirmations absentes ; tentative d'UUID/facteur/challenge fourni par le client ; mélange de session et mot de passe de deux identités ; session initiale `aal1` ; challenges Auth invalides, expirés, rejoués et facteur étranger ; erreur SQL tardive et retry ; destruction complète ; accès résiduel ; second utilisateur intact et deux sens du partage. Les challenges invalides/expirés/rejoués sont aussi testés directement contre Auth : ils ne sont jamais acceptés comme preuve dans le contrat Edge.

Les empreintes SHA-256 portent sur les lignes complètes, timestamps compris, des sept tables catalogue et des trois tables privées de pipeline. Elles sont identiques avant/après : **1 025 Pokémon, 18 séries, 188 sets, 19 907 cartes sources, 31 904 variantes, 16 820 rattachements, 1 213 états de cible**, ainsi que **8 journaux de synchronisation, 4 corrections et 4 entrées de correspondance**. Les données complètes du second utilisateur et ses autres destinataires sont également inchangés.

Pendant la mise au point, une fixture pgTAP temporaire ne pouvait pas référencer une table permanente ; elle a été remplacée par une table privée créée et annulée dans la transaction de test. Un refus Auth avec résultat nul a conduit à sécuriser la lecture nullable du handler. Le premier parcours réel a réussi ses 48 contrôles, puis un contrôle complémentaire a trouvé six entrées d'audit Auth de fixtures dans `traits`. Le nettoyage a été corrigé, ces six entrées retirées, et le parcours relancé avec son **49e contrôle d'audit**. Aucun échec résiduel n'est masqué.

## Nettoyage et fichiers

Comptages Auth initiaux/finals identiques : **1 utilisateur, 1 session, 1 facteur, 13 challenges, 1 identité**, et **1 profil** préexistant. Les comptes temporaires, leurs données, éventuels emails et traces d'audit ont été supprimés. Contrôle final indépendant : **0 utilisateur de fixture, 0 entrée d'audit de fixture, 0 table de garde de test**. Les empreintes des données applicatives préexistantes sont identiques. Les tests pgTAP annulent leurs fixtures ; aucun `db reset` n'a été utilisé.

Supabase local et le service Edge sont arrêtés à la fin, comme à l'arrivée, avec conservation des volumes (`backup: true`). Le nettoyage des entrées d'audit est propre aux fixtures du script : le backend produit utilise le cycle de vie Auth Admin et n'ajoute aucune politique de purge des journaux techniques Supabase.

Créés : migration SQL, test pgTAP `009`, script d'intégration, `supabase/functions/delete-account/{index.ts,handler.ts,handler.test.ts,deno.json,deno.lock}`, configuration TypeScript des fonctions et ce rapport.

Modifiés : README, références `01-FEATURES`, `03-DATA-MODEL`, `04-UX-UI`, `05-ARCHITECTURE`, `06-DATABASE`, `08-ROADMAP`, configuration locale Supabase, configurations ESLint/TypeScript/Vitest et `src/types/database.generated.ts`. Les types ont été régénérés **une seule fois**, sans retouche manuelle ; la CLI 2.117.0 ajoute seulement des parenthèses dans les utilitaires génériques, sans nouvelle forme de donnée publique. Le générateur a émis un avertissement Node `MaxListenersExceededWarning`, sans erreur ni résultat incomplet.

Vérifiés mais inchangés : `AGENTS.md`, migrations historiques, rapports 4B.1/4B.2, services/provider/store/callbacks Auth frontend, recovery, dépendances et lockfile npm, catalogue et son pipeline. La roadmap reste macro et indique Phase 4 en cours. Aucun code navigateur privilégié n'est ajouté ; aucune clé serveur ni JWT réel n'est versionné dans les fichiers livrés.

Restent hors livraison : Profil, UX finale et purge client après succès, changement volontaire de mot de passe et sa validation cloud de clôture, contact support et éventuelles exigences légales/rétentions à cadrer. Aucun travail de Phase 5, déploiement Vercel, modification cloud, commit ou push.
