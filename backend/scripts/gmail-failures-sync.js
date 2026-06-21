import "dotenv/config";
import { google } from "googleapis";
import supabase from "../src/supabaseClient.js";

const GMAIL_USER = process.env.GMAIL_USER;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (
  !GMAIL_USER ||
  !GOOGLE_CLIENT_ID ||
  !GOOGLE_CLIENT_SECRET ||
  !GOOGLE_REDIRECT_URI ||
  !GOOGLE_REFRESH_TOKEN
) {
  throw new Error("Missing required Gmail/Google environment variables");
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

function decodeBase64Url(data) {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function findPartByMimeType(payload, mimeType) {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body?.data) return payload.body.data;
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const found = findPartByMimeType(part, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function extractEmailText(payload) {
  const plain = findPartByMimeType(payload, "text/plain");
  if (plain) return decodeBase64Url(plain);

  const html = findPartByMimeType(payload, "text/html");
  if (html) return stripHtml(decodeBase64Url(html));

  if (payload.body?.data) {
    const raw = decodeBase64Url(payload.body.data);
    return payload.mimeType === "text/html" ? stripHtml(raw) : raw;
  }

  return "";
}

function findHeader(headers, name) {
  const header = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

function extractField(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}:\\s*(.+)`);
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractInstitution(text) {
  const match = text.match(/עבור\s+(.+?):/);
  return match ? match[1].trim() : null;
}

function parseAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : null;
}

function parseFailureEmail(message) {
  const payload = message.payload;
  const headers = payload.headers || [];
  const subject = findHeader(headers, "subject");
  const internetMessageId = findHeader(headers, "message-id");
  const text = extractEmailText(payload);

  return {
    gmail_message_id: message.id,
    external_ref: internetMessageId || extractField(text, "מספר הוראה"),
    source: "gmail_failure",
    institution_name: extractInstitution(text),
    order_number: extractField(text, "מספר הוראה"),
    customer_id_number: extractField(text, "מספר זהות"),
    customer_name: extractField(text, "שם לקוח"),
    address: extractField(text, "כתובת"),
    donor_phone: extractField(text, "טלפון"),
    donor_email: extractField(text, "מייל"),
    amount: parseAmount(extractField(text, "סכום")),
    payment_kind: extractField(text, "תשלומים"),
    category: extractField(text, "קטגוריה"),
    notes: extractField(text, "הערות"),
    last4: extractField(text, "4 ספרות אחרונות"),
    card_expiry: extractField(text, "תוקף"),
    error_reason: extractField(text, "סיבת שגיאה"),
    terminal_location: extractField(text, "מיקום מסוף"),
    email_subject: subject,
    email_body: text,
    raw_payload: message,
  };
}

async function fetchFailureEmails() {
  const res = await gmail.users.messages.list({
    userId: GMAIL_USER,
    q: 'subject:"שגיאה / סירוב" newer_than:30d',
    maxResults: 20,
  });
  return res.data.messages || [];
}

async function fetchFullMessage(messageId) {
  const res = await gmail.users.messages.get({
    userId: GMAIL_USER,
    id: messageId,
    format: "full",
  });
  return res.data;
}

async function upsertFailure(record) {
  const { error } = await supabase
    .from("payment_failures")
    .upsert(record, { onConflict: "gmail_message_id" });
  if (error) throw error;
}

async function main() {
  const messages = await fetchFailureEmails();
  console.log(`Found ${messages.length} candidate emails`);

  for (const msg of messages) {
    try {
      const fullMessage = await fetchFullMessage(msg.id);
      const parsed = parseFailureEmail(fullMessage);
      await upsertFailure(parsed);
      console.log(`Saved failure email ${parsed.gmail_message_id}`);
    } catch (err) {
      console.error(`Failed processing message ${msg.id}:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
