begin;

-- Add nullable series names only; preserve the existing snapshot, order and RLS.
-- CREATE OR REPLACE retains ownership/grants. No stored data is changed.
-- Ship with the matching strict content decoder (11 -> 13 JSON keys).
-- Rollback: restore the content function from 20260927140955 in a new migration
-- and restore the matching frontend; never edit applied migrations.
create or replace function public.get_collection_content(p_collection_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'collection_item_id', i.id,
    'variant_id', i.variant_id::text,
    'origin', i.origin,
    'card_name_fr', card.name_fr,
    'local_id', card.local_id,
    'set_name_fr', card_set.name_fr,
    'set_abbreviation_fr', card_set.abbreviation_fr,
    'set_abbreviation', card_set.abbreviation,
    'series_name_fr', series.name_fr,
    'series_name_source', series.name_source,
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
  left join public.tcg_series series on series.id = card_set.series_id
  where c.id = p_collection_id;
$$;

commit;
