begin;

-- Match model.ts compare(): lexicographic UTF-16 units, independent of DB collation.
-- PostgreSQL text stores Unicode code points; supplementary characters need two units.
create function private.catalog_utf16_sort_key(p_value text)
returns integer[]
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(unit.value order by character.position, unit.position), '{}'::integer[])
  from unnest(string_to_array(p_value, null)) with ordinality as character(value, position)
  cross join lateral unnest(
    case when ascii(character.value) < 65536 then array[ascii(character.value)]
    else array[
      55296 + (ascii(character.value) - 65536) / 1024,
      56320 + (ascii(character.value) - 65536) % 1024
    ] end
  ) with ordinality as unit(value, position);
$$;

create function private.canonical_collection_variants(p_target_type text, p_target_id bigint)
returns table (variant_id bigint, automatic_rank bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_target_type is null or p_target_type not in ('pokemon', 'set') then
    raise exception using errcode = '22023', message = 'Invalid automatic target type';
  end if;
  if p_target_id is null then
    raise exception using errcode = '22023', message = 'Automatic target ID is required';
  end if;
  if (p_target_type = 'pokemon' and not exists (
    select 1 from public.pokemon where id = p_target_id
  )) or (p_target_type = 'set' and not exists (
    select 1 from public.tcg_sets where id = p_target_id
  )) then
    raise exception using errcode = 'P0002', message = 'Automatic target does not exist';
  end if;

  -- Reuse the effective catalogue and persisted ranks produced by plan.ts/rankCards.
  -- source_present, Pokemon/series activity and card category are not eligibility filters.
  return query
  select variant.id, row_number() over (
    order by
      case when p_target_type = 'pokemon' then variant.effective_release_date end asc nulls last,
      card.normalized_number,
      variant.sort_order,
      private.catalog_utf16_sort_key(coalesce('tcgdex:' || card.tcgdex_id, (
        select alias.entity_key from private.catalog_entity_keys as alias
        where alias.source_card_id = card.id
      ))),
      private.catalog_utf16_sort_key(variant.variant_key)
  ) as rank
  from public.catalog_variants as variant
  join public.source_cards as card on card.id = variant.source_card_id
  join public.tcg_sets as card_set on card_set.id = card.set_id
  where variant.is_active
    and variant.size = 'standard'
    and variant.french_availability = 'confirmed'
    and card.is_active
    and card_set.is_active
    and (
      (p_target_type = 'set' and card.set_id = p_target_id)
      or (p_target_type = 'pokemon' and exists (
        select 1 from public.card_pokemon as mapping
        where mapping.card_id = card.id and mapping.pokemon_id = p_target_id
      ))
    )
  order by rank;
end;
$$;

revoke all on function private.catalog_utf16_sort_key(text) from public, anon, authenticated, service_role;
revoke all on function private.canonical_collection_variants(text, bigint) from public, anon, authenticated, service_role;

comment on function private.canonical_collection_variants(text, bigint) is
  'Internal read-only canonical collection structure, matching scripts/catalog/plan.ts; no API access. Existing empty target: zero rows; invalid arguments: 22023; missing target: P0002.';

commit;
