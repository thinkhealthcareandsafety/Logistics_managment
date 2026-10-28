const express = require('express');
const rateLimit = require('express-rate-limit');
const { clientKey } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const AssistantChat = require('../models/AssistantChat');
const { ask, SUGGESTIONS } = require('../services/assistant.service');

/** The in-app assistant - rule-based, answers from the database, no outside service. */
const router = express.Router();
router.use(requireAuth);

const askLimiter = rateLimit({ keyGenerator: clientKey, windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many questions at once - wait a moment.' } });
const MAX_MESSAGES = 200;

function deviceOf(req) {
  const id = String(req.body?.device || req.query.device || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw new ApiError(400, 'Missing device id');
  return id;
}

/** This device's open conversation, started if there isn't one. */
async function openChat(userId, deviceId) {
  return (
    (await AssistantChat.findOne({ userId, deviceId, closedAt: null }).sort({ updatedAt: -1 })) ||
    AssistantChat.create({ userId, deviceId })
  );
}

const view = (chat) => ({
  id: chat._id,
  messages: chat.messages.map((m) => ({ from: m.role === 'user' ? 'me' : 'bot', text: m.text, items: m.items, suggestions: m.suggestions, at: m.at })),
});

router.get('/suggestions', (req, res) => res.json({ suggestions: SUGGESTIONS }));

router.get(
  '/chat',
  asyncHandler(async (req, res) => {
    res.json(view(await openChat(req.userId, deviceOf(req))));
  })
);

/** Start a fresh conversation; the old one is kept (closed). */
router.post(
  '/chat/new',
  asyncHandler(async (req, res) => {
    const deviceId = deviceOf(req);
    await AssistantChat.updateMany({ userId: req.userId, deviceId, closedAt: null }, { $set: { closedAt: new Date() } });
    res.json(view(await AssistantChat.create({ userId: req.userId, deviceId })));
  })
);

router.post(
  '/ask',
  askLimiter,
  asyncHandler(async (req, res) => {
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    if (!question) throw new ApiError(400, 'Ask a question');
    if (question.length > 300) throw new ApiError(400, 'Please keep the question under 300 characters');
    const chat = await openChat(req.userId, deviceOf(req));
    const result = await ask(question, req.userId, chat.context);
    chat.messages.push({ role: 'user', text: question });
    chat.messages.push({ role: 'assistant', text: result.answer, items: (result.items || []).slice(0, 20), suggestions: result.suggestions || [] });
    if (chat.messages.length > MAX_MESSAGES) chat.messages = chat.messages.slice(-MAX_MESSAGES);
    chat.context = result.context ?? null;
    chat.markModified('context');
    await chat.save();
    res.json({ answer: result.answer, items: result.items || [], suggestions: result.suggestions || [] });
  })
);

module.exports = router;
