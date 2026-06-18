// ─── Push Routes ────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/pushController');
const { authenticate, isStaff } = require('../middlewares/auth');

// Authenticated users can subscribe/unsubscribe
router.post('/subscribe', authenticate, ctrl.subscribe);
router.delete('/unsubscribe', authenticate, ctrl.unsubscribe);

// Staff can send push notifications
router.post('/send', authenticate, isStaff, ctrl.send);

module.exports = router;
