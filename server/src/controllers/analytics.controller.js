const { getAnalyticsSummary } = require('../services/analytics.service');
const asyncHandler = require('../utils/asyncHandler');

const getSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const summary = await getAnalyticsSummary({ userId: req.userId, from, to });
  res.json(summary);
});

module.exports = { getSummary };
