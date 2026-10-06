const express = require('express');
const {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
} = require('../controllers/notification.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', listNotifications);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.get('/preferences', getPreferences);
router.patch('/preferences', updatePreferences);

module.exports = router;
