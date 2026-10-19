const mongoose = require('mongoose');

/**
 * count     - someone counted the shelf and corrected the number
 * dispatch  - "stock out": goods sent to a customer, recorded by hand
 * shipment  - goods left automatically because a shipment was booked with the line's code
 * created   - the line was added
 * zoho      - Zoho Books' stock on hand changed (a bill adds, an invoice removes)
 * edited    - details changed (name, size, category...) - no quantity change
 * removed   - the line was taken off the sheet (history kept)
 */
const MOVEMENT_REASONS = ['count', 'dispatch', 'shipment', 'created', 'zoho', 'edited', 'removed'];

/**
 * Append-only log of every quantity change. The WhatsApp thread only ever shows the
 * latest number; this is what answers "who changed HS1 pads from 47 to 40, and why".
 * Names are snapshotted so history still reads correctly after an item is renamed.
 */
const stockMovementSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockItem', required: true, index: true },
    itemName: { type: String, required: true },
    change: { type: Number, required: true },
    quantityAfter: { type: Number, required: true },
    reason: { type: String, enum: MOVEMENT_REASONS, required: true },
    note: { type: String, default: '', maxlength: 300 },

    /** Who the goods went to - stock-out and shipment movements. */
    customer: { type: String, default: '', trim: true, maxlength: 160 },

    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', default: null },
    trackingNumber: { type: String, default: '' },

    /**
     * For lines split into old + new: how much of `change` was old stock and how much
     * new ("5 old + 8 new added", "3 old + 1 new out"). null on lines without the split.
     */
    oldChange: { type: Number, default: null },
    newChange: { type: Number, default: null },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ reason: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
module.exports.MOVEMENT_REASONS = MOVEMENT_REASONS;

/**
 * The old / new parts of a change, from the line before and after it - the one rule
 * every change uses. {} when the line keeps one number (no old/new split).
 */
module.exports.oldNewSplit = function oldNewSplit(before, after) {
  if (before.oldQuantity == null || after.oldQuantity == null) return {};
  const oldChange = after.oldQuantity - before.oldQuantity;
  const newChange = after.quantity - after.oldQuantity - (before.quantity - before.oldQuantity);
  return { oldChange, newChange };
};
