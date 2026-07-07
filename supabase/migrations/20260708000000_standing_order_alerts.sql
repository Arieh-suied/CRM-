-- Dedup log for the "new standing order" (הוראת קבע חדשה) Gmail sync
-- (frontend/api/standing-orders-sync.js): one row per processed Nedarim email,
-- so re-syncing the same mailbox doesn't re-send the Telegram alert. keva_id
-- guards against the same order arriving in more than one email.
create table if not exists standing_order_alerts (
  gmail_message_id   text primary key,
  keva_id            text,
  institution_name   text,
  donor_name         text,
  amount             numeric,
  notified_at        timestamptz not null default now()
);

create index if not exists idx_standing_order_alerts_keva_id on standing_order_alerts (keva_id);

alter table standing_order_alerts enable row level security;

drop policy if exists "auth_all_standing_order_alerts" on standing_order_alerts;
create policy "auth_all_standing_order_alerts" on standing_order_alerts for all to authenticated using (true) with check (true);

-- One-time backfill: mark the standing-order emails already sitting in the
-- mailbox (last 30 days) as handled, so enabling the every-minute sync doesn't
-- retroactively fire Telegram alerts for them. Seeded atomically with the table
-- to avoid a race with the cron. Only new orders from now on will notify.
insert into standing_order_alerts (gmail_message_id) values
  ('19f3cb194b5cc057'),
  ('19ecaffd4966ac48'),
  ('19ea731953c7cda2'),
  ('19ea644063023c3a')
on conflict (gmail_message_id) do nothing;
