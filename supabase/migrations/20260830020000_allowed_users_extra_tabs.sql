-- One-off tab grants beyond what a user's role normally sees — e.g. יחי ראובן
-- (role='institution') also needs the bank-refusals tab even though the
-- institution role generally doesn't. NULL/empty = no extra tabs.
alter table public.allowed_users
  add column if not exists extra_tabs text[];
