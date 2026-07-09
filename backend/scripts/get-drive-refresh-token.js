// One-off helper to mint GOOGLE_DRIVE_REFRESH_TOKEN for creating new fund
// sheets ("ניהול קרנות" → הקמת קרן חדשה).
//
// Why: the Google service account has zero Drive storage quota, so it can't
// own files — copying the fund template as the service account fails with
// "storage quota has been exceeded". The copy must run as the real Google
// user who owns the template; this script mints that user's refresh token.
//
// Usage (PowerShell, from the backend/ folder) — reuses the som.noflim OAuth
// client; paste its values from Vercel's Environment Variables first:
//   $env:GOOGLE_CLIENT_ID_SOM     = "..."
//   $env:GOOGLE_CLIENT_SECRET_SOM = "..."
//   node scripts/get-drive-refresh-token.js
//
// IMPORTANT: at the consent screen, sign in with the Google account that OWNS
// the fund spreadsheets/template (NOT som.noflim). Then put the printed token
// in Vercel as GOOGLE_DRIVE_REFRESH_TOKEN and redeploy.

import "dotenv/config";
import { google } from "googleapis";
import readline from "readline";

const { GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM } = process.env;
// Desktop-type OAuth client → loopback redirect. Nothing has to listen on it;
// after consent Google puts ?code=... in the URL and we copy it by hand.
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI_SOM || "http://localhost";

if (!GOOGLE_CLIENT_ID_SOM || !GOOGLE_CLIENT_SECRET_SOM) {
  console.error("Missing env vars. Set GOOGLE_CLIENT_ID_SOM and GOOGLE_CLIENT_SECRET_SOM first.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a fresh refresh_token even if one was granted before
  scope: ["https://www.googleapis.com/auth/drive"],
});

console.log("\n1. Open this URL and sign in with the account that OWNS the fund sheets:\n");
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
    console.log("\n3. New GOOGLE_DRIVE_REFRESH_TOKEN (paste into Vercel, then redeploy):\n");
    console.log(tokens.refresh_token);
  } catch (err) {
    console.error("Error getting token:", err.message);
  } finally {
    rl.close();
  }
});
