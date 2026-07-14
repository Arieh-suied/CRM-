// Shared core for bank-transfer screenshot OCR/extraction via OpenAI vision.
// Used by both the authenticated internal endpoint (parse-transfer.js) and the
// public external page endpoint (public-transfer.js).
// Env vars required: OPENAI_API_KEY (optional: OPENAI_VISION_MODEL, default 'gpt-4o')

export const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_BASE64_LEN = 6_000_000; // ~4.5MB raw, base64-inflated

const FIELDS = [
  'donor_name', 'amount', 'transfer_date', 'bank_number', 'branch_number',
  'account_number', 'asmachta', 'remarks', 'account_name', 'raw_text', 'notes',
  'is_discount_chachmei_screen',
];

const SYSTEM_PROMPT = `אתה מנתח צילומי מסך של אישורי העברה בנקאית ישראלית (אפליקציות בנק / אתרי בנק).
קיימים שני סוגי מסכים נפוצים:
1. מסך מפורט: סכום, תאריך העברה, אסמכתא, שם בעל החשבון, מספר בנק, מספר סניף, מספר חשבון, הערות/תיאור.
2. מסך אישור פשוט: סכום, תאריך, מספר בנק, מספר סניף, מספר חשבון, הערות/תיאור.

חלץ ערכים אך ורק אם הם נראים בבירור בתמונה. אסור להמציא או לשער ערך חסר — אם שדה לא נראה בבירור או שאינך בטוח, החזר null עבורו.
אל תניח שהתמונה מציגה את פרטי הבנק של התורם עצמו — לעיתים מוצגים רק פרטי חשבון היעד או אישור חלקי.

שים לב: בתנועות בנק השם מופיע לעיתים בתוך משפט עם מילת יחס דבוקה בלי רווח, כגון "העברה מסאני ליד בע"מ" (כלומר "העברה מ-סאני ליד בע"מ") או "העברה לישראל כהן". יש להסיר את מילת היחס הדבוקה ("מ" או "ל") מתחילת השם ולהחזיר את שם הגוף/האדם בלבד — לדוגמה מתוך "מסאני ליד בע"מ" יש להחזיר "סאני ליד בע"מ" ולא "מסאני ליד בע"מ".

זיהוי מסך ספציפי — בנק דיסקונט: קיים סוג מסך ייחודי מתוך אפליקציית בנק דיסקונט (רקע ירוק כהה בחלק העליון), שמציג תמיד את כל השורות הבאות יחד: "תאריך פעולה", "יום ערך", "מספר אסמכתה", "ערוץ ביצוע", "שם חשבון מחויב", "מספר בנק מחויב", "מספר סניף מחויב", "מספר חשבון מחויב", "סניף בו בוצעה הפעולה", "הערות". אם וכאשר אתה מזהה בבירור שהתמונה היא בדיוק מהפורמט הזה (כל השורות הללו מופיעות), החזר is_discount_chachmei_screen=true. במקרה הזה, יש למפות את "שם חשבון מחויב" לשדה donor_name, ואת מספרי "בנק/סניף/חשבון מחויב" לשדות bank_number/branch_number/account_number, ואת "מספר אסמכתה" לשדה asmachta. בכל מקרה אחר החזר is_discount_chachmei_screen=false.

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
- notes: הערה קצרה בעברית על אי-בהירות או חוסר ביטחון בנתונים, אם יש; אחרת null
- is_discount_chachmei_screen: true אם זוהה בבירור הפורמט הספציפי של בנק דיסקונט שתואר לעיל, אחרת false`;

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
    is_discount_chachmei_screen: { type: 'boolean' },
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
    is_discount_chachmei_screen: parsed.is_discount_chachmei_screen === true,
  };
}

// Thrown with a `.status` so handlers can map to the right HTTP code.
export class ParseTransferError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

// Validates the image input the same way the internal endpoint always has.
// Throws ParseTransferError on bad input.
export function validateImageInput(image, mimeType) {
  if (!image || typeof image !== 'string') {
    throw new ParseTransferError('חסרה תמונה', 400);
  }
  if (!mimeType || !ALLOWED_MIME.includes(mimeType)) {
    throw new ParseTransferError('סוג קובץ לא נתמך (jpg/png/webp בלבד)', 400);
  }
  if (image.length > MAX_BASE64_LEN) {
    throw new ParseTransferError('הקובץ גדול מהמותר', 413);
  }
}

// Runs the OpenAI vision extraction and returns the normalized fields.
// Throws ParseTransferError on validation / API / parse failures.
export async function parseTransferImage({ image, mimeType }) {
  validateImageInput(image, mimeType);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Missing env var: OPENAI_API_KEY');
    throw new ParseTransferError('מפתח API חסר — הגדר OPENAI_API_KEY ב-Vercel', 503);
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
    throw new ParseTransferError(data.error?.message || 'שגיאה בניתוח התמונה', 502);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new ParseTransferError('לא התקבלה תשובה מהמנתח', 502);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse OpenAI JSON content:', content);
    throw new ParseTransferError('תשובה לא תקינה מהמנתח', 502);
  }

  return normalizeResult(parsed);
}
