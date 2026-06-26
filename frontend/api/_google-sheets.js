// Minimal Google Sheets client for a service account — signs its own JWT and
// appends rows via the Sheets API. No googleapis dependency needed.
// Env vars required: GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY

import { createSign } from 'crypto';

let cachedToken = null; // { token, expiresAt }

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Missing env vars: GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google auth error: ${JSON.stringify(data)}`);

  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function appendRow(spreadsheetId, sheetName, values) {
  const token = await getAccessToken();
  const range = encodeURIComponent(`${sheetName}!A:A`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets append error: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

export async function getCellValue(spreadsheetId, sheetName, cell) {
  const token = await getAccessToken();
  const range = encodeURIComponent(`${sheetName}!${cell}`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets read error: ${data.error?.message || JSON.stringify(data)}`);
  return data.values?.[0]?.[0] ?? null;
}

export async function setValues(spreadsheetId, sheetName, range, values) {
  const token = await getAccessToken();
  const encodedRange = encodeURIComponent(`${sheetName}!${range}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets write error: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

export async function getFirstSheetTitle(spreadsheetId) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets metadata error: ${data.error?.message || JSON.stringify(data)}`);
  return data.sheets?.[0]?.properties?.title ?? null;
}

export async function copySpreadsheet(templateId, newTitle) {
  const token = await getAccessToken();
  const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}/copy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newTitle }),
  });
  const copyData = await copyRes.json();
  if (!copyRes.ok) throw new Error(`Drive copy error: ${copyData.error?.message || JSON.stringify(copyData)}`);
  return copyData.id;
}

export async function clearRange(spreadsheetId, sheetName, range) {
  const token = await getAccessToken();
  const encodedRange = encodeURIComponent(`${sheetName}!${range}`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets clear error: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

export async function shareFile(fileId, email) {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Drive share error: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}
