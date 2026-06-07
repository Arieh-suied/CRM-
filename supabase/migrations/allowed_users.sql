create table if not exists public.allowed_users (
  id bigint generated always as identity primary key,
  email text unique not null,
  full_name text,
  is_active boolean default true,
  created_at timestamp default now()
);

alter table public.allowed_users enable row level security;

-- Authenticated users can only read their own row
create policy "users can read own allowlist row"
  on public.allowed_users
  for select
  to authenticated
  using (email = auth.email());
