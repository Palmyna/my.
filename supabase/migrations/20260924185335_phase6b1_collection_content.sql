begin;

-- Prepared only: do not apply as part of Phase 6B.1 implementation.
-- One scalar value keeps the complete ordered payload outside PostgREST's row cap.
-- STABLE + one SELECT: items, catalogue and owner possession use one statement snapshot.
create function public.get_collection_content(p_collection_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'collection_item_id', i.id,
    'variant_id', i.variant_id::text,
    'origin', i.origin,
    'card_name_fr', card.name_fr,
    'local_id', card.local_id,
    'set_name_fr', card_set.name_fr,
    'image_url', coalesce(v.image_url, card.image_url),
    'variant_label', v.label,
    'owned', exists (
      select 1 from public.physical_copies copy
      where copy.user_id = c.owner_id and copy.variant_id = i.variant_id
    )
  ) order by i.sort_position, i.id), '[]'::jsonb)
  from public.collections c
  join public.collection_items i on i.collection_id = c.id
  join public.catalog_variants v on v.id = i.variant_id
  join public.source_cards card on card.id = v.source_card_id
  join public.tcg_sets card_set on card_set.id = card.set_id
  where c.id = p_collection_id;
$$;

revoke all on function public.get_collection_content(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_collection_content(uuid) to authenticated;
comment on function public.get_collection_content(uuid) is
  'Complete collection content as a JSON array ordered by sort_position,id, without exposing positions. Invoker RLS enforces aal2, MY. profile and owner/active share. Empty or invisible collection returns []. variant_id is decimal text (lossless BIGINT); catalogue labels/URLs remain unchanged, image falls back from variant to source. owned tests collection owner copies, never reader copies. Read only.';

-- Additive contract: existing readers/writers, data, table grants and RLS unchanged.
-- Rollback before commit is atomic. After rollout, a new migration may drop only
-- this function once its consumers are removed; no data restoration is needed.
commit;
