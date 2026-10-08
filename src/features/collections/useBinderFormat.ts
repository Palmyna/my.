import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveBinderFormat } from '../../lib/view-preferences'
import { deleteCollectionViewOverride, getCollectionViewOverride, saveCollectionViewOverride } from '../../services/view-preferences'
import type { BinderFormat } from '../../types/view-preferences'
import { userPreferencesOptions } from '../view-preferences/view-preferences-query'

export const binderFormatKey = (viewerId: string, collectionId: string) => ['collection-view-preferences', viewerId, collectionId] as const

// Identity comes from the viewer, including when the collection is read-only.
// No override read in List/Cards; no Collection content invalidation on writes.
export function useBinderFormat(viewerId: string, collectionId: string, enabled: boolean, onFormatChange: () => void) {
  const client = useQueryClient()
  const live = useRef(false)
  const running = useRef(false)
  const confirmedFormat = useRef<BinderFormat | null>(null)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const global = useQuery({ ...userPreferencesOptions(viewerId), enabled })
  const queryKey = binderFormatKey(viewerId, collectionId)
  const override = useQuery({ queryKey, queryFn: () => getCollectionViewOverride(viewerId, collectionId),
    enabled, retry: false, staleTime: Infinity })
  const format = resolveBinderFormat(override.data, global.data?.binderDefaultFormat)
  const ready = global.isSuccess && override.isSuccess
  useEffect(() => {
    if (!enabled || !ready) return
    if (confirmedFormat.current !== null && confirmedFormat.current !== format) onFormatChange()
    confirmedFormat.current = format
  }, [enabled, ready, format, onFormatChange])
  const mutation = useMutation({
    retry: false,
    mutationFn: async (choice: BinderFormat | null) => {
      if (choice !== null) return saveCollectionViewOverride(viewerId, collectionId, choice)
      await deleteCollectionViewOverride(viewerId, collectionId)
      return null
    },
    onSuccess: async data => {
      if (!live.current) return
      await client.cancelQueries({ queryKey, exact: true })
      if (!live.current) return
      client.setQueryData(queryKey, data)
    },
    onError: async () => {
      if (!live.current) return
      // A lost response can follow a committed preference write.
      await client.cancelQueries({ queryKey, exact: true })
      if (live.current) await client.invalidateQueries({ queryKey, exact: true })
    },
    onSettled: () => { running.current = false },
  })
  function choose(choice: BinderFormat | null) {
    if (!ready || running.current || (choice === null ? override.data === null : override.data === choice)) return
    running.current = true
    mutation.mutate(choice)
  }
  return { format, override: override.data, ready, choose, busy: mutation.isPending,
    error: global.isError || override.isError, saveError: mutation.isError,
    retry: () => { if (global.isError) void global.refetch(); if (override.isError) void override.refetch() } }
}
