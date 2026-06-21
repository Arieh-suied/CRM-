import "dotenv/config";
import { google } from "googleapis";
import readline from "readline";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.readonly"],
});

console.log("Open this URL in your browser:\n");
console.log(authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("\nPaste the code here: ", async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log("\nYour refresh_token:\n");
    console.log(tokens.refresh_token);
    console.log(
      "\nAdd this to your .env file:\nGOOGLE_REFRESH_TOKEN=" +
        tokens.refresh_token
    );
  } catch (err) {
    console.error("Error getting token:", err.message);
  } finally {
    rl.close();
  }
});
