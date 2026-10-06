const express = require('express');
const { ingestShipment } = require('../controllers/ingest.controller');
const { requireIngestKey } = require('../middleware/apiKey.middleware');

const router = express.Router();

// Separate trust boundary from /api/shipments: guarded by a shared API key, not a user JWT.
router.post('/shipments', requireIngestKey, ingestShipment);

module.exports = router;
