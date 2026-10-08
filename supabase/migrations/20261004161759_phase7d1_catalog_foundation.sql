begin;

-- Expand only: legacy writers may omit nullable species metadata.
alter table public.pokemon
  add column primary_type text,
  add column secondary_type text,
  add constraint pokemon_primary_type_check check (primary_type in ('normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy')),
  add constraint pokemon_secondary_type_check check (secondary_type in ('normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy')),
  add constraint pokemon_types_consistency_check check (
    secondary_type is null or (primary_type is not null and primary_type <> secondary_type)
  );

-- Reuse the exact canonical reader, including UTF-16 MY. card-key tie breakers.
-- Only card identity columns are readable; variant aliases, audits and corrections
-- stay closed. The private schema is not exposed by PostgREST. No write grant.
grant usage on schema private to authenticated;
grant select (entity_key, source_card_id) on private.catalog_entity_keys to authenticated;
create policy catalog_card_keys_read on private.catalog_entity_keys
  for select to authenticated using (
    source_card_id is not null and exists (
      select 1 from public.source_cards card where card.id = source_card_id
    )
  );
grant execute on function private.canonical_collection_variants(text, bigint),
  private.catalog_utf16_sort_key(text) to authenticated;

create function public.get_catalog_pokemon(p_pokemon_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  header jsonb;
  variants jsonb;
begin
  select jsonb_build_object('pokemon_id', p.id::text, 'dex_number', p.dex_number,
    'name_fr', p.name_fr, 'primary_type', p.primary_type, 'secondary_type', p.secondary_type)
  into header from public.pokemon p where p.id = p_pokemon_id;
  -- Check visibility before invoking the internal reader: invisible = nonexistent.
  if header is null then return null; end if;
  select jsonb_agg(jsonb_build_object(
    'source_card_id', card.id::text, 'variant_id', v.id::text,
    'image_url', coalesce(v.image_url, card.image_url), 'card_name_fr', card.name_fr,
    'set_id', s.id::text, 'set_name_fr', s.name_fr, 'set_name_source', s.name_source,
    'set_abbreviation_fr', s.abbreviation_fr, 'set_abbreviation', s.abbreviation,
    'local_id', card.local_id, 'variant_label', v.label, 'effective_release_date', v.effective_release_date
  ) order by canonical.automatic_rank) into variants
  from private.canonical_collection_variants('pokemon', p_pokemon_id) canonical
  join public.catalog_variants v on v.id = canonical.variant_id
  join public.source_cards card on card.id = v.source_card_id
  join public.tcg_sets s on s.id = card.set_id;
  if variants is null then return null; end if;
  return header || jsonb_build_object('variant_count', jsonb_array_length(variants), 'variants', variants);
end;
$$;

create function public.get_catalog_set(p_set_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  header jsonb;
  variants jsonb;
begin
  select jsonb_build_object('set_id', s.id::text, 'name_fr', s.name_fr, 'name_source', s.name_source,
    'abbreviation_fr', s.abbreviation_fr, 'abbreviation', s.abbreviation, 'release_date', s.release_date,
    'series', jsonb_build_object('series_id', series.id::text, 'name_fr', series.name_fr, 'name_source', series.name_source),
    'logo_url', s.logo_url, 'symbol_url', s.symbol_url)
  into header from public.tcg_sets s join public.tcg_series series on series.id = s.series_id where s.id = p_set_id;
  if header is null then return null; end if;
  select jsonb_agg(jsonb_build_object(
    'source_card_id', card.id::text, 'variant_id', v.id::text,
    'image_url', coalesce(v.image_url, card.image_url), 'card_name_fr', card.name_fr,
    'local_id', card.local_id, 'rarity', card.rarity, 'category', card.category,
    'variant_label', v.label, 'effective_release_date', v.effective_release_date,
    'pokemon', coalesce((select jsonb_agg(jsonb_build_object(
      'pokemon_id', p.id::text, 'dex_number', p.dex_number, 'name_fr', p.name_fr
    ) order by p.dex_number, p.id) from public.card_pokemon mapping
      join public.pokemon p on p.id = mapping.pokemon_id where mapping.card_id = card.id), '[]'::jsonb)
  ) order by canonical.automatic_rank) into variants
  from private.canonical_collection_variants('set', p_set_id) canonical
  join public.catalog_variants v on v.id = canonical.variant_id
  join public.source_cards card on card.id = v.source_card_id;
  if variants is null then return null; end if;
  return header || jsonb_build_object('variant_count', jsonb_array_length(variants), 'variants', variants);
end;
$$;

create function public.get_catalog_card(p_card_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  header jsonb;
  variants jsonb;
  card_set_id bigint;
  representative_image text;
begin
  select card.set_id, card.image_url, jsonb_build_object(
    'source_card_id', card.id::text, 'name_fr', card.name_fr, 'local_id', card.local_id,
    'rarity', card.rarity, 'category', card.category, 'effective_release_date', card.effective_release_date,
    'set', jsonb_build_object('set_id', s.id::text, 'name_fr', s.name_fr, 'name_source', s.name_source,
      'abbreviation_fr', s.abbreviation_fr, 'abbreviation', s.abbreviation),
    'series', jsonb_build_object('series_id', series.id::text, 'name_fr', series.name_fr, 'name_source', series.name_source),
    'pokemon', coalesce((select jsonb_agg(jsonb_build_object(
      'pokemon_id', p.id::text, 'dex_number', p.dex_number, 'name_fr', p.name_fr,
      'primary_type', p.primary_type, 'secondary_type', p.secondary_type
    ) order by p.dex_number, p.id) from public.card_pokemon mapping
      join public.pokemon p on p.id = mapping.pokemon_id where mapping.card_id = card.id), '[]'::jsonb)
  ) into card_set_id, representative_image, header
  from public.source_cards card join public.tcg_sets s on s.id = card.set_id
  join public.tcg_series series on series.id = s.series_id where card.id = p_card_id;
  if header is null then return null; end if;
  select jsonb_agg(jsonb_build_object('variant_id', v.id::text,
    'image_url', coalesce(v.image_url, representative_image), 'variant_label', v.label,
    'effective_release_date', v.effective_release_date) order by canonical.automatic_rank),
    coalesce(representative_image, (array_agg(v.image_url order by canonical.automatic_rank)
      filter (where v.image_url is not null))[1]) into variants, representative_image
  from private.canonical_collection_variants('set', card_set_id) canonical
  join public.catalog_variants v on v.id = canonical.variant_id where v.source_card_id = p_card_id;
  if variants is null then return null; end if;
  return header || jsonb_build_object('image_url', representative_image, 'variants', variants);
end;
$$;

revoke all on function public.get_catalog_pokemon(bigint), public.get_catalog_set(bigint),
  public.get_catalog_card(bigint) from public, anon, authenticated, service_role;
grant execute on function public.get_catalog_pokemon(bigint), public.get_catalog_set(bigint),
  public.get_catalog_card(bigint) to authenticated;

-- Rollback (new migration only): retire consumers first, drop these three RPCs,
-- revoke canonical/helper and card-key grants, drop this policy/schema USAGE.
-- Retain nullable type columns/data until their removal is separately authorized.
commit;
