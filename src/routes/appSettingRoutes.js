// ─── AppSetting Routes ──────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/appSettingController');
const { authenticate, isAdmin } = require('../middlewares/auth');

// Public
router.get('/', ctrl.list);
router.get('/:key', ctrl.getByKey);

// Admin only
router.put('/:key', authenticate, isAdmin, ctrl.upsert);
router.delete('/:key', authenticate, isAdmin, ctrl.remove);

module.exports = router;
