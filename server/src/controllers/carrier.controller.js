const asyncHandler = require('../utils/asyncHandler');
const { DEFAULT_CARRIER_CODE } = require('../config/carrier');
const { getCatalog, detectCouriers } = require('../services/courierCatalog.service');

/**
 * Well-known Indian couriers, in the order they're offered first in the picker and
 * named on the public site. Names always come from the live catalog, so only
 * couriers TrackingMore actually lists can appear.
 */
const FEATURED_IN = [
  DEFAULT_CARRIER_CODE,
  'delhivery',
  'bluedart',
  'dtdc',
  'india-post',
  'ekart',
  'xpressbees',
  'ecom-express',
  'shadowfax',
  'dotzot',
  'gati-kwe',
  'trackon',
  'professional-couriers',
  'safexpress',
  'shiprocket',
  'amazon-in',
];

/** Staff: the whole catalog for the courier picker (~1,700 rows; the client caches it). */
const listCarriers = asyncHandler(async (req, res) => {
  const catalog = await getCatalog();
  res.json({ carriers: catalog, featured: FEATURED_IN, defaultCode: DEFAULT_CARRIER_CODE });
});

/** Staff: couriers whose AWB format matches - suggestions only. */
const detectCarrier = asyncHandler(async (req, res) => {
  res.json({ suggestions: await detectCouriers(req.query.trackingNumber) });
});

/** Public: numbers and names for the marketing page - nothing else from the catalog. */
const courierSummary = asyncHandler(async (req, res) => {
  const catalog = await getCatalog();
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  res.json({
    total: catalog.length,
    countries: new Set(catalog.map((c) => c.country).filter(Boolean)).size,
    india: catalog.filter((c) => c.country === 'IN').length,
    featured: FEATURED_IN.map((code) => byCode.get(code)?.name).filter(Boolean),
  });
});

module.exports = { listCarriers, detectCarrier, courierSummary };
