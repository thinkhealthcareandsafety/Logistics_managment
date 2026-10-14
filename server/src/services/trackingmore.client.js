const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

const http = axios.create({
  baseURL: env.trackingMore.baseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Tracking-Api-Key': env.trackingMore.apiKey,
  },
});

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin retry wrapper: exponential backoff on rate limits (429) and transient
 * 5xx errors. Anything else (4xx validation errors, auth failures) fails fast.
 * Every attempt counts against the daily TrackingMore limit (services/apiBudget).
 */
async function request(config, { background = false } = {}) {
  // No key: don't call (or count) anything - TrackingMore would only refuse it.
  if (!env.trackingMore.apiKey) throw new ApiError(503, 'Courier tracking is off - no TRACKINGMORE_API_KEY on the server');
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await require('./apiBudget').take('trackingmore', { background });
    try {
      const response = await http.request(config);
      return response.data;
    } catch (err) {
      const status = err.response?.status;
      attempt += 1;
      const canRetry = RETRYABLE_STATUS.has(status) && attempt <= MAX_RETRIES;
      if (!canRetry) {
        const meta = err.response?.data?.meta;
        const message = meta?.message || err.message;
        logger.error(`TrackingMore request failed: ${config.method} ${config.url} - ${message}`);
        // Carry TrackingMore's own code/message through so callers can branch on the
        // specific failure (e.g. "not registered yet") instead of re-parsing strings.
        throw new ApiError(status || 502, `TrackingMore API error: ${message}`, {
          trackingMoreCode: meta?.code,
          trackingMoreMessage: meta?.message,
        });
      }
      const backoffMs = 500 * 2 ** (attempt - 1);
      logger.warn(
        `TrackingMore ${status} on ${config.url}, retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(backoffMs);
    }
  }
}

/**
 * Registers a tracking number with TrackingMore so it starts polling the carrier.
 * `extra` carries the fields some couriers require (e.g. `tracking_postal_code` for
 * ~80 international couriers) - only non-empty values are sent.
 */
function createTracking({ trackingNumber, carrierCode, extra = {} }) {
  const fields = Object.fromEntries(Object.entries(extra).filter(([, v]) => v));
  return request({
    method: 'post',
    url: '/trackings/create',
    // TrackingMore's actual v4 field is `courier_code`, confirmed against a live
    // request/response in their dashboard's API debugging console - not `carrier_code`.
    data: { tracking_number: trackingNumber, courier_code: carrierCode, ...fields },
  });
}

/** Fetches the latest tracking result (status + checkpoints) for one shipment. */
function getTracking({ trackingNumber, carrierCode }) {
  return request({
    method: 'get',
    url: '/trackings/get',
    params: { tracking_numbers: trackingNumber, courier_code: carrierCode },
  });
}

/**
 * Latest results for many shipments in one call (TrackingMore takes up to 40 numbers),
 * so the scheduled refresh costs one call per 40 shipments, not one each.
 */
const BATCH_SIZE = 40;
function getTrackings(trackingNumbers, { background = true } = {}) {
  return request(
    { method: 'get', url: '/trackings/get', params: { tracking_numbers: trackingNumbers.slice(0, BATCH_SIZE).join(',') } },
    { background }
  );
}

/** TrackingMore's full courier catalog (v4: /couriers/all - ~1,700 couriers). */
function listCarriers() {
  return request({ method: 'get', url: '/couriers/all' }, { background: true });
}

/** Couriers whose tracking-number format matches - a guess to suggest, not to trust. */
function detectCourier(trackingNumber) {
  return request({ method: 'post', url: '/couriers/detect', data: { tracking_number: trackingNumber } });
}

module.exports = { createTracking, getTracking, getTrackings, listCarriers, detectCourier, BATCH_SIZE };
