-- Sub-fund/category tag for issued_receipts (e.g. "יחי ראובן" under "סומך
-- נופלים"), mirroring the same concept already used on payment_failures and
-- bank_standing_order_failures — needed so an institution-scoped user can be
-- restricted to only their own fund's receipts in the donor report.
alter table issued_receipts add column if not exists category text;

-- Best-effort backfill: only covers historical rows where the (optional)
-- fund dropdown was actually used at issuance time, so fundId ended up in
-- raw_payload. Rows issued without a fund pick, or via the external-transfer
-- flow (which has no fund dropdown at all), stay uncategorized.
update issued_receipts ir
set category = f.name
from funds f
where ir.category is null
  and ir.raw_payload ->> 'fundId' = f.id::text;
