-- ============================================================
-- Receipts module tables — fully idempotent (safe to re-run)
-- ============================================================

-- Customers (autocomplete / auto-fill)
create table if not exists customers (
  id         uuid    default gen_random_uuid() primary key,
  name       text    not null,
  id_number  text,
  email      text,
  phone      text,
  bank_name    text,
  bank_branch  text,
  bank_account text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- Unique constraint needed for ON CONFLICT upsert
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customers_name_key' and conrelid = 'customers'::regclass
  ) then
    alter table customers add constraint customers_name_key unique (name);
  end if;
end $$;

-- Pending receipts (drafts awaiting issuance)
create table if not exists pending_receipts (
  id               uuid    default gen_random_uuid() primary key,
  user_id          uuid    not null,
  customer_name    text,
  customer_id      text,
  customer_email   text,
  amount           numeric,
  bank_name        text,
  bank_branch      text,
  bank_account     text,
  reference_number text,
  transfer_date    text,
  branch           text    not null default '',
  status           text    not null default 'pending',
  doc_number       text,
  notes            text,
  created_at       timestamptz default now()
);

-- Issued receipts log
create table if not exists issued_receipts (
  id                   serial primary key,
  external_receipt_id  text unique,
  receipt_number       text,
  institution_name     text,
  receipt_type         text,
  customer_name        text,
  customer_id_number   text,
  customer_email       text,
  amount               numeric,
  issue_date           text,
  issue_date_raw       text,
  bank_number          text,
  branch_number        text,
  account_number       text,
  notes                text,
  status               text default 'issued',
  pdf_url              text,
  raw_payload          jsonb,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
-- Add any columns that may be missing from an earlier partial run
alter table issued_receipts add column if not exists external_receipt_id text unique;
alter table issued_receipts add column if not exists receipt_type        text;
alter table issued_receipts add column if not exists issue_date_raw      text;
alter table issued_receipts add column if not exists bank_number         text;
alter table issued_receipts add column if not exists branch_number       text;
alter table issued_receipts add column if not exists account_number      text;
alter table issued_receipts add column if not exists status              text default 'issued';
alter table issued_receipts add column if not exists institution_name    text;

-- Manual checkpoints (per-user, for Excel import)
create table if not exists manual_checkpoints (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid not null unique,
  customer_name    text,
  amount           numeric,
  reference_number text,
  bank_account     text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- MASAV file upload batches
create table if not exists masav_batches (
  id         uuid    default gen_random_uuid() primary key,
  user_id    uuid    not null,
  file_name  text    not null,
  row_count  integer default 0,
  institution text,
  notes      text,
  created_at timestamptz default now()
);

-- Individual MASAV transactions
create table if not exists masav_transactions (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid not null,
  batch_id         uuid references masav_batches(id) on delete cascade,
  institution      text,
  payer_name       text,
  payer_id         text,
  amount           numeric,
  transaction_date text,
  reference        text,
  bank_account     text,
  bank_name        text,
  bank_branch      text,
  status           text not null default 'pending',
  raw_row          jsonb,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Bank return letters
create table if not exists return_letters (
  id          uuid    default gen_random_uuid() primary key,
  user_id     uuid    not null,
  payer_name  text,
  payer_id    text,
  amount      numeric,
  return_date text,
  reference   text,
  reason      text,
  file_name   text    not null,
  created_at  timestamptz default now()
);

-- Reconciliation matches
create table if not exists reconciliation_matches (
  id             uuid default gen_random_uuid() primary key,
  transaction_id uuid references masav_transactions(id) on delete cascade,
  letter_id      uuid references return_letters(id) on delete cascade,
  confidence     text,
  score          numeric,
  created_at     timestamptz default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table customers             enable row level security;
alter table pending_receipts      enable row level security;
alter table issued_receipts       enable row level security;
alter table manual_checkpoints    enable row level security;
alter table masav_batches         enable row level security;
alter table masav_transactions    enable row level security;
alter table return_letters        enable row level security;
alter table reconciliation_matches enable row level security;

-- Drop and recreate all policies (idempotent)
drop policy if exists "auth_customers"              on customers;
drop policy if exists "auth_read_pending"           on pending_receipts;
drop policy if exists "auth_insert_pending"         on pending_receipts;
drop policy if exists "auth_update_pending"         on pending_receipts;
drop policy if exists "auth_delete_pending"         on pending_receipts;
drop policy if exists "auth_read_issued"            on issued_receipts;
drop policy if exists "auth_insert_issued"          on issued_receipts;
drop policy if exists "auth_checkpoints"            on manual_checkpoints;
drop policy if exists "auth_masav_batches"          on masav_batches;
drop policy if exists "auth_masav_transactions"     on masav_transactions;
drop policy if exists "auth_return_letters"         on return_letters;
drop policy if exists "auth_reconciliation_matches" on reconciliation_matches;

create policy "auth_customers"   on customers             for all to authenticated using (true) with check (true);

create policy "auth_read_pending"   on pending_receipts for select to authenticated using (true);
create policy "auth_insert_pending" on pending_receipts for insert to authenticated with check (auth.uid() = user_id);
create policy "auth_update_pending" on pending_receipts for update to authenticated using (true);
create policy "auth_delete_pending" on pending_receipts for delete to authenticated using (true);

create policy "auth_read_issued"    on issued_receipts  for select to authenticated using (true);
create policy "auth_insert_issued"  on issued_receipts  for insert to authenticated with check (true);

create policy "auth_checkpoints"          on manual_checkpoints     for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "auth_masav_batches"        on masav_batches          for all to authenticated using (true) with check (auth.uid() = user_id);
create policy "auth_masav_transactions"   on masav_transactions     for all to authenticated using (true) with check (auth.uid() = user_id);
create policy "auth_return_letters"       on return_letters         for all to authenticated using (true) with check (auth.uid() = user_id);
create policy "auth_reconciliation_matches" on reconciliation_matches for all to authenticated using (true) with check (true);
