const Shipment = require('../models/Shipment');
const Feedback = require('../models/Feedback');
const { STATUSES } = require('../utils/statusMap');

const HOUR_MS = 60 * 60 * 1000;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekdayInIndia = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });

/** When the order was booked: the shipping date, else the first scan, else when it was added. */
function bookedAt(s) {
  return s.shippingDate || s.checkpoints[0]?.checkpointTime || s.createdAt;
}

/**
 * When the consignment physically left with the courier: the courier's pickup
 * milestone, else the first scan past "pending". null while it's still waiting to be
 * collected - an order booked Monday and picked up Tuesday is a Tuesday shipment.
 */
function dispatchedAt(s) {
  if (s.carrierRoute?.pickupAt) return s.carrierRoute.pickupAt;
  const moved = s.checkpoints.find((cp) => cp.status !== 'pending');
  return moved ? moved.checkpointTime : null;
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Where orders go. The client's delivery address wins; without one, the destination
 * the courier reports. Grouped by city (within its state) and by state, with orders,
 * units and freight - so the team can see which locations buy the most.
 */
function locationBreakdown(shipments) {
  const cities = new Map();
  const states = new Map();
  let unknown = 0;
  const bump = (map, key, label, s) => {
    const row = map.get(key) || { key, label, orders: 0, units: 0, freight: 0, stateVotes: {} };
    row.orders += 1;
    row.units += Number(s.productDetails?.quantity) || 0;
    row.freight += Number(s.freightAmount) || 0;
    map.set(key, row);
    return row;
  };

  const located = shipments.map((s) => ({
    s,
    city: titleCase(s.deliveryAddress?.city || s.carrierRoute?.destinationCity),
    state: titleCase(s.deliveryAddress?.state || s.carrierRoute?.destinationState),
  }));
  // A city entered without its state still belongs to that city: learn each city's
  // state from the shipments that do have one, so "Pune" and "Pune, Maharashtra"
  // are one row, and the state totals include it.
  const cityState = new Map();
  for (const { city, state } of located) {
    if (!city || !state) continue;
    const votes = cityState.get(city.toLowerCase()) || {};
    votes[state] = (votes[state] || 0) + 1;
    cityState.set(city.toLowerCase(), votes);
  }
  const likelyState = (city) => {
    const votes = cityState.get(city.toLowerCase());
    return votes ? Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] : '';
  };

  for (const { s, city, state: rawState } of located) {
    const state = rawState || (city ? likelyState(city) : '');
    if (!city && !state) {
      unknown += 1;
      continue;
    }
    if (city) {
      const row = bump(cities, city.toLowerCase(), city, s);
      if (state) row.stateVotes[state] = (row.stateVotes[state] || 0) + 1;
    }
    if (state) bump(states, state.toLowerCase(), state, s);
  }

  const finish = (map, withState) =>
    [...map.values()]
      .map(({ stateVotes, ...row }) => {
        const top = Object.entries(stateVotes).sort((a, b) => b[1] - a[1])[0]?.[0];
        return withState && top ? { ...row, label: `${row.label}, ${top}` } : row;
      })
      .sort((a, b) => b.orders - a.orders || b.units - a.units);
  return { cities: finish(cities, true), states: finish(states, false), unknown };
}

/**
 * Orders, units and deliveries per day of the week (Monday first, India time), so the
 * team can see which days are busiest and staff / stock for them.
 */
function weekdayBreakdown(shipments) {
  const rows = WEEKDAYS.map((day) => ({ day, orders: 0, shipments: 0, units: 0, deliveries: 0 }));
  const indexOf = (date) => WEEKDAYS.indexOf(weekdayInIndia.format(new Date(date)));
  for (const s of shipments) {
    const booked = indexOf(bookedAt(s));
    if (booked >= 0) {
      rows[booked].orders += 1;
      rows[booked].units += Number(s.productDetails?.quantity) || 0;
    }
    const left = dispatchedAt(s);
    if (left) {
      const d = indexOf(left);
      if (d >= 0) rows[d].shipments += 1;
    }
    const delivered = [...s.checkpoints].reverse().find((cp) => cp.status === 'delivered');
    if (delivered) {
      const d = indexOf(delivered.checkpointTime);
      if (d >= 0) rows[d].deliveries += 1;
    }
  }
  return rows;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Computes summary metrics over a user's shipments in a date range. Volume here is
 * small (a few shipments/week per the product brief), so this reduces the fetched
 * documents in plain JS rather than a Mongo aggregation pipeline - simpler to read
 * and plenty fast at this scale.
 */
async function getAnalyticsSummary({ userId, from, to }) {
  const query = { createdBy: userId };
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = endOfDay(to);
  }

  const shipments = await Shipment.find(query);

  // Average transit time: Pending -> Delivered, using the oldest checkpoint (or
  // shippingDate/createdAt if checkpoints haven't landed yet) as the "Pending" anchor.
  const transitHours = [];
  for (const s of shipments) {
    if (s.status !== 'delivered') continue;
    const delivered = [...s.checkpoints].reverse().find((cp) => cp.status === 'delivered');
    if (!delivered) continue;
    const start = s.checkpoints.length ? s.checkpoints[0].checkpointTime : s.shippingDate || s.createdAt;
    const hours = (new Date(delivered.checkpointTime) - new Date(start)) / HOUR_MS;
    if (hours >= 0) transitHours.push(hours);
  }
  const averageTransitHours = transitHours.length
    ? transitHours.reduce((sum, h) => sum + h, 0) / transitHours.length
    : null;
  // An average on its own hides the spread - the fastest/slowest pair is what tells
  // you whether 3.7 days is the norm or the midpoint of 1 day and 7.
  const fastestTransitHours = transitHours.length ? Math.min(...transitHours) : null;
  const slowestTransitHours = transitHours.length ? Math.max(...transitHours) : null;

  // On-time delivery %: of delivered shipments with an estimatedDelivery set, the
  // share where the delivered checkpoint landed on or before that date.
  let onTimeCount = 0;
  let onTimeEligible = 0;
  for (const s of shipments) {
    if (s.status !== 'delivered' || !s.estimatedDelivery) continue;
    const delivered = [...s.checkpoints].reverse().find((cp) => cp.status === 'delivered');
    if (!delivered) continue;
    onTimeEligible += 1;
    if (new Date(delivered.checkpointTime) <= endOfDay(s.estimatedDelivery)) onTimeCount += 1;
  }
  const onTimeDeliveryRate = onTimeEligible ? onTimeCount / onTimeEligible : null;

  // Per-courier comparison - the point of tracking more than one courier is being able
  // to see which one is faster, more punctual and less trouble on the same lanes.
  const byCarrier = new Map();
  for (const s of shipments) {
    const key = s.carrierCode;
    if (!byCarrier.has(key)) {
      byCarrier.set(key, {
        carrierCode: key,
        carrierName: s.carrierName || key,
        total: 0,
        exceptions: 0,
        delivered: 0,
        transitHoursSum: 0,
        onTimeEligible: 0,
        onTimeCount: 0,
      });
    }
    const b = byCarrier.get(key);
    b.total += 1;
    if (s.status === 'exception') b.exceptions += 1;
    const deliveredCp = [...s.checkpoints].reverse().find((cp) => cp.status === 'delivered');
    if (s.status === 'delivered' && deliveredCp) {
      const start = s.checkpoints.length ? s.checkpoints[0].checkpointTime : s.shippingDate || s.createdAt;
      const hours = (new Date(deliveredCp.checkpointTime) - new Date(start)) / HOUR_MS;
      if (hours >= 0) {
        b.delivered += 1;
        b.transitHoursSum += hours;
      }
      if (s.estimatedDelivery) {
        b.onTimeEligible += 1;
        if (new Date(deliveredCp.checkpointTime) <= endOfDay(s.estimatedDelivery)) b.onTimeCount += 1;
      }
    }
  }
  const exceptionRateByCarrier = [...byCarrier.values()]
    .map(({ transitHoursSum, ...b }) => ({
      ...b,
      rate: b.total ? b.exceptions / b.total : 0,
      averageTransitHours: b.delivered ? transitHoursSum / b.delivered : null,
      onTimeRate: b.onTimeEligible ? b.onTimeCount / b.onTimeEligible : null,
    }))
    .sort((a, b) => b.total - a.total);
  const exceptionCount = shipments.filter((s) => s.status === 'exception').length;

  // Where the book of business is sitting right now, and how much of it has already
  // blown its promised date - the two numbers an ops lead checks before anything else.
  const statusBreakdown = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  let lateCount = 0;
  const now = new Date();
  for (const s of shipments) {
    if (statusBreakdown[s.status] !== undefined) statusBreakdown[s.status] += 1;
    if (s.status !== 'delivered' && s.estimatedDelivery && endOfDay(s.estimatedDelivery) < now) {
      lateCount += 1;
    }
  }

  // Customer satisfaction over the same set of shipments. Scoped by shipment id
  // rather than date, so a rating left last week for a shipment inside the range
  // still counts toward that range.
  const feedbacks = await Feedback.find({ shipmentId: { $in: shipments.map((s) => s._id) } });
  const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of feedbacks) ratingBreakdown[f.rating] += 1;
  const averageRating = feedbacks.length
    ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length
    : null;
  const deliveredTotal = shipments.filter((s) => s.status === 'delivered').length;

  return {
    totalShipments: shipments.length,
    totalDelivered: transitHours.length,
    averageTransitHours,
    fastestTransitHours,
    slowestTransitHours,
    onTimeDeliveryRate,
    onTimeEligible,
    onTimeCount,
    statusBreakdown,
    lateCount,
    averageRating,
    feedbackCount: feedbacks.length,
    feedbackEligible: deliveredTotal,
    ratingBreakdown,
    exceptionRateByCarrier,
    exceptionCount,
    exceptionRate: shipments.length ? exceptionCount / shipments.length : 0,
    weekdayBreakdown: weekdayBreakdown(shipments),
    locationBreakdown: locationBreakdown(shipments),
    dateRange: { from: from || null, to: to || null },
  };
}

module.exports = { getAnalyticsSummary };
