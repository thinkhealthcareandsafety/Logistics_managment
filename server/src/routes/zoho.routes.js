const express = require('express');
const {
  getStatus,
  startConnect,
  oauthCallback,
  updateSettings,
  runSync,
  rotateWebhook,
  disconnect,
  webhook,
} = require('../controllers/zoho.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// Public: Zoho's browser redirect (guarded by the one-time state) and Zoho's
// workflow webhook (guarded by the secret in its URL). Zoho may post form-encoded.
router.get('/callback', oauthCallback);
router.post('/webhook/:token', express.urlencoded({ extended: true, limit: '1mb' }), webhook);

router.use(requireAuth);
router.get('/', getStatus);
router.post('/connect', startConnect);
router.patch('/', updateSettings);
router.post('/sync', runSync);
router.post('/webhook-token/rotate', rotateWebhook);
router.delete('/', disconnect);

module.exports = router;
