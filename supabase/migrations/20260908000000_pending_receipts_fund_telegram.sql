-- Lets a batch-receipt entry (pending_receipts) optionally be routed to a
-- fund's Google Sheet and/or trigger the institution's Telegram alert when
-- issued, same as the single-receipt form (QuickReceipt) already supports.
-- Defaults to send_telegram=false because batch imports are typically bulk/
-- historical entries that shouldn't each ping a live Telegram channel.
alter table pending_receipts
  add column if not exists fund_id uuid references funds(id) on delete set null,
  add column if not exists send_telegram boolean not null default false;
