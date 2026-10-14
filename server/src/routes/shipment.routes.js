const express = require('express');
const { costlyLimiter } = require('../middleware/rateLimiter');
const multer = require('multer');
const {
  createShipment,
  listShipments,
  getShipment,
  updateShipment,
  deleteShipment,
  refreshShipmentNow,
  refreshAllShipments,
  bulkUpdateShipments,
  addExceptionNote,
  bulkImportShipments,
  importShipmentHistory,
  backfillDeliveredDates,
  backfillDeliveredDatesStatus,
  resendDeliveryNotice,
  extractFromLabel,
  setManualStatus,
} = require('../controllers/shipment.controller');
const { getShipmentFeedback, setFeedbackPublished } = require('../controllers/feedback.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
// Label photos: the browser downsizes them first, PDFs arrive as-is.
const labelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const router = express.Router();
router.use(requireAuth);

router.post('/', createShipment);
router.get('/', listShipments);

// Literal paths must come before '/:id' or Express matches them as an id.
router.post('/bulk-import', costlyLimiter, upload.single('file'), bulkImportShipments);
router.post('/import-history', costlyLimiter, importShipmentHistory);
router.post('/delivered-dates/backfill', backfillDeliveredDates);
router.get('/delivered-dates/backfill', backfillDeliveredDatesStatus);
router.post('/extract', costlyLimiter, labelUpload.single('file'), extractFromLabel);
router.post('/refresh-all', costlyLimiter, refreshAllShipments);
router.patch('/bulk', bulkUpdateShipments);

router.get('/:id', getShipment);
router.patch('/:id', updateShipment);
router.delete('/:id', deleteShipment);
router.post('/:id/refresh', costlyLimiter, refreshShipmentNow);
router.post('/:id/notes', addExceptionNote);
router.post('/:id/status', setManualStatus);
router.get('/:id/feedback', getShipmentFeedback);
router.patch('/:id/feedback', setFeedbackPublished);
router.post('/:id/delivery-notice', resendDeliveryNotice);

module.exports = router;
