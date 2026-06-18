// ─── Order Controller ───────────────────────────────────────────────
const crypto = require('crypto');
const Order = require('../models/Order');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const DeliveryOrder = require('../models/DeliveryOrder');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const sse = require('../sse/sseManager');
const webPush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const env = require('../config/env');

/**
 * Generate a tracking code like "BR-XXXXX"
 */
const generateTrackingCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'BR-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/** GET /api/orders — staff only */
const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.tableId) filter.tableId = req.query.tableId;

  const orders = await Order.find(filter)
    .populate('tableId', 'number')
    .sort({ createdAt: -1 });
  return success(res, orders);
});

/** GET /api/orders/:id — staff only */
const getById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('tableId', 'number');
  if (!order) return error(res, 'Order not found', 404);
  return success(res, order);
});

/**
 * POST /api/orders — public (anyone can place an order).
 * Requires a valid qrToken in the body to identify the table.
 */
const create = asyncHandler(async (req, res) => {
  const { token, items, notes, tableId, tableNumber } = req.body;

  if (!items || !items.length) {
    return error(res, 'At least one item is required', 400);
  }

  if (!token && !tableId && !tableNumber) {
    return error(res, 'Token or Table ID is required', 400);
  }

  let table = null;

  if (token) {
    // Validate QR token
    table = await Table.findOne({ qrToken: token, isActive: true });
    if (!table) {
      return error(res, 'Invalid or inactive table. Please scan the QR code.', 403);
    }
  } else if (req.body.tableId || req.body.tableNumber) {
    // Staff creating order directly
    if (req.body.tableId) {
      table = await Table.findById(req.body.tableId);
    } else {
      table = await Table.findOne({ number: req.body.tableNumber });
    }
  }

  if (!table) {
    return error(res, 'Table not found', 404);
  }
  const allMenuItems = await MenuItem.find();
  const menuItemMap = new Map(allMenuItems.map((m) => [m._id.toString(), m]));

  const orderItems = items.map((item) => {
    const mi = menuItemMap.get(item.menuItemId);
    return {
      menuItemId: mi ? mi._id : null,
      menuItemName: item.menuItemName || (mi ? mi.name : 'Unknown'),
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice != null ? item.unitPrice : (mi ? mi.price : 0),
      selectedExtras: item.selectedExtras || [],
    };
  });

  const total =
    req.body.total ||
    orderItems.reduce((sum, i) => {
      const extrasTotal = (i.selectedExtras || []).reduce((s, e) => s + (e.price || 0), 0);
      return sum + i.unitPrice * i.quantity + extrasTotal * i.quantity;
    }, 0);

  const order = await Order.create({
    tableId: table._id,
    tableNumber: table.number,
    total,
    notes: notes || '',
    trackingCode: generateTrackingCode(),
    items: orderItems,
  });

  // Broadcast SSE event (replaces Supabase Realtime INSERT trigger)
  sse.broadcast('order:new', order);

  // Send Push Notification securely from the backend
  try {
    const subscriptions = await PushSubscription.find();
    if (subscriptions.length > 0 && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      webPush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
      
      const payload = JSON.stringify({
        title: '🛎️ Nouvelle Commande',
        body: `Table ${order.tableNumber} — ${Number(order.total).toFixed(1)} DT`,
        url: '/admin?tab=orders',
        tag: `order-${order._id}`
      });

      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
            payload
          )
        )
      );

      // Clean up expired subscriptions
      const expiredEndpoints = results
        .map((r, i) => ({ r, endpoint: subscriptions[i].endpoint }))
        .filter(({ r }) => r.status === 'rejected')
        .map(({ endpoint }) => endpoint);

      if (expiredEndpoints.length) {
        await PushSubscription.deleteMany({ endpoint: { $in: expiredEndpoints } });
      }
    }
  } catch (err) {
    console.error('[push] Failed to send order notification:', err);
  }

  return success(res, order, 201);
});

/** PATCH /api/orders/:id/status — staff only */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'preparing', 'completed', 'cancelled'];
  if (!valid.includes(status)) {
    return error(res, `Status must be one of: ${valid.join(', ')}`, 400);
  }

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!order) return error(res, 'Order not found', 404);

  // Broadcast SSE event (replaces Supabase Realtime UPDATE trigger)
  sse.broadcast('order:updated', { orderId: order._id, status: order.status });

  return success(res, order);
});

/** DELETE /api/orders/:id — staff only */
const remove = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) return error(res, 'Order not found', 404);
  return success(res, { message: 'Order deleted' });
});

/** GET /api/orders/track/:code — public */
const trackOrder = asyncHandler(async (req, res) => {
  const { code } = req.params;
  if (!code) return error(res, 'Code required', 400);

  // Try Delivery Orders first
  const deliveryOrder = await DeliveryOrder.findOne({ trackingCode: code.toUpperCase() });
  if (deliveryOrder) {
    return success(res, { type: 'delivery', data: deliveryOrder });
  }

  // Try Regular Orders
  const order = await Order.findOne({ trackingCode: code.toUpperCase() });
  if (order) {
    return success(res, { type: 'regular', data: order });
  }

  return error(res, 'Order not found', 404);
});

/** PUT /api/orders/:id/items/:itemId — staff only */
const updateItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return error(res, 'Order not found', 404);
  
  const item = order.items.id(req.params.itemId);
  if (!item) return error(res, 'Item not found in order', 404);
  
  item.quantity = quantity;
  
  // Recalculate total
  order.total = order.items.reduce((sum, i) => {
    const extrasTotal = (i.selectedExtras || []).reduce((s, e) => s + (e.price || 0), 0);
    return sum + (i.unitPrice * i.quantity) + (extrasTotal * i.quantity);
  }, 0);
  
  await order.save();
  sse.broadcast('order:updated', { orderId: order._id, status: order.status });
  return success(res, order);
});

/** DELETE /api/orders/:id/items/:itemId — staff only */
const removeItem = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return error(res, 'Order not found', 404);
  
  order.items.pull({ _id: req.params.itemId });
  
  // Recalculate total
  order.total = order.items.reduce((sum, i) => {
    const extrasTotal = (i.selectedExtras || []).reduce((s, e) => s + (e.price || 0), 0);
    return sum + (i.unitPrice * i.quantity) + (extrasTotal * i.quantity);
  }, 0);
  
  await order.save();
  sse.broadcast('order:updated', { orderId: order._id, status: order.status });
  return success(res, order);
});

/** POST /api/orders/:id/items — staff only */
const appendItems = asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) return error(res, 'Items are required', 400);

  const order = await Order.findById(req.params.id);
  if (!order) return error(res, 'Order not found', 404);
  
  // Push new items
  order.items.push(...items);
  
  // Recalculate total
  order.total = order.items.reduce((sum, i) => {
    const extrasTotal = (i.selectedExtras || []).reduce((s, e) => s + (e.price || 0), 0);
    return sum + (i.unitPrice * i.quantity) + (extrasTotal * i.quantity);
  }, 0);
  
  await order.save();
  sse.broadcast('order:updated', { orderId: order._id, status: order.status });
  return success(res, order);
});

module.exports = { list, getById, create, updateStatus, remove, trackOrder, updateItem, removeItem, appendItems };
