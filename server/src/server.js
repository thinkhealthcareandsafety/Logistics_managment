const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const connectDB = require('./config/db');
const { initSocket } = require('./sockets');
const { startRefreshJob } = require('./jobs/refreshShipments.job');
const { startStockBroadcastJob } = require('./jobs/stockBroadcast.job');
const { startZohoSyncJob } = require('./jobs/zohoSync.job');
const { startProductMediaJob } = require('./jobs/productMedia.job');
const { backfillDeliveredAt } = require('./services/tracking.service');

async function main() {
  await connectDB();
  if (process.env.SEED_IF_EMPTY === 'true') {
    await require('./scripts/seed').seedIfEmpty().catch((err) => logger.error(`Demo seed failed: ${err.message}`));
  }
  await require('./services/stock.service').applyOldNewDefault().catch((err) => logger.error(`Old/new switch-over failed: ${err.message}`));
  await backfillDeliveredAt().catch((err) => logger.error(`Delivered-date backfill failed: ${err.message}`));
  await require('./scripts/renameAccount').renameDemoAccount().catch((err) => logger.error(`Account rename failed: ${err.message}`));

  const httpServer = http.createServer(app);
  initSocket(httpServer);
  startRefreshJob();
  startStockBroadcastJob();
  startZohoSyncJob();
  startProductMediaJob();
  require('./services/courierCatalog.service').getCatalog().catch(() => {});
  require('./controllers/shipment.controller')
    .warmShipmentLists()
    .catch((err) => logger.error(`Shipment list warm-up failed: ${err.message}`));

  httpServer.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port} [${env.nodeEnv}]`);
  });
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err.stack || err.message}`);
  process.exit(1);
});
