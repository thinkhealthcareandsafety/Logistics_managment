const Shipment = require('../models/Shipment');
const env = require('../config/env');
const logger = require('../config/logger');
const { resolveDeliveredAt } = require('../utils/deliveredAt');
const { sendDeliveryFeedbackEmail, isEmailConfigured } = require('./email.service');
const { sendWhatsAppDeliveryMessage, isWhatsAppConfigured } = require('./whatsapp.service');

/** How long after delivery we keep trying to get the thank-you out. */
const RETRY_WINDOW_DAYS = 7;

/**
 * Links handed to the customer. Both are public and keyed by tracking number - the
 * number itself is the credential, same model as the tracking page, so there's no
 * account for the customer to create and no token to expire.
 */
function customerLinks(shipment) {
  const awb = encodeURIComponent(shipment.trackingNumber);
  return {
    trackingUrl: `${env.clientUrl}/track/${awb}`,
    feedbackUrl: `${env.clientUrl}/feedback/${awb}`,
  };
}

/** Which ways of reaching a customer are actually connected on this server. */
function deliveryChannels() {
  return { email: isEmailConfigured(), whatsapp: isWhatsAppConfigured() };
}

/**
 * Fires once, when a shipment first reaches `delivered`: thanks the customer, links
 * the feedback form, and includes the tracking link so they can still pull up the
 * delivery details later.
 *
 * This goes to the *customer* on the shipment, not the dashboard user - a different
 * recipient from notifyStatusChange, which is why it lives in its own service.
 *
 * Guarded by `deliveryNoticeSentAt` on the shipment: carriers do re-issue checkpoints,
 * and a manual re-sync shouldn't mail the same customer twice. The caller saves.
 */
async function notifyCustomerDelivered(shipment) {
  if (shipment.deliveryNoticeSentAt) return false;

  const { email, phone } = shipment.customerInfo || {};
  if (!email && !phone) {
    logger.debug(`${shipment.trackingNumber} delivered but has no customer contact - skipping thank-you`);
    return false;
  }

  const { trackingUrl, feedbackUrl } = customerLinks(shipment);
  const results = await Promise.allSettled([
    email ? sendDeliveryFeedbackEmail({ to: email, shipment, trackingUrl, feedbackUrl }) : null,
    phone ? sendWhatsAppDeliveryMessage({ to: phone, shipment, trackingUrl, feedbackUrl }) : null,
  ]);

  // Only stamp the shipment if something actually went out. If SMTP and Gupshup are
  // both unconfigured the customer got nothing, and the retry below tries again
  // rather than silently marking them as notified.
  const delivered = results.some((r) => r.status === 'fulfilled' && r.value === true);
  if (delivered) {
    shipment.deliveryNoticeSentAt = new Date();
    logger.info(`Sent delivery thank-you + feedback request for ${shipment.trackingNumber}`);
  }
  return delivered;
}

function deliveredAt(shipment) {
  return resolveDeliveredAt(shipment) || shipment.updatedAt;
}

/**
 * The safety net for the automation. The refresh job stops polling a shipment once
 * it's delivered, so if the thank-you couldn't go out at that moment (email/WhatsApp
 * not connected yet, provider down) nothing would ever try again. This sweeps
 * recently delivered shipments that still haven't been sent one, on every cycle.
 */
async function retryPendingDeliveryNotices() {
  const channels = deliveryChannels();
  if (!channels.email && !channels.whatsapp) return { attempted: 0, sent: 0 };

  const since = new Date(Date.now() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const pending = await Shipment.find({
    status: 'delivered',
    isArchived: false,
    deliveryNoticeSentAt: null,
    $or: [{ 'customerInfo.email': { $nin: [null, ''] } }, { 'customerInfo.phone': { $nin: [null, ''] } }],
  });

  let attempted = 0;
  let sent = 0;
  for (const shipment of pending) {
    if (new Date(deliveredAt(shipment)) < since) continue;
    attempted += 1;
    if (await notifyCustomerDelivered(shipment)) {
      await shipment.save();
      sent += 1;
    }
  }
  if (attempted) logger.info(`Delivery thank-you retry: sent ${sent}/${attempted}`);
  return { attempted, sent };
}

module.exports = {
  notifyCustomerDelivered,
  retryPendingDeliveryNotices,
  deliveryChannels,
  customerLinks,
  RETRY_WINDOW_DAYS,
};
