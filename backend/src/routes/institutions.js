import { Router } from 'express';
import supabase from '../supabaseClient.js';

const router = Router();

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('institutions')
    .select('id, mosad_number, mosad_name, created_at, api_password')
    .order('mosad_name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Don't expose the actual password — just indicate whether one is set
  const safe = (data ?? []).map(({ api_password, ...rest }) => ({
    ...rest,
    has_api_password: Boolean(api_password),
  }));
  res.json(safe);
});

router.post('/', async (req, res) => {
  const { mosad_number, mosad_name, api_password } = req.body;
  if (!mosad_number || !mosad_name)
    return res.status(400).json({ error: 'mosad_number and mosad_name are required' });

  const payload = { mosad_number, mosad_name };
  if (api_password !== undefined) payload.api_password = api_password;

  const { data, error } = await supabase
    .from('institutions')
    .insert(payload)
    .select('id, mosad_number, mosad_name, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { mosad_number, mosad_name, api_password } = req.body;

  const payload = { mosad_number, mosad_name };
  if (api_password !== undefined) payload.api_password = api_password;

  const { data, error } = await supabase
    .from('institutions')
    .update(payload)
    .eq('id', id)
    .select('id, mosad_number, mosad_name, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase.from('institutions').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
