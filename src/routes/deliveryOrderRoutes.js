// ─── DeliveryOrder Routes ───────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/deliveryOrderController');
const { authenticate, isStaff } = require('../middlewares/auth');

// Public — customers place delivery orders
router.post('/', ctrl.create);

// Staff only
router.get('/', authenticate, isStaff, ctrl.list);
router.get('/:id', authenticate, isStaff, ctrl.getById);
router.patch('/:id/status', authenticate, isStaff, ctrl.updateStatus);
router.delete('/:id', authenticate, isStaff, ctrl.remove);

module.exports = router;
