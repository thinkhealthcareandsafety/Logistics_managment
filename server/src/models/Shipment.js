const mongoose = require('mongoose');
const { STATUSES } = require('../utils/statusMap');

const checkpointSchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    statusRaw: { type: String, default: '' },
    location: { type: String, default: '' },
    description: { type: String, default: '' },
    checkpointTime: { type: Date, required: true },
    source: { type: String, enum: ['trackingmore', 'manual'], default: 'trackingmore' },
  },
  { _id: false }
);

const productDetailsSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    sku: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    category: { type: String, default: '' },
  },
  { _id: false }
);

const customerInfoSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
  },
  { _id: false }
);

/** Where the client wants it delivered - from the booking, typed in, CSV or ingest API. */
const deliveryAddressSchema = new mongoose.Schema(
  {
    line: { type: String, default: '', trim: true, maxlength: 300 },
    city: { type: String, default: '', trim: true, maxlength: 80 },
    state: { type: String, default: '', trim: true, maxlength: 80 },
    pincode: { type: String, default: '', trim: true, match: /^(\d{6})?$/ },
  },
  { _id: false }
);

/**
 * What the courier itself reports about the route, refreshed on every sync. Shree
 * Maruti (via TrackingMore) gives origin + destination city/state and milestone
 * dates - but no street address, pincode or weight, so those stay booking data.
 */
const carrierRouteSchema = new mongoose.Schema(
  {
    originCity: { type: String, default: '' },
    originState: { type: String, default: '' },
    destinationCity: { type: String, default: '' },
    destinationState: { type: String, default: '' },
    pickupAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    fetchedAt: { type: Date, default: null },
  },
  { _id: false }
);

const exceptionNoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const exceptionFollowUpSchema = new mongoose.Schema(
  {
    isBeingFollowedUp: { type: Boolean, default: false },
    notes: { type: [exceptionNoteSchema], default: [] },
  },
  { _id: false }
);

const shipmentSchema = new mongoose.Schema(
  {
    trackingNumber: { type: String, required: true, trim: true },
    carrierCode: { type: String, required: true, trim: true, lowercase: true },
    carrierName: { type: String, default: '' },
    trackingMoreId: { type: String, default: '' },

    productDetails: { type: productDetailsSchema, default: () => ({}) },
    customerInfo: { type: customerInfoSchema, default: () => ({}) },

    shippingDate: { type: Date },
    estimatedDelivery: { type: Date },

    /** Chargeable weight in kg, and the freight charged for the consignment in ₹. Optional. */
    weightKg: { type: Number, min: 0, default: null },
    freightAmount: { type: Number, min: 0, default: null },

    deliveryAddress: { type: deliveryAddressSchema, default: () => ({}) },
    carrierRoute: { type: carrierRouteSchema, default: () => ({}) },

    status: { type: String, enum: STATUSES, default: 'pending' },
    /**
     * When it was actually delivered - set by every status update (courier sync, manual
     * refresh), cleared if the courier walks the status back. null until delivered.
     */
    deliveredAt: { type: Date, default: null },
    currentLocation: { type: String, default: '' },
    checkpoints: { type: [checkpointSchema], default: [] },

    lastCheckedAt: { type: Date },
    isArchived: { type: Boolean, default: false },
    exceptionFollowUp: { type: exceptionFollowUpSchema, default: () => ({}) },

    // When the customer's "delivered, thanks, please rate us" message went out.
    // Set once and checked before sending, so a carrier re-issuing the delivered
    // checkpoint (or a manual re-sync) can't mail the same customer twice.
    deliveryNoticeSentAt: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

shipmentSchema.index({ createdBy: 1, isArchived: 1, status: 1 });
shipmentSchema.index({ trackingNumber: 1, carrierCode: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);
