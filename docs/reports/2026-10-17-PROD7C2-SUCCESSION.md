# PROD.7C.2 — Succession sécurisée après échec de capture

Date : **17 octobre 2026**. Branche réelle `dev`, HEAD initial **`5eb35e0e60acaf31cf2fb27122a437accf453b6b`**. Worktree initial contenant le correctif EPIPE PROD.7C.1 non committé ; correctif intégralement conservé. Package, lock et changelog courant **0.8.34 inchangés**. Aucun nouveau SHA de livraison n'existe encore ; aucun commit ni push effectué par cette intervention.

## État initial et portée

Le propriétaire fournit l'état Production suivant : session `8c6bb386-e40f-46be-a295-d4d2ea21503c`, source initiale ci-dessus, `stage=capturing`, `capture=failed_or_unknown`, `verify=not_started`, dump chiffré et `INCOMPLETE` sous `M:\MY-backups`, sans manifeste complet. Ces faits sont le contexte propriétaire, **pas une nouvelle inspection des fichiers opérateur ou des états Cloud**.

Cette intervention n'a chargé aucun secret réel, lu/déchiffré aucune archive Production, modifié aucun fichier opérateur réel, effectué aucune succession réelle, connexion Cloud, opération Vercel/Supabase, capture Production, publication, dégel ou réouverture. Les états distants ne sont pas réattestés. Tous les Git temporaires, UUID, archives, clés, ACL, consentements et déclarations des tests sont synthétiques.

## Mécanisme livré

Le registre AUTO.3 dans `scripts/production/session.js` reste l'unique registre. `prod:backup` compose `planSuccession` puis `commitSuccession` sous son verrou existant ; aucune nouvelle commande ni option `--force`. AUTO.4A/B/C et PROD.4/6 conservent leurs responsabilités.

La succession exige un autre commit réel, propre et sur `dev`, validé par `inspectSourceRelease` : package/lock/racine concordants, changelog committé valide et octets locaux identiques au fichier du commit. Elle ne change jamais `session.repository` d'une session existante. Les reprises incomplètes ordinaires conservent `incomplete_session_requires_original_source` ; une archive complète conserve son ancienne source et suit sa vérification indépendante, même après avancement de `dev`.

Le prédécesseur doit rester à `capturing`, avec tentatives identifiables et incomplètes, aucune vérification engagée, aucune trace d'ouverture/publication, même projet et même empreinte de configuration. Chaque dossier doit exister, être privé et sans reparse point ; chaque tentative doit conserver `INCOMPLETE`. **Tout manifeste, y compris accompagné d'`INCOMPLETE`, toute capture complète ou tentative vérifiée interdit la succession.** Un fichier/relevé orphelin ou état incohérent bloque. Une prétendue vérification complète d'une capture encore échouée est refusée avant connexion.

Avant écriture, l'opérateur voit ancien UUID/source/version/stage, projet/empreinte, nouvel UUID/source/version, motif fixe du correctif d'outillage et dossier de capture neuf. `AUTORISER SUCCESSION` couvre exclusivement cette transition et la revue/cessation des anciens processus/enfants. Un refus ne modifie aucun fichier de session, pointeur ou archive. Après saisie humaine, source/changelog, configuration, verrou et état conservé sont relus.

La transaction locale prépare dans cet ordre :

1. Journal permanent `succession-<nouvel-UUID>.json`, créé exclusivement, écrit puis synchronisé.
2. Nouveau dossier privé ; relevé immuable AUTO.3 `session_succession`, lié par hash à la nouvelle session.
3. `session.json` neuf, nouvel UUID/source, binding du changelog et SHA-256 du journal. Aucune ancienne attestation de fermeture, révision ou preuve d'archive n'est transférée comme preuve actuelle.
4. Pointeur temporaire synchronisé, contrôle des permissions et revalidation complète des préconditions, puis renommage vers `current.json` dans le même répertoire.

La preuve horodatée contient l'autorisation explicite, motif, ancien/nouvel UUID et source/version, projet/empreinte, état complet de l'ancienne session, références, empreintes et identités des dossiers, hashes de tous ses fichiers et de toutes ses tentatives chiffrées. Aucune clé ni donnée déchiffrée. Les références et octets sont contrôlés à chaque chargement ultérieur ; la preuve reste hors Git dans le registre protégé.

L'ancienne session n'est jamais sauvegardée par le chemin de succession, même lors d'un refus ou d'une erreur. Son UUID, commit/version, relevés, résultats d'échec, tentatives, dump et marqueur restent intacts. Elle n'est pas marquée `completed`. L'exception historique exige ce lien autorisé et la conservation exacte du prédécesseur ; les autres historiques gardent leurs contrôles de clôture, désormais aussi leurs relevés vérifiés au chargement.

## Interruptions et concurrence

Avant remplacement du pointeur, l'ancien reste récupérable. Un journal valide impose le même UUID/source à toute reprise. Après un nouvel accord et revalidation, seuls les éléments attendus **absents** peuvent être créés ; aucun fichier existant n'est réécrit. Un fichier partiellement écrit, tronqué, différent, un dossier inattendu, plusieurs transitions ou un autre commit bloque sans nettoyage automatique. Une création interrompue avant application des ACL exige examen et correction explicite des permissions de ce seul dossier ; l'outil ne les répare pas silencieusement.

Après remplacement du pointeur avec accusé perdu, la session courante doit démontrer journal/relevé/hashes cohérents. La commande retrouve le successeur, sans créer un deuxième UUID. Si le pointeur reste sur le prédécesseur, `prod:open` refuse la transition en préparation. Les temporaires et orphelins ne sont ni supprimés ni considérés comme sessions valides. Un journal ou relevé tronqué exige une décision de récupération séparée ; aucun succès ou engagement complet n'est inventé.

Le verrou AUTO.3 est contrôlé pendant l'opération et conservé après signal ; aucun TTL, récupération de PID ou suppression automatique. Les modifications observables de configuration, source/changelog, session, journal, archives ou verrou bloquent. Le magasin gardé AUTO.4 est réutilisé par AUTO.3 pour éviter qu'un relevé d'erreur n'écrase un état modifié par un autre outil. Les hashes complets sont vérifiés à l'entrée ; pendant l'opération, octets du registre et métadonnées des anciens fichiers restent épinglés, sans rehacher continuellement un gros dump. Une seconde validation empêche d'adopter une modification entre contrôle et établissement de cette empreinte.

## Nouvelle capture et compatibilité ouverture

La succession seule ne capture rien. Il faut encore les consentements habituels de connexion, fermeture et export sensible, des lectures réelles de maintenance/gel, la révision réelle, des attestations contemporaines et un drainage neuf. PROD.4 crée exclusivement une destination neuve et utilise le correctif EPIPE déjà livré localement ; `verify` reste un appel indépendant. Les preuves de l'ancienne session ne peuvent pas fournir les références du nouvel export.

`prod:open` prend uniquement l'archive vérifiée de la nouvelle session courante. La nouvelle source est imposée comme source de PR et second parent du merge classique `main`, avec arbre identique ; le SHA de merge est distinct du SHA sauvegardé. AUTO.4A compare aussi son changelog au binding `source_release` enregistré lors de la succession. Publication PROD.6, relectures, visibilité AAL2 contemporaine, consentements de dégel/réouverture et ordre Supabase puis Vercel restent inchangés. Une session initiale incomplète est refusée avant toute publication.

## Validation synthétique

Les régressions couvrent refus sans modification, captures complètes/candidates et anciennes tentatives, incohérences/références/hashes, nouveau dépôt sale/non committé/changé, changelog invalide ou modifié, configuration/verrou modifiés, interruptions aux écritures du journal/dossier/preuve/session et autour du renommage du pointeur, reprise du même UUID, preuve tronquée, source différente d'un journal en attente et intégrité ultérieure de l'historique.

Le banc AUTO.5 traverse le vrai registre, Git temporaire, capture/chiffrement/manifeste/verify PROD.4, relation PR/merge et ouverture AUTO.4A/B/C, avec fournisseurs et processus PostgreSQL simulés et réseau réel interdit. Il reproduit une capture échouée pendant la liste du dump, commet un correctif synthétique sans changer version/changelog, autorise la succession, exige à nouveau les consentements, vérifie une nouvelle archive, refuse une source de PR ancienne, ouvre avec la nouvelle source, puis effectue une publication suivante. Les octets de la première session et de son archive restent identiques. Les tests dédiés PROD.7C.1 contrôlent séparément le véritable contrat du consommateur EPIPE ; le banc AUTO.5 ne prétend pas reproduire un processus PostgreSQL réel.

Résultats finaux de la campagne isolée :

| Vérification | Résultat |
|---|---|
| `npm.cmd run prod:backup:test` | 80/80, aucun skip |
| `npm.cmd run prod:test:isolated` | 19/19, aucun skip |
| `npm.cmd run prod:prepare:test` | 37/37, aucun skip |
| `npm.cmd run prod:publication:test` | 43/43, aucun skip |
| `npm.cmd run prod:open:test` | 42/42, aucun skip |
| `npm.cmd run backup:test` | 32/32, aucun skip, correctif EPIPE conservé |
| Vérification ciblée des protections changées et de la source après succession | 2/2, aucun skip |
| `npm.cmd run typecheck`, `npm.cmd run lint` | Réussis, zéro avertissement ESLint |
| Versions, liens/ancres et syntaxe PowerShell | 0.8.34 package/lock/racine, 114 liens/ancres sur cinq documents, six scripts parsés |
| `git diff --check` et conservation du correctif initial | Réussis ; diff EPIPE préexistant identique par SHA-256 |

## Limites résiduelles

Ces preuves ne certifient aucune archive Production, restauration Cloud ou récupération Production. `restore_proven=false` et `production_recovery_proven=false` restent inchangés. Les hashages sont des contrôles de corruption, pas une signature contre un administrateur hostile. La coordination locale ne constitue pas une transaction distribuée Git/Vercel/Supabase ; les writers externes restent à exclure. `sync` et renommage dépendent du système de fichiers/stockage ; les interruptions de processus sont testées, pas une panne électrique ou matérielle.

Conserver aussi les fichiers de la première tentative à leurs chemins : une absence ou modification future bloque les chargements de cette chaîne. Un dossier ou fichier contradictoire impose un examen hors ligne et une décision de récupération séparée, sans édition improvisée des identités ou preuves. Aucun assouplissement pour contourner une archive complète. Aucun nouvel essai natif/Docker lourd n'est nécessaire pour ce changement de registre ; leurs preuves PROD.7C.1 restent historiques, et les régressions EPIPE ciblées sont rejouées ici.

## Future première reprise manuelle — propriétaire uniquement

1. Examiner et valider les correctifs EPIPE **et** succession. Le propriétaire décide du commit/push sur `dev`. Conserver package/lock/changelog `0.8.34`, puis relever le **vrai nouveau SHA** ; `git status --short` doit être vide. Aucun SHA futur ne figure dans ce rapport.
2. Avant la commande, examiner indépendamment les anciens processus/enfants et les verrous AUTO.3/AUTO.2 exacts. Ne retirer manuellement un verrou identifié qu'après arrêt/coordination démontrés, selon la procédure existante. Ne modifier ni session initiale, ni pointeur, ni archive, ni `INCOMPLETE`. Conserver la même configuration approuvée et monter le même volume chiffré.
3. Dans ce checkout propre, lancer personnellement **`npm.cmd run prod:backup`**. Fournir les secrets masqués habituels depuis le coffre. Avant tout accès distant, vérifier le résumé : prédécesseur **`8c6bb386-e40f-46be-a295-d4d2ea21503c`**, ancien commit **`5eb35e0e60acaf31cf2fb27122a437accf453b6b`**, nouvelle source égale au SHA réellement validé et nouvel UUID. Tout écart : refuser et examiner.
4. Après revue effective des processus et du résumé, saisir **`AUTORISER SUCCESSION`**. Puis autoriser séparément **`AUTORISER CONNEXIONS`**, **`FERMER MY`**, effectuer les contrôles contemporains réels et **`FERMETURE ATTESTEE`**, puis **`AUTORISER EXPORT SENSIBLE`**. La commande relit les états réellement présents et peut refuser une précondition devenue invalide ; aucune ancienne attestation ne suffit.
5. Attendre **« Sauvegarde vérifiée »**, relever nouvel UUID, nouvelle destination et source/version. Conserver intégralement la première tentative. Une interruption se traite par la [procédure de succession](../13-PRODUCTION-AUTOMATION.md#succession-après-correctif-doutillage-prod7c2), sans nouvelle capture implicite ni changement de commit.
6. Créer ensuite la PR **pour ce nouveau commit sauvegardé exact**, merge classique `dev` → `main`, déploiements/promotion et essai PROD.5/preuves requis. Aucun nouveau commit ajouté à `dev` entre sauvegarde et PR de cette livraison. `npm.cmd run prod:open` viendra seulement après ces prérequis, sous ses autorisations séparées ; cette intervention ne l'autorise ni ne l'exécute.

## Références

- [Procédure AUTO existante](../13-PRODUCTION-AUTOMATION.md)
- [Publication Production](../11-PUBLICATION-PRODUCTION.md)
- [Correctif et preuves EPIPE PROD.7C.1](2026-10-17-PROD7C1-EPIPE.md)
- [Contrats cryptographiques PROD.4/5](../12-SUPABASE-BACKUP.md)
- Documentation Node 24 obtenue via Context7 : [FileHandle.sync et rename](https://nodejs.org/docs/latest-v24.x/api/fs.html).
