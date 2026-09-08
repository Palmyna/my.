begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select col_type_is('public','catalog_variants','effective_release_date','date','Variant date is a calendar DATE');
select col_is_null('public','catalog_variants','effective_release_date','Unknown variant dates remain nullable');
select col_type_is('public','catalog_variants','date_origin','text','Date origin uses the existing TEXT convention');
select col_not_null('public','catalog_variants','date_origin','Provenance cannot be omitted as SQL NULL');
select col_default_is('public','catalog_variants','date_origin','unknown','Unresolved provenance defaults honestly');

-- Explicit negative fixture IDs do not consume live identity sequences. Everything is rolled back.
insert into public.tcg_series(id) overriding system value values(-80501);
insert into public.tcg_sets(id,series_id) overriding system value values(-80501,-80501);
insert into public.source_cards(id,set_id,source_present,origin) overriding system value values(-80501,-80501,false,'my');
insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin)
  overriding system value values(-80501,-80501,'date-fixture',false,'my');
select is((select date_origin from public.catalog_variants where id=-80501),'unknown','Default works on a new variant');
select is((select effective_release_date from public.catalog_variants where id=-80501),null::date,'No date is fabricated');
select lives_ok(format('update public.catalog_variants set date_origin=%L,effective_release_date=%L where id=-80501',origin,'2020-02-29'),
  'Accepted provenance: ' || origin)
from unnest(array['variant','card','product','set','override','unknown']) origin;
select throws_ok($$update public.catalog_variants set date_origin='approximate' where id=-80501$$,
  '23514',null,'Unsupported provenance rejected');
select throws_ok($$update public.catalog_variants set date_origin=null where id=-80501$$,
  '23502',null,'NULL provenance rejected');
select throws_ok($$update public.catalog_variants set effective_release_date='2021-02-29' where id=-80501$$,
  '22008',null,'Invalid calendar date rejected');
select is((select variant_key from public.catalog_variants where id=-80501),'date-fixture','Date changes preserve variant identity and ID');
select lives_ok($$update public.catalog_variants set effective_release_date=null,date_origin='unknown' where id=-80501$$,
  'An unknown effective date is accepted');

select * from finish();
rollback;
