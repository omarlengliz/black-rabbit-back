// ─── DeliveryOrder Controller ───────────────────────────────────────
const crypto = require('crypto');
const DeliveryOrder = require('../models/DeliveryOrder');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const sse = require('../sse/sseManager');

const generateTrackingCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'BR-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/** GET /api/delivery-orders — staff only */
const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const orders = await DeliveryOrder.find(filter).sort({ createdAt: -1 });
  return success(res, orders);
});

/** GET /api/delivery-orders/:id — staff only */
const getById = asyncHandler(async (req, res) => {
  const order = await DeliveryOrder.findById(req.params.id);
  if (!order) return error(res, 'Delivery order not found', 404);
  return success(res, order);
});

/** POST /api/delivery-orders — public */
const create = asyncHandler(async (req, res) => {
  const { customerName, customerPhone, customerAddress, items } = req.body;
  if (!customerName || !customerPhone || !customerAddress || !items || !items.length) {
    return error(res, 'customerName, customerPhone, customerAddress, and items are required', 400);
  }

  const subtotal = req.body.subtotal || items.reduce((s, i) => s + (i.unitPrice || 0) * (i.quantity || 1), 0);
  const deliveryFee = req.body.deliveryFee != null ? req.body.deliveryFee : 3;
  const total = req.body.total || subtotal + deliveryFee;

  const order = await DeliveryOrder.create({
    ...req.body,
    subtotal,
    deliveryFee,
    total,
    trackingCode: generateTrackingCode(),
  });

  sse.broadcast('delivery:new', order);

  return success(res, order, 201);
});

/** PATCH /api/delivery-orders/:id/status — staff only */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'preparing', 'delivering', 'delivered', 'cancelled'];
  if (!valid.includes(status)) {
    return error(res, `Status must be one of: ${valid.join(', ')}`, 400);
  }
  const order = await DeliveryOrder.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!order) return error(res, 'Delivery order not found', 404);

  sse.broadcast('delivery:updated', { deliveryOrderId: order._id, status: order.status });

  return success(res, order);
});

/** DELETE /api/delivery-orders/:id — staff only */
const remove = asyncHandler(async (req, res) => {
  const order = await DeliveryOrder.findByIdAndDelete(req.params.id);
  if (!order) return error(res, 'Delivery order not found', 404);
  return success(res, { message: 'Delivery order deleted' });
});

module.exports = { list, getById, create, updateStatus, remove };
