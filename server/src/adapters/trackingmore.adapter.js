const trackingMoreClient = require('../services/trackingmore.client');
const { findCourier } = require('../services/courierCatalog.service');
const { normalizeTrackingMoreCheckpoints } = require('../utils/normalizeCheckpoints');
const logger = require('../config/logger');

/** TrackingMore sends places in capitals ("DELHI") - show them the way people write them. */
function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();
}

function toDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Route details the courier itself reports - TrackingMore's generic fields, so this
 * works for any courier that fills them. Checked against a live Shree Maruti AWB:
 * origin/destination city + state and pickup/delivery milestones are filled in;
 * street address, pincode (`recipient_postcode`), weight and `signed_by` come back
 * empty for that courier. Weight is still read for couriers that do send it.
 */
function extractRoute(tracking) {
  const milestones = tracking.origin_info?.milestone_date || {};
  const weight = Number(tracking.weight_kg || tracking.weight);
  return {
    originCity: titleCase(tracking.origin_city),
    originState: titleCase(tracking.origin_state),
    destinationCity: titleCase(tracking.destination_city),
    destinationState: titleCase(tracking.destination_state),
    pickupAt: toDate(milestones.pickup_date),
    deliveredAt: toDate(milestones.delivery_date),
    weightKg: Number.isFinite(weight) && weight > 0 ? weight : null,
  };
}

/**
 * Some couriers won't track without extra details. The two we can answer from data
 * we already hold: destination postcode (from the delivery address) and ship date.
 * Couriers needing an account number or key can't be tracked through this path.
 */
async function requiredExtras(shipment) {
  const courier = await findCourier(shipment.carrierCode);
  const need = new Set(courier?.requiredFields || []);
  const extra = {};
  if (need.has('tracking_postal_code')) extra.tracking_postal_code = shipment.deliveryAddress?.pincode || '';
  if (need.has('tracking_ship_date') && shipment.shippingDate) {
    extra.tracking_ship_date = new Date(shipment.shippingDate).toISOString().slice(0, 10).replace(/-/g, '');
  }
  return extra;
}

function isNotRegistered(err) {
  const text = `${err.details?.trackingMoreMessage || ''} ${err.message || ''}`.toLowerCase();
  return text.includes('no exists') || text.includes('not exist') || text.includes('create a tracking');
}

/**
 * TrackingMore covers every courier this app tracks - its whole catalog (~1,700,
 * including 53 Indian couriers such as Shree Maruti, Delhivery, Blue Dart, DTDC and
 * India Post). A courier just needs to exist in that catalog (GET /api/carriers);
 * no code change here.
 *
 * @type {import('./trackingAdapter.interface').TrackingAdapter}
 */
const trackingMoreAdapter = {
  async createTracking(shipment) {
    try {
      const result = await trackingMoreClient.createTracking({
        trackingNumber: shipment.trackingNumber,
        carrierCode: shipment.carrierCode,
        extra: await requiredExtras(shipment),
      });
      return { externalId: result?.data?.id || '' };
    } catch (err) {
      // TrackingMore returns a 4009-style "already exists" error if it's already tracked
      // (e.g. re-adding a shipment) - that's fine, refreshTracking will still work.
      logger.warn(`createTracking: ${err.message} (continuing, tracking may already exist)`);
      return { externalId: '' };
    }
  },

  async refreshTracking(shipment) {
    let result;
    try {
      result = await trackingMoreClient.getTracking({
        trackingNumber: shipment.trackingNumber,
        carrierCode: shipment.carrierCode,
      });
    } catch (err) {
      // TrackingMore only returns data for numbers registered with it. A shipment can
      // exist here without being registered there - the create call failed when it was
      // added, the API key was missing at the time, or the row was imported/seeded
      // directly. Register it now and retry once, so those self-heal on next sync
      // instead of failing forever.
      if (!isNotRegistered(err)) throw err;

      logger.info(`${shipment.trackingNumber} not registered with TrackingMore - registering now`);
      await trackingMoreClient.createTracking({
        trackingNumber: shipment.trackingNumber,
        carrierCode: shipment.carrierCode,
        extra: await requiredExtras(shipment),
      });
      result = await trackingMoreClient.getTracking({
        trackingNumber: shipment.trackingNumber,
        carrierCode: shipment.carrierCode,
      });
    }
    // /trackings/get returns `data` as an array for multi-number lookups, but a single
    // object for some single-number/id lookups - handle both shapes defensively.
    const tracking = Array.isArray(result?.data) ? result.data[0] : result?.data;
    if (!tracking) {
      return { checkpoints: [], route: null };
    }
    return { checkpoints: normalizeTrackingMoreCheckpoints(tracking), route: extractRoute(tracking) };
  },
};

module.exports = trackingMoreAdapter;
