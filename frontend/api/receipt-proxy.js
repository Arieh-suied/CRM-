const ALLOWED_HOST = 'files.ezcount.co.il';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid url' }); }
  if (parsed.hostname !== ALLOWED_HOST) return res.status(403).json({ error: 'Forbidden host' });

  try {
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send('Failed to fetch receipt');
    const contentType = response.headers.get('content-type') ?? 'application/pdf';
    const buffer = await response.arrayBuffer();
    const name = filename ? `${filename}.pdf` : 'קבלה.pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
