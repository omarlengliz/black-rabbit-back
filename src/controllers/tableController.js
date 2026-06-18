// ─── Table Controller ───────────────────────────────────────────────
const Table = require('../models/Table');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

/** GET /api/tables */
const list = asyncHandler(async (req, res) => {
  const tables = await Table.find().sort({ number: 1 });
  return success(res, tables);
});

/** GET /api/tables/:id */
const getById = asyncHandler(async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return error(res, 'Table not found', 404);
  return success(res, table);
});

/** GET /api/tables/validate/:token — public, validates QR token */
const validateToken = asyncHandler(async (req, res) => {
  const table = await Table.findOne({ qrToken: req.params.token });
  if (!table || !table.isActive) {
    return error(res, 'Invalid or inactive table', 404);
  }
  return success(res, { tableId: table._id, tableNumber: table.number, isActive: table.isActive });
});

/** POST /api/tables */
const create = asyncHandler(async (req, res) => {
  const { number } = req.body;
  if (number == null) return error(res, 'Table number is required', 400);
  const table = await Table.create(req.body);
  return success(res, table, 201);
});

/** PUT /api/tables/:id */
const update = asyncHandler(async (req, res) => {
  const table = await Table.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!table) return error(res, 'Table not found', 404);
  return success(res, table);
});

/** DELETE /api/tables/:id */
const remove = asyncHandler(async (req, res) => {
  const table = await Table.findByIdAndDelete(req.params.id);
  if (!table) return error(res, 'Table not found', 404);
  return success(res, { message: 'Table deleted' });
});

module.exports = { list, getById, validateToken, create, update, remove };
