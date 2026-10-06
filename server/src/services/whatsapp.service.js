const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');

const GUPSHUP_SEND_URL = 'https://api.gupshup.io/wa/api/v1/msg';

const STATUS_LABELS = {
  pending: 'Pending',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
};

function toE164ish(number) {
  // Gupshup expects digits only (country code + number, e.g. 91XXXXXXXXXX).
  return (number || '').replace(/[^\d]/g, '');
}

function buildStatusText({ shipment, checkpoint, trackingUrl }) {
  const statusLabel = STATUS_LABELS[checkpoint.status] || checkpoint.status;
  const lines = [
    `*ThinkHealth Logistics*`,
    `Shipment ${shipment.trackingNumber} is now *${statusLabel}*.`,
  ];
  if (checkpoint.location) lines.push(`Location: ${checkpoint.location}`);
  if (checkpoint.description) lines.push(checkpoint.description);
  if (trackingUrl) lines.push('', `Track it live: ${trackingUrl}`);
  return lines.join('\n');
}

function buildDeliveryText({ shipment, trackingUrl, feedbackUrl }) {
  const name = shipment.customerInfo?.name;
  return [
    `*ThinkHealth Logistics*`,
    name ? `Hi ${name},` : 'Hello,',
    '',
    `*Thank you for choosing ThinkHealth.* Your order ${shipment.trackingNumber} has been delivered.`,
    '',
    'Please tell us how we did — it takes under a minute:',
    feedbackUrl,
    '',
    `Delivery details: ${trackingUrl}`,
  ].join('\n');
}

/**
 * Posts a plain-text WhatsApp message via Gupshup. No-ops with a debug log if
 * GUPSHUP_API_KEY isn't configured - same graceful-skip pattern as email.service.js,
 * so missing credentials never break the notification flow.
 */
async function sendWhatsApp({ to, text, context }) {
  if (!env.gupshup.apiKey) {
    logger.debug('Gupshup not configured - skipping WhatsApp notification');
    return false;
  }
  const destination = toE164ish(to);
  if (!destination) {
    logger.warn(`${context}: no destination number, skipping`);
    return false;
  }

  const body = new URLSearchParams({
    channel: 'whatsapp',
    source: env.gupshup.sourceNumber,
    destination,
    'src.name': env.gupshup.appName,
    message: JSON.stringify({ type: 'text', text }),
  });

  try {
    await axios.post(GUPSHUP_SEND_URL, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        apikey: env.gupshup.apiKey,
      },
      timeout: 10000,
    });
    return true;
  } catch (err) {
    logger.error(`Failed to send WhatsApp message to ${destination}: ${err.response?.data?.message || err.message}`);
    return false;
  }
}

function sendWhatsAppStatusMessage({ to, shipment, checkpoint, trackingUrl }) {
  return sendWhatsApp({
    to,
    text: buildStatusText({ shipment, checkpoint, trackingUrl }),
    context: 'sendWhatsAppStatusMessage',
  });
}

function sendWhatsAppDeliveryMessage({ to, shipment, trackingUrl, feedbackUrl }) {
  return sendWhatsApp({
    to,
    text: buildDeliveryText({ shipment, trackingUrl, feedbackUrl }),
    context: 'sendWhatsAppDeliveryMessage',
  });
}

/** Free-form text, e.g. the stock update. Same graceful skip when Gupshup isn't set up. */
function sendWhatsAppText({ to, text, context = 'sendWhatsAppText' }) {
  return sendWhatsApp({ to, text, context });
}

function isWhatsAppConfigured() {
  return Boolean(env.gupshup.apiKey && env.gupshup.sourceNumber);
}

module.exports = { sendWhatsAppStatusMessage, sendWhatsAppDeliveryMessage, sendWhatsAppText, isWhatsAppConfigured };
