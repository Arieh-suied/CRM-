// Internal CRM chat assistant — answers questions about donors/donations using
// OpenAI function-calling restricted to a whitelist of read-only Supabase queries.
// Env vars required: OPENAI_API_KEY (optional: OPENAI_ASSISTANT_MODEL, default 'gpt-4o-mini')

import { getSupabase } from './_supabase.js';

const MAX_ROUNDS = 5;
const MAX_HISTORY = 20;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const QUERYABLE_TABLES = {
  transactions: {
    table: 'transactions_with_parsed_time',
    select: 'client_name, phone, email, amount, mosad_number, transaction_type, group_name, transaction_time_parsed, external_transaction_id',
    searchColumns: ['client_name', 'phone', 'email', 'external_transaction_id'],
    dateColumn: 'transaction_time_parsed',
    mosadColumn: 'mosad_number',
    order: ['transaction_time_parsed', false],
    description: 'כל תנועות/תרומות מכל המוסדות (שם, סכום, מוסד, תאריך, סוג תנועה)',
  },
  customers: {
    table: 'customers',
    select: 'name, id_number, phone, email, bank_name, bank_branch, bank_account',
    searchColumns: ['name', 'id_number', 'phone', 'email', 'bank_account'],
    order: ['name', true],
    description: 'לקוחות/תורמים שמורים עם פרטי קשר ובנק',
  },
  issued_receipts: {
    table: 'issued_receipts',
    select: 'receipt_number, institution_name, customer_name, customer_id_number, customer_email, amount, issue_date, bank_number, branch_number, account_number, notes, status, pdf_url',
    searchColumns: ['customer_name', 'customer_id_number', 'customer_email', 'receipt_number'],
    dateColumn: 'issue_date',
    order: ['issue_date', false],
    description: 'קבלות שהונפקו בפועל מול EZCount',
  },
  bank_transfers: {
    table: 'bank_transfers',
    select: 'customer_name, customer_email, customer_id_number, transfer_amount, currency, bank_name, bank_branch, bank_account, document_number, document_date, document_note, mosad_number',
    searchColumns: ['customer_name', 'customer_email', 'customer_id_number', 'document_number'],
    dateColumn: 'document_date',
    mosadColumn: 'mosad_number',
    order: ['document_date', false],
    description: 'העברות בנקאיות שתועדו בעת הפקת קבלות',
  },
  pending_receipts: {
    table: 'pending_receipts',
    select: 'customer_name, customer_id, customer_email, bank_name, bank_branch, bank_account, amount, transfer_date, reference_number, notes, branch, status, created_at',
    searchColumns: ['customer_name', 'customer_id', 'customer_email', 'reference_number'],
    dateColumn: 'created_at',
    order: ['created_at', false],
    description: 'העברות שממתינות להפקת קבלה (טרם הונפקה קבלה בפועל)',
  },
  institutions: {
    table: 'institutions',
    select: 'mosad_number, mosad_name',
    searchColumns: ['mosad_name', 'mosad_number'],
    order: ['mosad_name', true],
    description: 'רשימת המוסדות ומספרי המוסד שלהם',
  },
};

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_data',
      description: 'מחפש ומחזיר רשומות מטבלת נתונים מאושרת ב-CRM. טבלאות זמינות:\n' +
        Object.entries(QUERYABLE_TABLES).map(([key, cfg]) => `- ${key}: ${cfg.description}`).join('\n') +
        '\nיש להשתמש בכלי הזה בכל פעם שהשאלה דורשת נתון אמיתי (תורם, תרומה, סכום, תאריך, קבלה, מוסד וכו׳).',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: Object.keys(QUERYABLE_TABLES) },
          search: { type: 'string', description: 'מחרוזת חיפוש חופשית (למשל שם תורם) שתיבדק מול עמודות הטקסט הרלוונטיות בטבלה' },
          mosad_number: { type: 'string', description: 'סינון לפי מספר מוסד, אם רלוונטי לטבלה ולשאלה' },
          date_from: { type: 'string', description: 'תאריך מינימלי בפורמט YYYY-MM-DD' },
          date_to: { type: 'string', description: 'תאריך מקסימלי בפורמט YYYY-MM-DD' },
          limit: { type: 'integer', description: `מספר תוצאות מקסימלי (עד ${MAX_LIMIT}), ברירת מחדל ${DEFAULT_LIMIT}` },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_note',
      description: 'שומר הערה/הנחיה קבועה שתוזכר בכל שיחה עתידית עם כל המשתמשים. יש להשתמש בכלי הזה רק כשהמשתמש מבקש במפורש "זכור/תזכור..." וכדומה. הכלי פעיל רק עבור מנהל המערכת — אם המשתמש הנוכחי אינו מנהל, הקריאה תיכשל.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'תוכן ההערה/ההנחיה לשמירה, בעברית, בניסוח עצמאי ומובן (לא "תזכור ש..." אלא התוכן עצמו)' },
        },
        required: ['content'],
      },
    },
  },
];

function buildSystemPrompt(notes, isAdmin) {
  let prompt = `את/ה עוזר/ת AI פנימי/ת למערכת CRM של עמותות וגביית תרומות. עונה בעברית בלבד, בקצרה ולעניין.
כשנשאלת שאלה שדורשת מידע אמיתי ממסד הנתונים (תורם, תרומה, סכום, תאריך, קבלה, מוסד וכו׳) — חובה להשתמש בכלי query_data כדי לשלוף את המידע בפועל. אסור להמציא, לשער או "לזכור" תשובה ללא שליפה בפועל.
אם חיפוש לפי שם החזיר 0 תוצאות, לפני שמודיעים שלא נמצא — יש לבדוק אם ייתכן שמילת חיבור דבוקה בלי רווח בתחילת השם שהמשתמש כתב (למשל "ויצחק" במקום "יצחק", כתוצאה מהעתקה מתשובה קודמת שהכילה "...או יצחק") ולנסות שוב חיפוש עם השם בלי האות הדבוקה. רק אם גם זה לא מחזיר תוצאות, יש לומר בבירור ("לא מצאתי רשומה כזו במערכת") ולא לנחש.
חיפוש לפי שם פרטי בלבד (למשל "אריה" או "יצחק") עלול להתאים למספר אנשים שונים עם שמות משפחה שונים. לכן, בכל חיפוש לפי שם — חובה לבדוק קודם אם יש כמה אנשים מתאימים, ורק אז להמשיך:
1. בקריאה הראשונה לכלי query_data עבור חיפוש לפי שם, אסור להגביל ל-limit=1 (גם אם השאלה היא על "פעם אחרונה") — יש להשתמש בברירת המחדל של הכלי כדי לראות את כל האנשים שתואמים לשם, ולבדוק כמה שמות משפחה/מזהים מובחנים מופיעים.
2. אם נמצא יותר משם משפחה אחד מובחן עבור אותו שם פרטי, אסור לבחור אחד מהם באופן שרירותי — יש לעצור ולשאול את המשתמש לבירור (למשל "יש כמה אריה במערכת — מה שם המשפחה?"), ולהציג את האפשרויות שנמצאו כרשימה ממוספרת (1. 2. 3. ...) — לא כמשפט רץ עם "או"/"ו-" בין השמות, כדי שאם המשתמש יעתיק שם מהרשימה הוא לא ידביק בטעות מילת חיבור.
3. רק אם נמצא אדם מובחן אחד (או אחרי שהמשתמש הבהיר למי הוא מתכוון) — ניתן למיין את התוצאות שלו לפי תאריך מהחדש לישן ולהתייחס לרשומה הראשונה כ"האחרונה".
תאריכים בתשובה הסופית יש לכתוב בפורמט DD/MM/YYYY.
${isAdmin
    ? 'המשתמש הנוכחי הוא מנהל המערכת — אם הוא מבקש ממך "תזכור ש..." או דומה, השתמש בכלי remember_note כדי לשמור את ההנחיה לשיחות עתידיות.'
    : 'המשתמש הנוכחי אינו מנהל — אם הוא מבקש ממך לזכור משהו, הסבר בנימוס שרק מנהל המערכת יכול לבקש זאת.'}`;

  if (notes?.length) {
    prompt += `\n\nהערות קבועות שנשמרו על ידי המנהל בעבר (יש להתייחס אליהן כעובדות ידועות):\n${notes.map(n => `- ${n}`).join('\n')}`;
  }
  return prompt;
}

function buildQuery(supabase, args) {
  const cfg = QUERYABLE_TABLES[args?.table];
  if (!cfg) return null;

  let query = supabase.from(cfg.table).select(cfg.select);

  if (args.search && cfg.searchColumns?.length) {
    query = query.or(cfg.searchColumns.map(c => `${c}.ilike.%${args.search}%`).join(','));
  }
  if (args.mosad_number && cfg.mosadColumn) {
    query = query.eq(cfg.mosadColumn, args.mosad_number);
  }
  if (args.date_from && cfg.dateColumn) query = query.gte(cfg.dateColumn, args.date_from);
  if (args.date_to && cfg.dateColumn)   query = query.lte(cfg.dateColumn, `${args.date_to}T23:59:59`);

  const [orderCol, ascending] = cfg.order;
  const limit = Math.min(Math.max(parseInt(args.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  return query.order(orderCol, { ascending, nullsLast: true }).limit(limit);
}

async function executeQuery(supabase, args) {
  const query = buildQuery(supabase, args);
  if (!query) return { error: `טבלה לא מוכרת: ${args?.table}` };
  const { data, error } = await query;
  if (error) return { error: error.message };
  return { rows: data, count: data.length };
}

async function getRequestUser(req, supabase) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user?.email) return null;

  const { data } = await supabase
    .from('allowed_users')
    .select('role, is_active')
    .eq('email', user.email.trim())
    .maybeSingle();

  if (!data?.is_active) return null;
  return { email: user.email, role: data.role ?? 'viewer' };
}

async function loadNotes(supabase) {
  const { data } = await supabase
    .from('ai_assistant_notes')
    .select('content')
    .order('created_at', { ascending: true });
  return (data ?? []).map(n => n.content);
}

async function executeRememberNote(supabase, args, requestUser) {
  if (requestUser?.role !== 'admin') {
    return { error: 'רק מנהל המערכת יכול לבקש מהעוזר לזכור דברים.' };
  }
  const content = (args?.content || '').trim();
  if (!content) return { error: 'לא צוין תוכן לשמירה' };

  const { error } = await supabase
    .from('ai_assistant_notes')
    .insert({ content, created_by: requestUser.email });
  if (error) return { error: error.message };
  return { success: true };
}

async function callOpenAI(messages, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages,
      tools: TOOLS,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'שגיאה מול OpenAI');
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages: history } = req.body || {};
    if (!Array.isArray(history) || !history.length) {
      return res.status(400).json({ error: 'חסרות הודעות' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('Missing env var: OPENAI_API_KEY');
      return res.status(503).json({ error: 'מפתח API חסר — הגדר OPENAI_API_KEY ב-Vercel' });
    }

    const supabase = getSupabase();
    const requestUser = await getRequestUser(req, supabase);
    const notes = await loadNotes(supabase);

    const cleanHistory = history
      .slice(-MAX_HISTORY)
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content }));

    const messages = [
      { role: 'system', content: buildSystemPrompt(notes, requestUser?.role === 'admin') },
      ...cleanHistory,
    ];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const completion = await callOpenAI(messages, apiKey);
      const msg = completion.choices?.[0]?.message;
      if (!msg) return res.status(502).json({ error: 'לא התקבלה תשובה מהעוזר' });
      messages.push(msg);

      if (!msg.tool_calls?.length) {
        return res.json({ reply: msg.content || '' });
      }

      for (const call of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* leave empty */ }
        const result = call.function.name === 'remember_note'
          ? await executeRememberNote(supabase, args, requestUser)
          : await executeQuery(supabase, args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    return res.status(504).json({ error: 'החיפוש לקח יותר מדי זמן — נסה לנסח את השאלה אחרת' });
  } catch (err) {
    console.error('ai-assistant handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
