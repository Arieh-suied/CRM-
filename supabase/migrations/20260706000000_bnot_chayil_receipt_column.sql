-- Add receipt hyperlink column to the "בנות חיל" fund so each appended row
-- includes a clickable "הצג קבלה" link in the receipt column.
update funds
set columns = columns || '[{"type":"receipt"}]'::jsonb
where spreadsheet_id = '1-cc223545VRXGq3Bjiry7ZkqP0V45FM21q55qXb5-_0';
