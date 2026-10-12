const { parse } = require('csv-parse/sync');
const pLimit = require('p-limit');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const { registerShipment, refreshShipment } = require('../services/tracking.service');
const { notifyCustomerDelivered } = require('../services/customerNotification.service');
const { resolveCarrier } = require('../services/courierCatalog.service');
const { extractShipmentFromDocument } = require('../services/labelExtraction.service');
const StockItem = require('../models/StockItem');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { commercialFields } = require('../utils/shipmentFields');

const createShipment = asyncHandler(async (req, res) => {
  const { trackingNumber, productDetails, customerInfo, shippingDate, estimatedDelivery } = req.body;

  if (!trackingNumber) {
    throw new ApiError(400, 'trackingNumber is required');
  }

  // Any courier in TrackingMore's catalog; none given -> the default courier.
  const carrier = await resolveCarrier(req.body.carrierCode);
  const duplicate = await Shipment.exists({
    createdBy: req.userId,
    trackingNumber: String(trackingNumber).trim(),
    carrierCode: carrier.carrierCode,
  });
  if (duplicate) {
    throw new ApiError(409, `${trackingNumber} is already being tracked with ${carrier.carrierName}`);
  }

  const shipment = await registerShipment(
    {
      trackingNumber: String(trackingNumber).trim(),
      ...carrier,
      productDetails,
      customerInfo,
      shippingDate,
      estimatedDelivery,
      ...commercialFields(req.body),
    },
    req.userId
  );

  res.status(201).json({ shipment });
});

const listShipments = asyncHandler(async (req, res) => {
  const { status, search, archived, carrier } = req.query;

  const query = { createdBy: req.userId, isArchived: archived === 'true' };
  if (status) query.status = status;
  if (carrier) query.carrierCode = String(carrier).toLowerCase();
  if (search) {
    query.$or = [
      { trackingNumber: { $regex: search, $options: 'i' } },
      { 'customerInfo.name': { $regex: search, $options: 'i' } },
      { 'productDetails.name': { $regex: search, $options: 'i' } },
    ];
  }

  // The list only needs each shipment's first, delivered and latest scans (progress,
  // delivery date, attention); the full history loads on the shipment's own page.
  // lean() skips building documents - several times faster for hundreds of rows.
  const listCache = require('../utils/shipmentListCache');
  const cacheKey = JSON.stringify(query);
  const cached = listCache.get(cacheKey);
  if (cached) return res.type('json').send(cached);
  const atVersion = listCache.currentVersion();

  const shipments = await Shipment.find(query, { trackingExtras: 0, trackingMoreId: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
  for (const s of shipments) {
    const cps = s.checkpoints || [];
    if (cps.length > 3) {
      const delivered = [...cps].reverse().find((c) => c.status === 'delivered');
      s.checkpointCount = cps.length;
      s.checkpoints = [...new Set([cps[0], delivered, cps[cps.length - 1]].filter(Boolean))];
    }
    if (s.exceptionFollowUp?.notes?.length > 3) s.exceptionFollowUp.notes = s.exceptionFollowUp.notes.slice(-3);
  }
  const body = JSON.stringify({ shipments });
  listCache.set(cacheKey, body, atVersion);
  res.type('json').send(body);
});

const getShipment = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne({
    _id: req.params.id,
    createdBy: req.userId,
  });
  if (!shipment) throw new ApiError(404, 'Shipment not found');
  res.json({ shipment });
});

const updateShipment = asyncHandler(async (req, res) => {
  const allowedFields = ['productDetails', 'customerInfo', 'shippingDate', 'estimatedDelivery', 'isArchived', 'carrierName'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (req.body.isBeingFollowedUp !== undefined) {
    updates['exceptionFollowUp.isBeingFollowedUp'] = req.body.isBeingFollowedUp;
  }
  Object.assign(updates, commercialFields(req.body));
  if (req.body.booking && typeof req.body.booking === 'object') {
    const { cleanBooking } = require('../services/historyImport.service');
    const clean = cleanBooking(req.body.booking);
    for (const key of Object.keys(req.body.booking)) if (key in clean) updates[`booking.${key}`] = clean[key];
  }

  const shipment = await Shipment.findOne({ _id: req.params.id, createdBy: req.userId });
  if (!shipment) throw new ApiError(404, 'Shipment not found');
  shipment.set(updates);
  // The sheet's "shipped" line follows an edited ship date.
  if (updates.shippingDate && !Number.isNaN(new Date(updates.shippingDate).getTime())) {
    for (const c of shipment.checkpoints) {
      if (c.statusRaw === 'master sheet' && c.status !== 'delivered') c.checkpointTime = new Date(updates.shippingDate);
    }
  }

  // Delivered date typed by hand: kept as a manual "delivered" scan, so a later courier
  // sync (or the delivered-date sweep) agrees with it instead of wiping it.
  if (req.body.deliveredAt !== undefined && shipment.status === 'delivered') {
    const at = req.body.deliveredAt ? new Date(req.body.deliveredAt) : null;
    if (at && Number.isNaN(at.getTime())) throw new ApiError(400, 'Delivered date is not a valid date');
    shipment.checkpoints = shipment.checkpoints.filter((c) => !(c.status === 'delivered' && c.source === 'manual'));
    if (at) {
      shipment.checkpoints.push({
        status: 'delivered',
        statusRaw: 'manual',
        description: 'Delivered (date entered by hand)',
        checkpointTime: at,
        source: 'manual',
      });
      shipment.checkpoints.sort((a, b) => new Date(a.checkpointTime) - new Date(b.checkpointTime));
    }
    shipment.deliveredAt = at;
    if (!at) require('../utils/deliveredAt').syncDeliveredAt(shipment);
  }
  await shipment.save();
  res.json({ shipment });
});

/** Fills in delivery dates the sheet left blank - from the courier where it can. */
const backfillDeliveredDates = asyncHandler(async (req, res) => {
  const { backfillDeliveryDates } = require('../services/historyImport.service');
  res.json(await backfillDeliveryDates(req.userId));
});

const backfillDeliveredDatesStatus = asyncHandler(async (req, res) => {
  res.json(require('../services/historyImport.service').backfillStatus());
});

const deleteShipment = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOneAndDelete({
    _id: req.params.id,
    createdBy: req.userId,
  });
  if (!shipment) throw new ApiError(404, 'Shipment not found');
  // Its customer review and notifications go with it - a review of a shipment that
  // no longer exists must not stay on the public site.
  await Promise.all([
    require('../models/Feedback').deleteMany({ shipmentId: shipment._id }),
    require('../models/Notification').deleteMany({ shipmentId: shipment._id }),
  ]);
  res.status(204).send();
});

const refreshShipmentNow = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne({
    _id: req.params.id,
    createdBy: req.userId,
  });
  if (!shipment) throw new ApiError(404, 'Shipment not found');

  const { shipment: updated } = await refreshShipment(shipment);
  res.json({ shipment: updated });
});

// Cap per sweep so one click can't fan out into an unbounded number of carrier calls.
const REFRESH_ALL_CAP = 50;

const refreshAllShipments = asyncHandler(async (req, res) => {
  const shipments = await Shipment.find({
    createdBy: req.userId,
    isArchived: false,
    status: { $ne: 'delivered' },
  }).limit(REFRESH_ALL_CAP);

  const limit = pLimit(env.refresh.concurrency);
  const results = await Promise.allSettled(shipments.map((s) => limit(() => refreshShipment(s))));

  const failed = results.filter((r) => r.status === 'rejected').length;
  res.json({ refreshed: results.length - failed, failed, total: shipments.length });
});

const bulkUpdateShipments = asyncHandler(async (req, res) => {
  const { ids, isArchived } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, 'ids must be a non-empty array');
  }
  if (isArchived === undefined) {
    throw new ApiError(400, 'isArchived is required');
  }

  const result = await Shipment.updateMany(
    { _id: { $in: ids }, createdBy: req.userId },
    { $set: { isArchived } }
  );
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
});

/**
 * Status set by hand - when the courier's own site is ahead of TrackingMore's feed.
 * Added as a "manual" checkpoint; the next real scan from the courier that is newer
 * replaces it, so a manual status never hides real data.
 */
const setManualStatus = asyncHandler(async (req, res) => {
  const { STATUSES } = require('../utils/statusMap');
  const status = String(req.body.status || '');
  if (!STATUSES.includes(status)) throw new ApiError(400, `Status must be one of: ${STATUSES.join(', ')}`);
  const shipment = await Shipment.findOne({ _id: req.params.id, createdBy: req.userId });
  if (!shipment) throw new ApiError(404, 'Shipment not found');
  const at = req.body.at && !Number.isNaN(new Date(req.body.at).getTime()) ? new Date(req.body.at) : new Date();
  const note = String(req.body.note || '').trim().slice(0, 300);
  const location = String(req.body.location || '').trim().slice(0, 120);
  shipment.checkpoints.push({
    status,
    statusRaw: 'manual',
    location,
    description: note || 'Status updated by hand (seen on the courier’s site)',
    checkpointTime: at,
    source: 'manual',
  });
  shipment.checkpoints.sort((a, b) => new Date(a.checkpointTime) - new Date(b.checkpointTime));
  const latest = shipment.checkpoints[shipment.checkpoints.length - 1];
  shipment.status = latest.status;
  if (location) shipment.currentLocation = location;
  require('../utils/deliveredAt').syncDeliveredAt(shipment);
  if (shipment.status === 'delivered') {
    await notifyCustomerDelivered(shipment).catch(() => {});
  }
  await shipment.save();
  require('../sockets').emitShipmentUpdate(String(req.userId), shipment);
  res.json({ shipment });
});

const addExceptionNote = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    throw new ApiError(400, 'text is required');
  }

  const user = await User.findById(req.userId);
  const shipment = await Shipment.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.userId },
    {
      $push: {
        'exceptionFollowUp.notes': { text: text.trim(), authorId: req.userId, authorName: user?.name || '' },
      },
    },
    { new: true, runValidators: true }
  );
  if (!shipment) throw new ApiError(404, 'Shipment not found');
  res.status(201).json({ shipment });
});

const CSV_COLUMNS = [
  'tracking_number',
  'carrier_code',
  'product_name',
  'sku',
  'quantity',
  'category',
  'customer_name',
  'customer_email',
  'customer_phone',
  'customer_address',
  'delivery_city',
  'delivery_state',
  'delivery_pincode',
  'weight_kg',
  'freight',
  'shipping_date',
  'estimated_delivery',
];

const bulkImportShipments = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'CSV file is required (field name "file")');
  }

  let rows;
  try {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new ApiError(400, `Could not parse CSV: ${err.message}`);
  }

  const failed = [];
  let imported = 0;

  // Sequential on purpose - a few AWB units/week means there's no throughput need to
  // parallelize, and it keeps us polite to TrackingMore's rate limits per row.
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    try {
      if (!row.tracking_number) {
        throw new Error('tracking_number is required');
      }
      await registerShipment(
        {
          trackingNumber: row.tracking_number,
          // Optional column; an unknown code fails just this row, with the reason.
          ...(await resolveCarrier(row.carrier_code)),
          productDetails: {
            name: row.product_name || '',
            sku: row.sku || '',
            quantity: Number(row.quantity) || 1,
            category: row.category || '',
          },
          customerInfo: {
            name: row.customer_name || '',
            email: row.customer_email || '',
            phone: row.customer_phone || '',
          },
          shippingDate: row.shipping_date || undefined,
          estimatedDelivery: row.estimated_delivery || undefined,
          // A bad weight or pincode fails just this row, with the reason, like any other.
          ...commercialFields({
            weightKg: row.weight_kg,
            freightAmount: row.freight,
            deliveryAddress: {
              line: row.customer_address || row.delivery_address,
              city: row.delivery_city,
              state: row.delivery_state,
              pincode: row.delivery_pincode,
            },
          }),
        },
        req.userId
      );
      imported += 1;
    } catch (err) {
      failed.push({ row: rowNumber, trackingNumber: row.tracking_number || '(missing)', error: err.message });
    }
  }

  res.status(207).json({ imported, failed, totalRows: rows.length, expectedColumns: CSV_COLUMNS });
});

/** Back-fill from the logistics master sheet (JSON rows, up to 200 per call). */
const importShipmentHistory = asyncHandler(async (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 200) {
    throw new ApiError(400, 'rows must be an array of 1-200 shipments');
  }
  const { importHistory } = require('../services/historyImport.service');
  res.json(await importHistory(rows, req.userId));
});

/**
 * Manual re-send of the delivery thank-you + feedback request. The automatic send
 * happens once, when the carrier first reports delivery; this is the escape hatch for
 * "the customer says they never got it" and for shipments that were already delivered
 * before this feature existed.
 */
const resendDeliveryNotice = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne({
    _id: req.params.id,
    createdBy: req.userId,
  });
  if (!shipment) throw new ApiError(404, 'Shipment not found');
  if (shipment.status !== 'delivered') {
    throw new ApiError(409, 'Only delivered shipments can be sent a feedback request');
  }
  if (!shipment.customerInfo?.email && !shipment.customerInfo?.phone) {
    throw new ApiError(422, 'This shipment has no customer email or phone to send to');
  }

  // Clear the guard so the service will send again - this endpoint is the explicit
  // "yes, send it anyway" the guard exists to protect against doing accidentally.
  shipment.deliveryNoticeSentAt = undefined;
  const sent = await notifyCustomerDelivered(shipment);
  await shipment.save();

  if (!sent) {
    throw new ApiError(503, 'No delivery channel is configured on the server (SMTP or WhatsApp)');
  }
  res.json({ sent: true, sentAt: shipment.deliveryNoticeSentAt });
});

/** Loose product-name match against stock, so a scanned label can still deduct stock. */
async function matchStockItem(productName) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = norm(productName);
  if (wanted.length < 3) return null;
  const items = await StockItem.find({ isArchived: false, productCode: { $ne: '' } }).select('name size productCode').lean();
  const scored = items
    .map((i) => {
      const name = norm(i.name);
      const full = norm(`${i.name} ${i.size || ''}`);
      if (full === wanted || name === wanted) return { i, score: 3 };
      if (wanted.includes(full) || wanted.includes(name)) return { i, score: 2 };
      if (name.length >= 4 && full.includes(wanted)) return { i, score: 1 };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.i.name.length - a.i.name.length);
  return scored[0]?.i || null;
}

/**
 * Photo of a label -> a draft for the Add shipment form. Saves nothing; the person
 * confirms the draft, so a misread AWB never gets tracked silently.
 */
const extractFromLabel = asyncHandler(async (req, res) => {
  const draft = await extractShipmentFromDocument(req.file);

  const stock = draft.productDetails.name ? await matchStockItem(draft.productDetails.name) : null;
  draft.productDetails.sku = stock ? stock.productCode : '';
  draft.stockMatch = stock ? { name: [stock.name, stock.size].filter(Boolean).join(' '), productCode: stock.productCode } : null;

  const existing = draft.trackingNumber
    ? await Shipment.findOne({ createdBy: req.userId, trackingNumber: draft.trackingNumber }).select('_id carrierName').lean()
    : null;
  draft.existingShipmentId = existing ? String(existing._id) : null;

  res.json({ draft });
});

module.exports = {
  setManualStatus,
  extractFromLabel,
  createShipment,
  listShipments,
  getShipment,
  updateShipment,
  deleteShipment,
  refreshShipmentNow,
  refreshAllShipments,
  bulkUpdateShipments,
  addExceptionNote,
  bulkImportShipments,
  importShipmentHistory,
  backfillDeliveredDates,
  backfillDeliveredDatesStatus,
  resendDeliveryNotice,
};
