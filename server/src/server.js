const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const connectDB = require('./config/db');
const { initSocket } = require('./sockets');
const { startRefreshJob } = require('./jobs/refreshShipments.job');
const { startStockBroadcastJob } = require('./jobs/stockBroadcast.job');
const { startZohoSyncJob } = require('./jobs/zohoSync.job');
const { backfillDeliveredAt } = require('./services/tracking.service');

async function main() {
  await connectDB();
  if (process.env.SEED_IF_EMPTY === 'true') {
    await require('./scripts/seed').seedIfEmpty().catch((err) => logger.error(`Demo seed failed: ${err.message}`));
  }
  await backfillDeliveredAt().catch((err) => logger.error(`Delivered-date backfill failed: ${err.message}`));

  const httpServer = http.createServer(app);
  initSocket(httpServer);
  startRefreshJob();
  startStockBroadcastJob();
  startZohoSyncJob();

  httpServer.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port} [${env.nodeEnv}]`);
  });
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err.stack || err.message}`);
  process.exit(1);
});
