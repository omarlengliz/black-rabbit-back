// ─── API Response Helpers ───────────────────────────────────────────

/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {number} statusCode
 */
const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data });
};

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} statusCode
 * @param {*} [details]
 */
const error = (res, message, statusCode = 400, details = undefined) => {
  const body = { success: false, error: message };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
};

module.exports = { success, error };
