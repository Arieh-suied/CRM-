// Receives Nedarim Plus's native "עדכוני סירובים" (refusal updates) webhook —
// a separate Callback URL from the transaction webhook, configured by Nedarim
// support per institution (מסך עוד > Webhook, in their dashboard, not ours).
// Fires on every declined/failed transaction AND every failed הו"ק (standing
// order) charge attempt, including the robot's repeat monthly retries.
// Replaces/complements the Gmail-scraping sync (gmail-sync.js) for the same
// data, but delivered in real time instead of parsed out of an alert email.
//
// No shared secret is supported by Nedarim for this webhook — the only
// verification they offer is a fixed sender-IP allowlist (their own
// recommendation), enforced below.
// 3.93.16.70 added 2026-09-11, also confirmed directly by Nedarim.
//
// Env vars: none new — reuses SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY,
// TELEGRAM_BOT_TOKEN, and the existing TELEGRAM_CHAT_REFUSALS_* /
// TELEGRAM_CHAT_BNOT_CHAYIL vars via refusalChatId().

import { getSupabase } from './_supabase.js';
import { sendTelegramMessage } from './_telegram.js';
import { refusalChatId } from './_transaction-notify.js';

const ALLOWED_IPS = ['18.196.146.117', '18.194.219.73', '3.93.16.70'];

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (!fwd) return req.socket?.remoteAddress || null;
  return String(fwd).split(',')[0].trim();
}

async function resolveInstitutionName(supabase, mosadNumber) {
  if (!mosadNumber) return null;
  const { data } = await supabase
    .from('institutions')
    .select('mosad_name')
    .eq('mosad_number', String(mosadNumber))
    .maybeSingle();
  return data?.mosad_name || String(mosadNumber);
}

function buildRefusalText(record, body) {
  const lines = [`⚠️ סירוב תשלום${record.institution_name ? ' ב' + record.institution_name : ''}`];
  lines.push(`שם: ${record.customer_name || '—'}`);
  lines.push(`סכום: ${record.amount ?? '—'}₪`);
  lines.push(`סיבה: ${record.error_reason || '—'}`);
  lines.push(`סוג: ${record.payment_kind}`);
  if (record.order_number) lines.push(`מספר הוראה: ${record.order_number}`);
  if (body.IsFirstKevaTry === '0' || body.IsFirstKevaTry === 0) lines.push('(ניסיון חיוב חוזר של הרובוט)');
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // IP allowlist temporarily set to log-only (not blocking) as of 2026-09-11
  // after the nedarim-webhook JWT deploy incident spooked confidence in this
  // check — re-enable the `return res.status(403)...` below once confirmed safe.
  const ip = clientIp(req);
  if (ip && !ALLOWED_IPS.includes(ip)) {
    console.error(`nedarim-refusal-webhook: unexpected IP ${ip} (log-only, not blocking)`);
    const chatId = process.env.TELEGRAM_CHAT_SECURITY_ALERTS;
    if (chatId) {
      // Awaited (not fire-and-forget) — a Vercel serverless function can be
      // torn down right after the response is sent, which would silently
      // drop an un-awaited Telegram call.
      try {
        await sendTelegramMessage(chatId, `⚠️ עדכון סירובים מנדרים מכתובת IP לא מוכרת: ${ip} (לא נחסם, log-only)\nייתכן שזו כתובת חדשה של נדרים, כדאי לברר מולם. אם זה קורה שוב ושוב, ייתכן שזה ניסיון הונאה.`);
      } catch (err) {
        console.error('nedarim-refusal-webhook telegram error:', err);
      }
    }
    // return res.status(403).json({ error: 'Unauthorized source' });
  }

  const body = req.body || {};
  try {
    const supabase = getSupabase();
    const institutionName = await resolveInstitutionName(supabase, body.MosadNumber);

    const record = {
      source: 'nedarim_webhook',
      institution_name: institutionName,
      order_number: body.KevaId || null,
      customer_id_number: body.Zeout || null,
      customer_name: body.ClientName || null,
      address: body.Adresse || null,
      donor_phone: body.Phone || null,
      donor_email: body.Mail || null,
      amount: body.Amount != null ? Number(body.Amount) : null,
      payment_kind: body.Source === 'Keva' ? 'הוראת קבע' : 'עסקה בודדת',
      category: body.Groupe || null,
      notes: body.Comments || null,
      last4: body.LastNum || null,
      card_expiry: body.Tokef || null,
      error_reason: body.Message || null,
      raw_payload: body,
    };

    const { data: inserted, error } = await supabase
      .from('payment_failures')
      .insert(record)
      .select('id')
      .single();
    if (error) throw error;

    // Skip the alert for the robot's repeat monthly retries of the same הו"ק
    // (IsFirstKevaTry: '0') — still recorded above, just not re-notified daily.
    const isRepeatKevaTry = body.Source === 'Keva' && (body.IsFirstKevaTry === '0' || body.IsFirstKevaTry === 0);
    if (!isRepeatKevaTry) {
      const chatId = refusalChatId(institutionName);
      if (chatId) {
        try {
          await sendTelegramMessage(chatId, buildRefusalText(record, body));
        } catch (err) {
          console.error('nedarim-refusal-webhook telegram error:', err);
        }
      }
    }

    // Per Nedarim's spec: a JSON response containing a numeric WEBDocID gets
    // stored on their side and echoed back later as CallBackId in the
    // transaction-history screen, letting them cross-reference without us
    // keeping our own mapping.
    return res.status(200).json({ WEBDocID: inserted.id });
  } catch (err) {
    console.error('nedarim-refusal-webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
