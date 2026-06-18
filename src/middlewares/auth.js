// ─── Auth Middleware ─────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { error } = require('../utils/apiResponse');

/**
 * Verifies JWT from Authorization header and attaches req.user.
 */
const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return error(res, 'Missing or malformed token', 401);
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return error(res, 'Invalid token — user not found or inactive', 401);
    }

    req.user = user;
    next();
  } catch (err) {
    return error(res, 'Invalid or expired token', 401);
  }
};

/**
 * Role guard — only allows users whose role is in the provided list.
 * Must be used AFTER authenticate.
 * @param  {...string} roles  e.g. 'admin', 'waiter'
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return error(res, 'Insufficient permissions', 403);
    }
    next();
  };
};

/** Shorthand: admin only */
const isAdmin = requireRole('admin');

/** Shorthand: any staff (admin or waiter) */
const isStaff = requireRole('admin', 'waiter');

module.exports = { authenticate, requireRole, isAdmin, isStaff };
