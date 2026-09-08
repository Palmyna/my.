begin;

alter table public.catalog_variants
  add column effective_release_date date,
  add column date_origin text not null default 'unknown',
  add constraint catalog_variants_date_origin_check
    check (date_origin in ('variant', 'card', 'product', 'set', 'override', 'unknown'));

-- The old card date has no persisted provenance. Preserve its value without claiming its origin.
-- The next catalogue sync resolves the real origin from the snapshot and Git overrides.
update public.catalog_variants as variant
set effective_release_date = card.effective_release_date
from public.source_cards as card
where card.id = variant.source_card_id
  and variant.effective_release_date is distinct from card.effective_release_date;

comment on column public.catalog_variants.effective_release_date is
  'Reliable variant release date, otherwise resolved card date, otherwise NULL. Not part of variant identity. Pokemon ordering uses this date; set ordering ignores it.';
comment on column public.catalog_variants.date_origin is
  'Actual origin of the effective date, preserved on card fallback. unknown also marks migrated historical dates whose exact origin was not persisted.';

commit;
