const Lead = require('../models/Lead');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../config/logger');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public - the enquiry form on the pricing section. No auth by design. */
const createLead = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!name) throw new ApiError(400, 'Please tell us your name');
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Please enter a valid work email');

  const lead = await Lead.create({
    name,
    email,
    company: String(req.body.company || '').trim(),
    phone: String(req.body.phone || '').trim(),
    message: String(req.body.message || '').trim(),
    plan: String(req.body.plan || '').trim(),
    monthlyShipments: String(req.body.monthlyShipments || '').trim(),
  });

  logger.info(`New lead: ${lead.email}${lead.company ? ` (${lead.company})` : ''} - plan ${lead.plan || 'n/a'}`);

  // Deliberately minimal response: the public form doesn't need the stored record back.
  res.status(201).json({ received: true });
});

module.exports = { createLead };
