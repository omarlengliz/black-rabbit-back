require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const { Readable } = require('stream');
const drive = require('../config/googleDrive');
const MenuItem = require('../models/MenuItem');

async function migrateImages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID is missing in .env');
    }

    // Find all menu items with a Cloudinary image
    const items = await MenuItem.find({ imageUrl: /cloudinary\.com/i });
    console.log(`Found ${items.length} items to migrate.`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`[${i + 1}/${items.length}] Migrating image for "${item.name}"...`);
      
      try {
        // 1. Download image from Cloudinary
        const response = await axios.get(item.imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        
        // Extract filename from URL or use a default
        const urlParts = item.imageUrl.split('/');
        const originalFilename = urlParts[urlParts.length - 1] || 'image.jpg';

        // 2. Upload to Google Drive
        const driveResponse = await drive.files.create({
          requestBody: {
            name: `${Date.now()}-${originalFilename}`,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
          },
          media: {
            mimeType: mimeType,
            body: Readable.from(buffer),
          },
          fields: 'id',
        });

        const fileId = driveResponse.data.id;

        // 3. Make the file publicly accessible
        await drive.permissions.create({
          fileId: fileId,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        });

        // 4. Update Database
        const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
        item.imageUrl = directUrl;
        await item.save();

        console.log(`  -> Success! New URL: ${directUrl}`);
      } catch (err) {
        console.error(`  -> Failed to migrate image for "${item.name}":`, err.message);
      }
    }

    console.log('Migration completed!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    mongoose.disconnect();
  }
}

migrateImages();
