const express = require('express');
const { manualHandlers: h } = require('../controllers/stock.controller');
const { requireAuth } = require('../middleware/auth.middleware');

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

router.patch('/settings', h.updateSettings);
router.post('/share-token/rotate', h.rotateShareToken);

module.exports = router;
