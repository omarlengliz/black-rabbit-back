// ─── Upload Routes ──────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/uploadController');
const { authenticate, isAdmin } = require('../middlewares/auth');

router.post('/', authenticate, isAdmin, ...ctrl.uploadImage);

module.exports = router;
