const express = require('express');
const { register, login, logout, me, changePassword, logoutEverywhere } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);
router.post('/password', authLimiter, requireAuth, changePassword);
router.post('/logout-everywhere', requireAuth, logoutEverywhere);

module.exports = router;
