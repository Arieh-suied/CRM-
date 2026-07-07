// Syncs "new standing order" (הוראת קבע חדשה) emails from Nedarim Plus in the
// som.noflim@gmail.com mailbox, and sends a Telegram notification to the
// matching institution's *transaction* channel for every newly-created order.
// Same principle as the payment-failure sync (gmail-sync.js), but for the
// positive "a new recurring donation was set up" event.
//
// Dedup: each processed email's Gmail message id is recorded in the
// `standing_order_alerts` table, so re-syncing the same email doesn't re-notify.
// Create it once in Supabase:
//   create table if not exists standing_order_alerts (
//     gmail_message_id text primary key,
//     keva_id text,
//     institution_name text,
//     donor_name text,
//     amount numeric,
//     notified_at timestamptz not null default now()
//   );
//
// Env vars required:
//   GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM, GOOGLE_REFRESH_TOKEN_SOM
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_SOMECH, TELEGRAM_CHAT_YESHIVOT, TELEGRAM_CHAT_BNOT_CHAYIL
//   CRON_SECRET (for the scheduled GET invocation)

import { getSupabase } from './_supabase.js';
import { requireUser } from './_auth.js';
import { sendTelegramMessage } from './_telegram.js';
import { transactionChatIdByName } from './_transaction-notify.js';
import {
  getGmailAccessToken,
  gmailFetch,
  extractPlainText,
  findHeader,
  extractField,
  parseAmount,
  extractInstitution,
} from './_gmail.js';

function parseStandingOrderEmail(message) {
  const headers = message.payload.headers || [];
  const text = extractPlainText(message.payload);
  const subject = findHeader(headers, 'subject');
  const cardField = extractField(text, 'באמצעות כרטיס');

  return {
    gmail_message_id: message.id,
    // "עבור <מוסד>:" line; fall back to the "קטגוריה:" field which repeats it.
    institution_name: extractInstitution(text) || extractField(text, 'קטגוריה'),
    keva_id: extractField(text, 'מספר הוראה'),
    customer_id_number: extractField(text, 'מספר זהות'),
    donor_name: extractField(text, 'שם תורם'),
    address: extractField(text, 'כתובת'),
    city: extractField(text, 'עיר'),
    donor_phone: extractField(text, 'טלפון'),
    donor_email: extractField(text, 'מייל'),
    amount: parseAmount(extractField(text, 'סכום כל חיוב')),
    next_charge_date: extractField(text, 'תאריך חיוב הבא'),
    frequency: extractField(text, 'תדירות גביה'),
    num_charges: extractField(text, "מס' חיובים"),
    last4: cardField ? cardField.replace(/[^\d]/g, '').slice(-4) : null,
    category: extractField(text, 'קטגוריה'),
    notes: extractField(text, 'הערות'),
    email_subject: subject,
  };
}

function buildStandingOrderText(record) {
  const lines = [`🆕 הוראת קבע חדשה${record.institution_name ? ' ב' + record.institution_name : ''}`];
  lines.push(`שם: ${record.donor_name || '—'}`);
  lines.push(`סכום לחיוב: ${record.amount ?? '—'}₪`);
  if (record.frequency) lines.push(`תדירות: ${record.frequency}`);
  if (record.num_charges) lines.push(`מס' חיובים: ${record.num_charges}`);
  if (record.next_charge_date) lines.push(`חיוב הבא: ${record.next_charge_date}`);
  if (record.keva_id) lines.push(`מספר הוראה: ${record.keva_id}`);
  return lines.join('\n');
}

async function notifyStandingOrder(record) {
  const chatId = transactionChatIdByName(record.institution_name);
  if (!chatId) return; // unrecognized institution, or not configured yet — skip rather than fail the sync
  try {
    await sendTelegramMessage(chatId, buildStandingOrderText(record));
  } catch (err) {
    console.error('standing-orders-sync telegram error:', err);
  }
}

export default async function handler(req, res) {
  // GET → Vercel Cron (authenticated via Authorization: Bearer <CRON_SECRET>).
  // POST → manual trigger, must be a logged-in user.
  if (req.method === 'GET') {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (req.method === 'POST') {
    const user = await requireUser(req, res, getSupabase());
    if (!user) return;
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const token = await getGmailAccessToken();

    // Only the original notification from Nedarim — this excludes the user's own
    // forwarded/replied copies ("Re: Fwd: …"), which are duplicates of the same
    // order and also carry markup noise (e.g. *asterisks*) from being quoted.
    const list = await gmailFetch(
      `messages?q=${encodeURIComponent('from:noreply@nedarimplus.com subject:"הוראת קבע חדשה" newer_than:30d')}&maxResults=20`,
      token
    );
    const messages = list.messages || [];

    let synced = 0;
    let notified = 0;
    let failed = 0;

    for (const msg of messages) {
      try {
        const { data: existing } = await supabase
          .from('standing_order_alerts')
          .select('gmail_message_id')
          .eq('gmail_message_id', msg.id)
          .maybeSingle();

        if (existing) { synced++; continue; } // already handled — don't re-notify

        const full = await gmailFetch(`messages/${msg.id}?format=full`, token);
        const record = parseStandingOrderEmail(full);

        // Guard against the same order arriving in more than one email: if we've
        // already alerted for this keva_id, record the message id (so it isn't
        // re-fetched every run) but don't notify again.
        let alreadyAlerted = false;
        if (record.keva_id) {
          // limit(1), not maybeSingle(): a keva_id can legitimately appear in
          // more than one row here, and maybeSingle() would throw on that.
          const { data: dup } = await supabase
            .from('standing_order_alerts')
            .select('gmail_message_id')
            .eq('keva_id', record.keva_id)
            .limit(1);
          alreadyAlerted = Array.isArray(dup) && dup.length > 0;
        }

        const { error } = await supabase.from('standing_order_alerts').insert({
          gmail_message_id: record.gmail_message_id,
          keva_id: record.keva_id,
          institution_name: record.institution_name,
          donor_name: record.donor_name,
          amount: record.amount,
        });
        if (error) throw error;

        if (!alreadyAlerted) {
          await notifyStandingOrder(record);
          notified++;
        }
        synced++;
      } catch (err) {
        console.error(`standing-orders-sync message ${msg.id} error:`, err);
        failed++;
      }
    }

    return res.json({ synced, notified, failed, total: messages.length });
  } catch (err) {
    console.error('standing-orders-sync handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
