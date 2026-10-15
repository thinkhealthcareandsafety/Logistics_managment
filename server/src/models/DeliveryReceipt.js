const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    type: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  },
  { _id: false }
);

/** Who can take a parcel in for the client - the client isn't always the one at the door. */
const RELATIONS = ['self', 'security', 'reception', 'colleague', 'family', 'other'];
const CONDITIONS = ['good', 'damaged', 'partial'];

/**
 * Proof of delivery: who physically received the shipment, their photo and signature.
 * Filled in by the receiver from the delivery slip's QR / link (client, watchman,
 * receptionist...), or by staff from a photo the client sent later. Photos live here,
 * not on the shipment, so shipment lists stay light. One per shipment.
 */
const deliveryReceiptSchema = new mongoose.Schema(
  {
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, unique: true },
    receivedBy: { type: String, required: true, trim: true, maxlength: 80 },
    relation: { type: String, enum: RELATIONS, required: true },
    /** "Gate 2 guard", "Store in-charge" - free text, especially for "other". */
    relationNote: { type: String, default: '', trim: true, maxlength: 80 },
    phone: { type: String, default: '', trim: true, maxlength: 20 },
    condition: { type: String, enum: CONDITIONS, default: 'good' },
    remarks: { type: String, default: '', trim: true, maxlength: 500 },
    /** When the parcel was taken in - the receiver's own time, which may be before they had internet. */
    receivedAt: { type: Date, required: true },
    photos: { type: [imageSchema], default: [] },
    signature: { type: imageSchema, required: true },
    /** Where the phone was, if the receiver allowed it. */
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
    },
    via: { type: String, enum: ['link', 'staff'], required: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recordedByName: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeliveryReceipt', deliveryReceiptSchema);
module.exports.RELATIONS = RELATIONS;
module.exports.CONDITIONS = CONDITIONS;
