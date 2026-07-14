-- External bank-transfer submissions from the public "תולדות נסים" upload page
-- (frontend/api/public-transfer.js). Each row is a screenshot + extracted details
-- awaiting the admin's approval in the CRM. On approval the data is copied into
-- bank_transfers (no EZCount receipt is issued). Written via the service-role key.
create table if not exists external_transfer_submissions (
  id              uuid default gen_random_uuid() primary key,
  status          text not null default 'new',        -- new | approved | rejected
  mosad_number    text default '7016650',             -- תולדות נסים
  customer_name   text,
  id_number       text,                               -- תעודת זהות (required on the public page)
  amount          numeric,
  transfer_date   text,
  asmachta        text,
  bank_name       text,
  bank_branch     text,
  bank_account    text,
  notes           text,
  screenshot_path text,                               -- path in the transfer-screenshots storage bucket
  source          text default 'toldot-public',
  created_at      timestamptz default now()
);

-- Idempotent: adds id_number to a table that may already have been created.
alter table external_transfer_submissions add column if not exists id_number text;

create index if not exists external_transfer_submissions_status_idx
  on external_transfer_submissions (status);

-- Access is only ever via the service-role key (server endpoints); RLS on with
-- no permissive policy keeps it closed to anon/authenticated clients.
alter table external_transfer_submissions enable row level security;

-- NOTE: also create a PRIVATE Storage bucket named `transfer-screenshots`
-- in the Supabase dashboard (Storage → New bucket, "Public" unchecked).
