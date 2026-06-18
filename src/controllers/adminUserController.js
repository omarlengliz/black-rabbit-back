// ─── Admin Users Controller ─────────────────────────────────────────
// Replaces the Supabase Edge Function: supabase/functions/admin-users
// Provides CRUD for staff user accounts (admin-only).
// In the Supabase version this used auth.admin.createUser/deleteUser.
// Here we simply CRUD the User model directly.

const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

/** GET /api/admin/users — list all staff users */
const list = asyncHandler(async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  return success(res, { users });
});

/** POST /api/admin/users — create a staff user */
const create = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return error(res, 'email, password, role required', 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return error(res, 'Email already in use', 409);

  const user = await User.create({ email, password, role });
  return success(res, { user }, 201);
});

/** PUT /api/admin/users/:id — update a staff user */
const update = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Prevent self-modification via the admin panel
  if (req.user._id.toString() === id) {
    return error(res, 'Use My Account to change your own credentials', 400);
  }

  const user = await User.findById(id);
  if (!user) return error(res, 'User not found', 404);

  if (req.body.email) user.email = req.body.email;
  if (req.body.password) user.password = req.body.password; // will be hashed by pre-save hook
  if (req.body.role) user.role = req.body.role;
  if (req.body.isActive !== undefined) user.isActive = req.body.isActive;

  await user.save();
  return success(res, { user });
});

/** DELETE /api/admin/users/:id — delete a staff user */
const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.user._id.toString() === id) {
    return error(res, 'Cannot delete yourself', 400);
  }

  const user = await User.findByIdAndDelete(id);
  if (!user) return error(res, 'User not found', 404);
  return success(res, { message: 'User deleted' });
});

module.exports = { list, create, update, remove };
