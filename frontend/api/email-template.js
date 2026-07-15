// Donor thank-you email templates — one editable template per institution
// (email_templates keyed by mosad_number), used by the auto-send hook in
// transaction-routed.js and prefilled into the manual SendEmailModal.
//
// GET             — any authenticated user; all templates as an array
// GET ?mosad_number=X — single template (or null if the mosad has none)
// PUT             — admin/editor; upsert { mosad_number, subject, body, auto_send }
// DELETE ?mosad_number=X — admin/editor; remove the mosad's template
//
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const mosad = req.query?.mosad_number;
    if (mosad) {
      const { data, error } = await supabase
        .from('email_templates')
        .select('mosad_number, subject, body, auto_send, attach_receipt, updated_by, updated_at')
        .eq('mosad_number', String(mosad))
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data); // null when the mosad has no template yet
    }

    const { data, error } = await supabase
      .from('email_templates')
      .select('mosad_number, subject, body, auto_send, attach_receipt, updated_by, updated_at')
      .order('mosad_number');
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data ?? []);
  }

  if (req.method === 'PUT') {
    const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
    if (!user) return;

    const { mosad_number, subject, body, auto_send, attach_receipt } = req.body || {};
    if (!mosad_number || !String(mosad_number).trim()) {
      return res.status(400).json({ error: 'חסר מספר מוסד' });
    }
    if (!subject?.trim()) return res.status(400).json({ error: 'חסר נושא למייל' });
    if (!body?.trim()) return res.status(400).json({ error: 'חסר תוכן להודעה' });

    const { data, error } = await supabase
      .from('email_templates')
      .upsert({
        mosad_number: String(mosad_number).trim(),
        subject: subject.trim(),
        body,
        auto_send: Boolean(auto_send),
        attach_receipt: Boolean(attach_receipt),
        updated_by: user.email,
        updated_at: new Date().toISOString(),
      })
      .select('mosad_number, subject, body, auto_send, attach_receipt, updated_by, updated_at')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
    if (!user) return;

    const mosad = req.query?.mosad_number;
    if (!mosad) return res.status(400).json({ error: 'חסר מספר מוסד' });

    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('mosad_number', String(mosad));
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
