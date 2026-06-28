-- The seed migration (20260626000000_funds_table.sql) was re-applied against
-- production on 2026-06-28, duplicating every fund row. Since
-- _fund-routing.js appends a sheet row per matching fund row, this caused
-- every transaction to be routed twice. A unique constraint on name prevents
-- a repeat insert from silently duplicating funds again.
alter table funds add constraint funds_name_key unique (name);
