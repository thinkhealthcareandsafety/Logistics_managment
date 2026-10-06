const express = require('express');
const { getPublicTracking } = require('../controllers/publicTracking.controller');
const {
  getPublicFeedback,
  submitPublicFeedback,
  listPublicReviews,
} = require('../controllers/feedback.controller');
const { createLead } = require('../controllers/lead.controller');
const { getPublicStock } = require('../controllers/stock.controller');
const { courierSummary } = require('../controllers/carrier.controller');
const { publicTrackingLimiter, feedbackLimiter, leadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// No requireAuth on anything here - these are intentionally public, with the tracking
// number as the only credential. Rate-limited to deter AWB enumeration.
router.get('/tracking/:trackingNumber', publicTrackingLimiter, getPublicTracking);

// Literal path before the '/:trackingNumber' params or Express matches it as an AWB.
router.get('/reviews', listPublicReviews);
router.get('/feedback/:trackingNumber', publicTrackingLimiter, getPublicFeedback);
router.post('/feedback/:trackingNumber', feedbackLimiter, submitPublicFeedback);

// Sales enquiry from the pricing section.
router.post('/leads', leadLimiter, createLead);

// Courier count + well-known names for the landing page.
router.get('/couriers/summary', courierSummary);

// Live stock for whoever holds the secret link (pinned in the logistics WhatsApp group).
router.get('/stock/:token', publicTrackingLimiter, getPublicStock);

module.exports = router;
