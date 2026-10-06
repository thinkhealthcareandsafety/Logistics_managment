const cron = require('node-cron');
const { runScheduledBroadcast } = require('../services/stock.service');
const logger = require('../config/logger');

/**
 * Ticks every minute and lets the service decide whether it's time: the send time is
 * edited from the Stock page, so it can't be baked into a fixed cron expression.
 */
function startStockBroadcastJob() {
  cron.schedule('* * * * *', () => {
    runScheduledBroadcast().catch((err) => logger.error(`Scheduled stock update failed: ${err.message}`));
  });
  logger.info('Stock broadcast job scheduled (checks every minute)');
}

module.exports = { startStockBroadcastJob };
