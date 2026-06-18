// ─── Centralized Error Handler ──────────────────────────────────────
const logger = require('../utils/logger');

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Express error-handling middleware (4 args).
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({ success: false, error: 'Validation failed', details });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      error: `Duplicate value for field: ${field}`,
    });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }

  // Custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }

  // express-validator errors (thrown manually)
  if (err.statusCode) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }

  // Unhandled
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
};

module.exports = { AppError, errorHandler };
