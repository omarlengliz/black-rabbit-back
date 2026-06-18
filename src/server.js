// ─── Server Entry Point ─────────────────────────────────────────────
const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const logger = require('./utils/logger');

const start = async () => {
  await connectDB();

  app.listen(env.PORT, () => {
    logger.info(`🐰 Black Rabbit API running on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`   Health: http://localhost:${env.PORT}/health`);
    logger.info(`   SSE:    http://localhost:${env.PORT}/api/events`);
  });
};

start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
