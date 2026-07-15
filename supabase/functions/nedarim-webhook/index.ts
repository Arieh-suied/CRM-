// Nedarim Plus transaction callback.
//
// Nedarim calls this URL after every successful charge, with a very short
// client timeout and NO retry on failure — a slow response here means the
// transaction is silently lost (they only send a "CallBack failed" email).
// Deployed with --no-verify-jwt (Nedarim sends no Authorization header).
//
// To keep the response instant, the row is upserted in the background
// (EdgeRuntime.waitUntil) after returning 200. Failures are retried a few
// times and logged; the nedarim-recovery Vercel cron re-injects anything
// that still slipped through (it also pings this function to keep it warm —
// the observed timeout happened on a 5am cold start).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function mapRow(item: Record<string, string>) {
  return {
    source: "api",
    external_transaction_id: item.TransactionId ?? null,
    shovar: item.Shovar ?? null,
    client_id: item.ClientId ?? null,
    zeout: item.Zeout ?? null,
    client_name: item.ClientName ?? null,
    address: item.Adresse ?? null,
    phone: item.Phone ?? null,
    email: item.Mail ?? null,
    amount: item.Amount ? Number(item.Amount) : null,
    currency: item.Currency ?? null,
    confirmation_code: item.Confirmation ?? null,
    last4: item.LastNum ?? null,
    card_expiry: item.Tokef ?? null,
    transaction_type: item.TransactionType ?? null,
    group_name: item.Groupe ?? null,
    matrim_id: item.MatrimId ?? null,
    comments: item.Comments ?? null,
    payments_count: item.Tashloumim ? Number(item.Tashloumim) : null,
    first_payment_amount: item.FirstTashloum ? Number(item.FirstTashloum) : null,
    mosad_number: item.MosadNumber ?? null,
    call_id: item.CallId ?? null,
    masof_id: item.MasofId ?? null,
    transaction_id_raw: item.TransactionId ?? null,
    company_card: item.CompagnyCard ?? null,
    credit_terms: item.CreditTerms ?? null,
    manpik: item.Manpik ?? null,
    brand: item.Brand ?? null,
    solek: item.Solek ?? null,
    tayar: item.Tayar ?? null,
    makor: item.Makor ?? null,
    keva_id: item.KevaId ?? null,
    param1: item.Param1 ?? null,
    param2: item.Param2 ?? null,
    receipt_created: item.ReceiptCreated === "1",
    receipt_data: item.ReceiptData ?? null,
    receipt_doc_num: item.ReceiptDocNum ?? null,
    debit_iframe: item.DebitIframe ?? null,
    uid: item.UID ?? null,
    transaction_time_raw: item.TransactionTime ?? null,
    raw_payload: item,
  };
}

async function upsertWithRetry(rows: Record<string, string>[]) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const mapped = rows.map(mapRow);
  const ids = mapped.map((r) => r.external_transaction_id).join(",");

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabase
        .from("transactions")
        .upsert(mapped, { onConflict: "external_transaction_id" });
      if (!error) return;
      console.error(`nedarim-webhook upsert attempt ${attempt} failed (tx ${ids}): ${error.message}`);
    } catch (err) {
      console.error(`nedarim-webhook upsert attempt ${attempt} threw (tx ${ids}): ${String(err)}`);
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  console.error(`nedarim-webhook GAVE UP after 3 attempts (tx ${ids}) — recover via nedarim-recovery`);
}

Deno.serve(async (req) => {
  const json = { "Content-Type": "application/json" };

  // GET = keep-warm ping from the nedarim-recovery cron.
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, warm: true }), { status: 200, headers: json });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: json });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: json });
  }
  const rows = Array.isArray(body) ? body : [body];

  // Answer Nedarim immediately; the DB write continues in the background.
  EdgeRuntime.waitUntil(upsertWithRetry(rows));

  return new Response(JSON.stringify({ ok: true, count: rows.length }), { status: 200, headers: json });
});
