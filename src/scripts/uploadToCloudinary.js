// ─── Upload existing images to Cloudinary & update MongoDB ────────────
// 1. Reads files from backend/uploads/
// 2. Uploads each to Cloudinary
// 3. Updates MongoDb MenuItem.imageUrl with the Cloudinary URL

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const MenuItem = require('../models/MenuItem');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function findMatchingFile(files, itemName) {
  // Try exact sanitized match first
  const sanitized = sanitizeName(itemName);
  const exact = files.find(f => {
    const base = path.basename(f, path.extname(f));
    return base === sanitized;
  });
  if (exact) return exact;

  // Try case-insensitive
  const lower = sanitized.toLowerCase();
  const ci = files.find(f => {
    const base = path.basename(f, path.extname(f)).toLowerCase();
    return base === lower;
  });
  if (ci) return ci;

  // Try contains
  const contains = files.find(f => {
    const base = path.basename(f, path.extname(f)).toLowerCase();
    return base.includes(lower) || lower.includes(base);
  });
  return contains || null;
}

async function uploadToCloudinary(filePath) {
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      { folder: 'black-rabbit' },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });
  return result.secure_url;
}

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/blackrabbit');
  console.log('Connected to MongoDB');

  const items = await MenuItem.find({}, 'name imageUrl').sort({ name: 1 }).lean();
  const files = fs.readdirSync(UPLOADS_DIR).filter(f => f !== '.gitkeep');
  console.log(`Found ${files.length} image files in uploads/`);
  console.log(`Found ${items.length} menu items in MongoDB`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    // Skip if already a Cloudinary URL
    if (item.imageUrl && item.imageUrl.includes('cloudinary.com')) {
      console.log(`  SKIP ${item.name} — already Cloudinary`);
      skipped++;
      continue;
    }

    const match = findMatchingFile(files, item.name);
    if (!match) {
      console.log(`  SKIP ${item.name} — no matching file found`);
      skipped++;
      continue;
    }

    const filePath = path.join(UPLOADS_DIR, match);
    try {
      console.log(`  UPLOAD ${item.name} → ${match}`);
      const url = await uploadToCloudinary(filePath);
      await MenuItem.updateOne({ _id: item._id }, { imageUrl: url });
      console.log(`  DONE   ${item.name} → ${url}`);
      uploaded++;
    } catch (err) {
      console.error(`  FAIL   ${item.name}: ${err.message}`);
      failed++;
    }
  }

  await mongoose.disconnect();
  console.log(`\nDone. Uploaded: ${uploaded}, Skipped: ${skipped}, Failed: ${failed}`);
}

migrate().catch(err => { console.error(err); process.exit(1); });
