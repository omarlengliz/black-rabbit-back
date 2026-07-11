const { google } = require('googleapis');
const path = require('path');

let auth;

if (process.env.GOOGLE_REFRESH_TOKEN) {
  // ─── OAuth2 mode (personal Google account with refresh token) ─────
  let client_id = process.env.GOOGLE_CLIENT_ID;
  let client_secret = process.env.GOOGLE_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    try {
      const credentials = require('../../client_secret.json');
      client_id = credentials.web.client_id;
      client_secret = credentials.web.client_secret;
    } catch (err) {
      console.warn('⚠️ Google Drive: client_secret.json not found, relying on environment variables.');
    }
  }

  if (!client_id || !client_secret) {
    console.error('❌ Google Drive: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set when using GOOGLE_REFRESH_TOKEN without client_secret.json');
  }

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3000/oauth2callback'
  );

  oAuth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  auth = oAuth2Client;
  console.log('✅ Google Drive: Using OAuth2 (refresh token)');
} else if (process.env.GOOGLE_CREDENTIALS) {
  // ─── Service Account via env var (Render / production) ────────────
  auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  console.log('✅ Google Drive: Using service account (env var)');
} else {
  const fs = require('fs');
  const localCredsPath = path.join(__dirname, '../../credentials.json');
  const useADC = process.env.GOOGLE_USE_ADC === 'true' || !fs.existsSync(localCredsPath);
  
  if (useADC) {
    auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    console.log('✅ Google Drive: Using Application Default Credentials (ADC)');
  } else {
    auth = new google.auth.GoogleAuth({
      keyFile: localCredsPath,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    console.log('✅ Google Drive: Using service account (credentials.json)');
  }
}

// Initialize the Google Drive API client
const drive = google.drive({ version: 'v3', auth });

module.exports = drive;
