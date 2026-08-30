-- Lets the institution portal (and staff) mark a refusal as handled, so it's
-- easy to see what's already been followed up on vs. still open.
alter table public.payment_failures
  add column if not exists resolved boolean not null default false;
alter table public.payment_failures
  add column if not exists resolved_at timestamptz;
