-- Some funds route transactions correctly but shouldn't clutter the ניהול
-- קרנות management table (e.g. duplicate-looking rows that write to the same
-- sheet under different mosad numbers). Hiding is display-only — routing in
-- _fund-routing.js still reads every row regardless of this flag.
alter table funds add column hidden boolean not null default false;
