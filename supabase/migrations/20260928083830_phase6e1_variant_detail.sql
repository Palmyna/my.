begin;

-- Independent catalogue read. Existing readers/writers and stored data stay intact.
-- Invoker retains catalogue require_mfa / require_my_profile RLS; no user-data join.
-- Deploy before its new consumer. Rollback: remove that consumer, then DROP only
-- public.get_variant_detail(bigint) in a new migration; never edit applied history.
create or replace function public.get_variant_detail(p_variant_id bigint)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'variant_id', v.id::text,
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

revoke all on function public.get_variant_detail(bigint) from public, anon, authenticated, service_role;
grant execute on function public.get_variant_detail(bigint) to authenticated;

commit;
