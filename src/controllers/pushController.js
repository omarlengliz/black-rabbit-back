// ─── Push Controller ────────────────────────────────────────────────
// Replaces the Supabase Edge Function: supabase/functions/send-push
// Sends Web Push notifications via the web-push library, with
// idempotency tracking via PushLog.

const webPush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const PushLog = require('../models/PushLog');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Configure VAPID (lazy — only if keys are present)
let vapidConfigured = false;
const ensureVapid = () => {
  if (vapidConfigured) return true;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    return true;
  }
  return false;
};

/** POST /api/push/send — send push notification to all subscribers */
const send = asyncHandler(async (req, res) => {
  if (!ensureVapid()) {
    return error(res, 'VAPID keys not configured', 500);
  }

  const { title, body, url, tag } = req.body;

  // Idempotency check (mirrors Edge Function logic)
  if (tag) {
    try {
      await PushLog.create({ tag });
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate — already sent
        logger.info(`[push] Deduplicated request for tag: ${tag}`);
        return success(res, { sent: 0, message: 'Deduplicated (already sent)' });
      }
      logger.error('[push] PushLog error:', err);
    }
  }

  const subscriptions = await PushSubscription.find();
  if (!subscriptions.length) {
    return success(res, { sent: 0, message: 'No subscriptions' });
  }

  const payload = JSON.stringify({ title, body, url, tag });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.authKey },
        },
        payload
      )
    )
  );

  // Clean up expired/unsubscribed endpoints (410 Gone)
  const expiredEndpoints = results
    .map((r, i) => ({ r, endpoint: subscriptions[i].endpoint }))
    .filter(({ r }) => r.status === 'rejected')
    .map(({ endpoint }) => endpoint);

  if (expiredEndpoints.length) {
    await PushSubscription.deleteMany({ endpoint: { $in: expiredEndpoints } });
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return success(res, { sent, total: subscriptions.length });
});

/** POST /api/push/subscribe — register a push subscription */
const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, p256dh, authKey } = req.body;
  if (!endpoint || !p256dh || !authKey) {
    return error(res, 'endpoint, p256dh, and authKey are required', 400);
  }

  const sub = await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      endpoint,
      p256dh,
      authKey,
      userId: req.user ? req.user._id : null,
    },
    { upsert: true, new: true }
  );

  return success(res, sub, 201);
});

/** DELETE /api/push/unsubscribe — remove a push subscription */
const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return error(res, 'endpoint is required', 400);
  await PushSubscription.findOneAndDelete({ endpoint });
  return success(res, { message: 'Unsubscribed' });
});

module.exports = { send, subscribe, unsubscribe };
