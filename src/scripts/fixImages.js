const mongoose = require('mongoose');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

async function fixImages() {
  const PG_URI = process.env.PG_CONNECTION_STRING;
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/blackrabbit';

  if (!PG_URI) {
    console.error('PG_CONNECTION_STRING is not set in .env');
    process.exit(1);
  }

  const pg = new Client({ connectionString: PG_URI });
  await pg.connect();
  console.log('Connected to PostgreSQL');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const MenuItem = require('../models/MenuItem');

  const { rows: pgItems } = await pg.query(
    "SELECT id, name, image_url FROM public.menu_items WHERE image_url IS NOT NULL AND image_url != ''"
  );
  console.log(`Found ${pgItems.length} menu items with images in PostgreSQL`);

  let downloaded = 0;
  let failed = 0;

  for (const row of pgItems) {
    const url = row.image_url;
    if (!url || url.startsWith('/uploads')) continue;

    const ext = path.extname(new URL(url).pathname) || '.jpeg';
    const filename = `${row.name.replace(/[^a-zA-Z0-9_-]/g, '_')}${ext}`;
    const dest = path.join(UPLOADS_DIR, filename);

    if (fs.existsSync(dest)) {
      console.log(`  Already exists: ${filename}`);
    } else {
      try {
        console.log(`  Downloading: ${url} → ${filename}`);
        await download(url, dest);
        downloaded++;
      } catch (err) {
        console.error(`  Failed to download ${url}: ${err.message}`);
        failed++;
        continue;
      }
    }

    await MenuItem.findOneAndUpdate(
      { name: row.name },
      { imageUrl: filename }
    );
    console.log(`  Updated MongoDB: ${row.name} → ${filename}`);
  }

  await pg.end();
  await mongoose.disconnect();
  console.log(`\nDone. Downloaded: ${downloaded}, Failed: ${failed}`);
}

fixImages().catch(err => { console.error(err); process.exit(1); });
