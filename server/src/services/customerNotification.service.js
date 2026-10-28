const Shipment = require('../models/Shipment');
const env = require('../config/env');
const logger = require('../config/logger');
const { resolveDeliveredAt } = require('../utils/deliveredAt');
const { sendDeliveryFeedbackEmail, isEmailConfigured } = require('./email.service');
const { sendWhatsAppDeliveryMessage, sendWhatsAppBookedMessage, sendWhatsAppCustomerStatus, isWhatsAppConfigured } = require('./whatsapp.service');

/** How long after delivery we keep trying to get the thank-you out. */
const RETRY_WINDOW_DAYS = 7;
/** Stage messages only for shipments sent in the last couple of weeks - never old ones. */
const STAGE_MESSAGE_DAYS = 15;

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

/**
 * The delivery-receipt link to put in the "Delivered" thank-you - only while that's
 * switched on and nobody has confirmed the receipt yet. Rides in the same message, so
 * it never adds a send.
 */
async function deliveredReceiptUrl(shipment) {
  const StockSettings = require('../models/StockSettings');
  const settings = await StockSettings.findOne({ key: 'default' }).select('receiptInDeliveredMessage').lean();
  if (!settings?.receiptInDeliveredMessage || shipment.receipt?.confirmedAt) return null;
  return require('./receipt.service').receiptLink(shipment);
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
  const receiptUrl = await deliveredReceiptUrl(shipment);
  const results = await Promise.allSettled([
    email ? sendDeliveryFeedbackEmail({ to: email, shipment, trackingUrl, feedbackUrl, receiptUrl }) : null,
    phone ? sendWhatsAppDeliveryMessage({ to: phone, shipment, trackingUrl, feedbackUrl, receiptUrl }) : null,
  ]);

  // Only stamp the shipment if something actually went out. If email and WhatsApp are
  // both unconfigured the customer got nothing, and the retry below tries again
  // rather than silently marking them as notified.
  const delivered = results.some((r) => r.status === 'fulfilled' && r.value === true);
  if (delivered) {
    shipment.deliveryNoticeSentAt = new Date();
    logger.info(`Sent delivery thank-you + feedback request for ${shipment.trackingNumber}`);
  }
  return delivered;
}

const isRecent = (shipment) =>
  Date.now() - new Date(shipment.shippingDate || shipment.createdAt || Date.now()).getTime() <= STAGE_MESSAGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * WhatsApp to the customer at each stage - booked, in transit (picked up), out for
 * delivery - once each (the caller saves); the delivered thank-you is
 * notifyCustomerDelivered. One message per stage, not per courier scan: a shipment
 * passes through many hubs and every message is billed. Off with
 * WHATSAPP_CUSTOMER_UPDATES=false.
 */
async function notifyCustomerBooked(shipment) {
  const phone = shipment.customerInfo?.phone;
  if (!env.anantya.customerUpdates || shipment.bookedNoticeSentAt || !phone || !isWhatsAppConfigured()) return false;
  if (shipment.status === 'delivered' || !isRecent(shipment)) return false;
  const { trackingUrl } = customerLinks(shipment);
  const ok = await sendWhatsAppBookedMessage({ to: phone, shipment, trackingUrl });
  if (ok) shipment.bookedNoticeSentAt = new Date();
  return ok;
}

const STAGE_STAMP = { in_transit: 'inTransitNoticeSentAt', out_for_delivery: 'outForDeliveryNoticeSentAt' };

/** The in-transit or out-for-delivery message, if the shipment is at that stage and hasn't had it. */
async function notifyCustomerStage(shipment) {
  const stamp = STAGE_STAMP[shipment.status];
  const phone = shipment.customerInfo?.phone;
  if (!stamp || !env.anantya.customerUpdates || shipment[stamp] || !phone || !isWhatsAppConfigured()) return false;
  // Already out for delivery? "In transit" would be old news.
  if (shipment.status === 'in_transit' && shipment.outForDeliveryNoticeSentAt) return false;
  if (!isRecent(shipment)) return false;
  const { trackingUrl } = customerLinks(shipment);
  const ok = await sendWhatsAppCustomerStatus({ to: phone, shipment, status: shipment.status, trackingUrl });
  if (ok) shipment[stamp] = new Date();
  return ok;
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
  notifyCustomerBooked,
  notifyCustomerStage,
  notifyCustomerDelivered,
  retryPendingDeliveryNotices,
  deliveryChannels,
  customerLinks,
  RETRY_WINDOW_DAYS,
};
