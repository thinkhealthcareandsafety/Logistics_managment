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
const env = require('../config/env');
const { isWhatsAppConfigured, whatsAppStatus } = require('../services/whatsapp.service');
const { LIST_STYLES } = require('../models/StockCategory');
const { buildStockMessage, splitForWhatsApp, broadcastStock } = require('../services/stock.service');

/** The person's own name from their device (see actorName in app.js), else the account's. */
async function whoDidIt(req) {
  if (req.actorName) return req.actorName;
  const user = await User.findById(req.userId).select('name');
  return user?.name || '';
}

function assertId(id, what = 'item') {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, `Stock ${what} not found`);
}

function settingsView(settings, manual = false) {
  return {
    manual,
    shareToken: settings.shareToken,
    hideZeroInMessage: settings.hideZeroInMessage,
    broadcast: settings.broadcast,
    lastCountAt: settings.lastCountAt,
    lastCountBy: settings.lastCountBy,
    whatsappConfigured: isWhatsAppConfigured(),
    whatsappPaused: settings.whatsappPaused,
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

/**
 * The handlers for one stock ledger (main, or the manual stock kept by hand). Both run
 * the same code against their own collections; Zoho, photos and broadcasting stay
 * with the main stock.
 */
function stockHandlers({ Category, Item, Movement, Settings, ledger, manual = false }) {
  const { loadStock, stockOutToday, stockInToday, currentMessage, applyCount, recordStockOut } = ledger;

  async function assertCodeFree(productCode, exceptId) {
    if (!productCode) return;
    const clash = await Item.findOne({ productCode, isArchived: false, _id: { $ne: exceptId } });
    if (clash) throw new ApiError(409, `Product code ${productCode} is already linked to "${clash.displayName}"`);
  }

  // ─────────────────────────── Read ───────────────────────────

  const getStock = asyncHandler(async (req, res) => {
    const { categories, items, settings } = await loadStock();
    res.json({ categories, items, settings: settingsView(settings, manual) });
  });

  const getMessage = asyncHandler(async (req, res) => {
    const text = await currentMessage();
    // How many WhatsApp messages the automatic send would need for this text.
    res.json({ text, parts: splitForWhatsApp(text).length, generatedAt: new Date() });
  });

  const listMovements = asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 200);
    const filter =
      req.query.direction === 'in'
        ? { change: { $gt: 0 }, reason: { $in: ['zoho', 'count', 'created'] }, note: { $not: /^(Corrected|Linked)/ } }
        : req.query.direction === 'out'
          ? { change: { $lt: 0 }, reason: { $in: ['dispatch', 'shipment', 'zoho', 'count'] }, note: { $not: /^(Corrected|Linked)/ } }
          : {};
    const movements = await Movement.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ movements });
  });

  // ─────────────────────────── Categories ───────────────────────────

  const createCategory = asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new ApiError(400, 'Give the category a name');
    const last = await Category.findOne().sort({ sortOrder: -1 });
    const category = await Category.create({
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
    const category = await Category.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!category) throw new ApiError(404, 'Stock category not found');
    res.json({ category });
  });

  const deleteCategory = asyncHandler(async (req, res) => {
    assertId(req.params.id, 'category');
    const inUse = await Item.countDocuments({ categoryId: req.params.id, isArchived: false });
    if (inUse > 0) throw new ApiError(409, 'Move or remove the items in this category first');
    await Category.findByIdAndDelete(req.params.id);
    res.status(204).send();
  });

  // ─────────────────────────── Items ───────────────────────────

  const createItem = asyncHandler(async (req, res) => {
    const fields = itemFields(req.body);
    if (!fields.name) throw new ApiError(400, 'Give the item a name');
    if (!fields.categoryId) throw new ApiError(400, 'Pick a category');
    if (!(await Category.exists({ _id: fields.categoryId }))) throw new ApiError(404, 'Stock category not found');
    await assertCodeFree(fields.productCode);

    const quantity = Number(req.body.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity < 0) throw new ApiError(400, 'Quantity must be a whole number, 0 or more');
    // Split into old + new by default; a new line's stock is all new. splitOldNew:false opts out.
    const oldQuantity = req.body.splitOldNew === false ? null : req.body.oldQuantity == null ? 0 : Number(req.body.oldQuantity);
    if (oldQuantity !== null && (!Number.isInteger(oldQuantity) || oldQuantity < 0 || oldQuantity > quantity)) {
      throw new ApiError(400, 'Old stock must be a whole number no more than the total');
    }

    const last = await Item.findOne({ categoryId: fields.categoryId }).sort({ sortOrder: -1 });
    const item = await Item.create({ ...fields, quantity, oldQuantity, sortOrder: (last?.sortOrder ?? -1) + 1 });

    await Movement.create({
      itemId: item._id,
      itemName: item.displayName,
      change: quantity,
      quantityAfter: quantity,
      // A new line's stock: whatever was entered as old, the rest new.
      ...(oldQuantity != null ? { oldChange: oldQuantity, newChange: quantity - oldQuantity } : {}),
      reason: 'created',
      userId: req.userId,
      userName: await whoDidIt(req),
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
    if (fields.categoryId && !(await Category.exists({ _id: fields.categoryId }))) {
      throw new ApiError(404, 'Stock category not found');
    }

    const item = await Item.findOne({ _id: req.params.id, isArchived: false });
    if (!item) throw new ApiError(404, 'Stock item not found');
    const before = { name: item.displayName, categoryId: String(item.categoryId), note: item.note, lowStockAt: item.lowStockAt, productCode: item.productCode };
    Object.assign(item, fields);
    if (req.body.splitOldNew === true && item.oldQuantity == null) item.oldQuantity = item.quantity;
    if (req.body.splitOldNew === false) item.oldQuantity = null;
    await item.save();
    // Logged with who did it, so the history shows renames and moves - not just counts.
    const changed = [
      before.name !== item.displayName && `renamed from “${before.name}”`,
      before.categoryId !== String(item.categoryId) && 'moved to another category',
      before.lowStockAt !== item.lowStockAt && `low-stock level ${item.lowStockAt ?? 'removed'}`,
      before.productCode !== item.productCode && `product code ${item.productCode || 'removed'}`,
      before.note !== item.note && 'note changed',
    ].filter(Boolean);
    if (changed.length) {
      await Movement.create({
        itemId: item._id,
        itemName: item.displayName,
        change: 0,
        quantityAfter: item.quantity,
        reason: 'edited',
        note: changed.join(' · ').slice(0, 300),
        userId: req.userId,
        userName: await whoDidIt(req),
      });
    }
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
      actor: req.actorName,
    });
    res.status(201).json({ item, movement });
  });

  /** Archived, not deleted: movements keep pointing at a real record. */
  const removeItem = asyncHandler(async (req, res) => {
    assertId(req.params.id);
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { $set: { isArchived: true, productCode: '' } },
      { new: true }
    );
    if (!item) throw new ApiError(404, 'Stock item not found');
    await Movement.create({
      itemId: item._id,
      itemName: item.displayName,
      change: 0,
      quantityAfter: item.quantity,
      reason: 'removed',
      note: `Removed from the sheet (had ${item.quantity})`,
      userId: req.userId,
      userName: await whoDidIt(req),
    });
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
    const result = await applyCount({ changes, note: req.body.note, userId: req.userId, actor: req.actorName });
    const { categories, items, settings } = await loadStock();
    res.json({ ...result, categories, items, settings: settingsView(settings, manual) });
  });

  // ─────────────────────────── Publishing ───────────────────────────

  const updateSettings = asyncHandler(async (req, res) => {
    const settings = await Settings.get();
    const { hideZeroInMessage, whatsappPaused, broadcast = {} } = req.body;

    if (hideZeroInMessage !== undefined) settings.hideZeroInMessage = !!hideZeroInMessage;
    if (whatsappPaused !== undefined) settings.whatsappPaused = !!whatsappPaused;
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
    res.json({ settings: settingsView(settings, manual) });
  });

  const rotateShareToken = asyncHandler(async (req, res) => {
    const settings = await Settings.get();
    settings.shareToken = newShareToken();
    await settings.save();
    res.json({ settings: settingsView(settings, manual) });
  });

  // ─────────────────────────── Public (secret link) ───────────────────────────

  /**
   * Read-only stock for anyone holding the link - meant to be pinned in the WhatsApp
   * group so the number is always current without anyone posting. No product codes,
   * no history, no names.
   */
  const getPublicStock = asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ key: 'default' });
    const token = Buffer.from(String(req.params.token || ''));
    const expected = Buffer.from(settings?.shareToken || '');
    // Constant-time compare so the token can't be guessed a character at a time.
    if (!settings || token.length !== expected.length || !crypto.timingSafeEqual(token, expected)) {
      throw new ApiError(404, 'This stock link is invalid or has been replaced');
    }
    const [{ categories, items }, out, inToday] = await Promise.all([loadStock(), stockOutToday(), stockInToday()]);
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
      message: buildStockMessage({ categories, items, stockOut: out, stockIn: inToday, hideZero: settings.hideZeroInMessage }),
    });
  });

  return {
    getStock,
    getMessage,
    listMovements,
    createCategory,
    updateCategory,
    deleteCategory,
    createItem,
    updateItem,
    stockOut,
    removeItem,
    saveCount,
    updateSettings,
    rotateShareToken,
    getPublicStock,
  };
}

const stockService = require('../services/stock.service');
const mainHandlers = stockHandlers({
  Category: StockCategory,
  Item: StockItem,
  Movement: StockMovement,
  Settings: StockSettings,
  ledger: stockService,
});
const {
  getStock,
  getMessage,
  listMovements,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  updateItem,
  stockOut,
  removeItem,
  saveCount,
  updateSettings,
  rotateShareToken,
  getPublicStock,
} = mainHandlers;
/** The hand-kept stock: same handlers on the manual collections (see models/ManualStock). */
const manualHandlers = stockHandlers({ ...require('../models/ManualStock'), ledger: stockService.manualLedger, manual: true });

const sendNow = asyncHandler(async (req, res) => {
  if (!isWhatsAppConfigured()) {
    throw new ApiError(
      503,
      'WhatsApp sending isn’t connected yet - add ANANTYA_API_KEY on the server, or use "Open in WhatsApp"'
    );
  }
  res.json(await broadcastStock());
});

const getWhatsAppStatus = asyncHandler(async (req, res) => {
  res.json({ whatsapp: await whatsAppStatus() });
});


// ─────────────────────────── Product media ───────────────────────────

const { syncProductMedia, mediaStatus } = require('../services/productMedia.service');
const { findWebImages, webImagesStatus } = require('../services/webImages.service');

/** Re-reads buyaedindia.com and re-matches photos, videos and brochures (runs in the background). */
/** buyaedindia.com first, then web photos for whatever is still without one. */
const refreshMedia = asyncHandler(async (req, res) => {
  syncProductMedia()
    .catch(() => {})
    .then(() => findWebImages())
    .catch(() => {});
  res.status(202).json({ media: mediaStatus() });
});

const getMediaStatus = asyncHandler(async (req, res) => {
  // Which variable the Gemini key came from (names only, never the value) - for setup checks.
  const gemini = { keyFrom: env.gemini.keyName || null, variables: Object.keys(process.env).filter((k) => /gemini|genai/i.test(k)) };
  res.json({ media: mediaStatus(), web: await webImagesStatus(), gemini });
});

const searchWebImages = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.body?.limit) || 150, 1), 500);
  // redoExtrasSince: search videos/brochures again for lines done since then (e.g. after a
  // prompt fix). Only web-found media is cleared - lines matched to buyaedindia keep theirs.
  const since = req.body?.redoExtrasSince ? new Date(req.body.redoExtrasSince) : null;
  if (since && !Number.isNaN(since.getTime())) {
    const filter = { 'media.extrasSearchedAt': { $gte: since } };
    await StockItem.updateMany({ ...filter, 'media.sourceUrl': { $not: /buyaedindia/i } }, { $set: { 'media.videos': [], 'media.brochures': [] } });
    await StockItem.updateMany(filter, { $set: { 'media.extrasSearchedAt': null } });
  }
  findWebImages({ limit }).catch(() => {});
  res.status(202).json({ web: await webImagesStatus() });
});

/**
 * Media matched somewhere that can reach buyaedindia.com (the store blocks this
 * server's address). Accepts only http(s) links and existing stock lines.
 */
const importMedia = asyncHandler(async (req, res) => {
  const matches = Array.isArray(req.body.matches) ? req.body.matches.slice(0, 2000) : [];
  const url = (u) => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 2000;
  let applied = 0;
  for (const m of matches) {
    if (!mongoose.isValidObjectId(m.itemId) || !m.media) continue;
    const media = {
      images: (m.media.images || []).filter(url).slice(0, 8),
      videos: (m.media.videos || []).filter(url).slice(0, 5),
      brochures: (m.media.brochures || []).filter((b) => b && url(b.url)).slice(0, 5).map((b) => ({ url: b.url, title: String(b.title || 'Brochure').slice(0, 80) })),
      sourceUrl: url(m.media.sourceUrl) ? m.media.sourceUrl : '',
      sourceTitle: String(m.media.sourceTitle || '').slice(0, 200),
      matchedAt: new Date(),
    };
    const r = await StockItem.updateOne({ _id: m.itemId, isArchived: false }, { $set: { media } });
    applied += r.modifiedCount;
  }
  res.json({ applied, received: matches.length });
});

/** Zoho Books' own photo for a line, fetched with the stored Zoho login and cached. */
const zohoImageCache = new Map();
const zohoImage = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const item = await StockItem.findById(req.params.id).select('zohoItemId zohoHasImage');
  if (!item?.zohoItemId || !item.zohoHasImage) throw new ApiError(404, 'No Zoho photo for this item');
  let hit = zohoImageCache.get(item.zohoItemId);
  if (!hit || Date.now() - hit.at > 24 * 60 * 60 * 1000) {
    const ZohoConnection = require('../models/ZohoConnection');
    const conn = await ZohoConnection.get();
    if (!conn.isConnected) throw new ApiError(404, 'Zoho Books is not connected');
    const img = await require('../services/zoho.client').getItemImage(conn, item.zohoItemId);
    hit = { ...img, at: Date.now() };
    zohoImageCache.set(item.zohoItemId, hit);
  }
  res.set('Content-Type', hit.type);
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(hit.data);
});

// ─────────────────────────── Duplicates ───────────────────────────

const dup = require('../services/duplicateFinder.service');
const { syncNow, isZohoActive } = require('../services/zohoSync.service');
const resync = async () => {
  if (await isZohoActive().catch(() => false)) await syncNow({ reason: 'merge' }).catch(() => {});
};

const mergeItems = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const otherIds = (req.body.otherIds || []).filter((id) => mongoose.isValidObjectId(id));
  const item = await dup.mergeLines(req.params.id, otherIds);
  await resync();
  res.json({ item: await StockItem.findById(item._id) });
});

const unmergeItem = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  await dup.unmergeAlias(req.params.id, String(req.body.zohoItemId || ''));
  await resync();
  res.json({ item: await StockItem.findById(req.params.id) });
});

module.exports = {
  manualHandlers,
  mergeItems,
  unmergeItem,
  importMedia,
  refreshMedia,
  getMediaStatus,
  searchWebImages,
  zohoImage,
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
  getWhatsAppStatus,
  rotateShareToken,
  getPublicStock,
};
