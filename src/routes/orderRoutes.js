// ─── Order Routes ───────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/orderController');
const { authenticate, isStaff } = require('../middlewares/auth');

// Public — customers place orders via QR
router.post('/', ctrl.create);

// Public — track an order by code (Delivery or Regular)
router.get('/track/:code', ctrl.trackOrder);

// Staff only
router.get('/', authenticate, isStaff, ctrl.list);
router.get('/:id', authenticate, isStaff, ctrl.getById);
router.patch('/:id/status', authenticate, isStaff, ctrl.updateStatus);
router.post('/:id/items', authenticate, isStaff, ctrl.appendItems);
router.put('/:id/items/:itemId', authenticate, isStaff, ctrl.updateItem);
router.delete('/:id/items/:itemId', authenticate, isStaff, ctrl.removeItem);
router.delete('/:id', authenticate, isStaff, ctrl.remove);

module.exports = router;
