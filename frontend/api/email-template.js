// Donor thank-you email templates — one editable template per institution
// (email_templates keyed by mosad_number), used by the auto-send hook in
// transaction-routed.js and prefilled into the manual SendEmailModal. A
// template may carry one stored file (email-attachments Storage bucket) that
// is attached to every email sent from it.
//
// GET             — any authenticated user; all templates as an array
// GET ?mosad_number=X — single template (or null if the mosad has none)
// PUT             — admin/editor; upsert { mosad_number, subject, body,
//                   auto_send, attach_receipt, attachment?: { name, mime,
//                   dataBase64 }, remove_attachment?: true }
// DELETE ?mosad_number=X — admin/editor; remove the mosad's template (and file)
//
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';
import { ATTACHMENTS_BUCKET, MAX_ATTACHMENT_BYTES } from './_email.js';

const SELECT = 'mosad_number, subject, body, auto_send, attach_receipt, attachment_name, attachment_mime, updated_by, updated_at';

async function removeStoredFile(supabase, path) {
  if (!path) return;
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
  if (error) console.error(`email-template: failed to remove ${path}:`, error.message);
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const mosad = req.query?.mosad_number;
    if (mosad) {
      const { data, error } = await supabase
        .from('email_templates')
        .select(SELECT)
        .eq('mosad_number', String(mosad))
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data); // null when the mosad has no template yet
    }

    const { data, error } = await supabase
      .from('email_templates')
      .select(SELECT)
      .order('mosad_number');
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data ?? []);
  }

  if (req.method === 'PUT') {
    const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
    if (!user) return;

    const { mosad_number, subject, body, auto_send, attach_receipt, attachment, remove_attachment } = req.body || {};
    if (!mosad_number || !String(mosad_number).trim()) {
      return res.status(400).json({ error: 'חסר מספר מוסד' });
    }
    if (!subject?.trim()) return res.status(400).json({ error: 'חסר נושא למייל' });
    if (!body?.trim()) return res.status(400).json({ error: 'חסר תוכן להודעה' });
    const mosad = String(mosad_number).trim();

    const { data: existing } = await supabase
      .from('email_templates')
      .select('attachment_path')
      .eq('mosad_number', mosad)
      .maybeSingle();

    const row = {
      mosad_number: mosad,
      subject: subject.trim(),
      body,
      auto_send: Boolean(auto_send),
      attach_receipt: Boolean(attach_receipt),
      updated_by: user.email,
      updated_at: new Date().toISOString(),
    };

    if (attachment?.dataBase64) {
      const buffer = Buffer.from(attachment.dataBase64, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'הקובץ המצורף ריק' });
      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        return res.status(400).json({ error: 'הקובץ המצורף גדול מדי (מקסימום 3.5MB)' });
      }
      const originalName = String(attachment.name || 'attachment').slice(0, 120);
      const safeName = originalName.replace(/[^\w.\-֐-׿ ]/g, '_');
      const path = `${mosad}/${Date.now()}-${encodeURIComponent(safeName)}`;
      const { error: upErr } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, buffer, { contentType: attachment.mime || 'application/octet-stream', upsert: true });
      if (upErr) return res.status(500).json({ error: `העלאת הקובץ נכשלה: ${upErr.message}` });
      await removeStoredFile(supabase, existing?.attachment_path);
      row.attachment_path = path;
      row.attachment_name = originalName;
      row.attachment_mime = attachment.mime || 'application/octet-stream';
    } else if (remove_attachment) {
      await removeStoredFile(supabase, existing?.attachment_path);
      row.attachment_path = null;
      row.attachment_name = null;
      row.attachment_mime = null;
    }

    const { data, error } = await supabase
      .from('email_templates')
      .upsert(row)
      .select(SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
    if (!user) return;

    const mosad = req.query?.mosad_number;
    if (!mosad) return res.status(400).json({ error: 'חסר מספר מוסד' });

    const { data: existing } = await supabase
      .from('email_templates')
      .select('attachment_path')
      .eq('mosad_number', String(mosad))
      .maybeSingle();

    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('mosad_number', String(mosad));
    if (error) return res.status(500).json({ error: error.message });

    await removeStoredFile(supabase, existing?.attachment_path);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
