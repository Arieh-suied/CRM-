// Manual fund-sheet entry — appends a row to a fund's sheet, replacing the
// manual step of opening the sheet and typing it in by hand. Same sheet/tab
// as the automated donation routing (see _transaction-route.js).
//
// Not every fund's sheet has the plain A=date/B=name/C=amount layout
// provisionSheet() writes for new funds — some older funds have an extra
// fixed column (e.g. a payment-type label) in between. Rather than assume
// one layout, this reuses the same `columns` spec each fund already carries
// for automated routing (funds.columns — see funds.js buildColumns /
// _fund-routing.js) to place values in the right cells for that fund's
// actual sheet.
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
const DEFAULT_COLUMNS = [{ type: 'date' }, { type: 'name' }, { type: 'amount' }];

// Sheet rows use DD/MM/YYYY everywhere; the date input gives YYYY-MM-DD.
function toDmy(raw) {
  const m = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Places {date, name, amount} into the cells the fund's own column spec
// expects. A fixed 'literal' column (e.g. a payment-type label) is written
// as-is, the same for every row, regardless of transfer/donation direction —
// it's a property of the fund's sheet layout, not of this entry.
function buildRow(columns, { dmyDate, name, amount }) {
  return columns.map((col) => {
    switch (col.type) {
      case 'date':   return dmyDate;
      case 'name':   return name;
      case 'literal': return col.text ?? '';
      case 'amount': return amount;
      default:       return '';
    }
  });
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
    .select('spreadsheet_id, sheet_name, name, columns')
    .eq('id', fundId)
    .single();
  if (fundError || !fund) return res.status(404).json({ error: 'הקרן לא נמצאה' });

  const signedAmount = dir === 'donation' ? Math.abs(numAmount) : -Math.abs(numAmount);
  const columns = Array.isArray(fund.columns) && fund.columns.length ? fund.columns : DEFAULT_COLUMNS;
  const row = buildRow(columns, { dmyDate, name: name || DEFAULT_DESCRIPTION, amount: signedAmount });

  try {
    await appendRow(fund.spreadsheet_id, fund.sheet_name, row);
  } catch (err) {
    return res.status(500).json({ error: `כתיבה לגיליון נכשלה: ${err.message}` });
  }

  return res.status(200).json({ success: true, fundName: fund.name });
}
