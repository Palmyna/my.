import { resolveCatalogView } from '../../lib/view-preferences'
import { CATALOG_VIEWS } from '../../types/view-preferences'
import { usePreferredView } from '../view-preferences/usePreferredView'

export function useCatalogView(resourceId: string) {
  return usePreferredView(resourceId, {
    kind: 'catalog', lastField: 'lastCatalogView',
    available: CATALOG_VIEWS, resolve: resolveCatalogView,
  })
}
