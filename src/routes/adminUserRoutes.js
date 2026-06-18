// ─── Admin User Routes ──────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../controllers/adminUserController');
const { authenticate, isAdmin } = require('../middlewares/auth');

// All admin-only
router.use(authenticate, isAdmin);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
