-- "New standing order created" notifications (keva_id set, no charge data) shouldn't
-- become transaction rows -- the actual charge notification arrives separately later.
create or replace function block_keva_creation_notifications()
returns trigger
language plpgsql
as $$
begin
  if new.keva_id is not null
    and new.transaction_time_raw is null
    and new.confirmation_code is null
  then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_keva_creation_notifications on transactions;

create trigger trg_block_keva_creation_notifications
before insert on transactions
for each row
execute function block_keva_creation_notifications();
