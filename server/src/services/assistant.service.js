const mongoose = require('mongoose');
const Shipment = require('../models/Shipment');
const StockItem = require('../models/StockItem');
const StockCategory = require('../models/StockCategory');

/**
 * The in-app assistant: plain rules, no AI service, no API key, no cost. A question is
 * matched to what it's asking (shipments, stock, reorders, couriers, freight...) and the
 * filters in it (status, dates, courier, client, place, item); then the answer is worked
 * out from the live database at that moment - so it's always as current as the data.
 * Names it recognises (couriers, clients, cities, items) are re-read every few minutes,
 * so a new client or product is understood without anyone teaching it.
 */

const DAY = 24 * 60 * 60 * 1000;
const STOP = new Set(
  'the a an of to for in on at by and or is are was were be been how many much what which who whom when where why show list give me tell my our all any some please today yesterday week month year this last next shipments shipment orders order courier couriers stock items item total count number with from that there do does did have has kitne kitna dikhao batao aaj hai hain ka ki ke'.split(' ')
);
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(m\/s|pvt|ltd|private|limited|mr|mrs|ms)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length >= 2 && !STOP.has(t));
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
const istYmd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d));
const istStart = (ymd) => new Date(`${ymd}T00:00:00+05:30`);
const fmtDate = (d) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));

const STATUS_LABEL = { pending: 'waiting for pickup', in_transit: 'in transit', out_for_delivery: 'out for delivery', delivered: 'delivered', exception: 'held up (exception)' };

// ─────────────────────────── Dates ───────────────────────────

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "today", "last week", "this month", "last 10 days", "in september", "aaj"... -> { from, to, label } */
function parseRange(q, now = new Date()) {
  const today = istStart(istYmd(now));
  const addDays = (d, n) => new Date(d.getTime() + n * DAY);
  const r = (from, to, label) => ({ from, to, label });
  if (/\b(today|aaj)\b/.test(q)) return r(today, addDays(today, 1), 'today');
  if (/\byesterday\b/.test(q)) return r(addDays(today, -1), today, 'yesterday');
  const weekday = (new Date(today.getTime() + 5.5 * 3600 * 1000).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -weekday);
  if (/\b(this|is) (week|hafte)\b/.test(q)) return r(weekStart, addDays(today, 1), 'this week');
  if (/\blast week\b|\bpichhle hafte\b/.test(q)) return r(addDays(weekStart, -7), weekStart, 'last week');
  const ymd = istYmd(now);
  const [y, m] = ymd.split('-').map(Number);
  const monthStart = (yy, mm) => istStart(`${yy}-${String(mm).padStart(2, '0')}-01`);
  if (/\b(this|is) (month|mahine)\b/.test(q)) return r(monthStart(y, m), addDays(today, 1), 'this month');
  if (/\blast month\b/.test(q)) return r(m === 1 ? monthStart(y - 1, 12) : monthStart(y, m - 1), monthStart(y, m), 'last month');
  if (/\bthis year\b/.test(q)) return r(istStart(`${y}-01-01`), addDays(today, 1), 'this year');
  const lastN = q.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+(day|week|month)s?\b/);
  if (lastN) {
    const n = Number(lastN[1]);
    const days = lastN[2] === 'day' ? n : lastN[2] === 'week' ? n * 7 : n * 30;
    return r(addDays(today, -days + 1), addDays(today, 1), `in the last ${lastN[1]} ${lastN[2]}${n === 1 ? '' : 's'}`);
  }
  const monthName = q.match(new RegExp(`\\b(${MONTHS.join('|')}|${MONTHS.map((x) => x.slice(0, 3)).join('|')})\\b(?:\\s+(20\\d\\d))?`));
  if (monthName) {
    const mm = MONTHS.findIndex((x) => x.startsWith(monthName[1])) + 1;
    let yy = monthName[2] ? Number(monthName[2]) : y;
    if (!monthName[2] && mm > m) yy -= 1; // "in november" asked in October = last November
    const end = mm === 12 ? monthStart(yy + 1, 1) : monthStart(yy, mm + 1);
    return r(monthStart(yy, mm), end, `in ${MONTHS[mm - 1][0].toUpperCase()}${MONTHS[mm - 1].slice(1)} ${yy}`);
  }
  return null;
}
const inRange = (d, range) => d && new Date(d) >= range.from && new Date(d) < range.to;

// ─────────────────────────── Vocabulary (refreshed) ───────────────────────────

const VOCAB_MS = 5 * 60 * 1000;
const vocabCache = new Map(); // userId -> { at, vocab }

/** Names the assistant recognises, re-read from the data every few minutes. */
async function vocabulary(userId) {
  const hit = vocabCache.get(String(userId));
  if (hit && Date.now() - hit.at < VOCAB_MS) return hit.vocab;
  const [couriers, customers, cities, states, items, categories] = await Promise.all([
    // Aggregations don't convert ids like find() does - pass a real ObjectId.
    Shipment.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(String(userId)) } },
      { $group: { _id: '$carrierCode', name: { $first: '$carrierName' } } },
    ]),
    Shipment.distinct('customerInfo.name', { createdBy: userId }),
    Shipment.distinct('deliveryAddress.city', { createdBy: userId }),
    Shipment.distinct('deliveryAddress.state', { createdBy: userId }),
    StockItem.find({ isArchived: false }).select('name size').lean(),
    StockCategory.find().select('name').lean(),
  ]);
  const vocab = {
    couriers: couriers.filter((c) => c._id).map((c) => ({ code: c._id, name: c.name || c._id })),
    customers: customers.filter(Boolean),
    places: [...new Set([...cities, ...states].filter(Boolean).map((p) => p.trim()))],
    items: items.map((i) => ({ id: String(i._id), name: i.size ? `${i.name} ${i.size}` : i.name })),
    categories: categories.map((c) => ({ id: String(c._id), name: c.name })),
  };
  if (vocabCache.size > 50) vocabCache.clear();
  vocabCache.set(String(userId), { at: Date.now(), vocab });
  return vocab;
}

/**
 * The name in `list` the question mentions best: every word of the name (or nearly)
 * appears in the question. Returns { value, score } or null.
 */
function findMention(q, list, nameOf = (x) => x, { min = 0.6 } = {}) {
  const words = new Set(tokens(q));
  const text = ` ${norm(q)} `;
  let best = null;
  for (const entry of list) {
    const name = norm(nameOf(entry));
    if (!name) continue;
    let score;
    if (name.length >= 3 && text.includes(` ${name} `)) score = 1 + name.length / 100; // exact phrase - longer wins
    else {
      const t = tokens(name);
      if (!t.length) continue;
      const hit = t.filter((w) => words.has(w) || (w.length >= 5 && [...words].some((x) => x.length >= 4 && (w.startsWith(x) || x.startsWith(w))))).length;
      score = hit / t.length;
      if (hit === 0 || !t.some((w) => w.length >= 4 && words.has(w))) score = Math.min(score, 0.5);
    }
    if (score >= min && (!best || score > best.score)) best = { value: entry, score };
  }
  return best;
}

// ─────────────────────────── Shipments ───────────────────────────

const SHIPMENT_FIELDS =
  'trackingNumber carrierCode carrierName status customerInfo.name productDetails deliveryAddress carrierRoute.destinationCity carrierRoute.destinationState currentLocation shippingDate createdAt deliveredAt estimatedDelivery freightAmount weightKg ewayBill zohoInvoice.total booking.shipmentValue receipt isArchived';

function statusFrom(q) {
  if (/\bout for delivery\b|\bofd\b/.test(q)) return 'out_for_delivery';
  if (/\bin ?transit\b|\bon the way\b|\bin the way\b|\braste me\b/.test(q)) return 'in_transit';
  if (/\b(late|delayed|overdue|stuck|behind)\b/.test(q)) return 'late';
  if (/\b(exception|held|hold|problem|issue|failed|returned|rto)\b/.test(q)) return 'exception';
  if (/\b(pending|not picked|awaiting pickup|yet to be picked|not dispatched|booked but)\b/.test(q)) return 'pending';
  // Before "delivered", or "not delivered" would read as delivered.
  if (/\b(active|open|undelivered|not (yet )?delivered|on the move)\b/.test(q)) return 'active';
  if (/\bdeliver(ed|ies|y)\b/.test(q) && !/\bout for\b/.test(q)) return 'delivered';
  return null;
}

/** Not delivered and past its promised date - or, with no promise, on the road over a week. */
function isLate(s, now = Date.now()) {
  if (s.status === 'delivered') return false;
  if (s.status === 'exception') return true;
  if (s.estimatedDelivery) return new Date(s.estimatedDelivery).getTime() + DAY < now;
  const sent = s.shippingDate || s.createdAt;
  return s.status !== 'pending' && sent && now - new Date(sent).getTime() > 7 * DAY;
}

const placeOf = (s) => [s.deliveryAddress?.city || s.carrierRoute?.destinationCity, s.deliveryAddress?.state || s.carrierRoute?.destinationState].filter(Boolean).join(', ');
const shipmentItem = (s) => ({
  label: `${s.customerInfo?.name || 'No customer'} - ${s.productDetails?.name || 'shipment'}`,
  sub: [s.trackingNumber, s.carrierName, s.status === 'delivered' && s.deliveredAt ? `delivered ${fmtDate(s.deliveredAt)}` : STATUS_LABEL[s.status], s.currentLocation || placeOf(s)]
    .filter(Boolean)
    .join(' · '),
  href: `/shipments/${s._id}`,
});

async function shipmentsAnswer(q, ctx) {
  const { userId, vocab } = ctx;
  const range = parseRange(q);
  const status = statusFrom(q);
  const courier = findMention(q, vocab.couriers, (c) => c.name, { min: 0.75 });
  const customer = findMention(q, vocab.customers, undefined, { min: 0.7 });
  const place = findMention(q, vocab.places, undefined, { min: 1 });
  const wantsList = /\b(show|list|which|what are|details|give|dikhao|names?)\b/.test(q);

  let all = await Shipment.find({ createdBy: userId, isArchived: false }).select(SHIPMENT_FIELDS).lean();
  const filters = [];
  if (courier) {
    all = all.filter((s) => s.carrierCode === courier.value.code);
    filters.push(`with ${courier.value.name}`);
  }
  if (customer) {
    all = all.filter((s) => norm(s.customerInfo?.name) === norm(customer.value));
    filters.push(`for ${customer.value}`);
  }
  if (place) {
    const p = norm(place.value);
    all = all.filter((s) => [s.deliveryAddress?.city, s.deliveryAddress?.state, s.carrierRoute?.destinationCity, s.carrierRoute?.destinationState].some((x) => norm(x) === p));
    filters.push(`to ${place.value}`);
  }

  let list = all;
  let what;
  const sentVerb = /\b(ship(ped)?|sent|dispatch(ed)?|book(ed)?|created|added|bheja)\b/.test(q);
  if (status === 'delivered') {
    if (range) list = list.filter((s) => s.status === 'delivered' && inRange(s.deliveredAt, range));
    else list = list.filter((s) => s.status === 'delivered');
    what = `delivered${range ? ` ${range.label}` : ''}`;
  } else if (status === 'late') {
    list = list.filter((s) => isLate(s));
    what = 'late or held up right now';
  } else if (status === 'active') {
    list = list.filter((s) => s.status !== 'delivered');
    what = 'not delivered yet';
  } else if (status) {
    // A status is "right now" - "in transit today" means in transit at the moment.
    list = list.filter((s) => s.status === status);
    if (range && sentVerb) list = list.filter((s) => inRange(s.shippingDate || s.createdAt, range));
    what = `${STATUS_LABEL[status]}${range && sentVerb ? ` (shipped ${range.label})` : ' right now'}`;
  } else if (range) {
    list = list.filter((s) => inRange(s.shippingDate || s.createdAt, range));
    what = `shipped ${range.label}`;
  } else {
    what = 'in total';
  }

  const n = list.length;
  const lines = [`**${plural(n, 'shipment')}** ${filters.join(' ')} ${what}.`.replace(/\s+/g, ' ').replace(' .', '.')];
  if (n > 1 && !courier) {
    const byCourier = {};
    for (const s of list) byCourier[s.carrierName || s.carrierCode] = (byCourier[s.carrierName || s.carrierCode] || 0) + 1;
    const top = Object.entries(byCourier).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (top.length > 1) lines.push(`By courier: ${top.map(([c, k]) => `${c} ${k}`).join(', ')}.`);
  }
  if (status === 'late' && n) lines.push('Late = past its promised date, held up, or on the road for over a week.');
  const sorted = [...list].sort((a, b) => new Date(b.deliveredAt || b.shippingDate || b.createdAt) - new Date(a.deliveredAt || a.shippingDate || a.createdAt));
  const show = wantsList || n <= 8 ? sorted.slice(0, 15) : sorted.slice(0, 5);
  if (n > show.length && show.length) lines.push(`Latest ${show.length}:`);
  return { answer: lines.join('\n'), items: show.map(shipmentItem) };
}

async function awbAnswer(awb, ctx) {
  const s = await Shipment.findOne({ createdBy: ctx.userId, trackingNumber: new RegExp(`^${awb.replace(/[^A-Za-z0-9]/g, '')}$`, 'i') }).lean();
  if (!s) return { answer: `I couldn't find a shipment with AWB **${awb}**.` };
  const last = s.checkpoints?.[s.checkpoints.length - 1];
  const lines = [
    `**${s.trackingNumber}** (${s.carrierName}) is **${STATUS_LABEL[s.status]}**${s.status === 'delivered' && s.deliveredAt ? ` - delivered ${fmtDate(s.deliveredAt)}` : ''}.`,
    `For ${s.customerInfo?.name || 'no customer set'}${s.productDetails?.name ? ` · ${s.productDetails.name}` : ''}${placeOf(s) ? ` · to ${placeOf(s)}` : ''}.`,
  ];
  if (last) lines.push(`Last scan: ${last.description || STATUS_LABEL[last.status]}${last.location ? ` at ${last.location}` : ''} (${fmtDate(last.checkpointTime)}).`);
  if (s.receipt?.confirmedAt) lines.push(`Received by ${s.receipt.receivedBy} (${s.receipt.relation}) on ${fmtDate(s.receipt.receivedAt || s.receipt.confirmedAt)}.`);
  else if (s.status === 'delivered') lines.push('Delivery receipt not confirmed yet.');
  if (s.freightAmount) lines.push(`Freight: ${inr(s.freightAmount)}.`);
  return { answer: lines.join('\n'), items: [shipmentItem(s)] };
}

// ─────────────────────────── Stock ───────────────────────────

async function stockAnswer(q, ctx) {
  const manual = /\bmanual\b/.test(q);
  const models = manual ? require('../models/ManualStock') : { Item: StockItem, Category: StockCategory };
  const [items, categories] = await Promise.all([
    models.Item.find({ isArchived: false }).select('name size quantity oldQuantity lowStockAt salePrice purchasePrice categoryId').lean(),
    models.Category.find().select('name').lean(),
  ]);
  const book = manual ? 'manual stock' : 'stock';
  const name = (i) => (i.size ? `${i.name} ${i.size}` : i.name);
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const itemLink = { href: manual ? '/manual-stock' : '/stock' };
  const row = (i) => ({ label: name(i), sub: `${i.quantity} in stock${i.oldQuantity != null ? ` (${i.oldQuantity} old + ${i.quantity - i.oldQuantity} new)` : ''} · ${catName.get(String(i.categoryId)) || ''}`, ...itemLink });

  if (/\bout of stock\b|\bkhatam\b|\bzero stock\b|\bnil\b/.test(q)) {
    const out = items.filter((i) => i.quantity <= 0);
    return { answer: `**${plural(out.length, 'item')}** ${out.length === 1 ? 'is' : 'are'} out of ${book}.`, items: out.slice(0, 20).map(row) };
  }
  if (/\b(low|running low|reorder level|kam)\b/.test(q)) {
    const low = items.filter((i) => i.quantity > 0 && i.lowStockAt != null && i.quantity <= i.lowStockAt);
    return { answer: `**${plural(low.length, 'item')}** ${low.length === 1 ? 'is' : 'are'} running low (at or under the reorder level).`, items: low.slice(0, 20).map((i) => ({ ...row(i), sub: `${row(i).sub} · reorder at ${i.lowStockAt}` })) };
  }
  const item = findMention(q, items, name, { min: 0.7 });
  const category = findMention(q, categories, (c) => c.name, { min: 0.9 });
  if (item && (!category || item.score >= category.score)) {
    const i = item.value;
    const value = i.quantity * (i.salePrice ?? i.purchasePrice ?? 0);
    return {
      answer: `**${name(i)}**: **${i.quantity}** in ${book}${i.oldQuantity != null ? ` (${i.oldQuantity} old + ${i.quantity - i.oldQuantity} new)` : ''}${value ? `, worth ${inr(value)} at sale price` : ''}.${i.lowStockAt != null ? ` Reorder level ${i.lowStockAt}.` : ''}`,
      items: [row(i)],
    };
  }
  if (category) {
    const inCat = items.filter((i) => String(i.categoryId) === String(category.value._id));
    const units = inCat.reduce((n, i) => n + i.quantity, 0);
    return { answer: `**${category.value.name}**: ${plural(units, 'unit')} across ${plural(inCat.length, 'item')} (${inCat.filter((i) => i.quantity <= 0).length} out of stock).`, items: [...inCat].sort((a, b) => b.quantity - a.quantity).slice(0, 15).map(row) };
  }
  const units = items.reduce((n, i) => n + i.quantity, 0);
  const value = items.reduce((n, i) => n + i.quantity * (i.salePrice ?? i.purchasePrice ?? 0), 0);
  return {
    answer: `The ${book} has **${plural(units, 'unit')}** across ${plural(items.length, 'item')}${value ? `, worth ${inr(value)} at sale price` : ''}. ${items.filter((i) => i.quantity <= 0).length} items are out of stock.\nAsk about one item ("how many HS1 pads in stock?") or a category.`,
  };
}

// ─────────────────────────── Reorders, couriers, freight ───────────────────────────

async function reorderAnswer(q, ctx) {
  const { predictions, source } = await require('./reorder.service').reorderPredictions({ userId: ctx.userId });
  const customer = findMention(q, [...new Set(predictions.map((p) => p.customer))], undefined, { min: 0.7 });
  let list = predictions.filter((p) => p.status !== 'lapsed');
  let lead;
  if (customer) {
    list = predictions.filter((p) => p.customer === customer.value);
    lead = `${customer.value}: ${plural(list.length, 'repeat item')}.`;
  } else if (/\b(overdue|late|missed|stopped)\b/.test(q)) {
    list = predictions.filter((p) => p.status === 'overdue' || (/stopped/.test(q) && p.status === 'lapsed'));
    lead = `**${plural(list.length, 'client')}** ${list.length === 1 ? 'is' : 'are'} late with a regular order - worth a follow-up call.`;
  } else {
    list = list.filter((p) => p.daysUntil <= 30);
    lead = `**${plural(list.length, 'reorder')}** expected in the next 30 days.`;
  }
  const items = list.slice(0, 15).map((p) => ({
    label: `${p.customer} - ${p.item}`,
    sub: `~${p.recentQty || p.typicalQty} every ${p.everyDays} days · next ${fmtDate(p.nextOrderAt)} (${p.daysUntil >= 0 ? `in ${p.daysUntil} days` : `${-p.daysUntil} days late`}) · ${p.confidence} confidence`,
    href: '/analytics',
  }));
  return { answer: `${lead}${source === 'shipments' ? '\n(Read from shipments until the Zoho invoice history is in.)' : ''}`, items };
}

async function courierAnswer(q, ctx) {
  const summary = await require('./analytics.service').getAnalyticsSummary({ userId: ctx.userId });
  const advice = summary.courierAdvice;
  if (!advice) return { answer: 'Not enough shipments to compare couriers yet - each needs 5 or more.' };
  const place = findMention(q, advice.byState, (l) => l.state, { min: 1 });
  if (place) {
    const l = place.value;
    return {
      answer: `For **${l.state}**, use **${l.recommended.carrierName}** - fewest problems${l.recommended.averageTransitHours != null ? `, about ${(l.recommended.averageTransitHours / 24).toFixed(1)} days` : ''}.`,
      items: l.options.map((o) => ({ label: o.carrierName, sub: `${o.shipments} shipments · ${o.averageTransitHours != null ? `${(o.averageTransitHours / 24).toFixed(1)} days` : '-'}${o.medianFreight != null ? ` · typically ${inr(o.medianFreight)}` : ''}`, href: '/couriers' })),
    };
  }
  if (/\b(cheap|cheapest|affordable|low cost|sasta|lowest)\b/.test(q) && advice.cheapest) {
    return { answer: `**${advice.cheapest.carrierName}** is the most affordable - typically ${inr(advice.cheapest.value)} a shipment.`, items: [{ label: 'Courier comparison', sub: 'Freight, speed and reliability', href: '/couriers' }] };
  }
  if (/\b(fast|fastest|quick|quickest)\b/.test(q) && advice.fastest) {
    return { answer: `**${advice.fastest.carrierName}** is the fastest on its routes (${advice.fastest.value.toFixed(1)}× the typical speed to the same places).`, items: [{ label: 'Courier comparison', sub: 'Freight, speed and reliability', href: '/couriers' }] };
  }
  const r = advice.recommended;
  const noFigures = /\b(cheap|cheapest|affordable|low cost|sasta|lowest)\b/.test(q)
    ? 'There isn’t enough freight data to compare charges yet (it needs freight on 3+ shipments for at least two couriers). Overall, '
    : /\b(fast|fastest|quick|quickest)\b/.test(q)
      ? 'There aren’t enough trips to the same places to compare speed yet. Overall, '
      : '';
  return {
    answer: r ? `${noFigures}I'd use **${r.carrierName}** - score ${r.score}/100 (reliability, speed on the same routes, freight).` : 'No courier has enough measured data for a recommendation yet.',
    items: advice.ranking.slice(0, 5).map((c) => ({ label: `${c.carrierName} - ${c.score}/100`, sub: `${c.shipments} shipments${c.medianFreight != null ? ` · typically ${inr(c.medianFreight)}` : ''}`, href: '/couriers' })),
  };
}

async function freightAnswer(q, ctx) {
  const range = parseRange(q);
  const courier = findMention(q, ctx.vocab.couriers, (c) => c.name, { min: 0.75 });
  let list = await Shipment.find({ createdBy: ctx.userId }).select('carrierCode carrierName freightAmount shippingDate createdAt').lean();
  if (range) list = list.filter((s) => inRange(s.shippingDate || s.createdAt, range));
  if (courier) list = list.filter((s) => s.carrierCode === courier.value.code);
  const known = list.filter((s) => s.freightAmount > 0);
  const total = known.reduce((n, s) => n + s.freightAmount, 0);
  const byCourier = {};
  for (const s of known) byCourier[s.carrierName || s.carrierCode] = (byCourier[s.carrierName || s.carrierCode] || 0) + s.freightAmount;
  return {
    answer: `Freight ${courier ? `with ${courier.value.name} ` : ''}${range ? range.label : 'in total'}: **${inr(total)}** on ${plural(known.length, 'shipment')} with a freight figure (of ${list.length}).${known.length ? ` Average ${inr(total / known.length)} a shipment.` : ''}`,
    items: Object.entries(byCourier)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([c, v]) => ({ label: c, sub: inr(v), href: '/couriers' })),
  };
}

// ─────────────────────────── Receipts, e-way bills, rankings, transit ───────────────────────────

async function receiptAnswer(q, ctx) {
  const range = parseRange(q) || { from: new Date(Date.now() - 30 * DAY), to: new Date(Date.now() + DAY), label: 'in the last 30 days' };
  const delivered = (await Shipment.find({ createdBy: ctx.userId, status: 'delivered', isArchived: false }).select(SHIPMENT_FIELDS).lean()).filter((s) => inRange(s.deliveredAt, range));
  const pending = delivered.filter((s) => !s.receipt?.confirmedAt);
  return {
    answer: `Of ${plural(delivered.length, 'shipment')} delivered ${range.label}, **${delivered.length - pending.length}** have a confirmed receipt and **${pending.length}** don't yet.`,
    items: pending.slice(0, 12).map(shipmentItem),
  };
}

async function ewayAnswer(q, ctx) {
  const list = await Shipment.find({ createdBy: ctx.userId, isArchived: false }).select(SHIPMENT_FIELDS).lean();
  const value = (s) => s.zohoInvoice?.total || s.booking?.shipmentValue || 0;
  const missing = list.filter((s) => value(s) > 50000 && !s.ewayBill?.number && s.status !== 'delivered');
  return {
    answer: `**${plural(missing.length, 'shipment')}** worth over ₹50,000 ${missing.length === 1 ? 'is' : 'are'} on the way without an e-way bill.`,
    items: missing.slice(0, 12).map((s) => ({ ...shipmentItem(s), sub: `${shipmentItem(s).sub} · ${inr(value(s))}` })),
  };
}

async function rankingAnswer(q, ctx) {
  const range = parseRange(q);
  let list = await Shipment.find({ createdBy: ctx.userId }).select(SHIPMENT_FIELDS).lean();
  if (range) list = list.filter((s) => inRange(s.shippingDate || s.createdAt, range));
  const by = /\b(cit(y|ies)|destination|place|location|state)s?\b/.test(q) ? (/\bstates?\b/.test(q) ? 'state' : 'city') : /\b(product|item)s?\b/.test(q) ? 'product' : /\bcourier/.test(q) ? 'courier' : 'customer';
  const keyOf = {
    customer: (s) => s.customerInfo?.name,
    city: (s) => s.deliveryAddress?.city || s.carrierRoute?.destinationCity,
    state: (s) => s.deliveryAddress?.state || s.carrierRoute?.destinationState,
    product: (s) => s.productDetails?.name,
    courier: (s) => s.carrierName,
  }[by];
  const counts = {};
  for (const s of list) {
    const k = keyOf(s);
    if (k) counts[k.trim()] = (counts[k.trim()] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const noun = { customer: 'clients', city: 'cities', state: 'states', product: 'products', courier: 'couriers' }[by];
  return {
    answer: `Top ${noun} by shipments ${range ? range.label : 'of all time'}:`,
    items: top.map(([k, n], i) => ({ label: `${i + 1}. ${k}`, sub: plural(n, 'shipment'), href: '/analytics' })),
  };
}

async function transitAnswer(q, ctx) {
  const range = parseRange(q);
  const courier = findMention(q, ctx.vocab.couriers, (c) => c.name, { min: 0.75 });
  let list = await Shipment.find({ createdBy: ctx.userId, status: 'delivered' }).select('carrierCode carrierName shippingDate createdAt deliveredAt').lean();
  if (range) list = list.filter((s) => inRange(s.deliveredAt, range));
  if (courier) list = list.filter((s) => s.carrierCode === courier.value.code);
  const days = list.map((s) => (new Date(s.deliveredAt) - new Date(s.shippingDate || s.createdAt)) / DAY).filter((d) => d >= 0 && d < 60);
  if (!days.length) return { answer: 'No delivered shipments with dates to measure for that.' };
  const avg = days.reduce((a, b) => a + b, 0) / days.length;
  return { answer: `Average time from shipping to delivery${courier ? ` with ${courier.value.name}` : ''}${range ? ` ${range.label}` : ''}: **${avg.toFixed(1)} days** (over ${plural(days.length, 'delivery', 'deliveries')}).` };
}

// ─────────────────────────── Routing a question ───────────────────────────

const SUGGESTIONS = [
  'How many shipments are in transit?',
  'Which shipments are late?',
  'Delivered this week',
  'What is out of stock?',
  'Who is due to reorder?',
  'Best courier for Karnataka',
  'Freight this month',
  'Receipts pending',
];

const HELP = `I answer from your live data - nothing is sent anywhere. Try:
• "How many shipments are in transit?" / "delivered today" / "shipped last week"
• "Late shipments" · "shipments to Bengaluru" · "Shree Maruti shipments this month"
• An AWB number for its status
• "Stock of HS1 pads" · "out of stock" · "low stock" · "manual stock out of stock"
• "Who is due to reorder?" · "overdue reorders"
• "Best courier" · "cheapest courier" · "best courier for Karnataka"
• "Freight this month" · "receipts pending" · "e-way bill missing"
• "Top clients" · "top cities this year" · "average delivery time"`;

async function answer(question, userId) {
  const raw = String(question || '').slice(0, 300);
  const q = ` ${raw.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ')} `;
  if (!raw.trim() || /\b(help|what can you|hello|hi|hey|namaste)\b/.test(q) && raw.trim().split(/\s+/).length <= 4) {
    return { answer: HELP, suggestions: SUGGESTIONS };
  }
  const vocab = await vocabulary(userId);
  const ctx = { userId, vocab };

  const awb = raw.match(/\b([A-Za-z]{0,3}\d{8,15})\b/);
  if (awb) return awbAnswer(awb[1], ctx);
  if (/\b(e-?way|ewb)\b/.test(q)) return ewayAnswer(q, ctx);
  if (/\b(receipts?|proof of delivery|pod|signed|signatures?|who received)\b/.test(q)) return receiptAnswer(q, ctx);
  if (/\b(re-?order|next order|due to order|will order|repeat (order|client|customer)|predict)/.test(q)) return reorderAnswer(q, ctx);
  if (/\b(freight|shipping cost|courier charges?|spent on|kharcha)\b/.test(q)) return freightAnswer(q, ctx);
  if (/\b(best|recommend|which courier|cheapest|affordable|fastest|sasta)\b/.test(q) && /\b(courier|partner|ship with|send|use)\b/.test(q)) return courierAnswer(q, ctx);
  if (/\b(average|avg|how long|transit time|delivery time|days to deliver)\b/.test(q)) return transitAnswer(q, ctx);
  if (/\b(top|most|biggest|highest|best)\b/.test(q) && /\b(client|customer|cit(y|ies)|state|destination|place|product|item|courier)s?\b/.test(q)) return rankingAnswer(q, ctx);
  if (/\b(stock|inventory|in hand|available|left|out of stock|low stock|units of|maal)\b/.test(q) && !/\bshipments?\b/.test(q)) return stockAnswer(q, ctx);
  if (/\b(shipments?|orders?|parcels?|consignments?|deliver|transit|dispatch|ship|pending|late|delayed|exception|stuck|ofd|courier|sent|booked)\b/.test(q) || parseRange(q)) {
    return shipmentsAnswer(q, ctx);
  }
  // A bare item or client name: stock first, then shipments.
  if (findMention(q, vocab.items, (i) => i.name, { min: 0.8 })) return stockAnswer(q, ctx);
  if (findMention(q, vocab.customers, undefined, { min: 0.8 })) return shipmentsAnswer(q, ctx);
  return { answer: `Sorry, I didn't catch that.\n${HELP}`, suggestions: SUGGESTIONS };
}

async function ask(question, userId) {
  const result = await answer(question, userId);
  return { suggestions: [], items: [], ...result, askedAt: new Date() };
}

module.exports = { ask, parseRange, findMention, statusFrom, SUGGESTIONS };
