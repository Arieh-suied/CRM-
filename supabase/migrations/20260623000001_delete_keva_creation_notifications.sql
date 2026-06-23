-- Cleanup: remove existing "new standing order created" notification rows that
-- were already inserted before the block_keva_creation_notifications trigger existed.
select count(*) from transactions
where keva_id is not null
  and transaction_time_raw is null
  and confirmation_code is null;

delete from transactions
where keva_id is not null
  and transaction_time_raw is null
  and confirmation_code is null;
