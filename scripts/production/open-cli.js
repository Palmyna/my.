import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { join, dirname } from 'node:path'
import { configurationBundle, requireProduction } from './config.js'
import { consumeOpenSecrets } from './publication-api.js'
import { openCommandAPI } from './open-command-api.js'
import { runOpen, openDiagnostic } from './open.js'
import { operatorEvidenceSchema, openOperatorEvidenceSchema } from './open-preparation.js'
import { visibilityEvidenceSchema } from './open-publication.js'
import { finalEvidenceSchema } from './open.js'
import { operatorLockPath } from '../maintenance/vercel.js'

// All answers have closed schemas. No arbitrary JSON, URL, JWT, response body,
// cookie or credential can be attached to operator evidence.
export function operatorIO(question, progress) {
  const confirm = async (message, phrase) => (await question(`${message}\nSaisir ${phrase} : `)).trim() === phrase
  const evidence = async (schema, base, message, phrase) => {
    progress(message)
    if (!await confirm('Confirmer uniquement les contrôles réellement effectués après ce challenge.', phrase)) return undefined
    const checked_at = (await question('Date UTC réelle de ces contrôles (ISO, après le challenge affiché) : ')).trim()
    const reference = (await question('Référence non secrète du relevé conservé (lettres/chiffres/_.:-) : ')).trim()
    return schema.parse({ ...base, checked_at, reference })
  }
  return {
    summary: async value => progress(`Session ${value.session_id} · projet ${value.project} · système PostgreSQL ${value.system_id}\nVercel ${value.vercel.project_id} · équipe ${value.vercel.team_id} · store ${value.vercel.global_config_id} (${value.vercel.global_config_slug}) · my.collectrealm.com\nVersion ${value.repository.version} · source ${value.repository.head}\nSauvegarde ${value.backup?.directory} · manifeste ${value.backup?.manifest_sha256}\nÉtat précédent : ${value.previous?.outcome ?? 'aucune ouverture'}.`),
    async identify(binding) {
      const pull_request = binding.pull_request ?? Number((await question('Numéro réel de la PR dev → main mergée : ')).trim())
      const deployment_id = binding.deployment_id ?? (await question('Identifiant réel du build Production promu (dpl_...) : ')).trim()
      const visibility_user_id = binding.visibility_user_id ?? (await question('UUID réel de l’identité éligible AAL2 pour les seules RPC de lecture : ')).trim()
      progress(`Livraison : PR #${pull_request} · ${deployment_id} · lecteur ${visibility_user_id}.`)
      return { pull_request, deployment_id, visibility_user_id }
    },
    authorizeCloudConnect: () => confirm('Autoriser les connexions de lecture GitHub/Vercel/Supabase au projet affiché. Aucun export.', 'AUTORISER CONNEXIONS'),
    authorizePublish: c => confirm(`Autoriser PROD.6 : ${c.binding.changelog.file}\nSHA-256 ${c.binding.changelog.file_sha256}\nClé ${c.binding.changelog.publication_key} · hash ${c.binding.changelog.content_hash}\nUne seule notification changelog ; cette autorisation ne rouvre pas MY.`, 'PUBLIER CHANGELOG'),
    authorizeRecovery: c => confirm(`Reprise : Supabase ${c.states.supabase}, Vercel ${c.states.vercel}. Processus/enfants et marqueurs exacts examinés et arrêtés ; aucune suppression automatique. Changements distants examinés et attribués à cette session.${c.uncertain_vercel_checkpoint ? ' Accusé Vercel perdu : vérifier aussi le journal fournisseur, exclusivité et absence de toute autre modification du store.' : ''}`, 'REPRENDRE OUVERTURE'),
    authorizeUnfreeze: c => confirm(`Autoriser séparément le dégel Supabase : révision ${c.freeze_revision}, livraison et changelog vérifiés. Exclure les autres opérateurs SQL/gel, publisher/retrait, PR/déploiement/promotion, Global Config, imports/jobs/DDL/configuration jusqu’aux contrôles finaux. Exception permanente super_admin conservée.`, 'DEGELER SUPABASE'),
    authorizeVercelReopen: c => confirm(`Autoriser séparément maintenance_production=false sur le projet/store Production examinés. Checkpoint ${c.maintenance_checkpoint}. Exclusivité de TOUS les autres writers Global Config jusqu’à fin des relectures ; aucun CAS distribué. Authentication All Deployments conservée.`, 'ROUVRIR VERCEL'),
    async attachEvidence(c) {
      const open = c.protections?.maintenance_production === false
      const schema = open ? openOperatorEvidenceSchema : operatorEvidenceSchema
      progress(`Challenge préparation ${c.run_id} · ${c.checkpoint} · début ${c.started_at}.`)
      return evidence(schema, { format: 'my-production-open-evidence-v1', provenance: 'operator_verified',
        run_id: c.run_id, session_id: c.session_id, checkpoint: c.checkpoint, domain: 'my.collectrealm.com',
        deployment_id: c.binding.deployment_id, served_commit: c.binding.merge, served_version: c.binding.version,
        checks: Object.fromEntries(Object.keys(schema.shape.checks.shape).map(k => [k, true])) },
      `Vérifier/actualiser les relevés liés à cette livraison : revue/merge, logs Supabase et Edge/configuration, compatibilité, promotion du même build sans rebuild, version/commit réellement servis, ${open ? 'GET/HEAD 200 authentifiés routes/assets' : 'GET/HEAD 503 MY. authentifiés avec headers/routes/assets'}, couverture/propagation. Exiger l’essai PROD.5 adapté à cette archive et ses limites Auth/MFA/application/externe, durée/perte/étapes manuelles ; sa référence doit figurer dans le relevé. Sans récupération démontrée : arrêter. Confirmer absence de backup en cours et coordination des writers privilégiés, dont super_admin AAL2. Les relevés statiques existants restent utilisables si toujours valides ; les faits volatils doivent être contrôlés maintenant. Aucun 302 SSO ne prouve ces contrôles.`, 'LIVRAISON ATTESTEE')
    },
    async attachVisibilityEvidence(c) {
      progress(`Challenge AAL2 ${c.run_id} · ${c.checkpoint} · début ${c.started_at}\nProjet ${c.project} · utilisateur ${c.user_id} · annonce ${c.announcement_id}\nClé ${c.publication_key} · version ${c.app_version} · hash ${c.content_hash}.`)
      const base = { ...c }; delete base.started_at
      return evidence(visibilityEvidenceSchema, { ...base, format: 'my-production-changelog-visibility-v1',
        provenance: 'operator_verified_real_authenticated_RPC', aal: 'aal2',
        checks: Object.fromEntries(Object.keys(visibilityEvidenceSchema.shape.checks.shape).map(k => [k, true])) },
      'Avec cette vraie identité AAL2, via client normalement autorisé : get_notification_center sur toutes les pages (exactement cette annonce), get_notification_unread_count cohérent, get_notification_content exact. Vérifier identité/AAL2, UUID/version/titre/contenu/hash. Aucun mark_notification_read/process_notification ; aucune interface marquant automatiquement lu. Ne copier aucun JWT/cookie/réponse/secrets dans ce terminal. Sans moyen sûr, arrêter.', 'VISIBILITE AAL2 ATTESTEE')
    },
    async attachFinalEvidence(c) {
      progress(`Challenge retour en ligne ${c.run_id} · ${c.checkpoint} · début ${c.started_at}.`)
      const base = { ...c }; delete base.started_at
      return evidence(finalEvidenceSchema, { ...base, format: 'my-production-online-evidence-v1',
        provenance: 'operator_verified_authenticated_application',
        checks: Object.fromEntries(Object.keys(finalEvidenceSchema.shape.checks.shape).map(k => [k, true])) },
      `Vérifier via admission Vercel authentifiée normale : GET/HEAD 200 domaine/routes/assets ; version ${c.served_version}, commit ${c.served_commit}, build ${c.deployment_id} réellement servis. Tester Auth/MFA, lectures et mutation légitime autorisée avec relecture, reprise Phase 8 et disponibilité du changelog pour son audience, sans modifier son état individuel pendant le contrôle. Un 302 anonyme SSO reste normal. Contrôles humains distincts des lectures automatiques API. Si incomplets, refuser : session partielle, sans rollback automatique.`, 'RETOUR EN LIGNE ATTESTE')
    },
  }
}

export async function main(args = process.argv.slice(2)) {
  const secrets = consumeOpenSecrets() // Before configuration or ANY child.
  const controller = new AbortController()
  let api, reader, timer, bundle
  const interrupted = () => {
    controller.abort(); reader?.close()
    console.error('Interruption : état distant potentiellement partiel ou inconnu. Aucun rollback ; examiner session et verrous.')
    timer ??= setTimeout(() => process.exit(130), 20_000)
  }
  process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted)
  try {
    const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: { config: { type: 'string' } } })
    requireProduction(args.length === 2 && values.config, 'only_config_argument_allowed')
    requireProduction(process.stdin.isTTY && process.stdout.isTTY, 'interactive_operator_terminal_required')
    bundle = configurationBundle(values.config)
    const publisherTargetFile = process.env.MY_PRODUCTION_PUBLISHER_TARGET ?? join(dirname(values.config), 'notifications', 'target.json')
    api = openCommandAPI(bundle, secrets, { configFile: values.config, publisherTargetFile, authorizeConnect: true, signal: controller.signal })
    reader = createInterface({ input: process.stdin, output: process.stdout })
    reader.on('SIGINT', () => process.emit('SIGINT'))
    const io = operatorIO(message => reader.question(message, { signal: controller.signal }), message => console.log(message))
    const result = await runOpen(bundle, io, api)
    console.log(`Résultat : ${result.outcome} · ${result.diagnostic}\nSupabase : ${result.states.supabase} · Vercel : ${result.states.vercel}`)
    if (result.outcome === 'completed') console.log(`Session clôturée : ${result.session_id}. Version ${result.binding.version}, PR #${result.binding.pull_request}, ${result.binding.deployment_id}, notification ${result.notification.announcement_id}. Historique et archive conservés ; prochain prod:backup disponible.`)
    else process.exitCode = controller.signal.aborted ? 130 : 1
  } catch (error) {
    console.error(`Arrêt : ${openDiagnostic(error, controller.signal.aborted)}. États non confirmés ; aucun rollback automatique.`)
    process.exitCode = controller.signal.aborted ? 130 : 1
  } finally {
    if (bundle && process.exitCode) console.error(`Reprise : même prod:open, ${bundle.config.sessions_directory}\\current.json. Examiner processus/enfants, ${join(process.env.LOCALAPPDATA ?? '', 'MY', 'production', 'prod-backup.lock')} et ${operatorLockPath(bundle.vercel)}. Aucun marqueur supprimé automatiquement.`)
    clearTimeout(timer); reader?.close(); api?.dispose()
    Object.keys(secrets).forEach(key => { secrets[key] = undefined })
    process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted)
  }
}
if (import.meta.main) await main()
