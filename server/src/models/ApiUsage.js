const mongoose = require('mongoose');

/**
 * Calls made to each paid outside API per India day - what the daily limits in
 * services/apiBudget.js are checked against. In the database, so a restart or deploy
 * never resets the count.
 */
const apiUsageSchema = new mongoose.Schema(
  {
    /** "YYYY-MM-DD", India time. */
    day: { type: String, required: true },
    /** gemini | trackingmore | whatsapp */
    provider: { type: String, required: true },
    count: { type: Number, default: 0 },
    /** Calls refused because the limit was reached. */
    blocked: { type: Number, default: 0 },
  },
  { timestamps: true }
);
apiUsageSchema.index({ day: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('ApiUsage', apiUsageSchema);
