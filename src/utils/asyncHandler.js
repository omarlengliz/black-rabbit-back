// ─── Async Handler ──────────────────────────────────────────────────
// Wraps async route handlers so rejected promises are forwarded to the
// Express error-handling middleware instead of requiring try/catch in
// every controller.

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
