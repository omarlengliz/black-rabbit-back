// ─── AppSetting Model ───────────────────────────────────────────────
// Maps: public.app_settings (key-value config store)

const mongoose = require('mongoose');

const appSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Setting key is required'],
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppSetting', appSettingSchema);
