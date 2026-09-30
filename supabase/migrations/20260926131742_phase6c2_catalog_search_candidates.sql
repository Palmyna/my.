begin;

-- Measured baseline on 19,907 cards / 31,904 variants: 1.15-2.20 s/RPC.
-- Necessary-condition prefilter only: text matches must occur in the normalized
-- concatenation; numeric matching reuses the authoritative score helper. No false
-- negatives, ranking change, persistent projection, index or extra dependency.
-- Normalize individual fields and score only surviving candidates.
create or replace function public.search_catalog_variants_for_add(
  p_query text, p_limit integer default 20, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  terms text[];
  numeric_terms text[];
  text_terms text[];
  result jsonb;
begin
  -- Definer is necessary for the existing private MY. card selector. Never expose
  -- private tables/grants or accept a client identity. All catalogue reads below
  -- concern this authenticated catalogue, not personal collections.
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception using errcode = '42501', message = 'catalog_search_not_authorized';
  end if;
  if p_query is null or char_length(p_query) > 200 or p_limit is null
    or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'catalog_search_invalid_query';
  end if;
  select array_agg(term order by first_seen) into terms from (
    select term, min(n) first_seen from regexp_split_to_table(
      private.catalog_search_normalize(p_query), '[^[:alnum:].:/♀♂-]+') with ordinality t(term, n)
    where term ~ '[[:alnum:]]' group by term
  ) unique_terms;
  if terms is null then
    raise exception using errcode = '22023', message = 'catalog_search_invalid_query';
  end if;

  numeric_terms := array(select term from unnest(terms) term where term ~ '^[0-9]+(/[0-9]+)?$');
  text_terms := array(select term from unnest(terms) term where term !~ '^[0-9]+(/[0-9]+)?$');

  with raw_cards as materialized (
    select c.id, c.name_fr, c.local_id, c.image_url, s.name_fr set_name_fr,
      c.tcgdex_id, coalesce('tcgdex:' || c.tcgdex_id, k.entity_key) card_key,
      s.official_card_count,
      array[
        c.name_fr, c.local_id, s.name_fr, s.abbreviation_fr, s.abbreviation,
        coalesce('tcgdex:' || c.tcgdex_id, k.entity_key), c.tcgdex_id, s.tcgdex_id
      ] || coalesce(p.names, '{}'::text[]) raw_fields,
      array[120,100,90,85,85,80,80,80] || array_fill(110, array[coalesce(cardinality(p.names),0)]) weights
    from public.source_cards c join public.tcg_sets s on s.id = c.set_id
    left join lateral (
      select array_agg(p.name_fr order by p.dex_number) names
      from public.card_pokemon cp join public.pokemon p on p.id = cp.pokemon_id where cp.card_id = c.id
    ) p on true
    left join lateral (
      select entity_key from private.catalog_entity_keys where source_card_id = c.id
      order by entity_key limit 1
    ) k on c.tcgdex_id is null
    where c.is_active and s.is_active and exists (
      select 1 from public.catalog_variants v where v.source_card_id = c.id
        and v.is_active and v.french_availability = 'confirmed'
    )
  ), candidates as materialized (
    select raw_cards.*, case when cardinality(text_terms) > 0 then
      private.catalog_search_normalize(array_to_string(raw_fields, ' ')) else '' end haystack
    from raw_cards
    where cardinality(numeric_terms) = 0 or private.catalog_search_score('{}'::text[], '{}'::integer[],
      private.catalog_search_normalize(local_id), official_card_count, numeric_terms) is not null
  ), cards as materialized (
    select candidates.*, array(select private.catalog_search_normalize(f) from unnest(raw_fields) f) fields
    from candidates where not exists (
      select 1 from unnest(text_terms) term where strpos(haystack, term) = 0
    )
  ), scored as materialized (
    select cards.*, private.catalog_search_score(fields, weights, fields[2], official_card_count, terms) score
    from cards
  ), page as (
    select jsonb_build_object('variant_id', v.id::text,
      'image_url', coalesce(v.image_url, c.image_url), 'card_name_fr', c.name_fr,
      'set_name_fr', c.set_name_fr, 'local_id', c.local_id, 'variant_label', v.label) item,
      row_number() over (order by c.score desc, c.fields[1] collate "C", c.fields[3] collate "C",
        c.fields[2] collate "C", coalesce(c.tcgdex_id,c.card_key) collate "C", c.id::text collate "C",
        v.sort_order nulls last, v.variant_key collate "C", v.id) ordinal
    from scored c join public.catalog_variants v on v.source_card_id = c.id
    where c.score is not null and v.is_active and v.french_availability = 'confirmed'
    order by ordinal limit p_limit offset p_offset
  )
  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb) into result from page;
  return result;
end;
$$;

-- CREATE OR REPLACE preserves the exact grants/signature of the initial RPC.
-- Rollback: restore the previous RPC body in a forward migration; data unchanged.
commit;
