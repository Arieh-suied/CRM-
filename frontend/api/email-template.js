// Donor thank-you email template — read/update the single editable template
// (email_templates row id='donor_thanks') used by the auto-send hook in
// transaction-routed.js and prefilled into the manual SendEmailModal.
//
// GET — any authenticated user; PUT — admin/editor only.
//
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';

const TEMPLATE_ID = 'donor_thanks';

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const { data, error } = await supabase
      .from('email_templates')
      .select('subject, body, auto_send, updated_by, updated_at')
      .eq('id', TEMPLATE_ID)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'התבנית לא נמצאה — יש להריץ את המיגרציה' });
    return res.json(data);
  }

  if (req.method === 'PUT') {
    const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
    if (!user) return;

    const { subject, body, auto_send } = req.body || {};
    if (!subject?.trim()) return res.status(400).json({ error: 'חסר נושא למייל' });
    if (!body?.trim()) return res.status(400).json({ error: 'חסר תוכן להודעה' });

    const { data, error } = await supabase
      .from('email_templates')
      .upsert({
        id: TEMPLATE_ID,
        subject: subject.trim(),
        body,
        auto_send: Boolean(auto_send),
        updated_by: user.email,
        updated_at: new Date().toISOString(),
      })
      .select('subject, body, auto_send, updated_by, updated_at')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
