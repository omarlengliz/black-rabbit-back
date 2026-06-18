// ─── PushSubscription Model ─────────────────────────────────────────
// Maps: public.push_subscriptions

const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    endpoint: {
      type: String,
      required: true,
      unique: true,
    },
    p256dh: {
      type: String,
      required: true,
    },
    authKey: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ userId: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
