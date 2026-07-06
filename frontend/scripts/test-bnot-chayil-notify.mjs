// Test script — sends the latest transaction from mosad 7016650 (בנות חיל)
// to the Telegram channel and appends a row to their Google Sheet.
//
// Run from the frontend/ directory with real env vars:
//   node scripts/test-bnot-chayil-notify.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_BNOT_CHAYIL || '-1004449337149';

if (!SUPABASE_URL || !SUPABASE_KEY || !BOT_TOKEN) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { data: row, error } = await supabase
  .from('transactions')
  .select('*')
  .eq('mosad_number', '7016650')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (error || !row) {
  console.error('No transaction found for mosad 7016650:', error?.message);
  process.exit(1);
}

console.log('Found transaction:', JSON.stringify(row, null, 2));

const receiptUrl = row.receipt_data
  ? `https://files.ezcount.co.il/front/documents/get/${row.receipt_data}`
  : null;

const text = [
  `התקבלה עסקה ב${row.mosad_name || 'בנות חיל'}`,
  '',
  `שם: ${row.client_name || '—'}`,
  `סכום: ${row.amount}₪`,
  `הערות: ${row.comments || ''}`,
  `קטגוריה: ${row.group_name || ''}`,
  `סוג תשלום: תרומה`,
].join('\n');

const body = {
  chat_id: CHAT_ID,
  text,
  ...(receiptUrl ? {
    reply_markup: {
      inline_keyboard: [[{ text: 'הצג קבלה', url: receiptUrl }]],
    },
  } : {}),
};

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const result = await res.json();

if (!result.ok) {
  console.error('Telegram error:', JSON.stringify(result));
  process.exit(1);
}

console.log('Telegram message sent successfully:', result.result.message_id);
