-- Route transactions whose *category* (group_name) names תולדות נסים to the
-- תולדות ניסים fund sheet even when they arrive through a different mosad —
-- previously the fund's match_rules only matched mosad_number 7016650.
-- The category is spelled inconsistently ("Toldot Nissim - תולדות נסים",
-- נסים/ניסים), so match on the distinctive "תולדות"/"Toldot" tokens, mirroring
-- isToldotNisimName() in frontend/api/_transaction-notify.js.
update funds
set match_rules = match_rules
  || '[[{"field":"group_name","op":"contains","value":"תולדות"}]]'::jsonb
  || '[[{"field":"group_name","op":"contains","value":"Toldot"}]]'::jsonb
where spreadsheet_id = '1-cc223545VRXGq3Bjiry7ZkqP0V45FM21q55qXb5-_0'
  and not match_rules @> '[[{"field":"group_name","op":"contains","value":"תולדות"}]]'::jsonb;
