// Authenticated CRM endpoint for reviewing external "תולדות נסים" transfer
// submissions and issuing a donation receipt for approved ones.
//
//   GET  → list submissions with status='new' (+ signed screenshot URLs).
//   POST → { id, action:'approve'|'reject', fields? }
//          'approve' issues an EZCount donation receipt under "סומך נופלים"
//                    (which also records it in bank_transfers / issued_receipts)
//                    and marks the submission 'approved'.
//          'reject'  marks the submission 'rejected'.

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';
import { issueReceipt } from './_receipts-core.js';

const STORAGE_BUCKET = 'transfer-screenshots';
const RECEIPT_BRANCH = 'סומך נופלים'; // approvals issue a donation receipt under this branch
const SIGNED_URL_TTL = 60 * 60; // 1h

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
        const idNumber = String(f.id_number ?? sub.id_number ?? '').trim();
        const amount = f.amount != null && f.amount !== '' ? Number(f.amount) : sub.amount;
        if (name.length < 2) return res.status(400).json({ error: 'חסר שם' });
        if (!idNumber) return res.status(400).json({ error: 'חסרה תעודת זהות' });
        if (!(amount > 0)) return res.status(400).json({ error: 'סכום לא תקין' });

        const pick = (k) => (f[k] !== undefined ? (f[k] || null) : (sub[k] ?? null));
        const rawDate = pick('transfer_date');
        const asmachta = pick('asmachta');
        // Fold the reference number into the receipt comment so it stays on record.
        const notes = [pick('notes'), asmachta ? `אסמכתא: ${asmachta}` : null]
          .filter(Boolean).join(' | ') || null;

        // Issue an EZCount donation receipt under "סומך נופלים". This also writes
        // bank_transfers / issued_receipts / customers (shared with the manual
        // receipts flow), so the transfer is fully recorded with a receipt link.
        const result = await issueReceipt({
          branch: RECEIPT_BRANCH,
          customerName: name,
          customerId: idNumber,
          amount,
          notes,
          payments: [{
            paymentMethod: 4, // bank transfer
            amount,
            bankName: pick('bank_name'),
            bankBranch: pick('bank_branch'),
            bankAccount: pick('bank_account'),
            transferDate: rawDate,
          }],
        });

        if (!result.success) {
          // Leave the submission as 'new' so it can be retried after the error is fixed.
          return res.status(result.status || 502).json({ error: result.error || 'הנפקת הקבלה נכשלה' });
        }

        const { error: updErr } = await supabase
          .from('external_transfer_submissions')
          .update({ status: 'approved', doc_number: String(result.docNumber || '') })
          .eq('id', id);
        if (updErr) return res.status(500).json({ error: updErr.message });

        return res.json({ success: true, docNumber: result.docNumber, docUrl: result.docUrl });
      }

      return res.status(400).json({ error: 'פעולה לא ידועה' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('toldot-submissions handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
