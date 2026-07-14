// Minimal Telegram Bot API client — sends plain-text messages to a chat/channel.
// Env var required: TELEGRAM_BOT_TOKEN

export async function sendTelegramMessage(chatId, text, { receiptUrl } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing env var: TELEGRAM_BOT_TOKEN');
  if (!chatId) throw new Error('Missing chatId');

  const body = { chat_id: chatId, text };
  if (receiptUrl) {
    body.reply_markup = { inline_keyboard: [[{ text: '📄 קבלה', url: receiptUrl }]] };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram error: ${data.description || 'unknown'}`);
  return data.result;
}

// Sends a photo (raw image bytes) with an optional caption via multipart upload.
// `image` is { base64, mimeType, filename? } — base64 may be a bare base64 string
// or a full `data:` URL. Uses Node 18+ global FormData/Blob (available on Vercel).
export async function sendTelegramPhoto(chatId, image, caption = '') {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing env var: TELEGRAM_BOT_TOKEN');
  if (!chatId) throw new Error('Missing chatId');
  if (!image?.base64) throw new Error('Missing image data');

  const raw = image.base64.startsWith('data:')
    ? image.base64.slice(image.base64.indexOf(',') + 1)
    : image.base64;
  const bytes = Buffer.from(raw, 'base64');
  const mimeType = image.mimeType || 'image/jpeg';
  const ext = mimeType.split('/')[1] || 'jpg';

  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.slice(0, 1024)); // Telegram caption limit
  form.append('photo', new Blob([bytes], { type: mimeType }), image.filename || `screenshot.${ext}`);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram error: ${data.description || 'unknown'}`);
  return data.result;
}
