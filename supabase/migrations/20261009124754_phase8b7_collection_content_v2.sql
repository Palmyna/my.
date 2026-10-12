begin;

-- One STABLE SQL statement: parent, legacy projection and owner possession share
-- the calling snapshot. Reuse the authoritative joins/order without changing v1.
create function public.get_collection_content_v2(p_collection_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'order_contract_version', c.order_contract_version,
    'personal_revision', c.personal_revision::text,
    'items', (
      select coalesce(jsonb_agg(item || jsonb_build_object('is_hidden', false)
        order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(public.get_collection_content(c.id))
        with ordinality as content(item, ordinal)
    )
  )
  from public.collections c
  where c.id = p_collection_id;
$$;

revoke all on function public.get_collection_content_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_collection_content_v2(uuid) to authenticated;
comment on function public.get_collection_content_v2(uuid) is
  'Complete snapshot for contracts 1/2; v1 fields/order/owner possession, exact revision, is_hidden=false until Phase 8C. Invisible parent returns SQL NULL. No replay or mutation.';

-- Rollback: withdraw consumers and close this RPC in an additive migration.
-- Preserve v1 readers, writers, guards, data, journal and receipts.
commit;
