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

async function matchInvoices() {
  const conn = await ZohoConnection.get();
  if (!conn.isConnected) return { skipped: 'not connected' };
  const since = new Date(Date.now() - 60 * DAY);
  const shipments = await Shipment.find({
    createdAt: { $gte: since },
    'zohoInvoice.invoiceId': { $in: ['', null] },
    $or: [{ freightAmount: null }, { 'ewayBill.number': { $in: ['', null] } }],
  });
  if (!shipments.length) return { matched: 0 };
  let invoices;
  try {
    invoices = await zoho.listInvoices(conn, { from: day(new Date(since.getTime() - 3 * DAY)), to: day(new Date()) });
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

  let matched = 0;
  let freightSet = 0;
  let ewbSet = 0;
  for (const s of shipments) {
    const awb = norm(s.trackingNumber);
    let inv = invoices.find((i) => awb && [i.reference_number, i.notes].some((f) => norm(f).includes(awb)));
    let matchedBy = inv ? 'awb' : '';
    if (!inv && s.customerInfo?.name) {
      const cust = norm(s.customerInfo.name);
      const shipped = new Date(s.shippingDate || s.createdAt).getTime();
      const candidates = invoices.filter((i) => {
        const c = norm(i.customer_name);
        return c && cust && (c.includes(cust) || cust.includes(c)) && Math.abs(new Date(i.date).getTime() - shipped) <= 3 * DAY;
      });
      if (candidates.length === 1) {
        inv = candidates[0];
        matchedBy = 'customer+date';
      }
    }
    if (!inv) continue;
    let full = inv;
    try {
      full = await zoho.getInvoice(conn, inv.invoice_id);
    } catch {
      // list fields are enough for the number; freight may be missing
    }
    s.zohoInvoice = { invoiceId: String(inv.invoice_id), number: inv.invoice_number || '', matchedBy };
    const freight = Number(full.shipping_charge);
    if (s.freightAmount == null && Number.isFinite(freight) && freight > 0) {
      s.freightAmount = freight;
      freightSet += 1;
    }
    const ewb = findEwayBill(full);
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
