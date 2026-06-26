-- Dynamic fund-routing table — replaces the static rule list that used to live in
-- frontend/api/_fund-routing.js, so creating a new fund from the CRM UI takes
-- effect immediately without a code deploy.
--
-- match_rules: array of OR-groups, each an array of AND-conditions.
--   [[{"field":"mosad_number","op":"eq","value":"7006026"}]]                                  -- single condition
--   [[{"field":"group_name","op":"eq","value":"קרן 25"}],[{"field":"comments","op":"eq","value":"בביאן"}]]  -- OR
--   field is one of: mosad_number | group_name | comments | masof_id
--   op is one of: eq | contains | not_contains
--
-- columns: ordered array describing each cell appended to the sheet row.
--   {"type":"date"} | {"type":"name"} | {"type":"comments"} | {"type":"group_name"}
--   {"type":"literal","text":"..."}
--   {"type":"amount","fee_pct":0.03,"fee_mult":1.17}   -- fee_pct/fee_mult optional, default to raw amount
create table if not exists funds (
  id             uuid default gen_random_uuid() primary key,
  name           text not null,
  spreadsheet_id text not null,
  sheet_name     text not null,
  match_rules    jsonb not null,
  columns        jsonb not null,
  created_by     text,
  created_at     timestamptz default now()
);

alter table funds enable row level security;

drop policy if exists "auth_read_funds" on funds;
create policy "auth_read_funds" on funds for select to authenticated using (true);

insert into funds (name, spreadsheet_id, sheet_name, match_rules, columns) values
('יפה ותמה (לא ישראכרט)', '1ALkvOV3tZ37D14xquUL_mMgTufMlERnn3R0XculiFEs', 'עסקות החודש',
  '[[{"field":"mosad_number","op":"eq","value":"7006026"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"literal","text":"הו\"ק"},{"type":"amount","fee_pct":0.02,"fee_mult":1.17}]'),
('יפה ותמה (ישראכרט)', '1ALkvOV3tZ37D14xquUL_mMgTufMlERnn3R0XculiFEs', 'עסקות החודש',
  '[[{"field":"mosad_number","op":"eq","value":"7006573"},{"field":"group_name","op":"not_contains","value":"סומך"},{"field":"comments","op":"not_contains","value":"סומך"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"literal","text":"ישראכרט הו\"ק"},{"type":"amount","fee_pct":0.02,"fee_mult":1.17}]'),
('קרן פרזיכרטר', '1zISCS82Wqlcd1MJNt7qKp_0_tHcV5v9wvho7nBTQsE8', 'קרן פרזיכטר',
  '[[{"field":"group_name","op":"eq","value":"קרן פרזיכרטר"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"literal","text":"הו\"ק"},{"type":"amount","fee_pct":0.02,"fee_mult":1.18}]'),
('להעמידם על רגליהם', '1x7eoQC-1G3QbFxf8HLmHCzEFRQScznCm4PZBT87P01k', 'עסקות',
  '[[{"field":"group_name","op":"eq","value":"להעמידם על רגליהם"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.02,"fee_mult":1.17}]'),
('סומך נופלים', '1D24p790Sre9aMRGLEqaQJbjHvdaZ4rfthf2zy7jHii8', 'הכנסות',
  '[[{"field":"mosad_number","op":"eq","value":"7001671"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"literal","text":"נדרים"},{"type":"comments"},{"type":"amount"}]'),
('קרן כהן', '1UUILH1Rn0GHQ9PZF5xAWz4lxDvTcbNqzwxVoPDVhBgA', 'עסקאות',
  '[[{"field":"comments","op":"eq","value":"קרן כהן"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.17}]'),
('קרן כמון', '14i_cNJU7l2wTK8mx6AXMht5KFTCVZdHowVi0S2oEmFs', 'עסקות',
  '[[{"field":"mosad_number","op":"eq","value":"7006375"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount"}]'),
('קרן בביאן (25)', '12tULC3EYDQgHWvF9fFrmP5BK1ZHon3uNPsDkGZy0lgo', 'נדרים',
  '[[{"field":"group_name","op":"eq","value":"קרן 25"}],[{"field":"comments","op":"eq","value":"קרן 25"}],[{"field":"comments","op":"eq","value":"בביאן"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.17}]'),
('קרן 27 בלאק', '1WF0XqP9Zive46xJgKNCbNvFXg8a17KcxhNghkGfHvFY', 'עסקות',
  '[[{"field":"group_name","op":"eq","value":"קרן 27"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.17}]'),
('קרן 29', '1BRf5Q9BQ9wnVXhEJ2YsuMGXIg4sI3h1SeXLrUyAiLYI', 'עסקאות',
  '[[{"field":"group_name","op":"eq","value":"קרן 29"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.17}]'),
('נושא בעול עם חברו', '1USs67Io9siB3mMAT1Ck0tKdL8sPrx3LqtmMnq3Lo_zY', 'עסקות',
  '[[{"field":"mosad_number","op":"eq","value":"7010105"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.17}]'),
('קרן משפחות ו', '1iKCGTxo703fNPyOpfX422K9GZTL1aUJvF9w-FDwaNRc', 'עסקות',
  '[[{"field":"mosad_number","op":"eq","value":"7005415"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.17}]'),
('מסוף נדרים חיים צור', '1KC8F0HqWV3aKUE8qvoQGPB5hjL74ugOK1hd7w39PGII', 'עסקאות',
  '[[{"field":"masof_id","op":"eq","value":"11190"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.17}]'),
('קרן 40', '1cIFfk3UVRvbsZcWRiSnC_bXDGM8tCLL_nvPxMNhbYgg', 'עסקות',
  '[[{"field":"group_name","op":"eq","value":"קרן 40"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.17}]'),
('שותפים לשמחת חתן וכלה (זלסקו)', '1X4zUXv8A1VTn9bdnjYIayPdHgpUC98fFTyLP2yOcKto', 'עסקות',
  '[[{"field":"group_name","op":"eq","value":"עזרה דחופה לידיד"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.03,"fee_mult":1.18}]'),
('יד ביד עם מאמע רחל', '1kwWRwdZNNGuoGbO0U1GpPuA6WMiEPAbqQw2rjJIqTCk', 'עסקאות IL',
  '[[{"field":"mosad_number","op":"eq","value":"7015926"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.02,"fee_mult":1.18}]'),
('יחי ראובן', '1BrK2wdEMB_1yZmAuyRsz5RcqwXh3dDyA63stflkfQuY', 'שכ"ר לימוד',
  '[[{"field":"group_name","op":"contains","value":"יחי ראובן"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount"}]'),
('בנות חיל', '1-cc223545VRXGq3Bjiry7ZkqP0V45FM21q55qXb5-_0', 'עסקות',
  '[[{"field":"mosad_number","op":"eq","value":"7016650"}]]',
  '[{"type":"date"},{"type":"name"},{"type":"amount","fee_pct":0.02,"fee_mult":1.18},{"type":"amount"}]');
