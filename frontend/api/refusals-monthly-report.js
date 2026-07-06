// Monthly report of donors with consecutive bounced standing-order (MASAV) months.
// Runs via cron on the 15th (after the bank's ~14-day return-reporting buffer for
// the previous period has closed), syncs every institution, then alerts each
// institution's refusals Telegram channel about donors with a current bounce streak.
import { getSupabase } from './_supabase.js';
import { sync } from './bank-refusals.js';
import { sendTelegramMessage } from './_telegram.js';
import { refusalChatId } from './_transaction-notify.js';

const STREAK_THRESHOLD = 2;
const LOOKBACK_MONTHS = 12;

function previousPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based, so this is already "last month" as 1-based
  const yy = m === 0 ? y - 1 : y;
  const mm = m === 0 ? 12 : m;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

function monthsBack(period, n) {
  let [y, m] = period.split('-').map(Number);
  const periods = [];
  for (let i = 0; i < n; i++) {
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return periods;
}

function streaksForInstitution(rows, currentPeriod) {
  const ordered = monthsBack(currentPeriod, LOOKBACK_MONTHS);
  const byClient = new Map();
  for (const row of rows) {
    if (!byClient.has(row.client_id_number)) byClient.set(row.client_id_number, new Map());
    byClient.get(row.client_id_number).set(row.period, row);
  }

  const result = [];
  for (const [, byPeriod] of byClient) {
    let streak = 0;
    let latest = null;
    for (const period of ordered) {
      const row = byPeriod.get(period);
      if (!row || row.auto_status !== 'bounced') break;
      if (!latest) latest = row;
      streak += 1;
    }
    if (streak >= STREAK_THRESHOLD) result.push({ name: latest.client_name, amount: latest.amount, streak });
  }
  return result.sort((a, b) => b.streak - a.streak);
}

function buildReportText(institutionName, period, donors) {
  const lines = [`📋 דוח חודשי - סירובי הוראת קבע רצופים ב${institutionName} (${period})`, ''];
  for (const d of donors) {
    lines.push(`${d.name} ${d.amount}₪ ${d.streak} חודשים רצוף סירוב`);
  }
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const period = req.query.period || previousPeriod();
  const supabase = getSupabase();

  const { data: institutions, error: instErr } = await supabase
    .from('institutions')
    .select('mosad_number, api_password')
    .not('api_password', 'is', null);
  if (instErr) return res.status(500).json({ error: instErr.message });

  const reportsSent = [];
  for (const inst of institutions) {
    try {
      await sync(inst, period);
    } catch (e) {
      console.error(`refusals-monthly-report sync error (${inst.mosad_number}):`, e);
      continue;
    }

    const earliestPeriod = monthsBack(period, LOOKBACK_MONTHS).at(-1);
    const { data: rows, error: rowsErr } = await supabase
      .from('bank_standing_order_failures')
      .select('institution_name, client_id_number, client_name, amount, period, auto_status')
      .eq('mosad_number', inst.mosad_number)
      .gte('period', earliestPeriod)
      .lte('period', period);
    if (rowsErr) { console.error(`refusals-monthly-report query error (${inst.mosad_number}):`, rowsErr); continue; }
    if (!rows.length) continue;

    const institutionName = rows[0].institution_name;
    const donors = streaksForInstitution(rows, period);
    if (!donors.length) continue;

    const chatId = refusalChatId(institutionName);
    if (!chatId) continue; // unrecognized/unconfigured institution

    try {
      await sendTelegramMessage(chatId, buildReportText(institutionName, period, donors));
      reportsSent.push({ institution: institutionName, donors: donors.length });
    } catch (e) {
      console.error(`refusals-monthly-report telegram error (${institutionName}):`, e);
    }
  }

  return res.json({ success: true, period, reportsSent });
}
