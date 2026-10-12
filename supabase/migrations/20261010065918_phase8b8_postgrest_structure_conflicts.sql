begin;

-- PostgREST 14.5/Hasql retries 40001 internally, although a stale business
-- revision cannot succeed on retry. Render a definitive HTTP 409 with the same
-- application code/message; direct SQL retains its documented SQLSTATE 40001.
create function private.raise_collection_structure_conflict()
returns void language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if nullif(current_setting('request.method', true), '') is not null then
    raise sqlstate 'PGRST' using
      message = '{"code":"40001","message":"collection_structure_conflict","details":null,"hint":null}',
      detail = '{"status":409,"headers":{}}';
  end if;
  raise exception using errcode = '40001', message = 'collection_structure_conflict';
end;
$$;
revoke all on function private.raise_collection_structure_conflict() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reorder_collection_item_v2(p_collection_id uuid, p_item_id uuid, p_placement text, p_anchor_id uuid, p_expected_revision bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := auth.uid();
  contract_version smallint;
  revision bigint;
  request_hash text;
  receipt private.collection_operation_receipts;
  result jsonb;
  current_ids uuid[];
  remaining_ids uuid[];
  final_ids uuid[];
  insertion_index integer;
  normalized_anchor uuid;
  fallback_ids uuid[];
  lower_position numeric;
  upper_position numeric;
  candidate numeric;
  has_ties boolean;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  -- Same parent lock as all legacy writers. Recheck authoritative ownership/mode
  -- and revision in a fresh READ COMMITTED statement after any lock wait.
  perform 1 from public.collections
    where id = p_collection_id and owner_id = caller_id for update;
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
  if p_item_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_placement is null or p_placement not in ('start', 'end', 'before', 'after')
    or (p_placement in ('start', 'end') and p_anchor_id is not null)
    or (p_placement in ('before', 'after') and (p_anchor_id is null or p_anchor_id = p_item_id)) then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;

  -- Versioned canonical tuple of validated request parameters, NOT the mutable
  -- normalized destination. UUIDs/native BIGINT casts have one canonical spelling.
  request_hash := encode(sha256(convert_to(jsonb_build_array(
    'reorder_collection_item_v2', p_collection_id, p_item_id, p_placement,
    p_anchor_id, p_expected_revision::text
  )::text, 'UTF8')), 'hex');
  select r.* into receipt from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  if found then
    if receipt.kind <> 'move' or receipt.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'operation_id_conflict';
    end if;
    return receipt.result;
  end if;
  if p_expected_revision <> revision then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  select coalesce(array_agg(id order by sort_position, id), '{}'::uuid[]),
    count(*) <> count(distinct sort_position)
  into current_ids, has_ties from public.collection_items where collection_id = p_collection_id;
  if not (p_item_id = any(current_ids))
    or (p_anchor_id is not null and not (p_anchor_id = any(current_ids))) then
    raise exception using errcode = 'P0002', message = 'collection_item_unavailable';
  end if;
  remaining_ids := array_remove(current_ids, p_item_id);
  insertion_index := case p_placement
    when 'start' then 1
    when 'end' then cardinality(remaining_ids) + 1
    when 'before' then array_position(remaining_ids, p_anchor_id)
    when 'after' then array_position(remaining_ids, p_anchor_id) + 1 end;
  normalized_anchor := remaining_ids[insertion_index];
  final_ids := remaining_ids[1:insertion_index - 1] || array[p_item_id]
    || remaining_ids[insertion_index:cardinality(remaining_ids)];

  -- R4: permutation equality, including ties, never creates a new gesture.
  -- A noop leaves numeric positions untouched and still gets a durable receipt.
  if final_ids <> current_ids then
    -- R1: original complete pre-move suffix strictly after normalized anchor.
    -- Subject excluded, every other automatic/manual item retained in order.
    fallback_ids := case when normalized_anchor is null then '{}'::uuid[] else
      array_remove(current_ids[array_position(current_ids, normalized_anchor) + 1:cardinality(current_ids)], p_item_id) end;

    -- Exact NUMERIC midpoint/rebalance algorithm from the legacy reorder.
    select sort_position into lower_position from public.collection_items
      where id = final_ids[insertion_index - 1] and collection_id = p_collection_id;
    select sort_position into upper_position from public.collection_items
      where id = final_ids[insertion_index + 1] and collection_id = p_collection_id;
    candidate := case
      when lower_position is null and upper_position is null then 1
      when lower_position is null then upper_position - 1
      when upper_position is null then lower_position + 1
      else round((lower_position + upper_position) / 2, 20) end;
    if not has_ties and abs(candidate) < 100000000000000000000
      and (lower_position is null or candidate > lower_position)
      and (upper_position is null or candidate < upper_position) then
      update public.collection_items set sort_position = candidate
        where id = p_item_id and collection_id = p_collection_id;
    else
      update public.collection_items as item set sort_position = ordered.rank::numeric(40,20)
      from unnest(final_ids) with ordinality as ordered(id, rank)
      where item.id = ordered.id and item.collection_id = p_collection_id
        and item.sort_position is distinct from ordered.rank::numeric(40,20);
    end if;
    revision := revision + 1;
    update public.collections set personal_revision = revision where id = p_collection_id;
    insert into private.collection_order_intents(
      collection_id, sequence, operation_id, subject_item_id, kind, destination, anchor_item_id, fallback_item_ids
    ) values (
      p_collection_id, revision, p_operation_id, p_item_id, 'move',
      case when normalized_anchor is null then 'end' else 'before' end, normalized_anchor, fallback_ids
    );
  end if;
  result := jsonb_build_object(
    'operation_id', p_operation_id,
    'outcome', case when final_ids = current_ids then 'noop' else 'changed' end,
    'personal_revision', revision::text,
    'collection_item_id', p_item_id
  );
  insert into private.collection_operation_receipts(
    collection_id, operation_id, kind, request_hash, accepted_revision, result
  ) values (p_collection_id, p_operation_id, 'move', request_hash, revision, result);
  return result;
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    perform private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'collection_item_unavailable')
      or (sqlstate = '23505' and sqlerrm = 'operation_id_conflict')
      or (sqlstate = '23514' and sqlerrm = 'order_contract_upgrade_required') then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_manual_collection_item_v2(p_collection_id uuid, p_variant_id bigint, p_placement text, p_expected_revision bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := auth.uid();
  contract_version smallint;
  revision bigint;
  request_hash text;
  receipt private.collection_operation_receipts;
  result jsonb;
  item_id uuid;
  current_ids uuid[];
  normalized_anchor uuid;
  fallback_ids uuid[];
  first_position numeric;
  last_position numeric;
  candidate numeric;
  has_ties boolean;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  -- Catalogue -> parent -> items -> private writes, never the reverse.
  -- Shared lock held through commit prevents eligibility from a partial sync.
  perform pg_catalog.pg_advisory_xact_lock_shared(771402);
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
  if p_variant_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_placement is null or p_placement not in ('start', 'end') then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;

  -- Same versioned canonical tuple and receipt store as reorder v2. Include the
  -- exact BIGINT request, never the destination normalized from mutable state.
  request_hash := encode(sha256(convert_to(jsonb_build_array(
    'add_manual_collection_item_v2', p_collection_id, p_variant_id::text,
    p_placement, p_expected_revision::text
  )::text, 'UTF8')), 'hex');
  select r.* into receipt from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  if found then
    if receipt.kind <> 'add' or receipt.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'operation_id_conflict';
    end if;
    return receipt.result;
  end if;
  if p_expected_revision <> revision then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;
  if exists (select 1 from public.collection_items where collection_id = p_collection_id and variant_id = p_variant_id) then
    raise exception using errcode = '23505', message = 'already_present';
  end if;
  -- Exactly the legacy eligibility predicates: no target/canonical restriction.
  if not exists (
    select 1 from public.catalog_variants v
    join public.source_cards card on card.id = v.source_card_id
    join public.tcg_sets card_set on card_set.id = card.set_id
    where v.id = p_variant_id and v.is_active and v.french_availability = 'confirmed'
      and card.is_active and card_set.is_active
  ) then
    raise exception using errcode = 'P0002', message = 'manual_variant_unavailable';
  end if;

  select coalesce(array_agg(id order by sort_position, id), '{}'::uuid[]),
    min(sort_position), max(sort_position), count(*) <> count(distinct sort_position)
  into current_ids, first_position, last_position, has_ties
  from public.collection_items where collection_id = p_collection_id;
  normalized_anchor := case when p_placement = 'start' then current_ids[1] else null end;
  fallback_ids := case when normalized_anchor is null then '{}'::uuid[]
    else current_ids[2:cardinality(current_ids)] end;
  -- Exact legacy NUMERIC allocation. Rebalance only on ties/overflow, keeping
  -- the complete pre-add permutation and changing no origin or canonical rank.
  candidate := case when cardinality(current_ids) = 0 then 1
    when p_placement = 'start' then first_position - 1 else last_position + 1 end;
  if has_ties or abs(candidate) >= 100000000000000000000 then
    update public.collection_items item set sort_position = ordered.rank::numeric(40,20)
    from unnest(current_ids) with ordinality as ordered(id, rank)
    where item.id = ordered.id and item.collection_id = p_collection_id
      and item.sort_position is distinct from ordered.rank::numeric(40,20);
    candidate := case when p_placement = 'start' then 0 else cardinality(current_ids) + 1 end;
  end if;
  revision := revision + 1;
  insert into public.collection_items(collection_id, variant_id, origin, automatic_rank, sort_position, introduced_revision)
  values (p_collection_id, p_variant_id, 'manual', null, candidate, revision)
  on conflict (collection_id, variant_id) do nothing returning id into item_id;
  if not found then
    raise exception using errcode = '23505', message = 'already_present';
  end if;
  update public.collections set personal_revision = revision where id = p_collection_id;
  insert into private.collection_order_intents(
    collection_id, sequence, operation_id, subject_item_id, kind, destination, anchor_item_id, fallback_item_ids
  ) values (
    p_collection_id, revision, p_operation_id, item_id, 'manual_add',
    case when normalized_anchor is null then 'end' else 'before' end, normalized_anchor, fallback_ids
  );
  result := jsonb_build_object(
    'operation_id', p_operation_id, 'outcome', 'changed',
    'personal_revision', revision::text, 'collection_item_id', item_id
  );
  insert into private.collection_operation_receipts(
    collection_id, operation_id, kind, request_hash, accepted_revision, result
  ) values (p_collection_id, p_operation_id, 'add', request_hash, revision, result);
  return result;
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    perform private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'manual_variant_unavailable')
      or (sqlstate = '23505' and sqlerrm in ('already_present', 'operation_id_conflict'))
      or (sqlstate = '23514' and sqlerrm = 'order_contract_upgrade_required') then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_manual_collection_item_v2(p_collection_id uuid, p_collection_item_id uuid, p_expected_revision bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    perform private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'collection_item_unavailable')
      or (sqlstate = '23505' and sqlerrm = 'operation_id_conflict')
      or (sqlstate = '23514' and sqlerrm in ('order_contract_upgrade_required', 'automatic_item_removal_forbidden')) then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$function$;

commit;
