// ─── Express App Configuration ──────────────────────────────────────
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const env = require('./config/env');
const { errorHandler } = require('./middlewares/errorHandler');
const sse = require('./sse/sseManager');

// Route imports
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const menuItemRoutes = require('./routes/menuItemRoutes');
const menuItemExtraRoutes = require('./routes/menuItemExtraRoutes');
const tableRoutes = require('./routes/tableRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const deliveryOrderRoutes = require('./routes/deliveryOrderRoutes');
const appSettingRoutes = require('./routes/appSettingRoutes');
const pushRoutes = require('./routes/pushRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

const app = express();

// ─── Global Middleware ──────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = env.CORS_ORIGIN.split(',').map(s => s.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Static Files (uploaded images) ─────────────────────────────────
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// ─── Health Check ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ─── SSE Endpoint ───────────────────────────────────────────────────
app.get('/api/events', sse.connect);

// ─── API Routes ─────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/menu-items', menuItemRoutes);
app.use('/api/extras', menuItemExtraRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/delivery-orders', deliveryOrderRoutes);
app.use('/api/settings', appSettingRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/upload', uploadRoutes);

// ─── 404 handler ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ─── Error Handler (must be last) ───────────────────────────────────
app.use(errorHandler);

module.exports = app;
