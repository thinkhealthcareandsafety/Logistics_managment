const StockCategory = require('../models/StockCategory');
const StockItem = require('../models/StockItem');
const StockMovement = require('../models/StockMovement');
const StockSettings = require('../models/StockSettings');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { sendWhatsAppText } = require('./whatsapp.service');
const { isZohoActive } = require('./zohoSync.service');

const TIME_ZONE = 'Asia/Kolkata';

/** WhatsApp caps a text message at 4096 characters; stay clear of it. */
const WHATSAPP_CHUNK_LIMIT = 3800;

async function loadStock() {
  const [categories, items, settings] = await Promise.all([
    StockCategory.find().sort({ sortOrder: 1, createdAt: 1 }),
    StockItem.find({ isArchived: false }).sort({ sortOrder: 1, createdAt: 1 }),
    StockSettings.get(),
  ]);
  return { categories, items, settings };
}

// ─────────────────────────── Time helpers (India time) ───────────────────────────

function istClock(date = new Date()) {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
  return { hm, ymd };
}

/** Midnight today in India, as a UTC instant. */
function startOfIstDay(date = new Date()) {
  const { ymd } = istClock(date);
  return new Date(`${ymd}T00:00:00+05:30`);
}

function istParts(date) {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return { day, time };
}

// ─────────────────────────── The WhatsApp message ───────────────────────────

/** Expiry dates are calendar dates stored at UTC midnight - format them in UTC. */
function formatExpiry(date) {
  const [y, m, d] = new Date(date).toISOString().slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

function listPrefix(style, index) {
  if (style === 'numbers') return `${index + 1}. `;
  if (style === 'letters') return `${String.fromCharCode(65 + (index % 26))}. `;
  return '';
}

/** Name plus size - works on documents and plain objects alike. */
function displayName(item) {
  return item.size ? `${item.name} ${item.size}` : item.name;
}

/** "48 (8 old + 40 new)" for split lines, plain "47" otherwise. */
function quantityText(item) {
  if (item.oldQuantity == null) return String(item.quantity);
  return `${item.quantity} (${item.oldQuantity} old + ${item.quantity - item.oldQuantity} new)`;
}

/**
 * Renders stock in the format the logistics team already posts by hand, so the group
 * sees nothing new except that the totals are now always right:
 *
 *   *STOCK AVAILABLE  28/09  12:55 PM*
 *
 *   *AED - 114*
 *   FRX - 27
 *   HS1 - 53 (3 without pad)
 *
 *   *AED Battery - 93*
 *   1. Philips Batteries - 48 (8 old + 40 new)
 *
 *   *Stock Out*
 *   1. HS1 Pads - 2 to RBS Industrial
 *
 * WhatsApp renders *text* as bold. Category totals are computed, never typed. The
 * manager's internal notes are never included.
 */
function buildStockMessage({ categories, items, stockOut = [], hideZero = false, at = new Date() }) {
  const { day, time } = istParts(at);
  const lines = [`*STOCK AVAILABLE  ${day}  ${time}*`];

  for (const category of categories) {
    const all = items.filter((i) => String(i.categoryId) === String(category._id));
    if (all.length === 0) continue;
    const shown = hideZero ? all.filter((i) => i.quantity > 0) : all;
    const total = all.reduce((sum, i) => sum + i.quantity, 0);

    lines.push('', `*${category.name} - ${total}*`);
    shown.forEach((item, idx) => {
      const extras = [];
      if (item.note) extras.push(item.note);
      if (item.expiryDates?.length) extras.push(`exp ${item.expiryDates.map(formatExpiry).join(', ')}`);
      lines.push(
        `${listPrefix(category.listStyle, idx)}${displayName(item)} - ${quantityText(item)}${extras.map((e) => ` (${e})`).join('')}`
      );
    });
  }

  if (stockOut.length > 0) {
    lines.push('', '*Stock Out*');
    stockOut.forEach((m, idx) => {
      lines.push(`${idx + 1}. ${m.itemName} - ${Math.abs(m.change)}${m.customer ? ` to ${m.customer}` : ''}`);
    });
  }

  if (lines.length === 1) lines.push('', 'No stock items set up yet.');
  return lines.join('\n');
}

/** Today's outgoing stock (stock-outs, shipment deductions, Zoho sales), oldest first. */
async function stockOutToday(at = new Date()) {
  return StockMovement.find({
    $or: [{ reason: { $in: ['dispatch', 'shipment'] } }, { reason: 'zoho', change: { $lt: 0 } }],
    createdAt: { $gte: startOfIstDay(at) },
  }).sort({ createdAt: 1 });
}

/** While Zoho Books is connected, a linked line's number belongs to Zoho. */
async function assertNotZohoManaged(items) {
  const linked = items.filter((i) => i.zohoItemId);
  if (linked.length && (await isZohoActive())) {
    const names = linked.slice(0, 3).map(displayName).join(', ');
    throw new ApiError(
      409,
      `${names}${linked.length > 3 ? ` and ${linked.length - 3} more` : ''} ${linked.length === 1 ? 'is' : 'are'} synced from Zoho Books - record the purchase, sale or adjustment in Zoho and it updates here`
    );
  }
}

async function currentMessage(at = new Date()) {
  const [{ categories, items, settings }, stockOut] = await Promise.all([loadStock(), stockOutToday(at)]);
  return buildStockMessage({ categories, items, stockOut, hideZero: settings.hideZeroInMessage, at });
}

/**
 * Splits a long update into WhatsApp-sized messages at category boundaries (blank
 * lines), so no category is ever cut in half. A single oversized category falls back
 * to splitting at line breaks.
 */
function splitForWhatsApp(text, limit = WHATSAPP_CHUNK_LIMIT) {
  if (text.length <= limit) return [text];
  const blocks = text.split('\n\n');
  const chunks = [];
  let current = '';
  const push = () => {
    if (current) chunks.push(current);
    current = '';
  };
  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    push();
    if (block.length <= limit) {
      current = block;
      continue;
    }
    for (const line of block.split('\n')) {
      const next = current ? `${current}\n${line}` : line;
      if (next.length > limit) push();
      current = current ? `${current}\n${line}` : line;
    }
  }
  push();
  return chunks.length > 1 ? chunks.map((c, i) => `${c}\n\n_(${i + 1}/${chunks.length})_`) : chunks;
}

// ─────────────────────────── Counting and stock out ───────────────────────────

async function userName(userId) {
  if (!userId) return '';
  const user = await User.findById(userId).select('name');
  return user?.name || '';
}

function isCount(n) {
  return Number.isInteger(n) && n >= 0;
}

/**
 * Applies a stock count: absolute quantities for any number of lines, saved together,
 * one movement per line that actually changed. Split lines send `oldQuantity` too.
 * Mirrors how the count really happens - walk the shelf, then publish once.
 */
async function applyCount({ changes, note = '', userId }) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new ApiError(400, 'Nothing to save - no quantities changed');
  }
  for (const c of changes) {
    if (!isCount(c.quantity) || (c.oldQuantity != null && !isCount(c.oldQuantity))) {
      throw new ApiError(400, 'Quantities must be whole numbers, 0 or more');
    }
    if (c.oldQuantity != null && c.oldQuantity > c.quantity) {
      throw new ApiError(400, 'Old stock cannot be more than the total');
    }
  }

  const items = await StockItem.find({ _id: { $in: changes.map((c) => c.itemId) }, isArchived: false });
  if (items.length !== changes.length) throw new ApiError(404, 'One or more stock items no longer exist');
  await assertNotZohoManaged(items);

  const name = await userName(userId);
  const movements = [];
  const touched = [];
  for (const item of items) {
    const c = changes.find((x) => String(x.itemId) === String(item._id));
    const split = item.oldQuantity != null;
    const nextOld = split ? (c.oldQuantity ?? item.oldQuantity) : null;
    const oldChanged = split && nextOld !== item.oldQuantity;
    if (c.quantity === item.quantity && !oldChanged) continue;

    const detail = oldChanged
      ? `old ${item.oldQuantity} → ${nextOld}, new ${item.quantity - item.oldQuantity} → ${c.quantity - nextOld}`
      : '';
    movements.push({
      itemId: item._id,
      itemName: displayName(item),
      change: c.quantity - item.quantity,
      quantityAfter: c.quantity,
      reason: 'count',
      note: [detail, String(note).trim()].filter(Boolean).join(' · ').slice(0, 300),
      userId,
      userName: name,
    });
    item.quantity = c.quantity;
    if (split) item.oldQuantity = nextOld;
    touched.push(item);
  }

  await Promise.all(touched.map((i) => i.save()));
  if (movements.length) await StockMovement.insertMany(movements);

  const settings = await StockSettings.get();
  settings.lastCountAt = new Date();
  settings.lastCountBy = name;
  await settings.save();

  return { updated: movements.length };
}

/** "Stock out": goods leaving to a customer, recorded by hand. */
async function recordStockOut({ itemId, quantity, customer = '', note = '', userId }) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError(400, 'Enter how many went out');
  const item = await StockItem.findOne({ _id: itemId, isArchived: false });
  if (!item) throw new ApiError(404, 'Stock item not found');
  await assertNotZohoManaged([item]);
  if (quantity > item.quantity) {
    throw new ApiError(400, `Only ${item.quantity} ${displayName(item)} in stock - recount the line if that's wrong`);
  }

  item.takeOut(quantity);
  await item.save();
  const movement = await StockMovement.create({
    itemId: item._id,
    itemName: displayName(item),
    change: -quantity,
    quantityAfter: item.quantity,
    reason: 'dispatch',
    customer: String(customer).trim(),
    note: String(note).trim().slice(0, 300),
    userId,
    userName: await userName(userId),
  });
  return { item, movement };
}

/**
 * Called when a shipment is booked (manual, CSV or ingest). If its product code
 * matches a stock line, the shipped quantity comes off automatically - old stock
 * first. Never throws: stock bookkeeping must not be able to block a shipment from
 * being tracked.
 */
async function deductForShipment(shipment, userId) {
  try {
    const code = String(shipment.productDetails?.sku || '').trim().toUpperCase();
    const qty = Number(shipment.productDetails?.quantity) || 0;
    if (!code || qty <= 0) return null;

    const item = await StockItem.findOne({ productCode: code, isArchived: false });
    if (!item) return null;
    // The sale's invoice in Zoho Books takes it off; deducting here too would count it twice.
    if (item.zohoItemId && (await isZohoActive())) return null;

    const before = item.quantity;
    const taken = item.takeOut(qty);
    await item.save();

    await StockMovement.create({
      itemId: item._id,
      itemName: displayName(item),
      change: -taken,
      quantityAfter: item.quantity,
      reason: 'shipment',
      note: taken < qty ? `Shipped ${qty} but only ${before} were in stock - recount this line` : '',
      customer: shipment.customerInfo?.name || '',
      shipmentId: shipment._id,
      trackingNumber: shipment.trackingNumber,
      userId,
      userName: await userName(userId),
    });
    return item;
  } catch (err) {
    logger.error(`Stock deduction failed for ${shipment.trackingNumber}: ${err.message}`);
    return null;
  }
}

// ─────────────────────────── Broadcasting ───────────────────────────

/** Sends the current stock message to every configured recipient, split to fit WhatsApp. */
async function broadcastStock({ recipients } = {}) {
  const settings = await StockSettings.get();
  const to = (recipients || settings.broadcast.recipients).filter(Boolean);
  if (to.length === 0) throw new ApiError(400, 'Add at least one WhatsApp number to send to');

  const parts = splitForWhatsApp(await currentMessage());
  const results = await Promise.all(
    to.map(async (number) => {
      // Parts go in order, one at a time, so they arrive in sequence.
      for (const part of parts) {
        const ok = await sendWhatsAppText({ to: number, text: part, context: 'stockBroadcast' });
        if (!ok) return false;
      }
      return true;
    })
  );
  const sent = results.filter(Boolean).length;

  if (sent > 0) {
    settings.broadcast.lastSentAt = new Date();
    await settings.save();
  }
  return { sent, failed: to.length - sent, total: to.length, messagesPerRecipient: parts.length };
}

/** Runs every minute; sends the daily update once, at the configured India time. */
async function runScheduledBroadcast(now = new Date()) {
  const settings = await StockSettings.findOne({ key: 'default' });
  if (!settings?.broadcast.enabled || settings.broadcast.recipients.length === 0) return;

  const { hm, ymd } = istClock(now);
  if (hm !== settings.broadcast.time) return;
  if (settings.broadcast.lastSentAt && istClock(settings.broadcast.lastSentAt).ymd === ymd) return;

  const result = await broadcastStock();
  logger.info(`Scheduled stock update: sent to ${result.sent}/${result.total} recipient(s)`);
}

module.exports = {
  loadStock,
  buildStockMessage,
  stockOutToday,
  currentMessage,
  splitForWhatsApp,
  applyCount,
  recordStockOut,
  deductForShipment,
  broadcastStock,
  runScheduledBroadcast,
};
