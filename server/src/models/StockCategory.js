const mongoose = require('mongoose');

const LIST_STYLES = ['plain', 'numbers', 'letters'];

/**
 * A heading in the stock message ("AED", "AED Pads"...). Order and list style are
 * per category because that's how the logistics team already writes the update:
 * device lines are plain, pad lines are numbered, the empty-bag list is lettered.
 */
const stockCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    sortOrder: { type: Number, default: 0 },
    listStyle: { type: String, enum: LIST_STYLES, default: 'plain' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockCategory', stockCategorySchema);
module.exports.LIST_STYLES = LIST_STYLES;
