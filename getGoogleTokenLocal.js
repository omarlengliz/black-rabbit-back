const { google } = require('googleapis');
const express = require('express');

const credentials = require('./client_secret.json');
const { client_secret, client_id } = credentials.web;
const redirect_uri = 'http://localhost:3000/oauth2callback';

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file']
});

const app = express();

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send('No code found in URL.');
  }
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    console.log('\n\n--- SUCCESS! Refresh Token Obtained ---\n');
    console.log('REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\n----------------------------------------\n');
    res.send('Success! You can close this window. The token has been printed in the terminal.');
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    console.error('Error retrieving access token', err);
    res.send('Error! Check terminal.');
    setTimeout(() => process.exit(1), 1000);
  }
});

app.listen(3000, () => {
  console.log(`Server listening on http://localhost:3000`);
  console.log(`Please go to this URL in your browser to authorize:\n\n${authUrl}\n`);
});
