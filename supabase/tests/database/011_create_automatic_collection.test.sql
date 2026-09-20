begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir automatic_collection.fixtures.inc

select has_function('public', 'create_automatic_collection', array['text','text','bigint']);
select ok(prosecdef and provolatile = 'v' and proconfig @> array['search_path=""'],
  'Authoritative RPC is VOLATILE, SECURITY DEFINER with a safe search_path')
from pg_proc where oid = 'public.create_automatic_collection(text,text,bigint)'::regprocedure;
select ok(has_function_privilege('authenticated', 'public.create_automatic_collection(text,text,bigint)', 'EXECUTE'),
  'Authenticated API can execute the RPC');
select ok(not has_function_privilege(role_name, 'public.create_automatic_collection(text,text,bigint)', 'EXECUTE'),
  role_name || ' has no RPC execution grant') from unnest(array['anon','service_role']) role_name;
select ok(not exists (select 1 from pg_proc as p cross join lateral aclexplode(p.proacl) as acl
  where p.oid = 'public.create_automatic_collection(text,text,bigint)'::regprocedure and acl.grantee = 0),
  'PUBLIC has no RPC execution grant');
select ok(not has_table_privilege('authenticated', 'public.collection_items', 'INSERT,UPDATE,DELETE'),
  'Direct item writes remain forbidden');
select ok(not has_column_privilege('authenticated', 'public.collections', column_name, 'INSERT,UPDATE'),
  'Protected collection field: ' || column_name)
from unnest(array['owner_id','automatic_target_type','target_pokemon_id','target_set_id','applied_target_version']) column_name;
select ok(not has_column_privilege('authenticated', 'public.collections', 'collection_type', 'UPDATE'),
  'Collection type cannot be changed directly');

create temporary table rpc_results(label text, collection_id uuid, created boolean);
grant select, insert on rpc_results to authenticated;
set local role anon;
select throws_ok($$select * from public.create_automatic_collection('Anonymous', 'pokemon', -82001)$$,
  '42501', null, 'Anonymous role cannot execute');
reset role;
set local role authenticated;
set local request.jwt.claims = '{}';
select throws_ok($$select * from public.create_automatic_collection('No session', 'pokemon', -82001)$$,
  '42501', 'Authenticated aal2 session required', 'Missing session is rejected inside definer');
set local request.jwt.claims = '{"sub":"a1100000-0000-0000-0000-000000000001","aal":"aal1"}';
select throws_ok($$select * from public.create_automatic_collection('Low assurance', 'pokemon', -82001)$$,
  '42501', 'Authenticated aal2 session required', 'aal1 cannot create');
set local request.jwt.claims = '{"sub":"a1100000-0000-0000-0000-000000000099","aal":"aal2"}';
select throws_ok($$select * from public.create_automatic_collection('No profile', 'pokemon', -82001)$$,
  '42501', 'MY. profile required', 'An aal2 claim without a MY. profile is insufficient');
set local request.jwt.claims = '{"sub":"a1100000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok($$select * from public.create_automatic_collection('Valid', 'series', -82001)$$,
  '22023', 'Invalid automatic target type', 'Invalid target type');
select throws_ok($$select * from public.create_automatic_collection('Valid', null, -82001)$$,
  '22023', 'Invalid automatic target type', 'NULL target type');
select throws_ok($$select * from public.create_automatic_collection('Valid', 'pokemon', null)$$,
  '22023', 'Automatic target ID is required', 'NULL target ID');
select throws_ok($$select * from public.create_automatic_collection('Valid', 'pokemon', -82999)$$,
  'P0002', 'Automatic target does not exist', 'Missing Pokemon');
select throws_ok($$select * from public.create_automatic_collection('Valid', 'set', -82999)$$,
  'P0002', 'Automatic target does not exist', 'Missing set');
select throws_ok($$select * from public.create_automatic_collection('Valid', 'pokemon', -82002)$$,
  'P0002', 'automatic_target_state_missing', 'Existing Pokemon without state');
select throws_ok($$select * from public.create_automatic_collection('Valid', 'set', -82003)$$,
  'P0002', 'automatic_target_state_missing', 'Existing set without state');
select throws_ok($$select * from public.create_automatic_collection('Valid', 'set', -82004)$$,
  '23514', 'automatic_target_hash_mismatch', 'Incoherent hash is rejected');
select throws_ok($$select * from public.create_automatic_collection('Empty', 'pokemon', -82003)$$,
  '23514', 'automatic_collection_empty', 'New empty Pokemon collection is forbidden');
select throws_ok($$select * from public.create_automatic_collection('Empty', 'set', -82002)$$,
  '23514', 'automatic_collection_empty', 'New empty set collection is forbidden');
select throws_ok($$select * from public.create_automatic_collection(E' \tAB\n ', 'pokemon', -82001)$$,
  '23514', null, 'Name with fewer than three useful characters uses existing CHECK');
select throws_ok($$select * from public.create_automatic_collection(U&'\00A0AB\3000', 'pokemon', -82001)$$,
  '23514', null, 'Existing Unicode trim rule is reused');
select throws_ok($$select * from public.create_automatic_collection(null, 'pokemon', -82001)$$,
  '23502', null, 'NULL name uses existing NOT NULL');
select throws_ok($$select * from public.create_automatic_collection('Valid', 'pokemon', -82001,
  owner_id => 'a1100000-0000-0000-0000-000000000002'::uuid)$$,
  '42883', null, 'No owner parameter can be supplied');
select is((select count(*) from public.collections where owner_id = auth.uid()), 0::bigint,
  'All refused creations left no parent');
select is((select count(*) from public.collection_items where variant_id in (-82101,-82103,-9007199254740995)), 0::bigint,
  'All refused creations left no items');

insert into rpc_results select 'pokemon', * from public.create_automatic_collection(E'  Mon Pokémon\t', 'pokemon', -82001);
insert into rpc_results select 'set', * from public.create_automatic_collection('Extension', 'set', -82001);
select ok((select bool_and(created) and count(*) = 2 from rpc_results), 'Both new targets return created=true');
select results_eq($$select name, owner_id, collection_type, automatic_target_type, target_pokemon_id, target_set_id,
  applied_target_version from public.collections where id = (select collection_id from rpc_results where label='pokemon')$$,
  $$values (E'  Mon Pokémon\t'::text, 'a1100000-0000-0000-0000-000000000001'::uuid, 'automatic'::text,
    'pokemon'::text, -82001::bigint, null::bigint, 7::bigint)$$, 'Name preserved, owner derived and Pokemon version authoritative');
select results_eq($$select automatic_target_type, target_pokemon_id, target_set_id, applied_target_version
  from public.collections where id = (select collection_id from rpc_results where label='set')$$,
  $$values ('set'::text, null::bigint, -82001::bigint, 13::bigint)$$, 'Exact set target and state version');
select results_eq($$select variant_id, origin, automatic_rank, sort_position from public.collection_items
  where collection_id = (select collection_id from rpc_results where label='pokemon') order by automatic_rank$$,
  $$values (-82101::bigint, 'automatic'::text, 1::bigint, 1::numeric(40,20)),
    (-9007199254740995, 'automatic', 2, 2::numeric(40,20))$$, 'Pokemon items, ranks and exact numeric positions');
select results_eq($$select variant_id, origin, automatic_rank, sort_position from public.collection_items
  where collection_id = (select collection_id from rpc_results where label='set') order by automatic_rank$$,
  $$values (-82103::bigint, 'automatic'::text, 1::bigint, 1::numeric(40,20)),
    (-82101, 'automatic', 2, 2::numeric(40,20)), (-9007199254740995, 'automatic', 3, 3::numeric(40,20))$$,
  'Set includes Trainer and preserves helper order and bigint IDs');
select throws_ok($$insert into public.collection_items(collection_id, variant_id, origin, sort_position)
  select collection_id, -82103, 'manual', 9 from rpc_results where label='pokemon'$$,
  '42501', null, 'RPC grants do not permit direct item insertion');
select throws_ok($$update public.collections set owner_id='a1100000-0000-0000-0000-000000000002'
  where id = (select collection_id from rpc_results where label='pokemon')$$,
  '42501', null, 'RPC grants do not permit owner forgery');

reset role;
-- Simulate an existing collection with a personalized order and obsolete version.
update public.collection_items set sort_position = automatic_rank + 10.25
  where collection_id in (select collection_id from rpc_results);
create temporary table existing_before as select to_jsonb(c) as row from public.collections c
  where c.id in (select collection_id from rpc_results);
create temporary table items_before as select to_jsonb(i) as row from public.collection_items i
  where i.collection_id in (select collection_id from rpc_results);
update public.catalog_variants set is_active = false where id in (-82101,-82103,-9007199254740995);
update public.automatic_target_states set generation_version=99, content_hash=repeat('0',64) where id=-82001;
delete from public.automatic_target_states where id=-82002;
set local role authenticated;
insert into rpc_results select 'existing-pokemon', * from public.create_automatic_collection(null, 'pokemon', -82001);
insert into rpc_results select 'existing-set', * from public.create_automatic_collection('x', 'set', -82001);
select ok((select not created and collection_id = (select collection_id from rpc_results where label='pokemon')
  from rpc_results where label='existing-pokemon'), 'Existing empty Pokemon bypasses name/hash/version validation');
select ok((select not created and collection_id = (select collection_id from rpc_results where label='set')
  from rpc_results where label='existing-set'), 'Existing set bypasses invalid name and absent state');
reset role;
select results_eq($$select to_jsonb(c) from public.collections c where c.id in (select collection_id from rpc_results) order by c.id$$,
  $$select row from existing_before order by row->>'id'$$, 'Retrieval never changes any parent field');
select results_eq($$select to_jsonb(i) from public.collection_items i where i.collection_id in (select collection_id from rpc_results) order by i.id$$,
  $$select row from items_before order by row->>'id'$$, 'Retrieval never replaces items or customized positions');

-- Restore only fixture catalogue values for the second owner and the late-failure test.
update public.catalog_variants set is_active=true where id in (-82101,-82103,-9007199254740995);
update public.automatic_target_states set generation_version=7,
  content_hash=encode(extensions.digest('["-82101","-9007199254740995"]', 'sha256'), 'hex') where id=-82001;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1100000-0000-0000-0000-000000000002","aal":"aal2"}';
insert into rpc_results select 'second-owner', * from public.create_automatic_collection('Other owner', 'pokemon', -82001);
select ok((select created and collection_id <> (select collection_id from rpc_results where label='pokemon')
  from rpc_results where label='second-owner'), 'Two owners get distinct personal collections for the same target');
select is((select owner_id from public.collections where id = (select collection_id from rpc_results where label='second-owner')),
  auth.uid(), 'Second caller owns only their new collection');
reset role;

-- The test-only trigger fails on the second item, after the parent and first item exist.
create function pg_temp.fail_automatic_item() returns trigger language plpgsql as $$
begin
  if new.automatic_rank = 2 and exists (select 1 from public.collections c
    where c.id=new.collection_id and c.owner_id='a1100000-0000-0000-0000-000000000003') then
    if not exists (select 1 from public.collection_items i where i.collection_id=new.collection_id and i.automatic_rank=1) then
      raise exception 'Test did not reach a partial insertion';
    end if;
    raise exception using errcode='23514', message='forced_item_failure_after_parent';
  end if;
  return new;
end;
$$;
create trigger automatic_item_test_failure before insert on public.collection_items
  for each row execute function pg_temp.fail_automatic_item();
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1100000-0000-0000-0000-000000000003","aal":"aal2"}';
select throws_ok($$select * from public.create_automatic_collection('Atomic failure', 'pokemon', -82001)$$,
  '23514', 'forced_item_failure_after_parent', 'Error after parent and first item rolls back entire call');
reset role;
select is((select count(*) from public.collections where owner_id='a1100000-0000-0000-0000-000000000003'),
  0::bigint, 'Forced late failure leaves no parent');
select is((select count(*) from public.collection_items where variant_id in (-82101,-82103,-9007199254740995)),
  7::bigint, 'Forced late failure leaves no additional or orphan items');

select * from finish();
rollback;
