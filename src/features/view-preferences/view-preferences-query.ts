import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { getUserPreferences } from '../../services/view-preferences'
import type { UserPreferences } from '../../types/view-preferences'

export const userPreferencesKey = (viewerId: string | undefined) => ['user-preferences', viewerId] as const

export const userPreferencesOptions = (viewerId: string | undefined) => queryOptions({
  queryKey: userPreferencesKey(viewerId),
  queryFn: () => getUserPreferences(viewerId!),
  enabled: !!viewerId,
  retry: false,
  staleTime: Infinity,
})

// Independent writes may return whole-row snapshots in a different order.
// Merge only the fields confirmed by this write, preserving other confirmed saves.
export function confirmUserPreferences(client: QueryClient, viewerId: string, saved: UserPreferences,
  fields: readonly (keyof UserPreferences)[]) {
  client.setQueryData<UserPreferences>(userPreferencesKey(viewerId), current => ({
    ...(current ?? saved), ...Object.fromEntries(fields.map(field => [field, saved[field]])),
  }))
}
