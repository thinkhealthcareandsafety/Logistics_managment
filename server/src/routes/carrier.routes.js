const express = require('express');
const { listCarriers, detectCarrier } = require('../controllers/carrier.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, listCarriers);
router.get('/detect', requireAuth, detectCarrier);

module.exports = router;
