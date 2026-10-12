begin;

-- plpgsql_check: to_json(text) is STABLE, even for these exact string inputs.
-- No reads, DML or locks introduced; the outer projection stays one snapshot.
alter function private.collection_update_available(bigint,bigint,text,
  private.collection_order_canonical_entry[],private.collection_order_item_entry[]) stable;

-- btrim's default removes spaces, not tabs/newlines. Reject whitespace-only
-- text as well as the already bounded/trimmed empty strings.
alter table private.notification_announcements
  add constraint notification_announcements_text_check check (
    title ~ '[^[:space:]]' and body ~ '[^[:space:]]' and published_by ~ '[^[:space:]]'
  );

commit;
