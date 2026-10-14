const ApiUsage = require('../models/ApiUsage');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * Hard daily limits on every paid outside API, so a bug, a busy day or someone misusing
 * the app can never run a key's quota or bill up. Each call takes one slot first; when
 * the day's slots are gone, calls fail until midnight (India time).
 *
 * Background jobs (courier polling, photo search, duplicate finder) stop early, leaving
 * `reserve` slots for what people do by hand - scanning a label, adding a shipment.
 */
const PROVIDERS = {
  gemini: { name: 'Gemini', env: 'GEMINI_DAILY_LIMIT', reserve: 15 },
  trackingmore: { name: 'TrackingMore', env: 'TRACKINGMORE_DAILY_LIMIT', reserve: 10 },
  whatsapp: { name: 'WhatsApp (Anantya)', env: 'WHATSAPP_API_DAILY_LIMIT', reserve: 0 },
};
const DEFAULT_LIMIT = 40;

const limitOf = (provider) => Math.max(0, Number(process.env[PROVIDERS[provider].env]) || DEFAULT_LIMIT);
const indiaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** The error a capped call fails with - shaped like a 429 from the API itself, so existing quota handling applies. */
class BudgetError extends ApiError {
  constructor(provider, limit, background) {
    const name = PROVIDERS[provider].name;
    super(
      429,
      background
        ? `${name}: background use paused - the rest of today's ${limit} calls are kept for your own actions`
        : `${name} daily limit reached (${limit} calls) - it resets at midnight`
    );
    this.isBudget = true;
    this.response = { status: 429, data: { error: { message: this.message }, message: this.message } };
  }
}

/** Takes one call's slot for `provider`, or throws BudgetError. */
async function take(provider, { background = false } = {}) {
  const limit = limitOf(provider);
  const ceiling = background ? Math.max(0, limit - PROVIDERS[provider].reserve) : limit;
  const day = indiaDay();
  await ApiUsage.updateOne({ day, provider }, { $setOnInsert: { day, provider } }, { upsert: true }).catch((err) => {
    if (err.code !== 11000) throw err; // created by a call running alongside
  });
  // Atomic: only counts the call while the day is under the ceiling.
  const taken = await ApiUsage.findOneAndUpdate({ day, provider, count: { $lt: ceiling } }, { $inc: { count: 1 } });
  if (taken) return;
  await ApiUsage.updateOne({ day, provider }, { $inc: { blocked: 1 } });
  logger.warn(`${PROVIDERS[provider].name} call refused - ${background ? 'background ' : ''}limit reached (${ceiling}/${limit} today)`);
  throw new BudgetError(provider, limit, background);
}

/** How many calls are left today (for the background jobs to plan with). */
async function remaining(provider) {
  const row = await ApiUsage.findOne({ day: indiaDay(), provider }).lean();
  return Math.max(0, limitOf(provider) - (row?.count || 0));
}

/** Today's use of each API against its limit - for Settings. */
async function usageToday() {
  const rows = await ApiUsage.find({ day: indiaDay() }).lean();
  return Object.entries(PROVIDERS).map(([key, p]) => {
    const row = rows.find((r) => r.provider === key);
    return { provider: key, name: p.name, used: row?.count || 0, limit: limitOf(key), blocked: row?.blocked || 0 };
  });
}

module.exports = { take, remaining, usageToday, BudgetError, PROVIDERS };
