-- Synthetic, dedicated IDs. Shared by pgTAP and the local HTTP regression.
-- No sequence reservations; no migration application or existing data changes.
insert into auth.users(id) values
  ('a1600000-0000-0000-0000-000000000001'),
  ('a1600000-0000-0000-0000-000000000002'),
  ('a1600000-0000-0000-0000-000000000003');
insert into public.tcg_series(id,name_fr) overriding system value values (-86001,'Série différente');
insert into public.tcg_sets(id,series_id,name_fr,abbreviation_fr) overriding system value values
  (-86001,-86001,'Extension précise','EXT'), (-86002,-86001,null,null);
insert into public.source_cards(id,set_id,name_fr,local_id,image_url,source_present,origin) overriding system value values
  (-86001,-86001,'Évoli fixture','TG01','https://example.invalid/source/high.webp',true,'tcgdex'),
  (-86002,-86002,null,null,null,false,'my');
insert into public.catalog_variants(id,source_card_id,variant_key,label,image_url,source_present,origin,is_active) overriding system value values
  (-86001,-86001,'normal','Normal',null,true,'tcgdex',true),
  (-86002,-86001,'holo','Holo','https://example.invalid/variant/original.png',true,'tcgdex',true),
  (-86003,-86001,'reverse','Reverse',null,true,'tcgdex',true),
  (-9007199254740995,-86001,'stamp','Holo Cosmos Stamp corrigé',null,false,'my',false),
  (-86005,-86002,'unknown',null,null,false,'my',false),
  (-86006,-86001,'outside','Normal hors collection',null,true,'tcgdex',true);
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_set_id,applied_target_version) values
  ('c1600000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000001','Contenu mixte','automatic','set',-86001,1),
  ('c1600000-0000-0000-0000-000000000002','a1600000-0000-0000-0000-000000000001','Vide','free',null,null,null),
  ('c1600000-0000-0000-0000-000000000003','a1600000-0000-0000-0000-000000000001','Volume','free',null,null,null);
-- Deliberately not inserted in display order. Automatic ranks also differ.
insert into public.collection_items(id,collection_id,variant_id,origin,sort_position,automatic_rank) values
  ('d1600000-0000-0000-0000-000000000002','c1600000-0000-0000-0000-000000000001',-86002,'manual',1,null),
  ('d1600000-0000-0000-0000-000000000001','c1600000-0000-0000-0000-000000000001',-86001,'automatic',1,2),
  ('d1600000-0000-0000-0000-000000000003','c1600000-0000-0000-0000-000000000001',-86003,'automatic',-2,1),
  ('d1600000-0000-0000-0000-000000000004','c1600000-0000-0000-0000-000000000001',-9007199254740995,'manual',1.00000000000000000001,null),
  ('d1600000-0000-0000-0000-000000000005','c1600000-0000-0000-0000-000000000001',-86005,'manual',3,null);
insert into public.physical_copies(user_id,variant_id) values
  ('a1600000-0000-0000-0000-000000000001',-86001),
  ('a1600000-0000-0000-0000-000000000001',-86001),
  ('a1600000-0000-0000-0000-000000000001',-9007199254740995),
  ('a1600000-0000-0000-0000-000000000001',-86006),
  ('a1600000-0000-0000-0000-000000000002',-86002),
  ('a1600000-0000-0000-0000-000000000003',-86003);
insert into public.collection_shares(collection_id,recipient_user_id) values
  ('c1600000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000002'),
  ('c1600000-0000-0000-0000-000000000003','a1600000-0000-0000-0000-000000000002');
-- 1005 lightweight variants on one source, no external catalogue or image fetch.
insert into public.catalog_variants(id,source_card_id,variant_key,label,source_present,origin) overriding system value
  select -86100-n,-86001,'volume-' || n,'Fixture ' || n,false,'my' from generate_series(1,1005) n;
insert into public.collection_items(id,collection_id,variant_id,origin,sort_position)
  select ('d1610000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
    'c1600000-0000-0000-0000-000000000003',-86100-n,'manual',n
  from generate_series(1,1005) n;
