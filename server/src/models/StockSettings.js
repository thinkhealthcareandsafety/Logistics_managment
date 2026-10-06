const crypto = require('crypto');
const mongoose = require('mongoose');

function newShareToken() {
  return crypto.randomBytes(18).toString('base64url');
}

/**
 * Singleton (one document) holding how the stock update is published: the scheduled
 * WhatsApp broadcast, the secret live-stock link, and who last counted.
 */
const stockSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },

    /** Secret for the read-only live stock page. Rotating it kills old links. */
    shareToken: { type: String, default: newShareToken },

    hideZeroInMessage: { type: Boolean, default: false },

    broadcast: {
      enabled: { type: Boolean, default: false },
      /** 24h "HH:mm" in India time - when the daily update goes out. */
      time: { type: String, default: '10:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
      recipients: { type: [String], default: [] },
      lastSentAt: { type: Date, default: null },
    },

    lastCountAt: { type: Date, default: null },
    lastCountBy: { type: String, default: '' },
  },
  { timestamps: true }
);

stockSettingsSchema.statics.get = async function get() {
  return (await this.findOne({ key: 'default' })) || this.create({ key: 'default' });
};

module.exports = mongoose.model('StockSettings', stockSettingsSchema);
module.exports.newShareToken = newShareToken;
