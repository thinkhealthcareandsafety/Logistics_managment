const axios = require('axios');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * India Post's public pincode directory (no key, free). Turns a 6-digit pincode into
 * district + state, so typing the client's pincode fills the rest of the address.
 * Pincodes don't move, so answers are cached for a day.
 */
const POSTAL_API = 'https://api.postalpincode.in/pincode';
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

async function lookupPincode(pincode) {
  const pin = String(pincode || '').trim();
  if (!/^\d{6}$/.test(pin)) throw new ApiError(400, 'Pincode must be 6 digits');

  const hit = cache.get(pin);
  if (hit && hit.expires > Date.now()) return hit.value;

  let body;
  try {
    ({ data: body } = await axios.get(`${POSTAL_API}/${pin}`, { timeout: 8000 }));
  } catch (err) {
    logger.warn(`Pincode lookup failed for ${pin}: ${err.message}`);
    throw new ApiError(502, 'Pincode lookup is unavailable right now - enter the city and state by hand');
  }

  const offices = Array.isArray(body) && body[0]?.Status === 'Success' ? body[0].PostOffice || [] : [];
  if (offices.length === 0) throw new ApiError(404, `No area found for pincode ${pin}`);

  const value = {
    pincode: pin,
    city: offices[0].District || '',
    state: offices[0].State || '',
    areas: [...new Set(offices.map((o) => o.Name).filter(Boolean))].slice(0, 30),
  };
  cache.set(pin, { value, expires: Date.now() + TTL_MS });
  return value;
}

module.exports = { lookupPincode };
