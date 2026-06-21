create table public.institutions (
  id bigint generated always as identity primary key,
  mosad_number text not null unique,
  mosad_name text not null,
  created_at timestamp without time zone default now()
);

create index idx_institutions_mosad_number on public.institutions using btree (mosad_number);
