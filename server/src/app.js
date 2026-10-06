const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const shipmentRoutes = require('./routes/shipment.routes');
const carrierRoutes = require('./routes/carrier.routes');
const notificationRoutes = require('./routes/notification.routes');
const ingestRoutes = require('./routes/ingest.routes');
const publicTrackingRoutes = require('./routes/publicTracking.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const stockRoutes = require('./routes/stock.routes');
const geoRoutes = require('./routes/geo.routes');
const zohoRoutes = require('./routes/zoho.routes');

const app = express();

app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/carriers', carrierRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/public', publicTrackingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/integrations/zoho', zohoRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
