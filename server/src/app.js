const fs = require('fs');
const path = require('path');
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
// Behind the host's load balancer (Render etc.): trust its X-Forwarded-* headers so
// rate limits see real client IPs and secure cookies work over HTTPS.
app.set('trust proxy', 1);

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

// Hosted as one site: when the client has been built, Express serves it too, so the
// app, its API and its links all share one address (no CORS or cross-site cookies).
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  // Built files have content hashes in their names, so they can be cached for a year;
  // index.html must never be cached, or browsers keep showing the previous release.
  const noCache = (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  app.use(
    express.static(clientDist, {
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, file) => {
        if (file.endsWith('.html')) noCache(res);
      },
    })
  );
  // Any non-API path is a page of the single-page app (/dashboard, /track/:awb...).
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
    noCache(res);
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
