import { fireEvent, render, screen } from '@testing-library/react'
import { expect,test,vi } from 'vitest'
import { createRef } from 'react'
import { CollectionUpdatePreview } from './CollectionUpdatePreview'
import { decodeCollectionUpdatePreview } from '../../services/collection-update'
import { updateCurrentItems,updateMetadata,updatePreview } from '../../test/collection-update'
const ready=()=>({ status:'ready' as const,preview:decodeCollectionUpdatePreview(updatePreview()),currentItems:updateCurrentItems(),variants:updateMetadata() })
test('conversions existing identities, additions, removals, ranks and complete server order',()=>{
  render(<CollectionUpdatePreview state={ready()} />)
  expect(screen.getByRole('heading',{ name:'Cartes personnelles devenant automatiques' })).toBeVisible()
  expect(screen.getAllByText(/Gamma · TEST.*3\/100/)).toHaveLength(2)
  expect(screen.getAllByText(/Évoli · TEST.*5\/100/)).toHaveLength(2)
  expect(screen.getByText('Place 1 → 3 dans l’ordre du catalogue · Carte existante conservée')).toBeVisible()
  const detail=screen.getByText('Ordre complet proposé (4 cartes)').closest('details')!
  fireEvent.click(screen.getByText('Ordre complet proposé (4 cartes)'));detail.open=true
  expect(Array.from(detail.querySelectorAll('li')).map(row=>row.textContent)).toEqual([
    expect.stringContaining('Gamma'),expect.stringContaining('Alpha'),expect.stringContaining('Évoli'),expect.stringContaining('Delta'),
  ])
  expect(screen.getByText('Carte existante conservée · Masquée')).toBeVisible()
  expect(screen.getByText('Position 3 → 1')).toBeVisible()
  expect(screen.queryByRole('button',{ name:/appliquer/i })).not.toBeInTheDocument()
})
test('empty target explicit removals and retained collection/manuals',()=>{
  const state=ready();state.preview.targetEmpty=true;state.preview.added=[];state.preview.converted=[];state.preview.rankChanges=[]
  state.preview.finalOrder=state.preview.finalOrder.filter(item=>item.origin==='manual')
  render(<CollectionUpdatePreview state={state} />)
  expect(screen.getByText(/Cette cible ne contient plus/)).toHaveTextContent('Vos cartes personnelles seraient conservées')
})
test('no useful update distinct from unavailable and error, no effects',()=>{
  const state=ready();state.preview.updateAvailable=false
  const { rerender }=render(<CollectionUpdatePreview state={state} />)
  expect(screen.getByRole('status')).toHaveTextContent('Aucun changement structurel utile')
  expect(screen.queryByText(/Ordre complet proposé/)).not.toBeInTheDocument()
  rerender(<CollectionUpdatePreview state={{ status:'unavailable' }} />)
  expect(screen.getByRole('status')).toHaveTextContent('Aperçu indisponible')
  const retry=vi.fn();rerender(<CollectionUpdatePreview state={{ status:'error',message:'État incohérent. Renouvelez la consultation.' }} onRetry={retry} />)
  expect(screen.getByRole('alert')).toHaveTextContent('État incohérent')
  fireEvent.click(screen.getByRole('button',{ name:'Réessayer' }));expect(retry).toHaveBeenCalledOnce()
})
test('loading and caller-controlled focus, keyboard disclosure, no network',()=>{
  const ref=createRef<HTMLHeadingElement>(),fetch=vi.spyOn(globalThis,'fetch')
  const { rerender }=render(<CollectionUpdatePreview state={{ status:'loading' }} headingRef={ref} />)
  expect(screen.getByRole('status')).toHaveTextContent('Chargement')
  ref.current!.focus();expect(ref.current).toHaveFocus()
  rerender(<CollectionUpdatePreview state={ready()} headingRef={ref} />)
  const summary=screen.getByText('Ordre complet proposé (4 cartes)');summary.focus();expect(summary).toHaveFocus()
  expect(fetch).not.toHaveBeenCalled();fetch.mockRestore()
})
