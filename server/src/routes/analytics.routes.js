const express = require('express');
const { getSummary } = require('../controllers/analytics.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/summary', getSummary);

module.exports = router;
