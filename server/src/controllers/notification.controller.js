const User = require('../models/User');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
  const unreadCount = await Notification.countDocuments({ userId: req.userId, read: false });
  res.json({ notifications, unreadCount });
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { read: true } },
    { new: true }
  );
  if (!notification) throw new ApiError(404, 'Notification not found');
  res.json({ notification });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ userId: req.userId, read: false }, { $set: { read: true } });
  res.json({ updated: result.modifiedCount });
});

const getPreferences = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ notificationPreferences: user.notificationPreferences });
});

const updatePreferences = asyncHandler(async (req, res) => {
  const { emailEnabled, inAppEnabled, whatsappEnabled, whatsappNumber, notifyOnStatuses } = req.body;
  const updates = {};
  if (emailEnabled !== undefined) updates['notificationPreferences.emailEnabled'] = emailEnabled;
  if (inAppEnabled !== undefined) updates['notificationPreferences.inAppEnabled'] = inAppEnabled;
  if (whatsappEnabled !== undefined) updates['notificationPreferences.whatsappEnabled'] = whatsappEnabled;
  if (whatsappNumber !== undefined) updates['notificationPreferences.whatsappNumber'] = whatsappNumber;
  if (notifyOnStatuses !== undefined) updates['notificationPreferences.notifyOnStatuses'] = notifyOnStatuses;

  const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ notificationPreferences: user.notificationPreferences });
});

module.exports = { listNotifications, markAsRead, markAllAsRead, getPreferences, updatePreferences };
