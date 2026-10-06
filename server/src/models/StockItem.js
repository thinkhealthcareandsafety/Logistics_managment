const mongoose = require('mongoose');

/**
 * One line of stock. Stock is shared across the whole team (not per user), the same
 * way the WhatsApp group is - everyone looks at, and counts, the same shelf.
 */
const stockItemSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockCategory', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },

    /**
     * Optional size / dimension ("5×4", "10×20", "1m × 1m", "Big"). Kept apart from the
     * name so "Crepe Bandage" is one product in three sizes, not three products.
     */
    size: { type: String, default: '', trim: true, maxlength: 40 },

    /** Total units on the shelf (old + new when the line is split). */
    quantity: { type: Number, default: 0, min: 0 },

    /**
     * Lines written as "(8) +40 =48" hold old and new stock side by side. When set,
     * this many of `quantity` are old stock (the rest are new). null = not split.
     * Old stock goes out first.
     */
    oldQuantity: { type: Number, default: null, min: 0 },

    /** Public remark that rides along in the message, e.g. "3 without pad". */
    note: { type: String, default: '', trim: true, maxlength: 160 },

    /**
     * The logistics manager's own note - reservations, who to chase, where things
     * are. Never included in the WhatsApp update or on the live link.
     */
    internalNote: { type: String, default: '', trim: true, maxlength: 1000 },

    /** Pads and batteries expire; a line can hold units from more than one batch. */
    expiryDates: { type: [Date], default: [] },

    /** Flag the line as low at or below this count. null = no threshold. */
    lowStockAt: { type: Number, default: null, min: 0 },

    /**
     * Links the line to shipments: a shipment booked with this product code deducts
     * its quantity automatically. Stored upper-case; empty = not linked.
     */
    productCode: { type: String, default: '', trim: true, uppercase: true, maxlength: 60, index: true },

    /**
     * Linked Zoho Books item. While Zoho is connected, a linked line's quantity follows
     * Zoho's stock on hand (bills add, invoices remove) and can't be changed here.
     */
    zohoItemId: { type: String, default: '', index: true },
    zohoItemName: { type: String, default: '' },

    sortOrder: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

/** "Crepe Bandage 5×4" - how the line reads in the message, history and stock-outs. */
stockItemSchema.virtual('displayName').get(function displayName() {
  return this.size ? `${this.name} ${this.size}` : this.name;
});

stockItemSchema.pre('validate', function keepSplitConsistent(next) {
  if (this.oldQuantity != null && this.oldQuantity > this.quantity) {
    return next(new Error('Old stock cannot be more than the total'));
  }
  next();
});

/**
 * Takes `qty` off the line, old stock first. Returns how many actually came off
 * (never below zero) so callers can flag a shortfall.
 */
stockItemSchema.methods.takeOut = function takeOut(qty) {
  const taken = Math.min(qty, this.quantity);
  if (this.oldQuantity != null) {
    this.oldQuantity = Math.max(0, this.oldQuantity - taken);
  }
  this.quantity -= taken;
  if (this.oldQuantity != null && this.oldQuantity > this.quantity) this.oldQuantity = this.quantity;
  return taken;
};

module.exports = mongoose.model('StockItem', stockItemSchema);
