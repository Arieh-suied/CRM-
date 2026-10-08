-- Transfer date on the manual checkpoint, so the last-issued-receipt marker
-- used by BatchReceipts' Excel-import dedup can also be pinned to a date
-- (matters when amount/name/ref/account alone are ambiguous across files).
alter table manual_checkpoints add column if not exists transfer_date text;
