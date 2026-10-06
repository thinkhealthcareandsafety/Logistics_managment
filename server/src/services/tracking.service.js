const Shipment = require('../models/Shipment');
const { getAdapterForCarrier } = require('../adapters');
const { emitShipmentUpdate } = require('../sockets');
const { notifyStatusChange } = require('./notification.service');
const { notifyCustomerDelivered } = require('./customerNotification.service');
const logger = require('../config/logger');
const { deductForShipment } = require('./stock.service');
const { syncDeliveredAt } = require('../utils/deliveredAt');

/** Creates a shipment record and registers it with the appropriate tracking adapter. */
async function registerShipment(payload, userId) {
  const shipment = await Shipment.create({
    ...payload,
    createdBy: userId,
  });

  // Booked goods leave the shelf: if the product code is linked to a stock line, take
  // the quantity off now. Runs for every entry path (manual, CSV, ingest API).
  await deductForShipment(shipment, userId);

  const adapter = getAdapterForCarrier(shipment.carrierCode);
  const { externalId } = await adapter.createTracking(shipment);
  if (externalId) {
    shipment.trackingMoreId = externalId;
    await shipment.save();
  }

  // Best-effort initial fetch so the shipment doesn't sit empty until the next cron tick.
  try {
    await refreshShipment(shipment);
  } catch (err) {
    logger.warn(`Initial refresh failed for ${shipment.trackingNumber}: ${err.message}`);
  }

  return shipment;
}

/**
 * Stores the courier's own view of the route (destination city/state etc.) and fills
 * gaps the booking left - never overwrites what someone entered by hand.
 */
function applyCarrierRoute(shipment, route) {
  if (!route) return;
  const { weightKg, ...rest } = route;
  const hasAny = Object.values(rest).some(Boolean);
  if (hasAny) shipment.carrierRoute = { ...rest, fetchedAt: new Date() };
  if (!shipment.shippingDate && route.pickupAt) shipment.shippingDate = route.pickupAt;
  if (shipment.weightKg == null && weightKg) shipment.weightKg = weightKg;
}

/**
 * Fetches the latest checkpoints for one shipment, persists any that are new,
 * and fans out real-time + notification side effects for each newly-seen checkpoint.
 */
async function refreshShipment(shipment) {
  const adapter = getAdapterForCarrier(shipment.carrierCode);
  const { checkpoints, route } = await adapter.refreshTracking(shipment);

  shipment.lastCheckedAt = new Date();
  applyCarrierRoute(shipment, route);

  if (checkpoints.length === 0) {
    syncDeliveredAt(shipment);
    await shipment.save();
    return { shipment, newCheckpoints: [] };
  }

  const lastKnownTime = shipment.checkpoints.length
    ? shipment.checkpoints[shipment.checkpoints.length - 1].checkpointTime
    : null;

  const newCheckpoints = lastKnownTime
    ? checkpoints.filter((cp) => cp.checkpointTime > lastKnownTime)
    : checkpoints;

  if (newCheckpoints.length > 0) {
    shipment.checkpoints = checkpoints;
    const latest = checkpoints[checkpoints.length - 1];
    shipment.status = latest.status;
    shipment.currentLocation = latest.location || shipment.currentLocation;
  }
  // Every status update carries the delivered date with it (and also catches a
  // delivered shipment whose date was never filled in).
  const deliveredChanged = syncDeliveredAt(shipment);

  // The customer's thank-you + feedback request goes out the first time a shipment
  // lands on `delivered`. Done before the save so the sent-stamp persists with it.
  if (shipment.status === 'delivered') {
    await notifyCustomerDelivered(shipment).catch((err) =>
      logger.error(`notifyCustomerDelivered failed for ${shipment.trackingNumber}: ${err.message}`)
    );
  }

  await shipment.save();

  if (newCheckpoints.length > 0 || deliveredChanged) {
    emitShipmentUpdate(shipment.createdBy.toString(), shipment);
  }
  if (newCheckpoints.length > 0) {
    for (const checkpoint of newCheckpoints) {
      await notifyStatusChange(shipment, checkpoint).catch((err) =>
        logger.error(`notifyStatusChange failed: ${err.message}`)
      );
    }
  }

  return { shipment, newCheckpoints };
}

/**
 * One-off catch-up for shipments delivered before deliveredAt existed (or whose
 * delivered scan arrived without it being set). Runs at startup; cheap and idempotent.
 */
async function backfillDeliveredAt() {
  const stale = await Shipment.find({ status: 'delivered', deliveredAt: null });
  let fixed = 0;
  for (const shipment of stale) {
    if (syncDeliveredAt(shipment)) {
      await Shipment.updateOne({ _id: shipment._id }, { $set: { deliveredAt: shipment.deliveredAt } });
      fixed += 1;
    }
  }
  if (fixed) logger.info(`Filled in the delivered date on ${fixed} shipment(s)`);
  return fixed;
}

module.exports = { registerShipment, refreshShipment, backfillDeliveredAt };
