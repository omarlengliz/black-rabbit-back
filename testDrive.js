require('dotenv').config();
const { Readable } = require('stream');
const drive = require('./src/config/googleDrive');

const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

async function testUpload() {
  try {
    // 1. Upload a small test file
    const response = await drive.files.create({
      requestBody: {
        name: 'test-upload.txt',
        parents: [folderId],
      },
      media: {
        mimeType: 'text/plain',
        body: Readable.from(Buffer.from('Hello from Black Rabbit backend!')),
      },
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = response.data.id;
    console.log('✅ File uploaded! ID:', fileId);

    // 2. Make it public
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    console.log('✅ Public permission set');

    // 3. Generate URL
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    console.log('✅ Public URL:', directUrl);

    // 4. Clean up - delete the test file
    await drive.files.delete({ fileId });
    console.log('✅ Test file deleted (cleanup)');

    console.log('\n🎉 All Google Drive operations work correctly!');
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

testUpload();
