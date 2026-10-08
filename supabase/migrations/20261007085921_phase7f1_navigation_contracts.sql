begin;

-- Navigation IDs only: preserve selection, order, possession, joins and caller RLS.
-- CREATE OR REPLACE retains ownership and grants; no user data is written.
-- Coordinate this 13 -> 15 key JSON contract with the strict frontend decoder.
-- Rollback: restore the 6D.1 function and matching decoder in a new migration.
-- Keep the additive view column on frontend rollback; removing it would require
-- a separate view/dependency migration. Never edit applied historical migrations.
create or replace function public.get_collection_content(p_collection_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'collection_item_id', i.id,
    'variant_id', i.variant_id::text,
    'source_card_id', card.id::text,
    'set_id', card_set.id::text,
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

-- Append target_id after every historical column. No new reads, counters,
-- colour storage, grants or policies; owner-based live progress stays identical.
create or replace view public.dashboard_collections with (security_invoker = true) as
select collection.id as collection_id,
  collection.name,
  collection.collection_type,
  case when collection.owner_id = (select auth.uid()) then 'owned'::text else 'shared'::text end as access,
  collection.automatic_target_type as target_type,
  case collection.automatic_target_type
    when 'pokemon' then pokemon.name_fr
    when 'set' then target_set.name_fr
    else null::text
  end as target_name,
  progress.owned_count,
  progress.total_count,
  case when collection.automatic_target_type = 'pokemon' then pokemon.primary_type else null::text end as target_primary_type,
  case when collection.automatic_target_type = 'pokemon' then pokemon.secondary_type else null::text end as target_secondary_type,
  case collection.automatic_target_type
    when 'pokemon' then collection.target_pokemon_id::text
    when 'set' then collection.target_set_id::text
    else null::text
  end as target_id
from public.collections as collection
left join public.pokemon as pokemon on pokemon.id = collection.target_pokemon_id
left join public.tcg_sets as target_set on target_set.id = collection.target_set_id
cross join lateral (
  select count(*) as total_count,
    count(*) filter (where exists (
      select 1 from public.physical_copies as copy
      where copy.user_id = collection.owner_id and copy.variant_id = item.variant_id
    )) as owned_count
  from public.collection_items as item
  where item.collection_id = collection.id
) as progress;

commit;
