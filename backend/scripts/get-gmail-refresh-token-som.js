// One-off helper to mint a fresh GOOGLE_REFRESH_TOKEN_SOM for the som.noflim@gmail.com
// mailbox used by the "סירובים" (payment-failure) Gmail sync.
//
// The live refresh token was revoked/expired by Google (invalid_grant) — most
// likely because the OAuth consent screen is still in "Testing" mode, which
// forces refresh tokens to expire after 7 days. After minting a new token,
// update GOOGLE_REFRESH_TOKEN_SOM in Vercel and redeploy. To stop this from
// recurring, move the OAuth consent screen to "In production".
//
// Usage (PowerShell, from the backend/ folder) — paste the three _SOM values
// from Vercel's Environment Variables first:
//   $env:GOOGLE_CLIENT_ID_SOM     = "..."
//   $env:GOOGLE_CLIENT_SECRET_SOM = "..."
//   $env:GOOGLE_REDIRECT_URI_SOM  = "..."   # must match the client's authorized redirect exactly
//   node scripts/get-gmail-refresh-token-som.js

import "dotenv/config";
import { google } from "googleapis";
import readline from "readline";

const { GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM } = process.env;
// Desktop-type OAuth client → loopback redirect. Nothing has to listen on it;
// after consent Google puts ?code=... in the URL and we copy it by hand.
const GOOGLE_REDIRECT_URI_SOM = process.env.GOOGLE_REDIRECT_URI_SOM || "http://localhost";

if (!GOOGLE_CLIENT_ID_SOM || !GOOGLE_CLIENT_SECRET_SOM) {
  console.error(
    "Missing env vars. Set GOOGLE_CLIENT_ID_SOM and GOOGLE_CLIENT_SECRET_SOM first."
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID_SOM,
  GOOGLE_CLIENT_SECRET_SOM,
  GOOGLE_REDIRECT_URI_SOM
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a fresh refresh_token even if one was granted before
  scope: ["https://www.googleapis.com/auth/gmail.readonly"],
});

console.log("\n1. Open this URL in your browser and sign in as som.noflim@gmail.com:\n");
console.log(authUrl);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("\n2. Paste the code Google gives you here: ", async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh_token returned. Revoke the app's access at " +
          "https://myaccount.google.com/permissions and try again (prompt=consent needs a first-time grant)."
      );
      return;
    }
    console.log("\n3. New GOOGLE_REFRESH_TOKEN_SOM (paste into Vercel, then redeploy):\n");
    console.log(tokens.refresh_token);
  } catch (err) {
    console.error("Error getting token:", err.message);
  } finally {
    rl.close();
  }
});
