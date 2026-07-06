// Fund management — list funds with their live balance (cell A1 of each
// fund's sheet), and create new funds (optionally auto-provisioning a new
// Google Sheet copied from a template).
//
// Env vars required (same as transaction-routed.js):
//   GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY
//   FUNDS_TEMPLATE_SPREADSHEET_ID — spreadsheet copied for new funds
//   FUNDS_SHARE_EMAIL             — Google account the new copy is shared with

import { getSupabase } from './_supabase.js';
import { getRequestUser, requireUser } from './_auth.js';
import {
  getCellValue,
  copySpreadsheet,
  getFirstSheetTitle,
  clearRange,
  setValues,
  shareFile,
} from './_google-sheets.js';

const FIELD_LABELS = {
  mosad_number: 'מספר מוסד',
  group_name: 'קטגוריה',
  comments: 'הערות',
  masof_id: 'מסוף נדרים',
};
const ALLOWED_FIELDS = new Set(Object.keys(FIELD_LABELS));
const ALLOWED_OPS = new Set(['eq', 'contains', 'not_contains']);

// Not every fund sheet keeps a running-balance formula in A1 — some start
// straight into the header row instead. Only trust A1 as a balance if it
// actually looks like a currency amount.
function looksLikeBalance(value) {
  return typeof value === 'string' && /^-?\s*₪/.test(value.trim());
}

async function handleGet(req, res, supabase) {
  const { data, error } = await supabase.from('funds').select('*').eq('hidden', false).order('name');
  if (error) return res.status(500).json({ error: error.message });

  const withBalances = await Promise.all(
    (data ?? []).map(async (fund) => {
      let balance = null;
      let balanceError = null;
      try {
        const raw = await getCellValue(fund.spreadsheet_id, fund.sheet_name, fund.balance_cell || 'A1');
        balance = looksLikeBalance(raw) ? raw : null;
      } catch (err) {
        balanceError = err.message;
      }
      return {
        id: fund.id,
        name: fund.name,
        spreadsheetId: fund.spreadsheet_id,
        sheetName: fund.sheet_name,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${fund.spreadsheet_id}`,
        matchRules: fund.match_rules,
        columns: fund.columns,
        balance,
        balanceError,
      };
    })
  );

  return res.json(withBalances);
}

function buildMatchRules(conditions) {
  // Single AND-group from the simplified creation form (one OR-group only).
  for (const c of conditions) {
    if (!ALLOWED_FIELDS.has(c.field)) throw new Error(`שדה לא מוכר: ${c.field}`);
    if (!ALLOWED_OPS.has(c.op)) throw new Error(`תנאי לא מוכר: ${c.op}`);
    if (!c.value || !String(c.value).trim()) throw new Error('חסר ערך להתאמה');
  }
  return [conditions.map((c) => ({ field: c.field, op: c.op, value: String(c.value).trim() }))];
}

function buildColumns(feePct, feeMult, extraLiteral) {
  const columns = [{ type: 'date' }, { type: 'name' }];
  if (extraLiteral) columns.push({ type: 'literal', text: extraLiteral });
  columns.push({ type: 'amount', fee_pct: feePct || 0, fee_mult: feeMult || 1 });
  return columns;
}

async function provisionSheet(name) {
  const templateId = process.env.FUNDS_TEMPLATE_SPREADSHEET_ID;
  const shareEmail = process.env.FUNDS_SHARE_EMAIL;
  if (!templateId) throw new Error('Missing env var: FUNDS_TEMPLATE_SPREADSHEET_ID');

  const newId = await copySpreadsheet(templateId, name);
  const sheetName = await getFirstSheetTitle(newId);

  // The template (a real fund's sheet) carries historical data rows past row 2 —
  // wipe them before this copy is usable as a fresh fund. Verify before sharing.
  await clearRange(newId, sheetName, 'A3:Z100000');
  const leftoverCheck = await getCellValue(newId, sheetName, 'A3');
  if (leftoverCheck) throw new Error('ניקוי שורות הנתונים מהתבנית נכשל — לא משתפים את הקובץ');

  await setValues(newId, sheetName, 'A2:C2', [['תאריך', 'שם', 'סכום']]);
  if (shareEmail) await shareFile(newId, shareEmail);

  return { spreadsheetId: newId, sheetName };
}

async function handlePost(req, res, supabase, requestUser) {
  if (requestUser?.role !== 'admin') {
    return res.status(403).json({ error: 'רק מנהל המערכת יכול ליצור קרן חדשה' });
  }

  const { name, conditions, feePct, feeMult, extraLiteral, createSheet, spreadsheetId, sheetName } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'חסר שם קרן' });
  if (!Array.isArray(conditions) || !conditions.length) {
    return res.status(400).json({ error: 'חסר תנאי ניתוב אחד לפחות' });
  }

  let matchRules;
  try {
    matchRules = buildMatchRules(conditions);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const columns = buildColumns(feePct, feeMult, extraLiteral);

  let sheetInfo;
  if (createSheet) {
    try {
      sheetInfo = await provisionSheet(name.trim());
    } catch (err) {
      return res.status(500).json({ error: `יצירת הגיליון נכשלה: ${err.message}` });
    }
  } else {
    if (!spreadsheetId?.trim() || !sheetName?.trim()) {
      return res.status(400).json({ error: 'חסר מזהה גיליון ושם טאב, או בחר ליצור גיליון אוטומטית' });
    }
    sheetInfo = { spreadsheetId: spreadsheetId.trim(), sheetName: sheetName.trim() };
  }

  const { data, error } = await supabase
    .from('funds')
    .insert({
      name: name.trim(),
      spreadsheet_id: sheetInfo.spreadsheetId,
      sheet_name: sheetInfo.sheetName,
      match_rules: matchRules,
      columns,
      created_by: requestUser.email,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ ...data, sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetInfo.spreadsheetId}` });
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const user = await requireUser(req, res, supabase);
    if (!user) return;
    return handleGet(req, res, supabase);
  }

  if (req.method === 'POST') {
    const requestUser = await getRequestUser(req, supabase);
    return handlePost(req, res, supabase, requestUser);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
