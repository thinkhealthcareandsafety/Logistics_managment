const ZohoInvoice = require('../models/ZohoInvoice');
const Shipment = require('../models/Shipment');
const StockItem = require('../models/StockItem');

/**
 * Reorder predictions: clients who buy the same item again and again on a rhythm
 * ("30 gloves about every month") - when the next order should come, and how much.
 *
 * Read from Zoho Books invoice lines (client + item + quantity + date) when the invoice
 * history has been read; until then, from shipments (product names are free text
 * there, so fewer patterns are found). Pure arithmetic on stored data - no API calls.
 */

const DAY = 24 * 60 * 60 * 1000;
const MIN_ORDERS = 3;
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|m\/s|pvt|ltd|private|limited)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/** Shipment product names carry counts ("Frx Aed-2", "Gloves x3") - drop them to compare. */
const productKey = (s) => norm(String(s || '').replace(/\s*[-x×]\s*\d+\s*$/i, ''));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const istDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d));

/** Orders as { customerKey, customer, itemKey, item, itemId, date, qty } from invoices. */
async function ordersFromInvoices() {
  const invoices = await ZohoInvoice.find({ status: { $nin: ['void', 'draft'] } }).select('date customerId customerName lines').lean();
  const out = [];
  for (const inv of invoices) {
    for (const l of inv.lines) {
      if (l.freight || !(l.quantity > 0)) continue;
      out.push({
        customerKey: inv.customerId || norm(inv.customerName),
        customer: inv.customerName,
        itemKey: l.itemId || norm(l.name),
        item: l.name,
        itemId: l.itemId,
        date: inv.date,
        qty: l.quantity,
      });
    }
  }
  return { orders: out, invoices: invoices.length };
}

async function ordersFromShipments(userId) {
  const shipments = await Shipment.find({ createdBy: userId }).select('customerInfo.name productDetails shippingDate createdAt').lean();
  return shipments
    .filter((s) => s.customerInfo?.name && s.productDetails?.name)
    .map((s) => ({
      customerKey: norm(s.customerInfo.name),
      customer: s.customerInfo.name,
      itemKey: productKey(s.productDetails.name),
      item: s.productDetails.name.replace(/\s*[-x×]\s*\d+\s*$/i, ''),
      itemId: '',
      date: s.shippingDate || s.createdAt,
      qty: Number(s.productDetails.quantity) || 1,
    }));
}

/** One client + item: its rhythm, typical quantity, and when the next order is due. */
function predict(group, today) {
  // Several invoices on one day are one order.
  const byDay = new Map();
  for (const o of group) byDay.set(istDay(o.date), (byDay.get(istDay(o.date)) || 0) + o.qty);
  const orders = [...byDay.entries()].map(([d, qty]) => ({ at: new Date(`${d}T00:00:00+05:30`).getTime(), qty })).sort((a, b) => a.at - b.at);
  if (orders.length < MIN_ORDERS) return null;
  const gaps = orders.slice(1).map((o, i) => (o.at - orders[i].at) / DAY).filter((g) => g > 0);
  if (gaps.length < MIN_ORDERS - 1) return null;
  const every = median(gaps);
  if (every < 3) return null; // same week, again and again - a delivery schedule, not a reorder rhythm
  // How steady: 1 = like clockwork; 0 = all over the place.
  const spread = median(gaps.map((g) => Math.abs(g - every)));
  const regularity = Math.max(0, 1 - spread / every);
  const qty = median(orders.map((o) => o.qty));
  const recentQty = orders.slice(-3).reduce((s, o) => s + o.qty, 0) / Math.min(3, orders.length);
  const last = orders[orders.length - 1];
  const next = last.at + every * DAY;
  const daysUntil = Math.round((next - today) / DAY);
  const lateBy = -daysUntil;
  const status = lateBy > 2 * every ? 'lapsed' : lateBy > Math.max(7, every * 0.3) ? 'overdue' : daysUntil <= 14 ? 'due' : 'upcoming';
  const confidence = orders.length >= 4 && regularity >= 0.7 ? 'high' : regularity >= 0.45 ? 'medium' : 'low';
  const spanDays = (last.at - orders[0].at) / DAY;
  const g = group[0];
  return {
    customer: group[group.length - 1].customer || g.customer,
    item: group[group.length - 1].item || g.item,
    itemId: g.itemId,
    orders: orders.length,
    everyDays: Math.round(every),
    typicalQty: Math.round(qty * 10) / 10,
    recentQty: Math.round(recentQty * 10) / 10,
    perMonth: spanDays > 0 ? Math.round(((orders.slice(0, -1).reduce((s, o) => s + o.qty, 0) / spanDays) * 30.4) * 10) / 10 : null,
    lastOrderAt: new Date(last.at),
    nextOrderAt: new Date(next),
    daysUntil,
    status,
    confidence,
    regularity: Math.round(regularity * 100) / 100,
  };
}

async function reorderPredictions({ userId }) {
  const today = Date.now();
  const fromInvoices = await ordersFromInvoices();
  const useInvoices = fromInvoices.invoices >= 20;
  const orders = useInvoices ? fromInvoices.orders : await ordersFromShipments(userId);

  const groups = new Map();
  for (const o of orders) {
    if (!o.customerKey || !o.itemKey) continue;
    const key = `${o.customerKey}|${o.itemKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  for (const g of groups.values()) g.sort((a, b) => new Date(a.date) - new Date(b.date));
  const predictions = [...groups.values()]
    .map((g) => predict(g, today))
    .filter(Boolean)
    .sort((a, b) => a.nextOrderAt - b.nextOrderAt);

  // Expected demand per item over the next 30 days, against what's on the shelf.
  const soon = predictions.filter((p) => p.status !== 'lapsed' && p.daysUntil <= 30);
  const byItem = new Map();
  for (const p of soon) {
    const key = p.itemId || norm(p.item);
    const row = byItem.get(key) || { item: p.item, itemId: p.itemId, expectedQty: 0, clients: 0 };
    row.expectedQty += p.recentQty || p.typicalQty;
    row.clients += 1;
    byItem.set(key, row);
  }
  const ids = [...byItem.values()].map((r) => r.itemId).filter(Boolean);
  const stock = ids.length ? await StockItem.find({ zohoItemId: { $in: ids }, isArchived: false }).select('zohoItemId quantity').lean() : [];
  const onHand = new Map(stock.map((s) => [s.zohoItemId, s.quantity]));
  const demand = [...byItem.values()]
    .map((r) => {
      const inStock = r.itemId && onHand.has(r.itemId) ? onHand.get(r.itemId) : null;
      return { ...r, expectedQty: Math.round(r.expectedQty), inStock, short: inStock != null && inStock < r.expectedQty };
    })
    .sort((a, b) => Number(b.short) - Number(a.short) || b.expectedQty - a.expectedQty);

  const { invoiceHistoryStatus } = require('./invoiceCache.service');
  return { source: useInvoices ? 'invoices' : 'shipments', history: await invoiceHistoryStatus(), predictions, demand };
}

module.exports = { reorderPredictions, predict, productKey };
