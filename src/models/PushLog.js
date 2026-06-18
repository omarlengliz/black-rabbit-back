// ─── PushLog Model ──────────────────────────────────────────────────
// Maps: public.push_logs (idempotency tracking for push notifications)

const mongoose = require('mongoose');

const pushLogSchema = new mongoose.Schema(
  {
    tag: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushLog', pushLogSchema);
