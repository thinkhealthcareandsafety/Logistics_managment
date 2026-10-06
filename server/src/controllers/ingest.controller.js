const Shipment = require('../models/Shipment');
const User = require('../models/User');
const { registerShipment } = require('../services/tracking.service');
const { resolveCarrier } = require('../services/courierCatalog.service');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { commercialFields } = require('../utils/shipmentFields');

/**
 * Push-ingestion endpoint: whatever system generates AWB numbers today (an internal
 * order system, a booking API, a Zapier bridge, etc.) calls this whenever a new
 * shipment is booked. Idempotent by tracking number - safe for upstream retries.
 */
const ingestShipment = asyncHandler(async (req, res) => {
  const { trackingNumber, productDetails, customerInfo, shippingDate, estimatedDelivery } = req.body;
  if (!trackingNumber) {
    throw new ApiError(400, 'trackingNumber is required');
  }

  if (!env.ingest.ownerEmail) {
    throw new ApiError(503, 'Ingestion is not configured (set INGEST_OWNER_EMAIL on the server)');
  }
  const owner = await User.findOne({ email: env.ingest.ownerEmail.toLowerCase() });
  if (!owner) {
    throw new ApiError(500, `INGEST_OWNER_EMAIL (${env.ingest.ownerEmail}) does not match any existing user`);
  }

  // `carrierCode` is any TrackingMore courier code; omitted -> the default courier,
  // so existing integrations that never sent one keep working unchanged.
  const carrier = await resolveCarrier(req.body.carrierCode);

  const existing = await Shipment.findOne({
    trackingNumber,
    carrierCode: carrier.carrierCode,
    createdBy: owner._id,
  });
  if (existing) {
    return res.status(200).json({ shipment: existing, created: false });
  }

  const shipment = await registerShipment(
    {
      trackingNumber,
      ...carrier,
      productDetails,
      customerInfo,
      shippingDate,
      estimatedDelivery,
      // weightKg, freightAmount, deliveryAddress { line, city, state, pincode } - optional.
      ...commercialFields(req.body),
    },
    owner._id
  );

  res.status(201).json({ shipment, created: true });
});

module.exports = { ingestShipment };
