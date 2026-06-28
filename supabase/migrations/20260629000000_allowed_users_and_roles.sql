create table if not exists public.allowed_users (
  id bigint generated always as identity primary key,
  email text unique not null,
  full_name text,
  is_active boolean default true,
  created_at timestamp default now()
);

alter table public.allowed_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'allowed_users'
      and policyname = 'users can read own allowlist row'
  ) then
    create policy "users can read own allowlist row"
      on public.allowed_users
      for select
      to authenticated
      using (email = auth.email());
  end if;
end $$;

-- Add role column: admin | editor | viewer
alter table public.allowed_users
  add column if not exists role text
  default 'viewer'
  check (role in ('admin', 'editor', 'viewer'));

-- Add allowed_mosadim: array of mosad_number strings; NULL means all institutions
alter table public.allowed_users
  add column if not exists allowed_mosadim text[];

-- Seed the admin account (upsert so it is idempotent)
insert into public.allowed_users (email, full_name, role, is_active, allowed_mosadim)
values ('suiedarieh@gmail.com', 'Arieh Suied', 'admin', true, null)
on conflict (email) do update
  set role            = 'admin',
      is_active       = true,
      allowed_mosadim = null;

-- Helper function: returns true when the calling user is admin (avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.allowed_users
    where email = auth.email() and role = 'admin' and is_active = true
  );
$$;

-- Admins can read and modify all rows
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'allowed_users'
      and policyname = 'admins can manage all users'
  ) then
    create policy "admins can manage all users"
      on public.allowed_users
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
