// ─── MenuItem Controller ────────────────────────────────────────────
const MenuItem = require('../models/MenuItem');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

/** GET /api/menu-items */
const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.categoryId) filter.categoryId = req.query.categoryId;
  if (req.query.available === 'true') filter.isAvailable = true;
  if (req.query.featured === 'true') filter.isFeatured = true;

  const items = await MenuItem.find(filter)
    .populate('categoryId', 'name sortOrder')
    .sort({ sortOrder: 1 });
  return success(res, items);
});

/** GET /api/menu-items/:id */
const getById = asyncHandler(async (req, res) => {
  const item = await MenuItem.findById(req.params.id).populate('categoryId', 'name');
  if (!item) return error(res, 'Menu item not found', 404);
  return success(res, item);
});

/** POST /api/menu-items */
const create = asyncHandler(async (req, res) => {
  const { name, price } = req.body;
  if (!name || price == null) return error(res, 'Name and price are required', 400);
  const item = await MenuItem.create(req.body);
  return success(res, item, 201);
});

/** PUT /api/menu-items/:id */
const update = asyncHandler(async (req, res) => {
  const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!item) return error(res, 'Menu item not found', 404);
  return success(res, item);
});

/** PATCH /api/menu-items/:id/availability */
const toggleAvailability = asyncHandler(async (req, res) => {
  const item = await MenuItem.findById(req.params.id);
  if (!item) return error(res, 'Menu item not found', 404);
  item.isAvailable = !item.isAvailable;
  await item.save();
  return success(res, item);
});

/** DELETE /api/menu-items/:id */
const remove = asyncHandler(async (req, res) => {
  const item = await MenuItem.findByIdAndDelete(req.params.id);
  if (!item) return error(res, 'Menu item not found', 404);
  return success(res, { message: 'Menu item deleted' });
});

module.exports = { list, getById, create, update, toggleAvailability, remove };
