const ZohoConnection = require('../models/ZohoConnection');
const StockCategory = require('../models/StockCategory');
const StockItem = require('../models/StockItem');
const StockMovement = require('../models/StockMovement');
const logger = require('../config/logger');
const zoho = require('./zoho.client');

/**
 * Zoho Books -> stock. Zoho is the source of truth for every linked line: each sync
 * compares Zoho's stock on hand with the line here and records the difference as a
 * movement, so a bill (purchase) shows up as stock in and an invoice (sale) as stock
 * out - with the bill/invoice number when Zoho's webhook told us which one it was.
 *
 * Linking is automatic: SKU = product code first, then an exact name match. A Zoho
 * item with stock and no match becomes a new line in "From Zoho Books" (if enabled).
 * Lines that aren't in Zoho at all stay manual, exactly as before.
 */

const AUTO_CATEGORY = 'From Zoho Books';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9]+/g, '');

const lineName = (i) => (i.size ? `${i.name} ${i.size}` : i.name);

/** Zoho can hold fractional or negative stock; the shelf here can't. */
const shelfCount = (n) => Math.max(0, Math.floor(Number(n) || 0));

/**
 * The stock figure Zoho actually sent for an item, or null when it sent none. A missing
 * figure must never be read as "0" - that would wipe real shelf counts.
 */
function stockFigure(z) {
  const num = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  for (const key of ['stock_on_hand', 'location_stock_on_hand', 'actual_available_stock', 'available_stock']) {
    if (num(z[key]) !== null) return num(z[key]);
  }
  // Zoho Books with Locations keeps stock per warehouse: the item's stock is their sum.
  if (Array.isArray(z.locations)) {
    const figures = z.locations
      .filter((l) => !l.status || l.status === 'active')
      .map((l) => num(l.location_stock_on_hand))
      .filter((n) => n !== null);
    if (figures.length) return figures.reduce((a, b) => a + b, 0);
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Full item reads stay under Zoho's 100-requests-a-minute limit. */
const DETAIL_GAP_MS = 750;
const DETAIL_EVERY_MS = (Number(process.env.ZOHO_DETAIL_SYNC_HOURS) || 6) * 60 * 60 * 1000;

/**
 * Item ids whose stock to read in full on the next sync, because a bill/invoice
 * webhook named them - so a purchase or sale shows up without waiting for the
 * next full read.
 */
const pendingDetailIds = new Set();

/**
 * When the item list carries no stock (Zoho Books with Locations), fill each item's
 * figure from somewhere that does. Tries, in order: the list filtered to the primary
 * location (cheap), then reading items one by one (slow, so only every few hours,
 * on "Sync now", or for the items a webhook just named). Returns the items it could
 * put a figure on, and where the figures came from.
 */
async function fillStockFigures(conn, zohoItems, { reason }) {
  // Which location is primary - from one full item read, remembered afterwards.
  if (!conn.zohoPrimaryLocationId) {
    let detail;
    try {
      const full = await zoho.getItem(conn, zohoItems[0].item_id);
      const locs = Array.isArray(full.locations) ? full.locations : [];
      const primary = locs.find((l) => l.is_primary_location || l.is_primary) || locs[0];
      conn.zohoPrimaryLocationId = primary ? String(primary.location_id) : '';
      detail = Object.fromEntries(Object.entries(full).filter(([k]) => /stock|location/i.test(k)));
    } catch (err) {
      detail = { error: err.message };
    }
    conn.lastSyncSample = [{ ...conn.lastSyncSample[0], detail }, ...conn.lastSyncSample.slice(1)];
  }

  // 1) The list, filtered to the primary location.
  if (conn.zohoPrimaryLocationId && conn.zohoStockSource !== 'detail') {
    const byLocation = (await zoho.listItems(conn, { location_id: conn.zohoPrimaryLocationId })).filter(isTracked);
    if (byLocation.some((z) => stockFigure(z) !== null)) {
      conn.zohoStockSource = 'location-list';
      return byLocation;
    }
  }

  // 2) One by one: all items every few hours (or when asked), else just the ones a
  // webhook named plus whatever figures the last full read left us.
  conn.zohoStockSource = 'detail';
  const cache = new Map(Object.entries(conn.zohoStockCache || {}));
  const dueFull = reason === 'manual' || reason === 'connected' || !conn.zohoDetailAt || Date.now() - conn.zohoDetailAt.getTime() > DETAIL_EVERY_MS;
  const ids = dueFull ? zohoItems.map((z) => String(z.item_id)) : [...pendingDetailIds].filter((id) => zohoItems.some((z) => String(z.item_id) === id));
  for (const id of ids) {
    try {
      const figure = stockFigure(await zoho.getItem(conn, id));
      if (figure !== null) cache.set(id, figure);
      pendingDetailIds.delete(id);
    } catch (err) {
      if (err.statusCode === 429) break; // over Zoho's limit - finish on the next run
      logger.warn(`Zoho item ${id} read failed: ${err.message}`);
    }
    await sleep(DETAIL_GAP_MS);
  }
  if (dueFull) conn.zohoDetailAt = new Date();
  conn.zohoStockCache = Object.fromEntries(cache);
  conn.markModified('zohoStockCache');
  return zohoItems.filter((z) => cache.has(String(z.item_id))).map((z) => ({ ...z, stock_on_hand: cache.get(String(z.item_id)) }));
}

/** What Zoho sends for a few items - kept with the connection so problems can be diagnosed. */
function sampleOf(items) {
  return items.slice(0, 3).map((z) => {
    const out = {};
    for (const [k, v] of Object.entries(z)) {
      if (['item_id', 'name', 'sku', 'item_type', 'product_type', 'status', 'track_inventory', 'unit'].includes(k) || /stock/i.test(k)) {
        out[k] = v;
      }
    }
    return out;
  });
}

function isTracked(z) {
  if (z.status && z.status !== 'active') return false;
  if (z.is_combo_product) return false;
  if (z.item_type === 'inventory' || z.track_inventory === true) return true;
  const soh = z.stock_on_hand;
  return z.product_type === 'goods' && soh !== '' && soh != null && Number.isFinite(Number(soh));
}

// ─────────────────────── References from Zoho's webhook ───────────────────────

/**
 * itemId -> what caused its next change ("Bill BL-0042 · Medline"), filled by the
 * webhook and used up by the sync that follows. In memory: losing it on a restart
 * only costs the label on a movement, never the stock number.
 */
const pendingRefs = new Map();
const REF_TTL_MS = 30 * 60 * 1000;

const DOCS = [
  ['bill', 'Bill', 'bill_number', 'vendor_name', 'in'],
  ['purchaseorder', 'Purchase order', 'purchaseorder_number', 'vendor_name', 'in'],
  ['vendor_credit', 'Vendor credit', 'vendor_credit_number', 'vendor_name', 'out'],
  ['invoice', 'Invoice', 'invoice_number', 'customer_name', 'out'],
  ['salesorder', 'Sales order', 'salesorder_number', 'customer_name', 'out'],
  ['creditnote', 'Credit note', 'creditnote_number', 'customer_name', 'in'],
  ['inventory_adjustment', 'Stock adjustment', 'reference_number', null, null],
];

/**
 * Reads whatever Zoho's workflow webhook sent (its default entity payload, or custom
 * params) and remembers a label for each item it mentions.
 */
function rememberWebhook(body = {}) {
  let payload = body;
  if (typeof body.JSONString === 'string') {
    try {
      payload = JSON.parse(body.JSONString);
    } catch {
      payload = {};
    }
  }
  for (const [key, label, numberField, partyField] of DOCS) {
    const doc = payload[key];
    if (!doc || typeof doc !== 'object') continue;
    const party = partyField ? String(doc[partyField] || '').trim() : '';
    const text = [`${label} ${doc[numberField] || ''}`.trim(), party].filter(Boolean).join(' · ');
    for (const line of doc.line_items || []) {
      if (line.item_id) {
        pendingRefs.set(String(line.item_id), { note: text, customer: label === 'Invoice' || label === 'Sales order' ? party : '', at: Date.now() });
        pendingDetailIds.add(String(line.item_id));
      }
    }
    return text;
  }
  // Custom params: { reference: "Bill BL-1", item_ids: "1,2" }
  if (payload.reference) {
    const text = String(payload.reference).slice(0, 200);
    String(payload.item_ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((id) => pendingRefs.set(id, { note: text, customer: String(payload.customer || ''), at: Date.now() }));
    return text;
  }
  return '';
}

function takeRef(zohoItemId) {
  const ref = pendingRefs.get(zohoItemId);
  if (!ref) return null;
  pendingRefs.delete(zohoItemId);
  return Date.now() - ref.at < REF_TTL_MS ? ref : null;
}

// ─────────────────────────────── The sync ───────────────────────────────

async function autoCategory() {
  const existing = await StockCategory.findOne({ name: AUTO_CATEGORY });
  if (existing) return existing;
  const last = await StockCategory.findOne().sort({ sortOrder: -1 });
  return StockCategory.create({ name: AUTO_CATEGORY, listStyle: 'plain', sortOrder: (last?.sortOrder ?? -1) + 1 });
}

/** Stock arriving is new stock; stock leaving takes old first (same rule as by hand). */
function applyDelta(item, delta) {
  if (delta > 0) item.quantity += delta;
  else if (delta < 0) item.takeOut(-delta);
}

async function syncOnce(conn, { reason = 'manual' } = {}) {
  const zohoItems = (await zoho.listItems(conn)).filter(isTracked);
  conn.lastSyncSample = sampleOf(zohoItems);
  let withFigure = zohoItems.filter((z) => stockFigure(z) !== null);
  if (zohoItems.length > 0 && withFigure.length === 0) {
    // Zoho Books with Locations leaves stock out of the list - fetch it another way.
    withFigure = await fillStockFigures(conn, zohoItems, { reason });
  } else {
    conn.zohoStockSource = 'list';
  }
  // Safety stop: still no quantities anywhere. Change nothing rather than guess.
  if (zohoItems.length > 0 && withFigure.length === 0) {
    throw new Error(
      `Zoho Books sent no stock quantities for any of its ${zohoItems.length} items, so nothing was changed. The Zoho login used to connect probably can't see stock: give it access to stock in Zoho Books, then Disconnect and Connect again here.`
    );
  }

  const local = await StockItem.find({ isArchived: false });
  const byZohoId = new Map(local.filter((i) => i.zohoItemId).map((i) => [i.zohoItemId, i]));
  const unlinked = local.filter((i) => !i.zohoItemId);
  // Lines someone removed here stay removed - don't recreate them from Zoho.
  const removed = new Set(await StockItem.distinct('zohoItemId', { isArchived: true, zohoItemId: { $ne: '' } }));
  const summary = {
    zohoItems: zohoItems.length,
    linked: 0,
    created: 0,
    stockIn: 0,
    stockOut: 0,
    noFigure: zohoItems.length - withFigure.length,
    held: 0,
    heldNames: [],
  };
  const movements = [];
  let category = null;

  for (const z of withFigure) {
    const zid = String(z.item_id);
    const target = shelfCount(stockFigure(z));
    let item = byZohoId.get(zid);
    let firstLink = false;

    if (!item) {
      // SKU = product code, then exact name; only an unambiguous match links.
      const sku = String(z.sku || '').trim().toUpperCase();
      let candidates = sku ? unlinked.filter((i) => i.productCode && i.productCode === sku) : [];
      if (candidates.length === 0) {
        const n = norm(z.name);
        candidates = unlinked.filter((i) => norm(lineName(i)) === n);
        if (candidates.length === 0) candidates = unlinked.filter((i) => !i.size && norm(i.name) === n);
      }
      // Zoho says none in stock but the shelf here has some: Zoho is the one that's
      // behind. Don't link (and wipe the count) - list it for someone to check.
      if (candidates.length === 1 && target === 0 && candidates[0].quantity > 0) {
        summary.held += 1;
        if (summary.heldNames.length < 20) summary.heldNames.push(lineName(candidates[0]));
        continue;
      }
      if (candidates.length === 1) {
        item = candidates[0];
        unlinked.splice(unlinked.indexOf(item), 1);
        item.zohoItemId = zid;
        firstLink = true;
        summary.linked += 1;
      }
    }

    if (!item) {
      // Every Zoho stock item gets a line - at 0 if Zoho has none - so the sheet mirrors Zoho.
      if (!conn.autoCreate || removed.has(zid)) continue;
      category = category || (await autoCategory());
      const last = await StockItem.findOne({ categoryId: category._id }).sort({ sortOrder: -1 });
      // The SKU becomes the product code (so shipments can name it) unless a line already uses it.
      const sku = String(z.sku || '').trim().toUpperCase().slice(0, 60);
      const skuTaken = sku && (await StockItem.exists({ productCode: sku, isArchived: false }));
      item = await StockItem.create({
        categoryId: category._id,
        name: String(z.name).slice(0, 120),
        quantity: target,
        productCode: skuTaken ? '' : sku,
        zohoItemId: zid,
        zohoItemName: z.name,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      });
      const ref = takeRef(zid);
      movements.push({
        itemId: item._id,
        itemName: lineName(item),
        change: target,
        quantityAfter: target,
        reason: 'zoho',
        note: ref?.note ? `New item from Zoho Books · ${ref.note}` : 'New item from Zoho Books',
        userName: 'Zoho Books',
      });
      summary.created += 1;
      summary.stockIn += target;
      continue;
    }

    item.zohoItemName = z.name;
    const delta = target - item.quantity;
    if (delta !== 0) {
      const ref = takeRef(zid);
      applyDelta(item, delta);
      movements.push({
        itemId: item._id,
        itemName: lineName(item),
        change: delta,
        quantityAfter: item.quantity,
        reason: 'zoho',
        note: firstLink
          ? `Linked to Zoho Books “${z.name}” - quantity now follows Zoho`
          : ref?.note || (delta > 0 ? 'Stock in recorded in Zoho Books' : 'Stock out recorded in Zoho Books'),
        customer: delta < 0 ? ref?.customer || '' : '',
        userName: 'Zoho Books',
      });
      if (delta > 0) summary.stockIn += delta;
      else summary.stockOut += -delta;
    } else if (firstLink) {
      movements.push({
        itemId: item._id,
        itemName: lineName(item),
        change: 0,
        quantityAfter: item.quantity,
        reason: 'zoho',
        note: `Linked to Zoho Books “${z.name}” - counts already matched`,
        userName: 'Zoho Books',
      });
    }
    if (item.isModified()) await item.save();
  }

  if (movements.length) await StockMovement.insertMany(movements);
  return summary;
}

let running = null;
let rerun = false;

/**
 * Runs a sync now. Calls that arrive while one is running don't start a second one -
 * they make it run once more when it finishes (a webhook may have landed mid-sync).
 */
async function syncNow({ reason = 'manual' } = {}) {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    let result;
    do {
      rerun = false;
      const conn = await ZohoConnection.get();
      if (!conn.isConnected) return { skipped: 'not connected' };
      try {
        const summary = await syncOnce(conn, { reason });
        conn.lastSyncAt = new Date();
        conn.lastSyncOk = true;
        conn.lastSyncError = '';
        conn.lastSyncSummary = summary;
        await conn.save();
        if (summary.linked || summary.created || summary.stockIn || summary.stockOut) {
          logger.info(`Zoho sync (${reason}): ${JSON.stringify(summary)}`);
        }
        result = summary;
      } catch (err) {
        conn.lastSyncAt = new Date();
        conn.lastSyncOk = false;
        conn.lastSyncError = err.message;
        await conn.save().catch(() => {});
        logger.warn(`Zoho sync (${reason}) failed: ${err.message}`);
        throw err;
      }
    } while (rerun);
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Zoho fires the webhook as the bill is saved; give its stock figures a moment to settle. */
let webhookTimer = null;
function scheduleWebhookSync(delayMs = 4000) {
  clearTimeout(webhookTimer);
  webhookTimer = setTimeout(() => {
    syncNow({ reason: 'webhook' }).catch(() => {});
  }, delayMs);
}

/** True while Zoho is connected - linked lines are then read-only here. */
async function isZohoActive() {
  const conn = await ZohoConnection.findOne({ key: 'default' }).select('refreshToken organizationId');
  return Boolean(conn?.refreshToken && conn?.organizationId);
}

const isSyncing = () => Boolean(running);

module.exports = { syncNow, isSyncing, scheduleWebhookSync, rememberWebhook, isZohoActive, isTracked, AUTO_CATEGORY };
