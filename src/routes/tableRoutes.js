// ─── Table Routes ───────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/tableController');
const { authenticate, isAdmin } = require('../middlewares/auth');

// Public — anyone can view tables (for QR/menu display) and validate tokens
router.get('/validate/:token', ctrl.validateToken);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

// Admin only
router.post('/', authenticate, isAdmin, ctrl.create);
router.put('/:id', authenticate, isAdmin, ctrl.update);
router.delete('/:id', authenticate, isAdmin, ctrl.remove);

module.exports = router;
