const multer = require('multer');
const Shipment = require('../models/Shipment');
const DeliveryReceipt = require('../models/DeliveryReceipt');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { receiptLink, parseReceipt, saveReceipt, resetReceipt, receiptView, MAX_PHOTOS } = require('../services/receipt.service');

/** Photos are shrunk on the phone before sending; these caps stop anything oversized. */
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: MAX_PHOTOS + 1, fields: 20, fieldSize: 2000 },
}).fields([
  { name: 'photos', maxCount: MAX_PHOTOS },
  { name: 'signature', maxCount: 1 },
]);

/** City and state it's going to - the address entered, else what the courier reports. */
const placeOf = (s) =>
  [s.deliveryAddress?.city, s.deliveryAddress?.state].filter(Boolean).join(', ') ||
  [s.carrierRoute?.destinationCity, s.carrierRoute?.destinationState].filter(Boolean).join(', ');

const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{20,40}$/.test(t);

async function shipmentForToken(token) {
  if (!validToken(token)) throw new ApiError(404, 'This receipt link is not valid');
  const shipment = await Shipment.findOne({ receiptToken: token });
  if (!shipment) throw new ApiError(404, 'This receipt link is not valid or has been replaced');
  return shipment;
}

// ─────────────────────────── Public: the receiver's link ───────────────────────────

/** What the receiver needs to recognise the parcel - nothing about prices or invoices. */
const getPublicReceipt = asyncHandler(async (req, res) => {
  const shipment = await shipmentForToken(req.params.token);
  res.json({
    trackingNumber: shipment.trackingNumber,
    carrierName: shipment.carrierName,
    productName: shipment.productDetails?.name || '',
    quantity: shipment.productDetails?.quantity || null,
    customerName: shipment.customerInfo?.name || '',
    deliverTo: placeOf(shipment),
    shippingDate: shipment.shippingDate,
    confirmed: shipment.receipt?.confirmedAt
      ? { receivedBy: shipment.receipt.receivedBy, relation: shipment.receipt.relation, receivedAt: shipment.receipt.receivedAt }
      : null,
  });
});

const submitPublicReceipt = asyncHandler(async (req, res) => {
  const shipment = await shipmentForToken(req.params.token);
  const fields = parseReceipt(req.body, req.files, shipment);
  const receipt = await saveReceipt(shipment, fields, { via: 'link', ip: req.ip, userAgent: req.headers['user-agent'] });
  res.status(201).json({ confirmed: { receivedBy: receipt.receivedBy, relation: receipt.relation, receivedAt: receipt.receivedAt } });
});

// ─────────────────────────── Staff ───────────────────────────

async function ownShipment(req) {
  const shipment = await Shipment.findOne({ _id: req.params.id, createdBy: req.userId });
  if (!shipment) throw new ApiError(404, 'Shipment not found');
  return shipment;
}

/** The receipt (without pictures) and the link to share with whoever will receive it. */
const getReceipt = asyncHandler(async (req, res) => {
  const shipment = await ownShipment(req);
  const receipt = await DeliveryReceipt.findOne({ shipmentId: shipment._id }).select('-photos.data -signature.data');
  res.json({ link: await receiptLink(shipment), receipt: receiptView(receipt) });
});

/** A receipt photo (?n=0..2) or the signature (?n=signature). */
const getReceiptImage = asyncHandler(async (req, res) => {
  const shipment = await ownShipment(req);
  const receipt = await DeliveryReceipt.findOne({ shipmentId: shipment._id });
  if (!receipt) throw new ApiError(404, 'No receipt yet');
  const image = req.query.n === 'signature' ? receipt.signature : receipt.photos[Number(req.query.n) || 0];
  if (!image) throw new ApiError(404, 'No such picture');
  res.set('Content-Type', image.type);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(image.data);
});

/** Staff record it - when the client sends the photo and signature later, by any means. */
const recordReceipt = asyncHandler(async (req, res) => {
  const shipment = await ownShipment(req);
  const fields = parseReceipt(req.body, req.files, shipment);
  const user = await User.findById(req.userId).select('name');
  const receipt = await saveReceipt(shipment, fields, { via: 'staff', user, ip: req.ip, userAgent: req.headers['user-agent'] });
  res.status(201).json({ receipt: receiptView(receipt), shipment });
});

const deleteReceipt = asyncHandler(async (req, res) => {
  const shipment = await ownShipment(req);
  await resetReceipt(shipment);
  res.status(204).send();
});

module.exports = { receiptUpload, getPublicReceipt, submitPublicReceipt, getReceipt, getReceiptImage, recordReceipt, deleteReceipt };
