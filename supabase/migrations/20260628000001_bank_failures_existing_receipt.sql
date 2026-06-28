-- Nedarim+ sometimes already issues its own receipt number for a charge (visible in the
-- "מספר קבלה" column of GetMasavHistoryCSVNew) before this tool ever resolves the row.
-- Track it so the UI can warn/block before issuing a duplicate via EZCount.
alter table bank_standing_order_failures add column if not exists existing_receipt_number text;
