-- Tracks monthly reconciliation of bank standing-order (MASAV) charges per institution,
-- since unlike credit-card refusals (Gmail) there is no automatic bounce notification.
-- auto_status is what GetMasavHistoryCSVNew indicated (if recognizable); status is the
-- confirmed outcome after the user resolves 'pending' rows.
create table if not exists bank_standing_order_failures (
  id                 uuid default gen_random_uuid() primary key,
  mosad_number       text not null,
  institution_name   text not null,
  masav_id           text not null,
  period             text not null,        -- 'YYYY-MM'
  charge_date        date,
  amount             numeric not null,
  client_name        text,
  client_id_number   text,
  client_phone       text,
  client_email       text,
  bank_name          text,
  bank_branch        text,
  bank_account       text,
  auto_status        text,                  -- 'cleared' | 'bounced' | null
  status             text not null default 'pending', -- 'pending' | 'cleared' | 'bounced'
  resolution         text,                  -- 'receipt_issued' | 'cancelled_in_nedarim'
  receipt_id         text,
  nedarim_result     jsonb,
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (masav_id, period)
);

alter table bank_standing_order_failures enable row level security;

drop policy if exists "auth_all_bank_failures" on bank_standing_order_failures;
create policy "auth_all_bank_failures" on bank_standing_order_failures for all to authenticated using (true) with check (true);
