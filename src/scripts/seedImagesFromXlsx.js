const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { Readable } = require('stream');
const XLSX = require('xlsx');
const drive = require('../config/googleDrive');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const MenuItem = require('../models/MenuItem');

const GIT_REPO_DIR = path.resolve(__dirname, '../../black-rabbit-menu');
const SUPABASE_DIR = path.resolve(__dirname, '../../supabase-files');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const log = (msg) => console.log(`[seed] ${msg}`);
const warn = (msg) => console.warn(`[seed] ⚠️  ${msg}`);
const errLog = (msg) => console.error(`[seed] ❌ ${msg}`);

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (response) => {
        if (response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
};

const uploadToDrive = async (buffer, mimeType, filename) => {
  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  });
  const fileId = response.data.id;
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });
  return fileId;
};

const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
  };
  return map[ext] || 'image/jpeg';
};

const repoFiles = fs.existsSync(GIT_REPO_DIR)
  ? fs.readdirSync(GIT_REPO_DIR).filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f))
  : [];

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function findFileInRepo(filename) {
  const decoded = decodeURIComponent(filename).toLowerCase();
  const exact = repoFiles.find((f) => f.toLowerCase() === decoded);
  if (exact) return path.join(GIT_REPO_DIR, exact);
  const fuzzy = repoFiles.find((f) => {
    const base = decoded.replace(/\.[^.]+$/, '');
    return f.toLowerCase().includes(base) || base.includes(f.toLowerCase().replace(/\.[^.]+$/, ''));
  });
  if (fuzzy) return path.join(GIT_REPO_DIR, fuzzy);
  return null;
}

const PRODUCT_IMAGE_OVERRIDES = {
  'Fraisier': 'Classic.jpeg',
  'Americano': 'Ice_américano-removebg-preview.png',
  'Affogato': 'affocato.jpeg',
  'Jus': 'juice.jpeg',
  'PowerLeaf': 'Smoothie.jpeg',
  'French Toast Addict': 'Pain Perdu aux fruits.jpeg',
  'Milkshakes': 'Milkshake Br.jpeg',
};

function findImageByProductName(productName) {
  const override = PRODUCT_IMAGE_OVERRIDES[productName];
  if (override) {
    const op = path.join(GIT_REPO_DIR, override);
    if (fs.existsSync(op)) return op;
  }

  const keywords = productName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[/\\?%*:|"<>]/g, '')
    .split('/')[0]
    .trim()
    .split(/\s+/)
    .filter((k) => k.length > 2);

  const fileScores = repoFiles.map((file) => {
    const fLower = file.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const score = keywords.reduce((sum, kw) => {
      const kwStem = kw.replace(/s$/, '');
      const fStem = fLower.replace(/s$/, '');
      if (fLower.includes(kw) || fLower.includes(kwStem)) return sum + 2;
      if (fStem.includes(kw) || fStem.includes(kwStem)) return sum + 1;
      return sum;
    }, 0);
    return { file, score };
  });

  fileScores.sort((a, b) => b.score - a.score);
  if (fileScores[0] && fileScores[0].score > 0) {
    return path.join(GIT_REPO_DIR, fileScores[0].file);
  }
  return null;
}

function findMatch(name, items) {
  const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');
  for (const item of items) {
    const itemName = item.name.toLowerCase().trim().replace(/\s+/g, ' ');
    if (itemName === normalized) return item;
    if (itemName.includes(normalized) || normalized.includes(itemName)) return item;
    const normalizedShort = normalized.split('/')[0].trim();
    if (itemName.includes(normalizedShort)) return item;
  }
  return null;
}

function getImageBuffer(productName, imageFilename, imageUrl, source) {
  const decodedFilename = decodeURIComponent(imageFilename);

  const supabasePath = path.join(SUPABASE_DIR, decodedFilename);
  if (fs.existsSync(supabasePath)) {
    log(`  Using supabase-files/${decodedFilename}`);
    return { buffer: fs.readFileSync(supabasePath), mime: getMimeType(decodedFilename) };
  }

  const repoMatch = findFileInRepo(imageFilename);
  if (repoMatch) {
    log(`  Using repo: ${path.basename(repoMatch)}`);
    return { buffer: fs.readFileSync(repoMatch), mime: getMimeType(repoMatch) };
  }

  const nameMatch = findImageByProductName(productName);
  if (nameMatch) {
    log(`  Using repo (by name): ${path.basename(nameMatch)}`);
    return { buffer: fs.readFileSync(nameMatch), mime: getMimeType(nameMatch) };
  }

  return null;
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) { errLog('MONGO_URI not set'); process.exit(1); }
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) { errLog('GOOGLE_DRIVE_FOLDER_ID not set'); process.exit(1); }

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  await mongoose.connect(MONGO_URI);
  log('Connected to MongoDB');

  const existingItems = await MenuItem.find().lean();
  log(`Found ${existingItems.length} existing menu items`);

  const wb = XLSX.readFile(path.resolve(__dirname, '../../black_rabbit_products.xlsx'));
  const ws = wb.Sheets['Products'];
  const rows = XLSX.utils.sheet_to_json(ws);
  log(`Read ${rows.length} products from xlsx`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let notFound = 0;

  for (const row of rows) {
    const name = row['Name'];
    const imageUrl = row['Image URL'];
    const imageFilename = row['Image Filename'];
    const source = row['Image Source'];

    if (!name || !imageUrl || !imageFilename || imageFilename === 'None') {
      warn(`Skipping "${name || 'unnamed'}": no image info`);
      skipped++;
      continue;
    }

    const match = findMatch(name, existingItems);
    if (!match) {
      warn(`No MongoDB match for "${name}"`);
      notFound++;
      continue;
    }

    try {
      let result = getImageBuffer(name, imageFilename, imageUrl, source);

      if (!result) {
        log(`  Downloading: ${imageUrl}`);
        const urlFilename = path.basename(imageUrl.split('?')[0]);
        const tmpPath = path.join(UPLOADS_DIR, urlFilename);
        await downloadFile(imageUrl, tmpPath);
        result = { buffer: fs.readFileSync(tmpPath), mime: getMimeType(urlFilename) };
        fs.unlinkSync(tmpPath);
      }

      const driveFilename = `${Date.now()}-${imageFilename}`;
      const fileId = await uploadToDrive(result.buffer, result.mime, driveFilename);
      const proxyUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

      await MenuItem.findByIdAndUpdate(match._id, { imageUrl: proxyUrl });
      log(`[${name}] ✅ Updated: ${proxyUrl}`);
      uploaded++;
    } catch (err) {
      errLog(`[${name}] Failed: ${err.message}`);
      failed++;
    }
  }

  log('═══════════════════════════════════════════');
  log(`Done: ${uploaded} updated, ${skipped} skipped, ${notFound} unmatched, ${failed} failed`);
  log('═══════════════════════════════════════════');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
