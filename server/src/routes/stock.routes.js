const express = require('express');
const {
  getStock,
  getMessage,
  listMovements,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  updateItem,
  removeItem,
  stockOut,
  saveCount,
  updateSettings,
  sendNow,
  rotateShareToken,
  refreshMedia,
  getMediaStatus,
  zohoImage,
} = require('../controllers/stock.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// Staff only. The read-only live link lives on /api/public/stock/:token.
router.use(requireAuth);

router.get('/', getStock);
router.get('/message', getMessage);
router.get('/movements', listMovements);

router.post('/categories', createCategory);
router.patch('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

router.post('/items', createItem);
router.patch('/items/:id', updateItem);
router.delete('/items/:id', removeItem);
router.post('/items/:id/stock-out', stockOut);

router.post('/count', saveCount);

router.post('/media/refresh', refreshMedia);
router.get('/media/status', getMediaStatus);
router.get('/items/:id/zoho-image', zohoImage);

router.patch('/settings', updateSettings);
router.post('/broadcast', sendNow);
router.post('/share-token/rotate', rotateShareToken);

module.exports = router;
