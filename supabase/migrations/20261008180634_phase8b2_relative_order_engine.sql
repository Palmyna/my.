begin;

-- Pure projections, not storage or API contracts. Ranks/revisions stay BIGINT.
create type private.collection_order_canonical_entry as (
  variant_id bigint,
  automatic_rank bigint
);
create type private.collection_order_item_entry as (
  collection_id uuid,
  collection_item_id uuid,
  variant_id bigint,
  origin text,
  automatic_rank bigint,
  introduced_revision bigint,
  is_hidden boolean
);
revoke all on type private.collection_order_canonical_entry, private.collection_order_item_entry
  from public, anon, authenticated, service_role;

create function private.merge_collection_relative_order(
  p_collection_id uuid,
  p_canonical private.collection_order_canonical_entry[],
  p_items private.collection_order_item_entry[],
  p_intents private.collection_order_intents[]
)
returns jsonb
language plpgsql stable parallel safe security invoker set search_path = ''
as $$
declare
  canonical private.collection_order_canonical_entry;
  item private.collection_order_item_entry;
  intent private.collection_order_intents;
  previous_sequence bigint := 0;
  canonical_index bigint := 0;
  automatic_count bigint;
  reference_id uuid;
  subject_key text;
  anchor_key text;
  candidate_key text;
  insertion_index integer;
  resolution text;
  entry jsonb;
  entries jsonb := '{}'::jsonb;
  sequence_keys text[] := '{}'::text[];
  added jsonb := '[]'::jsonb;
  removed jsonb := '[]'::jsonb;
  converted jsonb := '[]'::jsonb;
  rank_changes jsonb := '[]'::jsonb;
  replay jsonb := '[]'::jsonb;
  final_order jsonb;
begin
  -- Explicitly reject malformed lists before FOREACH/array_position. Empty is valid.
  if p_collection_id is null or p_canonical is null or p_items is null or p_intents is null
    or coalesce(array_ndims(p_canonical), 1) <> 1 or coalesce(array_lower(p_canonical, 1), 1) <> 1
    or coalesce(array_ndims(p_items), 1) <> 1 or coalesce(array_lower(p_items, 1), 1) <> 1
    or coalesce(array_ndims(p_intents), 1) <> 1 or coalesce(array_lower(p_intents, 1), 1) <> 1 then
    raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'lists';
  end if;

  foreach canonical in array p_canonical loop
    canonical_index := canonical_index + 1;
    if canonical.variant_id is null or canonical.automatic_rank is distinct from canonical_index then
      raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'canonical_rank';
    end if;
  end loop;
  if (select count(distinct c.variant_id) from unnest(p_canonical) c) <> cardinality(p_canonical) then
    raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'canonical_variant_duplicate';
  end if;

  foreach item in array p_items loop
    if item.collection_id is distinct from p_collection_id or item.collection_item_id is null
      or item.variant_id is null or item.origin is null or item.origin not in ('manual', 'automatic')
      or item.is_hidden is null
      or (item.introduced_revision is not null and item.introduced_revision <= 0)
      or (item.origin = 'manual' and (item.automatic_rank is not null or item.introduced_revision is null or item.is_hidden))
      or (item.origin = 'automatic' and (item.automatic_rank is null or item.automatic_rank <= 0)) then
      raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'item';
    end if;
  end loop;
  if (select count(distinct i.collection_item_id) from unnest(p_items) i) <> cardinality(p_items)
    or (select count(distinct i.variant_id) from unnest(p_items) i) <> cardinality(p_items)
    or (select count(i.introduced_revision) <> count(distinct i.introduced_revision) from unnest(p_items) i) then
    raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'item_duplicate';
  end if;
  select count(*) into automatic_count from unnest(p_items) i where i.origin = 'automatic';
  if (select count(distinct i.automatic_rank) <> automatic_count
      or coalesce(max(i.automatic_rank), 0) <> automatic_count
      from unnest(p_items) i where i.origin = 'automatic') then
    raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'applied_ranks';
  end if;

  -- Validate the entire journal, including placements whose subjects disappeared.
  -- accepted_at never orders the journal; gaps in sequence are legitimate.
  foreach intent in array p_intents loop
    if intent.collection_id is distinct from p_collection_id or intent.sequence is null
      or intent.sequence <= previous_sequence or intent.operation_id is null or intent.subject_item_id is null
      or intent.accepted_at is null or intent.kind is null or intent.kind not in ('manual_add', 'move')
      or intent.destination is null or intent.destination not in ('before', 'end') then
      raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'chronology';
    end if;
    previous_sequence := intent.sequence;
    if (intent.destination = 'end' and (intent.anchor_item_id is not null or cardinality(intent.fallback_item_ids) <> 0))
      or (intent.destination = 'before' and (intent.anchor_item_id is null or intent.anchor_item_id = intent.subject_item_id))
      or not private.collection_order_fallback_is_valid(intent.fallback_item_ids, intent.subject_item_id, intent.anchor_item_id) then
      raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'destination';
    end if;

    select i.* into item from unnest(p_items) i where i.collection_item_id = intent.subject_item_id;
    if found and (
      (intent.kind = 'manual_add' and item.introduced_revision is distinct from intent.sequence)
      or (intent.kind = 'move' and item.introduced_revision is not null and item.introduced_revision >= intent.sequence)
    ) then
      raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'subject_lifecycle';
    end if;
    -- The journal can also reveal a later introduction of a currently absent subject.
    if intent.kind = 'move' and exists (select 1 from unnest(p_intents) initial
      where initial.subject_item_id = intent.subject_item_id and initial.kind = 'manual_add'
        and initial.sequence >= intent.sequence) then
      raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'subject_before_introduction';
    end if;
    foreach reference_id in array (array[intent.anchor_item_id] || intent.fallback_item_ids) loop
      if reference_id is not null and (
        exists (select 1 from unnest(p_items) i where i.collection_item_id = reference_id
          and i.introduced_revision >= intent.sequence)
        or exists (select 1 from unnest(p_intents) initial where initial.subject_item_id = reference_id
          and initial.kind = 'manual_add' and initial.sequence >= intent.sequence)
      ) then
        raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'reference_before_introduction';
      end if;
    end loop;
  end loop;
  if (select count(distinct i.operation_id) from unnest(p_intents) i) <> cardinality(p_intents)
    or exists (select 1 from unnest(p_intents) i where i.kind = 'manual_add'
      group by i.subject_item_id having count(*) <> 1) then
    raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'intent_duplicate';
  end if;
  foreach item in array p_items loop
    if item.introduced_revision is not null and not exists (
      select 1 from unnest(p_intents) i where i.subject_item_id = item.collection_item_id
        and i.kind = 'manual_add' and i.sequence = item.introduced_revision
    ) then
      raise exception using errcode = '22023', message = 'collection_order_input_invalid', detail = 'initial_manual_placement';
    end if;
  end loop;

  -- Reconstruct from the whole target canonical, never from materialized positions.
  foreach canonical in array p_canonical loop
    select i.* into item from unnest(p_items) i where i.variant_id = canonical.variant_id;
    entry := jsonb_build_object('collection_item_id', item.collection_item_id,
      'variant_id', canonical.variant_id::text, 'origin', 'automatic',
      'automatic_rank', canonical.automatic_rank::text,
      'is_hidden', case when item.origin = 'automatic' then item.is_hidden else false end);
    entries := entries || jsonb_build_object(canonical.variant_id::text, entry);
    sequence_keys := array_append(sequence_keys, canonical.variant_id::text);
    if item.collection_item_id is null then
      added := added || jsonb_build_array(entry - 'collection_item_id' - 'origin' - 'is_hidden');
    elsif item.origin = 'manual' then
      converted := converted || jsonb_build_array(entry - 'origin' - 'is_hidden');
    elsif item.automatic_rank <> canonical.automatic_rank then
      rank_changes := rank_changes || jsonb_build_array(jsonb_build_object(
        'collection_item_id', item.collection_item_id, 'variant_id', item.variant_id::text,
        'previous_rank', item.automatic_rank::text, 'next_rank', canonical.automatic_rank::text));
    end if;
  end loop;
  for item in select i.* from unnest(p_items) i
    where i.origin = 'manual' and not (entries ? i.variant_id::text)
    order by i.introduced_revision loop
    entry := jsonb_build_object('collection_item_id', item.collection_item_id,
      'variant_id', item.variant_id::text, 'origin', 'manual', 'automatic_rank', null, 'is_hidden', false);
    entries := entries || jsonb_build_object(item.variant_id::text, entry);
    sequence_keys := array_append(sequence_keys, item.variant_id::text);
  end loop;
  for item in select i.* from unnest(p_items) i
    where i.origin = 'automatic' and not (entries ? i.variant_id::text)
    order by i.automatic_rank loop
    removed := removed || jsonb_build_array(jsonb_build_object('collection_item_id', item.collection_item_id,
      'variant_id', item.variant_id::text, 'automatic_rank', item.automatic_rank::text));
  end loop;

  foreach intent in array p_intents loop
    select i.variant_id::text into subject_key from unnest(p_items) i
      where i.collection_item_id = intent.subject_item_id;
    anchor_key := null;
    resolution := 'subject_absent';
    if subject_key is not null and entries ? subject_key then
      resolution := 'end';
      if intent.destination = 'before' then
        select i.variant_id::text into candidate_key from unnest(p_items) i
          where i.collection_item_id = intent.anchor_item_id;
        if candidate_key is not null and entries ? candidate_key then
          anchor_key := candidate_key;
          resolution := 'anchor';
        else
          resolution := 'fallback_end';
          foreach reference_id in array intent.fallback_item_ids loop
            select i.variant_id::text into candidate_key from unnest(p_items) i
              where i.collection_item_id = reference_id;
            if candidate_key is not null and entries ? candidate_key then
              anchor_key := candidate_key;
              resolution := 'fallback';
              exit;
            end if;
          end loop;
        end if;
      end if;
      -- Only the designated subject is extracted. All other relative order survives.
      sequence_keys := array_remove(sequence_keys, subject_key);
      insertion_index := case when anchor_key is null then cardinality(sequence_keys) + 1
        else array_position(sequence_keys, anchor_key) end;
      sequence_keys := sequence_keys[1:insertion_index - 1] || array[subject_key]
        || sequence_keys[insertion_index:cardinality(sequence_keys)];
    end if;
    replay := replay || jsonb_build_array(jsonb_build_object('sequence', intent.sequence::text,
      'subject_item_id', intent.subject_item_id, 'resolution', resolution,
      'resolved_anchor_item_id', case when anchor_key is null then null
        else (entries -> anchor_key ->> 'collection_item_id')::uuid end));
  end loop;
  select coalesce(jsonb_agg(entries -> ordered.key order by ordered.position), '[]'::jsonb)
    into final_order from unnest(sequence_keys) with ordinality ordered(key, position);
  return jsonb_build_object('final_order', final_order, 'added', added, 'removed', removed,
    'converted', converted, 'rank_changes', rank_changes, 'replay', replay);
end;
$$;
revoke all on function private.merge_collection_relative_order(uuid,
  private.collection_order_canonical_entry[], private.collection_order_item_entry[], private.collection_order_intents[])
  from public, anon, authenticated, service_role;
comment on function private.merge_collection_relative_order(uuid,
  private.collection_order_canonical_entry[], private.collection_order_item_entry[], private.collection_order_intents[]) is
  'Phase 8B.2 pure FUSIONNER: ordered contiguous target ranks, unordered complete current items, strictly chronological 8B.1 intents. Rebuild canonical then replay every placement with immutable R1 UUID fallback. BIGINT JSON output uses decimal strings; new automatic IDs are NULL. No tables, writes, locks or UUID allocation. Invalid input: 22023/collection_order_input_invalid. Historical membership/context capture must be guaranteed by future writers. Internal only.';

-- Before commit: full rollback. After commit: leave unused pure objects installed;
-- any later removal requires checking callers. No data or contract version changes.
commit;
