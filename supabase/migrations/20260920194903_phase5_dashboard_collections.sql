begin;

-- Base-table RLS already exposes shared collections, their items and only the
-- relevant owner's copies. Use the caller's policies, including MFA/profile gates.
create view public.dashboard_collections with (security_invoker = true) as
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
  progress.total_count
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

revoke all on public.dashboard_collections from public, anon, authenticated, service_role;
grant select on public.dashboard_collections to authenticated;
comment on view public.dashboard_collections is
  'Read-only Dashboard summaries under caller RLS. Counts every item once; possession uses the collection owner, including for shared access. No persisted counters or display ordering.';

commit;
