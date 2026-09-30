begin;

-- Phase 6A.2, prepared only: apply manually after Phase 6A.1.
-- Destructive contraction explicitly requested: legacy metadata is discarded.
-- No truncation of existing notes: any value >750 aborts this transaction.
revoke insert (condition, is_graded, grading_company, grading_score),
  update (condition, is_graded, grading_company, grading_score)
  on public.physical_copies from authenticated;

alter table public.physical_copies
  drop constraint physical_copies_grading_check,
  drop column condition,
  drop column is_graded,
  drop column grading_company,
  drop column grading_score,
  add constraint physical_copies_note_length_check check (char_length(note) <= 750);

-- name/note grants, SELECT/DELETE, defaults, indexes, triggers and RLS unchanged.
-- Before commit, transaction rollback preserves all data. After commit, reverting
-- removed metadata requires a backup plus a new forward migration; never edit history.
commit;
