import { BANK_URL, getInstitution as getInst, callNedarim as callNedarimRaw } from './_nedarim.js';
import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';

const callNedarim = (params) => callNedarimRaw(BANK_URL, params);

export default async function handler(req, res) {
  // Reading orders needs a logged-in user; charging / editing a bank standing
  // order (POST) is restricted to editors and admins.
  const user = await requireUser(req, res, getSupabase(), req.method === 'GET' ? {} : { roles: WRITE_ROLES });
  if (!user) return;

  const { mosad_number, masav_id, export: exportType, from, to } = req.query;
  if (!mosad_number) return res.status(400).json({ error: 'mosad_number is required' });

  let inst;
  try { inst = await getInst(mosad_number); } catch (e) { return res.status(400).json({ error: e.message }); }

  if (req.method === 'GET') {
    if (exportType) {
      let params;
      if (exportType === 'history') {
        if (!from || !to) return res.status(400).json({ error: 'from and to required for history' });
        params = { Action: 'GetMasavHistoryCSVNew', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, From: from, To: to, ToMail: '0' };
      } else {
        params = { Action: 'GetMasavCSV', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, ToMail: '0' };
      }
      const r = await callNedarim(params);
      const buffer = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bank-${exportType}-${mosad_number}.csv"`);
      return res.send(buffer);
    }
    if (masav_id) {
      const r = await callNedarim({ Action: 'GetMasavId', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, MasavId: masav_id });
      const text = await r.text();
      try { return res.json(JSON.parse(text)); } catch { return res.json({ error: text }); }
    }
    const r = await callNedarim({ Action: 'GetMasavKevaNew', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password });
    return res.json(await r.json());
  }

  if (req.method === 'POST') {
    const { action, ...fields } = req.body;

    if (action === 'update') {
      const { KevaId, ...rest } = fields;
      const params = { Action: 'EditMasavKeva', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, KevaId };
      Object.entries(rest).forEach(([k, v]) => { if (v !== undefined && v !== '') params[k] = v; });
      const r = await callNedarim(params);
      return res.json(await r.json());
    }

    if (action === 'status') {
      const { masav_id: mid, status_number, comments } = fields;
      const params = { Action: 'SetMasavStatus', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, MasavId: mid, StatusNumber: status_number };
      if (status_number === '1') params.Comments = 'אני מאשר';
      else if (comments) params.Comments = comments;
      const r = await callNedarim(params);
      return res.json(await r.json());
    }

    if (action === 'charge') {
      const { masav_id: mid, amount, date } = fields;
      const r = await callNedarim({ Action: 'MasavBoded', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, MasavId: mid, Amount: amount, Date: date, AjaxId: Date.now().toString() });
      const text = await r.text();
      try { return res.json(JSON.parse(text)); }
      catch { return res.json({ Result: text.trim().startsWith('OK') ? 'OK' : 'Error', Message: text.trim() }); }
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
