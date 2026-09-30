begin;

-- Names are optional metadata. UI numbering is derived, never stored.
alter table public.physical_copies add column name text;
grant insert (name), update (name) on public.physical_copies to authenticated;
-- Existing SELECT/DELETE grants, owner defaults and all RLS policies remain intact.

commit;
