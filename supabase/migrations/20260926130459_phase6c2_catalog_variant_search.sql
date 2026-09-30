begin;

-- Portable search semantics: scripts/catalog/search-catalog.ts. No extension/index.
-- NFKD plus the five Unicode combining-mark blocks covers French catalogue text.
create function private.catalog_search_normalize(value text)
returns text language sql immutable security invoker set search_path = ''
as $$
  select btrim(regexp_replace(translate(replace(replace(lower(regexp_replace(
    normalize(coalesce(value, ''), NFKD), U&'[\0300-\036f\1ab0-\1aff\1dc0-\1dff\20d0-\20ff\fe20-\fe2f]', '', 'g')),
    'œ', 'oe'), 'æ', 'ae'), '’‘‐‑‒–—−', '''''------'), '[[:space:]]+', ' ', 'g'));
$$;

create function private.catalog_search_score(fields text[], weights integer[], local_id text,
  official_count integer, terms text[])
returns integer language plpgsql immutable security invoker set search_path = ''
as $$
declare
  term text;
  value text;
  words text[];
  parts text[];
  wanted text;
  number_text text;
  denominator text;
  best integer;
  total integer := 0;
  bonus integer := 0;
  i integer;
begin
  foreach term in array terms loop
    best := 0;
    if term ~ '^[0-9]+(/[0-9]+)?$' then
      wanted := coalesce(nullif(ltrim(split_part(term, '/', 1), '0'), ''), '0');
      denominator := split_part(term, '/', 2);
      if denominator <> '' and (official_count is null or
        coalesce(nullif(ltrim(denominator, '0'), ''), '0') <> official_count::text) then
        return null;
      end if;
      parts := regexp_match(local_id, '^([a-z]*)([0-9]+)([a-z]*)$');
      if parts is null then return null; end if;
      number_text := coalesce(nullif(ltrim(parts[2], '0'), ''), '0');
      if number_text = wanted then
        best := case when parts[1] = '' and parts[3] = '' then 200 else 160 end;
      elsif denominator = '' and starts_with(number_text, wanted) then best := 80;
      end if;
    else
      for i in 1..cardinality(fields) loop
        value := fields[i];
        if value = '' then continue; end if;
        if value = term then best := greatest(best, weights[i]);
        else
          words := regexp_split_to_array(value, '[^[:alnum:]]+');
          if term = any(words) then best := greatest(best, 60);
          elsif starts_with(value, term) or exists (
            select 1 from unnest(words) word where starts_with(word, term)
          ) then best := greatest(best, 40);
          elsif strpos(value, term) > 0 then best := greatest(best, 15);
          end if;
        end if;
      end loop;
    end if;
    if best = 0 then return null; end if;
    total := total + best;
  end loop;
  for i in 1..cardinality(fields) loop
    if fields[i] = array_to_string(terms, ' ') then bonus := greatest(bonus, weights[i]); end if;
  end loop;
  return total + bonus;
end;
$$;

create function public.search_catalog_variants_for_add(
  p_query text, p_limit integer default 20, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  terms text[];
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

  with cards as materialized (
    select c.id, c.name_fr, c.local_id, c.image_url, s.name_fr set_name_fr,
      c.tcgdex_id, coalesce('tcgdex:' || c.tcgdex_id, k.entity_key) card_key,
      s.official_card_count,
      array(select private.catalog_search_normalize(f) from unnest(array[
        c.name_fr, c.local_id, s.name_fr, s.abbreviation_fr, s.abbreviation,
        coalesce('tcgdex:' || c.tcgdex_id, k.entity_key), c.tcgdex_id, s.tcgdex_id
      ] || coalesce(p.names, '{}'::text[])) f) fields,
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

revoke all on function private.catalog_search_normalize(text),
  private.catalog_search_score(text[],integer[],text,integer,text[]),
  public.search_catalog_variants_for_add(text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.search_catalog_variants_for_add(text,integer,integer) to authenticated;
comment on function public.search_catalog_variants_for_add(text,integer,integer) is
  '6C.2 exact eligible variants. Authenticated aal2 MY. profile required. Query 1..200 characters with useful terms; limit 1..100 default 20; offset >=0 default 0. Scalar JSONB array, decimal-text BIGINT, total server order. No collection filter or mutation. Definer only to read private MY. card selectors.';

-- Additive: old readers/writers and all data remain unchanged. Transaction rollback
-- is atomic. After removing consumers, a forward rollback migration can drop the
-- public RPC then these two private helpers; no data restoration is needed.
commit;
