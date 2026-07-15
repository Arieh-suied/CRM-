-- Donor thank-you emails: per-institution editable templates + send log.
-- One template row per mosad, edited from the CRM's "תבנית מייל" tab; the
-- auto-send hook in frontend/api/transaction-routed.js sends the matching
-- institution's template on every new transaction that has an email address
-- (only for institutions whose auto_send is on). email_log's partial unique
-- index guarantees at most one automatic email per transaction even when the
-- Database Webhook is retried (pg_net retries on timeout). Manual sends from
-- the UI are unlimited.

create table if not exists email_templates (
  mosad_number    text primary key,
  subject         text not null,
  body            text not null,   -- plain text with {שם}/{סכום}/{קרן}/{תאריך} placeholders
  auto_send       boolean not null default false,
  attach_receipt  boolean not null default false,  -- attach the EZCount receipt PDF when the transaction has one
  updated_by      text,
  updated_at      timestamptz not null default now()
);

alter table email_templates enable row level security;
drop policy if exists "auth_all_email_templates" on email_templates;
create policy "auth_all_email_templates" on email_templates for all to authenticated using (true) with check (true);

create table if not exists email_log (
  id                uuid primary key default gen_random_uuid(),
  dedup_key         text not null,      -- external_transaction_id, fallback String(transactions.id)
  transaction_id    text,
  recipient         text not null,
  subject           text,
  body              text,
  trigger           text not null,      -- 'auto' | 'manual'
  status            text not null default 'pending',  -- 'pending' | 'sent' | 'failed'
  error             text,
  gmail_message_id  text,
  sent_by           text,               -- user email on manual sends
  created_at        timestamptz not null default now()
);

-- The dedup guarantee: one automatic email per transaction, ever. The row is
-- inserted as a claim BEFORE sending, so a concurrent duplicate webhook
-- delivery hits 23505 instead of double-emailing the donor.
create unique index if not exists uq_email_log_auto
  on email_log (dedup_key) where trigger = 'auto';

create index if not exists idx_email_log_tx on email_log (transaction_id);

alter table email_log enable row level security;
drop policy if exists "auth_all_email_log" on email_log;
create policy "auth_all_email_log" on email_log for all to authenticated using (true) with check (true);
