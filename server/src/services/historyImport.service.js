const pLimit = require('p-limit');
const Shipment = require('../models/Shipment');
const { STATUSES } = require('../utils/statusMap');
const { commercialFields } = require('../utils/shipmentFields');
const { refreshShipment } = require('./tracking.service');
const logger = require('../config/logger');

/**
 * Back-fills shipments from the logistics master sheet. Unlike a normal booking this
 * is history: no stock is deducted, nobody is messaged about a parcel that already
 * arrived, and the shipment keeps its real ship date. Only rows marked `live` (still
 * on the road) are handed to the courier tracker; everything else keeps the status
 * the sheet records. Re-running is safe - rows already in the app only get their
 * empty fields filled in.
 */

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
const date = (v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null);

function cleanBooking(b = {}) {
  return {
    invoiceNumber: str(b.invoiceNumber, 120),
    shipmentValue: num(b.shipmentValue),
    boxes: num(b.boxes),
    dimensions: str(b.dimensions, 200),
    shipmentType: str(b.shipmentType, 40),
    paymentType: str(b.paymentType, 60),
    pickupPincode: str(b.pickupPincode, 10),
    trackingLink: str(b.trackingLink, 300),
    notes: str(b.notes, 500),
    source: str(b.source, 60),
  };
}

/** Fills only what's empty on a shipment already in the app - never overwrites. */
function fillGaps(shipment, row, booking) {
  let changed = false;
  const fill = (path, value) => {
    const blank = (v) => v === null || v === undefined || v === '';
    if (!blank(value) && blank(shipment.get(path))) {
      shipment.set(path, value);
      changed = true;
    }
  };
  for (const [k, v] of Object.entries(booking)) fill(`booking.${k}`, v);
  fill('customerInfo.name', str(row.customerInfo?.name, 200));
  fill('customerInfo.phone', str(row.customerInfo?.phone, 40));
  fill('productDetails.name', str(row.productDetails?.name, 500));
  fill('weightKg', row.weightKg);
  fill('freightAmount', row.freightAmount);
  for (const k of ['line', 'city', 'state', 'pincode']) fill(`deliveryAddress.${k}`, row.deliveryAddress?.[k]);
  fill('shippingDate', row.shippingDate);
  return changed;
}

async function importHistory(rows, userId) {
  const result = { created: 0, updated: 0, unchanged: 0, live: 0, failed: [] };
  const liveIds = [];
  const now = new Date();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    try {
      const trackingNumber = str(row.trackingNumber, 100);
      const carrierCode = str(row.carrierCode, 60).toLowerCase();
      if (!trackingNumber || !carrierCode) throw new Error('trackingNumber and carrierCode are required');
      const shippingDate = date(row.shippingDate);
      if (!shippingDate) throw new Error('shippingDate is missing or invalid');
      const status = STATUSES.includes(row.status) ? row.status : 'in_transit';
      const deliveredAt = status === 'delivered' ? date(row.deliveredAt) : null;
      const booking = cleanBooking(row.booking);
      const commercial = commercialFields({
        weightKg: row.weightKg ?? null,
        freightAmount: row.freightAmount ?? null,
        deliveryAddress: row.deliveryAddress || {},
      });
      const shaped = { ...row, ...commercial, shippingDate };

      const existing = await Shipment.findOne({ createdBy: userId, trackingNumber, carrierCode });
      if (existing) {
        if (fillGaps(existing, shaped, booking)) {
          await existing.save();
          result.updated += 1;
        } else {
          result.unchanged += 1;
        }
        continue;
      }

      const live = Boolean(row.live);
      const checkpoints = [];
      if (!live) {
        const note = str(row.statusNote, 200);
        checkpoints.push({
          status: status === 'delivered' ? 'in_transit' : status,
          statusRaw: 'master sheet',
          description: `Shipped${row.carrierName ? ` by ${str(row.carrierName, 80)}` : ''} (from the logistics master sheet)`,
          checkpointTime: shippingDate,
          source: 'manual',
        });
        if (status !== 'delivered' && note) checkpoints[0].description += ` - last noted: ${note}`;
        if (deliveredAt) {
          checkpoints.push({
            status: 'delivered',
            statusRaw: 'master sheet',
            description: 'Delivered (from the logistics master sheet)',
            checkpointTime: deliveredAt < shippingDate ? shippingDate : deliveredAt,
            source: 'manual',
          });
        }
      }

      const shipment = new Shipment({
        trackingNumber,
        carrierCode,
        carrierName: str(row.carrierName, 80),
        productDetails: {
          name: str(row.productDetails?.name, 500),
          quantity: num(row.productDetails?.quantity) || 1,
          category: str(row.productDetails?.category, 80),
        },
        customerInfo: {
          name: str(row.customerInfo?.name, 200),
          email: str(row.customerInfo?.email, 200),
          phone: str(row.customerInfo?.phone, 40),
        },
        shippingDate,
        ...commercial,
        booking,
        status: live ? 'pending' : status,
        deliveredAt: live ? null : deliveredAt ? checkpoints[checkpoints.length - 1].checkpointTime : null,
        checkpoints,
        // Set for live ones too, so the refresh job leaves them to trackLive's quiet first fetch.
        lastCheckedAt: now,
        // History: the customer was dealt with at the time. A live one only skips the
        // "booked" message - its out-for-delivery / delivered messages go as normal.
        bookedNoticeSentAt: now,
        inTransitNoticeSentAt: live ? undefined : now,
        outForDeliveryNoticeSentAt: live ? undefined : now,
        deliveryNoticeSentAt: live ? undefined : now,
        createdBy: userId,
        createdAt: shippingDate,
        updatedAt: now,
      });
      await shipment.save({ timestamps: false });
      result.created += 1;
      if (live) liveIds.push(shipment._id);
    } catch (err) {
      result.failed.push({ index: i, trackingNumber: row.trackingNumber || '(missing)', error: err.message });
    }
  }

  result.live = liveIds.length;
  if (liveIds.length) {
    // In the background: one courier lookup per live shipment, a few at a time.
    trackLive(liveIds).catch((err) => logger.error(`History import live tracking failed: ${err.message}`));
  }
  return result;
}

async function trackLive(ids) {
  const limit = pLimit(2);
  await Promise.allSettled(
    ids.map((id) =>
      limit(async () => {
        const shipment = await Shipment.findById(id);
        if (!shipment) return;
        try {
          await refreshShipment(shipment, { silent: true });
        } catch (err) {
          logger.warn(`History import: tracking ${shipment.trackingNumber} failed: ${err.message}`);
          return;
        }
        // Already out for delivery / delivered when it came in - not news to the customer now.
        const stamp = {};
        if (shipment.status !== 'pending') stamp.inTransitNoticeSentAt = new Date();
        if (['out_for_delivery', 'delivered'].includes(shipment.status)) stamp.outForDeliveryNoticeSentAt = new Date();
        if (shipment.status === 'delivered') stamp.deliveryNoticeSentAt = new Date();
        if (Object.keys(stamp).length) await Shipment.updateOne({ _id: id }, { $set: stamp });
      })
    )
  );
  logger.info(`History import: tracked ${ids.length} live shipment(s)`);
}

// Delivered with no delivery date (the sheet left it blank): ask the courier.
const HAND_DELIVERED = ['porter', 'self'];
const NOT_TRACKABLE = ['bus', 'transport', 'other', 'skyking-india', ...HAND_DELIVERED];
const backfill = { running: false, startedAt: null, finishedAt: null, total: 0, done: 0, found: 0, sameDay: 0, notFound: [] };

function backfillStatus() {
  return { ...backfill, notFound: backfill.notFound.slice(0, 50) };
}

async function backfillDeliveryDates(userId) {
  if (backfill.running) return backfillStatus();
  const { getAdapterForCarrier } = require('../adapters');
  const { syncDeliveredAt } = require('../utils/deliveredAt');
  const shipments = await Shipment.find({ createdBy: userId, status: 'delivered', deliveredAt: null });
  Object.assign(backfill, { running: true, startedAt: new Date(), finishedAt: null, total: shipments.length, done: 0, found: 0, sameDay: 0, notFound: [] });

  const setDelivered = (shipment, at, how) => {
    shipment.checkpoints.push({ status: 'delivered', statusRaw: how, description: `Delivered (${how})`, checkpointTime: at, source: 'manual' });
    shipment.checkpoints.sort((a, b) => new Date(a.checkpointTime) - new Date(b.checkpointTime));
    shipment.status = 'delivered';
    syncDeliveredAt(shipment);
  };

  const run = async () => {
    const limit = pLimit(3);
    await Promise.allSettled(
      shipments.map((shipment) =>
        limit(async () => {
          try {
            if (HAND_DELIVERED.includes(shipment.carrierCode) && shipment.shippingDate) {
              setDelivered(shipment, shipment.shippingDate, 'hand delivery, same day');
              backfill.sameDay += 1;
            } else if (!NOT_TRACKABLE.includes(shipment.carrierCode) && /\d{6,}/.test(shipment.trackingNumber)) {
              const { checkpoints, route } = await getAdapterForCarrier(shipment.carrierCode).refreshTracking(shipment);
              const scan = [...checkpoints].reverse().find((c) => c.status === 'delivered');
              const at = scan?.checkpointTime || route?.deliveredAt;
              if (route && Object.entries(route).some(([k, v]) => k !== 'weightKg' && v)) {
                const { weightKg, ...rest } = route;
                shipment.carrierRoute = { ...rest, fetchedAt: new Date() };
              }
              if (at && checkpoints.length && checkpoints[checkpoints.length - 1].status === 'delivered') {
                // The courier's own history, start to finish, replaces the sheet's two lines.
                shipment.checkpoints = checkpoints;
                shipment.currentLocation = checkpoints[checkpoints.length - 1].location || shipment.currentLocation;
                syncDeliveredAt(shipment);
                backfill.found += 1;
              } else if (at) {
                setDelivered(shipment, at, 'courier delivery date');
                backfill.found += 1;
              } else {
                backfill.notFound.push(shipment.trackingNumber);
              }
              shipment.lastCheckedAt = new Date();
            } else {
              backfill.notFound.push(shipment.trackingNumber);
            }
            await shipment.save();
          } catch (err) {
            backfill.notFound.push(shipment.trackingNumber);
            logger.warn(`Delivery-date backfill ${shipment.trackingNumber}: ${err.message}`);
          } finally {
            backfill.done += 1;
          }
        })
      )
    );
  };
  run()
    .catch((err) => logger.error(`Delivery-date backfill failed: ${err.message}`))
    .finally(() => {
      backfill.running = false;
      backfill.finishedAt = new Date();
      logger.info(`Delivery-date backfill: ${backfill.found} from courier, ${backfill.sameDay} same-day, ${backfill.notFound.length} not found`);
    });
  return backfillStatus();
}

module.exports = { importHistory, cleanBooking, backfillDeliveryDates, backfillStatus };
