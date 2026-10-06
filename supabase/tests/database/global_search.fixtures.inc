-- Explicit IDs; every consumer wraps these fixtures in a rollback transaction.
insert into auth.users(id) values
  ('a7e10000-0000-0000-0000-000000000001'),('a7e10000-0000-0000-0000-000000000002'),
  ('a7e10000-0000-0000-0000-000000000003');
delete from public.profiles where id='a7e10000-0000-0000-0000-000000000003';
insert into public.pokemon(id,dex_number,name_fr,primary_type,secondary_type) overriding system value values
  (9007199254740995,97001,'Fixture7e1','electric',null),(-97002,97002,'Fixture7e1 Éclair','fire','flying'),
  (-97003,97003,'Fixture7e1extra','water',null),(-97004,97004,'xxfixture7e1yy',null,null),
  (-97005,97005,'SansVersion7e1',null,null),(-97006,97006,'JumboSeul7e1',null,null),
  (-97007,97007,'TieNom7e1',null,null),(-97008,97008,'TieNom7e1',null,null);
insert into public.tcg_series(id,name_fr) overriding system value values(-97001,'SérieSeule7e1');
insert into public.tcg_sets(id,series_id,tcgdex_id,name_fr,name_source,abbreviation_fr,abbreviation,official_card_count,is_active)
  overriding system value values
  (-97001,-97001,'fixture7e1','Fixture7e1','Source principale','GS7E1A','GS7E1B',73,true),
  (-97002,-97001,'fixture7e1-z','Fixture7e1 Zèbre',null,null,null,73,true),
  (-97003,-97001,'fixture7e1-extra','Fixture7e1extra',null,null,null,73,true),
  (-97004,-97001,'fallback7e1',null,'Fallback7e1',null,null,73,true),
  (-97005,-97001,'numeric7e1','151',null,null,null,151,true),
  (-97006,-97001,'inactive7e1','InactiveSet7e1',null,null,null,73,false),
  (-97007,-97001,'jumbo7e1','JumboSet7e1',null,null,null,73,true),
  (-97008,-97001,'empty7e1','EmptySet7e1',null,null,null,73,true),
  (-97009,-97001,'tie7e1-a','TieNom7e1',null,null,null,73,true),
  (-97010,-97001,'tie7e1-b','TieNom7e1',null,null,null,73,true);
insert into public.source_cards(id,set_id,tcgdex_id,name_fr,local_id,source_present,origin,is_active)
  overriding system value values
  (9007199254740995,-97001,'fixture7e1-28','Évoli — Cœur d’Or Fixture7e1','028',true,'tcgdex',true),
  (-97010,-97001,null,'Alliance7e1','TG028',false,'my',true),
  (-97011,-97005,'numeric7e1-151','Numérique7e1','151',true,'tcgdex',true),
  (-97012,-97004,'fallback7e1-7','Source7e1','007',true,'tcgdex',true),
  (-97013,-97007,'jumbo7e1-1','JumboSeul7e1','1',true,'tcgdex',true),
  (-97014,-97001,'unknown7e1-1','SansVersion7e1','1',true,'tcgdex',true),
  (-97015,-97001,'inactive7e1-card','InactiveCard7e1','1',true,'tcgdex',false),
  (-97016,-97006,'inactive7e1-set','InactiveSet7e1','1',true,'tcgdex',true),
  (-97017,-97001,'nullsize7e1','NullSize7e1','1',true,'tcgdex',true),
  (-97018,-97002,'fixture7e1-z-1','Autre7e1','1',true,'tcgdex',true),
  (-97019,-97003,'fixture7e1-extra-1','Autre7e1','1',true,'tcgdex',true),
  (-97020,-97009,'tie7e1-a-1','TieNom7e1','1',true,'tcgdex',true),
  (-97021,-97010,'tie7e1-b-1','TieNom7e1','1',true,'tcgdex',true);
insert into public.source_cards(id,set_id,tcgdex_id,name_fr,local_id,source_present,origin)
  overriding system value select -97100-n,-97001,'fixture7e1-card-'||n,
    'Fixture7e1 Carte '||lpad(n::text,2,'0'), case when n=1 then '280' else '99' end,true,'tcgdex'
  from generate_series(1,12) n;
insert into private.catalog_entity_keys(entity_key,source_card_id) values('my:fixture7e1-alliance',-97010);
insert into public.catalog_variants(id,source_card_id,variant_key,sort_order,size,french_availability,is_active,source_present,origin)
  overriding system value select -97200-row_number() over(order by id),id,'normal',1,
    case when id=-97013 then 'jumbo' when id=-97017 then null else 'standard' end,
    case when id=-97014 then 'unknown' else 'confirmed' end,true,source_present,origin
  from public.source_cards where id between -97112 and -97010 or id=9007199254740995;
insert into public.catalog_variants(id,source_card_id,variant_key,sort_order,size,french_availability,is_active,source_present,origin)
  overriding system value values
  (-97301,9007199254740995,'reverse',2,'standard','confirmed',true,false,'my'),
  (-97302,9007199254740995,'inactive',3,'standard','confirmed',false,true,'tcgdex'),
  (-97303,9007199254740995,'unknown',4,'standard','unknown',true,true,'tcgdex');
insert into public.card_pokemon(card_id,pokemon_id) values
  (9007199254740995,9007199254740995),(9007199254740995,-97002),(-97010,9007199254740995),(-97010,-97002),
  (-97018,-97003),(-97019,-97004),(-97014,-97005),(-97013,-97006),(-97020,-97007),(-97020,-97008);
insert into public.card_pokemon(card_id,pokemon_id)
  select id,-97002 from public.source_cards where id between -97112 and -97101;
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_pokemon_id,target_set_id,applied_target_version) values
  ('c7e10000-0000-0000-0000-000000000001','a7e10000-0000-0000-0000-000000000001','Fixture7e1','free',null,null,null,null),
  ('c7e10000-0000-0000-0000-000000000002','a7e10000-0000-0000-0000-000000000002','Fixture7e1 Éclair','automatic','pokemon',-97002,null,1),
  ('c7e10000-0000-0000-0000-000000000003','a7e10000-0000-0000-0000-000000000001','Fixture7e1extra','automatic','set',null,-97001,1),
  ('c7e10000-0000-0000-0000-000000000004','a7e10000-0000-0000-0000-000000000002','SecretSeul7e1','free',null,null,null,null),
  ('c7e10000-0000-0000-0000-000000000005','a7e10000-0000-0000-0000-000000000002','RetiréSeul7e1','free',null,null,null,null),
  ('c7e10000-0000-0000-0000-000000000006','a7e10000-0000-0000-0000-000000000001','AliasNom7e1','automatic','pokemon',9007199254740995,null,1),
  ('c7e10000-0000-0000-0000-000000000007','a7e10000-0000-0000-0000-000000000001','TieNom7e1','free',null,null,null,null),
  ('c7e10000-0000-0000-0000-000000000008','a7e10000-0000-0000-0000-000000000001','TieNom7e1','free',null,null,null,null);
insert into public.collection_shares(collection_id,recipient_user_id) values
  ('c7e10000-0000-0000-0000-000000000002','a7e10000-0000-0000-0000-000000000001'),
  ('c7e10000-0000-0000-0000-000000000005','a7e10000-0000-0000-0000-000000000001');
insert into public.collection_items(collection_id,variant_id,origin,sort_position) values
  ('c7e10000-0000-0000-0000-000000000006',-97301,'manual',1);
