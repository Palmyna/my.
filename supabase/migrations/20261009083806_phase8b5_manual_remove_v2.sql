begin;

create function public.remove_manual_collection_item_v2(
  p_collection_id uuid, p_collection_item_id uuid,
  p_expected_revision bigint, p_operation_id uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_version smallint;
  revision bigint;
  item_origin text;
  request_hash text;
  receipt private.collection_operation_receipts;
  result jsonb;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  -- No catalogue dependency. Serialize with all structural writers and parent
  -- deletion, then reread current ownership/mode/revision after any lock wait.
  perform 1 from public.collections where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  select order_contract_version, personal_revision into contract_version, revision
    from public.collections where id = p_collection_id and owner_id = caller_id;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if contract_version <> 2 then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
  end if;
  if p_collection_item_id is null or p_operation_id is null
    or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;

  -- Same canonical versioned request tuple as the other v2 writers. Historical
  -- retries precede revision/presence checks: the removed identity stays absent.
  request_hash := encode(sha256(convert_to(jsonb_build_array(
    'remove_manual_collection_item_v2', p_collection_id,
    p_collection_item_id, p_expected_revision::text
  )::text, 'UTF8')), 'hex');
  select r.* into receipt from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  if found then
    if receipt.kind <> 'remove' or receipt.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'operation_id_conflict';
    end if;
    return receipt.result;
  end if;
  if p_expected_revision <> revision then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;
  select origin into item_origin from public.collection_items
    where id = p_collection_item_id and collection_id = p_collection_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'collection_item_unavailable';
  end if;
  if item_origin <> 'manual' then
    raise exception using errcode = '23514', message = 'automatic_item_removal_forbidden';
  end if;

  -- R3: subject FK cascades every own placement, including manual_add. Other
  -- subjects' immutable historical UUIDs have no FK; receipts belong to parent.
  -- No position compaction, catalogue access, or physical-copy mutation.
  delete from public.collection_items
    where id = p_collection_item_id and collection_id = p_collection_id and origin = 'manual';
  revision := revision + 1;
  update public.collections set personal_revision = revision where id = p_collection_id;
  result := jsonb_build_object(
    'operation_id', p_operation_id, 'outcome', 'changed',
    'personal_revision', revision::text, 'collection_item_id', p_collection_item_id
  );
  insert into private.collection_operation_receipts(
    collection_id, operation_id, kind, request_hash, accepted_revision, result
  ) values (p_collection_id, p_operation_id, 'remove', request_hash, revision, result);
  return result;
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'collection_item_unavailable')
      or (sqlstate = '23505' and sqlerrm = 'operation_id_conflict')
      or (sqlstate = '23514' and sqlerrm in ('order_contract_upgrade_required', 'automatic_item_removal_forbidden')) then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$$;
revoke all on function public.remove_manual_collection_item_v2(uuid, uuid, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_manual_collection_item_v2(uuid, uuid, bigint, uuid) to authenticated;
comment on function public.remove_manual_collection_item_v2(uuid, uuid, bigint, uuid) is
  'Owner aal2/profile, contract 2 READ COMMITTED only. Parent lock, manual subject deletion with own-intent cascade, unchanged historical R1/other positions/copies, atomic revision and idempotency receipt. Retry requires current owner and identical parameters.';
comment on table private.collection_operation_receipts is
  'Collection-scoped atomic v2 reorder/add/remove idempotency receipts retained until parent deletion; retry requires current owner and identical canonical parameters, including after subject deletion.';

-- Before commit: full rollback. After commit: close this RPC by a future
-- additive migration if needed; retain data, receipts and all legacy guards.
-- No contract activation, tombstone, backfill, or change to prior writers.
commit;
