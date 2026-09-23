-- Synthetic IDs shared by pgTAP and the future local multi-session test.
insert into auth.users(id) values
  ('a1500000-0000-0000-0000-000000000001'),
  ('a1500000-0000-0000-0000-000000000002'),
  ('a1500000-0000-0000-0000-000000000003');
insert into public.tcg_series(id) overriding system value values(-85001);
insert into public.tcg_sets(id,series_id) overriding system value values(-85001,-85001);
insert into public.source_cards(id,tcgdex_id,set_id,source_present,origin) overriding system value
  values(-85001,'reorder-fixture',-85001,true,'tcgdex');
insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin) overriding system value values
  (-85001,-85001,'a',true,'tcgdex'),(-85002,-85001,'b',true,'tcgdex'),(-85003,-85001,'c',true,'tcgdex');
insert into public.automatic_target_states(id,target_type,set_id,generation_version,content_hash) overriding system value
  values(-85001,'set',-85001,7,repeat('a',64));
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_set_id,applied_target_version) values
  ('c1500000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000001','Reorder auto','automatic','set',-85001,7),
  ('c1500000-0000-0000-0000-000000000002','a1500000-0000-0000-0000-000000000001','Reorder free','free',null,null,null);
insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,sort_position) values
  ('d1500000-0000-0000-0000-000000000001','c1500000-0000-0000-0000-000000000001',-85001,'automatic',1,1),
  ('d1500000-0000-0000-0000-000000000002','c1500000-0000-0000-0000-000000000001',-85002,'automatic',2,2),
  ('d1500000-0000-0000-0000-000000000003','c1500000-0000-0000-0000-000000000001',-85003,'manual',null,3),
  ('d1500000-0000-0000-0000-000000000004','c1500000-0000-0000-0000-000000000002',-85001,'manual',null,1);
insert into public.collection_shares(collection_id,recipient_user_id) values
  ('c1500000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000002');
