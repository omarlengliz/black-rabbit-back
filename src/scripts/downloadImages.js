// ─── Image Downloader: Remote URLs → Local Storage ─────────────────
// Scans the MenuItem collection for remote image URLs (e.g. Supabase Storage),
// downloads them to the local `uploads` directory, and updates the document
// with the new relative `/uploads/...` URL.
//
// Usage: node src/scripts/downloadImages.js

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const MenuItem = require('../models/MenuItem');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const log = (msg) => console.log(`[download] ${msg}`);
const warn = (msg) => console.warn(`[download] ⚠️  ${msg}`);

/**
 * Download a file from url to dest path.
 */
const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;

    client
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
};

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not set in .env');
    process.exit(1);
  }

  // Ensure uploads directory exists
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  await mongoose.connect(MONGO_URI);
  log('Connected to MongoDB');

  try {
    const items = await MenuItem.find({
      imageUrl: { $regex: /^http/i }, // Only items with remote URLs
    });

    log(`Found ${items.length} menu items with remote images.`);

    for (const item of items) {
      try {
        const urlObj = new URL(item.imageUrl);
        let ext = path.extname(urlObj.pathname);
        if (!ext) ext = '.jpg'; // Fallback if no extension in URL

        const safeName = item.name.replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
        const filename = `${safeName}${ext}`;
        const destPath = path.join(UPLOADS_DIR, filename);

        log(`Downloading: ${item.imageUrl}`);
        await downloadFile(item.imageUrl, destPath);

        item.imageUrl = filename;
        await item.save();

        log(`  ✓ Saved as ${filename}`);
      } catch (err) {
        warn(`Failed to process item ${item._id} (${item.name}): ${err.message}`);
      }
    }

    log('═══════════════════════════════════════════');
    log('  Image download complete! ✅');
    log('═══════════════════════════════════════════');
  } catch (err) {
    console.error('Download failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main();
