const mongoose = require('mongoose');

const lineSchema = new mongoose.Schema(
  {
    itemId: { type: String, default: '' },
    name: { type: String, default: '' },
    sku: { type: String, default: '' },
    quantity: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    /** A freight / courier / transport charge line, not goods. */
    freight: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * A copy of each Zoho Books invoice's lines - read once and kept, so buying patterns
 * (who orders what, how often) and freight can be worked out without asking Zoho again.
 */
const zohoInvoiceSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true, unique: true },
    number: { type: String, default: '' },
    date: { type: Date, required: true },
    status: { type: String, default: '' },
    customerId: { type: String, default: '' },
    customerName: { type: String, default: '' },
    total: { type: Number, default: 0 },
    shippingCharge: { type: Number, default: 0 },
    /** Shipping charge + freight-type lines. */
    freight: { type: Number, default: 0 },
    lines: { type: [lineSchema], default: [] },
  },
  { timestamps: true }
);
zohoInvoiceSchema.index({ customerId: 1, date: 1 });

module.exports = mongoose.model('ZohoInvoice', zohoInvoiceSchema);
