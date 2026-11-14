const { Settings, Use } = require('../models/TrackingCredit');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * TrackingMore credits: one is spent each time a tracking number is registered with it.
 * The app counts them itself (TrackingMore has no free way to ask), refuses to register
 * once the plan's credits are gone - so there's never an overage bill - and tells every
 * open screen the moment one is spent.
 */

const IST_MS = 330 * 60 * 1000;
/** The hourly check never takes the last few credits - they're kept for new shipments. */
const reserveFor = (allowance) => Math.min(5, Math.ceil(allowance * 0.1));

class CreditError extends ApiError {
  constructor(message) {
    super(402, message);
    this.isCredit = true;
    this.response = { status: 402, data: { message } };
  }
}

async function getSettings() {
  return (
    (await Settings.findOne({ key: 'default' })) ||
    Settings.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true, new: true })
  );
}

/** The anchor's day and time of day, in `year`/`month` (India time), clamped to short months. */
function onMonth(anchor, year, month) {
  const a = new Date(anchor.getTime() + IST_MS);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(a.getUTCDate(), lastDay), a.getUTCHours(), a.getUTCMinutes()) - IST_MS);
}

/** The current counting window: [start, renewsAt) - renewsAt is null on a plan that doesn't refill. */
function period(settings, now = new Date()) {
  const anchor = new Date(settings.periodStart);
  if (!settings.resetsMonthly || now < anchor) return { start: anchor, renewsAt: null };
  const n = new Date(now.getTime() + IST_MS);
  let start = onMonth(anchor, n.getUTCFullYear(), n.getUTCMonth());
  if (start > now) start = onMonth(anchor, n.getUTCFullYear(), n.getUTCMonth() - 1);
  if (start < anchor) start = anchor;
  const s = new Date(start.getTime() + IST_MS);
  return { start, renewsAt: onMonth(anchor, s.getUTCFullYear(), s.getUTCMonth() + 1) };
}

/** Credits used and left in the current window. */
async function status({ recent = 0 } = {}) {
  const settings = await getSettings();
  const { start, renewsAt } = period(settings);
  const counted = await Use.countDocuments({ at: { $gte: start } });
  // The typed-in "used before the app counted" only belongs to the window it was typed in.
  const offset = settings.usedOffsetFor && new Date(settings.usedOffsetFor).getTime() === start.getTime() ? settings.usedOffset : 0;
  const used = Math.max(0, counted + offset);
  const out = {
    allowance: settings.allowance,
    used,
    left: Math.max(0, settings.allowance - used),
    periodStart: start,
    renewsAt,
    resetsMonthly: settings.resetsMonthly,
    autoRegister: settings.autoRegister,
    updatedByName: settings.updatedByName,
  };
  if (recent) {
    out.recent = await Use.find({ at: { $gte: start } }).sort({ at: -1 }).limit(recent).lean();
  }
  return out;
}

function broadcast() {
  status()
    .then((s) => require('../sockets').emitAll('credits:updated', s))
    .catch(() => {});
}

/**
 * Takes one credit before a tracking number is registered, or refuses. Returns a
 * release() to call if TrackingMore didn't actually register it (already there, error).
 */
async function take({ trackingNumber = '', carrierCode = '', shipmentId = null, byName = '', source = 'new-shipment', background = false } = {}) {
  const settings = await getSettings();
  if (background && !settings.autoRegister) {
    throw new CreditError('TrackingMore credits: the hourly check does not register shipments (switched off)');
  }
  const s = await status();
  const floor = background ? reserveFor(s.allowance) : 0;
  if (s.left <= floor) {
    const message =
      s.left === 0
        ? `No TrackingMore credits left (${s.used} of ${s.allowance} used)${s.renewsAt ? ' - they refill on the renewal date' : ''}. The shipment is saved but isn't being tracked.`
        : `TrackingMore credits: the last ${floor} are kept for new shipments`;
    throw new CreditError(message);
  }
  const use = await Use.create({ trackingNumber, carrierCode, shipment: shipmentId, source, byName });
  broadcast();
  return async function release() {
    await Use.deleteOne({ _id: use._id }).catch(() => {});
    broadcast();
  };
}

async function updateSettings(patch, byName) {
  const settings = await getSettings();
  if (patch.allowance !== undefined) {
    const n = Math.round(Number(patch.allowance));
    if (!Number.isFinite(n) || n < 0 || n > 1000000) throw new ApiError(400, 'Credits in the plan must be a number');
    settings.allowance = n;
  }
  if (patch.periodStart !== undefined) {
    const d = new Date(patch.periodStart);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Pick a valid start date');
    settings.periodStart = d;
  }
  if (patch.resetsMonthly !== undefined) settings.resetsMonthly = Boolean(patch.resetsMonthly);
  if (patch.autoRegister !== undefined) settings.autoRegister = Boolean(patch.autoRegister);
  settings.updatedByName = byName || '';
  // "Used so far" is what TrackingMore's dashboard shows: keep the difference from our own count.
  if (patch.usedSoFar !== undefined) {
    const n = Math.round(Number(patch.usedSoFar));
    if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'Credits used must be a number');
    const { start } = period(settings);
    const counted = await Use.countDocuments({ at: { $gte: start } });
    settings.usedOffset = n - counted;
    settings.usedOffsetFor = start;
  }
  await settings.save();
  logger.info(`TrackingMore credit settings changed by ${byName || 'someone'}: ${JSON.stringify(patch)}`);
  broadcast();
  return status({ recent: 20 });
}

/**
 * Plan changes the user asked for, applied once on start-up (no one has to type them
 * into the live site). Each runs a single time, recorded in appliedChanges.
 */
const PLAN_CHANGES = [
  {
    // 2026-11-14: moved to the 100-credits-a-month plan, starting today with all 100 left.
    id: 'plan-100-monthly-2026-11-14',
    apply: async (settings) => {
      const start = new Date('2026-11-14T00:00:00+05:30');
      settings.allowance = 100;
      settings.resetsMonthly = true;
      settings.periodStart = start;
      settings.usedOffset = -(await Use.countDocuments({ at: { $gte: start } }));
      settings.usedOffsetFor = start;
      settings.updatedByName = 'Plan update (100 a month)';
    },
  },
];

async function applyPlanChanges() {
  const settings = await getSettings();
  const due = PLAN_CHANGES.filter((c) => !settings.appliedChanges.includes(c.id));
  if (!due.length) return;
  for (const c of due) {
    await c.apply(settings);
    settings.appliedChanges.push(c.id);
  }
  await settings.save();
  logger.info(`TrackingMore credit plan updated: ${due.map((c) => c.id).join(', ')}`);
  broadcast();
}

module.exports = { take, status, updateSettings, period, applyPlanChanges, CreditError };
