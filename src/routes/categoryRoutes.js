// ─── Category Routes ────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/categoryController');
const { authenticate, isAdmin } = require('../middlewares/auth');

// Public
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

// Admin only
router.post('/', authenticate, isAdmin, ctrl.create);
router.put('/:id', authenticate, isAdmin, ctrl.update);
router.delete('/:id', authenticate, isAdmin, ctrl.remove);

module.exports = router;
