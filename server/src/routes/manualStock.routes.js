const express = require('express');
const { manualHandlers: h } = require('../controllers/stock.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const { previewImport, applyImport } = require('../services/stockImport.service');

/**
 * The manual stock - kept by hand, never connected to Zoho Books. The same sheet
 * actions as the main stock; no Zoho, photo search or automatic WhatsApp sending
 * (the update is copied or opened in the person's own WhatsApp, which costs nothing).
 */
const router = express.Router();
router.use(requireAuth);

router.get('/', h.getStock);
router.get('/message', h.getMessage);
router.get('/movements', h.listMovements);

router.post('/categories', h.createCategory);
router.patch('/categories/:id', h.updateCategory);
router.delete('/categories/:id', h.deleteCategory);

router.post('/items', h.createItem);
router.patch('/items/:id', h.updateItem);
router.delete('/items/:id', h.removeItem);
router.post('/items/:id/stock-out', h.stockOut);

router.post('/count', h.saveCount);

// Paste the WhatsApp stock message: preview what it would change, then apply it.
router.post(
  '/import/preview',
  express.json({ limit: '200kb' }),
  asyncHandler(async (req, res) => {
    res.json(await previewImport(String(req.body.text || '').slice(0, 100000)));
  })
);
router.post(
  '/import',
  express.json({ limit: '200kb' }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select('name');
    res.json(await applyImport(String(req.body.text || '').slice(0, 100000), { userId: req.userId, actor: req.actorName, userName: user?.name || '' }));
  })
);

router.patch('/settings', h.updateSettings);
router.post('/share-token/rotate', h.rotateShareToken);

module.exports = router;
