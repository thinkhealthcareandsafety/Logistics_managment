const cron = require('node-cron');
const logger = require('../config/logger');
const env = require('../config/env');
const StockItem = require('../models/StockItem');
const { syncProductMedia } = require('../services/productMedia.service');
const { findWebImages } = require('../services/webImages.service');

const webPhotos = () => (env.gemini.apiKey ? findWebImages().catch(() => {}) : null);

/**
 * Product photos/videos/brochures from buyaedindia.com: weekly, and once at start-up if
 * missing. Lines still without a photo get a checked web photo - daily (new lines), and
 * a couple of minutes after start-up.
 */
function startProductMediaJob() {
  cron.schedule('0 3 * * 1', () => syncProductMedia().catch(() => {}), { timezone: 'Asia/Kolkata' });
  cron.schedule('30 4 * * *', webPhotos, { timezone: 'Asia/Kolkata' });
  setTimeout(async () => {
    const anyMedia = await StockItem.exists({ 'media.matchedAt': { $ne: null } }).catch(() => true);
    if (!anyMedia) syncProductMedia().catch(() => {});
  }, 30_000);
  setTimeout(webPhotos, 120_000);
  logger.info('Product media sync scheduled (Mondays 03:00 IST; web photos daily 04:30 IST)');
}

module.exports = { startProductMediaJob };
