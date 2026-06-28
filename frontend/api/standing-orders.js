import { CREDIT_URL, getInstitution as getInst, callNedarim as callNedarimRaw } from './_nedarim.js';

const callNedarim = (params) => callNedarimRaw(CREDIT_URL, params);

export default async function handler(req, res) {
  const { mosad_number, keva_id, export: exportType } = req.query;
  if (!mosad_number) return res.status(400).json({ error: 'mosad_number is required' });

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
    return res.json(await r.json());
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
