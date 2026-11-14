const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const { syncNow, isZohoActive } = require('../services/zohoSync.service');

/**
 * The safety net under Zoho's webhook: even with no workflow rules set up (or a
 * webhook that never arrives) stock catches up with Zoho Books on this schedule.
 */
let lastShipmentImport = 0;
const importShipments = () =>
  require('../services/zohoShipments.service')
    .importZohoShipments()
    .catch((err) => logger.warn(`Zoho shipment import failed: ${err.message}`));

function startZohoSyncJob() {
  if (!cron.validate(env.zoho.syncCron)) {
    logger.warn(`ZOHO_SYNC_CRON "${env.zoho.syncCron}" is not a valid cron expression - Zoho sync job not started`);
    return;
  }
  cron.schedule(env.zoho.syncCron, async () => {
    if (!(await isZohoActive().catch(() => false))) return;
    syncNow({ reason: 'scheduled' }).catch(() => {});
    // Freight and e-way bills from invoices for recent shipments.
    require('../services/invoiceMatch.service').matchInvoices().catch((err) => logger.warn(`Invoice match failed: ${err.message}`));
    // New Zoho Books shipments, every half hour (each run is one list call).
    if (Date.now() - lastShipmentImport >= 25 * 60 * 1000) {
      lastShipmentImport = Date.now();
      importShipments();
    }
  });
  logger.info(`Zoho Books stock sync scheduled (${env.zoho.syncCron})`);

  // On a host that sleeps when idle, scheduled runs are missed - sync once on wake-up.
  setTimeout(async () => {
    if (await isZohoActive().catch(() => false)) syncNow({ reason: 'startup' }).catch(() => {});
  }, 5000);
  // Shipments made in Zoho while the host slept come in shortly after it wakes.
  setTimeout(async () => {
    if (!(await isZohoActive().catch(() => false))) return;
    lastShipmentImport = Date.now();
    importShipments();
  }, 90 * 1000);

  // Invoice history for reorder predictions and freight: a little each night (02:30 IST),
  // and a few minutes after start-up - the daily allowance caps it either way.
  const readHistory = async () => {
    if (await isZohoActive().catch(() => false)) require('../services/invoiceCache.service').backfillInvoices();
  };
  cron.schedule('30 2 * * *', readHistory, { timezone: 'Asia/Kolkata' });
  setTimeout(readHistory, 10 * 60 * 1000);
}

module.exports = { startZohoSyncJob };
