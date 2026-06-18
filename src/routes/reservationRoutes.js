// ─── Reservation Routes ─────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/reservationController');
const { authenticate, isStaff } = require('../middlewares/auth');

// Public — customers can create reservations
router.post('/', ctrl.create);

// Staff only
router.get('/', authenticate, isStaff, ctrl.list);
router.get('/:id', authenticate, isStaff, ctrl.getById);
router.put('/:id', authenticate, isStaff, ctrl.update);
router.patch('/:id/status', authenticate, isStaff, ctrl.updateStatus);
router.delete('/:id', authenticate, isStaff, ctrl.remove);

module.exports = router;
