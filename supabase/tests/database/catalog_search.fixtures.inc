-- Shared by pgTAP and the actual local HTTP/service proof. Explicit IDs only.
insert into auth.users(id) values ('a1800000-0000-0000-0000-000000000001'), ('a1800000-0000-0000-0000-000000000002');
delete from public.profiles where id='a1800000-0000-0000-0000-000000000002';
insert into public.tcg_series(id) overriding system value values(-88001);
insert into public.tcg_sets(id,series_id,tcgdex_id,name_fr,abbreviation,abbreviation_fr,official_card_count,is_active)
  overriding system value values
  (-88001,-88001,'fixture6c2','Légendes Brillantes fixture6c2','SLG','SL3.5',73,true),
  (-88002,-88001,'fixture6c2-inactive','Légendes fixture6c2','SLG',null,73,false);
insert into public.source_cards(id,set_id,tcgdex_id,name_fr,local_id,image_url,source_present,origin,is_active)
  overriding system value values
  (-88001,-88001,'fixture6c2-28','Pikachu','28','https://example.test/card.webp',true,'tcgdex',true),
  (-88002,-88001,'fixture6c2-29','Raichu-GX','29',null,true,'tcgdex',true),
  (-88003,-88001,'fixture6c2-280','Pikachu','280',null,true,'tcgdex',true),
  (-88004,-88001,'fixture6c2-tg28','Pikachu','TG028',null,true,'tcgdex',true),
  (-88005,-88001,null,'Alliance GX','30',null,false,'my',true),
  (-88006,-88001,'fixture6c2-inactive-card','Pikachu','28',null,true,'tcgdex',false),
  (-88007,-88002,'fixture6c2-inactive-set','Pikachu','28',null,true,'tcgdex',true),
  (-88008,-88001,'fixture6c2-volume','Pagination','99',null,true,'tcgdex',true),
  (-88009,-88001,'fixture6c2-ligature','Évoli — Cœur d’Or','31',null,true,'tcgdex',true),
  (-88010,-88001,'fixture6c2-partial','xxPikachuyy','32',null,true,'tcgdex',true),
  (-88011,-88001,'fixture6c2-prefix','Pikachux','33',null,true,'tcgdex',true);
insert into public.pokemon(id,dex_number,name_fr) overriding system value values
  (-88001,88001,'Pikachu'),(-88002,88002,'Zekrom');
insert into public.card_pokemon(card_id,pokemon_id) values(-88001,-88001),(-88005,-88001),(-88005,-88002);
insert into private.catalog_entity_keys(entity_key,source_card_id) values('my:fixture6c2-alliance',-88005);
insert into public.catalog_variants(id,source_card_id,variant_key,label,image_url,sort_order,source_present,origin,french_availability,is_active)
  overriding system value values
  (-88001,-88001,'normal','Normal',null,1,true,'tcgdex','confirmed',true),
  (9007199254740995,-88001,'reverse','Reverse','https://example.test/reverse.webp',2,false,'my','confirmed',true),
  (-88002,-88001,'inactive','Inactive',null,3,true,'tcgdex','confirmed',false),
  (-88003,-88001,'unknown','Unknown',null,4,true,'tcgdex','unknown',true),
  (-88004,-88001,'unavailable','Unavailable',null,5,true,'tcgdex','unavailable',true);
insert into public.catalog_variants(id,source_card_id,variant_key,label,sort_order,source_present,origin,french_availability)
  overriding system value select id-20,id,'normal',null,1,source_present,origin,'confirmed'
  from public.source_cards where id between -88011 and -88002 and id <> -88008;
insert into public.catalog_variants(id,source_card_id,variant_key,sort_order,source_present,origin,french_availability)
  overriding system value select -88100-n,-88008,'volume-' || n,n,true,'tcgdex','confirmed' from generate_series(1,105) n;
insert into public.collections(id,owner_id,name,collection_type) values
  ('c1800000-0000-0000-0000-000000000001','a1800000-0000-0000-0000-000000000001','Search fixture','free');
insert into public.collection_items(collection_id,variant_id,origin,sort_position) values
  ('c1800000-0000-0000-0000-000000000001',-88001,'manual',1);
