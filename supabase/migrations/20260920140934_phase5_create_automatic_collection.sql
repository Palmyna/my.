begin;

create function public.create_automatic_collection(p_name text, p_target_type text, p_target_id bigint)
returns table (collection_id uuid, created boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_version bigint;
  target_hash text;
  structure_hash text;
  variant_ids bigint[];
begin
  -- Definer bypasses RLS: identity, MFA and profile checks must be explicit.
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception using errcode = '42501', message = 'Authenticated aal2 session required';
  end if;
  if not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'MY. profile required';
  end if;
  if p_target_type is null or p_target_type not in ('pokemon', 'set') then
    raise exception using errcode = '22023', message = 'Invalid automatic target type';
  end if;
  if p_target_id is null then
    raise exception using errcode = '22023', message = 'Automatic target ID is required';
  end if;

  -- Same key as the catalogue writer's exclusive lock. Held through transaction end.
  -- This precedes every target/state/structure read and allows concurrent creators.
  perform pg_catalog.pg_advisory_xact_lock_shared(771402);
  loop
    select existing.id into collection_id
    from public.collections as existing
    where existing.owner_id = caller_id and existing.collection_type = 'automatic'
      and existing.automatic_target_type = p_target_type
      and ((p_target_type = 'pokemon' and existing.target_pokemon_id = p_target_id)
        or (p_target_type = 'set' and existing.target_set_id = p_target_id))
    for key share;
    if found then
      created := false;
      return next;
      return;
    end if;

    if (p_target_type = 'pokemon' and not exists (select 1 from public.pokemon where id = p_target_id))
      or (p_target_type = 'set' and not exists (select 1 from public.tcg_sets where id = p_target_id)) then
      raise exception using errcode = 'P0002', message = 'Automatic target does not exist';
    end if;
    select state.generation_version, state.content_hash into target_version, target_hash
    from public.automatic_target_states as state
    where state.target_type = p_target_type
      and ((p_target_type = 'pokemon' and state.pokemon_id = p_target_id)
        or (p_target_type = 'set' and state.set_id = p_target_id));
    if not found then
      raise exception using errcode = 'P0002', message = 'automatic_target_state_missing';
    end if;

    -- Materialize once: the verified ordered IDs are exactly those inserted below.
    -- Compact JSON of decimal strings, including bigint IDs beyond JS safe integers.
    select coalesce(array_agg(canonical.variant_id order by canonical.automatic_rank), '{}'::bigint[]),
      encode(extensions.digest(convert_to('[' || coalesce(string_agg(
        to_json(canonical.variant_id::text)::text, ',' order by canonical.automatic_rank), '') || ']', 'UTF8'), 'sha256'), 'hex')
    into variant_ids, structure_hash
    from private.canonical_collection_variants(p_target_type, p_target_id) as canonical;
    if structure_hash is distinct from target_hash then
      raise exception using errcode = '23514', message = 'automatic_target_hash_mismatch';
    end if;
    if cardinality(variant_ids) = 0 then
      raise exception using errcode = '23514', message = 'automatic_collection_empty';
    end if;

    -- The existing name CHECK/NOT NULL is authoritative; store the supplied name unchanged.
    insert into public.collections as inserted (owner_id, name, collection_type,
      automatic_target_type, target_pokemon_id, target_set_id, applied_target_version)
    values (caller_id, p_name, 'automatic', p_target_type,
      case when p_target_type = 'pokemon' then p_target_id end,
      case when p_target_type = 'set' then p_target_id end, target_version)
    on conflict do nothing
    returning inserted.id into collection_id;
    if found then
      insert into public.collection_items(collection_id, variant_id, origin, automatic_rank, sort_position)
      select collection_id, item.variant_id, 'automatic', item.rank, item.rank::numeric(40,20)
      from unnest(variant_ids) with ordinality as item(variant_id, rank);
      created := true;
      return next;
      return;
    end if;
    -- A unique index resolved a race. A separate statement sees the committed winner
    -- at READ COMMITTED; retry also handles a winner deleted before this next lookup.
  end loop;
end;
$$;

revoke all on function public.create_automatic_collection(text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.create_automatic_collection(text, text, bigint) to authenticated;
comment on function public.create_automatic_collection(text, text, bigint) is
  'Create or retrieve the caller''s automatic collection. Requires aal2 and a MY. profile; checks canonical state/hash under the shared catalogue lock. Returns collection_id and created, with no direct write grants.';

commit;
