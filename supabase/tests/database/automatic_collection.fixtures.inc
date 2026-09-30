-- Shared by pgTAP (ROLLBACK) and the multi-connection test (scoped cleanup).
-- Explicit IDs do not reserve catalogue sequence values; no existing rows are changed.
insert into auth.users(id) values
  ('a1100000-0000-0000-0000-000000000001'),
  ('a1100000-0000-0000-0000-000000000002'),
  ('a1100000-0000-0000-0000-000000000003');
insert into public.pokemon(id, dex_number) overriding system value values
  (-82001, 982001), (-82002, 982002), (-82003, 982003);
insert into public.tcg_series(id) overriding system value values (-82001);
insert into public.tcg_sets(id, series_id) overriding system value values
  (-82001, -82001), (-82002, -82001), (-82003, -82001), (-82004, -82001);
insert into public.source_cards(id, tcgdex_id, set_id, normalized_number, category, source_present, origin)
  overriding system value values
  (-82001, 'automatic-rpc-pokemon', -82001, 2, 'Pokemon', true, 'tcgdex'),
  (-82002, 'automatic-rpc-trainer', -82001, 1, 'Trainer', true, 'tcgdex');
insert into public.catalog_variants(id, source_card_id, variant_key, sort_order, effective_release_date,
  size, french_availability, source_present, origin) overriding system value values
  (-82101, -82001, 'normal', 1, '2020-01-01', 'standard', 'confirmed', true, 'tcgdex'),
  (-9007199254740995, -82001, 'reverse', 2, '2021-01-01', 'standard', 'confirmed', true, 'tcgdex'),
  (-82103, -82002, 'normal', 1, '2019-01-01', 'standard', 'confirmed', true, 'tcgdex');
insert into public.card_pokemon(card_id, pokemon_id) values (-82001, -82001);
insert into public.automatic_target_states(id, target_type, pokemon_id, set_id, generation_version, content_hash)
  overriding system value values
  (-82001, 'pokemon', -82001, null, 7, encode(extensions.digest('["-82101","-9007199254740995"]', 'sha256'), 'hex')),
  (-82002, 'set', null, -82001, 13, encode(extensions.digest('["-82103","-82101","-9007199254740995"]', 'sha256'), 'hex')),
  (-82003, 'pokemon', -82003, null, 2, encode(extensions.digest('[]', 'sha256'), 'hex')),
  (-82004, 'set', null, -82002, 2, encode(extensions.digest('[]', 'sha256'), 'hex')),
  (-82005, 'set', null, -82004, 2, repeat('0', 64));
