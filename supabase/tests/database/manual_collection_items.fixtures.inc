-- Dedicated fixtures for pgTAP and local concurrent sessions. Explicit IDs only.
insert into auth.users(id) values
  ('a1700000-0000-0000-0000-000000000001'),
  ('a1700000-0000-0000-0000-000000000002'),
  ('a1700000-0000-0000-0000-000000000003');
insert into public.tcg_series(id) overriding system value values(-87001);
insert into public.tcg_sets(id,series_id,is_active) overriding system value values
  (-87001,-87001,true),(-87002,-87001,false);
insert into public.source_cards(id,set_id,source_present,origin,is_active) overriding system value values
  (-87001,-87001,false,'my',true),(-87002,-87001,true,'tcgdex',false),(-87003,-87002,true,'tcgdex',true);
insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin,french_availability,is_active)
  overriding system value values
  (-87001,-87001,'automatic',false,'my','confirmed',true),
  (-87002,-87001,'manual',false,'my','confirmed',true),
  (-87003,-87001,'start',true,'tcgdex','confirmed',true),
  (-87004,-87001,'end',true,'tcgdex','confirmed',true),
  (-87005,-87001,'inactive',true,'tcgdex','confirmed',false),
  (-87006,-87001,'unknown',true,'tcgdex','unknown',true),
  (-87007,-87001,'unavailable',true,'tcgdex','unavailable',true),
  (-87008,-87002,'inactive-card',true,'tcgdex','confirmed',true),
  (-87009,-87003,'inactive-set',true,'tcgdex','confirmed',true),
  (9007199254740995,-87001,'lossless-local',false,'my','confirmed',true);
insert into public.automatic_target_states(id,target_type,set_id,generation_version,content_hash) overriding system value
  values(-87001,'set',-87001,7,repeat('a',64));
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_set_id,applied_target_version) values
  ('c1700000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000001','Manual auto','automatic','set',-87001,7),
  ('c1700000-0000-0000-0000-000000000002','a1700000-0000-0000-0000-000000000001','Manual free','free',null,null,null);
insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,sort_position) values
  ('d1700000-0000-0000-0000-000000000001','c1700000-0000-0000-0000-000000000001',-87001,'automatic',1,1),
  ('d1700000-0000-0000-0000-000000000002','c1700000-0000-0000-0000-000000000001',-87002,'manual',null,2);
insert into public.collection_shares(collection_id,recipient_user_id) values
  ('c1700000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000002');
insert into public.physical_copies(user_id,variant_id) values
  ('a1700000-0000-0000-0000-000000000001',-87002),
  ('a1700000-0000-0000-0000-000000000001',9007199254740995);
