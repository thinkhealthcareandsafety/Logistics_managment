const ZohoConnection = require('../models/ZohoConnection');
const ZohoInvoice = require('../models/ZohoInvoice');
const Shipment = require('../models/Shipment');
const zoho = require('./zoho.client');
const logger = require('../config/logger');

/**
 * Keeps a copy of every Zoho Books invoice's lines. Reorder predictions read buying
 * patterns from it and courier analytics read freight from it. Zoho's API is free but
 * has a daily call limit the stock sync also uses, so reading the history is spread
 * out: at most ZOHO_INVOICE_READS_PER_DAY (100) a day, each invoice read once.
 */

/** Lines that are a freight charge, not goods. */
const FREIGHT_LINE = /\b(freight|courier|transport(ation)?|shipping|delivery charges?|cartage|logistics? charges?)\b/i;
const HISTORY_MONTHS = 18;
const GAP_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const day = (d) => new Date(d).toISOString().slice(0, 10);

/** Freight on an invoice: its shipping charge plus any freight-type lines. */
function freightOf(inv) {
  const lines = (inv.line_items || []).filter((l) => FREIGHT_LINE.test(`${l.name || ''} ${l.description || ''}`));
  const total = money(inv.shipping_charge) + lines.reduce((sum, l) => sum + money(l.item_total ?? money(l.rate) * money(l.quantity)), 0);
  return Math.round(total * 100) / 100;
}

/** Stores a full invoice (from Zoho's invoice detail) and passes its freight to the matched shipment. */
async function cacheInvoice(inv) {
  if (!inv?.invoice_id || !inv.date) return null;
  const doc = {
    invoiceId: String(inv.invoice_id),
    number: inv.invoice_number || '',
    date: new Date(inv.date),
    status: inv.status || '',
    customerId: String(inv.customer_id || ''),
    customerName: inv.customer_name || '',
    total: money(inv.total),
    shippingCharge: money(inv.shipping_charge),
    freight: freightOf(inv),
    lines: (inv.line_items || []).map((l) => ({
      itemId: String(l.item_id || ''),
      name: String(l.name || l.description || '').slice(0, 200),
      sku: String(l.sku || '').slice(0, 80),
      quantity: money(l.quantity),
      rate: money(l.rate),
      freight: FREIGHT_LINE.test(`${l.name || ''} ${l.description || ''}`),
    })),
  };
  await ZohoInvoice.updateOne({ invoiceId: doc.invoiceId }, { $set: doc }, { upsert: true });
  if (doc.freight > 0) {
    await Shipment.updateMany({ 'zohoInvoice.invoiceId': doc.invoiceId, freightAmount: null }, { $set: { freightAmount: doc.freight } });
  }
  return doc;
}

const progress = { listed: 0, cached: 0, lastRunAt: null, lastError: '' };
let running = null;

/** Reads invoices not yet kept, oldest first, until today's allowance runs out. */
function backfillInvoices() {
  if (running) return running;
  running = (async () => {
    const conn = await ZohoConnection.get();
    if (!conn.isConnected) return progress;
    const from = new Date();
    from.setMonth(from.getMonth() - HISTORY_MONTHS);
    const list = (await zoho.listInvoices(conn, { from: day(from), to: day(new Date()) })).filter(
      (i) => !['void', 'draft'].includes(String(i.status || '').toLowerCase())
    );
    const have = new Set(await ZohoInvoice.distinct('invoiceId'));
    const missing = list.filter((i) => !have.has(String(i.invoice_id))).reverse(); // oldest first
    Object.assign(progress, { listed: list.length, cached: have.size, lastRunAt: new Date(), lastError: '' });
    const budget = require('./apiBudget');
    let read = 0;
    for (const inv of missing) {
      try {
        await budget.take('zohoInvoices', { background: true });
      } catch {
        break; // today's allowance is used - carry on tomorrow
      }
      try {
        await cacheInvoice(await zoho.getInvoice(conn, inv.invoice_id));
        read += 1;
        progress.cached += 1;
      } catch (err) {
        progress.lastError = err.message;
        if (err.statusCode === 429) break; // Zoho's own limit - stop for today
      }
      await sleep(GAP_MS);
    }
    if (read) logger.info(`Invoice history: read ${read} invoice(s), ${progress.cached}/${progress.listed} kept`);
    return progress;
  })()
    .catch((err) => {
      progress.lastError = err.message;
      logger.warn(`Invoice history read failed: ${err.message}`);
      return progress;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

async function invoiceHistoryStatus() {
  return { ...progress, cached: await ZohoInvoice.countDocuments(), running: Boolean(running) };
}

module.exports = { cacheInvoice, freightOf, backfillInvoices, invoiceHistoryStatus, FREIGHT_LINE };
