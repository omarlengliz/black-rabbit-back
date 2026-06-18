// ─── Logger ─────────────────────────────────────────────────────────
const env = require('../config/env');

const timestamp = () => new Date().toISOString();

const logger = {
  info: (...args) => console.log(`[${timestamp()}] ℹ️ `, ...args),
  warn: (...args) => console.warn(`[${timestamp()}] ⚠️ `, ...args),
  error: (...args) => console.error(`[${timestamp()}] ❌ `, ...args),
  debug: (...args) => {
    if (env.NODE_ENV === 'development') {
      console.debug(`[${timestamp()}] 🐛 `, ...args);
    }
  },
};

module.exports = logger;
