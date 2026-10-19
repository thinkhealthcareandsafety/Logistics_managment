const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { costlyLimiter } = require('../middleware/rateLimiter');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { isWhatsAppConfigured } = require('../services/whatsapp.service');
const { settingsFor, dailyMessage, sendShipmentUpdate } = require('../services/shipmentBroadcast.service');

/** The daily shipment update on WhatsApp - settings, a preview, and "send now". */
const router = express.Router();
router.use(requireAuth);

const view = (s) => ({
  enabled: s.enabled,
  time: s.time,
  recipients: s.recipients,
  includeLinks: s.includeLinks,
  lastSentAt: s.lastSentAt,
  whatsappConfigured: isWhatsAppConfigured(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const s = await settingsFor(req.userId);
    res.json({ settings: view(s), preview: await dailyMessage(req.userId, s) });
  })
);

router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const s = await settingsFor(req.userId);
    const { enabled, time, recipients, includeLinks } = req.body;
    if (time !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) throw new ApiError(400, 'Time must be HH:mm');
      s.time = String(time);
    }
    if (recipients !== undefined) {
      if (!Array.isArray(recipients)) throw new ApiError(400, 'recipients must be a list');
      const cleaned = [...new Set(recipients.map((r) => String(r).trim()).filter(Boolean))];
      const bad = cleaned.find((r) => r.replace(/[^\d]/g, '').length < 10);
      if (bad) throw new ApiError(400, `"${bad}" doesn't look like a WhatsApp number - include the country code`);
      s.recipients = cleaned.slice(0, 20);
    }
    if (includeLinks !== undefined) s.includeLinks = Boolean(includeLinks);
    if (enabled !== undefined) s.enabled = Boolean(enabled);
    if (s.enabled && !s.recipients.length) throw new ApiError(400, 'Add at least one WhatsApp number before switching the daily update on');
    await s.save();
    res.json({ settings: view(s) });
  })
);

router.post(
  '/send',
  costlyLimiter,
  asyncHandler(async (req, res) => {
    res.json(await sendShipmentUpdate(req.userId));
  })
);

module.exports = router;
