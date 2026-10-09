-- Complements relative_order_writer.fixtures.inc; reserved synthetic identities.
insert into public.tcg_sets(id,series_id,is_active) overriding system value values(-95002,-95001,false),(-95003,-95001,true);
insert into public.source_cards(id,set_id,source_present,origin,is_active) overriding system value values
  (-95002,-95001,false,'my',false),(-95003,-95002,false,'my',true),(-95004,-95003,false,'my',true);
insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin,french_availability,is_active)
  overriding system value values
  (-95007,-95001,'g',false,'my','confirmed',true),
  (-95008,-95001,'h',false,'my','confirmed',true),
  (-95009,-95001,'i',false,'my','confirmed',true),
  (-95010,-95001,'j',false,'my','confirmed',true),
  (-95011,-95001,'inactive',false,'my','confirmed',false),
  (-95012,-95001,'unknown',false,'my','unknown',true),
  (-95013,-95001,'unavailable',false,'my','unavailable',true),
  (-95014,-95002,'inactive-card',false,'my','confirmed',true),
  (-95015,-95003,'inactive-set',false,'my','confirmed',true),
  (-95016,-95001,'k',false,'my','confirmed',true),
  (-95017,-95001,'l',false,'my','confirmed',true),
  (-95018,-95001,'m',false,'my','confirmed',true),
  (-95019,-95001,'n',false,'my','confirmed',true),
  (-95020,-95001,'o',false,'my','confirmed',true),
  (-95021,-95004,'outside-target',false,'my','confirmed',true),
  (9007199254740997,-95001,'exact-bigint',false,'my','confirmed',true);
insert into public.collections(id,owner_id,name,collection_type,order_contract_version) values
  ('c2500000-0000-0000-0000-000000000004','a2500000-0000-0000-0000-000000000001','V2 empty start','free',2),
  ('c2500000-0000-0000-0000-000000000005','a2500000-0000-0000-0000-000000000001','V2 empty end','free',2),
  ('c2500000-0000-0000-0000-000000000006','a2500000-0000-0000-0000-000000000003','V2 foreign','free',2);
