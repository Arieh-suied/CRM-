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
