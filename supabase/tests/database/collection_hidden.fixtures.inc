-- Complements the ordering/add fixtures. Only reserved synthetic identities.
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_set_id,
  applied_target_version,order_contract_version,personal_revision) values
  ('c2500000-0000-0000-0000-000000000007','a2500000-0000-0000-0000-000000000001','Independent hidden parent','automatic','set',-95003,1,2,0),
  ('c2500000-0000-0000-0000-000000000008','a2500000-0000-0000-0000-000000000001','Legacy automatic hidden parent','automatic','set',-95002,1,1,0);
insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,sort_position) values
  ('d2500000-0000-0000-0000-000000000007','c2500000-0000-0000-0000-000000000007',-95007,'automatic',1,1),
  ('d2500000-0000-0000-0000-000000000008','c2500000-0000-0000-0000-000000000008',-95003,'automatic',1,1);
insert into public.physical_copies(user_id,variant_id,note) values
  ('a2500000-0000-0000-0000-000000000001',-95001,'owned hidden copy one'),
  ('a2500000-0000-0000-0000-000000000001',-95001,'owned hidden copy two'),
  ('a2500000-0000-0000-0000-000000000001',-95002,'manual always counted'),
  ('a2500000-0000-0000-0000-000000000002',-95003,'recipient copy never counts');
