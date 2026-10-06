const trackingMoreClient = require('./trackingmore.client');
const { DEFAULT_CARRIER_CODE, DEFAULT_CARRIER_NAME } = require('../config/carrier');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * TrackingMore's courier catalog (~1,700 couriers in 160 countries), fetched once and
 * cached for a day - it changes rarely and every shipment create validates against
 * it. If TrackingMore is unreachable the cache keeps serving the last good copy, and
 * on a cold start with no copy the default courier is still accepted.
 */
const TTL_MS = 24 * 60 * 60 * 1000;
let cache = { list: null, byCode: null, fetchedAt: 0 };
let inflight = null;

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

const FALLBACK = [
  {
    code: DEFAULT_CARRIER_CODE,
    name: DEFAULT_CARRIER_NAME,
    country: 'IN',
    logo: '',
    url: 'https://shreemaruti.com/',
    phone: '',
    requiredFields: [],
  },
];

async function load() {
  const res = await trackingMoreClient.listCarriers();
  const list = (res?.data || []).map(normalize).filter((c) => c.code && c.name);
  if (list.length === 0) throw new Error('TrackingMore returned an empty courier list');
  cache = { list, byCode: new Map(list.map((c) => [c.code, c])), fetchedAt: Date.now() };
  logger.info(`Courier catalog loaded: ${list.length} couriers`);
  return cache.list;
}

async function getCatalog() {
  if (cache.list && Date.now() - cache.fetchedAt < TTL_MS) return cache.list;
  if (!inflight) {
    inflight = load()
      .catch((err) => {
        logger.warn(`Courier catalog refresh failed: ${err.message}`);
        return cache.list || FALLBACK;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

async function findCourier(code) {
  const list = await getCatalog();
  const key = String(code || '').trim().toLowerCase();
  return (cache.byCode && cache.byCode.get(key)) || list.find((c) => c.code === key) || null;
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
