begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
revoke create on schema public from public, anon, authenticated;

-- Supabase may grant API access by default. New MY. objects start closed.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create function private.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create table public.pokemon (
  id bigint generated always as identity primary key,
  dex_number integer not null unique check (dex_number > 0),
  name_fr text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tcg_series (
  id bigint generated always as identity primary key,
  tcgdex_id text unique,
  name_fr text,
  name_source text,
  sort_order bigint,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tcg_sets (
  id bigint generated always as identity primary key,
  tcgdex_id text unique,
  series_id bigint not null references public.tcg_series(id) on delete restrict,
  name_fr text,
  name_source text,
  abbreviation text,
  abbreviation_fr text,
  release_date date,
  official_card_count integer check (official_card_count >= 0),
  sort_order bigint,
  logo_url text,
  symbol_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.tcg_sets.release_date is 'French set release date, when reliably known.';

create table public.source_cards (
  id bigint generated always as identity primary key,
  tcgdex_id text unique,
  local_id text,
  set_id bigint not null references public.tcg_sets(id) on delete restrict,
  name_fr text,
  category text,
  rarity text,
  image_url text,
  normalized_number bigint,
  effective_release_date date,
  source_updated_at timestamptz,
  source_present boolean not null,
  is_active boolean not null default true,
  origin text not null check (origin in ('tcgdex', 'my')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.source_cards.normalized_number is
  'Numeric ordering key for the card number; normalization is defined in Phase 2, never lexical local_id sorting.';
comment on column public.source_cards.effective_release_date is
  'Full reliable card release date, otherwise French set date; MY. correction may override. Null remains unknown. Filled in Phase 2.';

create table public.catalog_variants (
  id bigint generated always as identity primary key,
  source_card_id bigint not null references public.source_cards(id) on delete restrict,
  source_variant_id text,
  variant_key text not null check (btrim(variant_key) <> ''),
  label text,
  variant_type text,
  subtype text,
  size text,
  stamp text,
  foil text,
  image_url text,
  french_availability text not null default 'unknown'
    check (french_availability in ('confirmed', 'unknown', 'unavailable')),
  sort_order bigint,
  origin text not null check (origin in ('tcgdex', 'my')),
  source_present boolean not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_card_id, variant_key),
  unique (source_card_id, source_variant_id)
);
comment on column public.catalog_variants.sort_order is
  'Stable intra-card variant order; the actual variant priority is deferred to Phase 2.';

create table public.card_pokemon (
  card_id bigint not null references public.source_cards(id) on delete restrict,
  pokemon_id bigint not null references public.pokemon(id) on delete restrict,
  primary key (card_id, pokemon_id)
);

create table public.automatic_target_states (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('pokemon', 'set')),
  pokemon_id bigint unique references public.pokemon(id) on delete restrict,
  set_id bigint unique references public.tcg_sets(id) on delete restrict,
  generation_version bigint not null check (generation_version > 0),
  content_hash text not null check (btrim(content_hash) <> ''),
  updated_at timestamptz not null default now(),
  constraint automatic_target_states_target_check check (
    (target_type = 'pokemon' and pokemon_id is not null and set_id is null)
    or (target_type = 'set' and set_id is not null and pokemon_id is null)
  )
);
comment on column public.automatic_target_states.content_hash is
  'Opaque nonempty pipeline hash; no algorithm or digest length imposed in Phase 1.';

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  public_id extensions.citext not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_public_id_format check (
    public_id::text collate "C" ~ '^MY-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-){3}[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'
  )
);

-- Trigger is called by PostgreSQL, never exposed as a signup/share RPC.
create function private.set_profile_public_id()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  token text := '';
  random_bytes bytea;
  byte_value integer;
begin
  if tg_op = 'UPDATE' then
    -- Compare text, not citext: even a case-only mutation must fail.
    if new.public_id::text is distinct from old.public_id::text then
      raise exception using errcode = '23514', message = 'public_id is immutable';
    end if;
    return new;
  end if;
  if new.public_id is not null then
    raise exception using errcode = '23514', message = 'public_id must be generated by MY.';
  end if;
  while length(token) < 20 loop
    random_bytes := extensions.gen_random_bytes(32);
    for i in 0..31 loop
      byte_value := get_byte(random_bytes, i);
      -- 248 = 31 * 8. Reject the tail to avoid modulo bias.
      if byte_value < 248 then
        token := token || substr(alphabet, (byte_value % 31) + 1, 1);
        exit when length(token) = 20;
      end if;
    end loop;
  end loop;
  new.public_id := 'MY-' || substr(token, 1, 5) || '-' || substr(token, 6, 5)
    || '-' || substr(token, 11, 5) || '-' || substr(token, 16, 5);
  -- The unique constraint arbitrates concurrent inserts. On the extraordinarily
  -- unlikely collision, the privileged profile creator retries the INSERT.
  return new;
end;
$$;
create trigger profiles_public_id before insert or update on public.profiles
  for each row execute function private.set_profile_public_id();

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  collection_type text not null check (collection_type in ('free', 'automatic')),
  automatic_target_type text check (automatic_target_type in ('pokemon', 'set')),
  target_pokemon_id bigint references public.pokemon(id) on delete restrict,
  target_set_id bigint references public.tcg_sets(id) on delete restrict,
  applied_target_version bigint check (applied_target_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_target_check check (
    (collection_type = 'free' and automatic_target_type is null
      and target_pokemon_id is null and target_set_id is null and applied_target_version is null)
    or (collection_type = 'automatic' and automatic_target_type is not null
      and applied_target_version is not null and (
        (automatic_target_type = 'pokemon' and target_pokemon_id is not null and target_set_id is null)
        or (automatic_target_type = 'set' and target_set_id is not null and target_pokemon_id is null)
      ))
  )
);

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  variant_id bigint not null references public.catalog_variants(id) on delete restrict,
  origin text not null check (origin in ('manual', 'automatic')),
  sort_position numeric(40, 20) not null,
  automatic_rank bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, variant_id),
  constraint collection_items_rank_check check (
    (origin = 'manual' and automatic_rank is null)
    or (origin = 'automatic' and automatic_rank is not null and automatic_rank > 0)
  ),
  constraint collection_items_position_finite check (sort_position <> 'NaN'::numeric)
);
comment on column public.collection_items.sort_position is
  'Exact fractional position. Insert at midpoint; rebalance a local range when precision runs out. Read ORDER BY sort_position, id.';

create table public.physical_copies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  variant_id bigint not null references public.catalog_variants(id) on delete restrict,
  condition text,
  is_graded boolean not null default false,
  grading_company text,
  grading_score text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint physical_copies_grading_check check (
    is_graded or (grading_company is null and grading_score is null)
  )
);

create table public.collection_shares (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (collection_id, recipient_user_id)
);

create function private.check_collection_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.collection_type is distinct from old.collection_type then
    raise exception using errcode = '23514', message = 'collection_type is immutable in V1';
  end if;
  -- Also protect the self-share invariant during privileged maintenance.
  if new.owner_id is distinct from old.owner_id and exists (
    select 1 from public.collection_shares s
    where s.collection_id = old.id and s.recipient_user_id = new.owner_id
  ) then
    raise exception using errcode = '23514', message = 'A collection cannot be shared with its owner';
  end if;
  return new;
end;
$$;
create trigger collections_check_update before update on public.collections
  for each row execute function private.check_collection_update();

create function private.check_collection_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.origin = 'automatic' and exists (
    select 1 from public.collections c
    where c.id = new.collection_id and c.collection_type = 'free'
  ) then
    raise exception using errcode = '23514', message = 'Free collections only contain manual items';
  end if;
  return new;
end;
$$;
create trigger collection_items_check_parent before insert or update on public.collection_items
  for each row execute function private.check_collection_item();

create function private.check_collection_share()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  collection_owner uuid;
begin
  -- Serialize against owner changes; the FK separately rejects missing parents.
  select c.owner_id into collection_owner from public.collections c
  where c.id = new.collection_id for share;
  if collection_owner = new.recipient_user_id then
    raise exception using errcode = '23514', message = 'A collection cannot be shared with its owner';
  end if;
  return new;
end;
$$;
create trigger collection_shares_check_recipient before insert or update on public.collection_shares
  for each row execute function private.check_collection_share();

-- Every FK has an index with the referencing columns at its left edge.
create index tcg_sets_series_idx on public.tcg_sets(series_id);
create index source_cards_set_number_idx on public.source_cards(set_id, normalized_number, id);
create index source_cards_local_id_idx on public.source_cards(local_id);
create index source_cards_release_number_idx on public.source_cards(effective_release_date, normalized_number, id);
create index card_pokemon_pokemon_idx on public.card_pokemon(pokemon_id, card_id);
create index collections_owner_idx on public.collections(owner_id);
create index collections_pokemon_idx on public.collections(target_pokemon_id) where target_pokemon_id is not null;
create index collections_set_idx on public.collections(target_set_id) where target_set_id is not null;
create index collection_items_variant_idx on public.collection_items(variant_id);
create index collection_items_order_idx on public.collection_items(collection_id, sort_position, id);
create index physical_copies_user_variant_idx on public.physical_copies(user_id, variant_id);
create index physical_copies_variant_idx on public.physical_copies(variant_id);
create index collection_shares_recipient_idx on public.collection_shares(recipient_user_id, collection_id);

-- Explicit RLS does not depend on the dashboard's Automatic RLS event trigger.
alter table public.pokemon enable row level security;
alter table public.tcg_series enable row level security;
alter table public.tcg_sets enable row level security;
alter table public.source_cards enable row level security;
alter table public.catalog_variants enable row level security;
alter table public.card_pokemon enable row level security;
alter table public.automatic_target_states enable row level security;
alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.physical_copies enable row level security;
alter table public.collection_shares enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['pokemon', 'tcg_series', 'tcg_sets', 'source_cards',
    'catalog_variants', 'automatic_target_states', 'profiles', 'collections', 'collection_items', 'physical_copies']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_updated_at', table_name);
  end loop;
end;
$$;
revoke all on all functions in schema private from public, anon, authenticated, service_role;

commit;
