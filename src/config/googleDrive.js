const { google } = require('googleapis');
const path = require('path');

function buildAuth() {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    // ─── OAuth2 mode (personal Google account) ─────────────────────
    let client_id = process.env.GOOGLE_CLIENT_ID;
    let client_secret = process.env.GOOGLE_CLIENT_SECRET;

    if (!client_id || !client_secret) {
      try {
        const creds = require('../../client_secret.json');
        client_id = creds.web.client_id;
        client_secret = creds.web.client_secret;
      } catch (err) {
        console.warn('⚠️ Google Drive: client_secret.json not found, relying on env vars.');
      }
    }

    const quotaProject = process.env.GOOGLE_QUOTA_PROJECT || 'distributed-inn-502110-q6';

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_id,
        client_secret,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        type: 'authorized_user',
        quota_project_id: quotaProject,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    console.log('✅ Google Drive: Using OAuth2 (refresh token)');
    return auth;
  }

  if (process.env.GOOGLE_CREDENTIALS) {
    // ─── Service Account via env var ───────────────────────────────
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    console.log('✅ Google Drive: Using service account (env var)');
    return auth;
  }

  // ─── ADC or local credentials file ──────────────────────────────
  const fs = require('fs');
  const localCredsPath = path.join(__dirname, '../../credentials.json');
  const useADC = process.env.GOOGLE_USE_ADC === 'true' || !fs.existsSync(localCredsPath);

  if (useADC) {
    console.log('✅ Google Drive: Using Application Default Credentials (ADC)');
    return new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
  }

  console.log('✅ Google Drive: Using service account (credentials.json)');
  return new google.auth.GoogleAuth({
    keyFile: localCredsPath,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

const drive = google.drive({ version: 'v3', auth: buildAuth() });

module.exports = drive;
