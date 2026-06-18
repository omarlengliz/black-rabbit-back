// ─── AppSetting Controller ──────────────────────────────────────────
const AppSetting = require('../models/AppSetting');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');

/** GET /api/settings — public */
const list = asyncHandler(async (req, res) => {
  const settings = await AppSetting.find();
  return success(res, settings);
});

/** GET /api/settings/:key — public */
const getByKey = asyncHandler(async (req, res) => {
  const setting = await AppSetting.findOne({ key: req.params.key });
  if (!setting) return error(res, 'Setting not found', 404);
  return success(res, setting);
});

/** PUT /api/settings/:key — admin only (upsert) */
const upsert = asyncHandler(async (req, res) => {
  const { value } = req.body;
  const setting = await AppSetting.findOneAndUpdate(
    { key: req.params.key },
    { key: req.params.key, value },
    { new: true, upsert: true, runValidators: true }
  );
  return success(res, setting);
});

/** DELETE /api/settings/:key — admin only */
const remove = asyncHandler(async (req, res) => {
  const setting = await AppSetting.findOneAndDelete({ key: req.params.key });
  if (!setting) return error(res, 'Setting not found', 404);
  return success(res, { message: 'Setting deleted' });
});

module.exports = { list, getByKey, upsert, remove };
