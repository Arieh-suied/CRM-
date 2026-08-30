// Monthly donation totals for the institution portal's "summary" tab.
// Scoped by the caller's allowed_mosadim/allowed_group_names (same as
// transactions.js / payment-failures.js — see _scope.js), backed by the
// institution_monthly_summary() Postgres function (see
// supabase/migrations/20260830010000_institution_role.sql) so the aggregate
// runs in the database instead of pulling every row to the client.

import { getSupabase } from './_supabase.js';
import { requireUser, INSTITUTION_READ_ROLES } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const user = await requireUser(req, res, supabase, { roles: INSTITUTION_READ_ROLES });
    if (!user) return;

    if (!user.allowedMosadim?.length) {
      return res.status(400).json({ error: 'הדוח הזה זמין רק למשתמש עם מוסד מוגדר' });
    }

    const { data, error } = await supabase.rpc('institution_monthly_summary', {
      p_mosad_numbers: user.allowedMosadim,
      p_group_names: user.allowedGroupNames?.length ? user.allowedGroupNames : null,
    });
    if (error) return res.status(500).json({ error: error.message });

    const rows = data ?? [];
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisYear = now.getFullYear();

    const monthTotal = rows.find((r) => r.month.startsWith(thisMonthKey))?.total_amount ?? 0;
    const yearRows = rows.filter((r) => r.month.startsWith(String(thisYear)));
    const yearTotal = yearRows.reduce((sum, r) => sum + Number(r.total_amount), 0);
    const yearCount = yearRows.reduce((sum, r) => sum + Number(r.donation_count), 0);

    res.json({
      monthTotal: Number(monthTotal),
      yearTotal,
      yearCount,
      months: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
