// Bank transfer screenshot OCR/extraction via OpenAI vision (authenticated).
// Extraction logic lives in _parse-transfer-core.js (shared with public-transfer.js).
// Env vars required: OPENAI_API_KEY (optional: OPENAI_VISION_MODEL, default 'gpt-4o')

import { getSupabase } from './_supabase.js';
import { requireUser } from './_auth.js';
import { parseTransferImage, ParseTransferError } from './_parse-transfer-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await requireUser(req, res, getSupabase());
    if (!user) return;

    const { image, mimeType } = req.body || {};
    const result = await parseTransferImage({ image, mimeType });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof ParseTransferError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('parse-transfer handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
