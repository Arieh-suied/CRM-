import { CREDIT_URL, getInstitution as getInst, callNedarim as callNedarimRaw } from './_nedarim.js';
import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES, INSTITUTION_READ_ROLES } from './_auth.js';
import { filterRowsByColumn } from './_scope.js';

import { withErrorAlert } from './_error-alert.js';
const callNedarim = (params) => callNedarimRaw(CREDIT_URL, params);

// Category lives in column '5' of GetKevaNew's DataTables-shaped rows (see
// CreditTable in StandingOrders.jsx).
const CATEGORY_COL = '5';

async function handler(req, res) {
  const { mosad_number, keva_id, export: exportType } = req.query;

  // Only the plain listing (no keva_id detail, no CSV export) is scoped
  // per-row and safe for the institution role — a detail lookup or the raw
  // CSV export bypass the in-memory category filter below and would leak
  // other funds' donor details under the same mosad.
  const isPlainList = req.method === 'GET' && !keva_id && !exportType;
  const user = await requireUser(req, res, getSupabase(), { roles: isPlainList ? INSTITUTION_READ_ROLES : WRITE_ROLES });
  if (!user) return;

  if (!mosad_number) return res.status(400).json({ error: 'mosad_number is required' });

  if (user.role === 'institution') {
    if (!user.extraTabs?.includes('keva')) return res.status(403).json({ error: 'אין לך הרשאה לבצע פעולה זו' });
    if (!user.allowedMosadim?.includes(mosad_number)) return res.status(403).json({ error: 'אין לך הרשאה לצפות במוסד זה' });
  }

  let inst;
  try { inst = await getInst(mosad_number); } catch (e) { return res.status(400).json({ error: e.message }); }

  if (req.method === 'GET') {
    if (exportType) {
      const TYPE_MAP = { orders: 'GetKevaCSV', business: 'GetKevaCSVAsakim', refusals: 'GetErrorLogsCSV' };
      const action = TYPE_MAP[exportType];
      if (!action) return res.status(400).json({ error: 'Invalid export type' });
      const r = await callNedarim({ Action: action, MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, ToMail: '0' });
      const buffer = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="credit-${exportType}-${mosad_number}.csv"`);
      return res.send(buffer);
    }
    if (keva_id) {
      const r = await callNedarim({ Action: 'GetKevaId', MosadId: inst.mosad_number, ApiPassword: inst.api_password, KevaId: keva_id });
      return res.json(await r.json());
    }
    const r = await callNedarim({ Action: 'GetKevaNew', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password });
    const payload = await r.json();
    if (user.allowedGroupNames?.length && Array.isArray(payload?.data)) {
      payload.data = filterRowsByColumn(payload.data, CATEGORY_COL, user.allowedGroupNames);
      // TotalMonth/TotalYear from Nedarim cover the whole mosad — recompute
      // from the filtered rows so the summary matches what's actually shown.
      const activeMonthly = payload.data
        .filter((r) => !r['10']) // status column empty = active (see CreditTable)
        .reduce((sum, r) => sum + (parseFloat(r['4']) || 0), 0);
      payload.TotalMonth = activeMonthly;
      payload.TotalYear = activeMonthly * 12;
    }
    return res.json(payload);
  }

  if (req.method === 'POST') {
    const { action, ...fields } = req.body;

    if (action === 'update') {
      const { KevaId, ...rest } = fields;
      const params = { Action: 'UpdateKevaNew', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, KevaId };
      Object.entries(rest).forEach(([k, v]) => { if (v !== undefined && v !== '') params[k] = v; });
      const r = await callNedarim(params);
      return res.json(await r.json());
    }

    const ACTION_MAP = { disable: 'DisableKeva', enable: 'EnableKevaNew', delete: 'DeleteKeva' };
    if (ACTION_MAP[action]) {
      const r = await callNedarim({ Action: ACTION_MAP[action], MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, KevaId: fields.keva_id });
      const text = await r.text();
      try { return res.json(JSON.parse(text)); }
      catch { return res.json({ Result: text.trim().startsWith('OK') ? 'OK' : 'Error', Message: text.trim() }); }
    }

    if (action === 'charge') {
      const { KevaId, Currency, Amount, Tashloumim, Groupe, Comments, JoinToKevaId } = fields;
      const params = { Action: 'TashlumBodedNew', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, KevaId, Currency: Currency || '1', Amount };
      if (Tashloumim) params.Tashloumim = Tashloumim;
      if (Groupe) params.Groupe = Groupe;
      if (Comments) params.Comments = Comments;
      if (JoinToKevaId) params.JoinToKevaId = JoinToKevaId;
      const r = await callNedarim(params);
      return res.json(await r.json());
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export default withErrorAlert(handler, 'standing-orders');
