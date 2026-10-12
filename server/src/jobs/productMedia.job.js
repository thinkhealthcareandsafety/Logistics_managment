const cron = require('node-cron');
const logger = require('../config/logger');
const StockItem = require('../models/StockItem');
const { syncProductMedia } = require('../services/productMedia.service');

/** Product photos/videos/brochures from buyaedindia.com: weekly, and once at start-up if missing. */
function startProductMediaJob() {
  cron.schedule('0 3 * * 1', () => syncProductMedia().catch(() => {}), { timezone: 'Asia/Kolkata' });
  setTimeout(async () => {
    const anyMedia = await StockItem.exists({ 'media.matchedAt': { $ne: null } }).catch(() => true);
    if (!anyMedia) syncProductMedia().catch(() => {});
  }, 30_000);
  logger.info('Product media sync scheduled (Mondays 03:00 IST)');
}

module.exports = { startProductMediaJob };
