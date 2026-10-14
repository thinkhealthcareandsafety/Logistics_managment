const express = require('express');
const { costlyLimiter } = require('../middleware/rateLimiter');
const { listCarriers, detectCarrier } = require('../controllers/carrier.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, listCarriers);
router.get('/detect', requireAuth, costlyLimiter, detectCarrier);

module.exports = router;
