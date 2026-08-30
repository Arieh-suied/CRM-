-- 20260727000000_yafe_vetama_dynamic_kind.sql targeted a fund named
-- 'יפה ותמה (לא ישראכרט)', but the actual row in `funds` is named plain
-- 'יפה ותמה' — the update matched zero rows, so every charge kept getting
-- the hardcoded "הו"ק" literal regardless of keva_id. Apply the same fix to
-- the fund that actually exists.

update funds
set columns = '[{"type":"date"},{"type":"name"},{"type":"literal_by_keva","keva_text":"נדרים - הוראת קבע","web_text":"נדרים - אינטרנט"},{"type":"amount","fee_pct":0.02,"fee_mult":1.17}]'
where name = 'יפה ותמה';
