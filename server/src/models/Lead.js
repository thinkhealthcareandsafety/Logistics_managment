const mongoose = require('mongoose');

const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'];

/**
 * An enquiry from the public pricing page. Stored so nothing a prospect sends is
 * lost; there is no in-app screen for these (the Leads section was removed).
 */
const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    company: { type: String, default: '', trim: true, maxlength: 160 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    message: { type: String, default: '', trim: true, maxlength: 2000 },

    /** Which pricing tier the button that opened the form belonged to. */
    plan: { type: String, default: '', trim: true, maxlength: 60 },
    monthlyShipments: { type: String, default: '', trim: true, maxlength: 40 },

    status: { type: String, enum: LEAD_STATUSES, default: 'new', index: true },
  },
  { timestamps: true }
);

leadSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
module.exports.LEAD_STATUSES = LEAD_STATUSES;
