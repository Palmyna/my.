-- Complements the unchanged 8E fixtures, with one mixed structural update.
-- All IDs are reserved synthetic identities; installed/removed by existing tools.
update public.collection_items set is_hidden=true where id='d2500000-0000-0000-0000-000000000003';
insert into public.physical_copies(user_id,variant_id,note) values
  ('a2500000-0000-0000-0000-000000000001',-95003,'Removed automatic: copy and note survive'),
  ('a2500000-0000-0000-0000-000000000001',-95004,'Surviving manual: copy and note survive');
update public.catalog_variants v set is_active=v.id=any(array[-95005,-95002,-95001,9007199254740997]::bigint[]),
  sort_order=coalesce(array_position(array[-95005,-95002,-95001,9007199254740997]::bigint[],v.id),99)
  where v.source_card_id=-95001;
update public.automatic_target_states set generation_version=8,content_hash=(select
  encode(sha256(convert_to('[' || coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
  from private.canonical_collection_variants('set',-95001)) where id=-95001;
