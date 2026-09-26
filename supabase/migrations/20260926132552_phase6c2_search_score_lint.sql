begin;

-- array_to_string(anyarray,text) is STABLE in PostgreSQL. Match its declared
-- volatility and let each integer FOR own its implicit loop index. Scoring,
-- security, signature and grants are unchanged; no persisted data is touched.
create or replace function private.catalog_search_score(fields text[], weights integer[], local_id text,
  official_count integer, terms text[])
returns integer language plpgsql stable security invoker set search_path = ''
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

commit;
