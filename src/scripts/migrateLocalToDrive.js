require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const drive = require('../config/googleDrive');
const MenuItem = require('../models/MenuItem');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runMigration() {
  try {
    console.log('\n--- Starting Local Images Migration to Google Drive ---\n');
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID is missing in .env');
    }

    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      throw new Error(`Uploads directory not found at: ${uploadsDir}`);
    }

    const files = fs.readdirSync(uploadsDir).filter(f => f !== '.gitkeep');
    console.log(`Found ${files.length} files in uploads folder.\n`);

    let success = 0, skipped = 0, failed = 0;

    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const nameWithoutExt = path.parse(filename).name;
      
      // Clean up: replace underscores/dashes with spaces, trim trailing spaces/underscores
      let itemName = nameWithoutExt
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Try exact match first
      let item = await MenuItem.findOne({ name: { $regex: new RegExp('^' + escapeRegex(itemName) + '$', 'i') } });

      if (!item) {
        // Try fuzzy check or substring check if needed, but let's stick to regex match first
        // If not found, let's try replacing accents / diacritics
        const normalizedItemName = itemName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        item = await MenuItem.findOne({ name: { $regex: new RegExp('^' + escapeRegex(normalizedItemName) + '$', 'i') } });
      }

      if (!item) {
        console.log(`[${i + 1}/${files.length}] SKIP "${filename}" (no database match for "${itemName}")`);
        skipped++;
        continue;
      }

      // Skip if already migrated to Google Drive
      if (item.imageUrl && item.imageUrl.includes('drive.google.com')) {
        console.log(`[${i + 1}/${files.length}] ALREADY DONE: "${item.name}"`);
        skipped++;
        continue;
      }

      console.log(`[${i + 1}/${files.length}] Uploading "${filename}" for "${item.name}"...`);

      try {
        const filePath = path.join(uploadsDir, filename);
        const ext = path.extname(filename).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

        // 1. Upload to Google Drive
        const driveResponse = await drive.files.create({
          requestBody: {
            name: `${Date.now()}-${filename}`,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
          },
          media: {
            mimeType: mimeType,
            body: fs.createReadStream(filePath),
          },
          fields: 'id',
        });

        const fileId = driveResponse.data.id;

        // 2. Make publicly accessible
        await drive.permissions.create({
          fileId: fileId,
          requestBody: { role: 'reader', type: 'anyone' },
        });

        // 3. Update DB
        const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
        item.imageUrl = directUrl;
        await item.save();

        console.log(`  ✓ Success! ${directUrl}`);
        success++;
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n--- Migration Complete ---`);
    console.log(`Success: ${success} | Skipped: ${skipped} | Failed: ${failed}`);

  } catch (err) {
    console.error('Migration crashed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

runMigration();
