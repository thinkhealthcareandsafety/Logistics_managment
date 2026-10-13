const mongoose = require('mongoose');

/**
 * WhatsApp messages sent per India day - the record the send limits are checked
 * against (see services/whatsappBudget.js). Kept in the database so a restart or
 * deploy never resets the count.
 */
const whatsAppUsageSchema = new mongoose.Schema(
  {
    /** "YYYY-MM-DD", India time. */
    day: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    /** Messages per destination number that day: { "919812345678": 2 }. */
    perNumber: { type: Map, of: Number, default: () => ({}) },
    /** Sends refused because a limit was reached. */
    blocked: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WhatsAppUsage', whatsAppUsageSchema);
