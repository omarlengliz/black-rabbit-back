// ─── MenuItem Routes ────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/menuItemController');
const { authenticate, isAdmin } = require('../middlewares/auth');

// Public
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

// Admin only
router.post('/', authenticate, isAdmin, ctrl.create);
router.put('/:id', authenticate, isAdmin, ctrl.update);
router.patch('/:id/availability', authenticate, isAdmin, ctrl.toggleAvailability);
router.delete('/:id', authenticate, isAdmin, ctrl.remove);

module.exports = router;
