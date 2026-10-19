const mongoose = require('mongoose');

/**
 * The daily shipment update on WhatsApp for one user: when, to whom, and whether it's
 * switched on. Off by default - see services/shipmentBroadcast.service.js.
 */
const shipmentBroadcastSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: false },
    /** 24h "HH:mm" in India time. */
    time: { type: String, default: '18:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    recipients: { type: [String], default: [] },
    includeLinks: { type: Boolean, default: true },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShipmentBroadcast', shipmentBroadcastSchema);
