const User = require('../models/User');
const Shipment = require('../models/Shipment');
const StockMovement = require('../models/StockMovement');
const StockSettings = require('../models/StockSettings');
const DeliveryReceipt = require('../models/DeliveryReceipt');
const ManualStock = require('../models/ManualStock');
const logger = require('../config/logger');

const OLD_NAME = 'Demo Ops Manager';
const NEW_NAME = 'Logistics Manager - Aarti';

/**
 * One-time: the team's account is renamed from the seed's "Demo Ops Manager" to the
 * person who uses it, and the history it wrote (stock changes, notes, receipts) says
 * the same. Runs on every start but only does anything while the old name is there -
 * a name changed later in Profile is never touched.
 */
async function renameDemoAccount() {
  const user = await User.findOne({ name: OLD_NAME });
  if (!user) return;

  // History first, the account last: if anything fails, the next start tries it all again.
  const results = await Promise.all([
    StockMovement.updateMany({ userName: OLD_NAME }, { $set: { userName: NEW_NAME } }),
    ManualStock.Movement.updateMany({ userName: OLD_NAME }, { $set: { userName: NEW_NAME } }),
    StockSettings.updateMany({ lastCountBy: OLD_NAME }, { $set: { lastCountBy: NEW_NAME } }),
    ManualStock.Settings.updateMany({ lastCountBy: OLD_NAME }, { $set: { lastCountBy: NEW_NAME } }),
    DeliveryReceipt.updateMany({ recordedByName: OLD_NAME }, { $set: { recordedByName: NEW_NAME } }),
    Shipment.updateMany(
      { 'exceptionFollowUp.notes.authorName': OLD_NAME },
      { $set: { 'exceptionFollowUp.notes.$[n].authorName': NEW_NAME } },
      { arrayFilters: [{ 'n.authorName': OLD_NAME }] }
    ),
  ]);
  user.name = NEW_NAME;
  await user.save();
  const relabelled = results.reduce((n, r) => n + (r.modifiedCount || 0), 0);
  logger.info(`Account renamed to "${NEW_NAME}" (${relabelled} history entries relabelled)`);
}

module.exports = { renameDemoAccount, NEW_NAME };
