// ─── Auth Routes ────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authenticate, isAdmin } = require('../middlewares/auth');

router.post('/register', authenticate, isAdmin, ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', authenticate, ctrl.me);
router.post('/refresh', authenticate, ctrl.refresh);

module.exports = router;
