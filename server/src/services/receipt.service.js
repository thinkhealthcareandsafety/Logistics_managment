const crypto = require('crypto');
const Shipment = require('../models/Shipment');
const DeliveryReceipt = require('../models/DeliveryReceipt');
const { RELATIONS, CONDITIONS } = require('../models/DeliveryReceipt');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');
const { syncDeliveredAt } = require('../utils/deliveredAt');

/**
 * Proof of delivery. The receiver - client, watchman, receptionist - opens the receipt
 * link (QR on the delivery slip, or a link the team shares) on their own phone, and
 * gives their name, who they are, a photo and a signature. Nothing here sends a
 * message or calls a paid service: the link is shared by hand.
 */

const MAX_PHOTOS = 3;

const newToken = () => crypto.randomBytes(18).toString('base64url');

/** The receipt link for a shipment, creating its secret token the first time. */
async function receiptLink(shipment) {
  if (!shipment.receiptToken) {
    // Only if there's still none - two pages asking at once must not end up with two
    // different links, one of which no longer works.
    await Shipment.updateOne({ _id: shipment._id, receiptToken: null }, { $set: { receiptToken: newToken() } });
    const saved = await Shipment.findById(shipment._id).select('receiptToken').lean();
    shipment.receiptToken = saved.receiptToken;
  }
  return `${env.clientUrl}/receive/${shipment.receiptToken}`;
}

/** What a file really is, from its first bytes - never trust the name or the browser's label. */
function imageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** Checks and shapes a submitted receipt (multer files + text fields). */
function parseReceipt(body = {}, files = {}, shipment) {
  const receivedBy = text(body.receivedBy, 80);
  if (receivedBy.length < 2) throw new ApiError(400, 'Enter the name of the person who received the parcel');
  const relation = RELATIONS.includes(body.relation) ? body.relation : null;
  if (!relation) throw new ApiError(400, 'Choose who received it (yourself, security, reception...)');
  const condition = CONDITIONS.includes(body.condition) ? body.condition : 'good';

  const sigFile = files.signature?.[0];
  const sigType = imageType(sigFile?.buffer);
  if (!sigType) throw new ApiError(400, 'Add the receiver’s signature');
  const photos = (files.photos || []).slice(0, MAX_PHOTOS).map((f) => {
    const type = imageType(f.buffer);
    if (!type) throw new ApiError(400, 'Photos must be JPG, PNG or WebP pictures');
    return { data: f.buffer, type };
  });
  if (!photos.length) throw new ApiError(400, 'Add a photo of the parcel or the person receiving it');

  // The receiver's own clock (they may have filled it in offline and sent it later),
  // kept within sense: not before the shipment left, not in the future.
  let receivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();
  const earliest = new Date(shipment.shippingDate || shipment.createdAt).getTime() - 24 * 60 * 60 * 1000;
  if (Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() > Date.now() + 10 * 60 * 1000 || receivedAt.getTime() < earliest) {
    receivedAt = new Date();
  }

  const lat = num(body.lat);
  const lng = num(body.lng);
  const validGeo = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    receivedBy,
    relation,
    relationNote: text(body.relationNote, 80),
    phone: text(body.phone, 20).replace(/[^\d+ -]/g, ''),
    condition,
    remarks: text(body.remarks, 500),
    receivedAt,
    photos,
    signature: { data: sigFile.buffer, type: sigType },
    location: validGeo ? { lat, lng, accuracy: num(body.accuracy) } : undefined,
  };
}

/**
 * Saves the receipt (once - a second one is refused until staff reset it), keeps a
 * summary on the shipment, and marks it delivered if the courier hasn't yet.
 */
async function saveReceipt(shipment, fields, { via, user = null, ip = '', userAgent = '' }) {
  if (await DeliveryReceipt.exists({ shipmentId: shipment._id })) {
    throw new ApiError(409, 'Receipt for this shipment has already been confirmed');
  }
  const receipt = await DeliveryReceipt.create({
    ...fields,
    shipmentId: shipment._id,
    via,
    recordedBy: user?._id || null,
    recordedByName: user?.name || '',
    ip: String(ip || '').slice(0, 64),
    userAgent: String(userAgent || '').slice(0, 200),
  });

  shipment.receipt = {
    confirmedAt: receipt.createdAt,
    receivedAt: receipt.receivedAt,
    receivedBy: receipt.receivedBy,
    relation: receipt.relation,
    condition: receipt.condition,
    via,
  };
  if (shipment.status !== 'delivered') {
    shipment.checkpoints.push({
      status: 'delivered',
      statusRaw: 'receipt',
      description: `Received by ${receipt.receivedBy} (${receipt.relation}) - confirmed on the delivery receipt`,
      checkpointTime: receipt.receivedAt,
      source: 'manual',
    });
    shipment.checkpoints.sort((a, b) => new Date(a.checkpointTime) - new Date(b.checkpointTime));
    shipment.status = shipment.checkpoints[shipment.checkpoints.length - 1].status;
    syncDeliveredAt(shipment);
  }
  await shipment.save();
  require('../sockets').emitShipmentUpdate(String(shipment.createdBy), shipment);
  logger.info(`Delivery receipt for ${shipment.trackingNumber}: ${receipt.receivedBy} (${receipt.relation}) via ${via}`);
  return receipt;
}

/** Removes a wrong receipt; the old link stops working and a fresh one is made when next shared. */
async function resetReceipt(shipment) {
  await DeliveryReceipt.deleteOne({ shipmentId: shipment._id });
  // The "delivered" scan the receipt itself added goes too - the courier's own scans stay.
  const before = shipment.checkpoints.length;
  shipment.checkpoints = shipment.checkpoints.filter((c) => c.statusRaw !== 'receipt');
  if (shipment.checkpoints.length !== before) {
    shipment.status = shipment.checkpoints.length ? shipment.checkpoints[shipment.checkpoints.length - 1].status : 'pending';
    syncDeliveredAt(shipment);
  }
  shipment.receipt = { confirmedAt: null, receivedAt: null, receivedBy: '', relation: '', condition: '', via: '' };
  shipment.receiptToken = undefined; // the old link stops working
  await shipment.save();
}

/** The receipt without its pictures - counts and flags only. */
function receiptView(r) {
  if (!r) return null;
  return {
    receivedBy: r.receivedBy,
    relation: r.relation,
    relationNote: r.relationNote,
    phone: r.phone,
    condition: r.condition,
    remarks: r.remarks,
    receivedAt: r.receivedAt,
    confirmedAt: r.createdAt,
    photoCount: r.photos?.length || 0,
    location: r.location?.lat != null ? r.location : null,
    via: r.via,
    recordedByName: r.recordedByName,
  };
}

module.exports = { receiptLink, parseReceipt, saveReceipt, resetReceipt, receiptView, imageType, MAX_PHOTOS };
