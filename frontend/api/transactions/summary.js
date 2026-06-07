import { getSupabase } from '../_supabase.js';

function applyFilters(query, { mosad_number, transaction_type, group_name, date_from, date_to, search }) {
  if (mosad_number)      query = query.eq('mosad_number', mosad_number);
  if (transaction_type)  query = query.eq('transaction_type', transaction_type);
  if (group_name)        query = query.eq('group_name', group_name);
  if (date_from)         query = query.gte('transaction_time_iso', date_from);
  if (date_to)           query = query.lte('transaction_time_iso', date_to + 'T23:59:59');
  if (search)            query = query.or(`client_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,external_transaction_id.ilike.%${search}%`);
  return query;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    let query = supabase.from('transactions').select('amount, mosad_number, transaction_time_iso');
    query = applyFilters(query, req.query);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const byInstitution = {};
    let monthlyTotal = 0, yearlyTotal = 0;

    for (const row of data) {
      const amt = parseFloat(row.amount) || 0;
      const key = row.mosad_number || '__unknown__';
      if (row.transaction_time_iso) {
        const d = new Date(row.transaction_time_iso);
        if (d.getFullYear() === currentYear) {
          yearlyTotal += amt;
          if (d.getMonth() === currentMonth) {
            monthlyTotal += amt;
            byInstitution[key] = (byInstitution[key] || 0) + amt;
          }
        }
      }
    }

    const institutionBreakdown = Object.entries(byInstitution)
      .map(([mosad_number, total]) => ({ mosad_number, total }))
      .sort((a, b) => b.total - a.total);

    res.json({ institutionBreakdown, monthlyTotal, yearlyTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
