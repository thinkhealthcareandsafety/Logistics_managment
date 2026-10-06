const ApiError = require('./ApiError');

/** "" / null / undefined -> null; anything else must be a non-negative number. */
function optionalAmount(value, label, max) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(String(value).replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > max) {
    throw new ApiError(400, `${label} must be a number between 0 and ${max.toLocaleString('en-IN')}`);
  }
  return Math.round(n * 100) / 100;
}

function cleanAddress(input) {
  if (input === undefined) return undefined;
  const a = input || {};
  const pincode = String(a.pincode ?? '').replace(/\s/g, '');
  if (pincode && !/^\d{6}$/.test(pincode)) {
    throw new ApiError(400, 'Pincode must be 6 digits');
  }
  return {
    line: String(a.line ?? '').trim().slice(0, 300),
    city: String(a.city ?? '').trim().slice(0, 80),
    state: String(a.state ?? '').trim().slice(0, 80),
    pincode,
  };
}

/**
 * Weight, freight and delivery address, validated the same way for every way a
 * shipment comes in (manual add, edit, CSV import, ingest API). Only keys present in
 * the input are returned, so a partial edit doesn't blank the others.
 */
function commercialFields(body = {}) {
  const out = {};
  const weightKg = optionalAmount(body.weightKg, 'Weight', 100000);
  const freightAmount = optionalAmount(body.freightAmount, 'Freight', 10000000);
  const deliveryAddress = cleanAddress(body.deliveryAddress);
  if (weightKg !== undefined) out.weightKg = weightKg;
  if (freightAmount !== undefined) out.freightAmount = freightAmount;
  if (deliveryAddress !== undefined) out.deliveryAddress = deliveryAddress;
  return out;
}

module.exports = { commercialFields };
