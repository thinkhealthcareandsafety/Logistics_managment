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
        configured:
          a.provider === 'gemini'
            ? Boolean(env.gemini.apiKey)
            : a.provider === 'trackingmore'
              ? Boolean(env.trackingMore.apiKey)
              : a.provider === 'zohoInvoices'
                ? true
                : Boolean(env.anantya.apiKey || env.gupshup.apiKey),
      })),
      whatsappMessages: messages,
      signupEnabled: env.signupEnabled,
    });
  })
);

/** TrackingMore credits used and left in the plan, with the latest ones spent. */
router.get(
  '/tracking-credits',
  asyncHandler(async (req, res) => {
    res.json(await require('../services/trackingCredits.service').status({ recent: 20 }));
  })
);

/** The plan: credits in it, when the count starts, monthly refill, used so far, hourly auto-register. */
router.patch(
  '/tracking-credits',
  asyncHandler(async (req, res) => {
    const user = await require('../models/User').findById(req.userId, 'name').lean();
    const { allowance, periodStart, resetsMonthly, usedSoFar, autoRegister } = req.body || {};
    res.json(
      await require('../services/trackingCredits.service').updateSettings(
        { allowance, periodStart, resetsMonthly, usedSoFar, autoRegister },
        user?.name
      )
    );
  })
);

module.exports = router;
