// PUBLIC endpoint for the shared external bank-transfer upload page (any
// institution — see _transfer-institutions.js for the list).
// No Supabase login — the external contact has no account. Guarded by a shared
// secret (TOLDOT_PUBLIC_TOKEN), mirroring the grow-webhook.js pattern.
//
// Two actions (req.body.action):
//   'ocr'    → runs OpenAI-vision extraction on an uploaded screenshot.
//   'submit' → stores the screenshot, records a pending submission, and sends a
//              personal Telegram alert (text + photo). Does NOT issue a receipt.
//
// Env vars: TOLDOT_PUBLIC_TOKEN, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN,
//           TELEGRAM_CHAT_TOLDOT_ADMIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { randomUUID } from 'crypto';
import { getSupabase } from './_supabase.js';
import { sendTelegramMessage, sendTelegramPhoto } from './_telegram.js';
import { institutionById } from './_transfer-institutions.js';
import {
  parseTransferImage, validateImageInput, ParseTransferError, ALLOWED_MIME,
} from './_parse-transfer-core.js';

const STORAGE_BUCKET = 'transfer-screenshots';
// Default alert destination (Telegram channel). Overridable via env var.
const DEFAULT_ADMIN_CHAT = '-1004432425929';

function fmt(label, value) {
  return value ? `${label}: ${value}` : null;
}

function buildCaption(fields, institutionLabel) {
  const lines = [
    `📥 העברה בנקאית חדשה — ${institutionLabel}`,
    fmt('שם', fields.customer_name),
    fmt('ת.ז', fields.id_number),
    fmt('מייל', fields.email),
    fmt('טלפון', fields.phone),
    fmt('כתובת', fields.address),
    fields.amount != null ? `סכום: ${fields.amount} ₪` : null,
    fmt('תאריך', fields.transfer_date),
    fmt('אסמכתא', fields.asmachta),
    fmt('בנק', fields.bank_name),
    fmt('סניף', fields.bank_branch),
    fmt('חשבון', fields.bank_account),
    fmt('הערות', fields.notes),
    '',
    'ממתין לאישורך במערכת (לשונית קבלות → העברות מהדף החיצוני).',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Shared-secret gate (same pattern as grow-webhook.js). While the env var is
  // unset the endpoint stays open, so the flow keeps working until it's wired up.
  const secret = process.env.TOLDOT_PUBLIC_TOKEN;
  if (secret) {
    const provided = req.headers['x-webhook-secret'] || req.query?.secret || req.body?.token;
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action } = req.body || {};

  try {
    if (action === 'ocr') {
      const { image, mimeType } = req.body || {};
      const result = await parseTransferImage({ image, mimeType });
      return res.status(200).json(result);
    }

    if (action === 'submit') {
      const { image, mimeType, fields } = req.body || {};
      validateImageInput(image, mimeType);
      if (!ALLOWED_MIME.includes(mimeType)) {
        return res.status(400).json({ error: 'סוג קובץ לא נתמך' });
      }

      const f = fields || {};
      const institution = institutionById(f.institution_id);
      const name = String(f.customer_name || '').trim();
      const idNumber = String(f.id_number || '').trim();
      const amount = f.amount != null && f.amount !== '' ? Number(f.amount) : null;
      if (!institution) return res.status(400).json({ error: 'יש לבחור מוסד' });
      if (name.length < 2) return res.status(400).json({ error: 'חסר שם שולח' });
      if (!(amount > 0)) return res.status(400).json({ error: 'סכום לא תקין' });

      const clean = {
        customer_name: name,
        id_number: idNumber || null,
        email:   f.email ? String(f.email).trim() : null,
        phone:   f.phone ? String(f.phone).trim() : null,
        address: f.address ? String(f.address).trim() : null,
        amount,
        transfer_date: f.transfer_date ? String(f.transfer_date).trim() : null,
        asmachta:      f.asmachta ? String(f.asmachta).trim() : null,
        bank_name:     f.bank_name ? String(f.bank_name).trim() : null,
        bank_branch:   f.bank_branch ? String(f.bank_branch).trim() : null,
        bank_account:  f.bank_account ? String(f.bank_account).trim() : null,
        notes:         f.notes ? String(f.notes).trim() : null,
      };

      const supabase = getSupabase();

      // Upload the screenshot to Supabase Storage so the CRM reviewer (and the
      // Telegram alert) can see it. Failure here is non-fatal — the submission
      // still records, just without a stored image.
      const raw = image.startsWith('data:') ? image.slice(image.indexOf(',') + 1) : image;
      const bytes = Buffer.from(raw, 'base64');
      const ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

      let screenshotPath = null;
      try {
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, bytes, { contentType: mimeType, upsert: false });
        if (upErr) throw upErr;
        screenshotPath = path;
      } catch (upErr) {
        console.error('screenshot upload error:', upErr.message);
      }

      const { data: row, error: insErr } = await supabase
        .from('external_transfer_submissions')
        .insert({
          status: 'new',
          institution_id: institution.id,
          mosad_number: institution.mosadNumber,
          customer_name: clean.customer_name,
          id_number: clean.id_number,
          email: clean.email,
          phone: clean.phone,
          address: clean.address,
          amount: clean.amount,
          transfer_date: clean.transfer_date,
          asmachta: clean.asmachta,
          bank_name: clean.bank_name,
          bank_branch: clean.bank_branch,
          bank_account: clean.bank_account,
          notes: clean.notes,
          screenshot_path: screenshotPath,
          source: 'public-transfer',
        })
        .select('id')
        .single();
      if (insErr) throw insErr;

      // Personal Telegram alert (photo + details). Non-fatal on failure.
      const adminChat = process.env.TELEGRAM_CHAT_TOLDOT_ADMIN || DEFAULT_ADMIN_CHAT;
      if (adminChat) {
        const caption = buildCaption(clean, institution.label);
        try {
          await sendTelegramPhoto(adminChat, { base64: image, mimeType }, caption);
        } catch (tgErr) {
          console.error('telegram sendPhoto error:', tgErr.message);
          // Fall back to a text-only alert so you're notified even if the photo fails.
          try {
            await sendTelegramMessage(adminChat, caption);
          } catch (tg2) {
            console.error('telegram sendMessage fallback error:', tg2.message);
          }
        }
      }

      return res.status(200).json({ success: true, id: row.id });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    if (err instanceof ParseTransferError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('public-transfer handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
