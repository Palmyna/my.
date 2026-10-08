-- Reserved synthetic IDs only. Used under pgTAP rollback and multi-session
-- setup/cleanup transactions; never convert an existing user collection.
insert into auth.users(id) values
  ('a2500000-0000-0000-0000-000000000001'),
  ('a2500000-0000-0000-0000-000000000002'),
  ('a2500000-0000-0000-0000-000000000003'),
  ('a2500000-0000-0000-0000-000000000004');
delete from public.profiles where id='a2500000-0000-0000-0000-000000000004';
insert into public.tcg_series(id) overriding system value values(-95001);
insert into public.tcg_sets(id,series_id,is_active) overriding system value values(-95001,-95001,true);
insert into public.source_cards(id,set_id,source_present,origin,is_active) overriding system value
  values(-95001,-95001,false,'my',true);
insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin,french_availability,is_active)
  overriding system value values
  (-95001,-95001,'a',false,'my','confirmed',true),
  (-95002,-95001,'b',false,'my','confirmed',true),
  (-95003,-95001,'c',false,'my','confirmed',true),
  (-95004,-95001,'d',false,'my','confirmed',true),
  (-95005,-95001,'e',false,'my','confirmed',true),
  (-95006,-95001,'f',false,'my','confirmed',true);
insert into public.automatic_target_states(id,target_type,set_id,generation_version,content_hash) overriding system value
  values(-95001,'set',-95001,7,repeat('a',64));
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_set_id,
  applied_target_version,order_contract_version,personal_revision) values
  ('c2500000-0000-0000-0000-000000000001','a2500000-0000-0000-0000-000000000001','V2 mixed','automatic','set',-95001,7,2,2),
  ('c2500000-0000-0000-0000-000000000002','a2500000-0000-0000-0000-000000000001','V2 free','free',null,null,null,2,1),
  ('c2500000-0000-0000-0000-000000000003','a2500000-0000-0000-0000-000000000001','V1 free','free',null,null,null,1,0);
insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,sort_position,introduced_revision) values
  ('d2500000-0000-0000-0000-000000000001','c2500000-0000-0000-0000-000000000001',-95001,'automatic',1,1,null),
  ('d2500000-0000-0000-0000-000000000002','c2500000-0000-0000-0000-000000000001',-95002,'manual',null,2,1),
  ('d2500000-0000-0000-0000-000000000003','c2500000-0000-0000-0000-000000000001',-95003,'automatic',2,3,null),
  ('d2500000-0000-0000-0000-000000000004','c2500000-0000-0000-0000-000000000001',-95004,'manual',null,4,2),
  ('d2500000-0000-0000-0000-000000000005','c2500000-0000-0000-0000-000000000001',-95005,'automatic',3,5,null),
  ('d2500000-0000-0000-0000-000000000006','c2500000-0000-0000-0000-000000000002',-95006,'manual',null,1,1);
insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,anchor_item_id,fallback_item_ids) values
  ('c2500000-0000-0000-0000-000000000001',1,'e2500000-0000-0000-0000-000000000001','d2500000-0000-0000-0000-000000000002','manual_add','before','d2500000-0000-0000-0000-000000000003',array['d2500000-0000-0000-0000-000000000005']::uuid[]),
  ('c2500000-0000-0000-0000-000000000001',2,'e2500000-0000-0000-0000-000000000002','d2500000-0000-0000-0000-000000000004','manual_add','before','d2500000-0000-0000-0000-000000000005','{}'),
  ('c2500000-0000-0000-0000-000000000002',1,'e2500000-0000-0000-0000-000000000003','d2500000-0000-0000-0000-000000000006','manual_add','end',null,'{}');
insert into public.collection_shares(collection_id,recipient_user_id) values
  ('c2500000-0000-0000-0000-000000000001','a2500000-0000-0000-0000-000000000002');
