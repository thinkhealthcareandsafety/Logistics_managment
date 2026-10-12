const Shipment = require('../models/Shipment');
const ZohoConnection = require('../models/ZohoConnection');
const logger = require('../config/logger');
const zoho = require('./zoho.client');

/**
 * Freight and e-way bills from Zoho Books invoices. Each recent shipment missing them
 * is matched to its invoice - for sure when the invoice's Reference# (or notes) holds
 * the AWB, otherwise when exactly one invoice for the same customer is dated within 3
 * days of shipping. Freight = the invoice's shipping charge. Zoho's public API has no
 * e-way bill section, so any e-way bill number printed on the invoice is picked up.
 */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const day = (d) => new Date(d).toISOString().slice(0, 10);
const DAY = 24 * 60 * 60 * 1000;

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

async function matchInvoices() {
  const conn = await ZohoConnection.get();
  if (!conn.isConnected) return { skipped: 'not connected' };
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
  if (!shipments.length) return { matched: 0 };
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
    for (const inv of found) {
      let full = inv;
      try {
        details += 1;
        full = await zoho.getInvoice(conn, inv.invoice_id);
        await sleep(650);
      } catch {
        // list fields are enough for the number; freight may be missing
      }
      const f = Number(full.shipping_charge);
      if (Number.isFinite(f) && f > 0) freight += f;
      ewb = ewb || findEwayBill(full);
    }
    s.zohoInvoice = {
      invoiceId: String(found[0].invoice_id),
      number: found.map((i) => i.invoice_number).filter(Boolean).join(', '),
      matchedBy,
    };
    if (s.freightAmount == null && freight > 0) {
      s.freightAmount = Math.round(freight * 100) / 100;
      freightSet += 1;
    }
    if (ewb && !s.ewayBill?.number) {
      s.ewayBill = { number: ewb, generatedAt: s.ewayBill?.generatedAt || null, validUntil: s.ewayBill?.validUntil || null };
      ewbSet += 1;
    }
    await s.save();
    matched += 1;
  }
  conn.invoiceMatchAt = new Date();
  conn.invoiceMatchSummary = `${matched} matched · ${freightSet} freight · ${ewbSet} e-way bills (of ${shipments.length} shipments, ${invoices.length} invoices)`;
  await conn.save();
  if (matched) logger.info(`Invoice match: ${conn.invoiceMatchSummary}`);
  return { matched, freightSet, ewbSet };
}

module.exports = { matchInvoices, findEwayBill };
