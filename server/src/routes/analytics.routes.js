const express = require('express');
const { getSummary } = require('../controllers/analytics.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/summary', getSummary);
// Reorder predictions from stored invoices / shipments - arithmetic only, no outside calls.
router.get(
  '/reorders',
  require('../utils/asyncHandler')(async (req, res) => {
    res.json(await require('../services/reorder.service').reorderPredictions({ userId: req.userId }));
  })
);

module.exports = router;
