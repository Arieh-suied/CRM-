import { getSupabase } from './_supabase.js';
import { BANK_URL, getInstitution, callNedarim as callNedarimRaw } from './_nedarim.js';
import { issueReceipt, branchByMosadNumber } from './_receipts-core.js';

const callNedarim = (params) => callNedarimRaw(BANK_URL, params);

const BOUNCE_STATUS = 'החזרת הוראת קבע';

function ddmmyyyy(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const periodEnd = new Date(y, m, 0);
  // returns can be reported by the bank up to ~10 business days after the original charge
  const bufferEnd = new Date(periodEnd);
  bufferEnd.setDate(bufferEnd.getDate() + 14);
  const to = bufferEnd > new Date() ? new Date() : bufferEnd;
  return { from, periodEnd, to };
}

function stripIdNumber(raw) {
  return (raw || '').replace(/^="?/, '').replace(/"?$/, '').trim();
}

function parseHistoryCsv(buf) {
  const text = buf.toString('utf16le').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split('\t').map((h) => h.trim());
  const idx = (name) => header.indexOf(name);
  const col = { id: idx('מספר הוראה'), idNum: idx('מספר זהות'), name: idx('שם'), bank: idx('בנק'), branch: idx('סניף'), account: idx('חשבון'), date: idx('תאריך'), amount: idx('סכום'), status: idx('תנועה'), receiptNo: idx('מספר קבלה') };

  return lines.slice(1).map((line) => {
    const c = line.split('\t');
    return {
      masavId: c[col.id]?.trim(),
      idNumber: stripIdNumber(c[col.idNum]),
      name: c[col.name]?.trim(),
      bank: c[col.bank]?.trim(),
      branch: c[col.branch]?.trim(),
      account: c[col.account]?.trim(),
      date: c[col.date]?.trim(),
      amount: parseFloat(c[col.amount]),
      status: c[col.status]?.trim(),
      existingReceiptNumber: c[col.receiptNo]?.trim() || null,
    };
  }).filter((r) => r.masavId && r.date);
}

function dateInRange(ddmmyyyyStr, from, to) {
  const [d, m, y] = ddmmyyyyStr.split('/').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt >= from && dt <= to;
}

export async function sync(inst, period) {
  const { from, periodEnd, to } = periodRange(period);
  const r = await callNedarim({
    Action: 'GetMasavHistoryCSVNew',
    MosadNumber: inst.mosad_number,
    ApiPassword: inst.api_password,
    From: ddmmyyyy(from),
    To: ddmmyyyy(to),
    ToMail: '0',
  });
  const rows = parseHistoryCsv(Buffer.from(await r.arrayBuffer()));

  const charges = rows.filter((row) => row.status === 'שידור' && dateInRange(row.date, from, periodEnd));
  const returns = rows.filter((row) => row.status === BOUNCE_STATUS);

  const institutionName = branchByMosadNumber(inst.mosad_number) ?? inst.mosad_number;
  const supabase = getSupabase();

  for (const charge of charges) {
    const bounced = returns.some((ret) => ret.masavId === charge.masavId && ret.date === charge.date && Math.abs(ret.amount + charge.amount) < 0.01);
    const [d, m, y] = charge.date.split('/');
    await supabase.from('bank_standing_order_failures').upsert({
      mosad_number:     inst.mosad_number,
      institution_name: institutionName,
      masav_id:          charge.masavId,
      period,
      charge_date:       `${y}-${m}-${d}`,
      amount:            charge.amount,
      client_name:       charge.name,
      client_id_number:  charge.idNumber,
      bank_name:         charge.bank,
      bank_branch:       charge.branch,
      bank_account:      charge.account,
      auto_status:       bounced ? 'bounced' : 'cleared',
      existing_receipt_number: charge.existingReceiptNumber,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'masav_id,period', ignoreDuplicates: false });
  }

  return charges.length;
}

export default async function handler(req, res) {
  const { mosad_number, period, action } = req.query;

  if (req.method === 'GET') {
    if (!mosad_number || !period) return res.status(400).json({ error: 'mosad_number and period are required' });

    if (action === 'sync') {
      let inst;
      try { inst = await getInstitution(mosad_number); } catch (e) { return res.status(400).json({ error: e.message }); }
      try {
        const count = await sync(inst, period);
        return res.json({ success: true, synced: count });
      } catch (e) {
        console.error('bank-refusals sync error:', e);
        return res.status(500).json({ error: e.message });
      }
    }

    const { data, error } = await getSupabase()
      .from('bank_standing_order_failures')
      .select('*')
      .eq('mosad_number', mosad_number)
      .eq('period', period)
      .order('charge_date', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data });
  }

  if (req.method === 'POST') {
    const { action: postAction, id, resolution, comment } = req.body;
    if (postAction !== 'resolve') return res.status(400).json({ error: 'Unknown action' });

    const supabase = getSupabase();
    const { data: row, error: fetchErr } = await supabase.from('bank_standing_order_failures').select('*').eq('id', id).single();
    if (fetchErr || !row) return res.status(404).json({ error: 'Row not found' });

    if (resolution === 'cleared') {
      if (row.receipt_id) {
        return res.status(409).json({ error: `קבלה כבר הופקה לשורה זו (מספר ${row.receipt_id}) — לא יונפק כפל` });
      }
      if (row.existing_receipt_number) {
        return res.status(409).json({ error: `נדרים+ כבר הפיק קבלה לחיוב זה (מספר ${row.existing_receipt_number}) — לא יונפק כפל` });
      }

      const result = await issueReceipt({
        customerName:  row.client_name,
        customerId:    row.client_id_number,
        amount:        row.amount,
        branch:        row.institution_name,
        paymentMethod: 4,
        bankName:      row.bank_name,
        bankBranch:    row.bank_branch,
        bankAccount:   row.bank_account,
        transferDate:  row.charge_date,
        notes:         `הוראת קבע ${row.masav_id} — ${row.period}`,
      });
      if (!result.success) return res.status(result.status ?? 400).json({ error: result.error });

      const { error: updErr } = await supabase.from('bank_standing_order_failures').update({
        status: 'cleared', resolution: 'receipt_issued', receipt_id: result.receiptId ?? String(result.docNumber ?? ''), updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (updErr) return res.status(500).json({ error: updErr.message });
      return res.json({ success: true, docUrl: result.docUrl });
    }

    if (resolution === 'bounced') {
      let inst;
      try { inst = await getInstitution(row.mosad_number); } catch (e) { return res.status(400).json({ error: e.message }); }
      const r = await callNedarim({ Action: 'SetMasavStatus', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, MasavId: row.masav_id, StatusNumber: '10', Comments: comment || 'הוראת קבע חזרה' });
      const text = await r.text();
      let nedarimResult;
      try { nedarimResult = JSON.parse(text); } catch { nedarimResult = { Result: text.trim().startsWith('OK') ? 'OK' : 'Error', Message: text.trim() }; }
      if (nedarimResult.Result !== 'OK') return res.status(400).json({ error: nedarimResult.Message || 'שגיאה בביטול בנדרים+' });

      const { error: updErr } = await supabase.from('bank_standing_order_failures').update({
        status: 'bounced', resolution: 'cancelled_in_nedarim', nedarim_result: nedarimResult, updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (updErr) return res.status(500).json({ error: updErr.message });
      return res.json({ success: true });
    }

    if (resolution === 'cleared_manual' || resolution === 'bounced_manual') {
      const { error: updErr } = await supabase.from('bank_standing_order_failures').update({
        status: resolution === 'cleared_manual' ? 'cleared' : 'bounced',
        resolution: 'marked_manually',
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (updErr) return res.status(500).json({ error: updErr.message });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid resolution' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
