const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Guards system-to-system endpoints (like shipment ingestion) with a static shared
// secret instead of a user JWT - there's no logged-in user on the other end.
const requireIngestKey = asyncHandler(async (req, res, next) => {
  if (!env.ingest.apiKey) {
    throw new ApiError(503, 'Ingestion is not configured (set INGEST_API_KEY on the server)');
  }
  const key = req.headers['x-ingest-key'];
  if (!key || key !== env.ingest.apiKey) {
    throw new ApiError(401, 'Invalid or missing X-Ingest-Key header');
  }
  next();
});

module.exports = { requireIngestKey };
