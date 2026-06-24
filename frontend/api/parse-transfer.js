// Bank transfer screenshot OCR/extraction via OpenAI vision
// Env vars required: OPENAI_API_KEY (optional: OPENAI_VISION_MODEL, default 'gpt-4o')

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_BASE64_LEN = 6_000_000; // ~4.5MB raw, base64-inflated

const FIELDS = [
  'donor_name', 'amount', 'transfer_date', 'bank_number', 'branch_number',
  'account_number', 'asmachta', 'remarks', 'account_name', 'raw_text', 'notes',
];

const SYSTEM_PROMPT = `אתה מנתח צילומי מסך של אישורי העברה בנקאית ישראלית (אפליקציות בנק / אתרי בנק).
קיימים שני סוגי מסכים נפוצים:
1. מסך מפורט: סכום, תאריך העברה, אסמכתא, שם בעל החשבון, מספר בנק, מספר סניף, מספר חשבון, הערות/תיאור.
2. מסך אישור פשוט: סכום, תאריך, מספר בנק, מספר סניף, מספר חשבון, הערות/תיאור.

חלץ ערכים אך ורק אם הם נראים בבירור בתמונה. אסור להמציא או לשער ערך חסר — אם שדה לא נראה בבירור או שאינך בטוח, החזר null עבורו.
אל תניח שהתמונה מציגה את פרטי הבנק של התורם עצמו — לעיתים מוצגים רק פרטי חשבון היעד או אישור חלקי.

החזר JSON תקני בלבד עם השדות:
- donor_name: שם השולח/התורם אם מצוין בבירור, אחרת null
- amount: הסכום כמספר בלבד (ללא ₪ או פסיקים), אחרת null
- transfer_date: תאריך ההעברה בפורמט YYYY-MM-DD רק אם ניתן לקבוע אותו בבירור, אחרת null
- bank_number: מספר הבנק כמחרוזת, אחרת null
- branch_number: מספר הסניף כמחרוזת, אחרת null
- account_number: מספר החשבון כמחרוזת, אחרת null
- asmachta: מספר אסמכתא/אישור אם מופיע, אחרת null
- remarks: הערה/תיאור ההעברה אם מופיע, אחרת null
- account_name: שם בעל החשבון אם מופיע ושונה מ-donor_name, אחרת null
- raw_text: כל הטקסט שניתן לקרוא בתמונה, לצורכי דיבוג
- notes: הערה קצרה בעברית על אי-בהירות או חוסר ביטחון בנתונים, אם יש; אחרת null`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    donor_name:     { type: ['string', 'null'] },
    amount:         { type: ['number', 'null'] },
    transfer_date:  { type: ['string', 'null'] },
    bank_number:    { type: ['string', 'null'] },
    branch_number:  { type: ['string', 'null'] },
    account_number: { type: ['string', 'null'] },
    asmachta:       { type: ['string', 'null'] },
    remarks:        { type: ['string', 'null'] },
    account_name:   { type: ['string', 'null'] },
    raw_text:       { type: ['string', 'null'] },
    notes:          { type: ['string', 'null'] },
  },
  required: FIELDS,
  additionalProperties: false,
};

function toIsoDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2}|\d{4})$/);
  if (m) {
    const [, d, mo, yRaw] = m;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function toAmount(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/[₪,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function toStringOrNull(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

function normalizeResult(parsed) {
  return {
    donor_name:     toStringOrNull(parsed.donor_name),
    amount:         toAmount(parsed.amount),
    transfer_date:  toIsoDate(parsed.transfer_date),
    bank_number:    toStringOrNull(parsed.bank_number),
    branch_number:  toStringOrNull(parsed.branch_number),
    account_number: toStringOrNull(parsed.account_number),
    asmachta:       toStringOrNull(parsed.asmachta),
    remarks:        toStringOrNull(parsed.remarks),
    account_name:   toStringOrNull(parsed.account_name),
    raw_text:       toStringOrNull(parsed.raw_text),
    notes:          toStringOrNull(parsed.notes),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, mimeType } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'חסרה תמונה' });
    }
    if (!mimeType || !ALLOWED_MIME.includes(mimeType)) {
      return res.status(400).json({ error: 'סוג קובץ לא נתמך (jpg/png/webp בלבד)' });
    }
    if (image.length > MAX_BASE64_LEN) {
      return res.status(413).json({ error: 'הקובץ גדול מהמותר' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('Missing env var: OPENAI_API_KEY');
      return res.status(503).json({ error: 'מפתח API חסר — הגדר OPENAI_API_KEY ב-Vercel' });
    }

    const dataUrl = image.startsWith('data:') ? image : `data:${mimeType};base64,${image}`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'חלץ את פרטי ההעברה הבנקאית מהתמונה הזו.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'bank_transfer', schema: RESPONSE_SCHEMA, strict: true },
        },
      }),
    });

    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error('OpenAI vision error:', data);
      return res.status(502).json({ error: data.error?.message || 'שגיאה בניתוח התמונה' });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'לא התקבלה תשובה מהמנתח' });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse OpenAI JSON content:', content);
      return res.status(502).json({ error: 'תשובה לא תקינה מהמנתח' });
    }

    return res.status(200).json(normalizeResult(parsed));
  } catch (err) {
    console.error('parse-transfer handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
