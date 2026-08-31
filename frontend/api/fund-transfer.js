// Manual "transfer to beneficiary" entry — appends a negative-amount row to a
// fund's sheet, replacing the manual step of opening the sheet and typing it
// in by hand. Same sheet/tab as the automated donation routing (see
// _transaction-route.js); every fund sheet shares the A=date/B=name/C=amount
// layout written by provisionSheet() in funds.js.

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';
import { appendRow } from './_google-sheets.js';

const DEFAULT_DESCRIPTION = 'בוצע העברה';

// Sheet rows use DD/MM/YYYY everywhere; the date input gives YYYY-MM-DD.
function toDmy(raw) {
  const m = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
  if (!user) return;

  const { fundId, date, description, amount } = req.body || {};

  if (!fundId) return res.status(400).json({ error: 'חסרה קרן' });

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'סכום לא תקין' });
  }

  const dmyDate = toDmy(date);
  if (!dmyDate) return res.status(400).json({ error: 'תאריך לא תקין' });

  const { data: fund, error: fundError } = await supabase
    .from('funds')
    .select('spreadsheet_id, sheet_name, name')
    .eq('id', fundId)
    .single();
  if (fundError || !fund) return res.status(404).json({ error: 'הקרן לא נמצאה' });

  const row = [dmyDate, description?.trim() || DEFAULT_DESCRIPTION, -Math.abs(numAmount)];

  try {
    await appendRow(fund.spreadsheet_id, fund.sheet_name, row);
  } catch (err) {
    return res.status(500).json({ error: `כתיבה לגיליון נכשלה: ${err.message}` });
  }

  return res.status(200).json({ success: true, fundName: fund.name });
}
