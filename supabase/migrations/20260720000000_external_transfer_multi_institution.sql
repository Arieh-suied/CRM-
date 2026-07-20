-- Generalizes the public transfer page (frontend/api/public-transfer.js) from
-- a תולדות נסים-only intake to a shared page for any institution: the
-- submitter now picks which institution the transfer is for.
--
-- institution_id: one of TRANSFER_INSTITUTIONS ids (see
--   frontend/api/_transfer-institutions.js) — drives both the EZCount branch
--   used to issue the receipt and the mosad_number used for Telegram/fund-
--   sheet routing on approval.
-- category: free-text "קטגוריה" set by the reviewer at approval time; folded
--   into the receipt comment and used as the routing group_name so an
--   approved transfer can match any fund's match_rules by category, same as
--   a normal transaction.
alter table external_transfer_submissions add column if not exists institution_id text;
alter table external_transfer_submissions add column if not exists category text;

-- Backfill: every row already in the queue (or already approved/rejected)
-- predates multi-institution support and is a תולדות נסים submission.
update external_transfer_submissions set institution_id = 'toldot' where institution_id is null;

-- mosad_number used to default to '7016650' (תולדות נסים) since that was the
-- only institution the page supported. Now every insert sets it explicitly
-- from the chosen institution, so a forgotten value should surface as NULL
-- rather than silently attributing the transfer to תולדות נסים.
alter table external_transfer_submissions alter column mosad_number drop default;
