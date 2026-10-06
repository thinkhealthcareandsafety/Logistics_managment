const User = require('../models/User');
const Notification = require('../models/Notification');
const { emitNotification } = require('../sockets');
const { sendStatusChangeEmail } = require('./email.service');
const { sendWhatsAppStatusMessage } = require('./whatsapp.service');
const { customerLinks } = require('./customerNotification.service');
const logger = require('../config/logger');

const STATUS_LABELS = {
  pending: 'Pending',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
};

/**
 * Called by tracking.service whenever a shipment gains new checkpoint(s).
 * Respects each user's own notification preferences (in-app / email / which statuses).
 */
async function notifyStatusChange(shipment, newCheckpoint) {
  const user = await User.findById(shipment.createdBy);
  if (!user) return;

  const prefs = user.notificationPreferences || {};
  const statusAllowed = !prefs.notifyOnStatuses?.length || prefs.notifyOnStatuses.includes(newCheckpoint.status);
  if (!statusAllowed) return;

  const message = `Shipment ${shipment.trackingNumber} is now ${STATUS_LABELS[newCheckpoint.status] || newCheckpoint.status}${
    newCheckpoint.location ? ` (${newCheckpoint.location})` : ''
  }`;

  if (prefs.inAppEnabled !== false) {
    const notification = await Notification.create({
      userId: user._id,
      shipmentId: shipment._id,
      status: newCheckpoint.status,
      message,
    });
    emitNotification(user._id.toString(), notification);
  }

  // Every outbound notification carries the tracking link, so whoever reads it can
  // go straight to the live page instead of hunting for the shipment.
  const { trackingUrl } = customerLinks(shipment);

  if (prefs.emailEnabled !== false && user.email) {
    sendStatusChangeEmail({ to: user.email, shipment, checkpoint: newCheckpoint, trackingUrl }).catch((err) =>
      logger.error(`notifyStatusChange email failed: ${err.message}`)
    );
  }

  if (prefs.whatsappEnabled && prefs.whatsappNumber) {
    sendWhatsAppStatusMessage({
      to: prefs.whatsappNumber,
      shipment,
      checkpoint: newCheckpoint,
      trackingUrl,
    }).catch((err) => logger.error(`notifyStatusChange WhatsApp failed: ${err.message}`));
  }
}

module.exports = { notifyStatusChange };
