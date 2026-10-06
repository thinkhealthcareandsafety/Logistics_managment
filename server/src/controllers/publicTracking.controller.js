const Shipment = require('../models/Shipment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * No-login tracking lookup - the tracking number itself is the access token, so the
 * response is deliberately minimal: no customer name/email/phone/address, no internal
 * ids, nothing that isn't needed to answer "where's my shipment."
 */
const getPublicTracking = asyncHandler(async (req, res) => {
  // Any courier. `?carrier=` pins it when the same AWB exists under two couriers;
  // otherwise the most recently added match wins.
  const query = { trackingNumber: req.params.trackingNumber };
  if (req.query.carrier) query.carrierCode = String(req.query.carrier).toLowerCase();
  const shipment = await Shipment.findOne(query).sort({ createdAt: -1 });
  if (!shipment) {
    throw new ApiError(404, 'No shipment found for this tracking number');
  }

  res.json({
    trackingNumber: shipment.trackingNumber,
    carrierName: shipment.carrierName,
    status: shipment.status,
    currentLocation: shipment.currentLocation,
    shippingDate: shipment.shippingDate,
    estimatedDelivery: shipment.estimatedDelivery,
    deliveredAt: shipment.deliveredAt,
    lastCheckedAt: shipment.lastCheckedAt,
    productName: shipment.productDetails?.name || '',
    checkpoints: shipment.checkpoints.map((cp) => ({
      status: cp.status,
      location: cp.location,
      description: cp.description,
      checkpointTime: cp.checkpointTime,
    })),
  });
});

module.exports = { getPublicTracking };
