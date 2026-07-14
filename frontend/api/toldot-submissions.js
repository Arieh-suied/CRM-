// Authenticated CRM endpoint for reviewing external "תולדות נסים" transfer
// submissions and recording approved ones into bank_transfers (no receipt).
//
//   GET  → list submissions with status='new' (+ signed screenshot URLs).
//   POST → { id, action:'approve'|'reject', fields? }
//          'approve' inserts a bank_transfers row (mosad 7016650, no receipt)
//                    and marks the submission 'approved'.
//          'reject'  marks the submission 'rejected'.

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';

const STORAGE_BUCKET = 'transfer-screenshots';
const MOSAD_NUMBER = '7016650'; // תולדות נסים
const SIGNED_URL_TTL = 60 * 60; // 1h

// Convert a date to ISO (YYYY-MM-DD) when possible; returns null otherwise.
function toIso(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const user = await requireUser(req, res, supabase);
      if (!user) return;

      const { data, error } = await supabase
        .from('external_transfer_submissions')
        .select('*')
        .eq('status', 'new')
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });

      // Attach a short-lived signed URL for each stored screenshot.
      const rows = await Promise.all((data ?? []).map(async (row) => {
        let screenshot_url = null;
        if (row.screenshot_path) {
          const { data: signed } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(row.screenshot_path, SIGNED_URL_TTL);
          screenshot_url = signed?.signedUrl ?? null;
        }
        return { ...row, screenshot_url };
      }));

      return res.json({ data: rows });
    }

    if (req.method === 'POST') {
      const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
      if (!user) return;

      const { id, action, fields } = req.body || {};
      if (!id) return res.status(400).json({ error: 'חסר מזהה' });

      const { data: sub, error: fetchErr } = await supabase
        .from('external_transfer_submissions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (!sub) return res.status(404).json({ error: 'ההגשה לא נמצאה' });
      if (sub.status !== 'new') return res.status(409).json({ error: 'ההגשה כבר טופלה' });

      if (action === 'reject') {
        const { error } = await supabase
          .from('external_transfer_submissions')
          .update({ status: 'rejected' })
          .eq('id', id);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      if (action === 'approve') {
        // Merge any inline edits from the reviewer over the stored values.
        const f = fields || {};
        const name = String(f.customer_name ?? sub.customer_name ?? '').trim();
        const amount = f.amount != null && f.amount !== '' ? Number(f.amount) : sub.amount;
        if (name.length < 2) return res.status(400).json({ error: 'חסר שם' });
        if (!(amount > 0)) return res.status(400).json({ error: 'סכום לא תקין' });

        const pick = (k) => (f[k] !== undefined ? (f[k] || null) : (sub[k] ?? null));
        const rawDate = pick('transfer_date');
        const notes = pick('notes');
        const asmachta = pick('asmachta');

        const { error: btErr } = await supabase.from('bank_transfers').insert({
          customer_name:   name,
          transfer_amount: amount,
          currency:        'ILS',
          bank_name:       pick('bank_name'),
          bank_branch:     pick('bank_branch'),
          bank_account:    pick('bank_account'),
          document_number: asmachta ? String(asmachta) : '',
          document_date:   toIso(rawDate),
          document_date_raw: rawDate,
          document_note:   notes,
          receipt_id:      null,
          mosad_number:    MOSAD_NUMBER,
        });
        if (btErr) return res.status(500).json({ error: btErr.message });

        const { error: updErr } = await supabase
          .from('external_transfer_submissions')
          .update({ status: 'approved' })
          .eq('id', id);
        if (updErr) return res.status(500).json({ error: updErr.message });

        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'פעולה לא ידועה' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('toldot-submissions handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
