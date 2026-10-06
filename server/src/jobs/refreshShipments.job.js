const cron = require('node-cron');
const pLimit = require('p-limit');
const Shipment = require('../models/Shipment');
const { refreshShipment, backfillDeliveredAt } = require('../services/tracking.service');
const { retryPendingDeliveryNotices } = require('../services/customerNotification.service');
const env = require('../config/env');
const logger = require('../config/logger');

// 'exception' is deliberately NOT terminal here - a delayed/held shipment can still
// move to delivered, so it keeps getting polled until it does (or someone archives it).
const TERMINAL_STATUSES = ['delivered'];

async function runRefreshCycle() {
  // Delivered shipments aren't polled below, so their pending thank-you messages get
  // their own sweep - otherwise one failed send would mean the customer is never asked.
  await retryPendingDeliveryNotices().catch((err) =>
    logger.error(`Delivery thank-you retry failed: ${err.message}`)
  );
  // Same reason: a delivered shipment missing its delivered date won't be refreshed again.
  await backfillDeliveredAt().catch((err) => logger.error(`Delivered-date backfill failed: ${err.message}`));

  const staleBefore = new Date(Date.now() - env.refresh.minIntervalMinutes * 60 * 1000);

  const dueShipments = await Shipment.find({
    isArchived: false,
    status: { $nin: TERMINAL_STATUSES },
    $or: [{ lastCheckedAt: { $lt: staleBefore } }, { lastCheckedAt: null }],
  });

  if (dueShipments.length === 0) return;

  logger.info(`Refresh cycle: checking ${dueShipments.length} shipment(s)`);
  const limit = pLimit(env.refresh.concurrency);

  const results = await Promise.allSettled(
    dueShipments.map((shipment) => limit(() => refreshShipment(shipment)))
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    logger.warn(`Refresh cycle: ${failures.length}/${dueShipments.length} shipment(s) failed`);
    failures.forEach((f) => logger.warn(f.reason?.message || f.reason));
  }
}

function startRefreshJob() {
  cron.schedule(env.refresh.cron, () => {
    runRefreshCycle().catch((err) => logger.error(`Refresh cycle crashed: ${err.message}`));
  });
  logger.info(`Shipment refresh job scheduled: "${env.refresh.cron}"`);
}

module.exports = { startRefreshJob, runRefreshCycle };
