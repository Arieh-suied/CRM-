-- Institution self-service portal: a new read-only role scoped to one or more
-- mosad numbers, optionally narrowed further to specific group_name values
-- (some funds, e.g. "יחי ראובן", share a mosad_number with other funds under
-- the same institution — see frontend/api/_auth.js and _scope.js).

-- Widen the role CHECK to allow 'institution'. Two earlier migrations
-- (20260629000000_allowed_users_and_roles.sql and add_roles_to_allowed_users.sql)
-- both added an unnamed check on this column, so drop whatever check
-- constraints currently reference `role` by name rather than guessing the
-- auto-generated name, then add one fresh named constraint.
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.allowed_users'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.allowed_users drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.allowed_users
  add constraint allowed_users_role_check
  check (role in ('admin', 'editor', 'viewer', 'institution'));

-- Further restricts an institution user to specific group_name values within
-- their allowed_mosadim. NULL = no sub-fund restriction (every group under
-- the allowed mosad).
alter table public.allowed_users
  add column if not exists allowed_group_names text[];

-- Links the allowlist row to the real Supabase Auth user created for
-- email+password institution logins, so an admin can reset their password
-- later via supabase.auth.admin.updateUserById(auth_user_id, ...).
alter table public.allowed_users
  add column if not exists auth_user_id uuid;

-- Monthly donation totals for an institution's summary tab, scoped the same
-- way API endpoints scope row access (mosad_numbers required, group_names
-- optional). security definer so the anon/authenticated role can call it
-- without needing direct SELECT on `transactions_with_parsed_time`.
create or replace function public.institution_monthly_summary(
  p_mosad_numbers text[],
  p_group_names text[] default null
)
returns table (
  month date,
  total_amount numeric,
  donation_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('month', transaction_time_parsed)::date as month,
    coalesce(sum(amount), 0) as total_amount,
    count(*) as donation_count
  from transactions_with_parsed_time
  where mosad_number = any(p_mosad_numbers)
    and (p_group_names is null or group_name = any(p_group_names))
    and transaction_time_parsed >= (date_trunc('month', now()) - interval '11 months')
  group by 1
  order by 1;
$$;
