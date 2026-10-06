const crypto = require('crypto');
const mongoose = require('mongoose');
const StockCategory = require('../models/StockCategory');
const StockItem = require('../models/StockItem');
const StockMovement = require('../models/StockMovement');
const StockSettings = require('../models/StockSettings');
const { newShareToken } = require('../models/StockSettings');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isWhatsAppConfigured } = require('../services/whatsapp.service');
const { LIST_STYLES } = require('../models/StockCategory');
const {
  loadStock,
  buildStockMessage,
  stockOutToday,
  currentMessage,
  splitForWhatsApp,
  applyCount,
  recordStockOut,
  broadcastStock,
} = require('../services/stock.service');

function assertId(id, what = 'item') {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, `Stock ${what} not found`);
}

function settingsView(settings) {
  return {
    shareToken: settings.shareToken,
    hideZeroInMessage: settings.hideZeroInMessage,
    broadcast: settings.broadcast,
    lastCountAt: settings.lastCountAt,
    lastCountBy: settings.lastCountBy,
    whatsappConfigured: isWhatsAppConfigured(),
  };
}

/** Parses "YYYY-MM-DD" strings into UTC-midnight dates; drops blanks and junk. */
function parseExpiryDates(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)))
    .map((v) => new Date(`${v}T00:00:00.000Z`))
    .sort((a, b) => a - b);
}

function listStyleOf(value) {
  if (value === undefined) return undefined;
  if (!LIST_STYLES.includes(value)) throw new ApiError(400, `List style must be one of: ${LIST_STYLES.join(', ')}`);
  return value;
}

function itemFields(body) {
  const fields = {};
  if (body.name !== undefined) fields.name = String(body.name).trim();
  if (body.size !== undefined) fields.size = String(body.size).trim().slice(0, 40);
  if (body.note !== undefined) fields.note = String(body.note).trim();
  if (body.internalNote !== undefined) fields.internalNote = String(body.internalNote).trim().slice(0, 1000);
  if (body.productCode !== undefined) fields.productCode = String(body.productCode).trim().toUpperCase();
  if (body.expiryDates !== undefined) fields.expiryDates = parseExpiryDates(body.expiryDates);
  if (body.lowStockAt !== undefined) {
    const n = body.lowStockAt === null || body.lowStockAt === '' ? null : Number(body.lowStockAt);
    if (n !== null && (!Number.isInteger(n) || n < 0)) throw new ApiError(400, 'Low-stock level must be a whole number');
    fields.lowStockAt = n;
  }
  if (body.categoryId !== undefined) {
    assertId(body.categoryId, 'category');
    fields.categoryId = body.categoryId;
  }
  return fields;
}

async function assertCodeFree(productCode, exceptId) {
  if (!productCode) return;
  const clash = await StockItem.findOne({ productCode, isArchived: false, _id: { $ne: exceptId } });
  if (clash) throw new ApiError(409, `Product code ${productCode} is already linked to "${clash.displayName}"`);
}

// ─────────────────────────── Read ───────────────────────────

const getStock = asyncHandler(async (req, res) => {
  const { categories, items, settings } = await loadStock();
  res.json({ categories, items, settings: settingsView(settings) });
});

const getMessage = asyncHandler(async (req, res) => {
  const text = await currentMessage();
  // How many WhatsApp messages the automatic send would need for this text.
  res.json({ text, parts: splitForWhatsApp(text).length, generatedAt: new Date() });
});

const listMovements = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const movements = await StockMovement.find().sort({ createdAt: -1 }).limit(limit);
  res.json({ movements });
});

// ─────────────────────────── Categories ───────────────────────────

const createCategory = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new ApiError(400, 'Give the category a name');
  const last = await StockCategory.findOne().sort({ sortOrder: -1 });
  const category = await StockCategory.create({
    name,
    listStyle: listStyleOf(req.body.listStyle) || 'plain',
    sortOrder: (last?.sortOrder ?? -1) + 1,
  });
  res.status(201).json({ category });
});

const updateCategory = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'category');
  const updates = {};
  if (req.body.name !== undefined) {
    updates.name = String(req.body.name).trim();
    if (!updates.name) throw new ApiError(400, 'Give the category a name');
  }
  if (req.body.listStyle !== undefined) updates.listStyle = listStyleOf(req.body.listStyle);
  if (req.body.sortOrder !== undefined) updates.sortOrder = Number(req.body.sortOrder) || 0;
  const category = await StockCategory.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
  if (!category) throw new ApiError(404, 'Stock category not found');
  res.json({ category });
});

const deleteCategory = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'category');
  const inUse = await StockItem.countDocuments({ categoryId: req.params.id, isArchived: false });
  if (inUse > 0) throw new ApiError(409, 'Move or remove the items in this category first');
  await StockCategory.findByIdAndDelete(req.params.id);
  res.status(204).send();
});

// ─────────────────────────── Items ───────────────────────────

const createItem = asyncHandler(async (req, res) => {
  const fields = itemFields(req.body);
  if (!fields.name) throw new ApiError(400, 'Give the item a name');
  if (!fields.categoryId) throw new ApiError(400, 'Pick a category');
  if (!(await StockCategory.exists({ _id: fields.categoryId }))) throw new ApiError(404, 'Stock category not found');
  await assertCodeFree(fields.productCode);

  const quantity = Number(req.body.quantity ?? 0);
  if (!Number.isInteger(quantity) || quantity < 0) throw new ApiError(400, 'Quantity must be a whole number, 0 or more');
  const oldQuantity = req.body.oldQuantity == null ? null : Number(req.body.oldQuantity);
  if (oldQuantity !== null && (!Number.isInteger(oldQuantity) || oldQuantity < 0 || oldQuantity > quantity)) {
    throw new ApiError(400, 'Old stock must be a whole number no more than the total');
  }

  const last = await StockItem.findOne({ categoryId: fields.categoryId }).sort({ sortOrder: -1 });
  const item = await StockItem.create({ ...fields, quantity, oldQuantity, sortOrder: (last?.sortOrder ?? -1) + 1 });

  const user = await User.findById(req.userId).select('name');
  await StockMovement.create({
    itemId: item._id,
    itemName: item.displayName,
    change: quantity,
    quantityAfter: quantity,
    reason: 'created',
    userId: req.userId,
    userName: user?.name || '',
  });
  res.status(201).json({ item });
});

/**
 * Details only - quantity changes go through /count or /stock-out so every change is
 * logged. `splitOldNew` turns the old/new split on (everything counts as new until
 * the next count) or off (old and new merge into one number).
 */
const updateItem = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const fields = itemFields(req.body);
  if (fields.name === '') throw new ApiError(400, 'Give the item a name');
  if (fields.productCode !== undefined) await assertCodeFree(fields.productCode, req.params.id);
  if (fields.categoryId && !(await StockCategory.exists({ _id: fields.categoryId }))) {
    throw new ApiError(404, 'Stock category not found');
  }

  const item = await StockItem.findOne({ _id: req.params.id, isArchived: false });
  if (!item) throw new ApiError(404, 'Stock item not found');
  Object.assign(item, fields);
  if (req.body.splitOldNew === true && item.oldQuantity == null) item.oldQuantity = 0;
  if (req.body.splitOldNew === false) item.oldQuantity = null;
  await item.save();
  res.json({ item });
});

const stockOut = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const { item, movement } = await recordStockOut({
    itemId: req.params.id,
    quantity: Number(req.body.quantity),
    customer: req.body.customer,
    note: req.body.note,
    userId: req.userId,
  });
  res.status(201).json({ item, movement });
});

/** Archived, not deleted: movements keep pointing at a real record. */
const removeItem = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const item = await StockItem.findByIdAndUpdate(
    req.params.id,
    { $set: { isArchived: true, productCode: '' } },
    { new: true }
  );
  if (!item) throw new ApiError(404, 'Stock item not found');
  res.status(204).send();
});

const saveCount = asyncHandler(async (req, res) => {
  const changes = (req.body.changes || []).map((c) => {
    assertId(c.itemId);
    return {
      itemId: c.itemId,
      quantity: Number(c.quantity),
      oldQuantity: c.oldQuantity == null ? null : Number(c.oldQuantity),
    };
  });
  const result = await applyCount({ changes, note: req.body.note, userId: req.userId });
  const { categories, items, settings } = await loadStock();
  res.json({ ...result, categories, items, settings: settingsView(settings) });
});

// ─────────────────────────── Publishing ───────────────────────────

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await StockSettings.get();
  const { hideZeroInMessage, broadcast = {} } = req.body;

  if (hideZeroInMessage !== undefined) settings.hideZeroInMessage = !!hideZeroInMessage;
  if (broadcast.enabled !== undefined) settings.broadcast.enabled = !!broadcast.enabled;
  if (broadcast.time !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(broadcast.time)) throw new ApiError(400, 'Time must be HH:mm');
    settings.broadcast.time = broadcast.time;
  }
  if (broadcast.recipients !== undefined) {
    if (!Array.isArray(broadcast.recipients)) throw new ApiError(400, 'recipients must be a list');
    const cleaned = [...new Set(broadcast.recipients.map((r) => String(r).trim()).filter(Boolean))];
    const bad = cleaned.find((r) => r.replace(/[^\d]/g, '').length < 10);
    if (bad) throw new ApiError(400, `"${bad}" doesn't look like a WhatsApp number - include the country code`);
    settings.broadcast.recipients = cleaned.slice(0, 50);
  }
  if (settings.broadcast.enabled && settings.broadcast.recipients.length === 0) {
    throw new ApiError(400, 'Add at least one WhatsApp number before turning on the daily update');
  }

  await settings.save();
  res.json({ settings: settingsView(settings) });
});

const sendNow = asyncHandler(async (req, res) => {
  if (!isWhatsAppConfigured()) {
    throw new ApiError(
      503,
      'WhatsApp sending isn’t connected yet - add the Gupshup keys on the server, or use "Open in WhatsApp"'
    );
  }
  res.json(await broadcastStock());
});

const rotateShareToken = asyncHandler(async (req, res) => {
  const settings = await StockSettings.get();
  settings.shareToken = newShareToken();
  await settings.save();
  res.json({ settings: settingsView(settings) });
});

// ─────────────────────────── Public (secret link) ───────────────────────────

/**
 * Read-only stock for anyone holding the link - meant to be pinned in the WhatsApp
 * group so the number is always current without anyone posting. No product codes,
 * no history, no names.
 */
const getPublicStock = asyncHandler(async (req, res) => {
  const settings = await StockSettings.findOne({ key: 'default' });
  const token = Buffer.from(String(req.params.token || ''));
  const expected = Buffer.from(settings?.shareToken || '');
  // Constant-time compare so the token can't be guessed a character at a time.
  if (!settings || token.length !== expected.length || !crypto.timingSafeEqual(token, expected)) {
    throw new ApiError(404, 'This stock link is invalid or has been replaced');
  }
  const [{ categories, items }, out] = await Promise.all([loadStock(), stockOutToday()]);
  // Internal notes, product codes and who-did-what stay inside the app.
  res.json({
    updatedAt: settings.lastCountAt || settings.updatedAt,
    categories: categories.map((c) => ({
      id: c._id,
      name: c.name,
      listStyle: c.listStyle,
      items: items
        .filter((i) => String(i.categoryId) === String(c._id))
        .map((i) => ({
          id: i._id,
          name: i.name,
          size: i.size,
          quantity: i.quantity,
          oldQuantity: i.oldQuantity,
          note: i.note,
          expiryDates: i.expiryDates,
        })),
    })),
    message: buildStockMessage({ categories, items, stockOut: out, hideZero: settings.hideZeroInMessage }),
  });
});

module.exports = {
  getStock,
  getMessage,
  listMovements,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  updateItem,
  removeItem,
  stockOut,
  saveCount,
  updateSettings,
  sendNow,
  rotateShareToken,
  getPublicStock,
};
