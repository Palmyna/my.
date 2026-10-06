begin;

-- Phase 7E.3.1: presentation metadata only. No matching, eligibility, data,
-- table, policy or permission change. CREATE OR REPLACE retains existing ACLs.
-- JSON signatures stay identical; strict consumers must be updated together.
-- Rollback: restore the 7E.1/6E.1 function bodies in a new migration together
-- with their old decoders. No stored data needs rollback; never edit history.

create or replace function public.search_global_navigation(p_query text)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  terms text[];
  numeric_terms text[];
  text_terms text[];
  result jsonb;
begin
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception using errcode = '42501', message = 'global_search_not_authorized';
  end if;
  if p_query is null or char_length(p_query) < 3 or char_length(p_query) > 200 then
    raise exception using errcode = '22023', message = 'global_search_invalid_query';
  end if;
  select array_agg(term order by first_seen) into terms from (
    select term, min(n) first_seen from regexp_split_to_table(
      private.catalog_search_normalize(p_query), '[^[:alnum:].:/♀♂-]+') with ordinality t(term, n)
    where term ~ '[[:alnum:]]' group by term
  ) unique_terms;
  if terms is null then
    raise exception using errcode = '22023', message = 'global_search_invalid_query';
  end if;
  numeric_terms := array(select term from unnest(terms) term where term ~ '^[0-9]+(/[0-9]+)?$');
  text_terms := array(select term from unnest(terms) term where term !~ '^[0-9]+(/[0-9]+)?$');

  -- Same eligibility as canonical_collection_variants / Catalogue 7D.1.
  -- EXISTS avoids multiplying source Cards by Versions or Pokemon relations.
  with eligible_cards as materialized (
    select c.id, c.set_id, c.tcgdex_id, c.name_fr, c.local_id, c.image_url
    from public.source_cards c join public.tcg_sets s on s.id = c.set_id
    where c.is_active and s.is_active and exists (
      select 1 from public.catalog_variants v where v.source_card_id = c.id
        and v.is_active and v.size = 'standard' and v.french_availability = 'confirmed'
    )
  ), pokemon_names as materialized (
    select p.*, private.catalog_search_normalize(p.name_fr) normalized_name
    from public.pokemon p where exists (
      select 1 from public.card_pokemon cp join eligible_cards c on c.id = cp.card_id
      where cp.pokemon_id = p.id
    )
  ), pokemon_page as (
    select jsonb_build_object('kind', 'pokemon', 'pokemon_id', id::text, 'name_fr', name_fr,
      'dex_number', dex_number, 'primary_type', primary_type, 'secondary_type', secondary_type) item,
      row_number() over (order by score desc, normalized_name collate "C", id) ordinal
    from (select p.*, private.navigation_name_score(normalized_name, terms) score from pokemon_names p) scored
    where score is not null order by ordinal limit 2
  ), set_names as materialized (
    select s.*, private.catalog_search_normalize(coalesce(nullif(s.name_fr, ''), s.name_source)) normalized_name
    from public.tcg_sets s where exists (select 1 from eligible_cards c where c.set_id = s.id)
  ), set_page as (
    select jsonb_build_object('kind', 'set', 'set_id', id::text, 'name_fr', name_fr,
      'name_source', name_source, 'abbreviation_fr', abbreviation_fr, 'abbreviation', abbreviation, 'logo_url', logo_url) item,
      row_number() over (order by score desc, normalized_name collate "C", id) ordinal
    from (select s.*, private.navigation_name_score(normalized_name, terms) score from set_names s) scored
    where score is not null order by ordinal limit 2
  ), collection_names as materialized (
    -- The unused progress projection is pruned by PostgreSQL. Identity and access
    -- remain owned by this security_invoker view and its underlying RLS.
    select collection_id, name, access, collection_type, target_type, target_name,
      target_primary_type, target_secondary_type, private.catalog_search_normalize(name) normalized_name
    from public.dashboard_collections
  ), collection_page as (
    select jsonb_build_object('kind', 'collection', 'collection_id', collection_id, 'name', name,
      'access', access, 'collection_type', collection_type, 'target_type', target_type,
      'target_name', target_name, 'target_primary_type', target_primary_type,
      'target_secondary_type', target_secondary_type) item,
      row_number() over (order by score desc, normalized_name collate "C", collection_id) ordinal
    from (select c.*, private.navigation_name_score(normalized_name, terms) score from collection_names c) scored
    where score is not null order by ordinal limit 2
  ), nominal_pages as materialized (
    select 1 category, item, ordinal from pokemon_page
    union all select 2, item, ordinal from set_page
    union all select 3, item, ordinal from collection_page
  ), raw_cards as materialized (
    select c.id, c.set_id, c.image_url, p.metadata pokemon, c.name_fr, c.local_id, s.name_fr set_name_fr,
      s.abbreviation_fr set_abbreviation_fr, s.abbreviation set_abbreviation,
      c.tcgdex_id, coalesce('tcgdex:' || c.tcgdex_id, k.entity_key) card_key, s.official_card_count,
      array[c.name_fr, c.local_id, s.name_fr, s.abbreviation_fr, s.abbreviation,
        coalesce('tcgdex:' || c.tcgdex_id, k.entity_key), c.tcgdex_id, s.tcgdex_id
      ] || coalesce(p.names, '{}'::text[]) raw_fields,
      array[120,100,90,85,85,80,80,80] || array_fill(110, array[coalesce(cardinality(p.names),0)]) weights
    from eligible_cards c join public.tcg_sets s on s.id = c.set_id
    left join lateral (
      select array_agg(p.name_fr order by p.dex_number, p.id) names,
        array_agg(p order by p.dex_number, p.id) metadata
      from public.card_pokemon cp join public.pokemon p on p.id = cp.pokemon_id where cp.card_id = c.id
    ) p on true
    left join lateral (
      select entity_key from private.catalog_entity_keys where source_card_id = c.id
      order by entity_key limit 1
    ) k on c.tcgdex_id is null
    -- Reject numeric non-candidates before constructing related-name fields.
    where cardinality(numeric_terms) = 0 or private.catalog_search_score('{}'::text[], '{}'::integer[],
      private.catalog_search_normalize(c.local_id), s.official_card_count, numeric_terms) is not null
  ), candidates as materialized (
    -- Phase 6C.2 necessary-condition preselection; score only surviving Cards.
    select raw_cards.*, case when cardinality(text_terms) > 0 then
      private.catalog_search_normalize(array_to_string(raw_fields, ' ')) else '' end haystack
    from raw_cards
  ), cards as materialized (
    select candidates.*, array(select private.catalog_search_normalize(f) from unnest(raw_fields) f) fields
    from candidates where not exists (
      select 1 from unnest(text_terms) term where strpos(haystack, term) = 0
    )
  ), scored_cards as materialized (
    select cards.*, private.catalog_search_score(fields, weights, fields[2], official_card_count, terms) score
    from cards
  ), selected_cards as materialized (
    -- Keep 7E.1 ranking/quota intact; enrich only the final <=10 source Cards.
    select scored_cards.*,
      row_number() over (order by score desc, fields[1] collate "C", fields[3] collate "C",
        fields[2] collate "C", coalesce(tcgdex_id, card_key) collate "C", id::text collate "C") ordinal
    from scored_cards where score is not null
    order by ordinal limit (select 10 - count(*) from nominal_pages)
  ), card_page as (
    select jsonb_build_object('kind', 'card', 'source_card_id', c.id::text, 'name_fr', c.name_fr,
      'local_id', c.local_id, 'set_name_fr', c.set_name_fr, 'set_abbreviation_fr', c.set_abbreviation_fr,
      'set_abbreviation', c.set_abbreviation,
      -- Exact get_catalog_card representation: source image, then the first
      -- non-NULL eligible Version image in canonical Extension order, then NULL.
      'image_url', coalesce(c.image_url, (
        select v.image_url from private.canonical_collection_variants('set', c.set_id) canonical
        join public.catalog_variants v on v.id = canonical.variant_id
        where v.source_card_id = c.id and v.image_url is not null
        order by canonical.automatic_rank limit 1
      )),
      'pokemon', coalesce((select jsonb_agg(jsonb_build_object(
        'pokemon_id', p.id::text, 'dex_number', p.dex_number, 'name_fr', p.name_fr,
        'primary_type', p.primary_type, 'secondary_type', p.secondary_type
      ) order by p.dex_number, p.id) from unnest(c.pokemon) p), '[]'::jsonb)) item,
      c.ordinal
    from selected_cards c
  ), pages as (
    select * from nominal_pages union all select 4, item, ordinal from card_page
  )
  select coalesce(jsonb_agg(item order by category, ordinal), '[]'::jsonb) into result from pages;
  return result;
end;
$$;

create or replace function public.get_variant_detail(p_variant_id bigint)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'variant_id', v.id::text,
    'source_card_id', card.id::text,
    'set_id', card_set.id::text,
    'pokemon', coalesce((select jsonb_agg(jsonb_build_object(
      'pokemon_id', p.id::text, 'dex_number', p.dex_number, 'name_fr', p.name_fr,
      'primary_type', p.primary_type, 'secondary_type', p.secondary_type
    ) order by p.dex_number, p.id) from public.card_pokemon mapping
      join public.pokemon p on p.id = mapping.pokemon_id where mapping.card_id = card.id), '[]'::jsonb),
    'image_url', coalesce(v.image_url, card.image_url),
    'card_name_fr', card.name_fr,
    'local_id', card.local_id,
    'rarity', card.rarity,
    'category', card.category,
    'set_name_fr', card_set.name_fr,
    'set_name_source', card_set.name_source,
    'set_abbreviation_fr', card_set.abbreviation_fr,
    'set_abbreviation', card_set.abbreviation,
    'series_name_fr', series.name_fr,
    'series_name_source', series.name_source,
    'variant_label', v.label,
    'variant_type', v.variant_type,
    'variant_subtype', v.subtype,
    'variant_size', v.size,
    'variant_foil', v.foil,
    'variant_stamps', v.stamp,
    'effective_release_date', v.effective_release_date,
    'date_origin', v.date_origin
  )
  from public.catalog_variants v
  join public.source_cards card on card.id = v.source_card_id
  join public.tcg_sets card_set on card_set.id = card.set_id
  join public.tcg_series series on series.id = card_set.series_id
  where v.id = p_variant_id;
$$;

commit;
