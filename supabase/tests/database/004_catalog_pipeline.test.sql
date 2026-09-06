begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select col_type_is('public','catalog_variants','stamp','text[]','Multiple stamps are representable');
select col_not_null('public','catalog_variants','stamp','Empty stamps use an empty array');
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relkind='r'),'Every private pipeline table enables RLS');
select has_table('private','catalog_sync_runs','Run provenance exists');
select has_table('private','catalog_overrides','Applied corrections are private');
select has_table('private','catalog_entity_keys','Sparse identity aliases preserve corrected/local IDs');

select ok(not has_schema_privilege(role_name,'private','USAGE'), role_name || ' has no private schema usage')
from unnest(array['anon','authenticated','service_role']) role_name;
select ok(not has_table_privilege(role_name,'private.' || table_name,privilege), role_name || ' cannot ' || privilege || ' ' || table_name)
from unnest(array['anon','authenticated','service_role']) role_name
cross join unnest(array['catalog_sync_runs','catalog_overrides','catalog_entity_keys']) table_name
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege;
select is((select count(*) from pg_policies where schemaname='private'),0::bigint,'No permissive private API policies');
select throws_ok($$insert into private.catalog_sync_runs(started_at,status,repository,source_sha,source_committed_at,overrides_hash,pipeline_version)
 values(now(),'running','https://github.com/tcgdex/cards-database','latest',now(),repeat('a',64),'1')$$,'23514',null,'Mutable snapshot identifiers rejected');
select throws_ok($$insert into private.catalog_entity_keys(entity_key) values('invalid')$$,'23514',null,'Alias requires exactly one entity');

-- Replay the scalar conversion against synthetic historical values without touching the real catalogue.
create temporary table historical_stamps(stamp text);
insert into historical_stamps values(null),('staff'),('pre-release');
alter table historical_stamps alter column stamp type text[] using case when stamp is null then '{}'::text[] else array[stamp] end;
select results_eq('select stamp from historical_stamps order by stamp','values (array[]::text[]),(array[''pre-release'']),(array[''staff''])','Historical scalar conversion is lossless');

select * from finish();
rollback;
