// ─── Upload Controller ──────────────────────────────────────────────
const { Readable } = require('stream');
const multer = require('multer');
const drive = require('../config/googleDrive');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

// Simple in-memory cache: fileId -> { contentType, buffer, cachedAt }
const imageCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** GET /api/upload/image/:fileId — proxy a Drive image through the backend */
const proxyDriveImage = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  if (!fileId) return error(res, 'Missing fileId', 400);

  // Serve from cache if fresh
  const cached = imageCache.get(fileId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Cache', 'HIT');
    return res.send(cached.buffer);
  }

  try {
    const driveRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const contentType = driveRes.headers['content-type'] || 'image/jpeg';
    const buffer = Buffer.from(driveRes.data);

    // Cache it
    imageCache.set(fileId, { contentType, buffer, cachedAt: Date.now() });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Cache', 'MISS');
    return res.send(buffer);
  } catch (err) {
    console.error('Drive proxy error:', err.message);
    return error(res, 'Failed to fetch image from Drive', 502);
  }
});

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed'));
  },
});

/** POST /api/upload — upload a single image to Google Drive */
const uploadImage = [
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) return error(res, 'No image file provided', 400);

    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
      return error(res, 'Server configuration error: GOOGLE_DRIVE_FOLDER_ID is not set', 500);
    }

    try {
      // 1. Upload the file to Google Drive
      const response = await drive.files.create({
        requestBody: {
          name: `${Date.now()}-${req.file.originalname}`,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: req.file.mimetype,
          body: Readable.from(req.file.buffer),
        },
        fields: 'id, webViewLink, webContentLink',
      });

      const fileId = response.data.id;

      // 2. Make the file publicly accessible
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      // 3. Return the direct Google Drive view URL
      const driveUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

      return success(res, { url: driveUrl, public_id: fileId }, 201);
    } catch (err) {
      console.error('Google Drive Upload Error:', err);
      return error(res, 'Failed to upload image to Google Drive', 500);
    }
  }),
];

module.exports = { uploadImage, proxyDriveImage };
