const trackingMoreClient = require('./trackingmore.client');
const { DEFAULT_CARRIER_CODE, DEFAULT_CARRIER_NAME } = require('../config/carrier');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const CourierCatalog = require('../models/CourierCatalog');
const { APP_COURIERS } = require('../utils/couriers');

/**
 * TrackingMore's courier catalog (~1,700 couriers in 160 countries). Every shipment
 * create validates against it, so it must always be there:
 *  - the last good copy is kept in the database, so a restart doesn't need a call;
 *  - it's refreshed from TrackingMore at most once a day, and after a failed refresh
 *    (e.g. the day's TrackingMore calls are used up) not again for an hour;
 *  - with no copy at all, TrackingMore's 54 Indian couriers are built in
 *    (config/couriers.in.json, taken from the live list) - never just one courier.
 */
const TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAIL_MS = 60 * 60 * 1000;
let cache = { list: null, byCode: null, fetchedAt: 0 };
let inflight = null;
let lastFailAt = 0;
let triedDb = false;

function normalize(c) {
  const logo = c.courier_logo ? (c.courier_logo.startsWith('//') ? `https:${c.courier_logo}` : c.courier_logo) : '';
  return {
    code: c.courier_code,
    name: c.courier_name,
    country: c.courier_country_iso2 || '',
    logo,
    url: c.courier_url || '',
    phone: c.courier_phone || '',
    requiredFields: c.tracking_required_fields || [],
  };
}

const BUILT_IN = require('../config/couriers.in.json').map(normalize);
const FALLBACK = BUILT_IN.some((c) => c.code === DEFAULT_CARRIER_CODE)
  ? BUILT_IN
  : [{ code: DEFAULT_CARRIER_CODE, name: DEFAULT_CARRIER_NAME, country: 'IN', logo: '', url: '', phone: '', requiredFields: [] }, ...BUILT_IN];

function use(list, fetchedAt) {
  cache = { list, byCode: new Map(list.map((c) => [c.code, c])), fetchedAt };
}

async function load() {
  const res = await trackingMoreClient.listCarriers();
  const list = (res?.data || []).map(normalize).filter((c) => c.code && c.name);
  if (list.length === 0) throw new Error('TrackingMore returned an empty courier list');
  use(list, Date.now());
  await CourierCatalog.updateOne({ key: 'trackingmore' }, { $set: { list, fetchedAt: new Date() } }, { upsert: true }).catch((err) =>
    logger.warn(`Courier catalog not saved: ${err.message}`)
  );
  logger.info(`Courier catalog loaded: ${list.length} couriers`);
  return cache.list;
}

/** The saved copy, once per start - no TrackingMore call needed after a restart. */
async function fromDb() {
  if (triedDb) return;
  triedDb = true;
  const saved = await CourierCatalog.findOne({ key: 'trackingmore' }).lean().catch(() => null);
  if (saved?.list?.length) use(saved.list, new Date(saved.fetchedAt || 0).getTime());
}

async function getCatalog() {
  if (!cache.list) await fromDb();
  const fresh = cache.list && Date.now() - cache.fetchedAt < TTL_MS;
  if (fresh || Date.now() - lastFailAt < RETRY_AFTER_FAIL_MS) return cache.list || FALLBACK;
  if (!inflight) {
    inflight = load()
      .catch((err) => {
        lastFailAt = Date.now();
        logger.warn(`Courier catalog refresh failed (using the ${cache.list ? 'saved' : 'built-in'} list): ${err.message}`);
        return cache.list || FALLBACK;
      })
      .finally(() => {
        inflight = null;
      });
  }
  // A stale copy is still right for nearly every courier - don't make anyone wait.
  return cache.list || inflight;
}

async function findCourier(code) {
  const list = await getCatalog();
  const key = String(code || '').trim().toLowerCase();
  return (
    APP_COURIERS.find((c) => c.code === key) ||
    (cache.byCode && cache.byCode.get(key)) ||
    list.find((c) => c.code === key) ||
    FALLBACK.find((c) => c.code === key) ||
    null
  );
}

/**
 * Turns whatever the caller sent into a { carrierCode, carrierName } pair, or throws a
 * 400 naming the bad code. Empty -> the default courier.
 */
async function resolveCarrier(code) {
  if (!code) return { carrierCode: DEFAULT_CARRIER_CODE, carrierName: DEFAULT_CARRIER_NAME };
  const courier = await findCourier(code);
  if (!courier) {
    throw new ApiError(400, `Unknown courier code "${code}" - pick one from the courier list`);
  }
  return { carrierCode: courier.code, carrierName: courier.name };
}

/**
 * Couriers whose AWB format matches - TrackingMore's guess, not a fact. Tested on a
 * real Shree Maruti AWB it ranked Delhivery first, so the UI offers these as
 * suggestions and the person still picks.
 */
async function detectCouriers(trackingNumber) {
  const awb = String(trackingNumber || '').trim();
  if (awb.length < 4) throw new ApiError(400, 'Enter the tracking number first');
  const res = await trackingMoreClient.detectCourier(awb);
  return (res?.data || []).map(normalize).slice(0, 6);
}

module.exports = { getCatalog, findCourier, resolveCarrier, detectCouriers };
