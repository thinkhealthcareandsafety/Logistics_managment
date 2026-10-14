const mongoose = require('mongoose');
const StockCategory = require('./StockCategory');
const StockItem = require('./StockItem');
const StockMovement = require('./StockMovement');
const StockSettings = require('./StockSettings');

/**
 * The manual stock ledger: same shape as the main stock, in its own collections, kept
 * by hand and never connected to Zoho Books (the Zoho sync, photo search, duplicate
 * finder and shipment deductions only ever read the main collections).
 */
const clone = (name, base, collection) =>
  mongoose.models[name] || mongoose.model(name, base.schema.clone(), collection);

module.exports = {
  Category: clone('ManualStockCategory', StockCategory, 'manualstockcategories'),
  Item: clone('ManualStockItem', StockItem, 'manualstockitems'),
  Movement: clone('ManualStockMovement', StockMovement, 'manualstockmovements'),
  Settings: clone('ManualStockSettings', StockSettings, 'manualstocksettings'),
};
