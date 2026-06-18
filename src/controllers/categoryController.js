// ─── Category Controller ────────────────────────────────────────────
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

/** GET /api/categories */
const list = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ sortOrder: 1 });
  return success(res, categories);
});

/** GET /api/categories/:id */
const getById = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return error(res, 'Category not found', 404);
  return success(res, cat);
});

/** POST /api/categories */
const create = asyncHandler(async (req, res) => {
  const { name, sortOrder, isHidden } = req.body;
  if (!name) return error(res, 'Category name is required', 400);
  const cat = await Category.create({ name, sortOrder, isHidden });
  return success(res, cat, 201);
});

/** PUT /api/categories/:id */
const update = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!cat) return error(res, 'Category not found', 404);
  return success(res, cat);
});

/** DELETE /api/categories/:id */
const remove = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndDelete(req.params.id);
  if (!cat) return error(res, 'Category not found', 404);
  return success(res, { message: 'Category deleted' });
});

module.exports = { list, getById, create, update, remove };
