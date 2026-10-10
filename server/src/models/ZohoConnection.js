const crypto = require('crypto');
const mongoose = require('mongoose');

const newWebhookToken = () => crypto.randomBytes(24).toString('base64url');

/**
 * Singleton: the company's Zoho Books link. Stock is shared by the whole team, so is
 * this - one person connects, everyone's stock follows Zoho.
 */
const zohoConnectionSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },

    /** Encrypted (utils/secretBox). Empty = not connected. */
    refreshToken: { type: String, default: '' },
    accessToken: { type: String, default: '' },
    accessTokenExpiresAt: { type: Date, default: null },
    apiDomain: { type: String, default: '' },

    organizationId: { type: String, default: '' },
    organizationName: { type: String, default: '' },
    organizations: { type: [{ id: String, name: String, _id: false }], default: [] },

    connectedAt: { type: Date, default: null },
    connectedBy: { type: String, default: '' },

    /** Create a stock line for Zoho items that have stock but no match here. */
    autoCreate: { type: Boolean, default: true },

    /** Secret in the webhook URL Zoho's workflow rules call after a bill or invoice. */
    webhookToken: { type: String, default: newWebhookToken },
    lastWebhookAt: { type: Date, default: null },

    lastSyncAt: { type: Date, default: null },
    lastSyncOk: { type: Boolean, default: null },
    lastSyncError: { type: String, default: '' },
    lastSyncSummary: {
      zohoItems: { type: Number, default: 0 },
      linked: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      stockIn: { type: Number, default: 0 },
      stockOut: { type: Number, default: 0 },
      /** Items Zoho listed without any stock figure - skipped, never read as 0. */
      noFigure: { type: Number, default: 0 },
      /** Matches left unlinked because Zoho shows 0 while the shelf here has stock. */
      held: { type: Number, default: 0 },
      heldNames: { type: [String], default: [] },
    },
    /**
     * Where stock figures come from: 'list' (item list), 'location-list' (list filtered
     * to the primary location) or 'detail' (one item at a time - Zoho Books with Locations).
     */
    zohoStockSource: { type: String, default: '' },
    zohoPrimaryLocationId: { type: String, default: '' },
    /** Which Zoho figure lines follow ('physical-stock-on-hand'); a change triggers one re-read. */
    zohoStockField: { type: String, default: '' },
    zohoDetailHasPhysical: { type: Boolean, default: false },
    /** Last full one-by-one read, and the figures it found (item id -> stock). */
    zohoDetailAt: { type: Date, default: null },
    zohoStockCache: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** A few items exactly as Zoho sent them (stock fields only), for diagnosis. */
    lastSyncSample: { type: mongoose.Schema.Types.Mixed, default: [] },

    /** OAuth round-trip guard (CSRF) - set when "Connect" is pressed, cleared on return. */
    oauthState: { type: String, default: '' },
    oauthStateExpiresAt: { type: Date, default: null },
    oauthUser: { type: String, default: '' },
  },
  { timestamps: true }
);

zohoConnectionSchema.statics.get = async function get() {
  return (await this.findOne({ key: 'default' })) || this.create({ key: 'default' });
};

zohoConnectionSchema.virtual('isConnected').get(function isConnected() {
  return Boolean(this.refreshToken && this.organizationId);
});

module.exports = mongoose.model('ZohoConnection', zohoConnectionSchema);
module.exports.newWebhookToken = newWebhookToken;
