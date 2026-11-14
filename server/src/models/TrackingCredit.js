const mongoose = require('mongoose');

/**
 * TrackingMore charges one credit for each tracking number registered with it (looking
 * up an already-registered number is free). The plan's allowance, and where its count
 * starts, live in one settings document; every credit spent is a row in the log.
 */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    /** Credits in the plan - 50 on the free plan, 150 a month on the paid one. */
    allowance: { type: Number, default: 50 },
    /** Where the count starts: the plan's start, or the day it renews each month. */
    periodStart: { type: Date, default: () => new Date() },
    /** Paid plans refill every month on periodStart's day; the free plan doesn't. */
    resetsMonthly: { type: Boolean, default: false },
    /** Credits used before the app started counting (typed in from TrackingMore's dashboard). */
    usedOffset: { type: Number, default: 0 },
    /** The window that offset belongs to - a refilled month starts from zero again. */
    usedOffsetFor: { type: Date, default: null },
    /**
     * Whether the hourly courier check may register active shipments TrackingMore
     * doesn't know yet. Off: only someone adding a shipment spends a credit.
     */
    autoRegister: { type: Boolean, default: false },
    updatedByName: { type: String, default: '' },
    /** One-time plan changes already applied on start-up (see trackingCredits.applyPlanChanges). */
    appliedChanges: { type: [String], default: [] },
  },
  { timestamps: true }
);

const useSchema = new mongoose.Schema(
  {
    at: { type: Date, default: () => new Date(), index: true },
    trackingNumber: { type: String, default: '' },
    carrierCode: { type: String, default: '' },
    shipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', default: null },
    /** new-shipment | refresh | background */
    source: { type: String, default: 'new-shipment' },
    byName: { type: String, default: '' },
  },
  { timestamps: false }
);

module.exports = {
  Settings: mongoose.model('TrackingCreditSettings', settingsSchema),
  Use: mongoose.model('TrackingCreditUse', useSchema),
};
