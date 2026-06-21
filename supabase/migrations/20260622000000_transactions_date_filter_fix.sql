-- transaction_time_iso is null on many rows (including the most recent ones),
-- while transaction_time_raw ('DD/MM/YYYY HH:MM:SS') is reliably populated.
-- This adds a parsed-timestamp column via a view so date filters/sorting can
-- use transaction_time_raw without rewriting the API to fetch all rows into JS.

create or replace function transactions_parsed_time(raw text)
returns timestamp
language sql
immutable
as $$
  select case when raw is null or raw = '' then null
    else to_timestamp(raw, 'DD/MM/YYYY HH24:MI:SS')::timestamp
  end
$$;

create or replace view transactions_with_parsed_time as
select t.*, transactions_parsed_time(t.transaction_time_raw) as transaction_time_parsed
from transactions t;
