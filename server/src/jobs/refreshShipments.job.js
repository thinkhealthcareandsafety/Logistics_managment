const cron = require('node-cron');
const Shipment = require('../models/Shipment');
const { refreshBatch, backfillDeliveredAt } = require('../services/tracking.service');
const { retryPendingDeliveryNotices } = require('../services/customerNotification.service');
const env = require('../config/env');
const logger = require('../config/logger');

// 'exception' is deliberately NOT terminal here - a delayed/held shipment can still
// move to delivered, so it keeps getting polled until it does (or someone archives it).
const TERMINAL_STATUSES = ['delivered'];

/**
 * Couriers are asked about every active shipment at most once an hour, in one batched
 * call per 40 shipments - about 24 TrackingMore calls a day, inside its daily limit
 * (services/apiBudget.js) with room left for new shipments and manual refreshes.
 */
const POLL_EVERY_MS = 55 * 60 * 1000;
let lastPollAt = 0;

async function runRefreshCycle() {
  // Delivered shipments aren't polled below, so their pending thank-you messages get
  // their own sweep - otherwise one failed send would mean the customer is never asked.
  await retryPendingDeliveryNotices().catch((err) =>
    logger.error(`Delivery thank-you retry failed: ${err.message}`)
  );
  // Same reason: a delivered shipment missing its delivered date won't be refreshed again.
  await backfillDeliveredAt().catch((err) => logger.error(`Delivered-date backfill failed: ${err.message}`));

  if (!env.trackingMore.apiKey || Date.now() - lastPollAt < POLL_EVERY_MS) return;

  const dueShipments = await Shipment.find({
    isArchived: false,
    status: { $nin: TERMINAL_STATUSES },
  });
  if (dueShipments.length === 0) return;
  lastPollAt = Date.now();

  logger.info(`Refresh cycle: checking ${dueShipments.length} shipment(s)`);
  try {
    const { refreshed, failed } = await refreshBatch(dueShipments, { background: true });
    if (failed) logger.warn(`Refresh cycle: ${failed}/${dueShipments.length} shipment(s) failed (${refreshed} refreshed)`);
  } catch (err) {
    logger.warn(`Refresh cycle skipped: ${err.message}`);
  }
}

function startRefreshJob() {
  cron.schedule(env.refresh.cron, () => {
    runRefreshCycle().catch((err) => logger.error(`Refresh cycle crashed: ${err.message}`));
  });
  logger.info(`Shipment refresh job scheduled: "${env.refresh.cron}"`);
}

module.exports = { startRefreshJob, runRefreshCycle };
