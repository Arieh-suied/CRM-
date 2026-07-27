-- The יפה ותמה funds wrote a hardcoded "הו"ק" (or "ישראכרט הו"ק") literal into
-- every row regardless of the actual charge type. Nedarim only sets keva_id on
-- charges belonging to a recurring standing order ("Keva") — its absence means
-- a one-off/web charge — so use that to write the real kind again, matching
-- what the sheet showed before the 20260626 funds-table migration flattened it
-- to a static literal.
--   {"type":"literal_by_keva","keva_text":"...","web_text":"..."}  -- picks
--   keva_text when row.keva_id is set, web_text otherwise.

update funds
set columns = '[{"type":"date"},{"type":"name"},{"type":"literal_by_keva","keva_text":"נדרים - הוראת קבע","web_text":"נדרים - אינטרנט"},{"type":"amount","fee_pct":0.02,"fee_mult":1.17}]'
where name = 'יפה ותמה (לא ישראכרט)';

update funds
set columns = '[{"type":"date"},{"type":"name"},{"type":"literal","text":"ישראכרט"},{"type":"amount","fee_pct":0.02,"fee_mult":1.17}]'
where name = 'יפה ותמה (ישראכרט)';
