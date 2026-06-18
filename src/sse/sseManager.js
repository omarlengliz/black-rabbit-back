// ─── SSE Manager ────────────────────────────────────────────────────
// Replaces Supabase Realtime subscriptions with Server-Sent Events.
//
// Usage in controllers:
//   const sse = require('../sse/sseManager');
//   sse.broadcast('order:new', orderData);
//   sse.sendToUser(userId, 'order:updated', { orderId, status });

const logger = require('../utils/logger');

/** @type {Map<string, import('express').Response>} */
const clients = new Map();

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

/**
 * Express route handler — keeps the connection open as an SSE stream.
 * Attach user info via query param or after auth middleware.
 *
 * GET /api/events?userId=xxx  (or rely on req.user from auth middleware)
 */
const connect = (req, res) => {
  const clientId =
    (req.user && req.user._id && req.user._id.toString()) ||
    req.query.clientId ||
    `anon-${Date.now()}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx compatibility
  });

  // Send initial connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  clients.set(clientId, res);
  logger.info(`SSE client connected: ${clientId} (total: ${clients.size})`);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, HEARTBEAT_INTERVAL);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
    logger.info(`SSE client disconnected: ${clientId} (total: ${clients.size})`);
  });
};

/**
 * Broadcast an event to ALL connected clients.
 * @param {string} event  Event name, e.g. 'order:new'
 * @param {*} data        Payload (will be JSON-stringified)
 */
const broadcast = (event, data) => {
  const payload = `data: ${JSON.stringify({ type: event, data })}\n\n`;
  for (const [, res] of clients) {
    res.write(payload);
  }
};

/**
 * Send an event to a specific user/client.
 * @param {string} clientId
 * @param {string} event
 * @param {*} data
 */
const sendToUser = (clientId, event, data) => {
  const res = clients.get(clientId);
  if (res) {
    res.write(`data: ${JSON.stringify({ type: event, data })}\n\n`);
  }
};

/**
 * @returns {number} Number of connected clients
 */
const getClientCount = () => clients.size;

module.exports = { connect, broadcast, sendToUser, getClientCount };
