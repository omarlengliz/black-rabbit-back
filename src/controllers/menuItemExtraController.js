// ─── MenuItemExtra Controller ───────────────────────────────────────
const MenuItemExtra = require('../models/MenuItemExtra');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

/** GET /api/extras */
const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.categoryId) filter.categoryId = req.query.categoryId;
  const extras = await MenuItemExtra.find(filter).populate('categoryId', 'name');
  return success(res, extras);
});

/** GET /api/extras/:id */
const getById = asyncHandler(async (req, res) => {
  const extra = await MenuItemExtra.findById(req.params.id);
  if (!extra) return error(res, 'Extra not found', 404);
  return success(res, extra);
});

/** POST /api/extras */
const create = asyncHandler(async (req, res) => {
  const { name, price } = req.body;
  if (!name || price == null) return error(res, 'Name and price are required', 400);
  const extra = await MenuItemExtra.create(req.body);
  return success(res, extra, 201);
});

/** PUT /api/extras/:id */
const update = asyncHandler(async (req, res) => {
  const extra = await MenuItemExtra.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!extra) return error(res, 'Extra not found', 404);
  return success(res, extra);
});

/** DELETE /api/extras/:id */
const remove = asyncHandler(async (req, res) => {
  const extra = await MenuItemExtra.findByIdAndDelete(req.params.id);
  if (!extra) return error(res, 'Extra not found', 404);
  return success(res, { message: 'Extra deleted' });
});

module.exports = { list, getById, create, update, remove };
