-- Complements hidden/order fixtures. Used only for reserved synthetic parents.
update public.catalog_variants set size='standard' where id between -95021 and -95001 or id=9007199254740997;
update public.catalog_variants set is_active=id in(-95001,-95003,-95005),
  sort_order=case id when -95001 then 1 when -95002 then 2 when -95003 then 3 when -95004 then 4 when -95005 then 5 else 6 end
  where source_card_id=-95001;
update public.collection_items set is_hidden=true where id='d2500000-0000-0000-0000-000000000001';
update public.automatic_target_states set content_hash=(select encode(sha256(convert_to('[' ||
  coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
  from private.canonical_collection_variants('set',-95001)) where id=-95001;
insert into public.automatic_target_states(id,target_type,set_id,generation_version,content_hash) overriding system value
  select s,'set',s,2,(select encode(sha256(convert_to('[' ||
    coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
    from private.canonical_collection_variants('set',s)) from unnest(array[-95002,-95003]::bigint[]) s;
