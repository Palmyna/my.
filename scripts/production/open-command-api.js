import { openPublicationAPI } from './publication-api.js'
import { productionFreeze } from './freeze-api.js'
import { createVercelMaintenance, operatorLockPath } from '../maintenance/vercel.js'
import { exists } from './session.js'
import { requireProduction } from './config.js'

export function openCommandAPI(bundle, secrets, options) {
  const publication = openPublicationAPI(bundle, secrets, options)
  const vercel = createVercelMaintenance(bundle.vercel, secrets.token, { authorizeConnect: true, signal: options.signal })
  return { ...publication,
    async prepare() {
      await publication.prepare()
      requireProduction(!await exists(operatorLockPath(bundle.vercel)), 'vercel_lock_requires_operator_review')
    },
    async freeze(command, revision, consent) {
      requireProduction(!options.signal?.aborted, 'interrupted_state_unknown')
      publication.checkConfiguration()
      return productionFreeze(bundle, secrets.password, command, revision, consent)
    },
    async reopenMaintenance(consent) {
      requireProduction(!options.signal?.aborted, 'interrupted_state_unknown')
      publication.checkConfiguration()
      return vercel.setMaintenance('reopen', consent)
    },
  }
}
