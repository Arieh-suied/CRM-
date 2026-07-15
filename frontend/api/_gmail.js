// Shared Gmail helpers for the som.noflim@gmail.com mailbox, used by both the
// payment-failure sync (gmail-sync.js) and the new standing-order sync
// (standing-orders-sync.js). Auth uses the dedicated GOOGLE_*_SOM OAuth client.
//
// Env vars required:
//   GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM, GOOGLE_REFRESH_TOKEN_SOM

export async function getGmailAccessToken() {
  const { GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM, GOOGLE_REFRESH_TOKEN_SOM } = process.env;
  if (!GOOGLE_CLIENT_ID_SOM || !GOOGLE_CLIENT_SECRET_SOM || !GOOGLE_REDIRECT_URI_SOM || !GOOGLE_REFRESH_TOKEN_SOM) {
    throw new Error('Missing Gmail/Google env vars (GOOGLE_CLIENT_ID_SOM/SECRET_SOM/REDIRECT_URI_SOM/REFRESH_TOKEN_SOM)');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID_SOM,
      client_secret: GOOGLE_CLIENT_SECRET_SOM,
      redirect_uri: GOOGLE_REDIRECT_URI_SOM,
      refresh_token: GOOGLE_REFRESH_TOKEN_SOM,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail auth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

export async function gmailFetch(path, token) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gmail API error: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

// Requires the gmail.send scope on GOOGLE_REFRESH_TOKEN_SOM (the token must be
// minted with both gmail.readonly and gmail.send — see
// backend/scripts/get-gmail-refresh-token-som.js).
export async function gmailPost(path, token, body) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gmail API error: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data);
  // Some emails (e.g. the som.noflim mailbox) have only a text/html body, no
  // text/plain alternative — strip tags down to plain text instead.
  if (payload.mimeType === 'text/html' && payload.body?.data) return htmlToText(decodeBase64Url(payload.body.data));
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractPlainText(part);
      if (result) return result;
    }
  }
  return '';
}

export function findHeader(headers, name) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

export function extractField(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}:\\s*(.*)`));
  return match ? match[1].trim() : null;
}

export function parseAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, '');
  return cleaned ? Number(cleaned) : null;
}

export function extractInstitution(text) {
  // Two observed formats: "עבור: <מוסד>" (colon right after the label) and
  // "עבור <מוסד>:" (colon after the value instead — the som.noflim mailbox,
  // both the refusal and the standing-order emails).
  // The first pattern must stay on its own line ([ \t], not \s, and require a
  // non-space char): some emails also carry an empty "עבור: " line, and a
  // newline-crossing \s* would skip it and grab the following line instead.
  let match = text.match(/עבור:[ \t]*(\S.*)/);
  if (match) return match[1].trim();
  match = text.match(/עבור\s+(.+?):/);
  return match ? match[1].trim() : null;
}
