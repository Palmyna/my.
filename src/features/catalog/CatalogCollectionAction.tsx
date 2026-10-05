import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { createAutomatic, findOwnedAutomaticCollection } from '../../services/collections'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { ownedAutomaticCollectionKey } from './catalog-query'
import { CreateCatalogCollectionDialog } from './CreateCatalogCollectionDialog'

export function CatalogCollectionAction({ viewerId, targetType, targetId, targetName }: {
  viewerId: string; targetType: 'pokemon' | 'set'; targetId: string; targetName: string
}) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const running = useRef(false)
  const live = useRef(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const queryKey = ownedAutomaticCollectionKey(viewerId, targetType, targetId)
  const collection = useQuery({ queryKey, queryFn: () => findOwnedAutomaticCollection(viewerId, targetType, targetId), retry: false })
  const mutation = useMutation({
    mutationFn: (name: string) => createAutomatic({ name, targetType, targetId }), retry: false,
    onSuccess: async result => {
      if (!live.current) return
      await client.cancelQueries({ queryKey, exact: true })
      if (!live.current) return
      client.setQueryData(queryKey, { collectionId: result.collectionId })
      // Reconcile even when another tab won the race. No Dashboard fetch gates navigation.
      void client.cancelQueries({ queryKey: dashboardCollectionsKey(viewerId), exact: true })
      void client.invalidateQueries({ queryKey: dashboardCollectionsKey(viewerId), exact: true })
      void client.invalidateQueries({ queryKey, exact: true })
      void navigate(`/collections/${result.collectionId}`)
    },
    onError: () => {
      if (live.current) void client.invalidateQueries({ queryKey, exact: true })
    },
    onSettled: () => { running.current = false },
  })
  return <div className="catalog-collection-action">
    {collection.isPending && <p role="status">Chargement de votre collection…</p>}
    {collection.isError && <div><p role="alert">Impossible de vérifier votre collection.</p>
      <button type="button" className="button secondary" disabled={collection.isFetching} onClick={() => void collection.refetch()}>Réessayer</button></div>}
    {collection.isSuccess && <button type="button" className="button catalog-primary"
      aria-haspopup={collection.data ? undefined : 'dialog'} onClick={event => {
        if (collection.data) void navigate(`/collections/${collection.data.collectionId}`)
        else { mutation.reset(); setOpener(event.currentTarget) }
      }}>{collection.data ? 'Ouvrir ma collection' : 'Créer ma collection'}</button>}
    {opener && <CreateCatalogCollectionDialog targetType={targetType} targetName={targetName} busy={mutation.isPending} error={mutation.error} opener={opener}
      onClose={() => { if (!running.current) setOpener(null) }} onReset={mutation.reset} onCreate={name => {
        if (running.current) return
        running.current = true; mutation.mutate(name)
      }} />}
  </div>
}
