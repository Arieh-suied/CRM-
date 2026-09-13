// Shared refusal-ingestion logic — used by both the live webhook
// (nedarim-refusal-webhook.js) and the recovery cron
// (nedarim-refusal-recovery.js), so a re-injected refusal from a failure
// email goes through the exact same record-shaping and notification logic as
// one received live.

import { getSupabase } from './_supabase.js';
import { sendTelegramMessage } from './_telegram.js';
import { refusalChatId } from './_transaction-notify.js';

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

// Nedarim's ErrorTime ("dd/MM/yyyy HH:mm:ss") is the closest thing a refusal
// update has to a unique id — a declined charge never gets a TransactionId.
// Used by the recovery cron to skip a refusal that's already in the table.
export async function refusalExists(errorTime) {
  if (!errorTime) return false;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('payment_failures')
    .select('id')
    .eq('raw_payload->>ErrorTime', errorTime)
    .limit(1);
  if (error) throw error;
  return !!data?.length;
}

// Inserts one refusal payload into payment_failures and sends the Telegram
// alert (skipped for the robot's repeat monthly הו"ק retries). Returns the
// inserted row's id.
export async function ingestRefusal(body) {
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

  const isRepeatKevaTry = body.Source === 'Keva' && (body.IsFirstKevaTry === '0' || body.IsFirstKevaTry === 0);
  if (!isRepeatKevaTry) {
    const chatId = refusalChatId(institutionName);
    if (chatId) {
      try {
        await sendTelegramMessage(chatId, buildRefusalText(record, body));
      } catch (err) {
        console.error('refusal-ingest telegram error:', err);
      }
    }
  }

  return inserted.id;
}
