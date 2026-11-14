const Shipment = require('../models/Shipment');
const ZohoConnection = require('../models/ZohoConnection');
const zoho = require('./zoho.client');
const logger = require('../config/logger');
const { findEwayBill, EWAY_BILL_THRESHOLD } = require('./invoiceMatch.service');
const { freightOf, cacheInvoice } = require('./invoiceCache.service');
const { getCatalog } = require('./courierCatalog.service');
const { commercialFields } = require('../utils/shipmentFields');
const { syncDeliveredAt } = require('../utils/deliveredAt');

/**
 * Shipments made in Zoho Books arrive here by themselves. Each shipped package in Zoho
 * carries its shipment (carrier, tracking number, date, status); its sales order gives
 * the invoice - so freight ("Packing, Shipping & Forwarding"), the invoice and its
 * e-way bill are linked for certain, not guessed.
 *
 *  - An AWB already in the app is linked and its empty fields filled - never duplicated.
 *  - Delivered in Zoho, hand deliveries (self / porter) and transport: saved as they
 *    are, no TrackingMore credit.
 *  - Still on the road with a courier TrackingMore covers: tracked live (1 credit).
 *  - Zoho marking one delivered later is applied here too.
 *
 * Zoho's API is free but capped per day: one list call a run, plus ~3 reads for each
 * new shipment, all counted against ZOHO_SHIPMENT_READS_PER_DAY.
 */

const DAY = 24 * 60 * 60 * 1000;
/** How far back the first run reads (later runs read the same window - Zoho sorts newest first). */
const FIRST_LOOKBACK_DAYS = 7;
const WINDOW_DAYS = 21;
const MAX_NEW_PER_RUN = 15;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const money = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const validDate = (v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null);

/** Couriers the app records but TrackingMore can't track (same list as the sheet import). */
const NOT_TRACKABLE = ['bus', 'transport', 'other', 'skyking-india', 'porter', 'self'];

/** Zoho's free-text carrier ("shree maruti", "Mark Courier", "self") -> the app's courier. */
const ALIASES = [
  [/^(self|by ?hand|hand ?deliver|own|client ?pick|customer ?pick|pick ?up|walk ?in)/, 'self', 'Self'],
  [/porter/, 'porter', 'Porter'],
  [/sky ?king/, 'skyking-india', 'Skyking'],
  [/mark/, 'markexpress'],
  [/maruti/, 'shreemaruticourier'],
  [/dtdc/, 'dtdc'],
  [/blue ?dart/, 'bluedart'],
  [/delhivery/, 'delhivery'],
  [/india ?post|speed ?post|registered ?post/, 'india-post'],
  [/professional/, 'professional-couriers'],
  [/anjani/, 'shreeanjanicourier'],
  [/tirupati/, 'shree-tirupati'],
  [/mahavir/, 'shreemahavir'],
  [/trackon/, 'trackon'],
  [/xpress ?bees/, 'xpressbees'],
  [/ekart/, 'ekart'],
  [/ecom/, 'ecom-express'],
  [/gati/, 'gati-kwe'],
  [/safe ?express/, 'safexpress'],
  [/\bvrl\b/, 'vrl'],
  [/\bst ?courier/, 'st-courier'],
  [/shadowfax/, 'shadowfax'],
  // Generic words last, so "VRL Logistics" is VRL, not "transport".
  [/\bbus\b|travels/, 'bus', 'Bus'],
  [/transport|lorry|truck|tempo|roadways|logistics/, 'transport', 'Transport'],
];

async function resolveZohoCarrier(raw) {
  const text = String(raw || '').toLowerCase().trim();
  if (!text) return { carrierCode: 'other', carrierName: 'Other' };
  const catalog = await getCatalog();
  for (const [re, code, name] of ALIASES) {
    if (!re.test(text)) continue;
    const c = catalog.find((x) => x.code === code);
    return { carrierCode: code, carrierName: name || c?.name || raw };
  }
  // Exact or close courier name from TrackingMore's list.
  const n = norm(text);
  const hit = catalog.find((c) => norm(c.name) === n || norm(c.code) === n) || catalog.find((c) => n.length >= 4 && norm(c.name).includes(n));
  if (hit) return { carrierCode: hit.code, carrierName: hit.name };
  return { carrierCode: 'other', carrierName: str(raw, 80) };
}

/** The shipment fields on a package (flat on the list, nested on the detail). */
function shipmentOf(p) {
  const so = p.shipment_order || p.shipmentorder || {};
  return {
    shipmentId: str(p.shipment_id || so.shipment_id),
    shipmentNumber: str(p.shipment_number || so.shipment_number, 60),
    carrier: str(p.carrier || so.carrier || p.delivery_method || so.delivery_method, 120),
    trackingNumber: str(p.tracking_number || so.tracking_number, 100).replace(/\s+/g, ''),
    shipmentDate: validDate(p.shipment_date || so.shipment_date || p.date),
    deliveredAt: validDate(p.delivered_date || so.delivered_date || p.shipment_delivered_date || so.delivery_date),
    status: str(p.status || p.shipment_status || so.status, 40).toLowerCase(),
    shippingCharge: money(p.shipping_charge ?? so.shipping_charge),
    notes: str(so.notes || p.notes, 500),
  };
}

const isDelivered = (status) => /deliver/.test(status) && !/undeliver|not_?deliver/.test(status);
const isShipped = (status) => /ship|deliver|transit/.test(status) && !/not_?shipped/.test(status);

/** "N95 Masks × 20, Gloves × 10" and the total pieces. */
function products(lines = []) {
  const goods = lines.filter((l) => l && (l.name || l.description) && !/freight|forwarding|shipping/i.test(l.name || ''));
  const qty = goods.reduce((sum, l) => sum + (money(l.quantity) || 0), 0);
  const name = goods.map((l) => `${str(l.name || l.description, 120)} × ${money(l.quantity) ?? 1}`).join(', ');
  return {
    name: str(name, 500),
    sku: goods.length === 1 ? str(goods[0].sku, 80) : '',
    quantity: Math.max(1, Math.round(qty) || 1),
  };
}

function address(a = {}) {
  const line = [a.attention, a.address, a.street2].map((v) => str(v, 200)).filter(Boolean).join(', ');
  const pin = String(a.zip || '').replace(/\D/g, '');
  return { line: str(line, 300), city: str(a.city, 80), state: str(a.state, 80), pincode: /^\d{6}$/.test(pin) ? pin : '' };
}

/** The account that sees shipments: the one owning most of them (the team account). */
async function owner() {
  const [top] = await Shipment.aggregate([{ $group: { _id: '$createdBy', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]);
  if (top?._id) return top._id;
  const first = await require('../models/User').findOne({}, '_id').sort({ createdAt: 1 }).lean();
  return first?._id || null;
}

/** Everything Zoho knows about one package: detail, sales order, invoice (freight + e-way bill). */
async function details(conn, pkg, budget) {
  await budget.take('zohoShipments');
  const full = await zoho.getPackage(conn, pkg.package_id).catch(() => pkg);
  await sleep(400);
  const out = { full, salesorder: null, invoices: [], freight: null, ewayBill: '', invoiceTotal: 0 };
  const soId = full.salesorder_id || pkg.salesorder_id;
  if (soId) {
    await budget.take('zohoShipments');
    out.salesorder = await zoho.getSalesOrder(conn, soId).catch(() => null);
    await sleep(400);
  }
  for (const ref of (out.salesorder?.invoices || []).slice(0, 2)) {
    if (!ref?.invoice_id) continue;
    await budget.take('zohoShipments');
    const inv = await zoho.getInvoice(conn, ref.invoice_id).catch(() => null);
    await sleep(400);
    if (!inv) continue;
    await cacheInvoice(inv).catch(() => {});
    out.invoices.push(inv);
    out.freight = (out.freight || 0) + freightOf(inv);
    out.invoiceTotal += money(inv.total) || 0;
    out.ewayBill = out.ewayBill || findEwayBill(inv);
  }
  // No invoice yet: freight from the sales order, else the shipment's own charge.
  if (!out.invoices.length && out.salesorder) out.freight = freightOf(out.salesorder) || null;
  if (!out.freight) out.freight = shipmentOf(full).shippingCharge || null;
  out.ewayBill = out.ewayBill || findEwayBill(out.salesorder || {}) || findEwayBill(full);
  return out;
}

/** Zoho fields for a shipment - what's filled in on a new one, or fills gaps on an existing one. */
function fieldsFrom(pkg, d, sh) {
  const full = d.full || pkg;
  const so = d.salesorder || {};
  const addr = address(full.shipping_address || so.shipping_address || {});
  let commercial = {};
  try {
    commercial = commercialFields({ freightAmount: d.freight ?? null, deliveryAddress: addr });
  } catch {
    commercial = commercialFields({ freightAmount: d.freight ?? null, deliveryAddress: { ...addr, pincode: '' } });
  }
  const inv = d.invoices[0];
  const total = d.invoiceTotal || money(so.total) || null;
  return {
    customerInfo: {
      name: str(full.customer_name || pkg.customer_name || so.customer_name),
      phone: str(full.shipping_address?.phone || so.shipping_address?.phone || full.phone || so.phone, 40),
      email: str(full.email || so.email, 200),
    },
    productDetails: products(full.line_items || so.line_items || []),
    ...commercial,
    zohoInvoice: inv
      ? { invoiceId: String(inv.invoice_id), number: d.invoices.map((i) => i.invoice_number).join(', '), matchedBy: 'zoho shipment', total }
      : null,
    // Under ₹50,000 no e-way bill is needed - a number Zoho happens to carry isn't shown.
    ewayBill: d.ewayBill && !(total > 0 && total <= EWAY_BILL_THRESHOLD) ? d.ewayBill : '',
    zohoShipment: {
      shipmentId: sh.shipmentId,
      shipmentNumber: sh.shipmentNumber,
      packageId: String(pkg.package_id),
      salesorderId: str(full.salesorder_id || pkg.salesorder_id),
      salesorderNumber: str(full.salesorder_number || pkg.salesorder_number || so.salesorder_number, 60),
      status: sh.status,
      syncedAt: new Date(),
    },
  };
}

/** Fills only what's empty on a shipment already in the app (never overwrites). */
function fillGaps(s, f) {
  const blank = (v) => v === null || v === undefined || v === '';
  const fill = (path, value) => {
    if (!blank(value) && blank(s.get(path))) s.set(path, value);
  };
  fill('customerInfo.name', f.customerInfo.name);
  fill('customerInfo.phone', f.customerInfo.phone);
  fill('customerInfo.email', f.customerInfo.email);
  fill('productDetails.name', f.productDetails.name);
  fill('freightAmount', f.freightAmount);
  for (const k of ['line', 'city', 'state', 'pincode']) fill(`deliveryAddress.${k}`, f.deliveryAddress?.[k]);
  if (f.zohoInvoice && !s.zohoInvoice?.invoiceId) s.zohoInvoice = f.zohoInvoice;
  fill('ewayBill.number', f.ewayBill);
  s.zohoShipment = f.zohoShipment;
}

/** Zoho says delivered: a hand-entered "delivered" scan, the way the app records it by hand. */
function markDelivered(s, at) {
  if (s.status === 'delivered') return false;
  const when = at || new Date();
  s.checkpoints.push({ status: 'delivered', statusRaw: 'zoho books', description: 'Delivered (marked in Zoho Books)', checkpointTime: when, source: 'manual' });
  s.checkpoints.sort((a, b) => new Date(a.checkpointTime) - new Date(b.checkpointTime));
  s.status = 'delivered';
  syncDeliveredAt(s);
  return true;
}

let running = null;

async function importZohoShipments() {
  if (running) return running;
  running = run().finally(() => {
    running = null;
  });
  return running;
}

async function run() {
  const conn = await ZohoConnection.get();
  if (!conn.isConnected) return { skipped: 'not connected' };
  const budget = require('./apiBudget');
  const result = { listed: 0, created: 0, linked: 0, delivered: 0, tracked: 0, untracked: 0 };
  const now = new Date();
  if (!conn.shipmentImportSince) conn.shipmentImportSince = new Date(now - FIRST_LOOKBACK_DAYS * DAY);
  const since = new Date(Math.max(conn.shipmentImportSince.getTime(), now - WINDOW_DAYS * DAY));

  let packages;
  try {
    await budget.take('zohoShipments');
    packages = await zoho.listPackages(conn, { since });
  } catch (err) {
    conn.shipmentImportAt = now;
    conn.shipmentImportError = err.isBudget
      ? ''
      : /scope|not authori[sz]ed|oauth|permission|57\b/i.test(`${err.message} ${err.details?.zohoCode || ''}`) ||
          err.details?.httpStatus === 401
        ? 'Zoho needs permission to read shipments - press Disconnect, then Connect Zoho Books again'
        : err.message;
    await conn.save();
    if (conn.shipmentImportError) logger.warn(`Zoho shipment import: ${conn.shipmentImportError}`);
    return { error: conn.shipmentImportError || err.message };
  }

  const ownerId = await owner();
  const sinceDay = since.toISOString().slice(0, 10);
  const shipped = packages.filter((p) => {
    const sh = shipmentOf(p);
    const day = (sh.shipmentDate || validDate(p.date) || now).toISOString().slice(0, 10);
    return isShipped(sh.status) && day >= sinceDay;
  });
  result.listed = shipped.length;

  for (const pkg of shipped) {
    const sh = shipmentOf(pkg);
    try {
      // Already imported: only Zoho's later "delivered" is news.
      const known = await Shipment.findOne({ 'zohoShipment.packageId': String(pkg.package_id) });
      if (known) {
        let changed = false;
        if (known.zohoShipment.status !== sh.status) {
          known.zohoShipment.status = sh.status;
          changed = true;
        }
        if (isDelivered(sh.status) && markDelivered(known, sh.deliveredAt)) {
          result.delivered += 1;
          changed = true;
        }
        if (changed) await known.save();
        continue;
      }
      if (result.created + result.linked >= MAX_NEW_PER_RUN) continue; // the rest next run

      const carrier = await resolveZohoCarrier(sh.carrier);
      const trackable = !NOT_TRACKABLE.includes(carrier.carrierCode) && /[a-z0-9]{6,}/i.test(sh.trackingNumber);
      const trackingNumber = sh.trackingNumber || sh.shipmentNumber || `ZOHO-${pkg.package_number || pkg.package_id}`;

      // Added by hand already (same AWB): link it and fill its blanks - no duplicate.
      const existing = sh.trackingNumber
        ? await Shipment.findOne({ trackingNumber: sh.trackingNumber, 'zohoShipment.packageId': { $in: ['', null] } })
        : null;
      const d = await details(conn, pkg, budget);
      const f = fieldsFrom(pkg, d, sh);
      if (existing) {
        fillGaps(existing, f);
        if (isDelivered(sh.status)) markDelivered(existing, sh.deliveredAt);
        await existing.save();
        result.linked += 1;
        continue;
      }

      const shippedAt = sh.shipmentDate || validDate(pkg.date) || now;
      const delivered = isDelivered(sh.status);
      const live = trackable && !delivered;
      const checkpoints = live
        ? []
        : [
            {
              status: 'in_transit',
              statusRaw: 'zoho books',
              description: `Shipped${carrier.carrierName ? ` by ${carrier.carrierName}` : ''} (from Zoho Books ${sh.shipmentNumber})`.trim(),
              checkpointTime: shippedAt,
              source: 'manual',
            },
          ];
      const shipment = new Shipment({
        trackingNumber,
        ...carrier,
        customerInfo: f.customerInfo,
        productDetails: f.productDetails,
        ...(f.freightAmount != null ? { freightAmount: f.freightAmount } : {}),
        ...(f.deliveryAddress ? { deliveryAddress: f.deliveryAddress } : {}),
        ...(f.zohoInvoice ? { zohoInvoice: f.zohoInvoice } : {}),
        ...(f.ewayBill ? { ewayBill: { number: f.ewayBill } } : {}),
        zohoShipment: f.zohoShipment,
        booking: { source: 'Zoho Books', invoiceNumber: f.zohoInvoice?.number || '', notes: sh.notes },
        shippingDate: shippedAt,
        status: live ? 'pending' : 'in_transit',
        checkpoints,
        // Zoho has already told the customer it's booked; stage messages go as normal.
        bookedNoticeSentAt: now,
        createdBy: ownerId,
      });
      if (delivered) markDelivered(shipment, sh.deliveredAt);
      await shipment.save();
      result.created += 1;

      if (live) {
        // 1 TrackingMore credit; refused (and left untracked) when none are left.
        try {
          const adapter = require('../adapters').getAdapterForCarrier(shipment.carrierCode);
          const { externalId } = await adapter.createTracking(shipment, { byName: 'Zoho Books' });
          if (externalId) shipment.trackingMoreId = externalId;
          await shipment.save();
          await require('./tracking.service').refreshShipment(shipment, { silent: true }).catch(() => {});
          result.tracked += 1;
        } catch (err) {
          result.untracked += 1;
          logger.warn(`Zoho shipment ${trackingNumber} saved but not tracked: ${err.message}`);
        }
      }
    } catch (err) {
      if (err.isBudget) break; // today's Zoho reads are used up - the rest next run / tomorrow
      logger.warn(`Zoho shipment ${sh.shipmentNumber || pkg.package_id} not imported: ${err.message}`);
    }
  }

  conn.shipmentImportAt = now;
  conn.shipmentImportError = '';
  conn.shipmentImportSummary =
    `${result.created} new · ${result.linked} linked to existing · ${result.delivered} marked delivered` +
    (result.tracked || result.untracked ? ` · ${result.tracked} tracked live${result.untracked ? `, ${result.untracked} not tracked (credits)` : ''}` : '') +
    ` (${result.listed} Zoho shipments since ${since.toISOString().slice(0, 10)})`;
  await conn.save();
  if (result.created || result.linked || result.delivered) logger.info(`Zoho shipment import: ${conn.shipmentImportSummary}`);
  return result;
}

module.exports = { importZohoShipments, resolveZohoCarrier, shipmentOf, products, address };
