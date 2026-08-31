// Manual fund-sheet entry — appends a row to a fund's sheet, replacing the
// manual step of opening the sheet and typing it in by hand. Same sheet/tab
// as the automated donation routing (see _transaction-route.js); every fund
// sheet shares the A=date/B=name/C=amount layout written by provisionSheet()
// in funds.js.
//
// Two directions:
//   'transfer' — money going out to a beneficiary (negative amount, name
//                defaults to a fixed "בוצע העברה" label).
//   'donation' — money that came in outside the automated channels (cash, a
//                transfer not caught by routing) and needs the same manual
//                entry a routed donation would have gotten (positive amount,
//                donor's name required).

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';
import { appendRow } from './_google-sheets.js';

const DEFAULT_DESCRIPTION = 'בוצע העברה';
const DIRECTIONS = new Set(['transfer', 'donation']);

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

  const { fundId, date, description, amount, direction } = req.body || {};

  if (!fundId) return res.status(400).json({ error: 'חסרה קרן' });

  const dir = DIRECTIONS.has(direction) ? direction : 'transfer';

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'סכום לא תקין' });
  }

  const name = description?.trim();
  if (dir === 'donation' && !name) return res.status(400).json({ error: 'חסר שם התורם' });

  const dmyDate = toDmy(date);
  if (!dmyDate) return res.status(400).json({ error: 'תאריך לא תקין' });

  const { data: fund, error: fundError } = await supabase
    .from('funds')
    .select('spreadsheet_id, sheet_name, name')
    .eq('id', fundId)
    .single();
  if (fundError || !fund) return res.status(404).json({ error: 'הקרן לא נמצאה' });

  const signedAmount = dir === 'donation' ? Math.abs(numAmount) : -Math.abs(numAmount);
  const row = [dmyDate, name || DEFAULT_DESCRIPTION, signedAmount];

  try {
    await appendRow(fund.spreadsheet_id, fund.sheet_name, row);
  } catch (err) {
    return res.status(500).json({ error: `כתיבה לגיליון נכשלה: ${err.message}` });
  }

  return res.status(200).json({ success: true, fundName: fund.name });
}
