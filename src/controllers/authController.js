// ─── Auth Controller ────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

/**
 * POST /api/auth/register
 * Create a new staff user (admin only).
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return error(res, 'Email and password are required', 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return error(res, 'Email already in use', 409);
  }

  const user = await User.create({ email, password, role: role || 'waiter' });

  return success(res, { user }, 201);
});

/**
 * POST /api/auth/login
 * Authenticate staff and return JWT.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return error(res, 'Email and password are required', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.comparePassword(password))) {
    return error(res, 'Invalid email or password', 401);
  }

  if (!user.isActive) {
    return error(res, 'Account is deactivated', 403);
  }

  const token = jwt.sign({ id: user._id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

  return success(res, {
    token,
    user: { id: user._id, email: user.email, role: user.role },
  });
});

/**
 * GET /api/auth/me
 * Return the currently authenticated user's profile.
 */
const me = asyncHandler(async (req, res) => {
  return success(res, { user: req.user });
});

/**
 * POST /api/auth/refresh
 * Issue a fresh JWT for a still-valid session.
 */
const refresh = asyncHandler(async (req, res) => {
  const token = jwt.sign(
    { id: req.user._id, role: req.user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
  return success(res, { token });
});

module.exports = { register, login, me, refresh };
