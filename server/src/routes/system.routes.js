const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');

const router = express.Router();
router.use(requireAuth);

/** Today's calls to each paid API against its daily limit, plus WhatsApp messages sent. */
router.get(
  '/usage',
  asyncHandler(async (req, res) => {
    const [apis, messages] = await Promise.all([
      require('../services/apiBudget').usageToday(),
      require('../services/whatsappBudget').usage().catch(() => null),
    ]);
    res.json({
      apis: apis.map((a) => ({
        ...a,
        configured: a.provider === 'gemini' ? Boolean(env.gemini.apiKey) : a.provider === 'trackingmore' ? Boolean(env.trackingMore.apiKey) : Boolean(env.anantya.apiKey || env.gupshup.apiKey),
      })),
      whatsappMessages: messages,
      signupEnabled: env.signupEnabled,
    });
  })
);

module.exports = router;
