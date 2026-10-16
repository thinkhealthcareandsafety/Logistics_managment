const Shipment = require('../models/Shipment');
const ZohoConnection = require('../models/ZohoConnection');
const logger = require('../config/logger');
const zoho = require('./zoho.client');

/**
 * Freight and e-way bills from Zoho Books invoices. Each recent shipment missing them
 * is matched to its invoice - for sure when the invoice's Reference# (or notes) holds
 * the AWB, otherwise when exactly one invoice for the same customer is dated within 3
 * days of shipping. Freight = the invoice's shipping charge. Zoho's public API has no
 * e-way bill section, so any e-way bill number on the invoice is picked up.
 *
 * E-way bills are only needed over ₹50,000, and in Zoho they're usually made after the
 * invoice - so matched invoices over that amount are re-read for a few days until the
 * e-way bill number appears.
 */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const day = (d) => new Date(d).toISOString().slice(0, 10);
const DAY = 24 * 60 * 60 * 1000;
/** GST: goods worth more than this travel with an e-way bill. */
const EWAY_BILL_THRESHOLD = 50000;
const EWB_RECHECK_DAYS = 10;
const money = (v) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : null);

/** Any 12-digit e-way bill number in fields named like e-way bill. */
function findEwayBill(invoice) {
  const hits = [];
  const walk = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const key = `${path}.${k}`.toLowerCase();
      if (v && typeof v === 'object') walk(v, key);
      else if (/e.?way|ewb/.test(key) || /e.?way|ewb/i.test(String(obj.label || obj.field_name || ''))) {
        const m = String(v).replace(/\s+/g, '').match(/\b\d{12}\b/);
        if (m) hits.push(m[0]);
      }
    }
  };
  walk(invoice);
  return hits[0] || '';
}

// Zoho Books allows ~100 API calls a minute and a daily cap, so invoice details are
// fetched a batch at a time; the 15-minute sync works through a backlog in a few runs.
const DETAILS_PER_RUN = 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "2026-01-282, 2026-01-315" -> both numbers, normalised. */
const invoiceNumbers = (s) =>
  String(s?.booking?.invoiceNumber || '')
    .split(/[,&/\\]+|\s+and\s+/i)
    .map(norm)
    .filter((n) => n.length >= 5);

/**
 * Matched invoices over ₹50,000 whose e-way bill wasn't on the invoice yet: read the
 * invoice again (a few a run), for up to EWB_RECHECK_DAYS after shipping.
 */
async function recheckEwayBills(conn, budget) {
  const since = new Date(Date.now() - EWB_RECHECK_DAYS * DAY);
  const due = await Shipment.find({
    'zohoInvoice.invoiceId': { $nin: ['', null] },
    'zohoInvoice.total': { $gt: EWAY_BILL_THRESHOLD },
    'ewayBill.number': { $in: ['', null] },
    $or: [{ shippingDate: { $gte: since } }, { shippingDate: null, createdAt: { $gte: since } }],
  }).limit(budget);
  let found = 0;
  for (const s of due) {
    try {
      const ewb = findEwayBill(await zoho.getInvoice(conn, s.zohoInvoice.invoiceId));
      await sleep(650);
      if (ewb) {
        await Shipment.updateOne({ _id: s._id }, { $set: { 'ewayBill.number': ewb } });
        found += 1;
      }
    } catch (err) {
      if (err.statusCode === 429) break;
    }
  }
  return found;
}

async function matchInvoices() {
  const conn = await ZohoConnection.get();
  if (!conn.isConnected) return { skipped: 'not connected' };
  // E-way bills made after their invoice was matched (cheap: a handful of reads a run).
  const lateEwb = await recheckEwayBills(conn, 20).catch(() => 0);
  const recent = new Date(Date.now() - 60 * DAY);
  // Recent shipments, plus any shipment with an invoice number (the master-sheet history).
  const shipments = await Shipment.find({
    'zohoInvoice.invoiceId': { $in: ['', null] },
    $and: [
      { $or: [{ freightAmount: null }, { 'ewayBill.number': { $in: ['', null] } }] },
      { $or: [{ createdAt: { $gte: recent } }, { 'booking.invoiceNumber': { $nin: ['', null] } }] },
    ],
    invoiceCheckedAt: { $in: [null] },
  }).sort({ shippingDate: -1 });
  if (!shipments.length) return { matched: 0, ewbSet: lateEwb };
  const oldest = shipments.reduce((min, s) => Math.min(min, new Date(s.shippingDate || s.createdAt).getTime()), Date.now());
  let invoices;
  try {
    invoices = await zoho.listInvoices(conn, { from: day(new Date(oldest - 30 * DAY)), to: day(new Date()) });
    conn.invoiceError = '';
  } catch (err) {
    conn.invoiceError = /scope|authori[sz]/i.test(err.message)
      ? 'Zoho needs permission to read invoices - Disconnect and Connect Zoho Books again'
      : /permission/i.test(err.message)
        ? 'The Zoho user who connected can’t view invoices. In Zoho Books → Settings → Users & Roles, give their role “Invoices: View” (or connect as an admin), then press Sync now.'
        : err.message;
    conn.invoiceMatchAt = new Date();
    await conn.save();
    return { error: conn.invoiceError };
  }
  // Shipments matched before invoice totals were kept: fill the total from this list.
  const byId = new Map(invoices.map((i) => [String(i.invoice_id), i]));
  const noTotal = await Shipment.find({ 'zohoInvoice.invoiceId': { $nin: ['', null] }, 'zohoInvoice.total': null }).select('zohoInvoice');
  for (const s of noTotal) {
    const total = money(byId.get(String(s.zohoInvoice.invoiceId))?.total);
    if (total) await Shipment.updateOne({ _id: s._id }, { $set: { 'zohoInvoice.total': total } });
  }

  const byNumber = new Map(invoices.map((i) => [norm(i.invoice_number), i]));
  const findByNumber = (n) => byNumber.get(n) || invoices.find((i) => norm(i.invoice_number).endsWith(n));

  let matched = 0;
  let freightSet = 0;
  let ewbSet = 0;
  let details = 0;
  for (const s of shipments) {
    if (details >= DETAILS_PER_RUN) break;
    const awb = norm(s.trackingNumber);
    // The invoice number from the master sheet is the surest link, then the AWB on the invoice.
    let found = invoiceNumbers(s).map(findByNumber).filter(Boolean);
    let matchedBy = found.length ? 'invoice number' : '';
    if (!found.length) {
      const inv = invoices.find((i) => awb.length >= 6 && [i.reference_number, i.notes].some((f) => norm(f).includes(awb)));
      if (inv) {
        found = [inv];
        matchedBy = 'awb';
      }
    }
    if (!found.length && s.customerInfo?.name) {
      const cust = norm(s.customerInfo.name);
      const shipped = new Date(s.shippingDate || s.createdAt).getTime();
      const candidates = invoices.filter((i) => {
        const c = norm(i.customer_name);
        return c && cust && (c.includes(cust) || cust.includes(c)) && Math.abs(new Date(i.date).getTime() - shipped) <= 3 * DAY;
      });
      if (candidates.length === 1) {
        found = candidates;
        matchedBy = 'customer+date';
      }
    }
    if (!found.length) {
      // Nothing in Zoho for it - don't look again every 15 minutes (recent ones keep trying).
      if (new Date(s.createdAt) < recent) await Shipment.updateOne({ _id: s._id }, { $set: { invoiceCheckedAt: new Date() } });
      continue;
    }
    let freight = 0;
    let ewb = '';
    let total = 0;
    for (const inv of found) {
      let full = inv;
      try {
        details += 1;
        full = await zoho.getInvoice(conn, inv.invoice_id);
        // Kept for buying patterns and freight - read once, never fetched again for that.
        await require('./invoiceCache.service').cacheInvoice(full).catch(() => {});
        await sleep(650);
      } catch {
        // list fields are enough for the number; freight may be missing
      }
      // Shipping charge plus freight / courier / transport lines on the invoice.
      const f = require('./invoiceCache.service').freightOf(full);
      if (f > 0) freight += f;
      total += money(full.total ?? inv.total) || 0;
      ewb = ewb || findEwayBill(full);
    }
    s.zohoInvoice = {
      invoiceId: String(found[0].invoice_id),
      number: found.map((i) => i.invoice_number).filter(Boolean).join(', '),
      matchedBy,
      total: total > 0 ? Math.round(total * 100) / 100 : null,
    };
    if (s.freightAmount == null && freight > 0) {
      s.freightAmount = Math.round(freight * 100) / 100;
      freightSet += 1;
    }
    // Under ₹50,000 no e-way bill is needed - a number Zoho happens to carry isn't shown.
    if (ewb && !s.ewayBill?.number && !(total > 0 && total <= EWAY_BILL_THRESHOLD)) {
      s.ewayBill = { number: ewb, generatedAt: s.ewayBill?.generatedAt || null, validUntil: s.ewayBill?.validUntil || null };
      ewbSet += 1;
    }
    await s.save();
    matched += 1;
  }
  conn.invoiceMatchAt = new Date();
  conn.invoiceMatchSummary = `${matched} matched · ${freightSet} freight · ${ewbSet + lateEwb} e-way bills (of ${shipments.length} shipments, ${invoices.length} invoices)`;
  await conn.save();
  if (matched) logger.info(`Invoice match: ${conn.invoiceMatchSummary}`);
  return { matched, freightSet, ewbSet };
}

module.exports = { matchInvoices, findEwayBill, EWAY_BILL_THRESHOLD };
