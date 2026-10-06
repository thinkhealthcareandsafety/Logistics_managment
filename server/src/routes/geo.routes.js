const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { lookupPincode } = require('../services/pincode.service');

const router = express.Router();
router.use(requireAuth);

// Staff-only proxy: keeps the third-party call (and its failures) server-side.
router.get(
  '/pincode/:pincode',
  asyncHandler(async (req, res) => {
    res.json(await lookupPincode(req.params.pincode));
  })
);

module.exports = router;
