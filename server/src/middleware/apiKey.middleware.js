const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Guards system-to-system endpoints (like shipment ingestion) with a static shared
// secret instead of a user JWT - there's no logged-in user on the other end.
const requireIngestKey = asyncHandler(async (req, res, next) => {
  if (!env.ingest.apiKey) {
    throw new ApiError(503, 'Ingestion is not configured (set INGEST_API_KEY on the server)');
  }
  const key = Buffer.from(String(req.headers['x-ingest-key'] || ''));
  const expected = Buffer.from(env.ingest.apiKey);
  // Constant-time compare, so the key can't be worked out from response timing.
  if (key.length !== expected.length || !crypto.timingSafeEqual(key, expected)) {
    throw new ApiError(401, 'Invalid or missing X-Ingest-Key header');
  }
  next();
});

module.exports = { requireIngestKey };
