-- Grow webhook transaction log — one row per Grow transaction, idempotent on transaction_code.
create table if not exists grow_transactions (
  id                 uuid default gen_random_uuid() primary key,
  transaction_code   text not null,
  asmachta           text,
  payment_sum        numeric,
  payment_type       text,
  payment_date       text,
  full_name          text,
  payer_phone        text,
  payer_email        text,
  card_suffix        text,
  card_brand         text,
  payment_source     text,
  institution_name   text,
  raw_payload        jsonb,
  ezcount_doc_number text,
  ezcount_response   jsonb,
  status             text not null default 'received',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'grow_transactions_transaction_code_key' and conrelid = 'grow_transactions'::regclass
  ) then
    alter table grow_transactions add constraint grow_transactions_transaction_code_key unique (transaction_code);
  end if;
end $$;

alter table grow_transactions enable row level security;

drop policy if exists "auth_read_grow_transactions" on grow_transactions;
create policy "auth_read_grow_transactions" on grow_transactions for select to authenticated using (true);
