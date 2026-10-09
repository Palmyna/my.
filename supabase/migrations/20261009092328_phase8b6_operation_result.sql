begin;

create function public.get_collection_operation_result(
  p_collection_id uuid, p_operation_id uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_version smallint;
  result jsonb;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  -- Serialize with structural writers, transfer and deletion. No catalogue
  -- dependency. A fresh statement after waiting rechecks current authorization.
  perform 1 from public.collections where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  select order_contract_version into contract_version
    from public.collections where id = p_collection_id and owner_id = caller_id;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if contract_version <> 2 then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;

  -- Return only the historical payload, without a live-subject/revision lookup
  -- or a kind-specific projection. Future hide/apply receipts use this same API.
  select r.result into result from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  return result;
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = '23514' and sqlerrm = 'order_contract_upgrade_required') then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$$;
revoke all on function public.get_collection_operation_result(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_collection_operation_result(uuid, uuid) to authenticated;
comment on function public.get_collection_operation_result(uuid, uuid) is
  'Current owner aal2/profile, contract 2 READ COMMITTED only. Parent lock and authorization reread; exact historical result or SQL NULL. No data mutation or catalogue lock. NULL never authorizes a new operation UUID for an uncertain request.';

-- Before commit: full rollback. After commit: revoke this additive RPC by a
-- future migration if needed; preserve all data, receipts, writers and guards.
commit;
