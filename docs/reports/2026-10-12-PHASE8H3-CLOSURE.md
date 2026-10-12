# Phase 8H.3 — Validation finale et clôture du centre de notifications

12 octobre 2026 — version **0.8.19**. **8H terminée et validée exclusivement en Local, avec contrôles navigateur réels.** Cloche, liste, consultation, lecture/traitement et raccordement au parcours Collection fonctionnent ensemble. Les contrôles axe incomplets restent explicitement incomplets ; aucune certification globale d’accessibilité n’est revendiquée. **8I reste distincte et non commencée** : audit transversal Phase 8, préparation du checkpoint Cloud et clôture générale.

## 1. Coupure électrique, récupération et état de départ

Une coupure a interrompu la première exécution de 8H.3. Un diagnostic de récupération, sans modification des fichiers, a confirmé l’intégrité du travail, la récupération WAL terminée et l’identité des données Local. Aucun reset, restauration ou réparation destructive n’a été nécessaire. La reprise conserve ces acquis, sans recommencer 8H.1/8H.2.

- Branche `dev`, HEAD initial/final `f35b920c75d23d0ed4874b328ec6c1c105aa9ec6` ; `AGENTS.md` respecté. Aucun commit/push.
- Huit modifications initiales unstaged, **75 insertions / 14 suppressions** : package/lock, `AuthenticatedLayout`, deux tests notifications, `NotificationPanel`, CSS notifications et Vite. Leurs huit empreintes sont conservées pendant la reprise.
- Version déjà préparée `0.8.19`, package et deux champs du lock synchronisés. Comparaison JSON avec HEAD hors versions : dépendances et autres champs inchangés.
- Les **33 artefacts récupérés** de `.cache/8h3` sont conservés sans écrasement. Le manifeste de reprise associe empreintes des sources, empreintes/dates des artefacts et HEAD. Les preuves nouvelles portent un préfixe `resume-`.
- Les journaux interrompus n’ont pas de bilan complet : frontend sans total final, pgTAP arrêté au fichier `020`. Ils ne sont pas utilisés comme succès global. Les anciens passages ciblés (180 tests avant coupure, 69 au diagnostic) restent des preuves séparées, sans addition artificielle.

Sources : [8H.1](2026-10-11-PHASE8H1-NOTIFICATION-CENTER.md), [8H.2](2026-10-12-PHASE8H2-NOTIFICATION-ACTIONS.md), [8G.3](2026-10-11-PHASE8G3-CLOSURE.md), décisions Fonctionnalités/UX et [8A.3 section 8](2026-10-08-PHASE8A3-TECHNICAL-CONTRACTS.md#8-notifications-et-publication). Skills de validation, Supabase, navigateur, investigation et correction ciblée appliqués ; références actuelles CLI et TanStack Query consultées via Context7. Aucun agent délégué.

## 2. Inventaire fonctionnel 8H.1–8H.3

| Livraison | Comportements validés |
|---|---|
| **8H.1 — 0.8.17** | Cloche entre recherche et compte ; badge absent à zéro, exact jusqu’à 99 puis `99+`, compteur exact accessible. Erreur distincte du zéro. Panneau non modal, trois catégories, états Lue/Non lue, chargement/vide/erreur/retry, pagination de 20, déduplication et ordre serveur, actualisation de tête, confidentialité viewer-scoped. |
| **8H.2 — 0.8.18** | Lecture manuelle sans traitement, révision capturée/retry exact ; détail annonce/changelog en texte brut, traitement seulement après consultation fraîche rendue. Navigation vers le même aperçu 8F, droits relus, version effectivement présentée acquittée, application/reprise confirmée puis relectures et disparition autoritative. |
| **8H.3 — 0.8.19** | Validation globale, responsive/clavier/navigateur réel, corrections de chaînes longues, focus après pagination, transition différée et relecture partagée du contenu ; suites complètes, intégrations Local et clôture documentaire. |

Boutons indépendants, aucun bouton imbriqué ; tokens MY. et composants existants conservés. Collections déjà ouvertes et menu `…` utilisent le même dialogue. Le traitement Collection reste dérivé de l’application 8F, jamais simulé via l’API de traitement des annonces.

## 3. Trois corrections récupérées

1. **Chaînes longues.** Titre/version sans espaces débordaient du dialogue mobile : mesure antérieure `clientWidth=353`, `scrollWidth=4604`. La règle `.notification-center .collection-dialog { overflow-wrap: anywhere; }` ramène le scroll horizontal à la largeur utile. Régression React sur titre de 200 caractères, version de 64 caractères, corps proche de 20 000 caractères, retours conservés et traitement unique ; mesures navigateur conservées et complétées.
2. **Fin de pagination.** Le bouton focalisé disparaissait et laissait le focus sur `body`. `NotificationPanel` réutilise la restauration des actions retirées : titre du panneau si le bouton a disparu, sans déplacer une autre destination choisie. Deux scénarios de régression ; contrôle clavier navigateur confirmé à 31 lignes.
3. **Transition différée.** L’intention pouvait être consommée sur Dashboard avant arrivée sur Collection. `AuthenticatedLayout` conserve `originLocationKey` jusqu’à destination ; une navigation concurrente gagnante, un changement de viewer ou une perte d’autorisation l’annulent. Deux régressions avec routeur de données retardé, dont absence de résurrection après remplacement de navigation.

Le seul changement de [vite.config.ts](../../vite.config.ts) ajoute `notifications` à la regex des CSS traités sous jsdom, pour tester la vraie feuille de style. Aucun changement de serveur, host, CORS, proxy ou permissions ; aucun contournement du refus navigateur de 8H.2.

## 4. Correction supplémentaire justifiée pendant la reprise

Une première mesure d’aperçu depuis Dashboard a trouvé le focus sur `body`. Les reprises simples clavier/clic étaient conformes ; une reproduction ciblée de la séquence, avec trace des focus déléguant aux méthodes natives, a ensuite confirmé la cause : **une relecture partagée du contenu était assimilée à une obsolescence**. L’alerte « La collection ou le catalogue a changé… » prenait le focus, puis disparaissait au retour de la même version.

[CollectionUpdateDialog](../../src/features/collections/CollectionUpdateDialog.tsx) distingue désormais correspondance du plan et disponibilité pour confirmer. Aperçu/contenu sont comparés aux états autoritatifs du cache Query ; l’observateur contenu notifie tous ses changements. Une lecture en cours suspend la confirmation, sans annoncer un changement non confirmé. Une divergence de révision, une erreur de relecture, une invalidation ou `preview_stale` impose toujours une nouvelle consultation. Confirmation et acquittement restent conditionnés aux lectures réussies et terminées ; aucun cache optimiste, RPC supprimé, token/UUID remplacé ou writer modifié.

Trois [régressions](../../src/features/collections/CollectionUpdateDialog.test.tsx) couvrent relecture en vol, même version avec focus conservé, révision différente et échec. La fausse alerte a été reproduite avant correction. Après correction : **130 tests ciblés / quatre fichiers PASS**, nouvelle navigation réelle avec focus au titre, puis application clavier réussie. Les captures/mesures d’aperçu précédant cette correction sont complétées par les preuves `resume-corrected-*` ; l’ancienne mesure de focus n’est pas présentée comme conforme.

## 5. Validations automatisées finales

| Contrôle | Résultat réellement exécuté |
|---|---|
| pgTAP complet | **38/38 fichiers, 3 790 assertions PASS**, aucun échec ni assertion ignorée ; parité canonique globale **1 213 cibles, zéro divergence** |
| Vitest complet stabilisé | **76 fichiers PASS, six fichiers conditionnels ignorés sur 82 ; 2 421 tests PASS, dix ignorés sur 2 431**, aucun échec ; quatre projets frontend/catalogue/publication/functions inclus |
| Intégrations Local finales explicites | **Trois fichiers / sept tests PASS**, aucun ignoré dans ce passage |
| SQL lint `public,private` | PASS, aucun warning/erreur, résultat vide |
| Advisors sécurité Local | **Zéro WARN/ERROR**, sept INFO attendues `rls_enabled_no_policy` sur tables privées fermées |
| Types Supabase | Génération Local reproductible, identique au fichier et à HEAD ; SHA-256 `8fba623654865589f1abb6191cc0d0f6a1dc768659a3e6ee91c3a9ab86c935a4` |
| Typecheck/build final `0.8.19` | PASS ; avertissement de chunk >500 kB préexistant, sans modification de seuil |
| ESLint complet final | PASS, zéro warning |
| Package/lock, dépendances, `git diff --check` | PASS |

Le premier passage de reprise (2 418 tests PASS) précédait la quatrième correction ; **seul le passage stabilisé à 2 421 est le bilan frontend final**. pgTAP, SQL lint/advisors, ACL et types restent applicables après ce correctif exclusivement React. Leur backend n’a pas changé ; aucune répétition globale DB supplémentaire.

Comparaison aux références : 8G.3 avait **38 fichiers / 3 790 assertions DB** et **2 349 tests frontend/outils PASS** ; la suite DB, les 48 migrations, le hash des types et les sept INFO restent identiques, le périmètre frontend inclut désormais les livraisons UI 8H. 8H.2 avait **456 tests ciblés / 12 fichiers**, trois intégrations notifications et trois intégrations application ; ces six scénarios réels sont repassés ici, avec le test des cinq RPC en plus. Les totaux historiques et actuels ne sont jamais additionnés.

ESLint a ensuite signalé un `await` sur le callback synchrone `act` dans le nouveau test. Callback rendu explicitement asynchrone, conditions inchangées ; les trois régressions ont été repassées avec succès, puis typecheck et ESLint complet revérifiés. Ce dernier ajustement concerne uniquement le harness de test ; le produit compilé et les sept intégrations restent inchangés. Les 19 autres cas filtrés par `-t` dans ce contrôle ciblé ne sont pas additionnés au total global, où ils avaient été exécutés.

Deux includes temporaires générés par le wrapper pgTAP avaient survécu à la coupure. Leur contenu a été vérifié identique aux migrations sources, puis la commande effective du wrapper (`supabase test db --local`) a exécuté toute la suite. Ces copies dérivées sont archivées dans le cache avant nettoyage des temporaires, pour rendre le wrapper habituel réutilisable. Les notices « extension pgtap déjà présente » ne sont pas des tests ignorés.

Commandes reproductibles, avec le CLI épinglé du dépôt :

```powershell
npm.cmd test -- --maxWorkers=2
npm.cmd run db:test
npm.cmd run db:lint
npm.cmd exec -- supabase db advisors --local --type security --level info --fail-on warn
npm.cmd exec -- supabase migration list --local
npm.cmd exec -- supabase gen types --local --lang typescript --schema public
$env:MY_SUPABASE_LOCAL_TEST='1'
npm.cmd exec -- vitest run src/services/notifications.local.test.ts src/services/notification-actions.local.test.tsx src/services/collection-update-apply.local.test.tsx --maxWorkers=1 --no-file-parallelism
npm.cmd run build
npm.cmd run lint
git diff --check
```

Types générés en mémoire, normalisation identique au script du dépôt puis comparaison ; aucune édition manuelle. Journaux et codes de sortie dans `.cache/8h3/resume-*-result.json` et `resume-*.log`.

## 6. Intégrations Local et concurrence

- [Notifications 8G.2](../../src/services/notifications.local.test.ts) : **un test**, cinq RPC réelles, concordance centre/compteur, contenu, audience, transitions, ACL et invalidation.
- [Actions 8H](../../src/services/notification-actions.local.test.tsx) : **trois tests**, cloche avec navigation, menu Collection et reprise incertaine. Consultation/traitement avec hash exact, lecture avec version présentée, disparition après application, compteur/tête relus, un seul apply ; reprise par reçu avec le même UUID après perte de réponse **après commit SQL réel**.
- [Application 8F](../../src/services/collection-update-apply.local.test.tsx) : **trois tests**, application normale, réponse perdue/rechargement, écriture confirmée avec relecture échouée/rechargement. Plan/token, confirmation unique, relectures et absence de second writer vérifiés.

Harness React/jsdom, SDK/PostgREST/PostgreSQL réels et identités AAL2 synthétiques : ces intégrations ne sont pas des preuves visuelles. Le navigateur utilise séparément une vraie session GoTrue/TOTP. Fixtures réservées et identifiables uniquement, exécutions Local séquentielles pour les fixtures partagées.

Sur les dix tests ignorés du passage standard, sept sont donc explicitement exécutés. Restent **trois tests opt-in non relancés** : `collection-hidden.local.test.tsx` (8C), `collection-update.local.test.tsx` (8E), `scripts/notifications/publication.local.test.ts` (publication/concurrence 8G.3). Ils ne sont pas annoncés réussis dans cette intervention. Le parcours aperçu est exercé par les intégrations 8H/8F ; les anciennes campagnes indépendantes restent référencées dans leurs rapports.

Concurrence backend réutilisée depuis [8G.3](2026-10-11-PHASE8G3-CLOSURE.md) : dix scénarios publication/retrait et neuf scénarios transitions 8G.2, multi-connexions réelles. Aucune nouvelle preuve de concurrence PostgreSQL revendiquée. Les 59 définitions/ACL actuelles, services transactionnels, migrations et writer 8F sont inchangés ; la correction UI de relecture ne modifie pas ces contrats.

## 7. Sécurité, migrations et services Local

**48 migrations alignées**, dernière `20261011191625`. Vérification Local seulement ; le champ `remote` affiché par `migration list --local` ne constitue aucune preuve Cloud.

- Trois tables notifications privées : RLS activée, absence volontaire de politiques, ACL propriétaire ; aucun privilège de table pour anon/authenticated/publisher.
- Cinq RPC utilisateur : `SECURITY DEFINER`, `search_path=''`, EXECUTE authenticated, refus anon/publisher ; contrôles identité/AAL2/profil et viewer couverts par pgTAP et intégration réelle.
- Publisher : LOGIN/NOINHERIT, sans attribut administratif ni appartenance à un rôle, limite quatre connexions, sans mot de passe avant/après. CONNECT et USAGE private, aucun CREATE private/USAGE Auth ; exactement deux EXECUTE métier (publication/retrait), aucun accès table public/private/Auth.
- Publication/retrait refusés à anon, authenticated, service_role et authenticator. Aucun secret administratif frontend, aucune route administrative.

Les sept INFO des advisors concernent `catalog_overrides`, `catalog_sync_runs`, `collection_notification_reads`, `collection_operation_receipts`, `collection_order_intents`, `notification_announcement_states`, `notification_announcements`. Résultat identique au référentiel 8G.3 ; fermeture intentionnelle, aucune politique permissive ajoutée pour supprimer une information.

PostgreSQL, Auth et PostgREST accessibles après récupération. Edge Runtime arrêté et Vector en erreur réseau Docker préexistante n’ont bloqué aucun contrôle nécessaire ; **aucune réparation ni relance générale de stack**. Les tests unitaires functions ne constituent pas une exécution réelle d’Edge Runtime.

## 8. Preuves navigateur, responsive et accessibilité

Accès normalement autorisé avec **agent-browser 0.38.2, Chrome 153**, session isolée ; Vite réel `http://127.0.0.1:5198`, API Local `http://127.0.0.1:55321`. Aucune réponse réseau mockée. Session synthétique préparée via connexion GoTrue et TOTP réels, puis chargée dans le stockage du seul navigateur de test ; aucun login personnel ni secret imprimé. Déconnexion réelle, navigateur/serveur frontend arrêtés, fichier de session temporaire retiré au nettoyage.

Les anciens artefacts datent de cette première exécution 8H.3, avec scripts de préparation Local et preuve SQL correspondants ; leurs sources récupérées restent identiques. Les captures avant correction servent au diagnostic, celles après correction et les nouveaux relevés servent à la validation. Les erreurs de transport stdin/quoting du lanceur Windows et attentes invalides ne sont pas comptées comme preuves réussies. Le binaire natif identique au shim installé reçoit le stdin légitime ; aucune option de sécurité ou permission assouplie.

| Format | Mesures et parcours |
|---|---|
| Desktop **1280 × 900** | Largeur page 1280, panneau 440 px, dialogue 520 px, aucun scroll horizontal ; alignement cloche/recherche/compte |
| Tablette **820 × 1180** | Largeur page 820, panneau 440 px, recherche seconde ligne ; dialogue et aperçu bornés, focus au titre |
| Mobile **390 × 844** | Largeur page 390, panneau 342 px, dialogue ≈355 px (`scrollWidth=clientWidth=353`) ; scroll interne et actions accessibles |

Panneau : première page 20, pagination clavier jusqu’à 31, retour au titre après disparition du bouton, nouvelle tête à 20, Escape/restauration, fermeture mutuelle recherche/notifications/compte. Le lien `aria-controls` cible réellement le panneau lorsqu’il est ouvert ; aucun bouton imbriqué.

Annonce/changelog : titre de 200 caractères, version de 64 caractères, corps navigateur de **10 031 caractères / quatre lignes logiques**, texte brut et retours conservés ; `overflow-wrap:anywhere`, `white-space:pre-wrap`. Tab atteint Fermer avec scroll interne (mobile, bouton à y≈753), Escape restitue le titre du panneau lorsque la ligne a disparu. Les tests React stressent séparément un corps proche de 20 000 caractères.

Collection : navigation réelle depuis Dashboard, collection déjà ouverte, menu `…`, aperçu et métadonnées, Tab/Shift+Tab avec disclosure, actions visibles après scroll, application clavier confirmée et collection ensuite à jour. Preuve SQL avant nettoyage sur l’état corrigé : **version lue 8, version appliquée 8, révision 3, un reçu `apply`, zéro notification Collection active**. Le compteur passe à 29 après lecture de l’aperçu ; l’application retire ensuite la ligne déjà lue sans décrément artificiel supplémentaire. Focus correct au titre après la quatrième correction et à la confirmation après application.

**Axe 4.12.1 : zéro violation détectée sur les surfaces auditées, mais contrôles incomplets conservés.** Panneau : `aria-valid-attr-value` et `color-contrast` ; annonce/changelog : `color-contrast`. ARIA est contrôlé séparément par présence de cible dans le DOM ; contraste du badge sur fond uni **4,5349:1**, mesures complémentaires conservées. Cela ne transforme pas les couleurs sur fonds dégradés ni les règles incomplètes en PASS automatique. La correction finale porte sur la fraîcheur/focus de l’aperçu ; CSS et DOM des surfaces axe auditées restent inchangés.

Limites : formats obtenus par viewport Chrome, pas certification sur appareils physiques ou autres moteurs. Branches HTTP erreur/indisponibilité/retry couvertes par React/DOM et RPC Local ; l’essai offline antérieur montrait suspension/reprise, pas une erreur HTTP visuellement validée. La preuve navigateur absente en 8H.1/8H.2 est acquise pour les contrôles Chrome ci-dessus, sans extrapoler.

Checklist manuelle complémentaire, réservée aux limites restantes : confirmer contraste sur fonds dégradés dans le navigateur habituel ; contrôler avec le lecteur d’écran habituel noms/compteur et transitions de focus ; revoir visuellement erreur/indisponibilité/retry. Cette liste ne remplace aucun résultat exécuté et ne prétend pas que les contrôles axe incomplets sont terminés.

## 9. Conservation des données

Snapshot de reprise avant fixtures, puis comparaisons après pgTAP, intégrations, navigateur et intégrations finales : **23 tables complètes, dont `auth.users`, 59 fonctions/définitions/ACL, rôle publisher et migrations identiques**. Représentation sérialisée et SHA-256 identiques :

`cd89414ec1622ebc529ca044d76d877b98c7ab887d16b4d10eaaf2e6f86a524d`

| Données réelles conservées | Quantités finales |
|---|---|
| Collections | **Pikachu 254 items**, **test 3 items** ; contrat 2, révisions exactes `"7"` inchangées |
| Items / exemplaires | **257 / 3**, ordre, masquages, possession, notes et références identiques |
| Intentions / reçus | **7 / 14** |
| Utilisateur / profil | **1 / 1**, préférences conservées |
| Notifications / suivis | Trois tables vides avant/après, aucune suppression de publication personnelle |
| Catalogue | **31 904 variantes, 19 907 cartes sources, 16 820 associations Pokémon, 1 213 états cibles** identiques |

Ces quantités sont celles relevées et comparées, jamais des valeurs restaurées artificiellement. Fixtures synthétiques réservées uniquement, nettoyées par leurs identifiants exacts ; aucune suppression globale, conversion legacy ou modification des collections personnelles. Les snapshots sensibles restent dans le cache ignoré, sans détails Auth publiés. Les artefacts récupérés et leurs empreintes restent conservés.

## 10. Conclusion et frontière

**8H clôturée et validée en Local en `0.8.19`, avec preuves navigateur responsive et clavier.** Trois corrections récupérées intactes, une correction supplémentaire de relecture/focus directement reproduite et testée. Aucun problème bloquant restant constaté ; limites axe, scénarios visuels non exécutés et services auxiliaires explicitement conservés.

README, Fonctionnalités, Modèle, UX/UI, Architecture, Database et roadmap synchronisés avec cette livraison ; rapports historiques conservés. Aucune nouvelle fonctionnalité, refonte, migration/RPC, modification du writer 8F/backend 8G, polling/Realtime/push/email, reset ou accès Cloud/Vercel. Aucun commit ni push. **Arrêt strict à 8H.3 ; clôture générale de Phase 8 réservée à 8I.**
