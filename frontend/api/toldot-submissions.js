// Authenticated CRM endpoint for reviewing external bank-transfer submissions
// (any institution — see _transfer-institutions.js) and issuing a receipt for
// approved ones.
//
//   GET  → list submissions with status='new' (+ signed screenshot URLs, and a
//          silently-suggested id_number when one is missing — see
//          suggestIdNumber below).
//   POST → { id, action:'approve'|'reject', fields? }
//          'approve' issues an EZCount receipt under the submission's chosen
//                    institution/branch (which also records it in
//                    bank_transfers / issued_receipts) and marks the
//                    submission 'approved'.
//          'reject'  marks the submission 'rejected'.

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';
import { issueReceipt } from './_receipts-core.js';
import { routeTransaction } from './_transaction-route.js';
import { institutionById } from './_transfer-institutions.js';

const STORAGE_BUCKET = 'transfer-screenshots';
const SIGNED_URL_TTL = 60 * 60; // 1h

// EZCount expects dates as DD/MM/YYYY — a YYYY-MM-DD value (what the date input
// and OCR produce) fails issuance. Convert to DD/MM/YYYY; pass through anything
// already in that shape.
function toDmy(raw) {
  if (!raw) return raw;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
  }
  return s;
}

// A missing id_number is the main thing blocking approval, so before showing
// a submission to the reviewer, try to fill it in from an existing customer
// record — matched by donor name first, then by bank account — but only when
// the match is unambiguous (exactly one candidate). Silent (no confirmation
// step): the reviewer sees the field already filled and can still edit it.
async function suggestIdNumber(supabase, sub) {
  if (sub.id_number) return null;
  try {
    const name = (sub.customer_name || '').trim();
    if (name) {
      const { data } = await supabase
        .from('customers')
        .select('id_number')
        .ilike('name', name)
        .not('id_number', 'is', null);
      if (data?.length === 1) return data[0].id_number;
    }
    const account = (sub.bank_account || '').trim();
    if (account) {
      const { data } = await supabase
        .from('customers')
        .select('id_number')
        .eq('bank_account', account)
        .not('id_number', 'is', null);
      if (data?.length === 1) return data[0].id_number;
    }
  } catch (err) {
    console.error('suggestIdNumber lookup error:', err.message);
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

      // Attach a short-lived signed URL for each stored screenshot, plus a
      // suggested id_number when the submission is missing one.
      const rows = await Promise.all((data ?? []).map(async (row) => {
        let screenshot_url = null;
        if (row.screenshot_path) {
          const { data: signed } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(row.screenshot_path, SIGNED_URL_TTL);
          screenshot_url = signed?.signedUrl ?? null;
        }
        const suggested_id_number = await suggestIdNumber(supabase, row);
        return { ...row, screenshot_url, suggested_id_number };
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
        const institution = institutionById(f.institution_id ?? sub.institution_id);
        if (!institution) return res.status(400).json({ error: 'מוסד לא תקין' });

        const name = String(f.customer_name ?? sub.customer_name ?? '').trim();
        const idNumber = String(f.id_number ?? sub.id_number ?? '').trim();
        const amount = f.amount != null && f.amount !== '' ? Number(f.amount) : sub.amount;
        if (name.length < 2) return res.status(400).json({ error: 'חסר שם' });
        if (!idNumber) return res.status(400).json({ error: 'חסרה תעודת זהות' });
        if (!(amount > 0)) return res.status(400).json({ error: 'סכום לא תקין' });

        const pick = (k) => (f[k] !== undefined ? (f[k] || null) : (sub[k] ?? null));
        const email = pick('email');
        const phone = pick('phone');
        const address = pick('address');
        const dmyDate = toDmy(pick('transfer_date')); // DD/MM/YYYY for EZCount
        const asmachta = pick('asmachta');
        const category = f.category ? String(f.category).trim() : null;
        // Fold the reference number and category into the receipt comment so
        // both stay on record even though they aren't dedicated EZCount fields.
        const notes = [
          pick('notes'),
          asmachta ? `אסמכתא: ${asmachta}` : null,
          category ? `קטגוריה: ${category}` : null,
        ].filter(Boolean).join(' | ') || null;

        // Issue an EZCount receipt under the chosen institution/branch. This
        // also writes bank_transfers / issued_receipts / customers (shared
        // with the manual receipts flow), so the transfer is fully recorded
        // with a receipt link.
        const result = await issueReceipt({
          branch: institution.branch,
          customerName: name,
          customerId: idNumber,
          customerEmail: email,
          customerPhone: phone,
          customerAddress: address,
          amount,
          notes,
          payments: [{
            paymentMethod: 4, // bank transfer
            amount,
            bankName: pick('bank_name'),
            bankBranch: pick('bank_branch'),
            bankAccount: pick('bank_account'),
            transferDate: dmyDate,
          }],
        });

        if (!result.success) {
          // Leave the submission as 'new' so it can be retried after the error is fixed.
          return res.status(result.status || 502).json({ error: result.error || 'הנפקת הקבלה נכשלה' });
        }

        // Mark approved FIRST (critical). The receipt is already issued, so the
        // row must not stay 'new' — otherwise a retry would issue a duplicate.
        const { error: updErr } = await supabase
          .from('external_transfer_submissions')
          .update({ status: 'approved' })
          .eq('id', id);
        if (updErr) return res.status(500).json({ error: updErr.message });

        // Best-effort: store the receipt number. The doc_number column may not
        // exist yet if the latest migration hasn't been run — ignore any error
        // so a missing column never blocks (or duplicates) an approval.
        await supabase
          .from('external_transfer_submissions')
          .update({ doc_number: String(result.docNumber || '') })
          .eq('id', id);

        // Notify the institution's Telegram channel and append the donation to
        // its fund Google Sheet (if one is configured — institutions without a
        // matching fund rule, e.g. חכמי ירושלים, simply get no sheet row),
        // reusing the same routing as the automatic transactions webhook.
        // Non-fatal: the receipt is already issued and the row already
        // approved, so a routing hiccup can't block it.
        let routing = null;
        try {
          routing = await routeTransaction(supabase, {
            mosad_number:         institution.mosadNumber,
            client_name:          name,
            amount,
            comments:             notes || '',
            group_name:           category || institution.label,
            transaction_time_raw: dmyDate || toDmy(new Date().toISOString().slice(0, 10)),
            receipt_data:         result.receiptId || '',
            skip_fee:             true, // bank transfer — no fee deduction in the fund sheet
          });
        } catch (routeErr) {
          console.error('external-transfer approve routing error:', routeErr);
        }

        return res.json({
          success: true,
          docNumber: result.docNumber,
          docUrl: result.docUrl,
          institutionLabel: institution.label,
          routing,
        });
      }

      return res.status(400).json({ error: 'פעולה לא ידועה' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('toldot-submissions handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
