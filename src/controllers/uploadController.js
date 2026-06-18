// ─── Upload Controller ──────────────────────────────────────────────
const { Readable } = require('stream');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

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

/** POST /api/upload — upload a single image to Cloudinary */
const uploadImage = [
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) return error(res, 'No image file provided', 400);

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'black-rabbit' },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
      Readable.from(req.file.buffer).pipe(stream);
    });

    return success(res, { url: result.secure_url, public_id: result.public_id }, 201);
  }),
];

module.exports = { uploadImage };
