-- Nedarim's masav/bank-standing-order CSV (GetMasavHistoryCSVNew) carries a
-- "קטגוריה" column per row — the same sub-fund concept used elsewhere (e.g.
-- payment_failures.category) — but it was never parsed/stored, so a
-- mosad-level bank-refusals view couldn't be narrowed to a specific fund like
-- יחי ראובן under סומך נופלים. Existing rows will be null until the next sync
-- for their period backfills it (upsert onConflict masav_id,period).
alter table public.bank_standing_order_failures
  add column if not exists category text;
