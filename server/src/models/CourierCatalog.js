const mongoose = require('mongoose');

/**
 * The last good copy of TrackingMore's courier list, so a restart (or a day whose
 * TrackingMore calls are used up) never leaves the app without it.
 */
const courierCatalogSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'trackingmore', unique: true },
    list: { type: [mongoose.Schema.Types.Mixed], default: [] },
    fetchedAt: { type: Date, default: null },
  },
  { timestamps: false }
);

module.exports = mongoose.model('CourierCatalog', courierCatalogSchema);
