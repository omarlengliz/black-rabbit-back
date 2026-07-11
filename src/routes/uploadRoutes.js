// ─── Upload Routes ──────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/uploadController');
const { authenticate, isAdmin } = require('../middlewares/auth');

// Public: proxy Drive images to avoid hotlink 403s
router.get('/image/:fileId', ctrl.proxyDriveImage);

// Admin only: upload a new image
router.post('/', authenticate, isAdmin, ...ctrl.uploadImage);

module.exports = router;
