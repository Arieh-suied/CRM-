import { Router } from "express";
import { google } from "googleapis";
import supabase from "../supabaseClient.js";

const router = Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

function decodeBase64Url(data) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractPlainText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data)
    return decodeBase64Url(payload.body.data);
  if (payload.parts)
    for (const part of payload.parts) {
      const result = extractPlainText(part);
      if (result) return result;
    }
  return "";
}

function findHeader(headers, name) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractField(text, label) {
  const match = text.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.*)`));
  return match ? match[1].trim() : null;
}

function parseAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : null;
}

function parseFailureEmail(message) {
  const headers = message.payload.headers || [];
  const text = extractPlainText(message.payload);
  const institution = text.match(/עבור\s+(.+?):/)?.[1]?.trim() ?? null;

  return {
    gmail_message_id: message.id,
    external_ref: findHeader(headers, "message-id") || extractField(text, "מספר הוראה"),
    source: "gmail_failure",
    institution_name: institution,
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
    email_subject: findHeader(headers, "subject"),
    email_body: text,
    raw_payload: message,
  };
}

router.post("/", async (_req, res) => {
  try {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: 'subject:"שגיאה / סירוב" newer_than:30d',
      maxResults: 20,
    });

    const messages = listRes.data.messages || [];
    let synced = 0;
    let failed = 0;

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
        const record = parseFailureEmail(full.data);
        const { error } = await supabase
          .from("payment_failures")
          .upsert(record, { onConflict: "gmail_message_id" });
        if (error) throw error;
        synced++;
      } catch {
        failed++;
      }
    }

    res.json({ synced, failed, total: messages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
