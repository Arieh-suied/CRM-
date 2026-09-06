// Wraps a Vercel serverless handler so any error response (status >= 400) or
// thrown exception sends a Telegram alert to the shared security/errors
// channel — a system-wide "tell me when anything breaks" net, on top of the
// endpoint-specific alerts some handlers already send for their own most
// sensitive cases (e.g. the Nedarim webhooks' IP-mismatch alert).
// Deliberately broad by default (2026-09-02, user's call: start wide, narrow
// the threshold here later if it turns out too noisy in practice).
//
// Env var: TELEGRAM_CHAT_SECURITY_ALERTS (same channel used by the Nedarim
// webhooks' IP-allowlist alerts).
//
// IMPORTANT: the alert must be sent BEFORE the real response is flushed
// (res.json/res.send), not after — once a Vercel serverless function's
// response has finished, the platform can tear the invocation down before an
// unrelated pending fetch (the Telegram call) completes, silently dropping
// it. Confirmed by testing: an alert fired after res.json() had already run
// never arrived, while the identical call fired before res.json() did.
// That's why res.json/res.send are wrapped here to await the alert first,
// instead of just checking the status code after `handler` returns.

import { sendTelegramMessage } from './_telegram.js';

async function notify(name, req, detail) {
  const chatId = process.env.TELEGRAM_CHAT_SECURITY_ALERTS;
  if (!chatId) return;
  try {
    await sendTelegramMessage(chatId, `🔴 שגיאה ב-${name}\n${req.method} ${req.url}\n${detail}`.slice(0, 4000));
  } catch (err) {
    console.error('error-alert telegram failed:', err);
  }
}

export function withErrorAlert(handler, name) {
  return async function wrapped(req, res) {
    let statusCode = 200;
    let notified = false;
    const origStatus = res.status.bind(res);
    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);

    const alertIfError = async () => {
      if (statusCode >= 400 && !notified) {
        notified = true;
        await notify(name, req, `HTTP ${statusCode}`);
      }
    };

    res.status = (code) => {
      statusCode = code;
      origStatus(code);
      return res;
    };
    res.json = async (payload) => {
      await alertIfError();
      return origJson(payload);
    };
    res.send = async (payload) => {
      await alertIfError();
      return origSend(payload);
    };

    try {
      await handler(req, res);
    } catch (err) {
      console.error(`${name} handler threw:`, err);
      if (!res.headersSent) {
        await res.status(500).json({ error: err?.message || 'Internal error' });
      } else if (!notified) {
        notified = true;
        await notify(name, req, err?.message || String(err));
      }
    }
  };
}
