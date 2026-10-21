const mongoose = require('mongoose');
const Shipment = require('../models/Shipment');
const StockItem = require('../models/StockItem');
const StockCategory = require('../models/StockCategory');
const { toEnglish } = require('./assistant/language');
const { stateOf, cityOf, placeIn, goesTo } = require('./assistant/places');

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
  const [couriers, customers, cities, routeCities, items, categories] = await Promise.all([
    // Aggregations don't convert ids like find() does - pass a real ObjectId.
    Shipment.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(String(userId)) } },
      { $group: { _id: '$carrierCode', name: { $first: '$carrierName' } } },
    ]),
    Shipment.distinct('customerInfo.name', { createdBy: userId }),
    Shipment.distinct('deliveryAddress.city', { createdBy: userId }),
    Shipment.distinct('carrierRoute.destinationCity', { createdBy: userId }),
    StockItem.find({ isArchived: false }).select('name size').lean(),
    StockCategory.find().select('name').lean(),
  ]);
  const vocab = {
    couriers: couriers.filter((c) => c._id).map((c) => ({ code: c._id, name: c.name || c._id })),
    customers: customers.filter(Boolean),
    // Cities shipped to (address or courier route) - states are known from places.js.
    cities: [...new Set([...cities, ...routeCities].filter(Boolean).map((p) => p.trim()))],
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

/** The question with a matched name's words taken out. */
function withoutWords(q, name) {
  const drop = new Set(tokens(name));
  return ` ${norm(q)
    .split(' ')
    .filter((w) => !drop.has(w))
    .join(' ')} `;
}

/**
 * Items whose name contains every word asked about ("hs1 pads" finds "Philips Heartstart
 * HS1 Onsite Pads-M5071A"), best first - long catalogue names rarely match whole.
 */
function itemsMentioned(q, list, nameOf) {
  const asked = tokens(q).filter((w) => !/^(in|left|available|units?|qty|quantity|how|much)$/.test(w));
  if (!asked.length) return [];
  const scored = [];
  for (const entry of list) {
    const nameWords = tokens(nameOf(entry));
    const has = (w) => nameWords.some((n) => n === w || (w.length >= 3 && (n.startsWith(w) || (n.length >= 3 && w.startsWith(n)))));
    const hit = asked.filter(has).length;
    if (hit) scored.push({ value: entry, coverage: hit / asked.length, extra: nameWords.length - hit });
  }
  const best = Math.max(0, ...scored.map((s) => s.coverage));
  if (best < 0.99 && !(asked.length >= 3 && best >= 0.66)) return [];
  return scored.filter((s) => s.coverage === best).sort((a, b) => a.extra - b.extra).map((s) => s.value);
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

const placeOf = (s) => [cityOf(s), stateOf(s)].filter(Boolean).join(', ');
const shipmentItem = (s) => ({
  label: `${s.customerInfo?.name || 'No customer'} - ${s.productDetails?.name || 'shipment'}`,
  sub: [s.trackingNumber, s.carrierName, s.status === 'delivered' && s.deliveredAt ? `delivered ${fmtDate(s.deliveredAt)}` : STATUS_LABEL[s.status], placeOf(s) || s.currentLocation]
    .filter(Boolean)
    .join(' · '),
  href: `/shipments/${s._id}`,
});

/** "by state", "statewise", "per courier"... -> what to split the answer by. */
function groupByFrom(q) {
  if (/\bby state\b|\bstates?\b.*\b(wise|breakdown|split)\b|\bin (each|every) state\b|\bwhich states?\b/.test(q)) return 'state';
  if (/\bby city\b|\bcit(y|ies)\b.*\b(wise|breakdown|split)\b|\bwhich cit(y|ies)\b/.test(q)) return 'city';
  if (/\bby courier\b|\bcourier (wise|breakdown)\b|\bwhich couriers?\b/.test(q)) return 'courier';
  if (/\bby (client|customer)\b|\b(client|customer) (wise|breakdown)\b|\bwhich (clients|customers)\b/.test(q)) return 'customer';
  return null;
}

/**
 * The filters a question sets: status, date range, courier, client, place, and how to
 * split the answer. Only what the question actually says - a follow-up merges these
 * onto the previous question's filters.
 */
function shipmentFilters(q, vocab) {
  const f = {};
  const status = statusFrom(q);
  if (status) f.status = status;
  const range = parseRange(q);
  if (range) f.range = { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label };
  if (/\b(ship(ped)?|sent|dispatch(ed)?|book(ed)?|created|added)\b/.test(q)) f.sentVerb = true;
  const courier = findMention(q, vocab.couriers, (c) => c.name, { min: 0.75 });
  if (courier) f.courier = { code: courier.value.code, name: courier.value.name };
  // Words that named the courier ("Shree Maruti") can't also name a client or place.
  const rest = courier ? withoutWords(q, courier.value.name) : q;
  const place = placeIn(rest, vocab.cities);
  if (place) f.place = place;
  const customer = findMention(place ? withoutWords(rest, place.name) : rest, vocab.customers, undefined, { min: 0.7 });
  if (customer && !(place && norm(customer.value) === norm(place.name))) f.customer = customer.value;
  const groupBy = groupByFrom(q);
  if (groupBy) f.groupBy = groupBy;
  return f;
}

/** Plain-words description of a set of filters: "in transit right now to Gujarat with Shree Maruti". */
function describe(f) {
  const parts = [];
  if (f.courier) parts.push(`with ${f.courier.name}`);
  if (f.customer) parts.push(`for ${f.customer}`);
  if (f.place) parts.push(`going to ${f.place.name}`);
  const range = f.range ? { label: f.range.label } : null;
  if (f.status === 'delivered') parts.push(`delivered${range ? ` ${range.label}` : ''}`);
  else if (f.status === 'late') parts.push('late or held up right now');
  else if (f.status === 'active') parts.push('not delivered yet');
  else if (f.status) parts.push(`${STATUS_LABEL[f.status]}${range && f.sentVerb ? ` (shipped ${range.label})` : ' right now'}`);
  else if (range) parts.push(`shipped ${range.label}`);
  return parts.join(' ');
}

function applyFilters(all, f) {
  const range = f.range ? { from: new Date(f.range.from), to: new Date(f.range.to) } : null;
  return all.filter((s) => {
    if (f.courier && s.carrierCode !== f.courier.code) return false;
    if (f.customer && norm(s.customerInfo?.name) !== norm(f.customer)) return false;
    if (f.place && !goesTo(s, f.place)) return false;
    if (f.status === 'delivered') return s.status === 'delivered' && (!range || inRange(s.deliveredAt, range));
    if (f.status === 'late') return isLate(s);
    if (f.status === 'active') return s.status !== 'delivered';
    if (f.status) {
      if (s.status !== f.status) return false;
      return !(range && f.sentVerb) || inRange(s.shippingDate || s.createdAt, range);
    }
    return !range || inRange(s.shippingDate || s.createdAt, range);
  });
}

function breakdown(list, by) {
  const keyOf = {
    state: (s) => stateOf(s) || 'State not known',
    city: (s) => cityOf(s) || 'City not known',
    courier: (s) => s.carrierName || s.carrierCode,
    customer: (s) => s.customerInfo?.name || 'No customer',
  }[by];
  const counts = {};
  for (const s of list) {
    const k = keyOf(s);
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/**
 * Shipments: count / list / breakdown for the filters asked. `base` is the previous
 * question's filters when this one follows up on it ("how many of them are from
 * Gujarat?" after "how many are in transit?").
 */
async function shipmentsAnswer(q, ctx, base = null) {
  const { userId, vocab } = ctx;
  const asked = shipmentFilters(q, vocab);
  // A follow-up narrows or adjusts the last question; a split ("by state") is a one-off.
  const filters = base ? { ...base, groupBy: undefined, ...asked } : asked;
  // Splitting by state / city / courier / client covers all of them, not the one picked before.
  const dropForSplit = { state: 'place', city: 'place', courier: 'courier', customer: 'customer' }[filters.groupBy];
  if (dropForSplit && !asked[dropForSplit]) delete filters[dropForSplit];
  const wantsList = /\b(show|list|which|what are|details|give|names?)\b/.test(q) && !filters.groupBy;

  const all = await Shipment.find({ createdBy: userId, isArchived: false }).select(SHIPMENT_FIELDS).lean();
  const list = applyFilters(all, filters);
  const n = list.length;
  const lines = [];

  if (base && Object.keys(asked).some((k) => k !== 'groupBy')) {
    // Compared with the earlier set minus what this question replaces ("what about Delhi"
    // after Maharashtra compares with all of them, not with the Maharashtra ones).
    const earlier = { ...base, groupBy: undefined };
    for (const k of Object.keys(asked)) delete earlier[k];
    const before = applyFilters(all, earlier).length;
    lines.push(
      `Of the ${plural(before, 'shipment')} ${describe(earlier)}, **${n.toLocaleString('en-IN')}** ${n === 1 ? 'is' : 'are'} ${describe(asked) || 'a match'}.`.replace(/\s+/g, ' ')
    );
  } else {
    lines.push(`**${plural(n, 'shipment')}** ${describe(filters) || 'in total'}.`.replace(/\s+/g, ' ').replace(' .', '.'));
  }

  if (filters.groupBy && n) {
    const rows = breakdown(list, filters.groupBy);
    lines.push(`By ${filters.groupBy}:`);
    return {
      answer: lines.join('\n'),
      items: rows.slice(0, 20).map(([k, c]) => ({ label: k, sub: plural(c, 'shipment') })),
      context: { kind: 'shipments', filters: { ...filters, groupBy: undefined } },
    };
  }
  if (n > 1 && !filters.courier) {
    const top = breakdown(list, 'courier').slice(0, 4);
    if (top.length > 1) lines.push(`By courier: ${top.map(([c, k]) => `${c} ${k}`).join(', ')}.`);
  }
  if (n > 1 && !filters.place) {
    const states = breakdown(list, 'state').filter(([k]) => k !== 'State not known').slice(0, 4);
    if (states.length > 1) lines.push(`Top states: ${states.map(([k, c]) => `${k} ${c}`).join(', ')}.`);
  }
  if (filters.status === 'late' && n) lines.push('Late = past its promised date, held up, or on the road for over a week.');
  const sorted = [...list].sort((a, b) => new Date(b.deliveredAt || b.shippingDate || b.createdAt) - new Date(a.deliveredAt || a.shippingDate || a.createdAt));
  const show = wantsList || n <= 8 ? sorted.slice(0, 15) : sorted.slice(0, 5);
  if (n > show.length && show.length) lines.push(`Latest ${show.length}:`);
  return { answer: lines.join('\n'), items: show.map(shipmentItem), context: { kind: 'shipments', filters } };
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
  const one = (i) => {
    const value = i.quantity * (i.salePrice ?? i.purchasePrice ?? 0);
    return {
      answer: `**${name(i)}**: **${i.quantity}** in ${book}${i.oldQuantity != null ? ` (${i.oldQuantity} old + ${i.quantity - i.oldQuantity} new)` : ''}${value ? `, worth ${inr(value)} at sale price` : ''}.${i.lowStockAt != null ? ` Reorder level ${i.lowStockAt}.` : ''}`,
      items: [row(i)],
    };
  };
  // An item named exactly, else a category named exactly, else items containing the words asked.
  const exact = findMention(q, items, name, { min: 1 });
  const category = findMention(q, categories, (c) => c.name, { min: 0.9 });
  if (exact && (!category || exact.score >= category.score)) return one(exact.value);
  const matches = category && category.score >= 1 ? [] : itemsMentioned(q, items, name);
  if (matches.length === 1) return one(matches[0]);
  if (matches.length > 1) {
    const units = matches.reduce((n, i) => n + i.quantity, 0);
    return {
      answer: `**${plural(matches.length, 'item')}** match - **${plural(units, 'unit')}** in ${book} between them.`,
      items: [...matches].sort((a, b) => b.quantity - a.quantity).slice(0, 12).map(row),
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
      answer: `For **${l.state}**, use **${l.recommended.carrierName}** - fewest problems${l.recommended.averageTransitHours != null ? `, ${l.recommended.averageTransitHours < 24 ? 'usually same day' : `about ${(l.recommended.averageTransitHours / 24).toFixed(1)} days`}` : ''}.`,
      items: l.options.map((o) => ({ label: o.carrierName, sub: `${o.shipments} shipments · ${o.averageTransitHours == null ? '-' : o.averageTransitHours < 24 ? 'same day' : `${(o.averageTransitHours / 24).toFixed(1)} days`}${o.medianFreight != null ? ` · typically ${inr(o.medianFreight)}` : ''}`, href: '/couriers' })),
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
    city: (s) => cityOf(s),
    state: (s) => stateOf(s),
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
  'Shipments by state',
  'What is out of stock?',
  'Who is due to reorder?',
  'Best courier',
  'Aaj kitne deliver hue?',
];

const HELP = `I answer from your live data - nothing is sent anywhere. Ask in English or Hinglish, and follow up on my last answer ("how many of them are from Gujarat?", "unme se Maharashtra ke?", "what about delivered?"). Try:
• "How many shipments are in transit?" / "delivered today" / "shipped last week"
• "Late shipments" · "shipments to Bengaluru" · "Shree Maruti shipments this month"
• "Shipments by state" · "in transit by courier" · "delivered last month by city"
• An AWB number for its status
• "Stock of HS1 pads" · "out of stock" · "low stock" · "manual stock out of stock"
• "Who is due to reorder?" · "overdue reorders"
• "Best courier" · "cheapest courier" · "best courier for Karnataka"
• "Freight this month" · "receipts pending" · "e-way bill missing"
• "Top clients this year" · "average delivery time"
• Hinglish: "aaj kitne deliver hue", "raste mein kitne hain", "kaunsa courier sabse sasta", "HS1 pads kitne bache"`;

/** "of them", "those", "what about...", "and ..." - builds on the previous answer. */
const FOLLOW_UP = /\b(of them|them|those|these|they|of these|of those|among them|out of them|what about|and|also|same)\b/;
const SHIPMENT_WORDS = /\b(shipments?|orders?|parcels?|consignments?|deliver|delivered|transit|dispatch|ship|shipped|pending|late|delayed|exception|stuck|ofd|courier|sent|booked|on the way)\b/;
const STOCK_WORDS = /\b(stock|inventory|in hand|available|left|out of stock|low stock|units of|quantity of)\b/;

async function answer(question, userId, previous = null) {
  const raw = String(question || '').slice(0, 300);
  const q = toEnglish(raw);
  if (!raw.trim() || (/\b(help|what can you|hello|hi|hey|namaste|namaskar)\b/.test(q) && raw.trim().split(/\s+/).length <= 4)) {
    return { answer: HELP, suggestions: SUGGESTIONS, context: previous };
  }
  const vocab = await vocabulary(userId);
  const ctx = { userId, vocab };
  const lastShipments = previous?.kind === 'shipments' ? previous.filters : null;

  const awb = raw.match(/\b([A-Za-z]{0,3}\d{8,15})\b/);
  if (awb) return awbAnswer(awb[1], ctx);
  if (/\b(e-?way|ewb)\b/.test(q)) return receiptOr(ewayAnswer, q, ctx);
  if (/\b(receipts?|proof of delivery|pod|signed|signatures?|who received)\b/.test(q)) return receiptOr(receiptAnswer, q, ctx);
  if (/\b(re-?order|next order|due to order|will order|repeat (order|client|customer)|predict)/.test(q)) return receiptOr(reorderAnswer, q, ctx);
  if (/\b(freight|shipping cost|courier charges?|spent on)\b/.test(q)) return receiptOr(freightAnswer, q, ctx);
  if (/\b(best|recommend|which courier|cheapest|affordable|fastest)\b/.test(q) && /\b(courier|partner|ship with|send|use)\b/.test(q)) return receiptOr(courierAnswer, q, ctx);
  if (/\b(average|avg|how long|transit time|delivery time|days to deliver)\b/.test(q)) return receiptOr(transitAnswer, q, ctx);
  if (/\b(top|most|biggest|highest)\b/.test(q) && /\b(client|customer|cit(y|ies)|state|destination|place|product|item|courier)s?\b/.test(q) && !lastShipments) {
    return receiptOr(rankingAnswer, q, ctx);
  }
  if (STOCK_WORDS.test(q) && !SHIPMENT_WORDS.test(q)) return receiptOr(stockAnswer, q, ctx);

  // Shipments - fresh, or building on the last shipments answer.
  const asked = shipmentFilters(q, vocab);
  const hasFilter = Object.keys(asked).length > 0;
  const followUp = lastShipments && (FOLLOW_UP.test(q) || (!SHIPMENT_WORDS.test(q) && hasFilter));
  if (followUp) return shipmentsAnswer(q, ctx, lastShipments);
  if (SHIPMENT_WORDS.test(q) || hasFilter || /\bhow many\b/.test(q)) return shipmentsAnswer(q, ctx);

  // A bare item or client name: stock first, then shipments.
  if (findMention(q, vocab.items, (i) => i.name, { min: 0.8 })) return receiptOr(stockAnswer, q, ctx);
  return { answer: `Sorry, I didn't catch that.\n${HELP}`, suggestions: SUGGESTIONS, context: previous };
}

/** Other answers don't carry shipment filters forward - a later "of them" starts fresh. */
async function receiptOr(handler, q, ctx) {
  const result = await handler(q, ctx);
  return { ...result, context: null };
}

async function ask(question, userId, previous = null) {
  const result = await answer(question, userId, previous);
  return { suggestions: [], items: [], ...result, askedAt: new Date() };
}

module.exports = { ask, parseRange, findMention, statusFrom, itemsMentioned, withoutWords, shipmentFilters, toEnglish, SUGGESTIONS };
