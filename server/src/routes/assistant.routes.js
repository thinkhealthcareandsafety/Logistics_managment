const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ask, SUGGESTIONS } = require('../services/assistant.service');

/** The in-app assistant - rule-based, answers from the database, no outside service. */
const router = express.Router();
router.use(requireAuth);

const askLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many questions at once - wait a moment.' } });

router.get('/suggestions', (req, res) => res.json({ suggestions: SUGGESTIONS }));
router.post(
  '/ask',
  askLimiter,
  asyncHandler(async (req, res) => {
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    if (question.length > 300) throw new ApiError(400, 'Please keep the question under 300 characters');
    res.json(await ask(question, req.userId));
  })
);

module.exports = router;
