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
  getWhatsAppStatus,
  rotateShareToken,
  suggestDuplicates,
  mergeItems,
  unmergeItem,
  importMedia,
  refreshMedia,
  getMediaStatus,
  searchWebImages,
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
router.post('/duplicates/suggest', suggestDuplicates);
router.post('/items/:id/merge', mergeItems);
router.post('/items/:id/unmerge', unmergeItem);
router.post('/media/import', express.json({ limit: '5mb' }), importMedia);
router.get('/media/status', getMediaStatus);
router.post('/media/web-search', searchWebImages);
router.get('/items/:id/zoho-image', zohoImage);

router.patch('/settings', updateSettings);
router.post('/broadcast', sendNow);
router.get('/whatsapp/status', getWhatsAppStatus);
router.post('/share-token/rotate', rotateShareToken);

module.exports = router;
