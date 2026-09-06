begin;

revoke all on table public.pokemon, public.tcg_series, public.tcg_sets,
  public.source_cards, public.catalog_variants, public.card_pokemon,
  public.automatic_target_states, public.profiles, public.collections,
  public.collection_items, public.physical_copies, public.collection_shares
  from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;
grant select on table public.pokemon, public.tcg_series, public.tcg_sets,
  public.source_cards, public.catalog_variants, public.card_pokemon,
  public.automatic_target_states, public.profiles, public.collections,
  public.collection_items, public.physical_copies, public.collection_shares to authenticated;

grant insert (name, collection_type) on public.collections to authenticated;
grant update (name) on public.collections to authenticated;
grant delete on public.collections to authenticated;
grant insert (variant_id, condition, is_graded, grading_company, grading_score, note)
  on public.physical_copies to authenticated;
grant update (condition, is_graded, grading_company, grading_score, note)
  on public.physical_copies to authenticated;
grant delete on public.physical_copies, public.collection_shares to authenticated;

-- Trusted backend only. No TRUNCATE, REFERENCES, TRIGGER or schema CREATE grants.
grant select, insert, update, delete on table public.pokemon, public.tcg_series, public.tcg_sets,
  public.source_cards, public.catalog_variants, public.card_pokemon,
  public.automatic_target_states, public.profiles, public.collections,
  public.collection_items, public.physical_copies, public.collection_shares to service_role;
grant usage on sequence public.pokemon_id_seq, public.tcg_series_id_seq, public.tcg_sets_id_seq,
  public.source_cards_id_seq, public.catalog_variants_id_seq, public.automatic_target_states_id_seq to service_role;

create policy pokemon_read on public.pokemon for select to authenticated using (true);
create policy tcg_series_read on public.tcg_series for select to authenticated using (true);
create policy tcg_sets_read on public.tcg_sets for select to authenticated using (true);
create policy source_cards_read on public.source_cards for select to authenticated using (true);
create policy catalog_variants_read on public.catalog_variants for select to authenticated using (true);
create policy card_pokemon_read on public.card_pokemon for select to authenticated using (true);
create policy automatic_target_states_read on public.automatic_target_states for select to authenticated using (true);

create policy profiles_read_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- The only SECURITY DEFINER helper. Breaks the collections <-> shares RLS cycle.
-- It accepts no user ID and reveals only whether the caller owns this collection.
-- No USAGE on private: policies reference the pre-resolved function OID.
create function private.owns_collection(collection_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.collections c
    where c.id = collection_id and c.owner_id = (select auth.uid())
  );
$$;
revoke all on function private.owns_collection(uuid) from public, anon, authenticated, service_role;
grant execute on function private.owns_collection(uuid) to authenticated;

create policy collections_read on public.collections for select to authenticated
  using (owner_id = (select auth.uid()) or exists (
    select 1 from public.collection_shares s
    where s.collection_id = collections.id and s.recipient_user_id = (select auth.uid())
  ));
create policy collections_insert_free on public.collections for insert to authenticated
  with check (owner_id = (select auth.uid()) and collection_type = 'free');
create policy collections_update_own on public.collections for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy collections_delete_own on public.collections for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy collection_items_read on public.collection_items for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_items.collection_id));

create policy physical_copies_read on public.physical_copies for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.collection_shares s
    join public.collections c on c.id = s.collection_id
    join public.collection_items i on i.collection_id = c.id
    where s.recipient_user_id = (select auth.uid())
      and c.owner_id = physical_copies.user_id and i.variant_id = physical_copies.variant_id
  ));
create policy physical_copies_insert_own on public.physical_copies for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy physical_copies_update_own on public.physical_copies for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy physical_copies_delete_own on public.physical_copies for delete to authenticated
  using (user_id = (select auth.uid()));

create policy collection_shares_read on public.collection_shares for select to authenticated
  using (recipient_user_id = (select auth.uid()) or private.owns_collection(collection_id));
create policy collection_shares_delete on public.collection_shares for delete to authenticated
  using (recipient_user_id = (select auth.uid()) or private.owns_collection(collection_id));

commit;
